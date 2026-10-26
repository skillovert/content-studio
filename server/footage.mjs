// Footage slots (kits with B-roll, e.g. Remote Documentary: Travel and Places). Every footage line of
// the plan has 1 to 3 shots in order (F07-1, F07-2...), each with English stock-search words. The
// creator fills a slot with a licensed clip or photo named by the slot (F07-1.mp4, or
// F07-1-rialto-bridge.mp4), or Content Studio fills the empty ones from Pexels (free licence for
// commercial use) with the creator's own Pexels key. Empty slots show as marked placeholders.
//   footage/F07-1.mp4 ...        footage/credits.json  {<slot>: {source, page, author, query}}
import fs from 'node:fs';
import path from 'node:path';
import {readJson, writeJson} from './workspace.mjs';

const fail = (msg, status = 400) => Object.assign(new Error(msg), {status});
export const footageDir = (dir) => path.join(dir, 'footage');
const creditsFile = (dir) => path.join(footageDir(dir), 'credits.json');
const FILE = /^(F\d{2,3}-\d)(?:[-_.][\w.-]*)?\.(mp4|mov|webm|m4v|jpe?g|png|webp)$/i;
const SLOT = /^F\d{2,3}-\d$/;
const kindOf = (name) => (/\.(jpe?g|png|webp)$/i.test(name) ? 'image' : 'video');

/** Every shot of every footage line, in order, with what to find and how long it plays. */
export function slots(plan) {
  if (!plan) return [];
  return plan.scenes.flatMap((s, si) => s.lines.flatMap((l, li) => {
    const g = l.graphic;
    if (g?.type !== 'footage' || !g.slot) return [];
    const shots = (g.items || []).filter((it) => it.slot);
    const len = Math.max(0.5, (Number(l.end) - Number(l.start)) || 0);
    return shots.map((it) => ({
      slot: it.slot, line: `${si}-${li}`, scene: s.title, vo: l.vo, label: g.title || '', tag: g.kicker || '',
      query: String(it.label || '').trim(), detail: it.detail || '', seconds: Math.round((len / shots.length) * 10) / 10,
    }));
  }));
}

/** The files present: {slot: file name}. */
export function files(dir) {
  let names = [];
  try {
    names = fs.readdirSync(footageDir(dir));
  } catch {
    /* none yet */
  }
  const out = {};
  for (const n of names.sort()) {
    const m = FILE.exec(n);
    if (m && !out[m[1].toUpperCase()]) out[m[1].toUpperCase()] = n;
  }
  return out;
}

export function status(dir, plan, {hasPexels = false} = {}) {
  const have = files(dir);
  const credits = readJson(creditsFile(dir), {});
  const list = slots(plan).map((x) => ({...x, file: have[x.slot] || null, kind: have[x.slot] ? kindOf(have[x.slot]) : null, credit: have[x.slot] ? credits[x.slot] || {source: 'yours'} : null}));
  return {slots: list, filled: list.filter((x) => x.file).length, total: list.length, hasPexels, job: jobs.get(dir) ? publicJob(jobs.get(dir)) : null};
}

/** The creator's own clip or photo for a slot (replaces what the slot had). */
export function save(dir, slot, name, buf) {
  slot = String(slot || '').toUpperCase();
  if (!SLOT.test(slot)) throw fail('Unknown footage slot');
  const ext = (/\.([a-z0-9]{2,4})$/i.exec(String(name || '')) || [])[1]?.toLowerCase();
  if (!ext || !FILE.test(`${slot}.${ext}`)) throw fail('Use a video (.mp4, .mov, .webm) or a photo (.jpg, .png, .webp)');
  if (!Buffer.isBuffer(buf) || !buf.length) throw fail('The file is empty');
  remove(dir, slot);
  fs.mkdirSync(footageDir(dir), {recursive: true});
  fs.writeFileSync(path.join(footageDir(dir), `${slot}.${ext}`), buf);
  const credits = readJson(creditsFile(dir), {});
  credits[slot] = {source: 'yours', file: String(name || '').slice(0, 120)};
  writeJson(creditsFile(dir), credits);
}

export function remove(dir, slot) {
  slot = String(slot || '').toUpperCase();
  if (!SLOT.test(slot)) throw fail('Unknown footage slot');
  const have = files(dir);
  if (have[slot]) fs.rmSync(path.join(footageDir(dir), have[slot]), {force: true});
  const credits = readJson(creditsFile(dir), {});
  if (credits[slot]) {
    delete credits[slot];
    writeJson(creditsFile(dir), credits);
  }
}

/** Credits for the YouTube description: one line per stock source used. */
export function creditLines(dir) {
  const credits = Object.values(readJson(creditsFile(dir), {}));
  const px = [...new Set(credits.filter((c) => c.source === 'pexels').map((c) => c.author).filter(Boolean))];
  return px.length ? [`Stock footage from Pexels by ${px.join(', ')} (pexels.com)`] : [];
}

// ---------- filling empty slots from Pexels ----------
const jobs = new Map(); // video dir -> {status, done, total, log, error}
const publicJob = (j) => ({status: j.status, done: j.done, total: j.total, error: j.error || null, log: j.log.slice(-4)});

/** The best file of a Pexels video for a 1080p edit: HD landscape, else the largest up to 1920 wide. */
export function pickFile(video) {
  const files = (video.video_files || []).filter((f) => /mp4/.test(f.file_type || '') && f.width >= f.height);
  return files.filter((f) => f.width >= 1280 && f.width <= 1920).sort((a, b) => b.width - a.width)[0] || files.filter((f) => f.width <= 1920).sort((a, b) => b.width - a.width)[0] || files[0] || null;
}

async function pexels(url, key) {
  const r = await fetch(url, {headers: {Authorization: key}});
  if (r.status === 401 || r.status === 403) throw fail('Pexels did not accept the key. Check it in Settings.', 401);
  if (r.status === 429) throw fail('Pexels rate limit reached (200 requests an hour). Try again later.', 429);
  if (!r.ok) throw fail(`Pexels answered ${r.status}`, 502);
  return r.json();
}
async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw fail(`Download failed (${r.status})`, 502);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

/** Fills every empty slot: a Pexels video for its search words (long enough for the shot), else a photo. */
export function fillFromPexels(dir, plan, key) {
  if (!key) throw fail('Add your free Pexels API key in Settings first (pexels.com/api)', 400);
  if (jobs.get(dir)?.status === 'running') throw fail('Footage is already being fetched for this video', 409);
  const have = files(dir);
  const todo = slots(plan).filter((x) => !have[x.slot] && x.query);
  const job = {status: 'running', done: 0, total: todo.length, log: [], started: new Date().toISOString()};
  jobs.set(dir, job);
  (async () => {
    fs.mkdirSync(footageDir(dir), {recursive: true});
    const used = new Set(Object.values(readJson(creditsFile(dir), {})).map((c) => c.id).filter(Boolean)); // no clip twice in a video
    for (const x of todo) {
      const q = encodeURIComponent(x.query);
      let credit = null;
      const vids = await pexels(`https://api.pexels.com/videos/search?query=${q}&orientation=landscape&size=medium&per_page=15`, key);
      const pool = (vids.videos || []).filter((v) => !used.has(`v${v.id}`));
      const v = pool.find((v) => v.duration >= x.seconds) || pool[0];
      const file = v && pickFile(v);
      if (file) {
        await download(file.link, path.join(footageDir(dir), `${x.slot}.mp4`));
        credit = {source: 'pexels', id: `v${v.id}`, page: v.url, author: v.user?.name || '', query: x.query};
      } else {
        const pics = await pexels(`https://api.pexels.com/v1/search?query=${q}&orientation=landscape&per_page=10`, key);
        const p = (pics.photos || []).find((p) => !used.has(`p${p.id}`));
        if (p) {
          await download(p.src.large2x || p.src.large || p.src.original, path.join(footageDir(dir), `${x.slot}.jpg`));
          credit = {source: 'pexels', id: `p${p.id}`, page: p.url, author: p.photographer || '', query: x.query};
        }
      }
      if (credit) {
        used.add(credit.id);
        const credits = readJson(creditsFile(dir), {});
        credits[x.slot] = credit;
        writeJson(creditsFile(dir), credits);
        job.log.push(`${x.slot}: ${x.query}`);
      } else job.log.push(`${x.slot}: nothing found for "${x.query}"`);
      job.done++;
    }
    job.status = 'done';
  })()
    .catch((e) => Object.assign(job, {status: 'error', error: e.message}))
    .finally(() => setTimeout(() => jobs.get(dir) === job && jobs.delete(dir), 10 * 60 * 1000).unref());
  return publicJob(job);
}
