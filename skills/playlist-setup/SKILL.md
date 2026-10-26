---
name: playlist-setup
description: Create or change a playlist in Content Studio from chat, asking its name, video kit, hosts, languages and defaults as options. Use when the creator says "make a playlist called X" or wants to change one.
---

# Playlist setup (one thread per playlist)

A playlist decides what every video in it starts from: the kind of video (its **kit**), the format, the hosts,
the taxonomy defaults, the languages, the music bed and any standing instructions. Kit, format and hosts are only
**defaults**: each video can set its own (a one-host episode in a two-host series, an explainer in a News
playlist), asked in that video's thread. This thread creates it with the creator by
asking questions with options, and writes it through Content Studio, so it's the same as if they had used the
app. Later changes to this playlist come back to this thread.

## Before anything

1. Read the channel folder's `CLAUDE.md`, `BRAND-GUIDE.md` and `brand/profile.json`. If there's no brand yet,
   say: first **"Set up my brand"** in the project chat. If `tools/content-studio/` is missing, say: first
   **"Set up my project"**.
2. Run `node cli.mjs GET /api/state` in `tools/content-studio`. It lists the taxonomy, the playlists, the kits,
   the lengths, the music beds and the brand defaults.
3. Post a checklist: Name, Kind of video, Hosts, Defaults, Create, Next step.

## Questions, one at a time, each with a recommended option

1. **Name.** Playlist names always come from the channel's taxonomy (a Topic first, or another subject value).
   Offer the values that fit what the creator said. If their name isn't in the taxonomy, offer the closest
   values, or adding it to the taxonomy in the brand thread first.
2. **Kind of video (kit)** from `state.kits`:
   - **News** (the channel's own flow in BRAND-GUIDE Part C): explainers, news, opinion. Graphics only, or with
     the creator on camera.
   - **Remote Documentary: Travel and Places**: full guides to a destination, made from home.
   - **Travel Video Editing**: edits of the creator's own trip footage.
   For News, the **format** must have a defined flow in the brand guide (the taxonomy's `formats` marks it
   `defined`). If it doesn't, offer to define it in the brand thread first. Pick the one most videos will use;
   the others are chosen per video.
3. **Hosts** (kits with hosts): 1 to 3 for a remote documentary, up to 6 speakers for editing. Each one's name
   and gender, which shape the script's grammar and the dub voices.
4. **Defaults** (one short card): code prefix (letters, proposed from the name, e.g. `M` for Mountains, not used by
   another playlist), the taxonomy defaults per field (proposed from the name and the brand), the voice language,
   subtitles and dubs (the brand's languages unless the creator wants others), the music bed, and anything every
   video should follow (standing instructions).

## Create

Write the answers as one JSON body and run, in `tools/content-studio`:

`node cli.mjs POST /api/playlists @<file>.json`

Write that file in your own scratch space, outside the channel folder. The body looks like:
`{"name", "purpose", "format", "kit": "news" | "travel-doc" | "travel-edit", "hosts": [{"name", "gender"}],
"codePrefix", "defaults": {"<field>": {"values": [], "note": ""}}, "instructions": [], "production": {"bed",
"voiceLanguage", "subtitles": [], "dubs": []}}`.
The app checks it (name from the taxonomy, format, prefix, hosts) and returns the error in plain words. Fix it
with the creator, then run it again. It writes `playlists/<slug>/playlist.json` and `PLAYLIST.md`.

To change a playlist later: `node cli.mjs PUT /api/playlists/<slug> @<file>.json` with the changed fields, or
`POST /api/playlists/<slug>/rename` with `{"name"}`.

## Next step

One message: the playlist is ready (its name, kit, hosts, code prefix), its page link from
`node cli.mjs links <slug>`, and what to say next in the project chat:
**"New video in <name>: <idea or destination>"**. Each video gets its own thread.

## Rules

- Names and card values only from the taxonomy. Never invent values.
- One question at a time, with a recommended option. Keep working on the recommended one while waiting.
- Never write `playlist.json` by hand. Always go through `cli.mjs`, so the app's checks run.
- Never create files in the channel folder yourself. The app writes the playlist folder.
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
