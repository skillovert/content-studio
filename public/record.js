// Recording studio page (#/p/<slug>/v/<folder>/record): the creator records the script line by
// line against the approved preview. Voice lines record the mic; face lines (creator-on-camera
// videos) record camera + mic, with the live camera shown in the preview's face slot. Dub
// languages are recorded the same way, or made with a synthetic voice. Keys: R record/stop,
// P play take, Space watch line, ← → previous/next.

// Where each face layout's slot sits on the 1920x1080 picture (scenes/Faces.tsx BOX), in %.
const SLOT = {
  'face-full': {left: 0, top: 0, width: 100, height: 100},
  'face-left': {left: 3.33, top: 12.04, width: 31.25, height: 75.93},
  'face-right': {left: 65.42, top: 12.04, width: 31.25, height: 75.93},
  'face-split': {left: 0, top: 0, width: 50, height: 100},
  'face-circle': {left: 77.08, top: 55.56, width: 18.75, height: 33.33},
  'face-corner': {left: 73.75, top: 11.11, width: 22.92, height: 22.96},
  'face-frame': {left: 66.15, top: 50.93, width: 28.12, height: 37.04},
  'face-phone': {left: 71.88, top: 10.19, width: 22.4, height: 79.63},
};
const LAYOUT_NAME = {voice: 'Voice only', 'face-full': 'Face · full screen', 'face-left': 'Face · left', 'face-right': 'Face · right', 'face-split': 'Face · split screen', 'face-circle': 'Face · circle', 'face-corner': 'Face · corner box', 'face-frame': 'Face · in the TV', 'face-phone': 'Face · in the phone'};
const ROUND = {'face-circle': '50%', 'face-phone': '24px', 'face-frame': '14px'};
const fmt = (s) => `${(s || 0).toFixed(1)}s`;
/** A dub fits when it is this much shorter / longer than the creator's take (seconds). */
const FIT = [-0.5, 1];

/** Trim silence at the edges (RMS over 20 ms) and return {wav, dur, peak, trimIn}. */
async function toWav(blob) {
  const ctx = new AudioContext();
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close();
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const win = Math.floor(sr * 0.02);
  const rms = [];
  for (let i = 0; i + win <= d.length; i += win) {
    let s = 0;
    for (let j = i; j < i + win; j++) s += d[j] * d[j];
    rms.push(Math.sqrt(s / win));
  }
  const top = Math.max(...rms, 1e-6);
  const th = Math.max(0.008, top * 0.06);
  let a = rms.findIndex((v) => v > th);
  let b = rms.length - 1 - [...rms].reverse().findIndex((v) => v > th);
  if (a < 0) (a = 0), (b = rms.length - 1);
  const start = Math.max(0, a * 0.02 - 0.08);
  const end = Math.min(buf.duration, (b + 1) * 0.02 + 0.12);
  const pcm = d.subarray(Math.floor(start * sr), Math.floor(end * sr));
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); out.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVEfmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  str(36, 'data'); out.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 32767, true);
  return {wav: new Blob([out], {type: 'audio/wav'}), dur: end - start, peak, trimIn: start};
}

export async function recordPage({slug, folder, h, api, toast, render}) {
  const base = `/api/playlists/${slug}/videos/${folder}/record`;
  let S = await api('GET', base);
  const back = h('a', {href: `#/p/${slug}/v/${folder}`, class: 'muted', style: 'text-decoration:none'}, `← ${S.code} · ${S.title}`);
  if (!S.ready) {
    return render(back, h('div', {class: 'card', style: 'margin-top:14px'}, h('h2', {}, 'Recording'), h('p', {class: 'muted'}, 'Recording opens once the preview and thumbnail are approved, so you record against the final picture.')));
  }

  let lang = S.langs[0];
  let cur = Math.max(0, S.lines.findIndex((l) => !S.takes[lang]?.[l.key]));
  let mode = 'idle'; // idle | rec | loop | play
  let mic = null; // audio stream
  let cam = null; // camera + mic stream (face lines)
  let recs = [];
  let started = 0;
  let tick = null;
  let player = null;
  const voiceLang = () => lang === S.langs[0];
  const line = () => S.lines[cur];
  const take = (l = line()) => S.takes[lang]?.[l.key];
  const isFace = (l = line()) => voiceLang() && l.layout !== 'voice';
  const textOf = (l = line()) => (voiceLang() ? l.vo : S.texts[lang]?.[l.key] || '');
  /** The creator's own take length for a line (what the dubs are fitted to), or 0. */
  const target = (l) => {
    const v = S.takes[S.langs[0]]?.[l.key];
    return v && v.peak >= 0.02 ? v.dur : 0;
  };
  /** A line's base voice in a dub language: its host's voice (kit plans), else the language's. */
  const baseVoice = (l, d = lang) => {
    const {hosts, ...own} = S.voices[d] || {voice: '', rate: 0, pitch: 0};
    return {...own, ...(hosts?.[l.speaker] || {})};
  };
  /** The voice for a line in a dub language: the base voice, then the line's own choices. */
  const voiceFor = (l, d = lang) => ({...baseVoice(l, d), ...(S.lineVoice[l.key]?.[d] || {})});
  const hosts = S.hosts || [];
  const isHost = (name) => hosts.some((x) => x.name === name);
  const who = (l) => (!hosts.length ? '' : isHost(l.speaker) ? l.speaker : hosts.map((x) => x.name).join(' & '));
  let only = ''; // record one host's lines at a time ('' = every line)
  const mineToRecord = (l) => !only || l.speaker === only || !isHost(l.speaker);

  // ---------- elements ----------
  const video = h('video', {muted: true, playsinline: true, preload: 'auto', src: S.preview, style: 'width:100%;display:block;border-radius:10px;background:#000'});
  video.muted = true;
  const live = h('video', {muted: true, playsinline: true, autoplay: true, class: 'rec-live'});
  live.muted = true;
  const cue = h('div', {class: 'rec-cue', hidden: true}); // on-camera countdown over the live camera
  const stage = h('div', {class: 'rec-stage'}, video, live, cue);
  const prompt = h('div', {class: 'rec-prompt', dir: 'auto'});
  const dubText = h('textarea', {dir: 'auto', class: 'rec-dubtext', placeholder: 'This line in the dub language'});
  const original = h('div', {class: 'muted', style: 'margin-top:6px'}); // the voice-language line, for reference on a dub
  const where = h('div', {class: 'label'});
  const timer = h('span', {class: 'rec-timer'});
  const meter = h('div', {class: 'rec-meter'}, h('i'));
  const slotPill = h('span', {class: 'pill'});
  const takePill = h('span', {class: 'pill'});
  const note = h('span', {class: 'muted', style: 'font-size:13px'});
  const list = h('div', {class: 'rec-list'});
  const progress = h('div', {class: 'rec-progress'}, h('i'));
  const progText = h('span', {class: 'muted'});
  const tabs = h('div', {class: 'tabs', style: 'margin:0'});
  const autoNext = h('input', {type: 'checkbox', checked: true});
  const micPick = h('select', {style: 'max-width:240px'});
  const camPick = h('select', {style: 'max-width:240px'});
  const btnRec = h('button', {class: 'primary big', onclick: () => toggleRec()}, 'Record', h('kbd', {}, 'R'));
  const btnPlay = h('button', {onclick: () => playTake()}, 'Play take', h('kbd', {}, 'P'));
  const btnLoop = h('button', {onclick: () => toggleLoop()}, 'Watch line', h('kbd', {}, 'Space'));
  const btnDel = h('button', {class: 'danger', onclick: () => delTake()}, 'Delete take');
  const btnTts = h('button', {}, 'Fit to my take');
  const btnMake = h('button', {}, 'Make with these settings');
  const btnDone = h('button', {}, 'Mark done');
  const finalBox = h('input', {type: 'checkbox'});
  const finalLabel = h('label', {class: 'row muted', style: 'gap:6px'}, finalBox, 'Recording final');
  const dubTools = h('div', {class: 'row', style: 'margin-top:10px'});
  const langVoice = h('div', {class: 'rec-voice'}); // the dub language's voice for this video
  const lineVoice = h('div', {class: 'rec-voice'}); // this line's own speaker, speed, pitch
  const voiceTools = h('div', {class: 'row', style: 'margin-top:10px'}); // voice tab: auto dub
  const hostVoice = h('div', {class: 'rec-voice'}); // the line's host's voice in the dub language
  const hostPick = hosts.length > 1 ? h('select', {style: 'max-width:200px'}, h('option', {value: ''}, 'Every host\'s lines'), ...hosts.map((x) => h('option', {value: x.name}, `${x.name}'s lines (and shared)`))) : null;
  if (hostPick) hostPick.onchange = () => ((only = hostPick.value), mineToRecord(line()) ? drawList() : select(S.lines.findIndex(mineToRecord)));

  // ---------- devices ----------
  async function devices() {
    const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const fill = (sel, kind, label) => {
      const keep = sel.value;
      sel.replaceChildren(...all.filter((d) => d.kind === kind).map((d, i) => h('option', {value: d.deviceId}, d.label || `${label} ${i + 1}`)));
      if (keep) sel.value = keep;
    };
    fill(micPick, 'audioinput', 'Microphone');
    fill(camPick, 'videoinput', 'Camera');
  }
  const audioOpts = () => ({deviceId: micPick.value ? {exact: micPick.value} : undefined, echoCancellation: false, noiseSuppression: true, autoGainControl: false, channelCount: 1});
  async function getMic() {
    if (!mic) mic = await navigator.mediaDevices.getUserMedia({audio: audioOpts()});
    return mic;
  }
  async function getCam() {
    if (!cam) cam = await navigator.mediaDevices.getUserMedia({audio: audioOpts(), video: {deviceId: camPick.value ? {exact: camPick.value} : undefined, width: {ideal: 1920}, height: {ideal: 1080}, frameRate: {ideal: 30}}});
    return cam;
  }
  const stopStreams = () => {
    for (const s of [mic, cam]) s?.getTracks().forEach((t) => t.stop());
    mic = cam = null;
  };
  micPick.onchange = () => (stopStreams(), showLive());
  camPick.onchange = () => (stopStreams(), showLive());

  // live camera in the face slot of the current line
  async function showLive() {
    const l = line();
    if (!isFace(l)) {
      live.hidden = true;
      live.srcObject = null;
      return;
    }
    const r = SLOT[l.layout];
    Object.assign(live.style, {left: `${r.left}%`, top: `${r.top}%`, width: `${r.width}%`, height: `${r.height}%`, borderRadius: ROUND[l.layout] || '8px'});
    live.hidden = false;
    try {
      live.srcObject = await getCam();
      devices();
    } catch {
      note.textContent = 'Camera blocked: allow it in the address bar (this line shows your face).';
    }
  }

  // ---------- list + line ----------
  function drawTabs() {
    tabs.replaceChildren(...S.langs.map((l, i) => h('button', {class: l === lang ? 'on' : '', onclick: () => {
      if (mode === 'rec') return;
      lang = l;
      cur = Math.max(0, S.lines.findIndex((x) => !S.takes[lang]?.[x.key]));
      select(cur);
    }}, i ? `Dub · ${l}` : `Voice · ${l}`)));
  }
  function drawList() {
    let scene = null;
    const kids = [];
    const dubs = S.langs.slice(1);
    S.lines.forEach((l, i) => {
      if (l.scene !== scene) kids.push(h('div', {class: 'rec-scene'}, (scene = l.scene)));
      // two states per line: the creator's own take, and the dubs (all languages)
      const v = S.takes[S.langs[0]]?.[l.key];
      const vBad = v && (v.peak < 0.02 || (S.face && l.layout !== 'voice' && !v.camera));
      const vState = !v ? '' : vBad ? 'bad' : v.final ? 'done' : 'half';
      const vTip = !v ? 'Your voice: not recorded' : vBad ? 'Your voice: take has a problem' : v.final ? 'Your voice: final' : 'Your voice: recorded, not marked final';
      const nDone = dubs.filter((d) => !S.check[d].missing.includes(l.key)).length;
      const nMade = dubs.filter((d) => S.takes[d]?.[l.key]).length;
      const dState = nDone === dubs.length ? 'done' : nMade ? 'half' : '';
      const mine = S.takes[lang]?.[l.key];
      kids.push(h('div', {class: 'rec-item' + (i === cur ? ' on' : ''), style: mineToRecord(l) ? null : 'opacity:.35', onclick: () => select(i)},
        hosts.length ? h('span', {class: 'badge dark', title: 'Who says this line'}, isHost(l.speaker) ? l.speaker : 'All') : null,
        h('span', {class: 'rec-dot ' + vState, title: vTip}),
        dubs.length ? h('span', {class: 'rec-dot dub ' + dState, title: `Dubs done: ${nDone} of ${dubs.length}${nMade > nDone ? ` (${nMade - nDone} made, not marked done)` : ''}`}) : null,
        h('span', {class: 'grow'}, voiceLang() ? l.vo : S.texts[lang]?.[l.key] || h('i', {class: 'muted'}, 'no text yet')),
        !voiceLang() && S.check[lang].stale.includes(l.key) ? h('span', {class: 'badge', title: 'The text changed after this dub was made'}, 'stale') : null,
        !voiceLang() && mine?.source === 'tts' ? h('span', {class: 'badge dark', title: 'Synthetic voice'}, 'tts') : null,
        isFace(l) ? h('span', {class: 'badge dark', title: LAYOUT_NAME[l.layout]}, 'face') : null));
    });
    list.replaceChildren(...kids);
    list.querySelector('.on')?.scrollIntoView({block: 'nearest'});
    // total progress: every language's done lines over all lines in all languages
    const all = S.langs.reduce((n, d) => n + S.check[d].done, 0);
    const total = S.lines.length * S.langs.length;
    const v = S.check[S.langs[0]];
    const parts = [`Your voice ${v.done}/${v.total} (${v.final} final)`, ...dubs.map((d) => `${d} ${S.check[d].done}/${S.check[d].total} done`)];
    const c = S.check[lang];
    progText.textContent = `${Math.round((100 * all) / Math.max(1, total))}% · ${parts.join(' · ')}${c.silent.length ? ` · ${c.silent.length} silent` : ''}${c.long.length ? ` · ${c.long.length} much longer than planned` : ''}`;
    progress.firstChild.style.width = `${(100 * all) / Math.max(1, total)}%`;
  }
  function drawTake() {
    const l = line();
    const t = take();
    // the voice language is timed against the plan; a dub against the creator's own take
    const mine = target(l);
    const goal = voiceLang() || !mine ? l.slot : mine;
    slotPill.textContent = voiceLang() || !mine ? `planned ${fmt(l.slot)}` : `your take ${fmt(mine)}`;
    if (!t) {
      takePill.textContent = 'no take yet';
      takePill.className = 'pill';
    } else {
      const diff = t.dur - goal;
      const fits = voiceLang() || !mine ? Math.abs(diff) < 0.8 : diff >= FIT[0] && diff <= FIT[1];
      const how = t.source === 'tts' ? `synthetic${t.rate ? ` ${t.rate > 0 ? '+' : ''}${t.rate}%` : ''} ` : '';
      takePill.textContent = `${how}take ${fmt(t.dur)} (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}s)`;
      takePill.className = 'pill ' + (t.peak < 0.02 ? 'bad' : fits ? 'ok' : Math.abs(diff) < 2 ? 'warn' : 'bad');
    }
    btnPlay.disabled = btnDel.disabled = !t;
    finalBox.checked = Boolean(t?.final);
    finalBox.disabled = !t;
    const stale = !voiceLang() && S.check[lang].stale.includes(l.key);
    btnDone.disabled = !t || stale;
    btnDone.textContent = t?.done && !stale ? 'Done ✓ (undo)' : 'Mark done';
    btnDone.className = t?.done && !stale ? 'ok' : 'primary';
    btnDone.title = stale ? 'The text changed: make the dub again first' : 'You listened to this dub and it is right';
  }
  function select(i) {
    if (mode === 'rec') return;
    stopPlayback();
    cur = Math.max(0, Math.min(S.lines.length - 1, i));
    const l = line();
    where.textContent = `${who(l) ? `${who(l)} · ` : ''}${l.scene} · line ${cur + 1} of ${S.lines.length} · ${LAYOUT_NAME[isFace(l) ? l.layout : 'voice']}${isFace(l) ? ` · on camera ${l.faceFor ? `${l.faceFor} s, then off camera` : 'the whole line'}` : ''}`;
    prompt.textContent = textOf(l).replace(/"/g, '') || '—';
    prompt.hidden = !voiceLang();
    dubText.hidden = original.hidden = voiceLang();
    original.textContent = `${S.langs[0]}: ${l.vo.replace(/"/g, '')}`;
    dubText.value = S.texts[lang]?.[l.key] || '';
    btnTts.hidden = btnMake.hidden = btnDone.hidden = voiceLang();
    dubTools.hidden = langVoice.hidden = lineVoice.hidden = voiceLang();
    hostVoice.hidden = voiceLang() || !isHost(l.speaker);
    finalLabel.hidden = voiceTools.hidden = !voiceLang();
    if (!voiceLang()) drawVoices();
    note.textContent = '';
    timer.textContent = '';
    if (video.readyState) video.currentTime = l.start;
    drawTabs();
    drawTake();
    drawList();
    showLive();
  }
  let saveT = null;
  dubText.oninput = () => {
    clearTimeout(saveT);
    const key = line().key;
    const text = dubText.value;
    saveT = setTimeout(async () => {
      S.texts[lang] = await api('PUT', `${base}/text`, {lang, key, text});
      drawList();
    }, 500);
  };

  // ---------- playback ----------
  video.addEventListener('timeupdate', () => {
    const l = line();
    if (mode === 'loop' && video.currentTime > l.end + 0.5) video.currentTime = l.start;
  });
  function stopPlayback() {
    if (mode === 'loop' || mode === 'play') mode = 'idle';
    video.pause();
    if (player) {
      player.pause();
      player.remove?.();
      player = null;
    }
    if (isFace() && cam) live.srcObject = cam;
  }
  function toggleLoop() {
    if (mode === 'rec') return;
    if (mode === 'loop') return stopPlayback();
    stopPlayback();
    mode = 'loop';
    video.currentTime = line().start;
    video.play();
  }
  // the take with the picture: a face take plays in its slot, a voice take under the preview
  function playTake() {
    const t = take();
    if (!t || mode === 'rec') return;
    stopPlayback();
    const fresh = `?t=${Date.now()}`;
    const file = `/ws/playlists/${slug}/${folder}/`;
    if (t.camera && isFace()) {
      live.srcObject = null;
      live.src = file + t.camera + fresh;
      live.muted = false;
      live.currentTime = t.trimIn || 0;
      player = {pause: () => (live.pause(), (live.muted = true), live.removeAttribute('src'), live.load())};
      live.play();
    } else {
      const a = new Audio(file + t.file + fresh);
      player = a;
      a.play();
      a.onended = () => mode === 'play' && stopPlayback();
    }
    mode = 'play';
    video.currentTime = line().start;
    video.play();
    setTimeout(() => mode === 'play' && stopPlayback(), (Math.max(t.dur, line().slot) + 0.8) * 1000);
  }

  // ---------- recording ----------
  let analyser = null;
  function level(stream) {
    const ctx = new AudioContext();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    const bar = meter.firstChild;
    const draw = () => {
      if (mode !== 'rec') return (bar.style.width = '0%'), ctx.close();
      analyser.getFloatTimeDomainData(data);
      let p = 0;
      for (const v of data) p = Math.max(p, Math.abs(v));
      bar.style.width = `${Math.min(100, p * 140)}%`;
      bar.style.background = p > 0.95 ? 'var(--danger)' : p < 0.02 ? 'var(--muted)' : 'var(--green)';
      requestAnimationFrame(draw);
    };
    draw();
  }
  async function toggleRec() {
    if (mode === 'rec') return stopRec();
    stopPlayback();
    const l = line();
    if (!voiceLang() && !textOf(l)) return toast('Write or translate this line first', true);
    const face = isFace(l);
    let stream;
    try {
      stream = face ? await getCam() : await getMic();
    } catch {
      return toast(face ? 'Camera or microphone blocked: allow them in the address bar' : 'Microphone blocked: allow it in the address bar', true);
    }
    devices();
    // always a voice recorder; face lines also record the camera (with the same mic) for the picture
    const audioOnly = new MediaStream(stream.getAudioTracks());
    const chunks = {audio: [], camera: []};
    recs = [new MediaRecorder(audioOnly, {mimeType: 'audio/webm;codecs=opus'})];
    recs[0].ondataavailable = (e) => e.data.size && chunks.audio.push(e.data);
    if (face) {
      const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
      const vr = new MediaRecorder(stream, {mimeType: type, videoBitsPerSecond: 8_000_000});
      vr.ondataavailable = (e) => e.data.size && chunks.camera.push(e.data);
      recs.push(vr);
    }
    const done = Promise.all(recs.map((r) => new Promise((ok) => (r.onstop = ok))));
    recs.forEach((r) => r.start());
    mode = 'rec';
    started = performance.now();
    btnRec.className = 'rec big';
    btnRec.firstChild.textContent = 'Stop';
    note.textContent = 'Recording… say the line, then press R (or Stop).';
    video.currentTime = l.start;
    video.play();
    level(audioOnly);
    // on camera for faceFor seconds (counted down over the camera), then the visuals take over and
    // the line can be read off the prompt without looking into the lens
    const onCam = face ? l.faceFor || l.slot : 0;
    tick = setInterval(() => {
      const t = (performance.now() - started) / 1000;
      timer.textContent = fmt(t);
      timer.style.color = t > l.slot + 1 ? 'var(--amber)' : '';
      if (face) {
        const left = onCam - t;
        cue.hidden = false;
        cue.textContent = left > 0 ? `Look at the camera · ${Math.ceil(left)}` : 'Off camera: read the rest';
        cue.className = 'rec-cue' + (left > 0 ? '' : ' off');
        live.style.opacity = left > 0 ? '1' : '0.25';
      }
    }, 100);
    await done;
    await saveTake(l, new Blob(chunks.audio, {type: 'audio/webm'}), face ? new Blob(chunks.camera, {type: 'video/webm'}) : null);
  }
  function stopRec() {
    clearInterval(tick);
    cue.hidden = true;
    live.style.opacity = '1';
    mode = 'idle';
    video.pause();
    recs.forEach((r) => r.state !== 'inactive' && r.stop());
    btnRec.className = 'primary big';
    btnRec.firstChild.textContent = 'Record';
  }
  async function upload(l, kind, blob, meta = {}, d = lang) {
    const q = new URLSearchParams({kind, ...Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, typeof v === 'number' ? v.toFixed(3) : v]))});
    const res = await fetch(`${base}/take/${d}/${l.key}?${q}`, {method: 'POST', headers: {'Content-Type': blob.type || 'application/octet-stream'}, body: blob});
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || res.statusText);
    return out;
  }
  async function saveTake(l, audio, camera, source = 'mic') {
    note.textContent = 'Saving…';
    try {
      const w = await toWav(audio);
      if (camera) await upload(l, 'camera', camera);
      await upload(l, 'audio', w.wav, {dur: w.dur, peak: w.peak, trimIn: w.trimIn, source});
      S = {...(await api('GET', base)), preview: S.preview};
      if (w.peak < 0.02) {
        note.textContent = 'Nothing was heard in that take. Check the microphone and record again.';
        toast('Silent take: check the microphone', true);
      } else note.textContent = `Saved (${fmt(w.dur)}). P to check it with the picture.`;
      timer.textContent = '';
      drawTake();
      drawList();
      if (w.peak >= 0.02 && autoNext.checked && source === 'mic' && line().key === l.key && cur < S.lines.length - 1) setTimeout(() => line().key === l.key && mode === 'idle' && step(1), 900);
    } catch (e) {
      note.textContent = `Not saved: ${e.message}`;
      toast(e.message, true);
    }
  }
  async function delTake() {
    if (!take() || !confirm('Delete this take?')) return;
    await api('DELETE', `${base}/take/${lang}/${line().key}`);
    S = {...(await api('GET', base)), preview: S.preview};
    drawTake();
    drawList();
  }

  // ---------- dubs: voices, synthetic voice fitted to the creator's take, translation ----------
  const short = (name) => (name || '').replace(/^[a-z]{2,3}-[A-Z]{2,4}-/i, '').replace(/Neural$/, '');
  const voicesOf = (d) => {
    const pre = d.split('-')[0].toLowerCase();
    return S.voiceList.filter((v) => v.locale.split('-')[0].toLowerCase() === pre || v.multilingual);
  };
  const refresh = async () => (S = {...(await api('GET', base)), preview: S.preview});
  async function synth(d, v, text) {
    const res = await fetch(`${base}/speak`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({lang: d, text, voice: v.voice, rate: v.rate || 0, pitch: v.pitch || 0})});
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.blob();
  }
  let sample = null;
  async function preview(d, v, btn) {
    sample?.pause();
    btn.disabled = true;
    try {
      const text = S.texts[d]?.[line().key] || line().vo;
      sample = new Audio(URL.createObjectURL(await synth(d, v, text.replace(/"/g, ''))));
      sample.play();
    } catch (e) {
      toast(e.message, true);
    }
    btn.disabled = false;
  }
  /** Voice, speed and pitch controls; fallback (line panel) adds "the language's voice" as the first choice. */
  function controls(d, v, fallback, save) {
    const sel = h('select', {style: 'max-width:240px'},
      fallback ? h('option', {value: ''}, `Default (${short(fallback.voice)})`) : null,
      voicesOf(d).map((x) => h('option', {value: x.name}, `${x.label || short(x.name)}${x.gender ? ` · ${x.gender}` : ''}${x.multilingual ? ' · multilingual' : ''}`)));
    if (v.voice && ![...sel.options].some((o) => o.value === v.voice)) sel.append(h('option', {value: v.voice}, short(v.voice)));
    sel.value = v.voice || '';
    const slider = (k, lo, hi, unit, label) => {
      const r = h('input', {type: 'range', min: lo, max: hi, step: 1, style: 'width:110px'});
      r.value = v[k] || 0;
      const out = h('span', {class: 'muted rec-num'});
      const show = () => (out.textContent = `${r.value > 0 ? '+' : ''}${r.value}${unit}`);
      show();
      r.oninput = show;
      r.onchange = () => save(read());
      return {r, el: h('label', {class: 'row muted', style: 'gap:6px'}, label, r, out)};
    };
    const rate = slider('rate', -50, 100, '%', 'Speed');
    const pitch = slider('pitch', -20, 20, 'Hz', 'Pitch');
    const read = () => ({voice: sel.value || (fallback ? undefined : ''), rate: Number(rate.r.value), pitch: Number(pitch.r.value)});
    sel.onchange = () => save(read());
    const play = h('button', {onclick: () => preview(d, {...(fallback || {}), ...Object.fromEntries(Object.entries(read()).filter(([, x]) => x !== undefined))}, play)}, 'Preview');
    return [sel, rate.el, pitch.el, play];
  }
  function drawVoices() {
    const d = lang;
    const l = line();
    const {hosts: _h, ...langOwn} = S.voices[d] || {voice: '', rate: 0, pitch: 0};
    const lv = baseVoice(l, d);
    const fail = (e) => toast(e.message, true);
    const reload = async () => ((S.voices = (await api('GET', base)).voices), drawVoices(), toast('Voice saved'));
    langVoice.replaceChildren(
      h('span', {class: 'label'}, hosts.length ? `${d} voice for shared lines` : `${d} voice for this video`),
      ...controls(d, langOwn, null, (v) => api('PUT', `${base}/voice`, {lang: d, ...v}).then(reload).catch(fail)),
    );
    if (isHost(l.speaker)) {
      hostVoice.replaceChildren(
        h('span', {class: 'label', title: 'Every line this host says, in this language'}, `${l.speaker}'s ${d} voice`),
        ...controls(d, lv, null, (v) => api('PUT', `${base}/voice`, {lang: d, host: l.speaker, ...v}).then(reload).catch(fail)),
      );
    }
    const o = S.lineVoice[l.key]?.[d] || {};
    const shown = {voice: o.voice || '', rate: o.rate ?? lv.rate ?? 0, pitch: o.pitch ?? lv.pitch ?? 0};
    const saveLine = (value) => api('PUT', `${base}/line-voice`, {key: l.key, lang: d, value}).then((x) => ((S.lineVoice = x), drawVoices())).catch(fail);
    lineVoice.replaceChildren(
      h('span', {class: 'label', title: 'Another speaker for this line (a quote, a second person), or its own speed'}, 'This line'),
      ...controls(d, shown, lv, saveLine),
      ...(Object.keys(o).length ? [h('button', {onclick: () => saveLine(null)}, isHost(l.speaker) ? `Reset to ${l.speaker}'s voice` : 'Reset to the language voice')] : []),
    );
  }

  /**
   * One synthetic dub line. With fit, the speed is adjusted (up to 4 tries) until the dub lands within
   * FIT of the creator's take, so every language cuts the scenes at the same moments. The dub still
   * needs the creator's "Mark done" after listening.
   */
  async function makeDub(l, d = lang, fit = true) {
    const text = S.texts[d]?.[l.key];
    if (!text) throw new Error(`Line ${S.lines.indexOf(l) + 1} has no ${d} text yet`);
    const v = voiceFor(l, d);
    if (!v.voice) throw new Error(`Pick a ${d} voice first`);
    const goal = fit ? target(l) : 0;
    const aim = goal + (FIT[0] + FIT[1]) / 2; // the middle of the window
    let rate = v.rate || 0;
    let best = null;
    for (let i = 0; i < (goal ? 4 : 1); i++) {
      const w = await toWav(await synth(d, {...v, rate}, text));
      const diff = w.dur - goal;
      const miss = !goal ? 0 : diff < FIT[0] ? FIT[0] - diff : diff > FIT[1] ? diff - FIT[1] : 0;
      if (!best || miss < best.miss) best = {...w, rate, miss};
      if (!miss) break;
      // speech length scales with 1 / (1 + rate)
      const next = Math.max(-50, Math.min(100, Math.round(((1 + rate / 100) * w.dur / aim - 1) * 100)));
      if (next === rate) break;
      rate = next;
    }
    await upload(l, 'audio', best.wav, {dur: best.dur, peak: best.peak, trimIn: best.trimIn, source: 'tts', voice: v.voice, rate: best.rate, pitch: v.pitch || 0, text, fitted: String(Boolean(goal))}, d);
    // keep the fitted speed as this line's speed, so "Make with these settings" gives the same take
    if (goal && best.rate !== (v.rate || 0)) S.lineVoice = await api('PUT', `${base}/line-voice`, {key: l.key, lang: d, value: {...(S.lineVoice[l.key]?.[d] || {}), rate: best.rate}});
    return best;
  }
  async function dubThis(fit) {
    const l = line();
    if (fit && !target(l)) return toast('Record your own voice for this line first; the dub is fitted to it', true);
    btnTts.disabled = btnMake.disabled = true;
    note.textContent = fit ? 'Making and fitting…' : 'Making…';
    try {
      const b = await makeDub(l, lang, fit);
      await refresh();
      select(cur);
      note.textContent = b.miss ? `Closest fit is ${fmt(b.dur)}; change the text or speed and try again.` : 'Made. Listen (P), then Mark done.';
    } catch (e) {
      note.textContent = '';
      toast(e.message, true);
    }
    btnTts.disabled = btnMake.disabled = false;
  }
  btnTts.onclick = () => dubThis(true);
  btnMake.onclick = () => dubThis(false);
  btnDone.onclick = async () => {
    const t = take();
    if (!t) return;
    await api('PUT', `${base}/flag`, {lang, key: line().key, flag: 'done', value: !t.done}).catch((e) => toast(e.message, true));
    await refresh();
    drawTake();
    drawList();
  };
  finalBox.onchange = async () => {
    await api('PUT', `${base}/flag`, {lang, key: line().key, flag: 'final', value: finalBox.checked}).catch((e) => toast(e.message, true));
    await refresh();
    drawTake();
    drawList();
  };

  /** "Is your recording final?" → mark it final, translate what is missing, make and fit every dub. */
  async function autoDub(only) {
    const v0 = S.langs[0];
    const dubs = S.langs.slice(1);
    const pick = only ? [only] : S.lines.filter((l) => target(l));
    if (!pick.length || !target(pick[0])) return toast('Record your voice first', true);
    if (!confirm(only
      ? 'Is your recording of this line final? Its dubs will be made and fitted to it.'
      : `Is your recording final? ${pick.length} recorded lines will be marked final, and every dub language made and fitted to them.`)) return;
    autoBtn.disabled = autoOne.disabled = true;
    let made = 0;
    let msg = '';
    const skipped = [];
    try {
      for (const l of pick) if (!S.takes[v0][l.key].final) await api('PUT', `${base}/flag`, {lang: v0, key: l.key, flag: 'final', value: true});
      await refresh();
      for (const d of dubs) {
        if (S.hasKey && pick.some((l) => !S.texts[d]?.[l.key])) {
          note.textContent = `Translating ${d}…`;
          S.texts[d] = await api('POST', `${base}/translate`, {lang: d});
        }
        for (const [i, l] of pick.entries()) {
          const t = S.takes[d]?.[l.key];
          const voice = S.takes[v0][l.key];
          // keep dubs the creator recorded herself, and checked ones made after her take
          if (t && (t.source === 'mic' || (t.done && !S.check[d].stale.includes(l.key) && t.updated >= voice.updated))) continue;
          if (!S.texts[d]?.[l.key]) {
            skipped.push(`${d} line ${S.lines.indexOf(l) + 1}`);
            continue;
          }
          note.textContent = `${d}: line ${i + 1} of ${pick.length}…`;
          await makeDub(l, d, true);
          made++;
        }
        await refresh();
      }
      msg = `Made ${made} dub lines${skipped.length ? `; ${skipped.length} have no text yet` : ''}. Listen to each in its tab and mark it done.`;
      toast(`Made ${made} dub lines`);
    } catch (e) {
      msg = `Stopped after ${made}: ${e.message}`;
      toast(e.message, true);
      await refresh();
    }
    autoBtn.disabled = autoOne.disabled = false;
    select(cur);
    note.textContent = msg;
  }
  const autoBtn = h('button', {class: 'primary', onclick: () => autoDub()}, 'Auto dub all languages');
  const autoOne = h('button', {onclick: () => autoDub(line())}, 'Auto dub this line');
  if (S.langs.length > 1) voiceTools.append(autoBtn, autoOne, h('span', {class: 'muted', style: 'font-size:13px'}, `Dubs (${S.langs.slice(1).join(', ')}) are fitted to your take: ${FIT[0]} s to +${FIT[1]} s.`));

  const ttsAll = h('button', {onclick: async () => {
    const todo = S.lines.filter((l) => !S.takes[lang]?.[l.key] && S.texts[lang]?.[l.key]);
    if (!todo.length) return toast('Every line with text already has a take');
    ttsAll.disabled = true;
    try {
      for (const [i, l] of todo.entries()) {
        note.textContent = `Synthetic voice ${i + 1} / ${todo.length}…`;
        await makeDub(l, lang, Boolean(target(l)));
      }
      toast(`Made ${todo.length} lines`);
    } catch (e) {
      toast(e.message, true);
    }
    await refresh();
    select(cur);
    ttsAll.disabled = false;
  }}, 'Make all missing lines');
  const translateBtn = h('button', {onclick: async () => {
    translateBtn.disabled = true;
    translateBtn.textContent = 'Translating…';
    try {
      S.texts[lang] = await api('POST', `${base}/translate`, {lang});
      select(cur);
      toast('Translated');
    } catch (e) {
      toast(e.message, true);
    }
    translateBtn.disabled = false;
    translateBtn.textContent = 'Translate the script with Claude';
  }}, 'Translate the script with Claude');
  dubTools.append(S.hasKey ? translateBtn : h('span', {class: 'muted'}, 'No API key: ask Claude in this video\'s thread to translate the script, or type each line.'), ttsAll);

  /** The next (or previous) line to record: with one host picked, that host's and the shared lines. */
  function step(dir) {
    for (let i = cur + dir; i >= 0 && i < S.lines.length; i += dir) if (mineToRecord(S.lines[i])) return select(i);
  }

  // ---------- keys ----------
  const onKey = (e) => {
    if (!document.body.contains(stage)) return document.removeEventListener('keydown', onKey), stopStreams();
    if (['TEXTAREA', 'INPUT', 'SELECT'].includes(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'r') (e.preventDefault(), toggleRec());
    else if (k === 'p') (e.preventDefault(), playTake());
    else if (k === ' ') (e.preventDefault(), toggleLoop());
    else if (k === 'arrowright') step(1);
    else if (k === 'arrowleft') step(-1);
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', () => stopStreams(), {once: true});

  render(
    back,
    h('div', {class: 'row', style: 'margin:10px 0 14px'}, h('h1', {class: 'grow'}, 'Record'), tabs),
    h('div', {class: 'row', style: 'margin-bottom:12px'}, h('div', {class: 'grow'}, progress), progText),
    h('div', {class: 'rec-grid'},
      list,
      h('div', {},
        h('div', {class: 'card', style: 'padding:12px'}, stage),
        h('div', {class: 'card', style: 'margin-top:12px'},
          where, prompt, original, dubText,
          h('div', {class: 'row', style: 'margin-top:12px'}, btnRec, btnPlay, btnLoop, h('button', {onclick: () => step(-1)}, 'Prev', h('kbd', {}, '←')), h('button', {onclick: () => step(1)}, 'Next', h('kbd', {}, '→')), timer, meter),
          h('div', {class: 'row', style: 'margin-top:10px'}, slotPill, takePill, finalLabel, note, h('span', {class: 'grow'}), btnDel),
          h('div', {class: 'row', style: 'margin-top:10px'}, btnTts, btnMake, btnDone),
          lineVoice, hostVoice, langVoice, dubTools, voiceTools),
        h('div', {class: 'row', style: 'margin-top:12px'},
          h('label', {class: 'row muted', style: 'gap:6px'}, autoNext, 'Go to the next line after a good take'),
          hostPick ? [h('span', {class: 'muted'}, 'Record'), hostPick] : null,
          h('span', {class: 'grow'}),
          h('span', {class: 'muted'}, 'Mic'), micPick,
          S.face ? [h('span', {class: 'muted'}, 'Camera'), camPick] : null),
        h('p', {class: 'muted', style: 'font-size:13px'}, S.face
          ? 'Face lines record your camera and mic; you see yourself in the slot where you will appear. Other lines record your voice under the graphics. Silence at the start and end is trimmed.'
          : 'Each line records your voice under the graphics. Silence at the start and end is trimmed, so start whenever you are ready.'),
      ),
    ),
  );
  await devices();
  select(cur);
}
