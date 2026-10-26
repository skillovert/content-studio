// Taxonomy and journalism standards (BRAND-GUIDE.md Part A), as data the app can reason with.
// Each channel keeps its own taxonomy in <workspace>/brand/taxonomy.json (written by the brand-setup skill
// from the channel's taxonomy and standards, same shape as data/taxonomy.json: order, fields, standards,
// formats), plus the creator's hashtag edits. A channel without its own fields uses the bundled
// data/taxonomy.json as a starting point.
import path from 'node:path';
import {APP_DIR, readJson, writeJson, stripMd} from './workspace.mjs';

export const CARD_FIELDS = ['topic', 'section', 'format', 'label', 'region', 'industry', 'audience', 'breakout', 'cause'];

export function loadTaxonomy(root) {
  const bundled = readJson(path.join(APP_DIR, 'data', 'taxonomy.json'));
  const over = readJson(path.join(root, 'brand', 'taxonomy.json'), {hashtags: {}});
  const tax = over.fields ? {...bundled, ...over, own: true} : bundled;
  for (const [field, map] of Object.entries(over.hashtags || {})) {
    for (const v of tax.fields[field]?.values || []) if (v.value in map) v.hashtag = map[v.value];
  }
  return tax;
}

export function setHashtag(root, field, value, hashtag) {
  const file = path.join(root, 'brand', 'taxonomy.json');
  const over = readJson(file, {note: 'Owner overrides for Content Studio (hashtag per taxonomy value).', hashtags: {}});
  over.hashtags = over.hashtags || {};
  over.hashtags[field] = over.hashtags[field] || {};
  const tag = String(hashtag || '').trim();
  over.hashtags[field][value] = tag && !tag.startsWith('#') ? '#' + tag.replace(/\s+/g, '') : tag.replace(/\s+/g, '');
  writeJson(file, over);
}

export const valuesOf = (tax, field) => (tax.fields[field]?.values || []).map((v) => v.value);

// Playlist names always come from the taxonomy (BRAND-GUIDE A1, decision 24 Oct 2026): a Topic first,
// or another value that names a subject. Format and News label are not names.
export const NAME_FIELDS = ['topic', 'industry', 'breakout', 'section', 'region', 'audience', 'cause'];
export const nameField = (tax, name) => NAME_FIELDS.find((f) => valuesOf(tax, f).includes(name)) || null;

// Pick the known taxonomy values out of free text ("Breaking News (owner kept it…)" -> ["Breaking"]).
// Longest values first, so "Social Media" wins over "Media"; text in parentheses is a note, not a value.
export function pickValues(tax, field, text) {
  const note = (String(text).match(/\(([^)]*)\)/) || [])[1] || '';
  let rest = stripMd(String(text).replace(/\([^)]*\)/g, ' '));
  const found = [];
  for (const v of [...valuesOf(tax, field)].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(^|[^A-Za-z0-9])${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'i');
    const m = re.exec(rest);
    if (m) {
      found.push([m.index, v]);
      // blank it out but keep positions, so the order of appearance survives (the lead Cause comes first)
      rest = rest.slice(0, m.index) + m[0].replace(/./g, ' ') + rest.slice(m.index + m[0].length);
    }
  }
  return {values: found.sort((a, b) => a[0] - b[0]).map((x) => x[1]), note};
}

// Rules from A1: what a complete card needs. Returns a list of plain-language problems.
/** opts.kit: a kit from the app (server/kits.mjs) brings its own flow, so the format needs no Part C flow. */
export function cardProblems(tax, card, opts = {}) {
  const out = [];
  for (const field of CARD_FIELDS) {
    const f = tax.fields[field];
    const n = (card[field] || []).length;
    if (f.rule === 'min1' && n < 1) out.push(`${f.label}: pick at least one`);
    if (f.rule === 'one' && n !== 1) out.push(`${f.label}: pick exactly one`);
    if (field === 'label' && n > 1) out.push('News label: pick one at most');
  }
  const fmt = (card.format || [])[0];
  if (fmt && (!opts.kit || opts.kit === 'news') && tax.formats[fmt]?.flow !== 'defined') out.push(`Format ${fmt}: its flow is not yet defined (BRAND-GUIDE Part C), so it cannot be produced yet`);
  return out;
}

// Which standards from A2 apply to a card (or to a playlist's defaults).
export function applicableStandards(tax, card, {media = true, partner = false} = {}) {
  return tax.standards.filter((s) => {
    const a = s.appliesTo;
    if (a.all) return true;
    if (a.media && media) return true;
    if (a.partner && partner) return true;
    return Object.entries(a).some(([field, list]) => Array.isArray(list) && (card[field] || []).some((v) => list.includes(v)));
  });
}

// Hashtags for descriptions, in taxonomy order (Topic first, then Breakout, Cause, Region, Industry, Audience).
export function hashtagsFor(tax, card, max = 12) {
  const order = ['topic', 'breakout', 'label', 'cause', 'region', 'industry', 'audience', 'format'];
  const seen = new Set();
  const out = [];
  for (const field of order) {
    for (const value of card[field] || []) {
      const tag = tax.fields[field].values.find((v) => v.value === value)?.hashtag;
      if (tag && !seen.has(tag.toLowerCase())) {
        seen.add(tag.toLowerCase());
        out.push(tag);
      }
    }
  }
  return out.slice(0, max);
}

// How a card value is written in Markdown: News labels always carry "News" (decision 24 Oct 2026).
export const showValue = (field, v) => (field === 'label' ? `${v} News` : v);
