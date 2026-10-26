---
name: youtube-video
description: Make one YouTube video end to end in its own project thread, with or without the creator on camera: idea or trend, research, plan, 540p preview, recording, looks, final render, derivatives. Use when the creator says "new video in <playlist>" for a News-kit playlist.
---

# YouTube video (one thread = one video)

The thread is the agent. It guides the creator step by step with short questions, option cards and links, and
never skips a gate; the creator never has to say what comes next. Works for any channel (journalist, travel
vlogger, institute...). Everything channel-specific comes from the channel folder, never from this skill.

There is one flow. The only difference is **face or no face**:
- **With my face:** the creator appears on camera for short moments in varied placements and speaks the whole
  script; after each moment the face leaves with a transition and the visuals take the full screen while the
  creator reads the rest off camera (nobody has to remember a whole line looking into the lens).
- **Graphics only:** graphics carry the whole video (the presenter appears only as their photo or badge); the
  creator records voice only.
Every other step is the same. Steps marked *(face)* apply only with the face.

## Before anything

1. Read the channel folder's `CLAUDE.md`, `BRAND-GUIDE.md` (taxonomy, standards, required process, formats, look,
   sound, **narrative principles**), `brand/profile.json`, `brand/themes/`, the playlist's `PLAYLIST.md`, and
   project memory. No brand guide: ask the creator to say "set up my brand" in the project chat first. No
   narrative principles yet: ask once (see Research) and record them in the guide. A playlist with the Remote
   Documentary kit uses `remote-documentary`, and one with Travel Video Editing uses `travel-video-editing`.
2. **This video's setup.** The playlist gives the defaults (kit, format, hosts). Ask once, as options with the
   playlist's recommended: does this video follow them, or is it different (another format with a defined flow,
   another kit, other or fewer hosts)? Send only what differs when creating it (`"kit"`, `"format"`, `"hosts":
   [{"name", "gender"}]`), or change it later with `PUT .../videos/<folder>/setup` (`null` puts one back to the
   playlist's) until the plan is approved. `GET .../videos/<folder>` returns the result as `setup`. The video's
   own kit decides the skill: News → `youtube-video`, Remote Documentary → `remote-documentary`, Travel Video
   Editing → `travel-video-editing`; if it is another kit than this skill's, follow that skill instead.
3. Create the video through the app: `node cli.mjs POST /api/playlists/<slug>/videos @<file>.json` with
   `{"title", "concept", "links", "face", "faceAmount", "faceSeconds"}` plus any own `kit`, `format`, `hosts` (after stage 1). It gives the code and
   the folder. `POST .../plan` writes the brief and schema (`plan/brief.md`, `plan/plan-schema.json`; with feedback
   `{"feedback"}` for a new version). Write the plan yourself to `plan/plan-vN.json` following them, then `POST .../plan/import` (it adds timings and the plan PDF) and, once the creator approves,
   `POST .../plan/approve`. Then send the creator the video page link to press "Make the preview".
4. Only formats marked *defined* in the guide can be made. Playlist names and card values come only from the
   taxonomy. Work in this thread only; another video's plan belongs in its own thread.
5. Post a checklist of the stages below and keep it current. Every step that needs the browser (recording, looks,
   timeline) is a link the creator opens, works in, and comes back from; say what to do there in one line.

## Stages and gates

**1 · Idea and face.** Offer two options:
- *I have an idea*: take it (a line, notes, links, a PDF).
- *Find me one*: scan what is trending now in the channel's country (default from the guide) within a chosen
  topic from the taxonomy; show 5-8 trends with why each is rising and its date.
Then suggest 3-5 **angles** that fit the channel's vision and causes. The creator picks one or more; with more than
one, recommend one angle per video (the default), or combining when they are really one story.
Ask **"With your face on camera, or graphics only?"** unless the brand or playlist fixes it. With the face, ask
before planning, so the visuals are built around it:
- **How much to show you:** *a little* (about 15% of lines, the hook and the close), *balanced* (about 30%, the
  default) or *a lot* (about 55%).
- **How long per moment:** 3, 6 or 9 seconds, the creator's own number, or the whole line.
Pick the most likely reading of anything vague and say so.

**2 · Card and standards (gates 0-1).** Fill the taxonomy card (playlist defaults first) and list every standard
that applies. Recorded in the piece's `README.md`.

**3 · Research (gate 2).** Ask once per video, unless the guide fixes it:
*"Research on the channel's own narrative, or mainstream (West-first) framing?"*
- **Channel narrative** (e.g. a Muslim / Pakistani perspective): actively search sources from the creator's
  region, language, faith tradition and scholarship, not only Western outlets. Present the channel's view openly as
  its view, with its sources; state where mainstream sources differ and cite them too.
- **Mainstream**: lead with widely cited international sources; still note credible regional sources.
Always: latest facts where it matters, dated "as of"; primary documents first; two sources per key claim; quotes
verbatim with speaker, outlet and date; numbers with source and date; official fix/help steps where they exist;
an honest News label; never invent a fact, quote, number or source; no fake balance and no hidden advocacy.

**4 · Plan, theme and stamp, then approval.** In the format's story shape (hook, intro, story beats, mid CTA as a
question for comments, help or action steps, end CTA). It contains:
- title (no hype), YouTube description (label, as-of date, chapters, sources primary first, illustration note,
  disclosure lines), tags, thumbnail idea and a **suggested** factual stamp (or none when none fits);
- **thumbnail text that fits**: a short title (a few words, never the video title), and one subtitle line per
  language the video is published in, in that language; each language gets its own thumbnail with its corner
  language label. The creator's mark on the thumbnail is the plain name label only (e.g. "AQSA JAMIL");
- the script line by line in the channel's voice language, each line with:
  - *(face)* **layout**: `face-full`, `face-left` / `face-right` (creator on one side, the visual shrinks to the
    other), `face-split` (half and half), `face-circle` (round badge), `face-corner` (small box), `face-frame`
    (inside an old TV or monitor), `face-phone` (inside a phone), or `voice` (visuals only). Spread face moments as
    the chosen amount says, never the same placement twice in a row, and give each its seconds on camera;
  - **visual**: the graphic or insert for that moment, from the cutout styles below, with its source;
- SRTs per subtitle language of the playlist, as separate files, never burnt into the video;
- monetization lines where they apply (sponsor slot with clear disclosure, membership or channel CTA);
- the standards check so far and open questions.
**Visuals are enriched by default:** every line has a visual, at least six kinds of factual graphic across the
video, and evidence moments show evidence (map, numbers, timeline, clippings, quotes), all cited. Maps and animated
graphics are a strength, but use whatever shows the fact best. On-screen words stay few (keywords and numbers) so
the voice can be dubbed into other languages.
With the plan, ask two short questions (skip one the brand already fixes):
- **Theme:** keep the brand's default (name it) or switch for this video (dark, light, newspaper, old TV,
  documentary, or the brand's own); show the stored reference stills.
- **Thumbnail stamp:** the suggested one, your own words, or no stamp.
Show it as a document and ask: approve, or what to change. Each change is a new plan version. On approval, lock the
theme id and version and the stamp in the video's state.

**5 · Creator's own material.** Ask for any clips, audio, photos, screenshots or documents, **named by what they
show with words from the line they belong to** (e.g. `karachi-flood-street.mp4`, `minister-phone-call.m4a`,
`wiz-research-team.jpg`). Match each to the line it fits by name and content (never a face moment); list where each
will go and ask only about the ones that fit nowhere (rename them, or set the line's media). How each plays:
- **clip**: in the brand's clip-player style (REC camera, old TV, phone, film projector, newsroom monitor), muted
  under the voice as b-roll;
- **audio** (a call, a statement): after its line, the voice pauses for it, shown in the brand's audio-player style
  with that style's sound (old phone line, vintage radio, clean, voicemail, cassette);
- **photo**: in the brand's photo style (polaroid, framed, full-screen pan, evidence board); a photo named after a
  quoted person becomes their portrait in the quote card.
Material goes in before the 540p preview, since audio clips change the timing.

**6 · 540p preview, then approval (gate 5).** Build the whole video at 540p plus a sample thumbnail in the locked
theme and the brand's look: graphics, the creator's clips and images, the format's music bed and SFX, the chrome
and labels, comment CTAs. The brand colours are tuned automatically to stay readable on the locked theme.
*(face)* Every face moment is a **marked empty slot** in its placement showing the line to say and its seconds;
when the moment ends the face leaves with a transition that varies through the video (iris, push, shrink into the
badge, brand-colour wipe, glitch) and the visuals take the full screen. No captions are rendered in the video;
the script runs beside the preview. Then the **visual director** pass,
always on, whatever the plan said: reference flashes when a line leans on a source, a map inset when a place is
named, a number pop for a figure, a date stamp, a footage-style insert to break a long beat, using only facts in
the plan, each in the brand's kept style for its category (see Cutout styles). Compare against the theme's
reference stills. Ask: approve, or what to change (changes go back into a
new plan version). Never make a final before this approval.

**7 · Recording studio (browser link).** One link to a recording page for this video: mic on (and camera with the
face), the script line by line as a teleprompter, the preview playing around each line so the timing is felt.
One button (or R) starts and stops; recording again overwrites the take. Planned time vs the take's real time is
shown per line. *(face)* The live camera sits in the line's slot with a countdown; when it ends the cue says
"off camera, read the rest". Then the dubs:
- **Voices:** per dub language a synthetic voice, speed and pitch for this video, with a preview; any line can
  have its own speaker (a quote, a second person in a conversation) or its own speed and pitch.
- **Auto dub:** one button asks *"Is your recording final?"*, marks the takes final, translates missing dub lines
  (or the creator types them), and makes every dub line **fitted** to the creator's take: speed adjusted until
  each dub is within -0.5 s to +1 s of the creator's line, so every language cuts the scenes at the same moments.
  The creator may also record a dub line themselves.
- **Done marks:** an auto dub is not done until the creator listens and marks it done (after changing speed or
  voice and making it again if needed); a dub whose text changed shows as stale.
- **Progress:** each line shows two states (creator voice recorded / final, dubs done in every language) and the
  page shows total progress. Check every take exists, is not silent and is in sync.

**8 · Looks per face clip (browser link)** *(face)*. For each face clip: colour (exposure, contrast, temperature,
tint, saturation, or a preset look), vignette, glitch, scan lines, and the frame style (full, side, old TV, phone,
monitor). Offer "apply to all" and a still per clip. Defaults come from the locked theme.

**9 · Final track (browser link).** Show the finished timeline. Music, script, order, theme and timings are locked.
The creator may only add more graphics, clips or images at a moment, picked from the cutout styles. Then show a
low-res preview of the result for a last approval.

**10 · Final render (gate 6, on the owner's PC).** Ask: 1080p, 2K or 4K (as the brand offers). Render with progress
shown; voice up, music and SFX down (about 0.6); one full-length voice track per language, each line placed at
the same moment in every language (fitting keeps them within a second), scene cuts and SRTs re-timed to the
recorded lines; a final thumbnail per language; dub versions. Run the standards check (gate 4) and record it in
`README.md`; any gap blocks publishing.

**11 · Deliver.** One short message: what was made and where (`playlists/<slug>/NNN-<slug>/` with `video/`,
`thumbnail/`, `youtube/<lang>.md`, `subtitles/`, `voiceover/`, `media/`, and `camera/` with the face), and anything
still owed. Uploading stays with the owner unless they decide otherwise.

**12 · Derived content.** Offer options as a card: shorts (vertical cuts of strong lines), community post, posts
for other platforms, article for the site (when the channel has one), thumbnail variants for A/B tests. Make the
ones picked from the approved plan and sources, with the same labels, theme and standards.

## Cutout styles (named visual moments)

Every insert belongs to a category, and each category has several pre-built styles. The brand keeps all or some
per category (`brand/profile.json` `cutouts`, picked from sample stills); every video rotates through the kept
styles in a fixed order, so videos stay consistent and never repeat one look back to back. All styles are drawn in
the brand's colours (tuned per theme) and the video's theme. Defaults:
- **Reference flashes** (a line leans on a source): clipping slam with camera flash and highlighter sweep, browser
  card with the URL typed, torn paper taped on, clipping stack of several outlets, glitch headline.
- **People and quotes** (a line names someone the plan quotes): portrait quote (photo or initials), pull quote,
  social-post card, documentary lower third, split card; the quote verbatim with its key words highlighted.
- **Source capture and text highlight** (a source seen again): document page with the key line marked by a
  highlighter, a magnifier, a hand-drawn circle and arrow, or a redacted page revealing the line.
- **Keyword highlights** (a term the line explains): marker, underline, box, typewriter, glitch.
- **Maps** (a line names a place): tactical (dark, pins, activity), paper atlas, flat, night satellite, newsprint.
  The plan decides which places; the style decides the look.
- **Clip players**: REC camera, old TV, phone, film projector, newsroom monitor (source pages and the creator's clips).
- **Audio players**: old phone line, vintage radio, clean waveform, voicemail, cassette, each with its own sound.
- **Photos**: polaroid, framed, full-screen pan, evidence board.
- **Number pop** and **date stamp** keep one look each.
New styles a channel needs (documentary, explainer, news) are added to the library once and then picked by brand.
Every insert is factual and cited; illustrations are disclosed in the video and the description.

## Rules

- Guided and easy: one question or one option card at a time; ask only at the gates; between them act and report.
- Each approval covers its stage once; a new plan version clears later approvals (the locked theme stays unless the
  creator changes it); keep every version (plan-vN, preview-vN).
- New owner decisions go into BRAND-GUIDE (right Part + decision log) or the project's decisions thread.
- Files only in the piece folder; never stray files in the channel folder.
- Use the channel's video engine when it has one (renderer, scene library, recording studio under `tools/`, e.g.
  Content Studio); heavy finals run on the owner's PC through a device session.

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
