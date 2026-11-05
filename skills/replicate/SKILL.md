---
name: replicate
description: Remake a video in OpenFilm so that it looks and moves like the reference, shot for shot, with only the content the person names changed (their product, people, words, topic or footage), or as an exact copy, frame for frame. Use when the person gives a video, as a file or a link, and asks for a copy of it, one like it, its style or pacing, or the same video for their product or topic (复刻, 照着做, 做个同款, 一模一样, 仿这个视频).
---

# Replicate a video

The reference made again in OpenFilm: each shot looks and moves as the reference's does, at the same moments, and
only what the person names changes (their product, face, words or topic), every part editable. When they name nothing
to change, it is a copy, frame for frame.

**A replica is the reference's look and time, carrying new content.** The cut lands on the same frame; a title
starts, speeds up and settles when the reference's does; a shot keeps its framing, light, colour and type. It is not
a replica when it keeps its own clock, when a shot is redrawn in another medium (a filmed shot as a drawing), or when
it is the reference with new words laid over it.

## What has to be true

- **The same moments and the same look, measured.** Every cut, change and sound hit of the reference is in the
  remake within a frame or two, at its pace, and each shot has its palette and layout; `compare` measures this on the
  rendered film; report its numbers.
- **Each part made with what can look like it.** Text, captions, graphics, interfaces, charts and their motion are
  pages, exact and editable. What was filmed stays filmed: the person's footage, a clip made from the reference's shot
  or from a still matching it, or footage found to fit; each shot keeps as much of the reference as the change allows.
- **Who speaks on screen speaks in the picture.** Lips, voice and captions are one take: the voice made with the
  picture, or the picture made from the voice, never a voice laid over a clip made without it. A person keeps one face
  and one voice, and the captions are what is said, when it is said.
- **Their content, and no one else's.** What changes is the person's: their product, words, voice and face, or a
  person made up for the film who passes for no real one, not even the reference's people. The reference's footage,
  music or voice go into the film, or into a service, only when the person says they may use them.
- **Seen before it costs.** Before anything costly is made, the person has seen the shot list: for each shot, what
  stays, what changes, what makes it and its rough cost. What they change there is what is made.

## What you have

- `node <this skill's folder>/scripts/measure.mjs study <video>`: the reference in time: every cut to the frame,
  each change with where and its pace, its holds, its sound's hits and beat.
- `npx openfilm look <video> a-b` shows a stretch frame by frame, `look <video> t` one frame.
- `node <this skill's folder>/scripts/measure.mjs compare <reference> <render>`: the film against the reference:
  cuts, changes and hits with their offsets in frames, each change's pace, each shot's palette and layout, how alike
  the frames are, and side-by-side pictures where they differ most. Render with `npx openfilm render` to compare,
  `--fit` when the lengths differ on purpose.
- `npx openfilm get`: pictures made from the reference's frames with what to change (`--ref`, `--mask`,
  `--markup`); video clips from a stretch of the reference (`--video`), from frames and pictures, or of a person
  speaking (the words in the prompt and `--voice`, or a recording with `--audio`); clips and pictures found on the web;
  voice, music, sound effects, transcripts timed word by word; any service the person has, with its API docs and
  their key; your own tools, the web platform, or a renderer whose output becomes a clip.

The reference, and stretches cut from it for a service, stay in `references/`. Ask before large downloads.

## With the person

What they ask for comes first. Ask for the reference (a file, or a link you can download), what is to change and
their material for it (product, footage, photos, logo, script, voice), whether they may use the reference's own
footage, music and voice, and where it will be posted, without holding up the work. When it is
done, tell them briefly what was kept, what changed and how each shot was made, the numbers from `compare`, what could
not be matched and why, and, if they will post it, which parts are the reference's or someone else's.
