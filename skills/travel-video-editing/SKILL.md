---
name: travel-video-editing
description: Edit a travel video from the creator's own raw footage (clips, photos, voice notes, music) in its own project thread, from the story to a first cut, then timeline, graphics, sound, colour, recording and the final. Use for "new video in <playlist>" when the playlist uses the Travel Video Editing kit.
---

# Travel video editing (one thread = one edited video)

For creators who already filmed the trip: long phone clips, photos, voice notes, talks with locals, music. The
thread guides the creator step by step with short questions, option cards and links; the creator never has to
say what comes next. Works for any channel and any number of speakers (1 or more). Everything channel-specific
(brand, look, styles, languages, standards) comes from the channel folder, never from this skill. The editing
happens in Content Studio's editor (the creator's browser); this thread plans, writes and checks.

Two ways in, one timeline:
- **Story first:** the creator adds the footage and tells the story of the trip and what they want; Claude writes
  the whole cut (scenes, the parts of each clip, voice-over lines per speaker, pieces to camera, graphics, spaces
  for clips still missing), and the creator refines it on the timeline.
- **Timeline first:** the creator builds it by hand (hook, scene 1, 2, 3...) and asks for each graphic by an idea.

## Before anything

1. Read the channel folder's `CLAUDE.md`, `BRAND-GUIDE.md` (standards, narrative, look, sound), `brand/profile.json`
   (kept cutout styles, themes, languages), the playlist's `PLAYLIST.md` and project memory. No brand guide: ask
   the creator to say "set up my brand" in the project chat first.
2. The video uses the *Travel Video Editing* kit, with its speakers (names and genders; the grammar of each
   speaker's lines follows their gender): from the playlist, or set for this video alone. Ask once whether this
   trip has the playlist's speakers or others. Create the video through the app if it is not there:
   `node cli.mjs POST /api/playlists/<slug>/videos @<file>.json` with `{"title": "<trip name>", "concept":
   "<the story so far>"}` plus `"kit": "travel-edit"` and `"hosts"` when they differ from the playlist's (later:
   `PUT .../videos/<folder>/setup`, `null` = the playlist's). An edit of own footage never turns into a planned
   video or back: that is a new video. It makes the video folder with `raw/`.
3. Post a checklist of the stages below and keep it current. Each step in the browser is a link with one line on
   what to do there.

## Stages

**1 · Footage.** The creator uploads or copies the originals into the video's `raw/` (folders inside are fine;
never changed) and presses "Read new files". Content Studio makes 540p working copies (HDR tone-mapped), a still
at each scene change, waveforms, the stretches with sound and dark parts, and reads when and where each was
filmed. With speech to text installed (Settings, once per PC; Medium for Urdu and mixed speech) every clip with
sound is transcribed. Check the footage log: missing sound, very dark clips, vertical clips (they get a blurred fill).

**2 · Story.** Ask for the story in the creator's words: what happened, in what order, who spoke, the moments they
love, what the viewer should feel or learn, the length they want, and what they still have to film. Record it on
the video page. Pick the most likely reading of anything vague and say so.

**3 · First cut.** "Make the first cut" (API key) or the hand-off: `edit/brief.md` + `edit/cut-schema.json`,
answered with `edit/cut.json` in its own project thread, then "Check for the cut". Cut like a skilled travel editor:
- hook first (15-30 s, the strongest moments and one line that makes the viewer stay), then the story in scenes
  with clear names, then a short closing (what the trip meant, a question for the comments, the next video);
- cut out dark stretches, long silences, false starts, repeated takes (keep the best), the camera on the ground;
- real moments keep their own sound and are never talked over (talks with locals, a seller, the call to prayer,
  a waterfall); b-roll goes under the voice-over in short varied cuts (2-6 s);
- voice-over lines are short and spoken, by the speaker who lived the moment, alternating when there are several;
- pieces to camera where a speaker should say something directly (the promise after the hook, a turning point,
  the verdict, the close);
- a space with a note wherever the story needs a shot the footage lacks;
- graphics only where a fact helps, with facts only from the story, the footage or sources you can check.
The previous edit is always kept as a version. Report the cut's summary, what was left out and the questions.

**4 · Timeline.** The creator refines it in the editor (link from `node cli.mjs links <playlist> <video>`, the
`edit` page): drag, trim, split (S), reorder, scenes, volume, mute,
fades, speed, fit, versions. Answer questions here; suggest concrete changes by time ("cut 0:42-0:47").

**5 · Graphics and cutouts.** "+ Graphic" at the playhead from an idea, full screen (Video track) or over the
footage (Over track): road trip maps with stops and distances, routes, prices, weather, phrases, do's and don'ts,
ratings, timelines, numbers, reference flashes of a news story, quotes of people met, keywords, map insets. Any
clip or photo can be shown inside a cutout frame (old TV, REC camera, phone, polaroid...). The brand's kept styles
and the video's theme are applied automatically and rotate evenly; never invent a fact, a quote or a source. Without
an API key the editor's hand-off (`edit/graphics-brief.md` -> `edit/graphics.json`) is answered in its own thread.

**6 · Sound and colour.**
- "Clean the noise" per clip (light, medium, strong) for wind, traffic, hum and hiss; "Level the sound" brings
  talk to -16 LUFS and music under it; music goes down under the voices by itself.
- Colour per clip: start from a look (warm, golden hour, cool mountains, vivid, soft film, moody, black and white),
  then exposure, contrast, highlights, shadows, temperature, tint, saturation, fade, vignette; "Auto fix" first for
  phone clips; match clips of one place with "Same for this file" and keep one look per scene or per video.

**7 · Recording.** Each voice-over line and piece to camera is recorded in the editor at its place (the text shows
as a prompter; "Play the video under it" with headphones to time a line to the picture). "Record here" adds a
voice note at the playhead. Takes become real clips and can be cleaned and levelled like the rest.

**8 · Preview, then final.** "Render" lists what is still to do (spaces, lines, pieces to camera, graphics). Make a
540p preview, watch it with the creator, fix, then render the final at 1080p, 2K or 4K from the originals. The final
writes the video, the subtitles (voice-over lines and what is said in clips that keep their sound), the chapters
from the scenes, and the sound alone. Check: no gap left unintended, talk never covered by music, every graphic
readable, facts sourced, standards of the brand guide met. Then the YouTube title, description (with the
chapters) and tags in the brand's style, and the thumbnail idea.

## Rules

- One thread per video; a cut or graphics hand-off for this video goes to its own new thread when the creator
  pastes one.
- Never change or delete the originals in `raw/`; never create files outside the video folder and `tools/`.
- Speakers' grammar follows their gender; place names as they are known.
- Facts, numbers, quotes and sources are never invented; when unsure, leave them out and ask.
- Ask at most one question at a time with a recommended option, and keep working on the recommended one.

## Content Studio from this thread

- The app lives in `tools/content-studio/` of the channel folder. Read and write the folder with the folder
  tools. Run the app's quick steps with its command line in the folder's shell, for example
  `cd "<channel folder>/tools/content-studio" && node cli.mjs GET /api/state`. POST and PUT take a JSON body
  (or `@file.json`). It uses the app's own code and checks, so files come out exactly as the app writes them. It
  refuses steps that only the app can do.
- Some steps need the creator's PC: sample stills, the preview and final renders, recording, the Footage panel and
  the editor. For these, give one link from `node cli.mjs links <playlist> [<video folder>]` and say in one line
  what to do there. The link opens Content Studio on their PC. If it doesn't open, they start Content Studio from
  the desktop shortcut. Ask them to say "done" here, then read the files to see what was saved (`video.json`,
  `plan/`, `preview/`, `voiceover/takes.json`, `edit/edit.json`, `final/`).
- Every choice is asked here, one at a time, as options with one recommended. Never send the creator to a page
  just to pick something the thread can ask.
- If the app shows "Please open a new thread for this ...", that work belongs in its own thread. The creator
  pastes the message in the project chat.
