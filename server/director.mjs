// The visual director: reads the timed plan the way an editor would and adds the extra visuals a
// news explainer needs, on its own, whatever the plan asked for (owner decision, 24 Oct 2026:
// visuals are factual and enriched by default). The plan's graphic for each line stays the main
// picture; the director lays short inserts over it:
//   ref     reference flash: the source's clipping slams in when a line leans on a source
//   place   map inset with pins when a line names a country or region
//   stat    big number pop when a line says a figure
//   date    date stamp when a line names a date
//   footage footage-style insert (screen recording of the source page) to break a long beat
//   quote   a person the line names, with what they said (plan quotes), key words highlighted
//   doc     the source's page with its key line marked (a source already flashed once)
//   keyword a term the line explains, big for a moment
//   clip / audio / photo   the creator's own material (server/media.mjs), always on its line
// Each insert carries the brand's style for its category (server/cutouts.mjs).
// Facts come only from the plan (its sources and the voice-over); nothing is invented.
import fs from 'node:fs';
import path from 'node:path';
import {rendererDir} from './workspace.mjs';

const FPS_GAP = 4; // seconds between inserts, at least
const LEN = {ref: 3, place: 3.4, stat: 2.6, date: 2.2, footage: 3.6, quote: 4.2, doc: 3.4, keyword: 2.2};
const QUIET = new Set(['title', 'presenter', 'help', 'outro', 'comment']); // never covered
const TRAVEL_OWN = new Set(['footage', 'route', 'roadtrip', 'weather', 'tiers', 'phrases', 'dosdonts', 'rating']);
const EVIDENCE = new Set(['montage', 'timeline', 'map', 'warnings', 'developments', 'numbers', 'what', 'how', 'risk']);
const SELF = {ref: ['clippings', 'quote'], place: ['map'], stat: ['number', 'bars', 'gauge'], date: ['timeline', 'stamps'], footage: ['clippings', 'terminal', 'map'], quote: ['quote'], doc: ['clippings', 'quote'], keyword: []};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const ALIASES = [
  [/\b(America|USA|U\.S\.|US|United States)\b/, ['United States of America']],
  [/\b(UK|Britain|England|United Kingdom)\b/, ['United Kingdom']],
  [/\b(UAE|Dubai|Emirates)\b/, ['United Arab Emirates']],
  [/\bSaudi\b/, ['Saudi Arabia']],
  [/\b(South )?Korea\b/, ['South Korea']],
  [/\bEurope\b|\bYurap\b/i, ['Germany', 'France', 'United Kingdom', 'Italy', 'Spain', 'Poland', 'Netherlands']],
  [/\bMiddle East\b|\bGulf\b|Mashriq/i, ['Saudi Arabia', 'United Arab Emirates', 'Qatar', 'Iran', 'Iraq']],
  [/\bAfrica\b/i, ['Nigeria', 'South Africa', 'Egypt', 'Kenya']],
  [/\bSouth Asia\b|Junoobi Asia/i, ['Pakistan', 'India', 'Bangladesh', 'Sri Lanka']],
  [/\bAsia\b/, ['China', 'India', 'Pakistan', 'Japan', 'Indonesia']],
];
const WORLD = /duniya bhar|poori duniya|worldwide|globally|global\b|around the world/i;

let COUNTRIES = null;
function countries(root) {
  if (COUNTRIES) return COUNTRIES;
  try {
    const map = JSON.parse(fs.readFileSync(path.join(rendererDir(root), 'src', 'components', 'worldmap.json'), 'utf8'));
    COUNTRIES = map.countries.map((c) => c.name).filter((n) => n.length > 3);
  } catch {
    COUNTRIES = ['Pakistan', 'India', 'China', 'Russia', 'Iran', 'Israel', 'Germany', 'France', 'Japan', 'Brazil', 'Canada', 'Australia'];
  }
  return COUNTRIES;
}

const plain = (vo) => String(vo).replace(/"/g, '');

/** Countries a line names ([] = none; ['*'] = "the whole world"). */
export function placesIn(vo, root) {
  const t = plain(vo);
  const out = new Set();
  for (const [re, names] of ALIASES) if (re.test(t)) names.forEach((n) => out.add(n));
  for (const n of countries(root)) if (new RegExp(`\\b${n.replace(/[.]/g, '\\.')}\\b`).test(t)) out.add(n);
  if (!out.size && WORLD.test(t)) return ['*'];
  return [...out].slice(0, 8);
}

/** The first figure in a line: {value: "167M", label: "installs"}, or null. Years, dates and step numbers are skipped. */
export function figureIn(vo) {
  const t = plain(vo);
  const re = /(\d+(?:[.,]\d+)?)\s*(percent|feesad|%|million|billion|crore|lakh|hazaar|thousand)?\b\s*([^\d.,:;!?]*)/gi;
  let m;
  while ((m = re.exec(t))) {
    const [, num, unit = '', rest] = m;
    const after = rest.trim().toLowerCase();
    if (MONTHS.some((mo) => after.startsWith(mo))) continue; // "20 October"
    if (!unit && /^(19|20)\d\d$/.test(num)) continue; // a year
    if (!unit && !num.includes('.') && +num < 10) continue; // "do", step numbers
    const u = unit.toLowerCase();
    const value = num + ({percent: '%', feesad: '%', '%': '%', million: 'M', billion: 'B', crore: ' crore', lakh: ' lakh', hazaar: 'K', thousand: 'K'}[u] ?? '');
    // the words that name what is counted, up to the first joining word ("3 million servers par…" -> "servers")
    const words = [];
    for (const w of after.split(/\s+/).filter(Boolean)) {
      if (/^(hain|hai|tha|thay|ki|ka|ke|aur|and|par|pe|se|mein|ko|tak|the|of|are|is|were|was|in|on|at)$/.test(w) || words.length === 3) break;
      words.push(w);
    }
    const label = words.join(' ');
    return {value, label};
  }
  return null;
}

/** "20 October" -> "20 OCT", or null. */
export function dateIn(vo) {
  const m = /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.exec(plain(vo));
  return m ? `${+m[1]} ${m[2].toUpperCase()}` : null;
}

/** The source a line leans on: one it names by outlet, else (in evidence scenes) the scene's first. */
export function sourceFor(plan, scene, vo) {
  const t = plain(vo).toLowerCase();
  const named = plan.sources.find((s) => {
    const key = s.outlet.split(/[·|(\-]/)[0].trim().toLowerCase();
    return key.length > 2 && t.includes(key);
  });
  if (named) return named;
  if (!EVIDENCE.has(scene.kind)) return null;
  return plan.sources.find((s) => s.id === scene.sourceIds?.[0]) || null;
}

const shortDay = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1].toUpperCase()} ${m[1]}` : d || '';
};
const host = (url) => {
  try {
    return new URL(url).host.replace(/^www\./, '') + new URL(url).pathname.replace(/\/$/, '');
  } catch {
    return url || '';
  }
};
const refData = (s) => ({outlet: s.outlet, date: shortDay(s.date), headline: s.title, url: host(s.url), sourceId: s.id});

/** Terms the line puts in "quotes" (jargon the voice explains): ["PHP", "vulnerabilities"]. */
export function termsIn(vo) {
  return [...String(vo).matchAll(/"([^"]{2,28})"/g)].map((m) => m[1].trim()).filter(Boolean);
}

/** A quote whose speaker the line names (by a word of the name of 3+ letters). */
export function quoteFor(plan, vo) {
  const t = plain(vo).toLowerCase();
  return (plan.quotes || []).find((q) => String(q.speaker || '').toLowerCase().split(/[^a-z0-9]+/).some((w) => w.length > 2 && !['the', 'and', 'research', 'team'].includes(w) && new RegExp(`\\b${w}\\b`).test(t))) || null;
}

/** Key words of a quote to highlight: its longest words, up to three. */
const marksOf = (text) => [...new Set(String(text).split(/[^\p{L}\p{N}'-]+/u).filter((w) => w.length > 5))].sort((a, b) => b.length - a.length).slice(0, 3);

/**
 * Timed plan -> inserts [{kind, style, from, to, ...}] in seconds, in time order. Each line gets at most
 * one, they never cover the title, presenter, comment or help beats, and they keep apart.
 * opts.style(kind) picks the brand's style and opts.place(kind) its placement, full screen or over the
 * scene (server/cutouts.mjs styler, placer); opts.media is the creator's
 * material matched to lines ({"<s>-<l>": {name, kind, dur, url}}), which always gets its line.
 */
export function direct(plan, root, opts = {}) {
  const out = [];
  let last = -Infinity;
  let prevType = null;
  const usedRefs = new Set();
  const usedDocs = new Set();
  const usedFootage = new Set();
  const usedQuotes = new Set();
  const usedTerms = new Set();
  let keywords = 0;
  const style = opts.style || (() => undefined);
  const place = opts.place || (() => 'full');
  const media = opts.media || {};
  plan.scenes.forEach((scene, si) => {
    scene.lines.forEach((line, li) => {
      const g = line.graphic?.type || 'cards';
      const type = g === 'continue' ? prevType || 'cards' : g;
      prevType = type;
      const len = line.end - line.start;
      const own = media[`${si}-${li}`];
      if (own) {
        // the creator's material: a muted clip or a photo over the line, or an audio clip in the pause after it
        let ins;
        if (own.kind === 'audio') {
          const from = line.end + 0.2;
          ins = {kind: 'audio', name: own.name, url: own.url, label: own.label, from, to: from + Math.max(1.5, (own.dur || 4))};
        } else {
          const from = line.start + 0.3;
          ins = {kind: own.kind === 'video' ? 'clip' : 'photo', name: own.name, url: own.url, label: own.label, from, to: Math.max(from + 2, line.end + 0.3)};
        }
        out.push({...ins, style: style(ins.kind), place: place(ins.kind), from: r2(ins.from), to: r2(ins.to), scene: si, line: li});
        last = ins.to;
        return;
      }
      if (QUIET.has(type) || ['hook', 'intro', 'midcta', 'helpcta', 'endcta', 'verdict'].includes(scene.kind)) return;
      if (TRAVEL_OWN.has(type)) return; // travel graphics and footage keep the screen (they are the visual)
      if (line.layout && line.layout !== 'voice') return; // a face moment: the creator and the plan's graphic share the screen, nothing more on top
      const t0 = line.start + Math.min(0.8, len * 0.2);
      if (t0 - last < FPS_GAP) return;
      const free = (kind) => !(SELF[kind] || []).includes(type);
      const fit = (kind) => Math.min(LEN[kind], Math.max(1.6, line.end - t0 + 0.4));
      let ins = null;
      const places = placesIn(line.vo, root);
      const fig = figureIn(line.vo);
      const src = sourceFor(plan, scene, line.vo);
      const day = dateIn(line.vo);
      const q = quoteFor(plan, line.vo);
      const term = termsIn(line.vo).filter((x) => x.length > 3 && !usedTerms.has(x.toLowerCase())).sort((a, b) => b.length - a.length)[0];
      if (q && free('quote') && !usedQuotes.has(q.text)) {
        const qs = plan.sources.find((x) => x.id === q.sourceId);
        const photo = Object.values(opts.photos || {}).find((p) => String(q.speaker).toLowerCase().split(/[^a-z0-9]+/).some((w) => w.length > 2 && p.words.includes(w)));
        ins = {kind: 'quote', speaker: q.speaker, text: q.text, marks: marksOf(q.text), outlet: qs?.outlet || '', date: shortDay(q.date || qs?.date), photo: photo?.url};
        usedQuotes.add(q.text);
      } else if (places.length && free('place')) {
        const named = src && plain(line.vo).toLowerCase().includes(src.outlet.split(/[·|(\-]/)[0].trim().toLowerCase());
        ins = {kind: 'place', places, label: named ? `${src.outlet.toUpperCase()} · ${shortDay(src.date)}` : places[0] === '*' ? 'WORLDWIDE' : places.length > 3 ? 'REGION' : places.join(' · ').toUpperCase()};
      }
      else if (fig && free('stat')) ins = {kind: 'stat', ...fig, source: src ? src.outlet : ''};
      else if (src && free('ref') && !usedRefs.has(src.id)) ins = {kind: 'ref', ...refData(src), others: plan.sources.filter((x) => x.id !== src.id).slice(0, 3).map(refData)};
      else if (src && free('doc') && !usedDocs.has(src.id)) ins = {kind: 'doc', ...refData(src)}; // seen as a clipping: now its page, key line marked
      else if (src && free('footage') && !usedFootage.has(src.id)) ins = {kind: 'footage', ...refData(src)};
      else if (day && free('date')) ins = {kind: 'date', text: day, sub: src ? src.outlet.toUpperCase() : ''};
      else if (term && keywords < 5 && len > 2.5) {
        ins = {kind: 'keyword', text: term, sub: scene.title?.toUpperCase?.() || ''};
        usedTerms.add(term.toLowerCase());
        keywords++;
      }
      else if (len > 6 && free('footage')) {
        const s = plan.sources.find((x) => !usedFootage.has(x.id)) || plan.sources[0];
        if (s) ins = {kind: 'footage', ...refData(s)};
      }
      if (!ins) return;
      const from = Math.max(t0, line.start + 0.5);
      out.push({...ins, style: style(ins.kind), place: place(ins.kind), from: r2(from), to: r2(from + fit(ins.kind)), scene: si, line: li});
      if (ins.kind === 'ref') usedRefs.add(ins.sourceId);
      if (ins.kind === 'doc') usedDocs.add(ins.sourceId);
      if (ins.kind === 'footage') usedFootage.add(ins.sourceId);
      last = from + fit(ins.kind);
    });
  });
  return out;
}
const r2 = (x) => Math.round(x * 100) / 100;

/** One line for people: "2 reference flashes, 1 map inset, …". */
export function summary(inserts) {
  const names = {ref: ['reference flash', 'reference flashes'], quote: ['quote card', 'quote cards'], doc: ['source capture', 'source captures'], place: ['map inset', 'map insets'], stat: ['number pop', 'number pops'], date: ['date stamp', 'date stamps'], keyword: ['keyword highlight', 'keyword highlights'], footage: ['footage insert', 'footage inserts'], clip: ['clip of yours', 'clips of yours'], audio: ['audio clip of yours', 'audio clips of yours'], photo: ['photo of yours', 'photos of yours']};
  const n = {};
  inserts.forEach((x) => (n[x.kind] = (n[x.kind] || 0) + 1));
  return Object.entries(names).filter(([k]) => n[k]).map(([k, [one, many]]) => `${n[k]} ${n[k] === 1 ? one : many}`).join(', ');
}
