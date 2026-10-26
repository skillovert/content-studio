// The channel folder (the one the creator attached, e.g. F:\My Channel) and small file helpers.
// Content Studio only reads and writes inside this folder, in the places BRAND-GUIDE.md names.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The workspace is the first folder at or above the app that holds BRAND-GUIDE.md
// (the app lives in <workspace>/tools/content-studio). CS_ROOT overrides it. A new channel whose brand
// is not set up yet: the folder that holds tools/content-studio.
export function findRoot(start = appDir) {
  if (process.env.CS_ROOT) return path.resolve(process.env.CS_ROOT);
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'BRAND-GUIDE.md'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) {
      if (path.basename(path.dirname(start)) === 'tools') return path.dirname(path.dirname(start));
      throw new Error('BRAND-GUIDE.md not found above ' + start + '. Set CS_ROOT to the channel folder.');
    }
    dir = up;
  }
}

export const APP_DIR = appDir;

/** Where the renderer lives: a channel folder's own studio/ (the first channel's setup keeps working),
 * else the app's engine/ (components, fonts, sounds, music beds; one package with the app). */
export function rendererDir(root) {
  const own = path.join(root, 'studio');
  const engine = path.join(appDir, 'engine');
  if (fs.existsSync(own)) return own;
  if (fs.existsSync(path.join(engine, 'package.json'))) return engine;
  return own;
}

export const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
export const VIDEO_FOLDER = /^([A-Z]{1,4}\d{2,4})-([a-z0-9][a-z0-9-]{0,80})$/;

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export const read = (p, fallback = null) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : fallback);
export const readJson = (p, fallback = null) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);

// Write via a temp file so a crash never leaves half a file behind.
export function write(p, text) {
  fs.mkdirSync(path.dirname(p), {recursive: true});
  fs.writeFileSync(p + '.tmp', text);
  fs.renameSync(p + '.tmp', p);
}
export const writeJson = (p, data) => write(p, JSON.stringify(data, null, 1) + '\n');

export const today = () => new Date().toISOString().slice(0, 10);
export const longDate = (iso = today()) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
};

// Nothing is deleted: a removed playlist or video moves to archive/<relative path>-removed-<date>.
export function toArchive(root, absPath) {
  const rel = path.relative(root, absPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('outside the workspace: ' + absPath);
  let dest = path.join(root, 'archive', `${rel}-removed-${today()}`);
  for (let n = 2; fs.existsSync(dest); n++) dest = path.join(root, 'archive', `${rel}-removed-${today()}-${n}`);
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  fs.renameSync(absPath, dest);
  return path.relative(root, dest).split(path.sep).join('/');
}

// ---- Markdown helpers (the folder's files are Markdown, edited by people and by Claude) ----

export const stripMd = (s) => String(s || '').replace(/\*\*|__|`/g, '').trim();

// A pipe table starting at line index i: returns {rows: [[cells]], end} (header row first, separator dropped).
export function parseTable(lines, i) {
  const rows = [];
  let j = i;
  for (; j < lines.length && /^\s*\|/.test(lines[j]); j++) {
    const cells = lines[j].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    rows.push(cells);
  }
  return {rows, end: j};
}

export function renderTable(header, rows) {
  const esc = (c) => String(c ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [`| ${header.map(esc).join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n');
}

// Line range [start, end) of a "## Heading" section (start = the heading line), matched by prefix.
export function findSection(lines, prefix) {
  const start = lines.findIndex((l) => /^##\s/.test(l) && stripMd(l.replace(/^##\s+/, '')).toLowerCase().startsWith(prefix.toLowerCase()));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !/^#{1,2}\s/.test(lines[end])) end++;
  return {start, end};
}

// The first table inside a section, as {header, rows, at: [start, end)}.
export function sectionTable(lines, prefix) {
  const sec = findSection(lines, prefix);
  if (!sec) return null;
  for (let i = sec.start + 1; i < sec.end; i++) {
    if (/^\s*\|/.test(lines[i])) {
      const {rows, end} = parseTable(lines, i);
      return {header: rows[0] || [], rows: rows.slice(1), at: [i, end], section: sec};
    }
  }
  return {header: [], rows: [], at: null, section: sec};
}
