---
name: project-setup
description: Set up a creator's Claude project and PC for Content Studio, or update or repair it. Use when the creator says "set up my project", asks about installing or updating Content Studio, or the app won't start.
---

# Project setup (one thread for setup and updates)

This thread installs Content Studio on the creator's PC and stays the home for updates and install problems. The
creator is not a developer. They never see a repo, a terminal or a package manager. Their part is one
double-click and a Windows permission prompt. Everything else is in this thread, one short step at a time.

## Before anything

1. The project must have exactly one folder attached: the channel folder, where everything will live. If none is
   attached, ask them to attach one (an empty folder is fine, for example `D:\My Channel`). If several are
   attached, ask which one is the channel.
2. Look at the folder. If `tools/content-studio/package.json` is already there, this is an update or a repair:
   go to Updates.
3. Post a checklist: Setup file, Install on the PC, Check, Skills, Next step.

## 1 · Setup file

Write `Setup.cmd` in the root of the channel folder, exactly as below (Windows line endings). Tell the creator in
two lines what it does: it installs Node.js and Python if they're missing, downloads Content Studio into
`tools\content-studio`, installs what it needs (about 1 GB the first time), adds a desktop shortcut and starts it
with Windows. Their channel files are never touched.

```bat
@echo off
rem Content Studio setup: double-click once in your channel folder.
rem Installs Node.js and Python if they are missing (Windows may ask for permission), downloads
rem Content Studio into tools\content-studio, installs what it needs and starts it.
title Content Studio setup
cd /d "%~dp0"
set "PS1=%TEMP%\content-studio-install.ps1"
echo Getting the installer...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/skillovert/content-studio/main/setup/install.ps1' -OutFile $env:TEMP\content-studio-install.ps1" || (echo Could not download the installer. Check the internet connection and try again. & pause & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Folder "%~dp0." -Mode setup
pause
```

## 2 · Install on the PC

Ask them to open the channel folder, double-click `Setup.cmd`, allow the Windows prompts, and say "done" here
when the window says "All done". It shows numbered steps. If a step stops, it prints one red line: ask them to
paste it here.

Common fixes:
- "winget is not available": they install "App Installer" from the Microsoft Store, or Node.js LTS from nodejs.org
  and Python 3.12 from python.org (tick "Add to PATH"), then run `Setup.cmd` again.
- Python "not ready yet": a restart of Windows, then `Setup.cmd` again (it skips what is done).
- Antivirus blocks the download: allow it once, or run again.
- A Mac or Linux PC: setup is Windows only for now. Say so, and offer the manual route in the app's README.

## 3 · Check

Read `tools/content-studio/package.json` (the version), and check that `tools/content-studio/node_modules/`
and `tools/content-studio/engine/node_modules/@remotion/` exist (or the channel's own `studio/node_modules/`).
Run `node cli.mjs GET /api/state` in `tools/content-studio` to confirm the app reads the folder. Ask them to open
`http://127.0.0.1:4330` and confirm it shows. Optional, as a choice:
- **Anthropic API key** (Settings link): plans, cuts and graphics in one click, paid per use on their own
  account. Without one, the work happens in project threads, which costs nothing extra.
- **Pexels key** (free): stock footage for travel guides.
- **Speech to text** (Settings, Medium for Urdu and mixed speech): needed only to edit their own footage.

## 4 · Skills

The video work is done by these skills: `project-setup`, `brand-setup`, `playlist-setup`, `youtube-video`,
`remote-documentary`, `travel-video-editing`. They come with the app in `tools/content-studio/skills/<name>/`.
Skills belong to a Claude account. On a Team plan, the admin can share them with every member. Otherwise the
creator adds each one once in Claude's settings, under Skills, by uploading its folder. Check which are missing from this session's skill list and name only those.

## 5 · Next step

One message: Content Studio is installed (version), what is optional, and the next thing to say in the project
chat: **"Set up my brand"**. Have their logo, a photo for thumbnails (optional) and their taxonomy and standards
document (if they have one) ready.

## Updates

- In the app: Settings, then **Check for updates**, then **Install**. A window shows each step, keeps a backup of
  the app (`%LOCALAPPDATA%\ContentStudio\backups`), replaces only the app's files and opens it again. The
  channel folder is never touched.
- Same result from here: running `Setup.cmd` again installs the latest version over the old one.
- After an update, check the version (section 3). New or changed skills come in
  `tools/content-studio/skills/`: tell the creator which ones to add again.

## Rules

- Never create files in the channel folder other than `Setup.cmd`. The app makes its own folders when needed.
- Never ask the creator to type commands. A double-click, a link or a choice here is the most they do.
- Keys stay on their PC (Settings in the app), never in the folder or in this chat.

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
