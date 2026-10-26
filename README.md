# Content Studio

A creator's video studio on their own PC: playlists, video plans, previews, recording, dubs, subtitles,
editing of their own footage, and finals, in one place. It works with Claude: each job (setup, brand,
a playlist, a video) has its own thread in the creator's Claude project, and the skills in `skills/`
read and write the same channel folder the app uses. Everything can also be done in the app alone.

It runs on the PC only (`http://127.0.0.1:4330`) and reads and writes the channel folder the creator
attached to their Claude project. The channel's rules come from that folder: `BRAND-GUIDE.md`
(taxonomy, standards, process, formats), `brand/taxonomy.json` and `brand/profile.json`.

## Install (a new creator)
1. In the Claude project, say "set up my project". The setup thread puts **`Setup.cmd`** in the
   channel folder (a copy of `setup/Setup.cmd`).
2. Double-click it once. It installs Node.js and Python with winget when they are missing (Windows may
   ask for permission), downloads Content Studio into `tools/content-studio/`, installs the packages
   (about 1 GB the first time, mostly the video renderer), puts a shortcut on the desktop and in
   Startup, and opens the app. Each step shows in the window (`setup/install.ps1`).
3. Optional: Settings → an Anthropic API key for one-click plans, cuts and graphics (stored in
   `%USERPROFILE%\.content-studio\settings.json`, never in the channel folder). Without a key the app
   writes a brief, and a project thread does the work.

Then "set up my brand", "make a playlist called ...", "new video in ..." in the project chat; see
`skills/`. To run it by hand instead: Node.js 20+, Python 3.10+ (`pip install reportlab edge-tts`),
then double-click **`Content Studio.cmd`**.

The app finds the channel folder by walking up to `BRAND-GUIDE.md`, or takes the folder that holds
`tools/content-studio` (a channel whose brand is not set up yet). `CS_ROOT` points it anywhere else.

## Updates
Settings → **Check for updates** compares the installed version (`package.json`) with the main branch
of the public releases repo `skillovert/content-studio` (`CS_UPDATE_REPO` for another). "Install"
runs **`Update Content Studio.cmd`**: it closes the app, keeps a backup of it in
`%LOCALAPPDATA%\ContentStudio\backups` (the last three), replaces only the app's own files, tops up
the packages and starts it again. The channel folder is never touched.

To publish a version: raise `version` in `package.json` (and `releaseNotes`, one line the update card
shows), then push the `content-studio/` folder to the main branch of the releases repo.

## Renderer (`engine/`)
The video renderer comes with the app: Remotion and the shared components, fonts, sound effects and
music beds in `engine/` (about 17 MB; its packages about 950 MB once installed). The brand's logo and
presenter photo are files in the channel folder (`brand/logo.png`), copied into `engine/public/` before
each render. A channel folder that has its own `studio/` (the first channel's setup) keeps using it.

## What it writes, and where
| What | File |
|---|---|
| Playlist decisions (app data) | `playlists/<slug>/playlist.json` |
| Playlist page for people and Claude | `playlists/<slug>/PLAYLIST.md` (regenerated on save, same shape as before) |
| Taxonomy card of a video | the `## Taxonomy card` table in `playlists/<slug>/<CODE>-<slug>/README.md` |
| Hashtag per taxonomy value | `brand/taxonomy.json` (only your overrides) |
| A new video | `playlists/<slug>/<CODE>-<slug>/` with `README.md`, `video.json`, `concept/` (your text + PDF) |
| Plans | `plan/plan-vN.json` + `plan/<CODE>-plan-vN.pdf` (every version kept); `plan/brief.md` when handed to Claude |
| Approving a plan | the README card + `## Standards list`, and `youtube/ur-Latn.md` (description draft with sources); starts the preview |
| Preview | `preview/<CODE>-preview-540p-vN.mp4` + `preview/<CODE>-thumb-sample-vN.jpg` + `preview/preview-vN.json` (every version kept) |
| Approving the preview | `video.json` (gate 5 "Owner approval"); recording unlocks |
| Recording (per line) | `voiceover/<lang>/<CODE>-<scene>-<line>.wav`, `camera/<CODE>-<scene>-<line>.webm` (face lines), `voiceover/takes.json` (duration, level, trim, final/done, synthetic voice and speed), `voiceover/<lang>/text.json` (a dub's script), `voiceover/voices.json` (dub voice, speed, pitch per language), `voiceover/line-voice.json` (a line's own speaker or speed) |
| Your material | `media/<name>` (clips, audio, photos named by what they show), `media/media.json` (kind, length), `media/fx/<name>.<style>.wav` (audio in its style's sound) |
| Footage (kit videos) | `footage/<slot>.<ext>` (e.g. `F07-1.mp4`, your clip or a Pexels one), `footage/credits.json` (source, author, page per slot) |
| Cutout samples | `brand/reference/cutouts/<category>-<style>.jpg` (Brand page) |
| Finish (voice tracks) | `voiceover/timing.json` (each line re-timed to its longest language), `audio/<CODE>.<lang>.wav` (full-length voice, 48 kHz mono), `subtitles/<CODE>.<lang>.srt`, `preview/<CODE>-timed-540p.<lang>.mp4` (check video with that voice), `final/<CODE>-<1080|1440|2160>p.<lang>.mp4` |
| Deleted playlists and videos | moved to `archive/…-removed-<date>`, never erased |

## Phases
| # | Phase | Status |
|---|---|---|
| 1 | Foundation and playlists: suggest from Topics, playlist decisions, video list (open, rename, edit card, delete) | **done** |
| 2 | New video (graphics-driven): concept text/PDF → plan (Claude API, or a hand-off brief) → plan PDF → approve or request changes | **done** |
| 3 | Plan → 540p preview + sample thumbnail (scene library in N01's look), approve or request changes | **done** |
| 4 | Record and dub: recording studio in the browser (mic, camera for face lines in their slot, teleprompter over the approved preview, retakes, silent/length checks), dubs recorded or made with a synthetic voice (edge-tts through `studio/tools/voice/tts.py`), voice per language and per line, "Is your recording final?" auto dub fitted to the creator's take (-0.5 s to +1 s), Mark done per dub, translation with Claude | **done** |
| 5 | Finish: re-time every line to its longest language, full-length voice track and SRT per language, 540p check video with the voice (`server/finish.mjs`) | **done** |
| 6 | Finals: camera takes in their face and studio slots (converted once to `camera/<CODE>-<key>.mp4`; a face line without a take shows its graphic), 1080p/2K/4K render per language to `final/<CODE>-<size>p.<lang>.mp4`, chapters in `youtube/*.md` re-timed to the voices, footage credits added. Later: looks (colour) per take, Urdu-script subtitles | **done** (looks with the editor's colour tools) |
| 7 | Derived content: shorts/reels, posts, carousels, articles, per-platform text | |

Videos are made with the creator's face on camera or graphics only (`video.json` `face`; the brand's `face` can fix it). With the face, the creator picks how much to appear (`faceAmount`: little, balanced, lots) and how long per moment (`faceSeconds`: 3, 6, 9, own number, or the whole line). Each plan line has a layout (`voice`, `face-full`, `face-left`, `face-right`, `face-split`, `face-circle`, `face-corner`, `face-frame`, `face-phone`) and `faceFor` seconds; the preview shows a marked slot that leaves with a rotating exit (iris, push, shrink, wipe, glitch) so the visuals take the full screen while she reads the rest (`scenes/Faces.tsx`). The recording studio shows the live camera in that slot with an on-camera countdown. Later: auto-publishing.

## Code
- `server/` Node (one package, the Anthropic SDK): `taxonomy.mjs` (A1/A2 as data, standards per card, hashtags),
  `playlists.mjs`, `videos.mjs` (README parsing, the 8 gates), `index.mjs` (local HTTP API + static files),
  `planner.mjs` + `plan-schema.mjs` (concept → plan with Claude: web search + fetch, strict `submit_plan` tool,
  refusal fallback; or the hand-off brief), `settings.mjs` (API key, outside the channel folder).
- `scenes/` the scene library (Remotion, TSX): one view per graphic type of a plan line (title, presenter, clippings,
  quote, timeline, map, bars, number, stamps, cards, terminal, flow, gauge, table, versions, comment, checklist, help,
  outro), the News chrome (News label + lead Cause top-left, dot + playlist name top-right) and the thumbnail.
  It reuses the renderer's components (`engine/src`, or a channel's own `studio/src`) through the `@studio/` alias.
- `server/brand.mjs` the creator's brand profile (`brand/profile.json` in the channel folder; the Brand page edits it):
  name, presenter, logo, colours, fonts, languages, sound, output, captions (off by default), research basis.
  `scenes/brand.ts` lays it over the studio's look before rendering, and new playlists take their defaults from it,
  so another creator's videos look like theirs without code changes. A brand without a logo or photo gets a text
  logo and initials, never someone else's.
- `server/themes.mjs` themes over the brand colours: dark newsroom, light clean, newspaper, old TV, documentary
  (palette, texture, fonts, screen effect, cuts; drawn by `scenes/themefx.tsx`). A brand stores a full, versioned
  copy in `brand/themes/<id>/v<N>.json` the first time a theme is used, and each video locks the id + version in
  its `video.json`, so later theme changes only reach new videos. `server/samples.mjs` draws reference stills of
  every theme in the brand's colours into `brand/reference/themes/<id>/v<N>/` (Brand page). Theme fonts (OFL) ship
  in `assets/fonts/` and are copied into `studio/public/fonts/themes/` before a render.
- `server/director.mjs` the visual director, always on: it reads the timed script and the plan's sources and lays
  short inserts over the plan's graphics (reference flash of a source's clipping, map inset for a named country or
  region, number pop for a figure, date stamp, footage-style screen recording of a source page). One per line at most,
  never over the title, presenter, comment or help beats, and only facts already in the plan (`scenes/Inserts.tsx`).
- `render/render.mjs` bundles `scenes/` with the studio's own install (`studio/node_modules`, `studio/public`) and
  renders the preview (960x540) and thumbnail; `server/preview.mjs` runs it and keeps the versions. The first preview
  runs `npm install` in `studio/` if it was never installed.
- `tools/plan_pdf.py` the plan PDF (reportlab, Geist fonts from `studio/public/fonts/ttf`).
- `public/` the app (plain HTML/CSS/JS, brand fonts and colours from the channel folder).
- `data/taxonomy.json` is the starting taxonomy and the shape of a channel's own `brand/taxonomy.json` (order, fields
  with values and rules, standards, formats), which the brand-setup skill writes from the channel's taxonomy
  and standards; the channel's file wins, and its hashtag edits are kept in it.
- `server/update.mjs`, `setup/` install and updates (above). `skills/` the Claude skills that drive the app from chat.
- `cli.mjs` the app's quick steps from the command line, for project threads (same code and files, no running app
  needed): `node cli.mjs GET /api/state`, `node cli.mjs POST /api/playlists '{...}'`, `node cli.mjs links <playlist> <video>`.
  Renders, recording and editing stay in the app; the thread gives the creator the link.
- Tests: `npm test`.

## Cutout styles

`server/cutouts.mjs` lists every category of insert and its pre-built styles: reference flashes (clipping slam, browser card, torn paper, clipping stack, glitch headline), people and quotes (portrait, pull quote, social post, lower third, split card), source capture (highlighter, magnifier, hand circle, redacted reveal), keywords (marker, underline, boxed, typewriter, glitch), maps (tactical, paper atlas, flat, night satellite, newsprint), clip players (REC camera, old TV, phone, film projector, newsroom monitor), audio players (old phone line, vintage radio, clean waveform, voicemail, cassette) and photos (polaroid, framed, full-screen pan, evidence board). The brand keeps all or some per category (`brand/profile.json` `cutouts`); the visual director (`server/director.mjs`) rotates through the kept styles in a fixed order, and `scenes/Inserts.tsx` draws them in the brand's tuned colours and the video's theme. Each category takes the full screen for its moment (the scene cuts away to the theme's backdrop, the insert is centred and enlarged, then it cuts back) unless the brand sets it to sit over the scene (`cutoutPlace: {<category>: "over"}`); date stamps always sit over the scene. The creator's own clips, audio and photos (`server/media.mjs`) are matched to lines by file name; audio clips get a pause after their line and are filtered to their style's sound in JS (the renderer's ffmpeg only decodes).

## Video kits: Remote Documentary (Travel and Places)

A kit is a ready-made flow a playlist picks (`playlist.json` `kit`; `server/kits.mjs`). `news` is the channel's
News flow. `travel-doc` is a full guide to one destination made from home: about 80% licensed footage, maps and
travel graphics with the hosts' voices, about 20% the hosts in a studio between chapters, 12-16, 18-24 or 25-30
minutes (`video.json` `length`).
- **Per video:** the playlist's kit, format and hosts are defaults. A video can set its own in `video.json`
  (`kit`, `format`, `hosts`; only what differs is stored) when it is created or on its page until the plan is
  approved (`PUT /api/playlists/<slug>/videos/<folder>/setup`, `null` = back to the playlist's;
  `forVideo` in `server/kits.mjs`). An edit of own footage and a planned video never turn into each other.
- **Hosts:** 1 to 3, each a name and a gender (`playlist.json` `hosts`). Every plan line has a `speaker` (a host,
  or `all`), lines alternate between hosts, and the script's grammar follows each speaker's gender.
- **Plan:** the kit's chapters (hook montage, studio intro, where it is, weather, sights with fees, culture and
  manners, safety and phrases, where to stay, budget, getting there and around, itinerary, history, facts, verdict,
  CTAs), the `studio` layout, and travel graphics: `footage` (1-3 shots with stock-search words), `map` (places
  with "lat, lon"), `route`, `roadtrip` (a drive between stops on a drawn, not real, road: stops with km and time,
  key areas beside it as "Name | lat, lon | kind | note", the road name; styles atlas, nav, journal, transit in
  `scenes/roadtrip.tsx`), `weather`, `tiers`, `phrases`, `dosdonts`, `rating` (`plan-schema.mjs`, checked by
  `richnessProblems`: 8+ graphic kinds, footage on about half the lines, search words on every shot).
- **Footage:** every shot gets a slot (`F07-1`); the video page's Footage panel uploads a clip or photo per slot or
  fills the empty ones from Pexels with the creator's free key (Settings) (`server/footage.mjs`). Empty slots
  render as marked placeholders with their search words (`scenes/travel.tsx`).
- **Travel graphic styles:** 9 more cutout categories on the Brand page (place labels, destination maps, routes, road trips,
  weather, prices and budgets, phrases, manners and scams, verdicts; 35 styles), kept per brand and rotated per
  video like the other cutouts (`CU.styleGraphics`). The sample stills come from `assets/sample-travel.json`.
- **Recording:** each line shows who says it; a host can record only their own and the shared lines. Each host
  gets a dub voice of their gender per language (`voiceover/voices.json` `<lang>.hosts`), then a line's own choice.
- A kit playlist counts as a defined flow, and a kit video needs only its destination to start.

## Video kits: Travel Video Editing (from your own footage)

A playlist with this kit edits what the creators recorded on a trip: 1 to 6 speakers (names and genders), the
originals in `raw/` (uploaded or copied in, folders inside are fine), never changed. Built in steps (plan:
1 final render, 2 assets and clip log, 3 timeline, 4 story to edit, 5 graphics on the timeline, 6 sound and
colour, 7 record, preview, final and the `travel-video-editing` skill).

- **Assets (step 2, `server/assets.mjs`):** "Read new files" makes, per original, a 540p working copy (H.264 with
  a keyframe a second; HDR phone footage tone-mapped), a still at every scene change and at least every 8 s, the
  waveform and the stretches with sound and dark parts, plus what the file says about itself (length, size,
  frame rate, when and where it was filmed). All in `edit/` (`assets.json`, `proxy/`, `stills/`, `wave/`).
  Uploads stream straight to disk, so clips of several GB are fine.
- **Timeline (step 3, `public/edit.js`, `server/edit.mjs`):** "Open the editor" on the video page. Footage bin on
  the left (add to a track with a button or drag it onto one), the player (plays the working copies; photos push
  in slowly; vertical phone clips fill with a blur), the selected clip's settings on the right (volume up to 200%,
  mute, fades, speed, fit, scene, speaker, note), and four tracks: Video (one clip after another), Over, Voice,
  Music. Drag to move, drag the ends to trim, S splits, Delete removes, I / O set start / end at the playhead,
  "+ Space for a clip" leaves a marked gap, "+ Scene" names a scene (Hook, Gilgit to Karimabad...). Saved as you
  work to `edit/edit.json`; "Save version" keeps a named copy in `edit/versions/`, and any version can be brought
  back. Undo and redo with Ctrl+Z / Ctrl+Shift+Z.
- **Story to edit (step 4, `server/speech.mjs`, `server/cut.mjs`, `render/whisper.mjs`):** speech to text runs
  offline with whisper.cpp, installed once per PC from Settings into `~/.content-studio/whisper/` (Small, about
  470 MB, or Medium, about 1.5 GB and better with Urdu and mixed speech). After that, every clip and voice note
  with sound is listened to as it is read in; the words go to `edit/transcripts/<id>.json`. On the video page the
  creators write the story (what happened, who spoke, what they want), then "Make the first cut": Claude reads
  the clip log, the stills and the words and writes `edit/cut.json` (scenes; clips with their in and out and
  whether their own sound plays, goes under, or is muted; photos; graphics; voice-over lines per speaker; spaces
  for pieces to camera), which becomes the timeline (the edit before it is kept as a version). With an API key in
  Settings this runs here; without one the studio writes `edit/brief.md` and `edit/cut-schema.json` and asks for
  a project thread to write the cut, then "Check for the cut" brings it in.
- **Graphics on the timeline (step 5, `server/pieces.mjs`, `scenes/Piece.tsx`):** "+ Graphic" in the editor adds
  a graphic at the playhead from an idea ("the drive from Gilgit to Karimabad with the stops", "flash the Dawn
  story", "Hina's words at the tea stall"): full screen on the Video track, or over the footage on the Over track.
  Claude writes what it shows (a road trip map, route, prices, a reference flash, a quote, a keyword, a number...)
  with facts from the story and footage; API first, else `edit/graphics-brief.md` for a project thread and
  "Check for graphics". Any video or photo can be shown inside a cutout frame ("Show as": an old TV, a REC
  camera, a polaroid...). Everything takes the brand's kept styles (rotating, and stored on the clip so it stays)
  and the video's theme, and is rendered on its own to `edit/pieces/` (540p; a cutout over the footage as a
  see-through WebM, and the picture steps back behind it as in the final). Only changed graphics are made again.
- **Sound and colour (step 6, `server/sound.mjs`, `server/dsp.mjs`, `public/mix.js`):** per clip, "Clean the
  noise" (light, medium, strong) learns the noise from the clip's quietest moments (wind, traffic, hum, hiss) and
  takes it out, with the rumble under 80 Hz; done once per file in `edit/clean/` and played in its place. Music
  clips go down under the voices (voice-over, and clips that keep their own sound) with soft ramps, a lot or a
  little. "Level the sound" measures every clip with sound (EBU R128) and sets talk to -16 LUFS and music under
  it, as one undo step. Colour per clip: a look to start from (warm, golden hour, cool mountains, vivid, soft
  film, moody, black and white), exposure, contrast, highlights, shadows, temperature, tint, saturation, fade and
  vignette, "Auto fix" from a still, copy and paste, the same for every clip of a file or the whole video. The
  grade is drawn with an SVG colour matrix, tone curve and CSS filters (`public/mix.js`), which the final shares.
- **Record and render (step 7, `server/editrender.mjs`, `scenes/Edit.tsx`):** select a voice-over line or a piece
  to camera and press "Record" (the text shows as a prompter; tick "Play the video under it" to time a line to the
  picture, with headphones), or "Record here" for a voice note at the playhead. Takes go to `raw/recorded/`, are
  read like any other file and take the line's or space's place. "Render" lists what is still to do, makes a
  540p preview from the working copies (`preview/<CODE>-edit-540p-vN.mp4`), and renders the final at 1080p, 2K
  or 4K from full-size copies of the originals (`edit/master/`, HDR tone-mapped): `final/<CODE>-<size>p.mp4`,
  `final/<CODE>.<lang>.srt` (voice-over lines and what is said in clips that keep their sound),
  `final/<CODE>-chapters.txt` (the scenes) and `final/<CODE>-sound.m4a` (the mix alone).
