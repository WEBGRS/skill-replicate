# Evals

How this skill is tried. Nothing here goes to the agent: only `skills/` is installed.

Each request is a folder with `task.md`, what the person asks, word for word. Its material (the reference video and
anything the person gives) goes in `material/`, and each run in `runs/`; both stay on the computer it was tried on,
because the references are other people's videos.

## How a request is tried

1. The same request, the same material, the same agent and model, twice: once with the skill, once with an OpenFilm
   that has no skills.
2. Each film is rendered and measured with `skills/replicate/scripts/measure.mjs compare` against the reference. The
   agent with the skill had this measure too, so its numbers lean its way: the films are also watched side by side in
   Studio, and that decides.
3. Noted here for each run: the skill's version, the agent and model, minutes and cost, the numbers (cuts, changes
   starting and settling within two frames, rhythm, and for an exact copy SSIM and colour), and what was seen.

## Requests

| folder | reference | asks for |
| --- | --- | --- |
| `exact-explainer` | 30 s of a light, interface-style code-animation explainer, with typing, voice and music | an exact copy |
| `own-explainer` | the same 30 s | its form for "what happens in the 0.1 s after you press the shutter" |
| `own-talking-head` | a minute of a vertical talking-head video with moving captions | its form for the person's own footage and script |
| `exact-launch` | the first 30 s of OpenFilm's own launch film | an exact copy |

## Results

None yet.
