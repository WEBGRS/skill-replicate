---
name: replicate
description: Remake a video in OpenFilm as close as the person wants it, from the same film frame for frame to its form (its parts, rhythm, look and motion) carrying their own content. Use when the person gives a video, as a file or a link, and asks for an exact copy of it, one like it, its style or pacing, or a remake for their product or topic (复刻, 照着做, 做个同款, 一模一样, 仿这个视频).
---

# Replicate a video

A remake of a video the person admires, made again in OpenFilm so that every part of it can be changed. They say how
close: the same film frame for frame, or its form carrying their own content. When their words do not say which, ask.

**What makes it a replica is time.** The same thing happens at the same moment and moves the same way: the cut lands on
the same frame, a title starts, speeds up and settles when the reference's does, a word appears with its voice, a sound
hits with what makes it. A remake that looks like the reference but keeps its own clock, moves at an even pace where the
reference eases, or holds still where the reference moves is not a replica, however good each frame looks.

## What has to be true

- **The same moments, measured.** Every cut, change and sound hit of the reference is in the remake within a frame or
  two (scaled, when the lengths differ on purpose), and each change has the reference's length and pace. `compare`
  measures this on the rendered film; its numbers are what you report, not your own reading.
- **The same pictures, for an exact copy.** Each frame matches the reference's frame at the same time: every word as it
  is, the layout, colours and type as close as they can be made. Look at the least alike moments side by side until
  nothing more can be closed.
- **Made again.** The reference stays in `references/` and is never a clip of the film. What the film shows is made
  anew: text as text, shapes and motion as pages, footage from the person or from the services they have. The
  reference's own music, footage or voice go in only when the person asks for them.
- **Their version is theirs.** With their own content, every part carries their topic, product, words and material at
  the reference's timing and pace, and a part they have nothing for takes a job that fits their film. The reference
  with new words dropped in is not done.

## What you have

- `node <this skill's folder>/scripts/measure.mjs study <video>`: the reference in time, which frames looked at one by
  one do not show: every cut to the frame; each change, where in the frame and from when to when, with its pace frame
  by frame; the stretches where it holds still; its sound's hits and beat. It writes study.md beside the video.
- `npx openfilm look <video> a-b` shows any stretch of it frame by frame, and `look <video> t` one frame at full size.
- `node <this skill's folder>/scripts/measure.mjs compare <reference> <render>`: the film against the reference. Cuts,
  changes and sound hits matched, with their offsets in frames; each change's pace and length; a rhythm score; how
  alike the pictures are, shot by shot; and side-by-side pictures where they differ most. Render the film with
  `npx openfilm render` to compare it, `--fit` when the lengths differ on purpose.
- The reference's words with each one's time, from a transcript by `npx openfilm get` when the person has a service for
  it. Voice, music, sound effects, images, video and image search from `get` too; your own built-in tools; and anything
  that makes pictures, motion and sound: the web platform and any library on it, or a renderer whose output becomes a
  clip.

Ask before downloading anything large onto the person's computer.

## With the person

What they ask for comes before anything here. Ask for the reference (a file, or a link you can download), how close
they want it, what their version is about and the material they have, and where it will be posted; ask without
holding up the work. When it is done, tell them in a few lines what was kept, what changed and why, the numbers from
`compare` (cuts, changes, rhythm, and for an exact copy how alike the pictures are), what could not be matched and
why, and, if they will post it, which parts belong to someone else: footage, music, voice, faces, logos, words,
typefaces.
