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

One for each kind of video, since each is made of other parts: pages, filmed shots, people, sound.

| folder | reference | asks for |
| --- | --- | --- |
| `exact-explainer` | 30 s of a light, interface-style code-animation explainer, with typing, voice and music | an exact copy |
| `own-explainer` | the same 30 s | the same look and timing for "what happens in the 0.1 s after you press the shutter" |
| `product-ad` | a 15 s live-action product ad: close-ups, a hand, a table, light, captions | the same ad for the person's own product, from its photos |
| `talking-head` | a minute of a vertical talking-head video with moving captions | the same video with the person's own footage and script |
| `illustrated-story` | 30 s of an illustrated story with a recurring character | the same story look with the person's character and words |
| `travel-broll` | 20 s of a travel montage cut to music | the same montage of the person's own city, from their clips and found footage |
| `software-demo` | 30 s of a software demo with a cursor, zooms and callouts | the same demo of the person's own product |
| `exact-launch` | the first 30 s of OpenFilm's own launch film | an exact copy |

## Results

None yet.
