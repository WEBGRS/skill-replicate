#!/usr/bin/env node
// A video measured in time, for an agent that sees still pictures: where it cuts, what moves when and at what pace,
// where it holds still, and where its sound hits. And a remake measured against it, frame by frame.
//
//   node measure.mjs study <video> [--out <folder>]
//   node measure.mjs compare <reference> <remake> [--out <folder>] [--fit]
//
// study writes study.md (to read) and study.json (every number) into --out, by default a folder named after the video
// beside it. compare writes compare.md, compare.json and side-by-side pictures (reference left, remake right), by
// default into compare/ beside the reference. --fit compares a remake of another length with its times scaled to the
// reference's. Needs ffmpeg and ffprobe on the PATH, as OpenFilm does.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

/* the size every frame is measured at: small enough to be fast and to forgive a pixel's difference */
const AREA = 128 * 72;
const GRID = 8;
const BINS = 32;
/* sound: samples per second, and the window and hop of its spectrum (a hop is about 12 ms, under a frame) */
const RATE = 22050;
const WINDOW = 1024;
const HOP = 256;

const fail = (/** @type {string} */ why) => { console.error(`measure: ${why}`); process.exit(1); };
const round = (/** @type {number} */ n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const fmt = (/** @type {number} */ t) => t.toFixed(3);

// ---------------------------------------------------------------- reading a video

/** What ffprobe says of a file: its picture's size, rate and length, and whether it has sound. @param {string} file */
function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
  if (r.error) fail(`ffprobe: ${/** @type {NodeJS.ErrnoException} */ (r.error).code === 'ENOENT' ? 'not found on the PATH (it comes with ffmpeg)' : r.error.message}`);
  if (r.status !== 0) fail(`cannot read ${file}: ${r.stderr.trim()}`);
  const info = JSON.parse(r.stdout);
  const video = info.streams.find((/** @type {any} */ s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  if (!video) fail(`${file} has no picture`);
  const rate = (/** @type {string | undefined} */ q) => {
    const [a, b] = String(q ?? '0/1').split('/').map(Number);
    return b ? a / b : 0;
  };
  let fps = rate(video.avg_frame_rate);
  if (!(fps > 1 && fps < 241)) fps = rate(video.r_frame_rate);
  if (!(fps > 1 && fps < 241)) fps = 30;
  const rotation = Math.abs(Number(video.side_data_list?.find((/** @type {any} */ d) => d.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0)) % 180;
  const [width, height] = rotation === 90 ? [video.height, video.width] : [video.width, video.height];
  const duration = Number(info.format?.duration ?? video.duration ?? 0);
  if (!(duration > 0)) fail(`${file} has no length`);
  const sound = info.streams.some((/** @type {any} */ s) => s.codec_type === 'audio');
  return { width, height, fps: round(fps, 3), duration, sound };
}

/** The size frames of this shape are measured at. @param {number} width @param {number} height */
function analysisSize(width, height) {
  const aspect = width / height;
  const w = Math.max(16, Math.round(Math.sqrt(AREA * aspect) / 2) * 2);
  const h = Math.max(16, Math.round(w / aspect / 2) * 2);
  return { w, h };
}

/**
 * Every frame of a video at `fps`, measured: how much each one differs from the one before, overall (`d`, 0–255) and in
 * each cell of a GRID×GRID (`cells`), and its brightness histogram (`hist`). With `keep`, each frame's grey picture
 * and a 4×-smaller colour one are kept too, for comparing pictures.
 * @param {string} file @param {{ fps: number, w: number, h: number, keep?: boolean }} o
 */
function readFrames(file, { fps, w, h, keep = false }) {
  return new Promise((done, failed) => {
    const size = w * h * 3;
    const proc = spawn('ffmpeg', ['-v', 'error', '-i', file, '-an', '-vf', `fps=${fps},scale=${w}:${h}:flags=area,format=rgb24`, '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    /** @type {number[]} */ const d = [];
    /** @type {Float32Array[]} */ const cells = [];
    /** @type {Float32Array[]} */ const hist = [];
    /** @type {Uint8Array[]} */ const grey = [];
    /** @type {Uint8Array[]} */ const colour = [];
    let pending = Buffer.alloc(0);
    /** @type {Uint8Array | null} */ let previous = null;
    let errors = '';
    const cw = w / GRID;
    const ch = h / GRID;
    const frame = (/** @type {Buffer} */ rgb) => {
      const g = new Uint8Array(w * h);
      for (let i = 0, j = 0; i < g.length; i++, j += 3) g[i] = (rgb[j] * 77 + rgb[j + 1] * 150 + rgb[j + 2] * 29) >> 8;
      const hs = new Float32Array(BINS);
      for (let i = 0; i < g.length; i++) hs[(g[i] * BINS) >> 8]++;
      for (let b = 0; b < BINS; b++) hs[b] /= g.length;
      const cs = new Float32Array(GRID * GRID);
      let sum = 0;
      if (previous) {
        for (let y = 0; y < h; y++) {
          const row = Math.min(GRID - 1, Math.floor(y / ch)) * GRID;
          for (let x = 0; x < w; x++) {
            const v = Math.abs(g[y * w + x] - previous[y * w + x]);
            sum += v;
            cs[row + Math.min(GRID - 1, Math.floor(x / cw))] += v;
          }
        }
        const per = (w * h) / (GRID * GRID);
        for (let c = 0; c < cs.length; c++) cs[c] /= per;
      }
      d.push(previous ? sum / (w * h) : 0);
      cells.push(cs);
      hist.push(hs);
      if (keep) {
        grey.push(g);
        const sw = w / 4;
        const sh = h / 4;
        const small = new Uint8Array(Math.floor(sw) * Math.floor(sh) * 3);
        for (let y = 0; y < Math.floor(sh); y++) {
          for (let x = 0; x < Math.floor(sw); x++) {
            for (let k = 0; k < 3; k++) {
              let s = 0;
              for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) s += rgb[((y * 4 + dy) * w + x * 4 + dx) * 3 + k];
              small[(y * Math.floor(sw) + x) * 3 + k] = s >> 4;
            }
          }
        }
        colour.push(small);
      }
      previous = g;
    };
    proc.stdout.on('data', (/** @type {Buffer} */ chunk) => {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= size) {
        frame(pending.subarray(0, size));
        pending = pending.subarray(size);
      }
    });
    proc.stderr.on('data', (chunk) => { errors += chunk; });
    proc.on('error', (e) => failed(new Error(`ffmpeg: ${/** @type {NodeJS.ErrnoException} */ (e).code === 'ENOENT' ? 'not found on the PATH' : e.message}`)));
    proc.on('close', (code) => {
      if (code !== 0 || !d.length) failed(new Error(`ffmpeg could not read ${file}: ${errors.trim()}`));
      else done({ d, cells, hist, grey, colour, w, h });
    });
  });
}

/** A file's sound, mono at RATE, or null when it has none. @param {string} file @returns {Promise<Float32Array | null>} */
function readSound(file) {
  return new Promise((done) => {
    const proc = spawn('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { stdio: ['ignore', 'pipe', 'ignore'] });
    /** @type {Buffer[]} */ const parts = [];
    proc.stdout.on('data', (c) => parts.push(c));
    proc.on('error', () => done(null));
    proc.on('close', (code) => {
      const all = Buffer.concat(parts);
      if (code !== 0 || all.length < 4 * WINDOW) return done(null);
      const copy = new Uint8Array(all.length - (all.length % 4));
      copy.set(all.subarray(0, copy.length));
      done(new Float32Array(copy.buffer));
    });
  });
}

// ---------------------------------------------------------------- what happens in the picture

const median = (/** @type {number[]} */ xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const percentile = (/** @type {number[]} */ xs, /** @type {number} */ p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
};
const histDistance = (/** @type {Float32Array} */ a, /** @type {Float32Array} */ b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / 2;
};

/**
 * The cuts: frames unlike the one before in a way motion does not make (the brightness histogram jumps, or the
 * picture changes far more than in the frames around it). → frame numbers, each the first frame of a new shot.
 * @param {{ d: number[], hist: Float32Array[] }} m
 */
function findCuts({ d, hist }) {
  /** @type {number[]} */ const cuts = [];
  for (let i = 1; i < d.length; i++) {
    const hd = histDistance(hist[i], hist[i - 1]);
    const around = [];
    for (let k = i - 6; k <= i + 6; k++) if (k > 0 && k < d.length && Math.abs(k - i) > 1) around.push(d[k]);
    const local = Math.max(1, median(around));
    const cut = (hd > 0.3 && d[i] > 6) || (d[i] > 10 && d[i] > 4 * local && hd > 0.08);
    if (!cut) continue;
    const last = cuts[cuts.length - 1];
    if (last !== undefined && i - last < 3) { if (d[i] > d[last]) cuts[cuts.length - 1] = i; continue; }
    cuts.push(i);
  }
  return cuts;
}

/** The change below which a frame counts as still: what compression and grain alone make. @param {number[]} d @param {Set<number>} cuts */
function stillFloor(d, cuts) {
  const calm = d.filter((_, i) => i > 0 && !cuts.has(i));
  return Math.max(0.35, percentile(calm, 0.1) * 1.6 + 0.25);
}

/**
 * How the pace of a change goes over its span, from the change of each frame (`pace`):
 * → its shape in ten digits (0–9, its fastest frame 9), and in words.
 * @param {number[]} pace
 */
function describePace(pace) {
  const max = Math.max(...pace, 1e-9);
  const digits = Array.from({ length: Math.min(10, pace.length) }, (_, k) => {
    const n = Math.min(10, pace.length);
    const a = Math.floor((k * pace.length) / n);
    const b = Math.max(a + 1, Math.floor(((k + 1) * pace.length) / n));
    const v = pace.slice(a, b).reduce((s, x) => s + x, 0) / (b - a);
    return Math.round((v / max) * 9);
  }).join('');
  if (pace.length <= 2) return { digits, words: 'at once', half: 0.5, spread: 0 };
  const total = pace.reduce((s, x) => s + x, 0);
  let acc = 0;
  let half = 0;
  for (let i = 0; i < pace.length; i++) { acc += pace[i]; if (acc >= total / 2) { half = (i + 0.5) / pace.length; break; } }
  const mean = total / pace.length;
  const spread = Math.sqrt(pace.reduce((s, x) => s + (x - mean) ** 2, 0) / pace.length) / (mean || 1);
  /* pulses: peaks over 0.6 of the fastest, each pair parted by a dip under 0.6 of the smaller, on a smoothed pace */
  const smooth = pace.map((x, i) => ((pace[i - 1] ?? x) + 2 * x + (pace[i + 1] ?? x)) / 4);
  const top = Math.max(...smooth);
  let peaks = 0;
  let last = -1;
  let dip = Infinity;
  for (let i = 0; i < smooth.length; i++) {
    dip = Math.min(dip, smooth[i]);
    const isPeak = smooth[i] >= (smooth[i - 1] ?? 0) && smooth[i] >= (smooth[i + 1] ?? 0) && smooth[i] > 0.6 * top;
    if (!isPeak) continue;
    if (last < 0 || dip < 0.6 * Math.min(smooth[i], smooth[last])) { peaks++; last = i; dip = Infinity; }
    else if (smooth[i] > smooth[last]) last = i;
  }
  let words;
  if (peaks >= 3) words = `${peaks} pulses`;
  else if (spread < 0.25) words = 'steady pace';
  else if (half < 0.4) words = 'fast start, slow settle';
  else if (half > 0.6) words = 'slow start, fast finish';
  else words = 'slow start and settle';
  return { digits, words, half: round(half, 2), spread: round(spread, 2) };
}

/**
 * Everything that happens in the picture: its cuts, its shots, and in each shot the stretches where it holds still and
 * the changes between them, each with where in the frame it happens and its pace.
 * @param {{ d: number[], cells: Float32Array[], hist: Float32Array[] }} m @param {{ fps: number, width: number, height: number }} v
 */
function analyse(m, { fps, width, height }) {
  const n = m.d.length;
  const cuts = findCuts(m);
  const cutSet = new Set(cuts);
  /* a frame changes when the frame does as a whole, or any one cell of it does: a few letters typed count */
  const floor = stillFloor(m.d, cutSet);
  const peak = m.cells.map((c) => Math.max(...c));
  const cellFloor = Math.max(1.2, stillFloor(peak, cutSet) * 2);
  const active = m.d.map((x, i) => i > 0 && !cutSet.has(i) && (x > floor || peak[i] > cellFloor));
  /* close gaps of a frame or two inside a change */
  for (let i = 1; i < n - 1; i++) {
    if (active[i] || cutSet.has(i)) continue;
    let j = i;
    while (j < n && !active[j] && !cutSet.has(j) && j - i < 2) j++;
    if (j < n && active[j] && active[i - 1] && j - i <= 2) for (let k = i; k < j; k++) active[k] = true;
  }
  const bounds = [0, ...cuts, n];
  const shots = [];
  /** @type {any[]} */ const changes = [];
  /** @type {any[]} */ const holds = [];
  for (let s = 0; s < bounds.length - 1; s++) {
    const a = bounds[s];
    const b = bounds[s + 1];
    const shot = { from: round(a / fps), to: round(b / fps), firstFrame: a, holds: /** @type {any[]} */ ([]), changes: /** @type {any[]} */ ([]) };
    let i = a + 1;
    let stillFrom = a;
    while (i < b) {
      if (!active[i]) { i++; continue; }
      let j = i;
      while (j + 1 < b && active[j + 1]) j++;
      if (j - i + 1 >= 1) {
        if (i - 1 - stillFrom >= Math.max(3, Math.round(fps * 0.2))) shot.holds.push(hold(stillFrom, i - 1));
        const change = describeChange(m, i, j, { fps, width, height, a, b });
        if (change) shot.changes.push(change);
        stillFrom = j;
      }
      i = j + 1;
    }
    if (b - 1 - stillFrom >= Math.max(3, Math.round(fps * 0.2))) shot.holds.push(hold(stillFrom, b - 1));
    shots.push(shot);
    changes.push(...shot.changes);
    holds.push(...shot.holds);
  }
  function hold(/** @type {number} */ x, /** @type {number} */ y) {
    return { from: round(x / fps), to: round(y / fps), look: round(Math.round((x + y) / 2) / fps) };
  }
  return { fps, frames: n, floor: round(floor, 2), cellFloor: round(cellFloor, 2), cuts: cuts.map((i) => ({ at: round(i / fps), frame: i })), shots, changes, holds, active };
}

/**
 * One change: frames i to j change, so the picture of frame i − 1 becomes that of frame j.
 * @param {{ d: number[], cells: Float32Array[], hist: Float32Array[] }} m @param {number} i @param {number} j
 * @param {{ fps: number, width: number, height: number, a: number, b: number }} o
 */
function describeChange(m, i, j, { fps, width, height }) {
  const sums = new Float32Array(GRID * GRID);
  for (let k = i; k <= j; k++) for (let c = 0; c < sums.length; c++) sums[c] += m.cells[k][c];
  const top = Math.max(...sums);
  let x0 = GRID, y0 = GRID, x1 = -1, y1 = -1, count = 0;
  for (let c = 0; c < sums.length; c++) {
    if (sums[c] < 0.2 * top) continue;
    count++;
    const x = c % GRID;
    const y = Math.floor(c / GRID);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  /* its pace: the change of the cells it happens in, frame by frame */
  const pace = [];
  for (let k = i; k <= j; k++) {
    let v = 0, on = 0;
    for (let c = 0; c < sums.length; c++) if (sums[c] >= 0.2 * top) { v += m.cells[k][c]; on++; }
    pace.push(on ? v / on : 0);
  }
  const { digits, words } = describePace(pace);
  const whole = count >= GRID * GRID * 0.7;
  const before = m.hist[Math.max(0, i - 1)];
  const after = m.hist[j];
  const long = (j - i + 1) / fps > 3;
  const kind = whole && long ? 'continuous' : whole && histDistance(before, after) > 0.25 ? 'whole picture' : 'change';
  return {
    from: round((i - 1) / fps),
    to: round(j / fps),
    frames: [i - 1, j],
    region: {
      x: Math.round((x0 / GRID) * width), y: Math.round((y0 / GRID) * height),
      w: Math.round(((x1 - x0 + 1) / GRID) * width), h: Math.round(((y1 - y0 + 1) / GRID) * height),
      cells: [...sums].map((v) => v >= 0.2 * top),
    },
    pace: digits,
    shape: words,
    kind,
  };
}

/** Where in the frame a region is, in a few words. @param {{ x: number, y: number, w: number, h: number }} r @param {number} width @param {number} height */
function place(r, width, height) {
  if (r.w >= width * 0.85 && r.h >= height * 0.85) return 'whole frame';
  const cx = (r.x + r.w / 2) / width;
  const cy = (r.y + r.h / 2) / height;
  const across = cx < 0.36 ? 'left' : cx > 0.64 ? 'right' : 'centre';
  const down = cy < 0.36 ? 'top' : cy > 0.64 ? 'bottom' : 'middle';
  return across === 'centre' && down === 'middle' ? 'centre' : `${down} ${across}`;
}

// ---------------------------------------------------------------- what happens in the sound

/** In-place radix-2 FFT. @param {Float64Array} re @param {Float64Array} im */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/**
 * The sound's hits (onsets: where new sound starts, from the rise of its spectrum), its quiet stretches, and its
 * tempo and beats when it has a steady one.
 * @param {Float32Array} samples
 */
function listen(samples) {
  const hann = Float64Array.from({ length: WINDOW }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / WINDOW));
  const frames = Math.floor((samples.length - WINDOW) / HOP) + 1;
  const flux = new Float64Array(frames);
  const level = new Float64Array(frames);
  let previous = new Float64Array(WINDOW / 2);
  const re = new Float64Array(WINDOW);
  const im = new Float64Array(WINDOW);
  for (let f = 0; f < frames; f++) {
    let power = 0;
    for (let i = 0; i < WINDOW; i++) {
      const s = samples[f * HOP + i];
      re[i] = s * hann[i];
      im[i] = 0;
      power += s * s;
    }
    level[f] = 10 * Math.log10(power / WINDOW + 1e-12);
    fft(re, im);
    const mag = new Float64Array(WINDOW / 2);
    let rise = 0;
    for (let k = 0; k < WINDOW / 2; k++) {
      mag[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
      if (f > 0) rise += Math.max(0, mag[k] - previous[k]);
    }
    flux[f] = rise;
    previous = mag;
  }
  const hopTime = HOP / RATE;
  const top = Math.max(...flux, 1e-9);
  /* a hit: the rise is the largest around it and well over what is usual near it */
  /** @type {Array<{ at: number, strength: number }>} */ const hits = [];
  for (let f = 1; f < frames - 1; f++) {
    let biggest = true;
    for (let k = Math.max(0, f - 4); k <= Math.min(frames - 1, f + 4); k++) if (flux[k] > flux[f]) { biggest = false; break; }
    if (!biggest) continue;
    const near = [];
    for (let k = Math.max(0, f - 40); k <= Math.min(frames - 1, f + 10); k++) near.push(flux[k]);
    if (flux[f] < median(near) * 1.5 + 0.08 * top || level[f] < -60) continue;
    const last = hits[hits.length - 1];
    if (last && f * hopTime - last.at < 0.06) continue;
    hits.push({ at: round(f * hopTime + WINDOW / RATE / 4), strength: round(flux[f] / top, 2) });
  }
  /* quiet: 0.3 s or more under -50 dBFS */
  /** @type {Array<{ from: number, to: number }>} */ const quiet = [];
  let q = -1;
  for (let f = 0; f <= frames; f++) {
    const silent = f < frames && level[f] < -50;
    if (silent && q < 0) q = f;
    if (!silent && q >= 0) {
      if ((f - q) * hopTime >= 0.3) quiet.push({ from: round(q * hopTime), to: round(f * hopTime) });
      q = -1;
    }
  }
  /* tempo: the beat period whose repeats line up the rises best, 60 to 180 a minute, nearer 120 preferred */
  const mean = flux.reduce((s, x) => s + x, 0) / frames;
  const centred = Float64Array.from(flux, (x) => x - mean);
  const lagOf = (/** @type {number} */ bpm) => Math.round(60 / bpm / hopTime);
  let best = 0, bestScore = -Infinity, zero = 0;
  for (let i = 0; i < frames; i++) zero += centred[i] * centred[i];
  /** @type {Map<number, number>} */ const ac = new Map();
  for (let lag = lagOf(180); lag <= lagOf(60); lag++) {
    let s = 0;
    for (let i = 0; i + lag < frames; i++) s += centred[i] * centred[i + lag];
    s /= frames - lag;
    ac.set(lag, s);
    const bpm = 60 / (lag * hopTime);
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    if (s * prior > bestScore) { bestScore = s * prior; best = lag; }
  }
  const clarity = zero > 0 ? (/** @type {number} */ (ac.get(best)) * frames) / zero : 0;
  /** @type {{ bpm: number, clarity: number, beats: number[] } | null} */ let tempo = null;
  if (best && clarity > 0.12 && frames * hopTime > 4) {
    let phase = 0, phaseScore = -Infinity;
    for (let p = 0; p < best; p++) {
      let s = 0;
      for (let i = p; i < frames; i += best) s += flux[i];
      if (s > phaseScore) { phaseScore = s; phase = p; }
    }
    const beats = [];
    for (let i = phase; i < frames; i += best) beats.push(round(i * hopTime + WINDOW / RATE / 4));
    tempo = { bpm: round(60 / (best * hopTime), 1), clarity: round(clarity, 2), beats };
  }
  return { hits, quiet, tempo };
}

// ---------------------------------------------------------------- study

/** @param {string} file @param {string} [out] */
async function study(file, out) {
  const video = probe(file);
  const size = analysisSize(video.width, video.height);
  const m = /** @type {any} */ (await readFrames(file, { fps: video.fps, ...size }));
  const pic = analyse(m, video);
  const samples = video.sound ? await readSound(file) : null;
  const sound = samples ? listen(samples) : null;
  const folder = resolve(out ?? join(dirname(file), basename(file, extname(file))));
  mkdirSync(folder, { recursive: true });
  const { active, ...picture } = pic;
  const json = {
    file: resolve(file),
    width: video.width, height: video.height, fps: video.fps, duration: round(video.duration), frames: pic.frames,
    picture: { ...picture, changes: undefined, holds: undefined, shots: pic.shots.map((s) => ({ ...s, changes: s.changes.map(({ region: { cells, ...r }, ...c }) => ({ ...c, region: r })) })) },
    sound,
  };
  writeFileSync(join(folder, 'study.json'), `${JSON.stringify(json, null, 1)}\n`);
  const lines = [
    `# ${basename(file)}`,
    '',
    `${video.width}×${video.height}, ${video.fps} fps, ${fmt(video.duration)} s (${pic.frames} frames), ${video.sound ? 'with sound' : 'no sound'}.`,
    'Times are seconds from the start, frame n at n ÷ fps. A change "from a to b" turns the picture at a into the picture at b.',
    'Pace: how much the picture changes each frame across a change, in ten steps (9 is its fastest).',
    '',
    `## Cuts (${pic.cuts.length})`,
    '',
    pic.cuts.length ? pic.cuts.map((c) => `${fmt(c.at)} (frame ${c.frame})`).join(' · ') : 'None: one shot.',
    '',
  ];
  pic.shots.forEach((shot, k) => {
    lines.push(`## Shot ${k + 1}: ${fmt(shot.from)}–${fmt(shot.to)}`, '');
    const events = [
      ...shot.holds.map((h) => ({ at: h.from, line: `- holds ${fmt(h.from)}–${fmt(h.to)} (look at ${fmt(h.look)})` })),
      ...shot.changes.map((c) => ({
        at: c.from,
        line: `- ${c.kind === 'change' ? 'changes' : c.kind === 'continuous' ? 'moves throughout' : 'the whole picture changes'} ${fmt(c.from)}–${fmt(c.to)}`
          + `, ${place(c.region, video.width, video.height)} (x ${c.region.x}–${c.region.x + c.region.w}, y ${c.region.y}–${c.region.y + c.region.h})`
          + `, pace ${c.pace}, ${c.shape}`,
      })),
    ].sort((a, b) => a.at - b.at);
    lines.push(...(events.length ? events.map((e) => e.line) : ['- nothing measured inside it']), '');
  });
  lines.push('## Sound', '');
  if (!sound) lines.push(video.sound ? 'Could not be read.' : 'None.');
  else {
    if (sound.tempo) lines.push(`A steady beat: ${sound.tempo.bpm} a minute (clarity ${sound.tempo.clarity}), the first at ${fmt(sound.tempo.beats[0])}, then every ${fmt(60 / sound.tempo.bpm)} s.`);
    else lines.push('No steady beat.');
    const strong = sound.hits.filter((h) => h.strength >= 0.5);
    lines.push('', `Hits: ${sound.hits.length}, every one in study.json. The strongest (strength 0.5 to 1): ${strong.map((h) => `${fmt(h.at)} (${h.strength})`).join(' · ') || 'none'}`);
    if (sound.quiet.length) lines.push('', `Quiet: ${sound.quiet.map((q) => `${fmt(q.from)}–${fmt(q.to)}`).join(' · ')}`);
  }
  lines.push('');
  writeFileSync(join(folder, 'study.md'), lines.join('\n'));
  console.log(`${pic.cuts.length} cuts, ${pic.changes.length} changes, ${pic.holds.length} holds${sound ? `, ${sound.hits.length} sound hits${sound.tempo ? `, ${sound.tempo.bpm} bpm` : ''}` : ''}`);
  console.log(`→ ${relative(process.cwd(), join(folder, 'study.md')) || join(folder, 'study.md')}`);
}

// ---------------------------------------------------------------- compare

/** How alike two grey pictures are: SSIM over 8×8 blocks, 1 the same. @param {Uint8Array} a @param {Uint8Array} b @param {number} w @param {number} h */
function ssim(a, b, w, h) {
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  let total = 0, blocks = 0;
  for (let by = 0; by + 8 <= h; by += 4) {
    for (let bx = 0; bx + 8 <= w; bx += 4) {
      let ma = 0, mb = 0;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const i = (by + y) * w + bx + x; ma += a[i]; mb += b[i]; }
      ma /= 64; mb /= 64;
      let va = 0, vb = 0, cov = 0;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const i = (by + y) * w + bx + x;
        va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; cov += (a[i] - ma) * (b[i] - mb);
      }
      va /= 63; vb /= 63; cov /= 63;
      total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      blocks++;
    }
  }
  return blocks ? total / blocks : 1;
}

/** How alike two colour pictures are: 1 less their mean difference. @param {Uint8Array} a @param {Uint8Array} b */
const colourMatch = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return 1 - s / a.length / 255;
};

/** Pearson correlation of two series of the same length. @param {number[]} a @param {number[]} b */
function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const ma = a.slice(0, n).reduce((s, x) => s + x, 0) / n;
  const mb = b.slice(0, n).reduce((s, x) => s + x, 0) / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { cov += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return va && vb ? cov / Math.sqrt(va * vb) : 0;
}

/**
 * Each reference time matched to the nearest remake time within `within` seconds, each remake time used once.
 * @param {number[]} ref @param {number[]} remake @param {number} within
 */
function match(ref, remake, within) {
  const used = new Set();
  const pairs = [];
  const missing = [];
  for (const t of ref) {
    let best = -1;
    for (let i = 0; i < remake.length; i++) {
      if (used.has(i) || Math.abs(remake[i] - t) > within) continue;
      if (best < 0 || Math.abs(remake[i] - t) < Math.abs(remake[best] - t)) best = i;
    }
    if (best < 0) missing.push(t);
    else { used.add(best); pairs.push({ ref: t, remake: remake[best], off: remake[best] - t }); }
  }
  const extra = remake.filter((_, i) => !used.has(i));
  return { pairs, missing, extra };
}

/** A side-by-side picture, the reference at `a` on the left and the remake at `b` on the right. */
function sideBySide(/** @type {string} */ refFile, /** @type {number} */ a, /** @type {string} */ remakeFile, /** @type {number} */ b, /** @type {string} */ out, /** @type {{ width: number, height: number }} */ v) {
  const long = 640;
  const pw = v.width >= v.height ? long : Math.round((long * v.width) / v.height / 2) * 2;
  const ph = v.width >= v.height ? Math.round((long * v.height) / v.width / 2) * 2 : long;
  const fit = `scale=${pw}:${ph}:force_original_aspect_ratio=decrease,pad=${pw}:${ph}:-1:-1:color=gray`;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(a), '-i', refFile, '-ss', String(b), '-i', remakeFile,
    '-filter_complex', `[0:v]${fit}[a];[1:v]${fit}[b];[a][b]hstack=inputs=2`, '-frames:v', '1', out], { encoding: 'utf8' });
  return r.status === 0;
}

/** @param {string} refFile @param {string} remakeFile @param {{ out?: string, fit?: boolean }} o */
async function compare(refFile, remakeFile, { out, fit = false }) {
  const ref = probe(refFile);
  const mine = probe(remakeFile);
  const size = analysisSize(ref.width, ref.height);
  const [a, b] = /** @type {any[]} */ (await Promise.all([
    readFrames(refFile, { fps: ref.fps, ...size, keep: true }),
    readFrames(remakeFile, { fps: ref.fps, ...size, keep: true }),
  ]));
  const pa = analyse(a, ref);
  const pb = analyse(b, { ...mine, fps: ref.fps, width: ref.width, height: ref.height });
  const scale = fit ? mine.duration / ref.duration : 1;
  /** a reference time as the remake's */
  const toRemake = (/** @type {number} */ t) => t * scale;
  const frame = 1 / ref.fps;
  const folder = resolve(out ?? join(dirname(refFile), 'compare'));
  mkdirSync(folder, { recursive: true });

  /* timing: cuts, the starts and settles of changes, and sound hits */
  const starts = (/** @type {any} */ p) => p.changes.filter((/** @type {any} */ c) => c.kind !== 'continuous').map((/** @type {any} */ c) => c.from);
  const ends = (/** @type {any} */ p) => p.changes.filter((/** @type {any} */ c) => c.kind !== 'continuous').map((/** @type {any} */ c) => c.to);
  const back = (/** @type {number[]} */ ts) => ts.map((t) => t / scale);
  const cuts = match(pa.cuts.map((/** @type {any} */ c) => c.at), back(pb.cuts.map((/** @type {any} */ c) => c.at)), 0.25);
  const moveStarts = match(starts(pa), back(starts(pb)), 0.3);
  const moveEnds = match(ends(pa), back(ends(pb)), 0.3);
  const [sa, sb] = ref.sound && mine.sound ? await Promise.all([readSound(refFile), readSound(remakeFile)]) : [null, null];
  const hits = sa && sb ? match(listen(sa).hits.filter((h) => h.strength >= 0.2).map((h) => h.at), back(listen(sb).hits.filter((h) => h.strength >= 0.2).map((h) => h.at)), 0.15) : null;

  /* rhythm: whether the two change at the same moments */
  const curve = (/** @type {number[]} */ d) => d.map((x, i) => Math.log1p((d[i - 1] ?? x) / 3 + x / 3 + (d[i + 1] ?? x) / 3));
  const ca = curve(a.d);
  const cbRaw = curve(b.d);
  const cb = ca.map((_, i) => cbRaw[Math.min(cbRaw.length - 1, Math.round(i * scale))] ?? 0);
  const rhythm = correlation(ca, cb);

  /* motion: each change of the reference, paired with the remake's change that overlaps it most near the same time;
     their pace and length compared over the reference's part of the frame */
  const motion = [];
  const tolerance = Math.round(0.3 * ref.fps);
  const sum = (/** @type {number[]} */ xs) => xs.reduce((s, x) => s + x, 0);
  for (const c of pa.changes) {
    if (c.kind === 'continuous') continue;
    const [i, j] = c.frames;
    const cells = c.region.cells;
    const paceIn = (/** @type {any} */ m, /** @type {number} */ x, /** @type {number} */ y) => {
      const out = [];
      for (let k = Math.max(1, x + 1); k <= Math.min(m.d.length - 1, y); k++) {
        let s = 0, n = 0;
        for (let q = 0; q < cells.length; q++) if (cells[q]) { s += m.cells[k][q]; n++; }
        out.push(n ? s / n : 0);
      }
      return out;
    };
    const refPace = paceIn(a, i, j);
    const ri = Math.round(i * scale);
    const rj = Math.max(ri + 1, Math.round(j * scale));
    /** @type {any} */ let partner = null;
    let overlapBest = -Infinity;
    for (const r of pb.changes) {
      const [x, y] = r.frames;
      if (y < ri - tolerance || x > rj + tolerance) continue;
      const shared = r.region.cells.filter((/** @type {boolean} */ on, /** @type {number} */ q) => on && cells[q]).length;
      if (!shared) continue;
      /* the nearest in both its start and its settle; then the one sharing more of the frame */
      const score = -(Math.abs(x - ri) + Math.abs(y - rj)) + shared / 64;
      if (partner === null || score > overlapBest) { overlapBest = score; partner = r; }
    }
    const theirs = describePace(refPace);
    const length = round(c.to - c.from);
    let issue = null;
    /** @type {any} */ let ours = null;
    let theirLength = null;
    if (!partner) {
      const around = paceIn(b, Math.max(0, ri - tolerance), rj + tolerance);
      issue = sum(around) < 0.15 * sum(refPace) ? 'still in the remake' : 'the remake changes here, but not as one change';
    } else {
      ours = describePace(paceIn(b, partner.frames[0], partner.frames[1]));
      theirLength = round((partner.to - partner.from) / scale);
      const notes = [];
      if (Math.abs(theirLength - length) > Math.max(2 / ref.fps, 0.25 * length)) notes.push(`takes ${fmt(theirLength)} s, the reference ${fmt(length)} s`);
      const eased = (/** @type {any} */ p) => p.spread >= 0.25;
      if (theirs.words !== 'at once' && ours.words !== 'at once' && (Math.abs(theirs.half - ours.half) > 0.15 || eased(theirs) !== eased(ours))) {
        notes.push(`pace ${ours.digits} (${ours.words}), the reference ${theirs.digits} (${theirs.words})`);
      }
      if (notes.length) issue = notes.join('; ');
    }
    motion.push({ from: c.from, to: c.to, where: place(c.region, ref.width, ref.height), reference: { ...theirs, length }, remake: ours && { ...ours, length: theirLength }, issue });
  }

  /* pictures: frame by frame at the same times */
  const n = a.grey.length;
  const perFrame = [];
  for (let i = 0; i < n; i++) {
    const k = Math.min(b.grey.length - 1, Math.round(i * scale));
    perFrame.push({ i, ssim: ssim(a.grey[i], b.grey[k], a.w, a.h), colour: colourMatch(a.colour[i], b.colour[k]) });
  }
  const mean = (/** @type {number[]} */ xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const shots = pa.shots.map((/** @type {any} */ s) => {
    const fs = perFrame.slice(s.firstFrame, Math.round(s.to * ref.fps));
    return { from: s.from, to: s.to, ssim: round(mean(fs.map((f) => f.ssim))), colour: round(mean(fs.map((f) => f.colour))) };
  });
  /* the least alike moments, half a second apart at least */
  const worst = [];
  for (const f of [...perFrame].sort((x, y) => x.ssim - y.ssim)) {
    if (worst.length >= 6) break;
    if (worst.some((w) => Math.abs(w.i - f.i) < ref.fps / 2)) continue;
    worst.push(f);
  }

  /* side-by-side pictures: the least alike moments, and the reference's changes the remake misses or paces otherwise */
  /** @type {Map<number, string>} */ const pictures = new Map();
  const picture = (/** @type {number} */ t) => {
    const key = round(t);
    if (pictures.has(key)) return pictures.get(key);
    const name = `${fmt(key)}.png`;
    if (sideBySide(refFile, key, remakeFile, toRemake(key), join(folder, name), ref)) pictures.set(key, name);
    return pictures.get(key);
  };
  const worstShown = worst.map((f) => ({ at: round(f.i / ref.fps), ssim: round(f.ssim), colour: round(f.colour), picture: picture(f.i / ref.fps) }));
  const issues = motion.filter((m) => m.issue).slice(0, 8).map((m) => ({ ...m, picture: picture((m.from + m.to) / 2) }));
  const missedCuts = cuts.missing.slice(0, 4).map((t) => ({ at: t, picture: picture(t + frame / 2) }));

  const frames = (/** @type {number} */ s) => Math.abs(s) * ref.fps;
  const within = (/** @type {{ pairs: Array<{ off: number }> }} */ m, /** @type {number} */ k) => m.pairs.filter((p) => frames(p.off) <= k + 0.01).length;
  const summary = (/** @type {{ pairs: Array<{ off: number }>, missing: number[], extra: number[] }} */ m, /** @type {number} */ total, /** @type {number} */ k) => {
    const offs = m.pairs.map((p) => frames(p.off));
    return { total, within: within(m, k), frames: k, matched: m.pairs.length, mean: round(mean(offs), 1), worst: round(Math.max(0, ...offs), 1), missing: m.missing.map((t) => round(t)), extra: m.extra.map((t) => round(t)) };
  };
  const json = {
    reference: resolve(refFile), remake: resolve(remakeFile),
    lengths: [round(ref.duration), round(mine.duration)], scale: round(scale, 4), fps: ref.fps,
    timing: {
      cuts: summary(cuts, pa.cuts.length, 1),
      starts: summary(moveStarts, starts(pa).length, 2),
      settles: summary(moveEnds, ends(pa).length, 2),
      hits: hits && summary(hits, hits.pairs.length + hits.missing.length, 2),
      rhythm: round(rhythm, 2),
    },
    motion,
    pictures: { ssim: round(mean(perFrame.map((f) => f.ssim))), colour: round(mean(perFrame.map((f) => f.colour))), shots, worst: worstShown },
  };
  writeFileSync(join(folder, 'compare.json'), `${JSON.stringify(json, null, 1)}\n`);

  const t = json.timing;
  const line = (/** @type {string} */ name, /** @type {any} */ s) => {
    if (!s || !s.total) return `- ${name}: none in the reference`;
    let text = `- ${name}: ${s.within} of ${s.total} within ${s.frames} frame${s.frames > 1 ? 's' : ''}${s.matched ? ` (mean ${s.mean}, worst ${s.worst})` : ''}`;
    if (s.missing.length) text += `; none near ${s.missing.slice(0, 8).map(fmt).join(', ')}${s.missing.length > 8 ? ` and ${s.missing.length - 8} more` : ''}`;
    if (s.extra.length) text += `; ${s.extra.length} the reference does not have${s.extra.length <= 6 ? ` (${s.extra.map(fmt).join(', ')})` : ''}`;
    return text;
  };
  const lines = [
    `# ${basename(remakeFile)} against ${basename(refFile)}`,
    '',
    `Lengths ${fmt(ref.duration)} and ${fmt(mine.duration)} s; ${scale === 1 ? 'compared at the same times' : `the remake's times scaled by ${round(scale, 4)} to the reference's`}, at ${ref.fps} fps.`,
    'Offsets are in frames; times are the reference\'s. Pictures: reference on the left, remake on the right.',
    '',
    '## Timing',
    '',
    line('Cuts', t.cuts),
    line('Changes start', t.starts),
    line('Changes settle', t.settles),
    ...(t.hits ? [line('Sound hits', t.hits)] : []),
    `- Rhythm: ${t.rhythm} (1 when both change at the same moments, as much)`,
    '',
    '## Motion',
    '',
    `${motion.filter((m) => !m.issue).length} of ${motion.length} changes of the reference happen in the remake at the same pace.`,
    ...issues.map((m) => `- ${fmt(m.from)}–${fmt(m.to)}, ${m.where}: ${m.issue}${m.picture ? ` (${m.picture})` : ''}`),
    ...(missedCuts.length ? ['', ...missedCuts.map((c) => `- cut at ${fmt(c.at)} missing${c.picture ? ` (${c.picture})` : ''}`)] : []),
    '',
    '## Pictures',
    '',
    `Frame by frame: SSIM ${json.pictures.ssim}, colour ${json.pictures.colour} (1 is the same; these matter for an exact copy).`,
    '',
    ...shots.map((s, k) => `- shot ${k + 1} ${fmt(s.from)}–${fmt(s.to)}: SSIM ${s.ssim}, colour ${s.colour}`),
    '',
    `Least alike: ${worstShown.map((w) => `${fmt(w.at)} (${w.ssim}${w.picture ? `, ${w.picture}` : ''})`).join(' · ')}`,
    '',
  ];
  writeFileSync(join(folder, 'compare.md'), lines.join('\n'));
  console.log(`cuts ${t.cuts.within}/${t.cuts.total}, starts ${t.starts.within}/${t.starts.total}, rhythm ${t.rhythm}, SSIM ${json.pictures.ssim}`);
  console.log(`→ ${relative(process.cwd(), join(folder, 'compare.md')) || join(folder, 'compare.md')}`);
}

// ---------------------------------------------------------------- command

const args = process.argv.slice(2);
const flag = (/** @type {string} */ name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const fitAt = args.indexOf('--fit');
const fitIt = fitAt >= 0;
if (fitIt) args.splice(fitAt, 1);
const out = flag('--out');
const [command, ...files] = args;
try {
  if (command === 'study' && files.length === 1) await study(files[0], out);
  else if (command === 'compare' && files.length === 2) await compare(files[0], files[1], { out, fit: fitIt });
  else fail('node measure.mjs study <video> [--out <folder>]\n       node measure.mjs compare <reference> <remake> [--out <folder>] [--fit]');
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
