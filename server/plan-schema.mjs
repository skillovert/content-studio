// The video plan: what Claude returns (via the submit_plan tool, or a hand-off file) and what the
// plan PDF, the preview (Phase 3) and the recorder (Phase 4) read. Enums come from the taxonomy,
// so a plan can only use approved values (BRAND-GUIDE A1).
import {CATEGORIES} from './cutouts.mjs';

// Story shape of the News format (BRAND-GUIDE C1.2), in order.
export const NEWS_SCENES = [
  ['hook', 'Hook (with the News label)'],
  ['intro', 'Intro: the presenter\'s greeting and name, in the channel\'s language and style (brand guide)'],
  ['montage', 'Coverage montage and quote flashes'],
  ['timeline', 'Timeline'],
  ['map', 'Map of who was hit'],
  ['warnings', 'Agency warnings'],
  ['developments', 'Latest developments'],
  ['numbers', 'Numbers'],
  ['what', 'What it is'],
  ['how', 'How it works (simple analogy)'],
  ['risk', 'Who is at risk'],
  ['midcta', 'Mid CTA (a question tied to the story)'],
  ['fix', 'Fix steps'],
  ['recap', 'Recap ("developing story" + date)'],
  ['helpcta', 'Help CTA (comment FIX, free; share, subscribe)'],
];

const str = (description) => ({type: 'string', description});

// The on-screen graphic of one voice-over line. Content Studio builds the preview video from these,
// in the News look of N01 (brand/reference/inner-scenes-*.jpg). One shape for every type; fields a
// type does not use stay empty. Facts, numbers and quotes come only from the plan's sources.
export const GRAPHICS = [
  ['title', 'Opening title card on brand red: title = jargon (e.g. "PHP2Shell"), kicker = one mono sub line (e.g. "CVE-2026-109618 · CVSS 9.2")'],
  ['presenter', 'The presenter\'s photo with name and role; items = up to 3 agenda rows (label), e.g. "the news", "what is X", "fix your site"'],
  ['clippings', 'Paper news clippings in a footage frame: items = clippings (label = outlet, value = date, detail = headline); highlights = words to mark yellow'],
  ['quote', 'Dark quote card: title = speaker or outlet, kicker = "QUOTE · VIA <outlet> · <date>" (first word may be QUOTE, SOURCE, WARNING, ADVISORY), lines[0] = the verbatim quote, highlights = words to mark cyan'],
  ['timeline', 'Timeline: title = year, items = events in order (label = date like "20 Oct", value = one word like "leaked", detail = small sub line, tone), stamp = optional stamp on the latest event'],
  ['map', 'World map in a footage frame: title = frame label (e.g. "CHECK POINT RESEARCH · 22 OCT"), items = countries (label = country name in English, value = e.g. "14%"), tone bad = highlighted'],
  ['bars', 'Horizontal bars: kicker = source · date, title, items (label, value = number with %, tone; neutral = grey baseline)'],
  ['number', 'Big numbers: items (value = e.g. "167M" or "71%", label = what it counts, detail = source); a value with % draws a ring'],
  ['stamps', 'Rubber stamps side by side: items (label = e.g. PATCHED, detail = date, tone good or bad)'],
  ['cards', 'Labelled cards or chips: kicker (e.g. "WHO IS AT RISK"), title, items (label, value = group heading like RUNTIMES or APPS, detail = small tag, tone)'],
  ['terminal', 'Terminal or file window: kicker = window tag (e.g. "Ubuntu / Debian", "php.ini"), title = optional heading, lines = what it shows ("$ " starts a command, "# " a comment, "! " an error line, "+ " a good line), items = small notes under it'],
  ['flow', 'Icons joined by arrows: items in order (label, detail, tone), stamp = optional'],
  ['gauge', 'Severity gauge: kicker, title, items[0] = score (value e.g. "9.2", label e.g. "CVSS v4.0", detail e.g. "CRITICAL"), other items = cards (label e.g. CVE id, detail)'],
  ['table', 'Table: kicker, title, lines[0] = column headings split by "|", items = rows (label = col 1, value = col 2, detail = col 3, tone)'],
  ['versions', 'Version tiles: kicker, title, items (label = version, detail = small text, tone good = fixed, bad = no fix)'],
  ['comment', 'Comment CTA: title = the question (e.g. "hosting ? PHP version ?"), items = answer chips (tone accent = the picked one), lines[0] = a sample viewer comment, lines[1] = our reply'],
  ['checklist', 'Checklist: kicker, title, items (label, tone), stamp = optional (e.g. "UPDATED · 23 OCT 2026")'],
  ['help', 'Help CTA with the presenter\'s photo: items = chips (e.g. check, fix, upgrade), lines[0] = the sample comment (e.g. "FIX · WordPress · PHP 8.1"), kicker = small note (e.g. "free · no paid service")'],
  ['outro', 'Share / Like / Subscribe with the presenter\'s photo'],
  ['continue', 'Keep the previous line\'s graphic and reveal its next item'],
];

// Graphics of the travel kit (server/kits.mjs). Each is drawn in the style the brand keeps for it
// (server/cutouts.mjs travel categories); footage shots fill from the creator's licensed clips.
export const GRAPHICS_EXTRA = [
  ['footage', 'Full-screen licensed B-roll: title = the on-screen place label (e.g. "Rialto Bridge"), kicker = a small tag (e.g. "ENTRY · FREE", "#3 OF 5", a district), items = 1 to 3 shots in order, one per 3 to 5 seconds of the line (label = English stock-search words, concrete: place, subject, time of day, angle, e.g. "venice grand canal gondola sunset aerial"; detail = what the viewer should see), stamp = optional short note (e.g. "OPEN 9-18")'],
  ['route', 'A journey on the map: items = stops in order (label = place, detail = "lat, lon" in decimal degrees, value = time or distance to the next stop, e.g. "2h 10m"), kicker = how (FLIGHT, TRAIN, ROAD, FERRY, WALK), title = e.g. "Lahore → Istanbul"'],
  ['roadtrip', 'A trip or itinerary inside a region on an illustrated map (a drawn road, not real road data), with a car driving it and the distance running up: items = stops in order (label = place, detail = "lat, lon" in decimal degrees, value = distance and time from the previous stop, e.g. "62 km · 50 min"; first stop value ""), lines = key areas along the way, each "Name | lat, lon | kind | short note" (kind: hills, lake, river, forest, city, food, fuel, view, sight, rest, stay; e.g. "Kallar Kahar | 32.78, 72.70 | lake | peacocks and a lake stop"), stamp = the road\'s name for its shield (e.g. "M-2") or "", kicker = e.g. "ROAD TRIP · DAY 2", title = e.g. "Lahore → Islamabad". Use it for drives, day trips, multi-day itineraries and walks inside a region; route is for long journeys between cities or countries (flights, trains).'],
  ['weather', 'Best time to visit: items = the 12 months in order (label = Jan … Dec, value = average high in °C as a number, detail = rain in mm or "", tone good = best months, warn = shoulder, bad = avoid), kicker = source · as-of'],
  ['tiers', 'Price tiers side by side (hotels per night, daily budgets): kicker, title, items (label = tier e.g. "Backpacker" or "$$ Mid-range", value = price e.g. "$35/day", detail = breakdown "Stay $15 · Food $10 · Transport $5 · Activities $5" or an example area/stay, tone)'],
  ['phrases', 'Local phrase cards: kicker = the language, items (label = the phrase in the local language and script, value = how to say it, detail = the meaning in the voice-over language)'],
  ['dosdonts', 'Do\'s and don\'ts, or scams to avoid: kicker, title, items (label = a short rule, detail = why or how, tone good = do, bad = don\'t)'],
  ['rating', 'Final verdict: title = the one-line verdict, items = criteria (label e.g. "Value for money", value = a score like "9/10"), stamp = "BEST FOR · couples · solo travellers"'],
];

/** Every travel graphic style as "<graphic type>:<style>", for a plan that asks for a look. */
const TRAVEL_STYLES = CATEGORIES.filter((c) => c.graphic).flatMap((c) => c.styles.map((st) => ({id: `${c.graphic}:${st.id}`, about: st.name})));

export function graphicSchema(types = GRAPHICS, styles = null) {
  const tone = {type: 'string', enum: ['neutral', 'bad', 'good', 'warn', 'accent'], description: 'bad = red (threat), good = green (fixed), warn = amber, accent = highlighted'};
  return obj({
    type: {type: 'string', enum: types.map((g) => g[0]), description: types.map(([k, d]) => `${k}: ${d}`).join('\n')},
    kicker: str('Small mono label above the title (step badges: "STEP 1"), or ""'),
    title: str('Heading on screen, jargon only, or ""'),
    items: arr(obj({label: str('Item text'), value: str('Value, or ""'), detail: str('Small sub text, or ""'), tone}), 'Items in reveal order (empty when the type uses none)'),
    lines: arr(str('Line'), 'Quote text, terminal lines or comment lines (see the type)'),
    stamp: str('Stamp text like "LEAKED" or "PATCH NOW · 22 OCT 2026", or ""'),
    highlights: arr(str('Exact substring to highlight'), 'Words to highlight in quotes and clippings'),
    sourceId: str('Source id behind what is shown, or ""'),
    ...(styles ? {style: {type: 'string', enum: ['', ...styles.map((x) => x.id)], description: `The look of this graphic. "" = the brand's next kept style (the default). A style id only where the creator's own plan asks for that look (e.g. an atlas map, a train route, a receipt budget): ${styles.map((x) => `${x.id} (${x.about})`).join('; ')}`}} : {}),
  }, 'What is on screen while this line plays (preview and final video are built from it)');
}
const arr = (items, description) => ({type: 'array', items, description});
const obj = (properties, description) => ({type: 'object', description, properties, required: Object.keys(properties), additionalProperties: false});
const values = (tax, field) => tax.fields[field].values.map((v) => v.value);

/** Where the creator is on screen per line (creator-on-camera videos; graphics-only videos are all voice). studio = every host in the studio shot (kits with hosts). */
export const LAYOUTS = ['voice', 'studio', 'face-full', 'face-left', 'face-right', 'face-split', 'face-circle', 'face-corner', 'face-frame', 'face-phone'];

/** How much of the video shows the creator: share of lines with a face moment. */
export const FACE_AMOUNT = {little: 0.15, balanced: 0.3, lots: 0.55};

/**
 * kit: the playlist's kit (server/kits.mjs) and its hosts. The News kit keeps its schema as it was; a kit
 * with hosts adds a speaker to every line, the studio layout and its own scenes and graphics.
 */
export function planSchema(tax, {kit, hosts = []} = {}) {
  const travel = kit && kit.id !== 'news';
  const scenes = travel ? kit.scenes : NEWS_SCENES;
  const graphics = travel ? [...GRAPHICS.filter(([k]) => !['terminal', 'versions', 'help', 'gauge'].includes(k)).map(([k, d]) => (k === 'map' ? [k, 'Map in a footage frame, zooming in from the world: title = frame label (e.g. "TURKEY · WHERE IT IS"), items = countries (label = country name in English, value = a short note, tone accent = highlighted) or places (label = city, sight or area, detail = "lat, lon" in decimal degrees, value = a short note like "Best for families")'] : [k, d])), ...GRAPHICS_EXTRA] : GRAPHICS;
  const layouts = travel ? LAYOUTS : LAYOUTS.filter((l) => l !== 'studio');
  const speakers = hosts.length > 1 ? [...hosts.map((h) => h.name), 'all'] : hosts.map((h) => h.name);
  const one = (field, d) => ({type: 'string', enum: values(tax, field), description: d});
  const many = (field, d) => arr({type: 'string', enum: values(tax, field)}, d);
  return obj({
    title: str('Short working title in English, the jargon first (e.g. "PHP2Shell: Critical PHP RCE")'),
    titleRoman: str('YouTube title in Roman Urdu with everyday English words; jargon in "double quotes". Must match the body (No Hype).'),
    asOf: str('Date the facts are current to, YYYY-MM-DD'),
    newsLabel: {type: 'string', enum: ['', ...values(tax, 'label')], description: 'Honest News label for the as-of date; "" when none fits. Breaking/Developing only with Breaking Discipline.'},
    summary: str('Two or three sentences: what happened and why it matters to the audience'),
    causeApproach: str('How the lead Cause shapes the tone and depth of this piece'),
    card: obj({
      topic: many('topic', 'At least one; the first is the main Topic shown as CATEGORY'),
      section: one('section', 'Exactly one'),
      region: many('region', 'At least one'),
      industry: many('industry', 'Any that apply'),
      audience: many('audience', 'Any that apply'),
      breakout: many('breakout', 'Only when the story is one of these Pakistan breakouts'),
      cause: many('cause', 'At least one; the first is the lead Cause shown on the thumbnail'),
    }, 'Taxonomy card (BRAND-GUIDE A1). Format is fixed by the playlist.'),
    standards: arr(obj({
      name: {type: 'string', enum: tax.standards.map((s) => s.name)},
      how: str('How this piece meets the standard, concretely (which sources, what is flagged, what is left out)'),
    }), 'Every standard that applies to the card, with how it is met'),
    sources: arr(obj({
      id: str('Short id like S1, S2'),
      outlet: str('Publisher or organisation'),
      title: str('Headline or document title'),
      url: str('Full URL, opened and checked'),
      date: str('Publication date YYYY-MM-DD, or "" if none'),
      kind: {type: 'string', enum: ['primary', 'report', 'quote', 'data', 'concept'], description: travel ? 'primary = an official source (tourism board, government advisory, operator, the sight itself); data = prices, climate or statistics; concept = from the creator\'s concept' : 'primary = the original document; concept = provided in the owner\'s concept'},
    }), 'Sources, primary documents first'),
    scenes: arr(obj({
      kind: {type: 'string', enum: [...scenes.map((s) => s[0]), 'other']},
      title: str('Scene title in English'),
      visual: str('What is on screen and how it moves, using the News look (clippings, quote flash, map, stamps, step badges, terminal...). Illustrations only from sources.'),
      onScreen: arr(str('Short on-screen text: jargon and keywords only'), 'On-screen text items'),
      lines: arr(obj({
        ...(speakers.length ? {speaker: {type: 'string', enum: speakers, description: 'Who says this line: a host, or "all" for a line the hosts say together (and the studio shot of every host)'}} : {}),
        vo: travel ? str('One voice-over line in the voice-over language, written for the gender of its speaker; place names as they are; 12 to 35 words') : str('One voice-over line in Roman Urdu with everyday English words; jargon in "double quotes"; 6 to 25 words'),
        cue: str('What appears while this line plays'),
        layout: {type: 'string', enum: layouts, description: (travel ? 'studio = every host in the studio shot, full screen (intro, re-anchors, verdict, end question); a studio line with a graphic (the verdict\'s scores) shows the hosts for its first seconds, then the graphic. ' : '') + 'Where the creator is at the start of this line: voice = graphics only (her voice over them); face-full = on camera full screen; face-left / face-right = beside the graphic; face-split = a hard half-and-half split with the graphic; face-circle = a round bubble in a lower corner over the graphic; face-corner = a small picture-in-picture box in a top corner; face-frame = inside an old-TV set over the graphic; face-phone = inside a vertical phone frame beside the graphic. Graphics-only videos use voice for every line.'},
        faceFor: {type: 'number', description: 'Seconds her face shows from the start of the line before the graphic takes the whole screen (she then reads the rest off camera). 0 for voice lines; never more than the video\'s face limit.'},
        graphic: graphicSchema(graphics, travel ? TRAVEL_STYLES : null),
      }), 'Voice-over lines in order'),
      sourceIds: arr(str('Source id'), 'Sources this scene relies on'),
    }), 'Scenes in story order'),
    quotes: arr(obj({
      speaker: str('Name and role'),
      text: str('Verbatim quote'),
      sourceId: str('Source id'),
      date: str('YYYY-MM-DD'),
    }), 'Verbatim quotes used in quote flashes'),
    thumbnail: obj({
      jargonTitle: str(`Big white title: ${travel ? 'the destination in 1 to 3 words' : '1 to 3 words of jargon'}, at most ${THUMB.title} characters (it must fit the thumbnail at a large size)`),
      urduLine: travel ? str(`Two-line hook in the voice-over language (cost or surprise, e.g. "7 days\\nunder [[$500]]"), lines split by \\n, the key words wrapped in [[ ]]; at most ${THUMB.lineChars} characters per line`) : str(`Two-line Urdu (Nastaliq script) "threat + fix" line, lines split by \\n, fix words wrapped in [[ ]]; short: at most ${THUMB.lineChars} characters per line`),
      urduLineRoman: str('The same line in Roman Urdu'),
      lines: arr(obj({
        lang: str('Language code of a dub, e.g. en-US'),
        text: str(`The same two-line "threat + fix" line in that language (\\n between lines, fix words in [[ ]], at most ${THUMB.lineChars} characters per line)`),
      }), 'One entry per dub language of the playlist (none when it has no dubs); each dub gets its own thumbnail'),
      stamp: str('Suggested factual stamp pair for the thumbnail, e.g. "PATCH NOW · HELP OTHERS" (never MUST WATCH), or "" when no stamp fits the story. The creator confirms, changes or drops it per video.'),
      keyVisual: str('What the black key-visual box shows'),
    }, 'Thumbnail per BRAND-GUIDE C1.6'),
    youtube: obj({
      description: str('Roman Urdu description: News label and as-of date, what the video covers, the free FIX help line (no service is paid), the illustration disclaimer. No hashtags or sources here; they are added from the card and the source list.'),
      tags: arr(str('Search tag'), '10 to 20 tags'),
      hashtags: arr(str('Hashtag without #'), 'Story-specific hashtags only (taxonomy hashtags are added automatically)'),
    }),
    conceptItems: arr(str('An item the owner attached or linked in the concept, and where the plan uses it'), 'How the concept\'s own material is used'),
    openQuestions: arr(str('A question for the owner, or a fact that could not be confirmed'), 'Open questions and unconfirmed facts (empty when none)'),
  }, 'A complete video plan');
}

// Checks the parts the schema can't (non-empty lists, ids that resolve). Returns problems in words.
export function planProblems(plan) {
  const out = [];
  if (!plan || typeof plan !== 'object') return ['no plan'];
  for (const k of ['title', 'titleRoman', 'asOf', 'summary']) if (!String(plan[k] || '').trim()) out.push(`${k} is empty`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.asOf || '')) out.push('asOf must be YYYY-MM-DD');
  const c = plan.card || {};
  if (!c.topic?.length) out.push('card: no Topic');
  if (!c.region?.length) out.push('card: no Region');
  if (!c.cause?.length) out.push('card: no Cause');
  if (!c.section) out.push('card: no Section');
  if (!plan.sources?.length) out.push('no sources');
  if (!plan.scenes?.length) out.push('no scenes');
  const ids = new Set((plan.sources || []).map((s) => s.id));
  for (const [i, s] of (plan.scenes || []).entries()) {
    if (!s.lines?.length) out.push(`scene ${i + 1} has no voice-over`);
    for (const id of s.sourceIds || []) if (!ids.has(id)) out.push(`scene ${i + 1} cites unknown source ${id}`);
  }
  for (const q of plan.quotes || []) if (!ids.has(q.sourceId)) out.push(`quote by ${q.speaker} cites unknown source ${q.sourceId}`);
  out.push(...richnessProblems(plan));
  out.push(...thumbnailProblems(plan));
  return out;
}

// Thumbnail text must stay short so it reads at phone size and fits the layout in every language.
export const THUMB = {title: 16, titleWords: 3, lineChars: 24, lines: 2};
export function thumbnailProblems(plan) {
  const t = plan.thumbnail;
  if (!t) return [];
  const out = [];
  const title = String(t.jargonTitle || '').trim();
  if (title.length > THUMB.title || title.split(/\s+/).length > THUMB.titleWords) out.push(`thumbnail title "${title}" is too long: 1 to ${THUMB.titleWords} words, at most ${THUMB.title} characters`);
  const check = (text, what) => {
    const lines = String(text || '').replace(/\[\[|\]\]/g, '').split('\n').filter((l) => l.trim());
    if (lines.length > THUMB.lines || lines.some((l) => l.trim().length > THUMB.lineChars)) out.push(`thumbnail ${what} line is too long: at most ${THUMB.lines} lines of ${THUMB.lineChars} characters`);
  };
  check(t.urduLine, 'Urdu');
  for (const l of t.lines || []) check(l.text, l.lang);
  return out;
}

// Owner decision (24 Oct 2026): visuals are enriched and factual by default: graphs, maps and regions,
// timelines, flows, references (clippings, quotes, documents) and footage, from the sources. Plans with
// graphics are held to it; older plans without graphics are left alone.
export const RICH = ['clippings', 'quote', 'timeline', 'map', 'bars', 'number', 'flow', 'gauge', 'table', 'versions', 'terminal', 'stamps'];
// Travel kit: footage carries most of the screen, and at least eight kinds of graphic show the facts.
export const TRAVEL_RICH = ['footage', 'map', 'route', 'roadtrip', 'weather', 'tiers', 'phrases', 'dosdonts', 'rating', 'timeline', 'number', 'bars', 'table', 'cards', 'checklist', 'quote', 'stamps', 'flow'];
export function richnessProblems(plan) {
  const lines = (plan.scenes || []).flatMap((s) => s.lines || []);
  if (!lines.some((l) => l.graphic)) return [];
  const out = [];
  const missing = lines.filter((l) => !l.graphic?.type).length;
  if (missing) out.push(`${missing} voice-over line(s) have no graphic; every line needs one`);
  if (plan.kit && plan.kit !== 'news') {
    const types = new Set(lines.map((l) => l.graphic?.type).filter((t) => TRAVEL_RICH.includes(t)));
    const need = Math.min(8, Math.ceil(lines.length / 4));
    if (types.size < need) out.push(`visuals are too plain: ${types.size} kinds of graphic used (${[...types].join(', ') || 'none'}), at least ${need} expected (footage, map, route, weather, tiers, phrases, dosdonts, rating, timeline...)`);
    const footage = lines.filter((l) => l.graphic?.type === 'footage').length;
    if (lines.length >= 10 && footage < lines.length * 0.3) out.push(`only ${footage} of ${lines.length} lines show footage; about half or more should (licensed B-roll carries a remote documentary)`);
    const bare = lines.filter((l) => l.graphic?.type === 'footage' && !(l.graphic.items || []).some((it) => String(it.label || '').trim())).length;
    if (bare) out.push(`${bare} footage line(s) have no shot with stock-search words`);
    if (plan.hosts?.length) {
      const ok = new Set([...plan.hosts.map((h) => h.name), ...(plan.hosts.length > 1 ? ['all'] : [])]);
      const bad = lines.filter((l) => !ok.has(l.speaker)).length;
      if (bad) out.push(`${bad} line(s) have no speaker or an unknown one (speakers: ${[...ok].join(', ')})`);
    }
    return out;
  }
  const types = new Set(lines.map((l) => l.graphic?.type).filter((t) => RICH.includes(t)));
  const need = Math.min(6, Math.ceil(lines.length / 3));
  if (types.size < need) out.push(`visuals are too plain: ${types.size} kinds of factual graphic used (${[...types].join(', ') || 'none'}), at least ${need} expected (graphs/numbers, map, timeline, flow, clippings or quotes, table...)`);
  for (const s of plan.scenes || []) {
    const gs = (s.lines || []).map((l) => l.graphic?.type).filter(Boolean);
    if (['montage', 'warnings', 'developments', 'timeline', 'map', 'numbers'].includes(s.kind) && gs.length && !gs.some((t) => RICH.includes(t))) out.push(`scene "${s.title}" (${s.kind}) shows no factual graphic`);
  }
  return out;
}

// Estimated timing, same pacing as studio/tools/timeline.py (2.6 words/s, 0.45 s between lines,
// 0.6 s in and 0.9 s out per scene, 1.6 s minimum). Adds start/end seconds to every line and scene.
export const PACE = {wps: 2.6, gap: 0.45, sceneIn: 0.6, sceneOut: 0.9, minLine: 1.6};

export function withTiming(plan, pace = PACE) {
  let t = 0;
  const scenes = plan.scenes.map((s) => {
    const start = t;
    let c = start + pace.sceneIn;
    const lines = s.lines.map((l) => {
      const words = (String(l.vo).match(/[\w/=.\-']+/g) || []).length;
      const dur = Math.max(pace.minLine, words / pace.wps);
      const line = {...l, start: round(c), end: round(c + dur), words};
      c += dur + pace.gap + (Number(l.pause) || 0); // pause: the creator's audio clip plays after this line
      return line;
    });
    t = c - pace.gap + pace.sceneOut;
    return {...s, start: round(start), end: round(t), lines};
  });
  return {...plan, scenes, duration: round(t)};
}
const round = (x) => Math.round(x * 100) / 100;

export const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
