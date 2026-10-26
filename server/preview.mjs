// Phase 3: approved plan -> 540p preview video + sample thumbnail, for the owner's approval
// (BRAND-GUIDE A3 gate 5: nothing final before approval). Rendered with Remotion from the
// scene library in scenes/, using the renderer install (the app's engine/, or an older channel's studio/).
//
// Files in the video folder:
//   preview/<CODE>-preview-540p-vN.mp4    the preview, every version kept
//   preview/<CODE>-thumb-sample-vN.jpg    the sample thumbnail (1920x1080)
//   preview/preview-vN.json               what it was made from (plan version, props)
//   video.json  .preview = {current, approved, job}; .approved = gate 5 date
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {APP_DIR, readJson, rendererDir, writeJson, today} from './workspace.mjs';
import {withTiming} from './plan-schema.mjs';
import * as MD from './media.mjs';
import * as FT from './footage.mjs';
import * as CU from './cutouts.mjs';
import {direct, summary} from './director.mjs';
import {loadProfile, brandProps, defaultThemeId} from './brand.mjs';
import {adoptTheme, loadTheme, installThemeFonts} from './themes.mjs';

const jobs = new Map(); // video dir -> live render job
const previewDir = (dir) => path.join(dir, 'preview');
const state = (dir) => readJson(path.join(dir, 'video.json'), {});
const setState = (dir, fn) => writeJson(path.join(dir, 'video.json'), fn(state(dir)));
const fail = (msg, status = 400) => Object.assign(new Error(msg), {status});

export function versions(dir) {
  const d = previewDir(dir);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).map((f) => /^preview-v(\d+)\.json$/.exec(f)).filter(Boolean).map((m) => +m[1]).sort((a, b) => a - b);
}

/** The brand's logo and presenter photo are files in the channel folder (brand/logo.png); the renderer
 * serves only its own public/ folder, so they are copied there (when newer) before a render. */
export function syncBrandFiles(root, studio) {
  const p = loadProfile(root);
  const files = [p.presenter?.photo, p.logo?.main, p.logo?.onColor, p.logo?.light].filter((f) => f && !/(^|[\\/])\.\.([\\/]|$)/.test(f));
  for (const f of files) {
    const from = path.join(root, f);
    const to = path.join(studio, 'public', f);
    try {
      const a = fs.statSync(from);
      if (!a.isFile()) continue;
      const b = fs.existsSync(to) ? fs.statSync(to) : null;
      if (b && b.size === a.size && b.mtimeMs >= a.mtimeMs) continue;
      fs.mkdirSync(path.dirname(to), {recursive: true});
      fs.copyFileSync(from, to);
    } catch {
      /* not in the channel folder: an older setup keeps it in studio/public */
    }
  }
}

/** The renderer install, or what is missing. */
export function studioCheck(root) {
  const studio = rendererDir(root);
  if (!fs.existsSync(path.join(studio, 'package.json'))) return {ok: false, studio, why: 'renderer not found (engine/ in the app)'};
  syncBrandFiles(root, studio);
  if (!fs.existsSync(path.join(studio, 'node_modules', '@remotion', 'renderer'))) return {ok: false, studio, why: 'install', fix: 'npm install'};
  return {ok: true, studio};
}

/** Bed id from the playlist ("a") -> its file under studio/public ("audio/beds/news-bed-a-….wav"). */
function bedFile(studio, id) {
  const d = path.join(studio, 'public', 'audio', 'beds');
  if (!id || !fs.existsSync(d)) return null;
  const f = fs.readdirSync(d).find((x) => x.startsWith(`news-bed-${id}-`) && /\.(wav|mp3)$/i.test(x));
  return f ? `audio/beds/${f}` : null;
}

/** The thumbnail stamp for this video: the creator's choice (video.json thumbStamp), else the plan's
 * suggestion; never one when the brand says 'none'. '' = no stamp. */
export function stampFor(dir, plan, profile) {
  if (profile.thumbnail?.stamp === 'none') return '';
  const c = dir ? state(dir).thumbStamp : null;
  if (c?.mode === 'none') return '';
  if (c?.mode === 'custom') return c.text || '';
  return plan.thumbnail?.stamp || '';
}

/** Creator picks the stamp: {mode: 'plan' | 'custom' | 'none', text}. Takes effect on the next preview. */
export function setStamp(dir, body) {
  const mode = ['plan', 'custom', 'none'].includes(body?.mode) ? body.mode : 'plan';
  const text = String(body?.text || '').trim().slice(0, 60);
  if (mode === 'custom' && !text) throw fail('Write the stamp text, or pick "No stamp"');
  setState(dir, (s) => ({...s, thumbStamp: {mode, text: mode === 'custom' ? text : ''}}));
  return status(dir);
}

/**
 * The theme of a video: the one it is locked to (video.json theme {id, version}), else the playlist's or
 * the brand's default, adopted into brand/themes/ so a full copy is stored before anything is made.
 */
export function themeFor(root, playlist, dir, profile = loadProfile(root)) {
  const locked = dir ? state(dir).theme : null;
  if (locked?.id && locked?.version) return loadTheme(root, locked.id, locked.version);
  const ref = adoptTheme(root, locked?.id || playlist?.production?.theme || defaultThemeId(profile));
  return loadTheme(root, ref.id, ref.version);
}

/** Creator picks this video's theme (before the preview is approved). Stores the brand's copy and locks it. */
export function setTheme(root, dir, id) {
  if (state(dir).preview?.approved) throw fail('The preview is approved with its theme; it stays the same so the video does not change.', 409);
  const ref = adoptTheme(root, id);
  setState(dir, (s) => ({...s, theme: ref}));
  return status(dir);
}

const BASE = () => `http://127.0.0.1:${Number(process.env.PORT || 4330)}`; // the renderer fetches the creator's media from Content Studio
const titled = (words) => words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/** The director's inserts in the brand's styles, with the creator's media on its lines (audio filtered to its style). */
export function directed(root, plan, profile, dir) {
  const items = dir ? MD.list(dir) : [];
  const rel = (f) => `${BASE()}/ws/${path.relative(root, path.join(dir, f)).split(path.sep).map(encodeURIComponent).join('/')}`;
  const withUrl = (it) => ({...it, url: rel(`media/${it.name}`), label: titled(it.words) || it.name});
  const media = Object.fromEntries(Object.entries(MD.match(plan, items)).map(([k, it]) => [k, withUrl(it)]));
  const photos = Object.fromEntries(items.filter((x) => x.kind === 'image').map((x) => [x.name, withUrl(x)]));
  const out = direct(plan, root, {style: CU.styler(profile), place: CU.placer(profile), media, photos});
  return out.map((x) => (x.kind === 'audio' ? {...x, url: rel(MD.styledAudio(root, dir, x.name, x.style))} : x));
}

/** slot -> {url, kind} for every footage slot with a file (server/footage.mjs). */
export function footageFor(root, dir) {
  if (!dir) return {};
  return Object.fromEntries(Object.entries(FT.files(dir)).map(([slot, f]) => [slot, {url: `${BASE()}/ws/${path.relative(root, path.join(FT.footageDir(dir), f)).split(path.sep).map(encodeURIComponent).join('/')}`, kind: /\.(jpe?g|png|webp)$/i.test(f) ? 'image' : 'video'}]));
}

/** A studio line that also carries a graphic (the verdict's scores): the hosts first, then the graphic. */
const studioFor = (l) => (l.layout === 'studio' && l.graphic && l.graphic.type !== 'footage' ? Math.min(3.5, Math.max(1.5, (l.end - l.start) * 0.3)) : 0);

export function propsFor(root, playlist, video, plan, dir = null) {
  const {meta, ...clean} = plan;
  const timed = clean.duration ? clean : withTiming(clean);
  const studio = rendererDir(root);
  const profile = loadProfile(root);
  const theme = themeFor(root, playlist, dir, profile);
  timed.thumbnail = {...timed.thumbnail, stamp: stampFor(dir, plan, profile)};
  // graphics-only videos: every line is voice, whatever the plan says
  // with the face: never longer on camera than the video's limit (0 = whole line)
  const v = dir ? state(dir) : {};
  const cap = Number(v.faceSeconds) || 0;
  timed.scenes = timed.scenes.map((s) => ({...s, lines: s.lines.map((l) => (v.face ? {...l, faceFor: cap ? Math.min(cap, Number(l.faceFor) || cap) : Number(l.faceFor) || studioFor(l)} : {...l, layout: 'voice', faceFor: 0}))}));
  const styled = CU.styleGraphics(timed, profile); // travel graphics in the brand's kept styles
  return {
    code: video.code,
    playlist: playlist.name,
    label: plan.kit ? '' : plan.newsLabel ? `${plan.newsLabel} News` : profile.chrome.label, // a travel guide is not news
    cause: plan.kit ? '' : plan.card?.cause?.[0] || '',
    lang: playlist.production?.voiceLanguage || profile.languages.voice,
    bed: bedFile(studio, playlist.production?.bed || profile.sound.defaultBed),
    fx: 1, // no voice yet: SFX and bed as designed
    captions: Boolean(profile.captionsInVideo), // off by default: no captions burnt into videos (SRTs are files)
    plan: styled,
    inserts: directed(root, timed, profile, dir), // the visual director's extras, always on, in the brand's styles
    footage: footageFor(root, dir), // the clips and photos that fill footage slots
    brand: profile.exists ? brandProps(profile, theme) : undefined,
    theme,
  };
}

export function status(dir) {
  const s = state(dir).preview || {};
  const live = jobs.get(dir);
  const vs = versions(dir);
  const current = s.current || vs.slice(-1)[0] || null;
  const made = current ? readJson(path.join(previewDir(dir), `preview-v${current}.json`)) : null;
  const planApproved = state(dir).plan?.approved?.version || null;
  return {
    job: live ? {status: live.status, stage: live.stage, progress: live.progress, started: live.started, error: live.error} : s.job || null,
    versions: vs,
    current,
    approved: s.approved || null,
    made,
    video: made?.video && fs.existsSync(path.join(previewDir(dir), made.video)) ? made.video : null,
    thumb: made?.thumb && fs.existsSync(path.join(previewDir(dir), made.thumb)) ? made.thumb : null,
    planApproved,
    stale: Boolean(made && planApproved && made.planVersion !== planApproved),
    stamp: state(dir).thumbStamp || {mode: 'plan', text: ''},
    theme: state(dir).theme || null,
    stampUsed: made?.props?.stamp ?? null,
  };
}

export function run(args, cwd, onLine) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, {cwd, stdio: ['ignore', 'pipe', 'pipe']});
    let buf = '';
    const err = [];
    p.stdout.on('data', (c) => {
      buf += c;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        try {
          onLine(JSON.parse(line));
        } catch {
          /* not ours (Remotion's own log) */
        }
      }
    });
    p.stderr.on('data', (c) => err.push(c));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(Buffer.concat(err).toString().trim().split('\n').slice(-4).join(' ') || `render exited ${code}`))));
  });
}

export function npmInstall(studio) {
  return new Promise((resolve, reject) => {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const p = spawn(npm, ['install', '--no-audit', '--no-fund'], {cwd: studio, shell: process.platform === 'win32'});
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`npm install in ${path.basename(studio)}/ failed`))));
  });
}

export function startPreview(root, playlist, video, dir, plan, opts = {}) {
  if (jobs.get(dir)?.status === 'running') throw fail('A preview is already being made for this video', 409);
  if (!plan) throw fail('Approve the plan first');
  const check = studioCheck(root);
  if (!check.ok && check.why !== 'install') throw fail(check.why);
  const v = (versions(dir).slice(-1)[0] || 0) + 1;
  const names = {video: `${video.code}-preview-540p-v${v}.mp4`, thumb: `${video.code}-thumb-sample-v${v}.jpg`};
  const props = propsFor(root, playlist, video, plan, dir);
  // one thumbnail per audio language: the voice language, then each dub with its own line and badge
  const dubs = [...new Set(playlist.production?.dubs || loadProfile(root).languages.dubs || [])].filter((l) => l !== props.lang);
  names.thumbs = Object.fromEntries(dubs.map((l) => [l, `${video.code}-thumb-sample-${l}-v${v}.jpg`]));
  const job = {status: 'running', stage: check.ok ? 'bundle' : 'install', progress: 0, started: new Date().toISOString()};
  jobs.set(dir, job);
  const jobFile = path.join(os.tmpdir(), `content-studio-${video.code}-${process.pid}-${Date.now()}.json`);
  (async () => {
    if (!check.ok) await npmInstall(check.studio);
    props.fontFiles = installThemeFonts(check.studio);
    // lock the theme (id + stored version) the first time this video is made
    setState(dir, (s) => (s.theme?.version ? s : {...s, theme: {id: props.theme.id, version: props.theme.version}}));
    fs.mkdirSync(previewDir(dir), {recursive: true});
    fs.writeFileSync(jobFile, JSON.stringify({
      studio: check.studio,
      props,
      thumb: path.join(previewDir(dir), names.thumb),
      thumbs: Object.entries(names.thumbs).map(([lang, f]) => ({lang, out: path.join(previewDir(dir), f)})),
      video: path.join(previewDir(dir), names.video),
      scale: 0.5, // 1080p design -> 960x540
      crf: 26,
      browserExecutable: opts.browserExecutable || process.env.CS_BROWSER || undefined,
    }));
    await run([path.join(APP_DIR, 'render', 'render.mjs'), jobFile], check.studio, (m) => {
      if (m.error) job.error = m.error;
      if (m.stage) Object.assign(job, {stage: m.stage, progress: m.progress ?? job.progress});
    });
    writeJson(path.join(previewDir(dir), `preview-v${v}.json`), {
      version: v,
      planVersion: plan.meta?.version || null,
      created: new Date().toISOString(),
      video: names.video,
      thumb: names.thumb,
      thumbs: Object.keys(names.thumbs).length ? names.thumbs : undefined,
      duration: props.plan.duration,
      size: '960x540',
      feedback: opts.feedback || undefined,
      direction: {inserts: props.inserts.length, summary: summary(props.inserts)},
      // the script with its timing: shown beside the preview, since captions are not burnt in
      script: props.plan.scenes.flatMap((s) => s.lines.map((l) => ({start: l.start, end: l.end, vo: l.vo}))),
      props: {playlist: props.playlist, label: props.label, cause: props.cause, lang: props.lang, bed: props.bed, stamp: props.plan.thumbnail.stamp, theme: {id: props.theme.id, version: props.theme.version}},
    });
    setState(dir, (s) => ({...s, preview: {...(s.preview || {}), current: v, approved: null, job: {status: 'done', at: new Date().toISOString()}}}));
    job.status = 'done';
  })()
    .catch((e) => {
      job.status = 'error';
      job.error = job.error || e.message;
      setState(dir, (s) => ({...s, preview: {...(s.preview || {}), job: {status: 'error', at: new Date().toISOString(), error: job.error.slice(0, 600)}}}));
    })
    .finally(() => {
      fs.rm(jobFile, {force: true}, () => {});
      setTimeout(() => jobs.get(dir) === job && jobs.delete(dir), 60_000).unref();
    });
  return status(dir);
}

/** Owner approves the preview + sample thumbnail: gate 5 passes, recording unlocks. */
export function approvePreview(dir) {
  const st = status(dir);
  if (!st.current) throw fail('No preview to approve yet');
  if (st.stale) throw fail('The plan changed after this preview. Make a new preview first.', 409);
  const at = today();
  setState(dir, (s) => ({...s, preview: {...(s.preview || {}), approved: {version: st.current, at}}, approved: `${at} (preview v${st.current})`, stage: 'record'}));
  return status(dir);
}
