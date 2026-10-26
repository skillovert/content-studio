---
name: remote-documentary
description: Make one remote travel documentary (a full guide to a destination, made from home) in its own project thread, with 1-3 hosts, stock footage, maps and travel graphics, studio moments, preview, recording by host, dubs and the final. Use for "new video in <playlist>" when the playlist uses the Remote Documentary kit.
---

# Remote documentary: Travel and Places (one thread = one destination)

A full guide to one place (a city, region, country or route) made **without travelling**: about 80% licensed
footage, maps and travel graphics with the hosts' voices over them, about 20% the hosts on camera in a studio
between chapters. 18-24 minutes by default (short 12-16, long 25-30). Works for any channel and any destination;
everything channel-specific comes from the channel folder. This skill is the travel flow; every step it does not
mention (card, standards, theme, stamp, render, deliver, derived content) is the same as `youtube-video`.

The thread guides the creator one question or one option card at a time and never skips a gate.

## Before anything

1. Read the channel folder's `CLAUDE.md`, `BRAND-GUIDE.md`, `brand/profile.json`, the playlist's `PLAYLIST.md`
   and project memory. No brand guide: ask the creator to say "set up my brand" in the project chat first.
2. The video uses the **Remote Documentary: Travel and Places** kit with its **hosts** (1 to 3, each a name
   and a gender): from the playlist, or set for this video alone (`"kit": "travel-doc"`, `"hosts"` when creating
   it, or `PUT .../videos/<folder>/setup`), for example one host this time in a two-host series. Names and genders shape who says which line and the
   grammar of every line (languages with gendered verbs, e.g. Urdu, Hindi, Arabic: "main gayi thi" for a woman,
   "main gaya tha" for a man).
3. Create the video after stage 1: `node cli.mjs POST /api/playlists/<slug>/videos @<file>.json` with
   `{"title": "<destination>", "concept", "links", "length"}` plus any own `kit`, `hosts`. `POST .../plan` writes `plan/brief.md` and the schema.
   Write each plan version to `plan/plan-vN.json`
   (schema in `plan/plan-schema.json`), then `POST .../plan/import`; on approval `POST .../plan/approve`.
4. **This video's setup.** The playlist gives the defaults (kit, format, hosts). Ask once, as options with the
   playlist's recommended: does this video follow them, or is it different (another format with a defined flow,
   another kit, other or fewer hosts)? Send only what differs when creating it (`"kit"`, `"format"`, `"hosts":
   [{"name", "gender"}]`), or change it later with `PUT .../videos/<folder>/setup` (`null` puts one back to the
   playlist's) until the plan is approved. `GET .../videos/<folder>` returns the result as `setup`. The video's
   own kit decides the skill: News → `youtube-video`, Remote Documentary → `remote-documentary`, Travel Video
   Editing → `travel-video-editing`; if it is another kit than this skill's, follow that skill instead.
5. Post a checklist of the stages below and keep it current.

## Stages and gates

**1 · Destination and length.** Ask for the destination (it is the video's title) and the length (short,
standard, long). Optional: the angle (budget, family, first time, winter, halal-friendly, from the channel's
country), the viewers' home country (for flights, visas and prices in their currency), and links or notes.
Pick the most likely reading of anything vague and say so. If the creator gives a concept or a partial plan
(beats, lines, places, a route), it is the backbone: keep it, check it, correct only what sources show is wrong
(and say so), and make it complete and richer around it.

**2 · Research.** Official sources first: tourism boards, embassy and visa pages, government travel advice,
official site pages for opening hours and fees, transport operators. Every price, fee, time and rule carries its
source and an "as of" date; prices in local currency and the viewers' currency. Two sources for each key claim.
Never invent an experience: the hosts did not travel, so the script never says "when we were there"; it says
what visitors report, with sources. Note seasonal closures, safety advice and scams from official or well-known
sources.

**3 · Plan, then approval.** The chapters, in this order (skip one only if it does not apply, and say why):
hook (a footage montage and the stakes in one line; no welcome, no logo), studio intro, where it is (maps),
weather and best time, top sights with fees, culture, manners and rules, safety, scams and phrases, where to stay
(budget, mid, luxury), mid CTA (a question for comments), budget per day, getting there and around, itinerary,
history, surprising facts, verdict with ratings, end CTA.
Each line has:
- **speaker**: a host by name, or `all` for lines said together (studio intro, verdict). Alternate hosts every
  45-90 seconds; give each host chapters that suit them; with one host, every line is theirs.
- **layout**: `voice` (footage or graphic full screen) for most lines; `studio` for the studio moments (the hosts
  on camera together, 15-20% of lines, at the start of each big chapter; a studio line with a graphic shows the
  hosts first, then the graphic); face layouts only where one host speaks to the camera alone.
- **visual**, changing every 3-5 seconds:
  - **footage**: 1 to 3 shots per line, each with stock-search words in English (e.g. "hagia sophia interior dome
    light"), a place label (name, district or fee) and the slot ids Content Studio gives (F07-1, F07-2...);
  - **map**: the places as "Name | lat, lon"; **route**: stops joined with mode and times (flight, train, road,
    walk); **roadtrip**: a drive between stops on a drawn, map-styled road (not a real route), each stop with
    "lat, lon" and distance and time ("62 km · 50 min"), key areas beside the road as "Name | lat, lon | kind |
    note", and the road's name; **weather**: 12 months, each good, shoulder or avoid; **tiers**: hotel bands or daily budgets with a
    breakdown; **phrases**: local words with how to say them; **dos and don'ts**: manners, rules and scams;
    **rating**: scores out of 10 and who the place is best for; plus the general graphics (numbers, timelines,
    cards, checklists) where they show a fact best.
  At least 8 kinds of graphic in a video, and footage on about half the lines. Graphics take the brand's kept
  styles in rotation. Where the creator asked for a look, set it on the graphic (for example `style: "map:atlas"`).
- title, description (chapters, sources, as-of date, footage credits, disclosure that the guide is researched
  remotely), tags, thumbnail (destination + a hook, e.g. "ISTANBUL · 5 DAYS · $60/DAY") and a suggested stamp.
Show it as a document and ask: approve, or what to change. Each change is a new plan version.

**4 · Footage.** List every slot with its search words and length. The creator fills each slot with their own
licensed clip or photo named by the slot (`F07-1.mp4`, `F07-1-rialto-bridge.jpg`), or fills the empty ones from
Pexels (free for commercial use) with their own free Pexels key; Pixabay and paid libraries (Storyblocks,
Artgrid) are fine when licensed. Credits are kept per slot (`footage/credits.json`) and go into the description.
Never use footage without a licence, and never other creators' videos. Empty slots show as marked placeholders,
so the preview can be reviewed before every clip is in. The Footage panel is on the video page (link from
`node cli.mjs links`). A clip the creator attaches here can be saved straight into `footage/` with the slot's name.

**5 · Preview, then approval.** As in `youtube-video`: the whole video at 540p in the locked theme, the travel
graphics in the brand's kept travel styles (place labels, destination maps, routes, weather, prices and budgets,
phrases, manners, verdicts; every video rotates through the kept styles), studio moments as marked slots naming
the hosts and their seconds. No news label on a travel guide.

**6 · Recording by host.** One link. Each host records their own lines (pick one host's lines to see only theirs
and the shared ones); studio lines are recorded together on camera. Dubs: each host gets a synthetic voice of
their gender in each dub language, different from the other hosts', changeable per host and per line, fitted to
the host's own take.

**7 onwards.** Final render, standards check, delivery and derived content as in `youtube-video`. Good derived
pieces for travel: a vertical short per top sight, a budget card post, an itinerary carousel.

## Rules

- No invented experiences, prices or rules; every number dated and sourced; illustrations and stock disclosed.
- Respectful about people, faith and culture; manners and rules come from local or official sources.
- Brand colours, fonts and theme on every graphic; the brand keeps or drops travel styles on its Brand page.
- Files only in the piece folder (`footage/` for footage); never stray files in the channel folder.
- Use the channel's video engine when it has one (e.g. Content Studio under `tools/`).

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
