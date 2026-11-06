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
| `brand-swap` | 32 s of a product film that shows its own app at work, no sound | the same film for the person's app, of which they give no screens |

## Results

Codex (gpt-6.1-sol, high), each side in a home of its own, video made only with the cheapest model the person allowed.

| request | skill | with: rhythm, starts ≤ 1 frame, layout, SSIM | without | seen |
| --- | --- | --- | --- | --- |
| `own-explainer` | 0.1.0 | 0.78, 20/25, 0.76, 0.75 | 0.20, 7/25, 0.49, 0.66 | both change the content well; with the skill, states change at the reference's moments |
| `exact-explainer` | 0.1.0 | 0.92, 19/25, 0.96, 0.92 | imported the reference as the film | without the skill nothing is made again, nothing can change |
| `talking-head` (a vertical presenter) | 0.1.1 | 0.42, 4/24, 0.37, 0.23 | -0.08, 1/24, 0.31, 0.15 | both make the person speak in the picture; with the skill the shots follow the reference's one by one |
| `software-demo` | 0.1.2 draft | 0.81, 18/31, 0.86, 0.49 | 0.27, 5/31, 0.58, 0.31 | 0.1.1 kept the reference's editor around the person's app; once the subject is named first, the app has its own screens in the reference's framing and moves |
| `talking-head` (the same, video by HeyGen only) | 0.1.2 | 0.33, 2/24, 0.41, 0.22; cuts 6/9 | -0.06, 2/24, 0.32, 0.12; cuts 0/9 | one clip with its own voice and lips, cut into the reference's shots one by one; both sides dress the made-up man like the reference's presenter |
| `brand-swap` | 0.1.2 draft | 0.34, 15/65, 0.96, 0.69 | -0.02, 15/65, 0.17, 0.31 | with the skill the person's app still takes the reference's three-column layout, a timeline-like bottom panel and film-like titles; open |

Numbers come from `compare`, which the skill's agent also has, so they lean its way; what was seen decides.
