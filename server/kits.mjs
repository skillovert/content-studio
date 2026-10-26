// Video kits: a ready-made flow a playlist picks, so a creator chooses "what kind of video" once and
// Content Studio plans, builds and records every video of that playlist the same way. A kit holds the
// story shape, the extra graphics, how the hosts appear and what the plan is told. The News kit is the
// channel's own flow (BRAND-GUIDE Part C); the others come with the app and count as defined flows.
//   playlist.json  kit: "<id>", hosts: [{name, gender}]   (1 to 3 hosts, the voices of every video)
//   video.json     kit, length: short | standard | long
import {NEWS_SCENES} from './plan-schema.mjs';

export const TRAVEL_SCENES = [
  ['hook', 'Hook montage (first 20-25 s): fast footage of the most striking views, food and street life, and one stakes line ("Before you book... the things nobody tells you about money, safety and manners"). No welcome, no logo, no hosts.'],
  ['intro', 'Studio intro: the hosts on camera like guests on a programme; welcome to the playlist, the destination and the promise (any budget, everything you need); the chapter list as a checklist graphic.'],
  ['geography', 'Where it is: a map zooming from the world into the country and the city; borders, regions, main airports, flight connections, terrain.'],
  ['weather', 'Best time to visit: the 12-month weather chart, peak, shoulder and months to avoid, with seasonal footage.'],
  ['sights', 'Top sights (a short studio re-anchor first): about five places with footage, the place name and the entry fee as a lower third; hosts alternate.'],
  ['culture', 'Culture and manners (studio re-anchor first): do\'s and don\'ts, tipping, dress, religious sites, how to greet; footage of daily life.'],
  ['safety', 'Safety, scams and language: common tourist scams, how safe it is for solo travellers, couples and families, emergency numbers, and phrase cards with how to say them.'],
  ['stay', 'Where to stay (studio re-anchor first): a map of the best areas (for budget, families, nightlife) and budget, mid-range and luxury stays with prices per night.'],
  ['midcta', 'Mid-video question for the comments, tied to the choice just shown (e.g. "the cliffside hotel or the city centre?").'],
  ['budget', 'Realistic budget (studio re-anchor first): daily budgets for backpacker, comfort and luxury travellers, broken into stay, food, transport and activities.'],
  ['transport', 'Getting around: airport transfer, metro or bus passes and prices, taxis and the ride-hailing apps used there, renting a car.'],
  ['itinerary', 'A ready itinerary: what to do day by day for a short trip (e.g. 3 or 5 days), on a timeline or map.'],
  ['history', 'History in two minutes (studio re-anchor first): how the place came to be, on a timeline with archival photos and old maps.'],
  ['facts', 'Fascinating facts: three or four surprising, verified facts (records, odd laws, geography) as pop cards over footage.'],
  ['verdict', 'Final verdict (studio): scores for tourist friendliness, value for money, safety and more, and who the place is best for.'],
  ['endcta', 'End question (studio, all hosts): a pick-one question about the places shown, and the next video of the playlist.'],
];

// Graphics only the travel kit uses (described for the plan in plan-schema.mjs GRAPHICS_EXTRA).
export const TRAVEL_GRAPHICS = ['footage', 'weather', 'tiers', 'phrases', 'dosdonts', 'rating'];

/** Target length per choice (minutes) and the words it takes at the studio's pace (2.6 words/s). */
export const LENGTHS = {short: [12, 16], standard: [18, 24], long: [25, 30]};

export const KITS = {
  news: {id: 'news', name: 'News', about: 'The channel\'s News flow (BRAND-GUIDE Part C).', scenes: NEWS_SCENES, graphics: [], hosts: false},
  'travel-doc': {
    id: 'travel-doc',
    name: 'Remote Documentary: Travel and Places',
    about: 'A full guide to one destination, made from home: licensed footage, maps and graphics with your voices over them, and short studio moments of the hosts between chapters.',
    scenes: TRAVEL_SCENES,
    graphics: TRAVEL_GRAPHICS,
    hosts: true,
    defaultLength: 'standard',
  },
  // the creator's own trip footage, edited: assets + story -> a cut on a timeline (server/assets.mjs, server/edit.mjs)
  'travel-edit': {
    id: 'travel-edit',
    name: 'Travel Video Editing: from your own footage',
    about: 'Edit what you recorded on the trip. Add your clips, photos, voice notes and music, tell the story, and Claude cuts it: real moments with their own sound, your voice-over, pieces to camera and on-brand maps and graphics. You change anything on the timeline.',
    scenes: [],
    graphics: TRAVEL_GRAPHICS,
    hosts: true,
    maxHosts: 6,
    edit: true,
  },
};
export const kitOf = (playlist) => KITS[playlist?.kit] || KITS.news;
export const kitList = () => Object.values(KITS).map(({id, name, about, hosts, maxHosts, edit}) => ({id, name, about, hosts, maxHosts: maxHosts || 3, edit: Boolean(edit)}));

/** Cleans the hosts of a playlist: 1 to 3 (an editing kit: up to 6 speakers), each with a name and a gender (for the script's grammar and the dub voices). */
export function cleanHosts(list, max = 3) {
  const out = (Array.isArray(list) ? list : [])
    .map((h) => ({name: String(h?.name || '').replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 40), gender: ['female', 'male'].includes(h?.gender) ? h.gender : ''}))
    .filter((h) => h.name);
  const seen = new Set();
  return out.filter((h) => !seen.has(h.name.toLowerCase()) && seen.add(h.name.toLowerCase())).slice(0, max);
}

/** A playlist as one video sees it. The playlist sets the defaults (kit, format, hosts); a video may set its own
 * in video.json (a two-host episode in a one-host playlist, an analysis in a news playlist), so each video follows
 * the right flow. */
export function forVideo(tax, playlist, v = {}) {
  const base = KITS[playlist.kit] ? playlist.kit : 'news';
  const kit = KITS[v?.kit] ? v.kit : base;
  const formats = (tax.fields?.format?.values || []).map((x) => x.value);
  const format = v?.format && formats.includes(v.format) ? v.format : playlist.format;
  const max = KITS[kit].maxHosts || 3;
  const hosts = cleanHosts(Array.isArray(v?.hosts) && v.hosts.length ? v.hosts : playlist.hosts, max);
  const flow = kit !== 'news' || tax.formats?.[format]?.flow === 'defined' ? 'defined' : 'not yet defined';
  const own = {kit: kit !== base, format: format !== playlist.format, hosts: Boolean(Array.isArray(v?.hosts) && v.hosts.length)};
  return {...playlist, kit, kitName: KITS[kit].name, format, hosts, flow, own};
}

/** Who may speak a line: each host, plus "all" (said together, or the studio shot of every host) when there are two or three. */
export const speakersOf = (hosts) => (hosts.length > 1 ? [...hosts.map((h) => h.name), 'all'] : hosts.map((h) => h.name));

const LANGS = {
  'ur-Latn': 'Roman Urdu (Urdu in Latin letters) with everyday English words; place names and English travel terms as they are',
  'ur-Arab': 'Urdu in Urdu script',
  'hi-IN': 'Hindi',
  ar: 'Arabic',
  en: 'English',
  'en-US': 'English',
  'en-GB': 'English',
};
export const languageName = (code) => LANGS[code] || LANGS[String(code).split('-')[0]] || code;

/** The travel kit's system prompt: who the channel is (brand profile), how to research and write. */
export function travelSystem(profile, guide) {
  return [
    `You plan remote travel documentaries for the YouTube channel ${profile.name || 'of the creator'}${profile.handle ? ` (${profile.handle})` : ''}${profile.site ? `, ${profile.site}` : ''}. Each video is a complete guide to one destination, made from home: licensed stock footage, maps and graphics carry about 80% of the screen with the hosts' voices over them, and the hosts appear in short studio moments (a second or third camera angle, like guests on a programme).`,
    'Your plan is checked by the creator before anything is built, then drives an automatic video (Remotion): graphics and footage slots per line, the hosts\' recording line by line, dubs, subtitles and the YouTube text.',
    '',
    'Build on the creator\'s own plan:',
    '- The concept may be a full or partial plan: chapters, lines, places, routes, sights, maps, prices, an itinerary, a look they want. It is the backbone. Keep every place, sight, route, fact, line and order they give (correct only what your sources show is wrong, and say so in openQuestions), then make it complete and richer: add the missing chapters of the story shape, verify and date their facts, add fees, opening hours, coordinates, travel times and prices, and give every moment a strong graphic.',
    '- Their visual ideas come first: a map they describe is drawn with the places they name (plus what makes it clear), a route with their stops and modes, a look they name ("atlas map", "train route", "receipt budget", "postcard label") goes in graphic.style. Otherwise leave graphic.style "" so the brand\'s kept styles rotate.',
    '- Record in conceptItems each part of their plan and where the plan uses it, and what you added around it.',
    '',
    'Research like a careful travel journalist:',
    '- Search the web and open (web fetch) every page you cite. Prefer official sources: tourism boards, government travel advisories, embassy and visa pages, official sites of sights (opening hours, entry fees), climate data (national weather services), transport operators\' fare pages. Use booking and review sites only for price ranges, dated.',
    '- Prices are realistic ranges with currency (local currency and US dollars), dated "as of". Visa, safety and entry rules change: date them and say where to check. Never invent a price, fee, rule, fact or quote; leave out what you cannot confirm and list it under openQuestions.',
    '- History and fascinating facts only from reliable sources (museums, encyclopaedias, academic or official pages), each cited.',
    '- Be fair to the place and its people: culture explained with respect, no stereotypes, safety stated calmly with sources.',
    '',
    'Write for the hosts:',
    '- Every line has a speaker (one host, or "all" for a line said together). Hosts take turns: switch the speaker every 45 to 90 seconds of narration, and split each chapter between them as the story shape says.',
    '- Grammar follows each speaker\'s gender: in languages where verbs, adjectives or pronouns change with the speaker (Urdu, Hindi, Arabic and others), every line is written for the gender of its speaker, and lines about another host use that host\'s gender.',
    '- In studio lines the hosts talk to each other by name now and then, warmly and briefly, then to the viewer. Never invent personal travel experiences; say "if you go..." rather than "when we went...", unless the concept says the hosts have been there.',
    '- Original narration over every clip: YouTube\'s reused-content rule wants the hosts\' own explanation, comparison and advice over licensed footage, never footage with music alone.',
    '',
    'Visuals (every line has a graphic):',
    '- footage: most lines show licensed B-roll. Give each footage line 1 to 3 shots in order (one shot per 3 to 5 seconds of the line), each with English stock-search words that find it on Pexels, Pixabay or Storyblocks (concrete: place, subject, time of day, angle, e.g. "istanbul blue mosque aerial sunset"), plus the on-screen place label and a small tag (entry fee, district).',
    '- map for geography, neighbourhoods and itineraries: countries by English name, cities and sights as places with "lat, lon" in detail; weather for the 12 months; tiers for hotel and daily budget tiers; phrases for language cards; dosdonts for manners and scams; rating for the verdict; roadtrip for drives, day trips and itineraries inside a region (stops with "lat, lon" and the distance and time of each leg, plus the key areas along the way: hills, lakes, food stops, viewpoints), route for long journeys between cities or countries; checklist for the chapter list; timeline for history and itineraries; number, bars, cards and table where they show a fact best.',
    '- Studio moments use layout "studio" (all hosts on camera, the studio angle) or a face layout for one host; everything else is layout "voice". Studio lines are about 15 to 20% of the lines: the intro, a 10 to 15 second re-anchor at the start of the big chapters (sights, culture, stay, budget, history), the verdict and the end question. Never show the hosts on the hook.',
    '- Use at least eight kinds of graphic across the video. On-screen words stay few (place names, numbers, short labels) so the video can be dubbed.',
    '',
    'Calls to action are specific questions, never "like and subscribe": a mid-video opinion question (e.g. "Would you pay $100 a night for the cliffside hotel, or stay in the centre?") and an end pick-one question about the places shown.',
    'The thumbnail: jargonTitle = the destination in 1 to 3 words; urduLine = a two-line hook in the voice language (cost or surprise), not a "threat + fix" line; thumbnail.lines gives the same hook in each dub language; stamp optional (e.g. "2026 GUIDE").',
    'newsLabel is "" (not news). The YouTube description: what the guide covers, the as-of date, a note that prices change, the footage credit line ("Footage: licensed stock and our own"), and any disclosure; chapters and sources are added by the app.',
    '',
    'When the plan is complete, call the submit_plan tool once with the whole plan. Do not write the plan as text.',
    ...(guide ? ['', '=== The channel\'s BRAND-GUIDE.md (its taxonomy, standards and tone; it wins where it is more specific) ===', guide] : []),
  ].join('\n');
}

/** The per-video part of the travel brief: hosts, language, length, story shape. */
export function travelBrief({hosts, voiceLanguage, length}) {
  const [lo, hi] = LENGTHS[length] || LENGTHS.standard;
  const who = hosts.map((h) => `${h.name} (${h.gender || 'gender not given'})`).join(', ');
  return [
    `Hosts: ${who}. ${hosts.length > 1 ? `Speakers: ${speakersOf(hosts).join(', ')}.` : `${hosts[0]?.name} speaks every line.`}`,
    `Voice-over language: ${languageName(voiceLanguage)}. Lines of 12 to 35 words.`,
    `Length: ${lo} to ${hi} minutes, so about ${Math.round(lo * 60 * 2.6)} to ${Math.round(hi * 60 * 2.6)} words of voice-over. Let the destination decide within that range; no filler.`,
    '',
    '## Story shape (Remote Documentary: Travel and Places)',
    TRAVEL_SCENES.map(([k, d], i) => `${i + 1}. ${k}: ${d}`).join('\n'),
    hosts.length > 1 ? `Share the chapters between the hosts (e.g. ${hosts[0].name} on geography, transport and history; ${hosts[1].name} on weather, culture and budget; sights split between them), and keep the studio lines a conversation.` : '',
  ].filter((l) => l !== '').join('\n');
}
