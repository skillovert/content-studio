// Editor page (#/p/<slug>/v/<folder>/edit) of an edited video: the footage bin, a player and a timeline with
// four tracks (Video, Over, Voice, Music) and scene bands. It plays the light working copies; the final render
// uses the originals. Saved as you work (edit/edit.json); "Save version" keeps a named copy.
// Keys: Space play/pause, S split, Delete remove, Ctrl+Z / Ctrl+Shift+Z undo / redo, ← → one frame (Shift: 1 s),
// I / O set the selected clip's start / end to the playhead.
// Graphics (step 5): "+ Graphic" adds one at the playhead from an idea, which Claude writes in the brand's look;
// any video or photo can be shown inside a cutout frame. Each is rendered on its own by Content Studio
// (server/pieces.mjs) and plays here as soon as it is made.
// Sound and colour (step 6): noise cleanup per clip, music that goes down under the voices, "Level the sound",
// and a colour grade per clip (looks, exposure, temperature...) drawn the same way the final draws it.
// Record and render (step 7): record a voice-over line, a piece to camera or a voice note at the playhead right
// here (the take goes to raw/recorded/ and takes the place of the line or space); make a 540p preview, then the
// final at 1080p, 2K or 4K with subtitles, chapters and the sound alone.

import {DUCK, GRADE_KEYS, LOOKS, cleanGrade, duckAt, gradeParts, talkIntervals} from './mix.js';

const TRACK_NAME = {main: 'Video', over: 'Over', voice: 'Voice', music: 'Music'};
const TRACKS = ['main', 'over', 'voice', 'music'];
const FPS = 30;
const ROW = 58;
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const uid = () => Math.random().toString(36).slice(2, 9);
const CUTOUT_NAME = {ref: 'Reference flash', quote: 'Quote', doc: 'Source page', keyword: 'Keyword', place: 'Map inset', stat: 'Number', date: 'Date stamp'};
// what each cutout shows, as [field, label] (the scene library's Insert fields)
const CUTOUT_FIELDS = {
  ref: [['outlet', 'Outlet'], ['date', 'Date'], ['headline', 'Headline'], ['url', 'Site']],
  quote: [['speaker', 'Who'], ['label', 'Who they are'], ['text', 'Their words'], ['marks', 'Words to highlight (comma between)']],
  doc: [['outlet', 'Outlet'], ['headline', 'Headline'], ['text', 'The key line']],
  keyword: [['text', 'The word'], ['sub', 'Small line']],
  place: [['places', 'Countries (comma between)'], ['label', 'Frame label']],
  stat: [['value', 'Number'], ['label', 'What it counts'], ['source', 'Source']],
  date: [['text', 'Date'], ['sub', 'What happened']],
};
const graphicName = (c) => (c.cutout?.kind ? CUTOUT_NAME[c.cutout.kind] || 'Cutout' : c.graphic?.type ? `Graphic · ${c.graphic.type}` : 'Graphic');
const r3 = (x) => Math.round(x * 1000) / 1000;
const clock = (s) => {
  s = Math.max(0, s || 0);
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.floor((s % 1) * 10))}`;
};
export const clipDur = (c) => (c.kind === 'video' || c.kind === 'audio' ? Math.max(0, (c.out - c.in) / (c.speed || 1)) : c.dur || 0);

/** Items of a track with their start and end on the timeline. */
export function itemsOf(edit, track) {
  if (track !== 'main') return edit[track].map((c) => ({c, start: c.at, end: c.at + clipDur(c)}));
  let t = 0;
  return edit.main.map((c) => ({c, start: t, end: (t += clipDur(c))}));
}
export const totalOf = (edit) => Math.max(0, ...TRACKS.flatMap((k) => itemsOf(edit, k).map((x) => x.end)));

/** Split a clip at timeline time t (inside it): returns the two halves, or null. */
export function splitClip(item, t) {
  const {c, start, end} = item;
  if (t <= start + 0.05 || t >= end - 0.05) return null;
  const a = {...c};
  const b = {...c, id: uid()};
  if (c.kind === 'video' || c.kind === 'audio') {
    const p = r3(c.in + (t - start) * (c.speed || 1));
    a.out = p;
    b.in = p;
    a.fadeOut = 0;
    b.fadeIn = 0;
  } else {
    a.dur = r3(t - start);
    b.dur = r3(end - t);
  }
  if ('at' in c) b.at = r3(t);
  return [a, b];
}

export async function editPage({slug, folder, h, api, toast, render}) {
  const base = `/api/playlists/${slug}/videos/${folder}/edit`;
  const ws = (f) => `/ws/playlists/${slug}/${folder}/${f}`;
  let S = await api('GET', base);
  let E = S.edit;
  const A = new Map(S.assets.map((a) => [a.id, a]));
  let sel = null; // {track, id}
  let t = 0;
  let playing = false;
  let zoom = 40; // px per second
  const undo = [];
  const redo = [];
  let saveTimer = null;
  let saveSeq = 0;
  let saving = Promise.resolve();
  let saved = true;
  let P = S.pieces || {clips: {}, missing: 0, job: null}; // the rendered graphics, per clip
  let W = null; // Claude writing graphics: {job, handoff, results}
  let adding = false; // the "+ Graphic" form is open
  let SO = S.sound || {clean: {}}; // cleaned sound files and the sound jobs
  let copied = null; // a grade copied from a clip
  let rec = null; // the recording panel: {mode: 'line' | 'camera' | 'free', track, id}
  let rendering = false; // the render panel is open
  let R = null; // render status

  // ---------- model changes ----------
  const snapshot = () => JSON.stringify(E);
  const commit = (before) => {
    if (before === snapshot()) return;
    undo.push(before);
    if (undo.length > 200) undo.shift();
    redo.length = 0;
    scheduleSave();
    draw();
  };
  const change = (fn) => {
    const before = snapshot();
    fn(E);
    commit(before);
  };
  const scheduleSave = () => {
    saved = false;
    status.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const mine = ++saveSeq; // a slow earlier save must not overwrite the status of a later one
      try {
        const body = JSON.parse(JSON.stringify(E));
        const out = await (saving = saving.catch(() => {}).then(() => api('PUT', base, body))); // one save at a time, in order
        if (mine !== saveSeq) return;
        saved = true;
        status.textContent = `Saved · ${clock(out.duration)}`;
        adoptStyles(out.edit);
        if (out.pieces) setPieces(out.pieces);
      } catch (e) {
        if (mine !== saveSeq) return;
        status.textContent = 'Not saved';
        toast(e.message, true);
      }
    }, 700);
  };
  const doUndo = () => {
    if (!undo.length) return;
    redo.push(snapshot());
    E = JSON.parse(undo.pop());
    scheduleSave();
    draw();
  };
  const doRedo = () => {
    if (!redo.length) return;
    undo.push(snapshot());
    E = JSON.parse(redo.pop());
    scheduleSave();
    draw();
  };
  /** Save now (before asking the server about the clips). */
  const flush = async () => {
    clearTimeout(saveTimer);
    const out = await (saving = saving.catch(() => {}).then(() => api('PUT', base, JSON.parse(JSON.stringify(E)))));
    saved = true;
    status.textContent = `Saved · ${clock(out.duration)}`;
    adoptStyles(out.edit);
    if (out.pieces) setPieces(out.pieces);
    return out;
  };
  /** The server gives new graphics the brand's styles: keep them here too (not an undo step). */
  const adoptStyles = (saved) => {
    for (const k of ['main', 'over']) {
      for (const sc of saved?.[k] || []) {
        const c = E[k].find((x) => x.id === sc.id);
        if (!c) continue;
        if (c.graphic && sc.graphic?.style && c.graphic.type === sc.graphic.type && !c.graphic.style) c.graphic.style = sc.graphic.style;
        if (c.cutout && sc.cutout && c.cutout.kind === sc.cutout.kind) {
          if (!c.cutout.style && sc.cutout.style) c.cutout.style = sc.cutout.style;
          if (!c.cutout.place && sc.cutout.place) c.cutout.place = sc.cutout.place;
        }
        if (c.look && sc.look?.style && !c.look.style) c.look.style = sc.look.style;
      }
    }
  };
  // ---------- rendered graphics ----------
  let pieceTimer = null;
  const setPieces = (p) => {
    const was = JSON.stringify(P.clips);
    P = p;
    if (JSON.stringify(P.clips) !== was) (drawTimeline(), sel && drawInspector(), sync());
    clearTimeout(pieceTimer);
    if (P.job?.status === 'running' || (P.missing && P.job?.status !== 'error')) {
      pieceTimer = setTimeout(async () => {
        if (!document.body.contains(tl)) return;
        try {
          setPieces(await api('GET', `${base}/pieces`));
        } catch {
          /* try again on the next save */
        }
      }, 2500);
    }
  };
  /** The clip's rendered graphic when it is made (and up to date), else null. */
  const pieceOf = (c) => (P.clips[c.id]?.ready ? P.clips[c.id] : null);
  const drawn = (c) => (c.kind === 'graphic' && (c.graphic?.type || c.cutout?.kind)) || ((c.kind === 'video' || c.kind === 'image') && c.look);

  // ---------- Claude writes graphics from an idea ----------
  let writeTimer = null;
  const applyResults = (results) => {
    const ids = Object.keys(results || {});
    if (!ids.length) return 0;
    let n = 0;
    change((e) => {
      for (const k of ['main', 'over']) {
        for (const c of e[k]) {
          const r = results[c.id];
          if (!r || c.kind !== 'graphic' || c.graphic?.type || c.cutout?.kind) continue;
          if (r.graphic) c.graphic = r.graphic;
          else c.cutout = r.cutout;
          if (r.dur) c.dur = r.dur;
          n++;
        }
      }
    });
    return n;
  };
  const watchWriting = () => {
    clearTimeout(writeTimer);
    if (W?.job?.status !== 'running') return;
    writeTimer = setTimeout(async () => {
      if (!document.body.contains(tl)) return;
      W = await api('GET', `${base}/graphics`).catch(() => W);
      if (W?.job?.status === 'done') {
        const n = applyResults(W.results);
        toast(n ? `Claude wrote ${n} graphic${n > 1 ? 's' : ''}` : 'Nothing new to put on the timeline');
        W = {...W, job: null};
      } else if (W?.job?.status === 'error') toast(W.job.error, true);
      drawInspector();
      watchWriting();
    }, 2500);
  };
  /** Ask Claude to write these graphics (ids) or every one waiting. */
  const writeGraphics = async (ids = null) => {
    try {
      await flush();
      W = await api('POST', `${base}/graphics`, {ids});
      if (W.handoff) toast('Claude in a project thread writes them: see the note on the right');
      watchWriting();
      drawInspector();
    } catch (e) {
      toast(e.message, true);
    }
  };
  const checkGraphics = async () => {
    try {
      W = await api('POST', `${base}/graphics/import`);
      const n = applyResults(W.results);
      toast(n ? `${n} graphic${n > 1 ? 's' : ''} put on the timeline` : 'No new graphics in the answer');
      drawInspector();
    } catch (e) {
      toast(e.message, true);
    }
  };
  const waitingGraphics = () => ['main', 'over'].flatMap((k) => E[k].filter((c) => c.kind === 'graphic' && c.prompt && !c.graphic?.type && !c.cutout?.kind));

  // ---------- sound: noise cleanup and levelling ----------
  let soundTimer = null;
  const cleanSrc = (c) => (c.clean && c.asset && SO.clean[`${c.asset}-${c.clean}`] ? ws(SO.clean[`${c.asset}-${c.clean}`]) : null);
  const setSound = (so) => {
    const was = JSON.stringify(SO.clean);
    const wasJobs = JSON.stringify([SO.cleaning, SO.levelling?.status]);
    const levelled = SO.levelling?.status === 'running' && so.levelling?.status === 'done';
    const failed = SO.levelling?.status === 'running' && so.levelling?.status === 'error';
    SO = so;
    if (levelled) {
      const res = so.levelling.results || {};
      change((e) => ['main', 'over', 'voice', 'music'].forEach((k) => e[k].forEach((c) => c.id in res && (c.volume = res[c.id]))));
      toast(`Sound levelled on ${Object.keys(res).length} clip${Object.keys(res).length === 1 ? '' : 's'}`);
    } else if (failed) toast(so.levelling.error, true);
    if (JSON.stringify(SO.clean) !== was) (sel && drawInspector(), sync());
    clearTimeout(soundTimer);
    if (SO.cleaning?.status === 'running' || SO.levelling?.status === 'running') {
      soundTimer = setTimeout(async () => document.body.contains(tl) && setSound(await api('GET', `${base}/sound`).catch(() => SO)), 2000);
    }
    levelBtn.textContent = SO.levelling?.status === 'running' ? `Levelling ${SO.levelling.done}/${SO.levelling.total}…` : 'Level the sound';
    if (sel && JSON.stringify([SO.cleaning, SO.levelling?.status]) !== wasJobs) drawInspector();
  };
  const cleanNow = async (c, strength) => {
    try {
      setSound(await api('POST', `${base}/clean`, {asset: c.asset, strength}));
    } catch (e) {
      toast(e.message, true);
    }
  };
  const level = async () => {
    try {
      await flush();
      SO.levelling = null;
      const so = await api('POST', `${base}/level`);
      SO = {...SO, levelling: {status: 'running', done: 0, total: so.levelling?.total || 0}};
      setSound(so);
    } catch (e) {
      toast(e.message, true);
    }
  };
  let talkCache = {key: '', list: []};
  const talk = () => {
    const key = snapshot();
    if (talkCache.key !== key) talkCache = {key, list: talkIntervals(E, A, itemsOf)};
    return talkCache.list;
  };

  const find = (s) => (s ? E[s.track].find((c) => c.id === s.id) : null);
  const itemOfSel = () => (sel ? itemsOf(E, sel.track).find((x) => x.c.id === sel.id) : null);
  const mainAt = (time) => itemsOf(E, 'main').find((x) => time >= x.start && time < x.end) || null;

  /** A clip from an asset, ready for a track. */
  const fromAsset = (a, track) => {
    const c = {id: uid(), kind: a.kind === 'video' && (track === 'voice' || track === 'music') ? 'video' : a.kind, asset: a.id};
    if (a.kind === 'video' || a.kind === 'audio') Object.assign(c, {in: 0, out: a.dur, speed: 1, volume: track === 'music' ? 0.35 : 1, mute: false, fadeIn: track === 'music' ? 1.5 : 0, fadeOut: track === 'music' ? 2 : 0});
    else c.dur = 4;
    if (a.kind === 'video' || a.kind === 'image') c.fit = a.w && a.h && a.h > a.w ? 'blur' : 'cover'; // phone verticals fill with a blur
    if (a.kind === 'image') c.move = 'slow';
    if (track !== 'main') c.at = r3(t);
    if (track === 'voice' && S.speakers.length) c.speaker = S.speakers[0];
    return c;
  };
  /** Into main after the clip under the playhead (or at the end). */
  const insertMain = (c, index = null) => change((e) => {
    const cur = mainAt(t);
    const i = index ?? (cur ? e.main.indexOf(cur.c) + 1 : e.main.length);
    if (cur && index == null && cur.c.scene) c.scene = cur.c.scene;
    e.main.splice(i, 0, c);
    sel = {track: 'main', id: c.id};
    // the playhead moves to the new clip, so the next one added goes after it
    t = itemsOf(e, 'main').find((x) => x.c.id === c.id).start + 0.001;
  });
  const addTo = (track, c) => (track === 'main' ? insertMain(c) : change((e) => (e[track].push(c), (sel = {track, id: c.id}))));

  // ---------- layout ----------
  const status = h('span', {class: 'muted mono', style: 'font-size:12px'}, 'Saved');
  const timeEl = h('span', {class: 'mono', style: 'min-width:150px'});
  const stage = h('div', {class: 'ed-stage'});
  const blurBg = h('div', {class: 'ed-blur'});
  const vids = [h('video', {class: 'ed-v', playsinline: true, preload: 'auto'}), h('video', {class: 'ed-v', playsinline: true, preload: 'auto'})];
  const img = h('img', {class: 'ed-v', hidden: true});
  const card = h('div', {class: 'ed-card', hidden: true});
  const pieceVid = h('video', {class: 'ed-v', playsinline: true, preload: 'auto', hidden: true}); // a rendered graphic on the Video track
  // the colour grade of the clip on screen: an SVG colour matrix and tone curve, CSS filters and a vignette
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs = {}, ...kids) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.append(...kids);
    return el;
  };
  const gradeMatrix = svgEl('feColorMatrix', {type: 'matrix', values: '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0'});
  const curve = () => svgEl('feFuncR', {type: 'table', tableValues: '0 1'});
  const funcs = [curve(), svgEl('feFuncG', {type: 'table', tableValues: '0 1'}), svgEl('feFuncB', {type: 'table', tableValues: '0 1'})];
  const gradeSvg = svgEl('svg', {width: 0, height: 0, style: 'position:absolute'}, svgEl('filter', {id: 'ed-grade', 'color-interpolation-filters': 'sRGB'}, gradeMatrix, svgEl('feComponentTransfer', {}, ...funcs)));
  const vignette = h('div', {class: 'ed-vignette'});
  const applyGrade = (el, g) => {
    const plain = !cleanGrade(g);
    for (const x of [...vids, img]) if (x !== el) x.style.filter = '';
    if (!el || plain) return ((vignette.style.opacity = '0'), el && (el.style.filter = ''));
    const p = gradeParts(g);
    gradeMatrix.setAttribute('values', p.matrix);
    funcs.forEach((f) => f.setAttribute('tableValues', p.table));
    el.style.filter = `url(#ed-grade) ${p.css}`;
    vignette.style.opacity = String(p.vignette);
  };
  const mainLayer = h('div', {class: 'ed-layer'}, gradeSvg, blurBg, ...vids, img, card, pieceVid, vignette);
  stage.append(mainLayer);
  vids.forEach((v) => (v.hidden = true));
  const inspector = h('div', {class: 'card ed-insp'});
  const bin = h('div', {class: 'ed-bin'});
  const tl = h('div', {class: 'ed-tl'});
  const tlInner = h('div', {class: 'ed-tl-inner'});
  tl.append(tlInner);
  const playBtn = h('button', {class: 'primary', onclick: () => togglePlay()}, 'Play');
  const zoomIn = h('button', {title: 'Zoom in', onclick: () => ((zoom = Math.min(400, zoom * 1.5)), drawTimeline())}, '+');
  const zoomOut = h('button', {title: 'Zoom out', onclick: () => ((zoom = Math.max(2, zoom / 1.5)), drawTimeline())}, '−');
  const versionSel = h('select', {style: 'width:auto'});
  const levelBtn = h('button', {title: 'Measure every clip with sound and bring talk to one level (-16 LUFS) and music under it', onclick: () => level()}, 'Level the sound');

  // ---------- the bin ----------
  const drawBin = () => {
    bin.replaceChildren(
      h('div', {class: 'label', style: 'margin-bottom:8px'}, `Footage · ${S.assets.length}`),
      ...S.assets.map((a) => {
        const still = a.stills?.[0]?.file;
        const el = h('div', {class: 'ed-asset', draggable: 'true', title: a.file},
          still ? h('img', {src: ws(still)}) : h('div', {class: 'ed-asset-audio'}, '♪'),
          h('div', {class: 'grow', style: 'min-width:0'},
            h('div', {class: 'ed-asset-name'}, a.file.split('/').pop()),
            h('div', {class: 'muted', style: 'font-size:11px'}, a.kind === 'image' ? 'photo' : clock(a.dur)),
            h('div', {class: 'row', style: 'gap:4px;margin-top:4px'},
              a.kind !== 'audio' ? h('button', {class: 'mini', onclick: () => addTo('main', fromAsset(a, 'main'))}, '+ Video') : null,
              a.kind !== 'audio' ? h('button', {class: 'mini', title: 'Over the video (picture in picture, a cutout)', onclick: () => addTo('over', fromAsset(a, 'over'))}, '+ Over') : null,
              a.kind !== 'image' ? h('button', {class: 'mini', onclick: () => addTo('voice', fromAsset(a, 'voice'))}, '+ Voice') : null,
              a.kind !== 'image' ? h('button', {class: 'mini', onclick: () => addTo('music', fromAsset(a, 'music'))}, '+ Music') : null)));
        el.ondragstart = (ev) => ev.dataTransfer.setData('text/asset', a.id);
        return el;
      }),
      ...(S.assets.length ? [] : [h('p', {class: 'muted'}, 'No footage yet. Add it on the video page.')]));
  };

  // ---------- the timeline ----------
  const waves = new Map(); // asset id -> peaks (loaded once)
  const loadWave = async (a) => {
    if (!a.wave || waves.has(a.id)) return;
    waves.set(a.id, null);
    try {
      waves.set(a.id, await (await fetch(ws(a.wave))).json());
      drawTimeline();
    } catch {
      /* no waveform */
    }
  };
  const drawWave = (canvas, a, c, w) => {
    const wv = waves.get(a.id);
    if (!wv) return loadWave(a);
    canvas.width = Math.max(1, Math.min(4000, Math.round(w)));
    canvas.height = 40;
    const g = canvas.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,.55)';
    const sp = c.speed || 1;
    for (let x = 0; x < canvas.width; x++) {
      const src = c.in + ((x / canvas.width) * (c.out - c.in));
      const pk = wv.peaks[Math.floor(src / wv.step)] || 0;
      const hgt = (pk / 255) * 38 * (c.mute ? 0.15 : Math.min(1.4, c.volume ?? 1));
      g.fillRect(x, 20 - hgt / 2, 1, Math.max(1, hgt));
    }
    void sp;
  };
  const scenesBand = () => {
    const runs = [];
    for (const it of itemsOf(E, 'main')) {
      const last = runs.at(-1);
      if (last && last.scene === (it.c.scene || null)) last.end = it.end;
      else runs.push({scene: it.c.scene || null, start: it.start, end: it.end});
    }
    return runs.filter((r) => r.scene).map((r) => {
      const s = E.scenes.find((x) => x.id === r.scene);
      return h('div', {class: 'ed-scene', style: `left:${r.start * zoom}px;width:${Math.max(4, (r.end - r.start) * zoom - 2)}px`, title: 'Click to rename or remove', onclick: (ev) => (ev.stopPropagation(), sceneMenu(s))}, s?.title || 'Scene');
    });
  };
  const clipEl = (track, it) => {
    const {c} = it;
    const a = c.asset ? A.get(c.asset) : null;
    const w = (it.end - it.start) * zoom;
    const label = c.kind === 'line' ? `To record: ${c.text || ''}` : c.kind === 'gap' && c.camera ? `To camera${c.speaker ? ` · ${c.speaker}` : ''}: ${c.text || ''}` : c.kind === 'gap' ? `Clip needed${c.note ? `: ${c.note}` : ''}` : c.kind === 'graphic' ? graphicName(c) + (c.graphic?.title || c.cutout?.text || c.cutout?.headline || c.cutout?.value ? `: ${c.graphic?.title || c.cutout.text || c.cutout.headline || c.cutout.value}` : c.prompt ? `: ${c.prompt}` : '') : a ? a.file.split('/').pop() + (c.look ? ` · in a frame` : '') : c.kind;
    const el = h('div', {class: `ed-clip k-${c.kind} t-${track}` + (sel?.id === c.id ? ' sel' : '') + (c.mute ? ' muted' : '') + (drawn(c) && !pieceOf(c) ? ' making' : ''), 'data-id': c.id, style: `left:${it.start * zoom}px;width:${Math.max(3, w - 1)}px`},
      h('div', {class: 'ed-clip-name'}, (c.speaker ? `${c.speaker} · ` : '') + label + (c.speed && c.speed !== 1 ? ` · ${c.speed}×` : '')),
      h('div', {class: 'ed-h l'}), h('div', {class: 'ed-h r'}));
    if (a && (c.kind === 'video' || c.kind === 'image') && track !== 'voice' && track !== 'music') {
      // stills of the part in use, side by side
      const stills = (a.stills || []).filter((s) => c.kind === 'image' || (s.t >= c.in - 4 && s.t < c.out));
      if (stills.length) el.style.backgroundImage = stills.slice(0, Math.max(1, Math.ceil(w / 90))).map((s) => `url("${ws(s.file)}")`).join(',');
      if (stills.length) el.style.backgroundPosition = stills.slice(0, Math.max(1, Math.ceil(w / 90))).map((_, i) => `${i * 90}px 0`).join(',');
      // dark parts of the original, shaded
      for (const [d0, d1] of a.dark || []) {
        const x0 = Math.max(d0, c.in);
        const x1 = Math.min(d1, c.out ?? d1);
        if (x1 > x0) el.append(h('div', {class: 'ed-dark', title: 'Dark part', style: `left:${((x0 - c.in) / (c.speed || 1)) * zoom}px;width:${((x1 - x0) / (c.speed || 1)) * zoom}px`}));
      }
    }
    if (a && (c.kind === 'audio' || ((track === 'voice' || track === 'music') && c.kind === 'video') || (track === 'main' && c.kind === 'video' && a.audio))) {
      const cv = h('canvas', {class: 'ed-wave'});
      drawWave(cv, a, c, w);
      el.append(cv);
    }
    el.onpointerdown = (ev) => startDrag(ev, track, c, el);
    return el;
  };
  const drawTimeline = () => {
    const total = Math.max(totalOf(E) + 20, 60);
    const width = total * zoom;
    const step = [1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => s * zoom >= 70) || 600;
    const ruler = h('div', {class: 'ed-ruler', style: `width:${width}px`});
    for (let s = 0; s < total; s += step) ruler.append(h('div', {class: 'ed-tick', style: `left:${s * zoom}px`}, clock(s).replace(/\.\d$/, '')));
    const rows = TRACKS.map((k) => {
      const row = h('div', {class: 'ed-row', style: `width:${width}px`, 'data-track': k}, ...itemsOf(E, k).map((it) => clipEl(k, it)));
      row.ondragover = (ev) => ev.preventDefault();
      row.ondrop = (ev) => {
        ev.preventDefault();
        const a = A.get(ev.dataTransfer.getData('text/asset'));
        if (!a || (k === 'main' && a.kind === 'audio') || ((k === 'voice' || k === 'music') && a.kind === 'image')) return toast(`That cannot go on the ${TRACK_NAME[k]} track`, true);
        const x = (ev.clientX - row.getBoundingClientRect().left) / zoom;
        const c = fromAsset(a, k);
        if (k === 'main') insertMain(c, itemsOf(E, 'main').filter((it) => (it.start + it.end) / 2 < x).length);
        else ((c.at = r3(x)), addTo(k, c));
      };
      return row;
    });
    const head = h('div', {class: 'ed-heads'}, h('div', {class: 'ed-head', style: 'height:24px'}), h('div', {class: 'ed-head', style: 'height:22px'}, 'Scenes'), ...TRACKS.map((k) => h('div', {class: 'ed-head', style: `height:${ROW}px`}, TRACK_NAME[k])));
    const lanes = h('div', {class: 'ed-lanes', style: `width:${width}px`}, ruler, h('div', {class: 'ed-scenes', style: `width:${width}px`}, ...scenesBand()), ...rows, h('div', {class: 'ed-playhead', style: `left:${t * zoom}px`}));
    lanes.onpointerdown = (ev) => {
      if (ev.target.closest('.ed-clip, .ed-scene')) return;
      sel = null;
      seek((ev.clientX - lanes.getBoundingClientRect().left) / zoom);
      drawInspector();
      drawTimeline();
    };
    const keep = tl.scrollLeft;
    tlInner.replaceChildren(head, lanes);
    tl.scrollLeft = keep;
  };
  const movePlayhead = () => {
    const ph = tlInner.querySelector('.ed-playhead');
    if (ph) ph.style.left = `${t * zoom}px`;
    timeEl.textContent = `${clock(t)} / ${clock(totalOf(E))}`;
    // keep the playhead in view while playing
    if (playing && (t * zoom > tl.scrollLeft + tl.clientWidth - 80 || t * zoom < tl.scrollLeft)) tl.scrollLeft = t * zoom - 120;
  };

  // drag a clip: move (main: reorder; others: change its time) or trim either end
  const startDrag = (ev, track, c, el) => {
    ev.stopPropagation();
    sel = {track, id: c.id};
    adding = rendering = false;
    if (rec) return;
    const rect = el.getBoundingClientRect();
    const edge = ev.clientX - rect.left < 8 ? 'l' : rect.right - ev.clientX < 8 ? 'r' : null;
    const before = snapshot();
    const orig = {...c};
    const a = c.asset ? A.get(c.asset) : null;
    const x0 = ev.clientX;
    let moved = false;
    // listen on the window: the timeline is redrawn while dragging, which replaces the clip's element
    const onMove = (e2) => {
      const dt = (e2.clientX - x0) / zoom;
      if (Math.abs(e2.clientX - x0) > 3) moved = true;
      if (!moved) return;
      const live = E[track].find((x) => x.id === c.id);
      if (!live) return;
      const sp = orig.speed || 1;
      const media = orig.kind === 'video' || orig.kind === 'audio';
      if (edge === 'l') {
        if (media) {
          live.in = r3(Math.min(orig.out - 0.1, Math.max(0, orig.in + dt * sp)));
          if ('at' in orig) live.at = r3(Math.max(0, orig.at + (live.in - orig.in) / sp));
        } else {
          const d = Math.min(orig.dur - 0.2, dt);
          live.dur = r3(orig.dur - d);
          if ('at' in orig) live.at = r3(Math.max(0, orig.at + d));
        }
      } else if (edge === 'r') {
        if (media) live.out = r3(Math.max(orig.in + 0.1, Math.min(a?.dur ?? orig.out, orig.out + dt * sp)));
        else live.dur = r3(Math.max(0.2, orig.dur + dt));
      } else if (track !== 'main') live.at = r3(Math.max(0, orig.at + dt));
      else {
        const cur = tlInner.querySelector(`.ed-clip[data-id="${c.id}"]`);
        if (cur) ((cur.style.transform = `translateX(${e2.clientX - x0}px)`), (cur.style.zIndex = 5), (cur.style.opacity = 0.85));
      }
      if (edge || track !== 'main') drawTimeline();
    };
    const onUp = (e2) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moved && !edge && track === 'main') {
        // drop: the clip goes where its middle lands
        const items = itemsOf(E, 'main');
        const me = items.find((x) => x.c.id === c.id);
        const mid = (me.start + me.end) / 2 + (e2.clientX - x0) / zoom;
        const others = items.filter((x) => x.c.id !== c.id);
        const idx = others.filter((x) => (x.start + x.end) / 2 < mid).length;
        E.main = others.map((x) => x.c);
        E.main.splice(idx, 0, me.c);
      }
      if (!moved && !edge) seek(itemsOf(E, track).find((x) => x.c.id === c.id)?.start ?? t, true);
      commit(before);
      draw();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    drawInspector();
    drawTimeline();
  };

  // ---------- scenes ----------
  const newScene = () => {
    const cur = mainAt(t) || itemsOf(E, 'main').at(-1);
    if (!cur) return toast('Add a clip first', true);
    const title = prompt('Scene name (e.g. Hook, Gilgit to Karimabad, The fort)', E.scenes.length ? `Scene ${E.scenes.length}` : 'Hook');
    if (!title) return;
    change((e) => {
      const s = {id: `s${uid()}`, title: title.trim()};
      e.scenes.push(s);
      // from the clip under the playhead to the end of the scene it was in
      const i = e.main.indexOf(cur.c);
      const old = cur.c.scene || null;
      for (let k = i; k < e.main.length && (e.main[k].scene || null) === old; k++) e.main[k].scene = s.id;
    });
  };
  const sceneMenu = (s) => {
    if (!s) return;
    const name = prompt('Rename the scene, or clear the name to remove it (the clips stay)', s.title);
    if (name == null) return;
    change((e) => {
      if (name.trim()) e.scenes.find((x) => x.id === s.id).title = name.trim();
      else {
        e.scenes = e.scenes.filter((x) => x.id !== s.id);
        e.main.forEach((c) => c.scene === s.id && delete c.scene);
      }
    });
  };

  // ---------- editing actions ----------
  const split = () => {
    let it = itemOfSel();
    if (!it || t <= it.start || t >= it.end) it = mainAt(t);
    if (!it) return toast('Put the playhead over a clip', true);
    const track = TRACKS.find((k) => E[k].some((c) => c.id === it.c.id));
    const halves = splitClip(it, t);
    if (!halves) return;
    change((e) => {
      const i = e[track].findIndex((c) => c.id === it.c.id);
      e[track].splice(i, 1, ...halves);
      sel = {track, id: halves[1].id};
    });
  };
  const remove = () => {
    if (!sel) return;
    change((e) => (e[sel.track] = e[sel.track].filter((c) => c.id !== sel.id)));
    sel = null;
    draw();
  };
  const setEdge = (which) => {
    const it = itemOfSel();
    if (!it) return;
    const {c} = it;
    if (t < it.start - 0.01 || t > it.end + 0.01) return toast('Move the playhead inside the selected clip', true);
    change((e) => {
      const live = e[sel.track].find((x) => x.id === c.id);
      const media = c.kind === 'video' || c.kind === 'audio';
      if (which === 'in') {
        if (media) live.in = r3(c.in + (t - it.start) * (c.speed || 1));
        else live.dur = r3(it.end - t);
        if ('at' in c) live.at = r3(t);
      } else if (media) live.out = r3(c.in + (t - it.start) * (c.speed || 1));
      else live.dur = r3(t - it.start);
    });
  };
  const addGap = () => {
    const note = prompt('What clip is needed here? (e.g. "the bridge at Passu, from the car")', '');
    if (note == null) return;
    insertMain({id: uid(), kind: 'gap', dur: 3, note: note.trim()});
  };

  // ---------- inspector ----------
  const field = (label, el) => h('div', {class: 'ed-field'}, h('div', {class: 'label'}, label), el);
  const setClip = (fn) => change((e) => fn(e[sel.track].find((x) => x.id === sel.id)));
  const input = (v, onset, ph = '') => {
    const el = h('input', {value: v ?? '', placeholder: ph});
    el.onchange = () => onset(el.value);
    return el;
  };
  const pick = (v, opts, onset) => {
    const el = h('select', {}, ...opts.map(([val, name]) => h('option', {value: val, selected: String(v ?? '') === String(val)}, name)));
    el.onchange = () => onset(el.value);
    return el;
  };
  const pieceNote = (c) => {
    if (!drawn(c)) return null;
    const pc = P.clips[c.id];
    const txt = pc?.ready ? 'Made in the brand\'s look.' : P.job?.status === 'error' ? `Not made: ${P.job.error}` : 'Being made in the brand\'s look…';
    return h('div', {class: 'muted', style: 'font-size:12px;margin:6px 0'}, txt);
  };
  const styleField = (cat, v, onset) => (cat?.styles?.length ? field('Style', pick(v, cat.styles.map((x) => [x.id, x.name]), onset)) : null);
  /** A graphic: its idea (Claude writes it), its style and what it shows. */
  const graphicFields = (c) => {
    const idea = h('textarea', {style: 'min-height:54px', placeholder: 'e.g. a map of the drive from Gilgit to Karimabad with the stops'});
    idea.value = c.prompt || '';
    idea.onchange = () => setClip((x) => (x.prompt = idea.value.trim()));
    const has = c.graphic?.type || c.cutout?.kind;
    const writing = W?.job?.status === 'running' && (W.job.ids || []).includes(c.id);
    const write = h('button', {class: 'mini primary', disabled: writing, onclick: async () => {
      if (!idea.value.trim()) return toast('Write the idea first', true);
      if (has && !confirm('Claude writes this graphic again from the idea. Go on?')) return;
      setClip((x) => ((x.prompt = idea.value.trim()), delete x.graphic, delete x.cutout));
      writeGraphics([c.id]);
    }}, writing ? 'Writing…' : has ? 'Write it again' : 'Write it');
    const out = [field('The idea', idea), h('div', {class: 'row', style: 'gap:6px'}, write), pieceNote(c)];
    if (W?.handoff && !has && c.prompt) out.push(handoffNote());
    if (c.graphic?.type) {
      const g = c.graphic;
      const setG = (k, v) => setClip((x) => (x.graphic = {...x.graphic, [k]: v}));
      const items = h('textarea', {style: 'min-height:80px', placeholder: 'One per line: label | value | detail'});
      items.value = (g.items || []).map((x) => [x.label, x.value, x.detail].filter((v, i, l) => v || l.slice(i + 1).some(Boolean)).join(' | ')).join('\n');
      items.onchange = () => setG('items', items.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
        const [label = '', value = '', detail = ''] = l.split('|').map((x) => x.trim());
        return {label, value, detail, tone: g.items?.[i]?.tone || 'neutral'};
      }));
      out.push(
        styleField(S.looks?.graphic?.[g.type], g.style, (v) => setG('style', v)),
        field('Small label', input(g.kicker, (v) => setG('kicker', v))),
        field('Title', input(g.title, (v) => setG('title', v))),
        field('Items', items),
        g.type === 'roadtrip' || g.type === 'route' || (g.lines || []).length ? field(g.type === 'roadtrip' ? 'Key areas (Name | lat, lon | kind | note)' : 'Lines', (() => {
          const ta = h('textarea', {style: 'min-height:54px'});
          ta.value = (g.lines || []).join('\n');
          ta.onchange = () => setG('lines', ta.value.split('\n').map((l) => l.trim()).filter(Boolean));
          return ta;
        })()) : null,
        field('Stamp', input(g.stamp, (v) => setG('stamp', v))));
    }
    if (c.cutout?.kind) {
      const x = c.cutout;
      const setX = (k, v) => setClip((y) => (y.cutout = {...y.cutout, [k]: v}));
      out.push(
        styleField(S.looks?.cutout?.[x.kind], x.style, (v) => setX('style', v)),
        sel.track === 'over' ? field('Where', pick(x.place || 'over', [['over', 'Over the footage (it steps back)'], ['full', 'Full screen for its moment']], (v) => setX('place', v))) : null,
        ...(CUTOUT_FIELDS[x.kind] || []).map(([k, label]) => field(label, ['places', 'marks'].includes(k)
          ? input((x[k] || []).join(', '), (v) => setX(k, v.split(',').map((w) => w.trim()).filter(Boolean)))
          : input(x[k], (v) => setX(k, v)))));
    }
    return out;
  };
  /** A video or photo shown inside a cutout frame (an old TV, a polaroid...), or full frame. */
  const frameFields = (c) => {
    const cat = S.looks?.look?.[c.kind];
    if (!cat?.styles?.length) return null;
    return h('div', {},
      field('Show as', pick(c.look?.style || '', [['', 'Full frame'], ...cat.styles.map((x) => [x.id, `In a frame: ${x.name}`])], (v) => setClip((y) => (v ? (y.look = {style: v, label: y.look?.label || ''}) : delete y.look)))),
      c.look ? field('Caption', input(c.look.label, (v) => setClip((y) => (y.look = {...y.look, label: v})), 'e.g. Karakoram Highway')) : null,
      pieceNote(c));
  };
  /** Noise cleanup of the clip's sound (made once per file and strength). */
  const soundFields = (c) => {
    const ready = c.clean ? cleanSrc(c) : null;
    const busy = c.clean && !ready && (SO.cleaning?.current === `${c.asset}-${c.clean}` || (SO.cleaning?.waiting || []).includes(`${c.asset}-${c.clean}`));
    return h('div', {},
      field('Clean the noise', pick(c.clean || '', [['', 'Off'], ['light', 'Light'], ['medium', 'Medium (wind, traffic, hum)'], ['strong', 'Strong']], (v) => {
        setClip((y) => (v ? (y.clean = v) : delete y.clean));
        if (v) cleanNow(c, v);
      })),
      c.clean ? h('div', {class: 'muted', style: 'font-size:12px;margin:-4px 0 8px'}, ready ? 'Cleaned. Play to hear it.' : busy ? 'Cleaning the sound…' : SO.cleaning?.status === 'error' ? `Not cleaned: ${SO.cleaning.error}` : h('button', {class: 'mini', onclick: () => cleanNow(c, c.clean)}, 'Clean it now')) : null);
  };
  /** Colour: a look to start from, the sliders, auto fix, and copying a grade to other clips. */
  const colourFields = (c, a) => {
    const g = c.grade || {};
    const setGrade = (fn) => setClip((y) => (y.grade = cleanGrade(fn({...(y.grade || {})})) || undefined, y.grade === undefined && delete y.grade));
    const slider = (k, label) => {
      const [lo, hi] = GRADE_KEYS[k];
      const inp = h('input', {type: 'range', min: lo, max: hi, step: 0.05, value: g[k] || 0});
      const out = h('span', {class: 'mono', style: 'font-size:12px;min-width:38px'}, (g[k] || 0).toFixed(2));
      inp.oninput = () => {
        out.textContent = Number(inp.value).toFixed(2);
        applyGrade(vids[curVid].hidden ? img : vids[curVid], {...g, [k]: Number(inp.value)}); // live while dragging
      };
      inp.onchange = () => setGrade((x) => ({...x, [k]: Number(inp.value)}));
      return h('div', {class: 'row', style: 'gap:8px'}, h('span', {style: 'font-size:12px;min-width:76px'}, label), inp, out);
    };
    const autoFix = () => {
      const still = a?.stills?.find((st) => c.kind === 'image' || (st.t >= c.in && st.t <= c.out)) || a?.stills?.[0];
      if (!still) return toast('No still of this clip to read', true);
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = 64;
        cv.height = 36;
        const ctx = cv.getContext('2d');
        ctx.drawImage(im, 0, 0, 64, 36);
        const d = ctx.getImageData(0, 0, 64, 36).data;
        let r = 0, gg = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) (r += d[i]), (gg += d[i + 1]), (b += d[i + 2]);
        const n = d.length / 4 * 255;
        [r, gg, b] = [r / n, gg / n, b / n];
        const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        const lim = (v, m) => Math.max(-m, Math.min(m, v));
        setGrade((x) => ({...x, exposure: lim(Math.log2(0.46 / Math.max(0.02, lum)), 1), temperature: lim((b - r) * 2.5, 0.6), tint: lim(((r + b) / 2 - gg) * 3, 0.4), contrast: Math.max(x.contrast || 0, 0.08)}));
        toast('Colour fixed from the clip; tune it if you like');
      };
      im.src = ws(still.file);
    };
    const sameFor = (scope) => change((e) => {
      for (const x of e.main) if ((x.kind === 'video' || x.kind === 'image') && x.id !== c.id && (scope === 'all' || x.asset === c.asset)) (c.grade ? (x.grade = {...c.grade}) : delete x.grade);
    });
    return h('div', {class: 'ed-colour'},
      h('div', {class: 'label', style: 'margin:12px 0 6px'}, 'Colour'),
      field('Look', pick(g.look || '', [['', 'None'], ...Object.entries(LOOKS).map(([id, l]) => [id, l.name])], (v) => setGrade(() => (v ? {...LOOKS[v].grade, look: v} : {})))),
      slider('exposure', 'Exposure'), slider('contrast', 'Contrast'), slider('highlights', 'Highlights'), slider('shadows', 'Shadows'),
      slider('temperature', 'Temperature'), slider('tint', 'Tint'), slider('saturation', 'Saturation'), slider('fade', 'Fade'), slider('vignette', 'Vignette'),
      h('div', {class: 'row', style: 'gap:6px;flex-wrap:wrap;margin-top:6px'},
        h('button', {class: 'mini', onclick: autoFix, title: 'Fix exposure and colour cast from a still of the clip'}, 'Auto fix'),
        h('button', {class: 'mini', onclick: () => ((copied = c.grade ? {...c.grade} : null), toast('Colour copied'))}, 'Copy'),
        h('button', {class: 'mini', disabled: !copied, onclick: () => setGrade(() => ({...copied}))}, 'Paste'),
        a ? h('button', {class: 'mini', onclick: () => sameFor('file'), title: 'Every clip from the same file'}, 'Same for this file') : null,
        h('button', {class: 'mini', onclick: () => confirm('Give every clip of the video this colour?') && sameFor('all')}, 'Same for all'),
        h('button', {class: 'mini', onclick: () => setGrade(() => ({}))}, 'Reset')));
  };
  // ---------- recording at a point ----------
  let stream = null;
  const stopStream = () => (stream?.getTracks().forEach((x) => x.stop()), (stream = null));
  const openRecorder = async (r) => {
    togglePlay(false);
    adding = rendering = false;
    rec = r;
    const c = r.id ? E[r.track].find((x) => x.id === r.id) : null;
    const start = c ? itemsOf(E, r.track).find((x) => x.c.id === c.id).start : t;
    const camera = r.mode === 'camera';
    const live = h('video', {class: 'ed-rec-live', muted: true, playsinline: true, autoplay: true, hidden: !camera});
    const take = h('div', {});
    const msg = h('div', {class: 'muted', style: 'font-size:13px;margin:6px 0'}, camera ? 'Camera and microphone' : 'Microphone');
    const along = h('input', {type: 'checkbox', style: 'width:auto'});
    const goBtn = h('button', {class: 'primary'}, '● Start');
    let mr = null;
    let blob = null;
    const close = () => {
      stopStream();
      mr?.state === 'recording' && mr.stop();
      rec = null;
      togglePlay(false);
      drawInspector();
    };
    inspector.replaceChildren(...[
      h('h3', {}, camera ? 'Piece to camera' : r.mode === 'line' ? 'Voice-over line' : 'Record here'),
      h('div', {class: 'muted mono', style: 'font-size:12px'}, `${c?.speaker ? `${c.speaker} · ` : ''}at ${clock(start)}${c ? ` · about ${clipDur(c).toFixed(1)} s` : ''}`),
      c?.text ? h('div', {class: 'ed-prompter'}, c.text) : null,
      live, msg,
      h('label', {class: 'row', style: 'gap:6px;font-size:13px;margin:6px 0'}, along, 'Play the video under it (use headphones)'),
      h('div', {class: 'row', style: 'gap:6px;flex-wrap:wrap'}, goBtn, h('button', {onclick: close}, 'Cancel')),
      take,
    ].filter(Boolean));
    try {
      stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: false, noiseSuppression: true, autoGainControl: false, channelCount: 1}, video: camera ? {width: {ideal: 1920}, height: {ideal: 1080}, frameRate: {ideal: 30}} : false});
      if (camera) live.srcObject = stream;
    } catch (e) {
      msg.textContent = `No ${camera ? 'camera' : 'microphone'}: ${e.message}`;
      goBtn.disabled = true;
      return;
    }
    const begin = async () => {
      blob = null;
      take.replaceChildren();
      goBtn.disabled = true;
      for (const n of [3, 2, 1]) ((msg.textContent = `${n}…`), await new Promise((ok) => setTimeout(ok, 700)));
      const type = camera ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((x) => MediaRecorder.isTypeSupported(x)) : 'audio/webm;codecs=opus';
      const chunks = [];
      mr = new MediaRecorder(stream, {mimeType: type, ...(camera ? {videoBitsPerSecond: 8_000_000} : {audioBitsPerSecond: 192_000})});
      mr.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
      mr.onstop = () => {
        togglePlay(false);
        blob = new Blob(chunks, {type: type.split(';')[0]});
        const u = URL.createObjectURL(blob);
        take.replaceChildren(
          camera ? h('video', {src: u, controls: true, class: 'ed-rec-live'}) : h('audio', {src: u, controls: true, style: 'width:100%'}),
          h('div', {class: 'row', style: 'gap:6px;margin-top:6px'}, h('button', {class: 'primary', onclick: () => useTake(blob)}, 'Use this take'), h('button', {onclick: begin}, 'Again')));
        goBtn.textContent = '● Start';
        goBtn.disabled = false;
        goBtn.onclick = begin;
        msg.textContent = 'Listen back, then use it or record again.';
      };
      mr.start(1000);
      if (along.checked) (seek(start), togglePlay(true));
      msg.textContent = '● Recording… press Stop when done';
      goBtn.textContent = '■ Stop';
      goBtn.disabled = false;
      goBtn.onclick = () => mr.stop();
    };
    goBtn.onclick = begin;
    const useTake = async (b) => {
      msg.textContent = 'Saving the take…';
      take.replaceChildren();
      try {
        const name = `${(c?.speaker || 'take').replace(/[^\w-]+/g, '')}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${camera ? 'webm' : 'weba'}`;
        const res = await fetch(`${base}/record?name=${encodeURIComponent(name)}`, {method: 'POST', body: b});
        const out = await res.json();
        if (!res.ok) throw new Error(out.error || 'Not saved');
        msg.textContent = 'Reading the take…';
        const a = await waitForAsset(out.id);
        change((e) => {
          if (r.mode === 'free') e.voice.push({id: uid(), kind: 'audio', asset: a.id, in: 0, out: a.dur, at: r3(start), speed: 1, volume: 1, mute: false, fadeIn: 0, fadeOut: 0, ...(S.speakers[0] ? {speaker: S.speakers[0]} : {})});
          else {
            const list = e[r.track];
            const i = list.findIndex((x) => x.id === r.id);
            if (i < 0) return;
            const old = list[i];
            const nc = {id: old.id, kind: camera ? 'video' : 'audio', asset: a.id, in: 0, out: a.dur, speed: 1, volume: 1, mute: false, fadeIn: 0, fadeOut: 0, speaker: old.speaker, text: old.text};
            if (camera) Object.assign(nc, {fit: a.h > a.w ? 'blur' : 'cover', scene: old.scene});
            else nc.at = old.at;
            list[i] = nc;
          }
        });
        toast('The take is on the timeline');
        close();
      } catch (e) {
        msg.textContent = e.message;
      }
    };
  };
  /** Wait until a recorded file is read (working copy, sound), then refresh the footage. */
  const waitForAsset = async (id) => {
    const assetsUrl = `/api/playlists/${slug}/videos/${folder}/assets`;
    for (let i = 0; i < 600; i++) {
      const st = await api('GET', assetsUrl);
      const a = st.assets.find((x) => x.id === id);
      if (a?.ready) {
        S = {...S, assets: (await api('GET', base)).assets};
        A.clear();
        for (const x of S.assets) A.set(x.id, x);
        drawBin();
        return A.get(id);
      }
      if (a?.error) throw new Error(a.error);
      if (st.job?.status !== 'running') await api('POST', `${assetsUrl}/process`).catch(() => {});
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    throw new Error('The take is taking long to read; find it in the footage later');
  };

  // ---------- render ----------
  let renderTimer = null;
  const openRender = async () => {
    adding = false;
    rendering = true;
    sel = null;
    await flush().catch(() => {});
    R = await api('GET', `${base}/render`);
    drawInspector();
    drawTimeline();
    watchRender();
  };
  const watchRender = () => {
    clearTimeout(renderTimer);
    if (R?.job?.status !== 'running') return;
    renderTimer = setTimeout(async () => {
      if (!document.body.contains(tl)) return;
      R = await api('GET', `${base}/render`).catch(() => R);
      if (R.job?.status === 'done') toast(R.job.kind === 'final' ? 'The final is ready' : 'The preview is ready');
      if (R.job?.status === 'error') toast(R.job.error, true);
      if (rendering) drawInspector();
      watchRender();
    }, 2500);
  };
  const STAGE = {starting: 'Starting', copies: 'Full-size copies of your clips', video: 'Rendering', sound: 'The sound alone', subtitles: 'Subtitles'};
  const renderPanel = () => {
    const size = h('select', {style: 'width:auto'}, ...R.sizes.map((x) => h('option', {value: x, selected: x === '1080'}, x === '1440' ? '2K (1440p)' : x === '2160' ? '4K (2160p)' : '1080p')));
    const go = async (kind) => {
      try {
        await flush();
        R = await api('POST', `${base}/render`, {kind, size: size.value});
        drawInspector();
        watchRender();
      } catch (e) {
        toast(e.message, true);
      }
    };
    const j = R.job;
    const busy = j?.status === 'running';
    const link = (f) => h('a', {href: ws(f), target: '_blank', style: 'display:block;font-size:13px'}, f.split('/').pop());
    return [
      h('div', {class: 'row'}, h('h3', {class: 'grow'}, 'Render'), h('button', {class: 'mini', onclick: () => ((rendering = false), drawInspector())}, 'Close')),
      R.todo.length ? h('div', {class: 'card', style: 'padding:10px;margin:8px 0;font-size:13px'}, h('b', {}, 'Still to do'), ...R.todo.map((x) => h('div', {}, `· ${x}`)), h('div', {class: 'muted', style: 'margin-top:4px'}, 'You can render anyway: spaces show the theme\'s background, lines not recorded stay silent.')) : h('p', {class: 'muted', style: 'font-size:13px'}, 'Everything is in place.'),
      busy ? h('div', {class: 'card', style: 'padding:10px;margin:8px 0'}, h('b', {}, `${j.kind === 'final' ? `Final ${j.size}p` : 'Preview'}: ${STAGE[j.stage] || j.stage}`), h('progress', {max: 1, value: j.progress || 0, style: 'width:100%'})) : null,
      j?.status === 'error' ? h('p', {class: 'error', style: 'font-size:13px'}, j.error) : null,
      field('Preview', h('div', {}, h('button', {disabled: busy, onclick: () => go('preview')}, 'Make a 540p preview'), h('div', {class: 'muted', style: 'font-size:12px;margin-top:4px'}, 'Quick, from the working copies, to check the whole video.'))),
      field('Final', h('div', {}, h('div', {class: 'row', style: 'gap:6px'}, size, h('button', {class: 'primary', disabled: busy, onclick: () => go('final')}, 'Render the final')), h('div', {class: 'muted', style: 'font-size:12px;margin-top:4px'}, 'From your originals. Also writes the subtitles, the chapters and the sound alone.'))),
      R.previews.length ? field('Previews', h('div', {}, ...R.previews.slice(-3).reverse().map((p) => link(p.file)))) : null,
      R.finals.length ? field('Final files', h('div', {}, ...R.finals.map(link))) : null,
    ].filter(Boolean);
  };

  const handoffNote = () => h('div', {class: 'card', style: 'padding:10px;margin:8px 0;font-size:13px'},
    h('div', {}, 'No API key, so Claude writes these in a project thread. Paste this in the project chat:'),
    h('div', {class: 'mono', style: 'font-size:12px;margin:6px 0;user-select:all'}, `Please open a new thread for these graphics: ${slug}/${folder}. Follow ${W.handoff.brief} and write ${W.handoff.expects}.`),
    h('button', {class: 'mini', onclick: checkGraphics}, 'Check for graphics'));
  /** "+ Graphic": an idea at the playhead, full screen on the Video track or over the footage. */
  const addForm = () => {
    const idea = h('textarea', {style: 'min-height:80px', placeholder: 'What should it show? e.g. "the road trip from Gilgit to Karimabad with Rakaposhi view point", "flash the Dawn story about the road closing", "Hina\'s words: this is the best apricot I ever had"'});
    let where = 'main';
    let dur = 5;
    const go = async (write) => {
      const prompt = idea.value.trim();
      if (!prompt) return toast('Write the idea first', true);
      const c = {id: uid(), kind: 'graphic', dur, prompt};
      adding = false;
      addTo(where, where === 'main' ? c : {...c, at: r3(t)});
      if (write) writeGraphics([c.id]);
    };
    const waiting = waitingGraphics().length;
    return [
      h('h3', {}, 'Add a graphic'),
      h('p', {class: 'muted', style: 'font-size:13px'}, 'Write the idea; Claude makes it a graphic or a cutout in the brand\'s look, with facts from your story and footage.'),
      field('The idea', idea),
      field('Where', pick(where, [['main', 'Full screen (Video track)'], ['over', 'Over the footage (Over track)']], (v) => (where = v))),
      field('Length (seconds)', input(dur, (v) => (dur = Math.min(30, Math.max(1, Number(v) || 5))))),
      h('div', {class: 'row', style: 'gap:6px;flex-wrap:wrap'},
        h('button', {class: 'primary', onclick: () => go(true)}, 'Add and write it'),
        h('button', {onclick: () => go(false)}, 'Add, write later'),
        h('button', {onclick: () => ((adding = false), drawInspector())}, 'Cancel')),
      waiting ? h('div', {style: 'margin-top:12px'}, h('button', {class: 'mini', onclick: () => writeGraphics(null)}, `Write all ${waiting} waiting`)) : null,
      W?.handoff ? handoffNote() : null,
    ].filter(Boolean);
  };
  const drawInspector = () => {
    if (rec) return;
    if (rendering) return inspector.replaceChildren(...renderPanel());
    if (adding) return inspector.replaceChildren(...addForm());
    const it = itemOfSel();
    if (!it) {
      inspector.replaceChildren(h('h3', {}, 'Nothing selected'), h('p', {class: 'muted', style: 'font-size:13px'}, 'Click a clip to change it. Drag a clip to move it, drag its ends to trim. Split with S at the playhead, remove with Delete. Add footage from the left, or drag it onto a track.'));
      return;
    }
    const {c} = it;
    const a = c.asset ? A.get(c.asset) : null;
    const set = (k, v) => change((e) => (e[sel.track].find((x) => x.id === c.id)[k] = v));
    const media = c.kind === 'video' || c.kind === 'audio';
    const num = (k, v, step, min, max, fmt) => {
      const inp = h('input', {type: 'range', min, max, step, value: v});
      const out = h('span', {class: 'mono', style: 'font-size:12px;min-width:46px'}, fmt(v));
      inp.oninput = () => (out.textContent = fmt(Number(inp.value)));
      inp.onchange = () => set(k, Number(inp.value));
      return h('div', {class: 'row', style: 'gap:8px'}, inp, out);
    };
    const sel2 = (k, v, opts) => {
      const s = h('select', {}, ...opts.map(([val, name]) => h('option', {value: val, selected: String(v) === String(val)}, name)));
      s.onchange = () => set(k, s.value === 'true' ? true : s.value === 'false' ? false : isNaN(Number(s.value)) || s.value === '' ? s.value : Number(s.value));
      return s;
    };
    const text = (k, v, ph) => {
      const ta = h('textarea', {style: 'min-height:60px', placeholder: ph});
      ta.value = v || '';
      ta.onchange = () => set(k, ta.value);
      return ta;
    };
    inspector.replaceChildren(...[
      h('div', {class: 'row'}, h('h3', {class: 'grow', style: 'word-break:break-all'}, a ? a.file.split('/').pop() : c.kind === 'line' ? 'Voice-over to record' : c.kind === 'gap' && c.camera ? 'Piece to camera' : c.kind === 'gap' ? 'Clip needed' : graphicName(c)), h('span', {class: 'badge dark'}, TRACK_NAME[sel.track])),
      h('div', {class: 'muted mono', style: 'font-size:12px;margin:4px 0 10px'}, `${clock(it.start)} → ${clock(it.end)} · ${clock(it.end - it.start)}${media ? ` · from ${clock(c.in)} to ${clock(c.out)} of the clip` : ''}`),
      h('div', {class: 'row', style: 'gap:6px;flex-wrap:wrap'},
        h('button', {class: 'mini', title: 'I', onclick: () => setEdge('in')}, 'Start here'),
        h('button', {class: 'mini', title: 'O', onclick: () => setEdge('out')}, 'End here'),
        h('button', {class: 'mini', title: 'S', onclick: split}, 'Split'),
        h('button', {class: 'mini danger', title: 'Delete', onclick: remove}, 'Remove')),
      media ? field('Volume', num('volume', c.volume ?? 1, 0.05, 0, 2, (v) => `${Math.round(v * 100)}%`)) : null,
      media ? field('Sound', sel2('mute', Boolean(c.mute), [[false, 'On'], [true, 'Muted']])) : null,
      media ? field('Fade in', num('fadeIn', c.fadeIn || 0, 0.1, 0, 5, (v) => `${v.toFixed(1)} s`)) : null,
      media ? field('Fade out', num('fadeOut', c.fadeOut || 0, 0.1, 0, 5, (v) => `${v.toFixed(1)} s`)) : null,
      media ? field('Speed', sel2('speed', c.speed || 1, SPEEDS.map((s) => [s, s === 1 ? 'Normal' : `${s}×`]))) : null,
      c.kind === 'video' || c.kind === 'image' ? field('Fit', sel2('fit', c.fit || 'cover', [['cover', 'Fill the frame'], ['contain', 'Whole picture'], ['blur', 'Whole picture, blurred fill']])) : null,
      c.kind === 'image' ? field('Movement', sel2('move', c.move || 'slow', [['slow', 'Slow push in'], ['still', 'Still']])) : null,
      !media ? field('Length', num('dur', c.dur, 0.1, 0.5, 30, (v) => `${v.toFixed(1)} s`)) : null,
      sel.track === 'main' && E.scenes.length ? field('Scene', sel2('scene', c.scene || '', [['', 'None'], ...E.scenes.map((s) => [s.id, s.title])])) : null,
      (sel.track === 'voice' || c.camera) && S.speakers.length ? field('Speaker', sel2('speaker', c.speaker || '', [['', 'Not set'], ...S.speakers.map((x) => [x, x])])) : null,
      c.kind === 'line' || c.camera ? field(c.camera ? 'What to say to the camera' : 'The line', text('text', c.text, 'What is said')) : null,
      c.kind === 'line' || c.camera ? h('button', {class: 'primary', style: 'margin:4px 0 10px', onclick: () => openRecorder({mode: c.camera ? 'camera' : 'line', track: sel.track, id: c.id})}, c.camera ? '● Record it to camera' : '● Record this line') : null,
      ...(c.kind === 'graphic' ? graphicFields(c) : []),
      (c.kind === 'video' || c.kind === 'image') && sel.track !== 'voice' && sel.track !== 'music' ? frameFields(c) : null,
      media && a?.audio !== false ? soundFields(c) : null,
      sel.track === 'music' ? field('Under the voices', pick(c.duck || 'strong', [['strong', 'Goes down a lot'], ['light', 'Goes down a little'], ['off', 'Stays the same']], (v) => setClip((y) => (y.duck = v)))) : null,
      (c.kind === 'video' || c.kind === 'image') && sel.track === 'main' && !c.look ? colourFields(c, a) : null,
      c.kind === 'gap' && !c.camera ? field('Clip needed', text('note', c.note, 'What should be filmed or found here')) : field('Note', text('note', c.note, 'A note for yourself or for Claude')),
    ].filter(Boolean));
  };

  // ---------- the player ----------
  let curVid = 0;
  const audios = new Map(); // clip id -> <audio> for Voice, Music and Over clips with sound
  const gain = (c, local) => {
    const d = clipDur(c);
    let g = c.mute ? 0 : c.volume ?? 1;
    if (c.fadeIn && local < c.fadeIn) g *= local / c.fadeIn;
    if (c.fadeOut && local > d - c.fadeOut) g *= Math.max(0, (d - local) / c.fadeOut);
    return Math.max(0, Math.min(1, g));
  };
  const fitStyle = (el, c) => {
    el.style.objectFit = c.fit === 'cover' ? 'cover' : 'contain';
  };
  const load = (el, src) => ((el.dataset.src = src), (el.src = src));
  const show = (which) => {
    vids.forEach((v, i) => (v.hidden = which !== `v${i}`));
    pieceVid.hidden = which !== 'piece';
    if (which !== 'piece') pieceVid.pause();
    img.hidden = which !== 'img';
    card.hidden = which !== 'card';
  };
  /** Keep a video element at a time of its own file (playing or paused with the editor). */
  const playAt = (el, src, want, rate) => {
    if (el.dataset.src !== src) load(el, src);
    el.playbackRate = rate;
    if (Math.abs(el.currentTime - want) > (playing ? 0.35 : 0.04)) el.currentTime = want;
    if (playing && el.paused) el.play().catch(() => {});
    if (!playing && !el.paused) el.pause();
  };
  const syncMain = () => {
    const it = mainAt(t);
    blurBg.style.backgroundImage = '';
    if (!it) {
      vids.forEach((v) => v.pause());
      applyGrade(null);
      card.replaceChildren(h('div', {class: 'muted'}, E.main.length ? 'End' : 'Add footage to the Video track'));
      return show('card');
    }
    const {c} = it;
    const a = c.asset ? A.get(c.asset) : null;
    const local = t - it.start;
    const pc = drawn(c) ? pieceOf(c) : null;
    if (pc || (c.kind !== 'video' && c.kind !== 'image')) applyGrade(null);
    if (pc) {
      // a graphic, or the clip inside its cutout frame (its sound plays with the other tracks)
      vids.forEach((v) => v.pause());
      playAt(pieceVid, ws(pc.file), local, 1);
      pieceVid.volume = 0.7;
      return show('piece');
    }
    if (c.fit === 'blur' && a?.stills?.[0]) blurBg.style.backgroundImage = `url("${ws(a.stills[Math.min(a.stills.length - 1, 0)].file)}")`;
    if (c.kind === 'video') {
      const src = ws(a.proxy);
      if (vids[curVid].dataset.src !== src) {
        if (vids[1 - curVid].dataset.src === src) curVid = 1 - curVid;
        else load(vids[curVid], src);
      }
      const v = vids[curVid];
      const want = c.in + local * (c.speed || 1);
      v.playbackRate = c.speed || 1;
      v.volume = gain(c, local);
      v.muted = Boolean(c.mute || cleanSrc(c)); // a cleaned clip's sound plays with the other tracks
      fitStyle(v, c);
      applyGrade(v, c.grade);
      if (Math.abs(v.currentTime - want) > (playing ? 0.35 : 0.04)) v.currentTime = want;
      if (playing && v.paused) v.play().catch(() => {});
      if (!playing && !v.paused) v.pause();
      vids[1 - curVid].pause();
      show(`v${curVid}`);
      // the next video clip waits in the other player
      const next = itemsOf(E, 'main').find((x) => x.start >= it.end - 0.001 && x.c.kind === 'video');
      if (next && local > clipDur(c) - 3) {
        const nsrc = ws(A.get(next.c.asset).proxy);
        const o = vids[1 - curVid];
        if (o.dataset.src !== nsrc) (load(o, nsrc), (o.currentTime = next.c.in));
      }
    } else if (c.kind === 'image') {
      vids.forEach((v) => v.pause());
      const src = ws(a.proxy);
      if (img.dataset.src !== src) load(img, src);
      fitStyle(img, c);
      applyGrade(img, c.grade);
      img.style.transform = c.move === 'still' ? '' : `scale(${1 + 0.08 * (local / Math.max(0.1, c.dur))})`;
      show('img');
    } else {
      vids.forEach((v) => v.pause());
      card.replaceChildren(c.kind === 'gap'
        ? h('div', {class: 'ed-gap'}, h('b', {}, c.camera ? `To camera${c.speaker ? ` · ${c.speaker}` : ''}` : 'Clip needed'), h('div', {}, c.camera ? c.text || '' : c.note || ''))
        : h('div', {class: 'ed-gap'}, h('b', {}, drawn(c) ? 'Making the graphic…' : 'Graphic: waiting for Claude'), h('div', {}, c.prompt || c.note || '')));
      show('card');
    }
  };
  const syncTracks = () => {
    const live = new Set();
    for (const k of ['main', 'over', 'voice', 'music']) {
      for (const it of itemsOf(E, k)) {
        const {c} = it;
        const a = c.asset ? A.get(c.asset) : null;
        if (!a || a.kind === 'image' || ((k === 'over' || k === 'main') && !a.audio)) continue;
        // a main clip plays its own sound, unless it is shown in a frame or its sound is cleaned
        if (k === 'main' && !(c.look && pieceOf(c)) && !cleanSrc(c)) continue;
        if (t < it.start || t >= it.end) continue;
        live.add(c.id);
        const src = cleanSrc(c) || ws(a.proxy);
        let el = audios.get(c.id);
        if (!el) audios.set(c.id, (el = new Audio(src)));
        if (el.dataset.src !== src && el.src !== new URL(src, location.href).href) (el.dataset.src = src), (el.src = src);
        const local = t - it.start;
        const want = c.in + local * (c.speed || 1);
        el.playbackRate = c.speed || 1;
        el.volume = gain(c, local) * (k === 'music' ? duckAt(t, talk(), DUCK[c.duck || 'strong']) : 1);
        if (Math.abs(el.currentTime - want) > (playing ? 0.35 : 0.05)) el.currentTime = want;
        if (playing && el.paused) el.play().catch(() => {});
        if (!playing && !el.paused) el.pause();
      }
    }
    for (const [id, el] of audios) if (!live.has(id) && !el.paused) el.pause();
  };
  // Over clips: a rendered cutout or graphic over the picture (a cutout set "over" makes the picture step back,
  // as in the final); a plain clip or photo shows as picture in picture
  const overBox = h('div', {class: 'ed-over', hidden: true});
  const overVid = h('video', {muted: true, playsinline: true});
  const overImg = h('img');
  overBox.append(overVid, overImg);
  const overPiece = h('video', {class: 'ed-v', playsinline: true, preload: 'auto', hidden: true});
  stage.append(overBox, overPiece);
  const focus = (k) => {
    mainLayer.style.opacity = k ? String(1 - 0.6 * k) : '';
    mainLayer.style.filter = k > 0.02 ? `blur(${1.5 * k}px)` : '';
    mainLayer.style.transform = k ? `translateX(${-6.25 * k}%) scale(${1 - 0.06 * k})` : '';
  };
  const syncOver = () => {
    const it = itemsOf(E, 'over').find((x) => t >= x.start && t < x.end);
    const pc = it && drawn(it.c) ? pieceOf(it.c) : null;
    overPiece.hidden = !pc;
    focus(0);
    if (pc) {
      overBox.hidden = true;
      overVid.pause();
      playAt(overPiece, ws(pc.file), t - it.start, 1);
      overPiece.volume = 0.7;
      if (pc.alpha) {
        const local = t - it.start;
        const d = it.end - it.start;
        focus(Math.max(0, Math.min(1, local / 0.2, (d - local) / 0.2)));
      }
      return;
    }
    overPiece.pause();
    if (!it || !it.c.asset) return ((overBox.hidden = true), overVid.pause());
    const a = A.get(it.c.asset);
    overBox.hidden = false;
    const src = ws(a.proxy);
    if (a.kind === 'video') {
      overImg.hidden = true;
      overVid.hidden = false;
      playAt(overVid, src, it.c.in + (t - it.start) * (it.c.speed || 1), it.c.speed || 1);
    } else {
      overVid.hidden = true;
      overImg.hidden = false;
      if (overImg.dataset.src !== src) load(overImg, src);
    }
  };
  // voice-over lines still to record show as a caption while they play, to read the cut
  const caption = h('div', {class: 'ed-caption', hidden: true});
  stage.append(caption);
  const syncLines = () => {
    const it = itemsOf(E, 'voice').find((x) => x.c.kind === 'line' && t >= x.start && t < x.end);
    caption.hidden = !it;
    if (it) caption.textContent = `${it.c.speaker ? `${it.c.speaker}: ` : ''}${it.c.text || ''}`;
  };
  const sync = () => {
    syncMain();
    syncLines();
    syncOver();
    syncTracks();
    movePlayhead();
  };
  const seek = (time, redraw = false) => {
    t = Math.max(0, Math.min(totalOf(E), time));
    sync();
    if (redraw) drawTimeline();
  };
  let last = 0;
  const tick = (now) => {
    if (!playing) return;
    const it = mainAt(t);
    const v = vids[curVid];
    // follow the video's own clock while a clip plays, so picture and sound stay together
    if (it?.c.kind === 'video' && !v.paused && !v.seeking && v.readyState >= 2) {
      const vt = it.start + (v.currentTime - it.c.in) / (it.c.speed || 1);
      t = vt >= it.end - 0.02 ? it.end : Math.max(t, vt);
    } else t += (now - last) / 1000;
    last = now;
    if (t >= totalOf(E)) return ((t = totalOf(E)), togglePlay(false));
    sync();
    requestAnimationFrame(tick);
  };
  const togglePlay = (on = !playing) => {
    playing = on;
    playBtn.textContent = playing ? 'Pause' : 'Play';
    if (playing) {
      if (t >= totalOf(E) - 0.05) t = 0;
      last = performance.now();
      requestAnimationFrame(tick);
    }
    sync();
  };

  // ---------- versions ----------
  const drawVersions = () => {
    versionSel.replaceChildren(h('option', {value: ''}, S.versions.length ? `Versions (${S.versions.length})` : 'No saved versions'), ...S.versions.slice().reverse().map((v) => h('option', {value: v.n}, `${v.n}. ${v.name} · ${clock(v.duration)}`)));
  };
  versionSel.onchange = async () => {
    const n = versionSel.value;
    versionSel.value = '';
    if (!n || !confirm('Go back to this version? The current edit is saved as a version first.')) return;
    E = await api('POST', `${base}/versions/${n}/restore`);
    S.versions = (await api('GET', base)).versions;
    undo.length = redo.length = 0;
    draw();
  };
  const saveVersion = async () => {
    const name = prompt('Name this version (e.g. "First cut", "Shorter hook")', '');
    if (name == null) return;
    clearTimeout(saveTimer);
    await api('PUT', base, E);
    S.versions = await api('POST', `${base}/versions`, {name});
    drawVersions();
    toast('Version saved');
  };

  // ---------- page ----------
  const draw = () => {
    drawTimeline();
    drawInspector();
    sync();
  };
  const onKey = (ev) => {
    if (!document.body.contains(tl)) return document.removeEventListener('keydown', onKey);
    if (/INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
    const k = ev.key;
    if (k === ' ') (ev.preventDefault(), togglePlay());
    else if (k === 's' || k === 'S') split();
    else if (k === 'Delete' || k === 'Backspace') (ev.preventDefault(), remove());
    else if ((ev.ctrlKey || ev.metaKey) && (k === 'z' || k === 'Z')) (ev.preventDefault(), ev.shiftKey ? doRedo() : doUndo());
    else if ((ev.ctrlKey || ev.metaKey) && (k === 'y' || k === 'Y')) (ev.preventDefault(), doRedo());
    else if (k === 'ArrowLeft' || k === 'ArrowRight') (ev.preventDefault(), seek(t + (k === 'ArrowLeft' ? -1 : 1) * (ev.shiftKey ? 1 : 1 / FPS)));
    else if (k === 'i' || k === 'I') setEdge('in');
    else if (k === 'o' || k === 'O') setEdge('out');
  };
  document.addEventListener('keydown', onKey);
  tl.addEventListener('wheel', (ev) => {
    if (!ev.ctrlKey) return;
    ev.preventDefault();
    zoom = Math.max(2, Math.min(400, zoom * (ev.deltaY < 0 ? 1.2 : 1 / 1.2)));
    drawTimeline();
  }, {passive: false});
  window.addEventListener('beforeunload', (ev) => (saved ? undefined : (ev.preventDefault(), (ev.returnValue = ''))));

  drawBin();
  drawVersions();
  setPieces(P);
  setSound(SO);
  api('GET', `${base}/graphics`).then((w) => ((W = w), watchWriting())).catch(() => {});
  render(
    h('div', {class: 'row'},
      h('a', {href: `#/p/${slug}/v/${folder}`, class: 'muted', style: 'text-decoration:none'}, `← ${S.code} · ${S.title}`),
      h('span', {class: 'grow'}), status, versionSel, h('button', {onclick: saveVersion}, 'Save version')),
    h('div', {class: 'ed-top'},
      h('div', {class: 'card', style: 'padding:10px;overflow:auto;max-height:560px'}, bin),
      h('div', {}, stage,
        h('div', {class: 'row', style: 'margin-top:10px;gap:8px;flex-wrap:wrap'},
          playBtn, timeEl, h('span', {class: 'grow'}),
          h('button', {onclick: split, title: 'S'}, 'Split'),
          h('button', {onclick: () => setEdge('in'), title: 'I'}, 'Start here'),
          h('button', {onclick: () => setEdge('out'), title: 'O'}, 'End here'),
          h('button', {onclick: addGap, title: 'A space for a clip you still need'}, '+ Space for a clip'),
          h('button', {onclick: () => ((adding = true), (sel = null), drawInspector(), drawTimeline()), title: 'A graphic or cutout at the playhead, from an idea'}, '+ Graphic'),
          levelBtn,
          h('button', {onclick: () => openRecorder({mode: 'free', track: 'voice'}), title: 'Record your voice at the playhead, onto the Voice track'}, '● Record here'),
          h('button', {class: 'primary', onclick: () => openRender()}, 'Render'),
          h('button', {onclick: newScene}, '+ Scene'),
          h('button', {onclick: doUndo, title: 'Ctrl+Z'}, 'Undo'),
          h('button', {onclick: doRedo, title: 'Ctrl+Shift+Z'}, 'Redo'))),
      inspector),
    h('div', {class: 'row', style: 'margin:14px 0 6px'}, h('h3', {class: 'grow'}, 'Timeline'), h('span', {class: 'muted', style: 'font-size:12px'}, 'Ctrl + wheel to zoom'), zoomOut, zoomIn),
    tl,
  );
  document.querySelector('main')?.classList.add('wide');
  window.addEventListener('hashchange', () => (togglePlay(false), document.querySelector('main')?.classList.remove('wide')), {once: true});
  draw();
}
