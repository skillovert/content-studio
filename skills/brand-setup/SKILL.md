---
name: brand-setup
description: Set up or update a creator's brand once, in its own thread, by asking questions with options: identity, vision, narrative, taxonomy, standards, look, themes, cutout styles, sound, formats and the profile Content Studio reads. Use when the creator says "set up my brand" or changes anything brand-wide.
---

# Brand setup

Use this when a project is made for a new creator (after "set up my project"), when anything brand-wide changes,
or when a video skill finds no brand guide. It replaces `channel-setup`. The brand has its own thread in the
project. Every later brand change comes back to it, and the creator answers questions here: everything is asked
in chat as options, and the files and Content Studio are set up behind the scenes.

Goal: decide once everything that affects **all** playlists, videos and tools, so each video thread can auto-set
almost everything and only asks the creator what truly changes per video. Works for any creator (journalist,
travel vlogger, institute...).

## Where it lives (in the folder attached to the project)

| File | Holds |
|---|---|
| `CLAUDE.md` | Short memory for every thread: who the creator is, folder map, numbered owner rules, status. |
| `BRAND-GUIDE.md` | Human source of truth: **A Standards** (A1 taxonomy, A2 standards, A3 required process) · **B Brand and vision** · **C Formats** (one flow each) · **D Playlists** · **E Open questions** · **F Decision log**. |
| `brand/profile.json` | Machine-readable profile the tools read to personalise themselves (see below). Kept in step with the guide. |
| `brand/taxonomy.json` | The taxonomy, standards and formats as data for Content Studio (see Taxonomy for the app). |
| `brand/themes/<id>/v<N>.json` | Full stored copy of every theme version the brand uses (see Themes). |
| `brand/` | Logo files (`brand/logo.png`, `brand/logo-on-color.png`), presenter photo or cutout (`brand/presenter.png`), fonts, `reference/` approved screenshots (incl. `reference/themes/<id>/v<N>/` and `reference/cutouts/`), `organize/` taxonomy + standards sources. |
| `audio/` | Music beds and SFX the brand owns or licenses. |
| `playlists/<slug>/` | `PLAYLIST.md` + `playlist.json` (defaults) and one folder per video. |
| `tools/content-studio/` | The app, installed and updated by `project-setup`. The creator never edits it. |

Project memory keeps one file per subject: where decisions live, the tools, creator working preferences.

## What brand setup decides

Ask only for what the creator's files and public channel do not already show; read every file and link given.
Propose sensible defaults and let the creator accept or change them, one question at a time, as options with one
recommended. Files the creator has (logo, photo, a taxonomy or standards PDF, brand book) are attached in this
thread or put in the channel folder: copy them to `brand/` (sources to `brand/organize/`).

1. **Identity:** channel name (vs handle), role/title, niche or category, languages (voice, subtitles, dubs),
   site and socials, how the name is written and never written.
2. **Vision and business:** what the channel stands for, audience, and monetization paths (AdSense, sponsors and
   paid collaborations, integrated ads, affiliates, memberships, own products), with disclosure rules.
3. **Narrative principles and research basis:** whose perspective the channel speaks from (e.g. Muslim,
   Pakistani), which source traditions to seek beyond Western outlets, how the channel's view and other views are
   shown (openly, both cited), and the default per video (own narrative / mainstream / ask each time).
4. **Taxonomy (A1):** fields and allowed values (e.g. Topic, Section, Format, Label, Region, Industry, Audience,
   Breakout, Cause), copied exactly from the source or proposed. Playlist names always come from it.
5. **Standards (A2) and required process (A3):** which standards apply to what, and the gates every video passes
   (card, standards list, research, build, standards check, approval of a preview, final, corrections).
6. **Look:** logo use, colours (with hex), fonts, presenter photo/cutout rules (no photo = initials, never someone
   else's), on-screen chrome (where labels, playlist name and creator badge sit), thumbnail layout (key-visual box
   colour, stamp policy: ask per video or never; stamps are factual, never hype; short title and one subtitle line
   per language, one thumbnail per language with its corner label; the creator mark is the plain name label only),
   the **cutout styles** (show a sample still of every pre-built style per category and let the creator keep all
   or some: reference flashes, people and quotes, source capture and text highlight, keywords, maps, clip players,
   audio players with their sound, photos; videos rotate through the kept ones), words on screen (keywords and
   numbers only so dubs fit; **no captions burnt into videos**, subtitles ship as SRT files), face placements for
   creator videos (full, left, right, split, circle, corner box, old TV / monitor frame, phone) with varied exits to
   full-screen visuals, and default looks (colour, vignette, glitch, scan lines).
7. **Theme and face:** the default theme (see Themes), whether playlists or single videos may switch it, and
   whether videos show the creator on camera (always, never, or ask per video); with the face, a default for how
   much (a little, balanced, a lot) and how long per moment (3, 6, 9 s, own number or the whole line).
   Dub voices: a synthetic voice, speed and pitch per dub language as the default for new videos (each video can
   change them), and that dubs are fitted to the creator's take (-0.5 s to +1 s).
8. **Sound:** default bed per format, allowed beds, SFX set, levels (bed under voice, fx with voice ~0.6).
9. **Formats (C):** only the formats the creator approves are *defined*, each with research, story shape,
   script and CTA rules, look, sound and output. Others are "not yet defined" and cannot be produced.
10. **Output:** preview size (e.g. 540p), final sizes offered (1080p, 2K, 4K), fps, file names, subtitle and dub
    languages, YouTube text template (title rules, description with sources, disclosures, chapters, tags).
11. **Playlists (D):** for each, the name (from the taxonomy), purpose, format, code prefix, taxonomy defaults,
    default bed, theme, languages, and anything that differs from the brand defaults.

## Taxonomy for the app (`brand/taxonomy.json`)

Content Studio reads the channel's taxonomy from `brand/taxonomy.json`, in the same shape as the starting file
`tools/content-studio/data/taxonomy.json` (read it first and copy its structure):
- `order` and `fields`: the nine card fields `topic, section, format, label, region, industry, audience,
  breakout, cause`, each with a `label` (the creator's own word may differ, e.g. "Destination type"), a `rule`
  (`min1`, `one`, `many`, `optional`, `optional-many`) and `values` (`{"value", "hashtag"}`). Map the creator's
  own fields onto these nine. A field the channel doesn't use gets `rule: "optional"` and no values.
- `standards`: `{"name", "rule", "appliesTo"}` where `appliesTo` is `{"all": true}` or field → values.
- `formats`: per Format value, `{"flow": "defined" | "not yet defined", "ref": "BRAND-GUIDE C<n>"}`. Only a
  defined format can make News-kit videos. The Remote Documentary and Travel Video Editing kits bring their own
  flow.
Taken from the creator's taxonomy and standards PDF when they have one, copied exactly. Otherwise proposed from
the channel's niche and approved. Write BRAND-GUIDE A1/A2 and this file together, and keep them in step on every
change. Check it with `node cli.mjs GET /api/state` (the taxonomy comes back with `own: true`).

## Themes

A theme is a named preset laid over the brand colours: canvas palette, background texture, font pairing, screen
effect and its strength, transitions, SFX flavour, insert styling and thumbnail treatment. The brand colours are
tuned per theme automatically (accent and highlight kept readable, at least 3:1, on that theme's canvas and cards),
so one brand works on dark and light themes; show the tuned colours on each theme sample. Starter themes:
- **Dark newsroom:** black canvas, faint moving grid, brand glow, vignette, glitch cuts.
- **Light clean:** off-white canvas, white cards, soft shadows, quiet cuts.
- **Newspaper:** cream paper, black ink, serif headlines, column rules, halftone dots, page-turn cuts.
- **Old TV:** curved screen, scan lines, colour fringing, rounded vignette, rolling bar, channel-switch cuts.
- **Documentary:** warm dark canvas, film grain, letterbox bars, warm grade, slow dissolves.
- Later or on request: blueprint (blue grid, tech lines), others the creator names (stored the same way).

Ask the creator to pick the default from **sample stills** of each theme (title card, map, clipping, number,
thumbnail) rendered in their own colours. The stills are made on their PC: give the Brand page link (`node cli.mjs
links`) and ask them to press "Make sample stills" and say "done". Then look at the stills in
`brand/reference/themes/` yourself and ask the choice here, with the stills attached. Cutout styles work the
same way (`brand/reference/cutouts/`). Then:
- Store the **whole theme**, never just its name: `brand/themes/<id>/v<N>.json` with every value, plus
  the approved stills in `brand/reference/themes/<id>/v<N>/`. Built-in theme updates never change this copy unless the
  creator chooses to update it; an update makes a new version.
- `brand/profile.json` records `theme: {default: <id>}` (new videos take its latest stored version); a playlist may set its own.
- Each video locks the theme id and version it was approved with, so later theme changes only affect new videos
  and re-renders of old ones look the same.
- Previews are compared against the reference stills so the look stays consistent across videos.

## Auto-set vs ask, per video

Write this table into the guide so video threads follow it:
- **Auto-set from brand + playlist:** taxonomy defaults, standards list, chrome and labels, look, cutout styles,
  bed and SFX, languages, output sizes, YouTube template, disclosures, file layout, code number.
- **Picked by the thread, shown for approval:** News/urgency label, lead Cause, angle, research sources, title,
  graphics per line, face layouts, thumbnail content and a suggested stamp.
- **Asked of the creator:** the idea (or pick from trends), research basis when set to "ask", theme (keep the
  default or switch for this video), the thumbnail stamp (suggested, own words or none, when the brand says ask),
  whether the creator appears on camera (when the brand allows both) and how much and how long per moment, their
  own clips, audio and images, approvals at each gate, per-clip looks, final size.

## brand/profile.json (for the tools)

One JSON file the tools read so they look and behave like this creator without code changes. Write it through
the app so its checks run: `node cli.mjs PUT /api/brand @<file>.json` (the file in your scratch space). Logo and
photo are paths inside the channel folder (`brand/logo.png`); the app copies them to its renderer. For example:
`name, handle, role, site, tags, languages {voice, subtitles, dubs}, colors {accent, brand, highlight, bg, text},
fonts {head, body, mono}, logo {main, onColor}, presenter {name, photo, side}, chrome {label},
theme {default}, face (ask | always | never), faceAmount, faceSeconds, dubVoices {lang: {voice, rate, pitch}}, thumbnail {box, stamp: ask | none},
cutouts {category: [kept style ids]}, layouts {face-full, face-left, face-right, face-split, face-circle, face-corner, face-frame, face-phone}, looks {presets},
sound {defaultBed, bedVolume, fxWithVoice}, output {preview, finals, fps}, captionsInVideo (false),
narrative {basis, notes}, monetization {paths, disclosures}`.
After any brand change, update the guide, the decision log and this file together.

## Standing rules (carry into every brand unless the creator says otherwise)

- Every creator decision goes into the right Part of BRAND-GUIDE **and** the decision log with its date (or the
  project's decisions thread).
- Facts dated "as of"; quotes verbatim with source and date; primary documents first; two sources per key claim;
  sources in the description; illustrations and AI visuals disclosed; corrections open and dated.
- Visuals factual and enriched by default; few words on screen so dubs fit; no captions burnt into videos.
- No hype: thumbnail claims are in the video; paid placements and help offers disclosed.
- Never render a final before the creator approves the preview. Never create stray files in the folder.
- Guided and easy for the creator: one question or option card at a time, links for browser steps, progress shown.

## Updating

Read `CLAUDE.md`, `BRAND-GUIDE.md`, `brand/profile.json`, `brand/taxonomy.json` and `brand/themes/`; change the
right Part; add the decision-log row; update the profile, taxonomy, theme files and project memory; say in one
short message what changed and which playlists, videos or tools it affects (locked videos keep their theme version).

## Next step

When the brand is set: one message with what was decided (one line each), and what to say next in the project
chat: **"Make a playlist called <name>"** (playlist-setup). Name two or three good first playlists from the
taxonomy.

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
