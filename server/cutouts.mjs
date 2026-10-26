// The cutout style library: every kind of insert the visual director lays over the graphics comes in
// several pre-built styles. The brand picks which styles it uses per category (all, or some), so
// videos stay consistent; the director rotates through the picked ones in a fixed order. Every style
// is drawn in the brand's tuned colours and the video's theme (scenes/Inserts.tsx).
//   brand/profile.json  cutouts: {<category>: [style ids]}   (missing or empty = every style)
//                       cutoutPlace: {<category>: "full" | "over"}   (missing = full)
// Placement: "full" takes the whole screen for its moment (the scene cuts away to it on the theme's
// backdrop, then cuts back); "over" lays it on one side of the scene, which steps back behind it.
//   brand/reference/cutouts/<category>-<style>.jpg           sample stills for the Brand page
import path from 'node:path';

export const CATEGORIES = [
  {id: 'ref', name: 'Reference flashes', about: 'A source\'s headline flashes in when a line leans on it.', styles: [
    {id: 'slam', name: 'Clipping slam', about: 'Newspaper-style clipping slams in with a camera flash and a highlighter sweep.'},
    {id: 'browser', name: 'Browser card', about: 'The article in a browser window, URL typed, headline marked.'},
    {id: 'torn', name: 'Torn paper', about: 'Torn-out newsprint pinned with tape, slightly tilted.'},
    {id: 'stack', name: 'Clipping stack', about: 'Several outlets\' clippings fan out, the current one on top.'},
    {id: 'glitch', name: 'Glitch headline', about: 'Outlet and headline glitch in on a dark bar with the brand stripe.'},
  ]},
  {id: 'quote', name: 'People and quotes', about: 'A person named in a line, with what they said and the key words highlighted.', styles: [
    {id: 'portrait', name: 'Portrait quote', about: 'Round portrait (photo or initials), name, role, quote with highlights.'},
    {id: 'pull', name: 'Pull quote', about: 'Big quotation marks and the quote set like a magazine pull quote.'},
    {id: 'social', name: 'Social post', about: 'The statement shown as a post card with name, handle line and date.'},
    {id: 'lower', name: 'Lower third', about: 'Documentary lower third: name bar, then the quote line by line.'},
    {id: 'split', name: 'Split card', about: 'Photo or silhouette on one half, the quote on the other.'},
  ]},
  {id: 'doc', name: 'Source capture and text highlight', about: 'A page of the source with its key line marked.', styles: [
    {id: 'marker', name: 'Highlighter', about: 'A document page; the key line gets a highlighter stroke.'},
    {id: 'lens', name: 'Magnifier', about: 'The page dims and a magnifier lens zooms into the key line.'},
    {id: 'circle', name: 'Hand circle', about: 'A screenshot with a hand-drawn circle and arrow round the key line.'},
    {id: 'redact', name: 'Redacted reveal', about: 'Black redaction bars; the key line is revealed.'},
  ]},
  {id: 'keyword', name: 'Keyword highlights', about: 'A term the line explains, shown big for a moment.', styles: [
    {id: 'marker', name: 'Marker', about: 'The word with a brand-colour marker stroke behind it.'},
    {id: 'underline', name: 'Underline', about: 'The word with an animated underline and a small label.'},
    {id: 'box', name: 'Boxed', about: 'The word framed by a drawn box with corner ticks.'},
    {id: 'type', name: 'Typewriter', about: 'The word typed out letter by letter with a cursor.'},
    {id: 'glitch', name: 'Glitch', about: 'The word glitches in and settles.'},
  ]},
  {id: 'map', name: 'Maps', about: 'A map inset when a line names a place; the plan sets which places, the style sets the look.', styles: [
    {id: 'tactical', name: 'Tactical', about: 'Dark map, grid, pulsing pins and activity blips.'},
    {id: 'atlas', name: 'Paper atlas', about: 'Cream paper, ink borders, hand-placed pins.'},
    {id: 'flat', name: 'Flat', about: 'Clean flat land in brand tints, simple pins.'},
    {id: 'satellite', name: 'Night satellite', about: 'Deep blue globe look with glowing borders and city lights.'},
    {id: 'ink', name: 'Newsprint', about: 'Black-and-white halftone map like a printed newspaper.'},
  ]},
  {id: 'clip', name: 'Clip players', about: 'A source page or your own video clip, played in a frame.', styles: [
    {id: 'rec', name: 'REC camera', about: 'Camera viewfinder: REC dot, timecode, corners, scan lines.'},
    {id: 'tv', name: 'Old TV', about: 'Curved CRT in a wooden set, scan lines and colour fringing.'},
    {id: 'phone', name: 'Phone', about: 'Upright phone screen, as if filmed or shared on a phone.'},
    {id: 'projector', name: 'Film projector', about: 'Flickering projected film with sprocket edge and grain.'},
    {id: 'monitor', name: 'Newsroom monitor', about: 'A flat monitor with a LIVE bug and a lower bar.'},
  ]},
  {id: 'audio', name: 'Audio players', about: 'Your own audio clip (a call, a statement, a recording) with a look and a sound.', styles: [
    {id: 'phone', name: 'Old phone line', about: 'A handset and line graphic; the audio is filtered to sound like a phone call.'},
    {id: 'radio', name: 'Vintage radio', about: 'A radio dial and speaker grille; warm, narrow radio sound.'},
    {id: 'studio', name: 'Clean waveform', about: 'A clean waveform card with the speaker\'s name; audio as recorded.'},
    {id: 'voicemail', name: 'Voicemail', about: 'A voicemail screen with a play bar; slightly compressed sound.'},
    {id: 'cassette', name: 'Cassette', about: 'Tape reels turning; warm tape sound with a little hiss.'},
  ]},
  {id: 'photo', name: 'Photos', about: 'Your own photos, matched to the line they fit.', styles: [
    {id: 'polaroid', name: 'Polaroid', about: 'A pinned instant photo with a handwritten caption.'},
    {id: 'frame', name: 'Framed', about: 'A clean framed photo with a caption bar.'},
    {id: 'kenburns', name: 'Full screen pan', about: 'The photo fills the screen with a slow pan and zoom.'},
    {id: 'board', name: 'Evidence board', about: 'Pinned to a cork board with string to a label.'},
  ]},
  // travel and places graphics (the Remote Documentary kit): the plan's own graphics, styled per brand
  {id: 'placelabel', group: 'travel', graphic: 'footage', name: 'Place labels on footage', about: 'The name of the place (and its fee or district) over the travel footage.', styles: [
    {id: 'lower', name: 'Lower third', about: 'A clean name bar with the brand stripe, bottom left.'},
    {id: 'postcard', name: 'Postcard', about: '"Greetings from" postcard with a stamp box, tilted in.'},
    {id: 'stamp', name: 'Passport stamp', about: 'An ink stamp that thumps onto the footage.'},
    {id: 'pass', name: 'Boarding pass', about: 'A boarding pass slides in with the destination and a barcode.'},
    {id: 'pin', name: 'Map pin', about: 'A map pin drops in with the place card beside it.'},
    {id: 'ticket', name: 'Entry ticket', about: 'An "admit one" ticket with the entry fee.'},
    {id: 'countdown', name: 'Countdown number', about: 'A huge number for top-5 lists, the place name beside it.'},
  ]},
  {id: 'travelmap', group: 'travel', graphic: 'map', name: 'Destination maps', about: 'Zooms from the world into the country, cities and areas the plan names.', styles: [
    {id: 'zoom', name: 'Dark zoom', about: 'Dark map, brand-tinted country, pins with labels.'},
    {id: 'atlas', name: 'Paper atlas', about: 'Cream paper, ink borders, italic labels.'},
    {id: 'flat', name: 'Flat', about: 'Clean flat land in brand tints.'},
    {id: 'satellite', name: 'Night satellite', about: 'Deep blue with glowing borders.'},
    {id: 'ink', name: 'Newsprint', about: 'Black-and-white halftone map.'},
  ]},
  {id: 'route', group: 'travel', graphic: 'route', name: 'Routes and journeys', about: 'How to get there and around: stops joined on the map with times.', styles: [
    {id: 'flight', name: 'Flight arcs', about: 'Curved flight paths with a plane, on a night map.'},
    {id: 'train', name: 'Train line', about: 'A rail line drawn station to station.'},
    {id: 'road', name: 'Road trip', about: 'A winding road with a car on a paper map.'},
    {id: 'dotted', name: 'Adventure trail', about: 'A dotted trail ending in an X, treasure-map style.'},
  ]},
  {id: 'roadtrip', group: 'travel', graphic: 'roadtrip', name: 'Road trips and itineraries', about: 'A trip inside a region on an illustrated map: the stops, key areas along the way, distances and times.', styles: [
    {id: 'atlas', name: 'Road atlas', about: 'A paper road atlas: fields and contours, a yellow road with its shield, an odometer and the itinerary beside it.'},
    {id: 'nav', name: 'Navigation app', about: 'A dark navigation screen: the route glowing, the next stop, time and km left.'},
    {id: 'journal', name: 'Travel journal', about: 'Sketched on a notebook page: an inked trail, circled stops and a taped itinerary note.'},
    {id: 'transit', name: 'Line diagram', about: 'The itinerary as a metro line: stations, legs and key areas branching off.'},
  ]},
  {id: 'weather', group: 'travel', graphic: 'weather', name: 'Weather and seasons', about: 'The 12 months with the best, shoulder and months to avoid.', styles: [
    {id: 'chart', name: 'Month chart', about: 'Temperature bars coloured by season, rain under each month.'},
    {id: 'app', name: 'Forecast app', about: 'A phone weather app listing the months, best months beside it.'},
    {id: 'calendar', name: 'Season calendar', about: 'Twelve month tiles with icons and BEST stamps.'},
  ]},
  {id: 'tiers', group: 'travel', graphic: 'tiers', name: 'Prices and budgets', about: 'Hotel tiers per night and daily budgets, with the breakdown.', styles: [
    {id: 'columns', name: 'Tier columns', about: 'Side-by-side cards with a stacked cost breakdown.'},
    {id: 'receipt', name: 'Receipts', about: 'Printed receipts per tier with a TOTAL line.'},
    {id: 'tags', name: 'Price tags', about: 'Swinging price tags in brand colours.'},
  ]},
  {id: 'phrases', group: 'travel', graphic: 'phrases', name: 'Local phrases', about: 'Phrases in the local language with how to say them.', styles: [
    {id: 'cards', name: 'Flashcards', about: 'Cards flip in with the phrase, sound-out and meaning.'},
    {id: 'bubbles', name: 'Speech bubbles', about: 'A chat of speech bubbles, the sound-out under each.'},
    {id: 'translator', name: 'Translator app', about: 'A phone translator types each phrase.'},
  ]},
  {id: 'dosdonts', group: 'travel', graphic: 'dosdonts', name: 'Manners, rules and scams', about: 'Do\'s and don\'ts, local rules and scams to avoid.', styles: [
    {id: 'cards', name: 'Do / Don\'t cards', about: 'Two columns of green and red cards.'},
    {id: 'signs', name: 'Road signs', about: 'Green tick and red prohibition signs.'},
    {id: 'stamped', name: 'Stamped list', about: 'A paper list stamped with ticks and crosses.'},
  ]},
  {id: 'rating', group: 'travel', graphic: 'rating', name: 'Verdict and ratings', about: 'The final scores and who the place is best for.', styles: [
    {id: 'scorecard', name: 'Scorecard', about: 'Scores per criterion and an overall ring out of 10.'},
    {id: 'stars', name: 'Stars', about: 'Star rows filling up per criterion.'},
    {id: 'bars', name: 'Rating bars', about: 'Bars filling to each score, coloured by result.'},
  ]},
];

/** A plan graphic -> the travel category that styles it (travel plans only). */
export const GRAPHIC_CAT = Object.fromEntries(CATEGORIES.filter((c) => c.graphic).map((c) => [c.graphic, c.id]));

/** A travel plan with each styled graphic given the brand's next kept style, in order. */
export function styleGraphics(plan, profile) {
  if (!plan.kit || plan.kit === 'news') return plan;
  const styles = brandStyles(profile);
  const n = {};
  return {...plan, scenes: plan.scenes.map((s) => ({...s, lines: s.lines.map((l) => {
    const cat = GRAPHIC_CAT[l.graphic?.type];
    if (!cat) return l;
    // a look the creator's plan asked for ("map:atlas") wins over the rotation
    const asked = String(l.graphic.style || '').split(':').pop();
    if (asked && CATEGORIES.find((c) => c.id === cat).styles.some((x) => x.id === asked)) return {...l, graphic: {...l.graphic, style: asked}};
    // a route keeps to its way of travel when that style is kept (a flight never drawn as a road)
    if (cat === 'route') {
      const how = /FLIGHT|FLY|AIR|PLANE/i.test(l.graphic.kicker) ? 'flight' : /TRAIN|RAIL|METRO/i.test(l.graphic.kicker) ? 'train' : /ROAD|DRIVE|CAR|BUS|COACH/i.test(l.graphic.kicker) ? 'road' : '';
      if (how && styles[cat].includes(how)) return {...l, graphic: {...l.graphic, style: how}};
    }
    const i = n[cat] || 0;
    n[cat] = i + 1;
    return {...l, graphic: {...l.graphic, style: styles[cat][i % styles[cat].length]}};
  })}))};
}

/** Kinds of insert -> their category (stat and date keep one look each). */
export const CATEGORY_OF = {ref: 'ref', footage: 'clip', clip: 'clip', quote: 'quote', doc: 'doc', keyword: 'keyword', place: 'map', audio: 'audio', photo: 'photo'};

/** The styles the brand uses, per category (an empty or unknown list means all). */
export function brandStyles(profile) {
  const pick = profile?.cutouts || {};
  return Object.fromEntries(CATEGORIES.map((c) => {
    const ok = (pick[c.id] || []).filter((s) => c.styles.some((x) => x.id === s));
    return [c.id, ok.length ? ok : c.styles.map((s) => s.id)];
  }));
}

export const PLACES = ['full', 'over'];
/** Kinds with one look and no category: how they sit by default. */
const PLACE_OF_KIND = {stat: 'full', date: 'over'};

/** Placement per category the brand uses (full screen unless it chose "over"). */
export function brandPlaces(profile) {
  const pick = profile?.cutoutPlace || {};
  return Object.fromEntries(CATEGORIES.map((c) => [c.id, PLACES.includes(pick[c.id]) ? pick[c.id] : 'full']));
}

/** kind -> "full" | "over" for this brand. */
export function placer(profile) {
  const places = brandPlaces(profile);
  return (kind) => places[CATEGORY_OF[kind]] || PLACE_OF_KIND[kind] || 'full';
}

/** Cleans a placement choice from the Brand page (only the categories set to "over" are kept). */
export function cleanPlaces(v) {
  if (!v || typeof v !== 'object') return {};
  return Object.fromEntries(CATEGORIES.filter((c) => !c.graphic && v[c.id] === 'over').map((c) => [c.id, 'over']));
}

/** Cleans a cutouts choice from the Brand page. */
export function cleanCutouts(v) {
  if (!v || typeof v !== 'object') return {};
  return Object.fromEntries(CATEGORIES.map((c) => [c.id, [...new Set((Array.isArray(v[c.id]) ? v[c.id] : []).filter((s) => c.styles.some((x) => x.id === s)))]]).filter(([, l]) => l.length));
}

/** Rotates through the picked styles per category, in order, so a video uses them evenly. */
export function styler(profile) {
  const styles = brandStyles(profile);
  const n = {};
  return (kind) => {
    const cat = CATEGORY_OF[kind];
    if (!cat) return undefined;
    const list = styles[cat];
    const i = n[cat] || 0;
    n[cat] = i + 1;
    return list[i % list.length];
  };
}

export const samplesDir = (root) => path.join(root, 'brand', 'reference', 'cutouts');
export const sampleName = (cat, style) => `${cat}-${style}.jpg`;
