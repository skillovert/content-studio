// Recording studio (step after the preview is approved): the creator records the script line by
// line in the browser, against the approved preview. Takes land in the video folder:
//   voiceover/<lang>/<CODE>-<key>.wav   the voice per line (silence at the edges trimmed in the browser)
//   camera/<CODE>-<key>.webm            camera + mic for face lines (creator-on-camera videos)
//   voiceover/takes.json                {<lang>: {<key>: {file, camera?, dur, peak, trimIn, source, updated}}}
//   voiceover/<lang>/text.json          a dub language's script, line by line {<key>: text}
// key = "<scene>-<line>" (0-based), the same numbering the preview's face slots use.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import {APP_DIR, readJson, rendererDir, writeJson} from './workspace.mjs';
import {withTiming} from './plan-schema.mjs';
import {loadProfile} from './brand.mjs';
import {apiKey} from './settings.mjs';
import {MODEL} from './planner.mjs';

const fail = (msg, status = 400) => Object.assign(new Error(msg), {status});
const KEY = /^\d{1,3}-\d{1,3}$/;
const LANG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
const SILENT = 0.02; // peak level below this = nothing was recorded
const state = (dir) => readJson(path.join(dir, 'video.json'), {});
const takesFile = (dir) => path.join(dir, 'voiceover', 'takes.json');
const textFile = (dir, lang) => path.join(dir, 'voiceover', lang, 'text.json');

// Synthetic dub voices (edge-tts, through the studio's tools/voice/tts.py), when the creator does
// not record a dub language herself. Same defaults as the studio's Voices page.
export const TTS_VOICES = {
  'en-US': 'en-US-AvaMultilingualNeural', 'en-GB': 'en-GB-SoniaNeural', hi: 'hi-IN-SwaraNeural', de: 'de-DE-SeraphinaMultilingualNeural',
  es: 'es-ES-ElviraNeural', fr: 'fr-FR-VivienneMultilingualNeural', ar: 'ar-SA-ZariyahNeural', ps: 'ps-AF-LatifaNeural',
  'en-AU': 'en-AU-NatashaNeural', it: 'it-IT-IsabellaNeural', bn: 'bn-BD-NabanitaNeural', 'pt-BR': 'pt-BR-ThalitaMultilingualNeural',
  tr: 'tr-TR-EmelNeural', id: 'id-ID-GadisNeural', 'ur-Arab': 'ur-PK-UzmaNeural', 'ur-Latn': 'ur-PK-UzmaNeural',
};

/** The approved plan's lines with the preview's timing, and where the creator is for each. */
export function scriptLines(plan, face, faceSeconds = 0) {
  const timed = plan.duration ? plan : withTiming(plan);
  return timed.scenes.flatMap((s, si) =>
    s.lines.map((l, li) => ({
      key: `${si}-${li}`,
      scene: s.title,
      start: l.start,
      end: l.end,
      slot: Math.round((l.end - l.start) * 100) / 100,
      vo: l.vo,
      speaker: l.speaker || '', // a kit plan's host (or 'all')
      layout: face ? l.layout || 'voice' : 'voice',
      // seconds on camera from the line's start, within the video's limit (0 = the whole line)
      faceFor: face && l.layout && l.layout !== 'voice' ? (faceSeconds ? Math.min(faceSeconds, Number(l.faceFor) || faceSeconds) : Number(l.faceFor) || 0) : 0,
    })),
  );
}

/** Voice language first, then the playlist's dubs. */
export function languages(root, playlist) {
  const profile = loadProfile(root);
  const voice = playlist.production?.voiceLanguage || profile.languages.voice;
  const dubs = playlist.production?.dubs || profile.languages.dubs || [];
  return [voice, ...dubs.filter((l) => l !== voice)];
}

/**
 * Per language. Voice language: a line is done when it is recorded (with its camera take on a face
 * line); final = the creator confirmed it (dubs are fitted to final takes). Dubs: a line is done when
 * its take is marked done by the creator and still matches the line's current text.
 */
export function check(lines, langs, takes, texts = {}) {
  return Object.fromEntries(langs.map((lang, i) => {
    const t = takes[lang] || {};
    const has = (l) => t[l.key] && (i > 0 || l.layout === 'voice' || t[l.key].camera);
    const stale = i ? lines.filter((l) => t[l.key]?.text !== undefined && t[l.key].text !== (texts[lang]?.[l.key] || '')).map((l) => l.key) : [];
    const done = lines.filter((l) => has(l) && (i === 0 || (t[l.key].done && !stale.includes(l.key))));
    const silent = lines.filter((l) => t[l.key] && t[l.key].peak < SILENT).map((l) => l.key);
    // much longer than its slot: the timing will stretch there (shown, not blocking)
    const long = lines.filter((l) => t[l.key] && t[l.key].dur > l.slot + 2).map((l) => l.key);
    return [lang, {
      total: lines.length,
      made: lines.filter(has).length,
      done: done.length,
      final: i ? undefined : lines.filter((l) => t[l.key]?.final).length,
      missing: lines.filter((l) => !done.includes(l)).map((l) => l.key),
      silent, long, stale,
      complete: done.length === lines.length && !silent.length,
    }];
  }));
}

const voicesFile = (dir) => path.join(dir, 'voiceover', 'voices.json');
const lineVoiceFile = (dir) => path.join(dir, 'voiceover', 'line-voice.json');

/**
 * Synthetic voice per dub language for this video: {voice, rate (%), pitch (Hz)}. With hosts (a kit
 * plan), each host also has a voice of their gender in that language, a different one per host:
 * {..., hosts: {Sara: {voice, rate, pitch}}}.
 */
export function voiceSettings(dir, dubs, hosts = [], list = []) {
  const saved = readJson(voicesFile(dir), {});
  return Object.fromEntries(dubs.map((l) => {
    const {hosts: savedHosts = {}, ...own} = saved[l] || {};
    const out = {voice: TTS_VOICES[l] || '', rate: 0, pitch: 0, ...own};
    if (hosts.length) out.hosts = hostVoices(l, hosts, savedHosts, list, out.voice);
    return [l, out];
  }));
}
/** A voice per host in a language: the saved one, else one of the host's gender not yet taken. */
export function hostVoices(lang, hosts, saved, list, langVoice) {
  const pre = lang.split('-')[0].toLowerCase();
  const local = list.filter((v) => v.locale.split('-')[0].toLowerCase() === pre);
  const pool = local.length ? local : list.filter((v) => v.multilingual);
  const gender = (v) => String(v.gender || '').toLowerCase();
  const taken = new Set(hosts.map((x) => saved[x.name]?.voice).filter(Boolean));
  const out = {};
  for (const x of hosts) {
    if (saved[x.name]?.voice) {
      out[x.name] = {rate: 0, pitch: 0, ...saved[x.name]};
      continue;
    }
    const fits = (v) => !taken.has(v.name) && (!x.gender || gender(v) === x.gender);
    // the language's own voice when it fits, then a matching local voice, then any free one
    const pick = pool.find((v) => v.name === langVoice && fits(v)) || pool.find((v) => /Multilingual/.test(v.name) === /Multilingual/.test(langVoice || '') && fits(v)) || pool.find(fits) || null;
    const voice = pick?.name || (taken.has(langVoice) ? '' : langVoice) || '';
    if (voice) taken.add(voice);
    out[x.name] = {voice, rate: 0, pitch: 0};
  }
  return out;
}
/** The language's voice, or with v.host one host's voice in that language. */
export function setVoice(dir, lang, v) {
  if (!LANG.test(lang)) throw fail('Unknown language');
  const all = readJson(voicesFile(dir), {});
  const host = String(v?.host || '').trim().slice(0, 40);
  if (host) {
    all[lang] = all[lang] || {};
    all[lang].hosts = {...(all[lang].hosts || {}), [host]: cleanVoice(v)};
  } else all[lang] = {...cleanVoice(v), ...(all[lang]?.hosts ? {hosts: all[lang].hosts} : {})};
  writeJson(voicesFile(dir), all);
  return all[lang];
}
/** One line's own speaker, speed or pitch in a language (another person speaking, a faster line); null = the language's. */
export function setLineVoice(dir, key, lang, v) {
  checkArgs(lang, key);
  const all = readJson(lineVoiceFile(dir), {});
  all[key] = all[key] || {};
  if (v) all[key][lang] = cleanVoice(v, true);
  else delete all[key][lang];
  if (!Object.keys(all[key]).length) delete all[key];
  writeJson(lineVoiceFile(dir), all);
  return all;
}
function cleanVoice(v, partial = false) {
  const out = {};
  if (v?.voice) {
    if (!VOICE.test(v.voice)) throw fail('Unknown voice');
    out.voice = v.voice;
  } else if (!partial) throw fail('Pick a voice');
  for (const [k, lo, hi] of [['rate', -50, 100], ['pitch', -20, 20]]) if (v?.[k] !== undefined && v[k] !== null && v[k] !== '') out[k] = Math.max(lo, Math.min(hi, Math.round(Number(v[k]) || 0)));
  return out;
}
const VOICE = /^[A-Za-z]{2,3}-[A-Za-z]{2,4}-\w+Neural$/;

/** The edge-tts voices the studio knows (<renderer>/tools/voice/edge-voices.json, made by "tts.py list"). */
export function voiceList(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(rendererDir(root), 'tools', 'voice', 'edge-voices.json'), 'utf8')).map((v) => ({name: v.name, locale: v.locale, gender: v.gender, label: v.label, multilingual: v.multilingual}));
  } catch {
    return Object.values(TTS_VOICES).map((name) => ({name, locale: name.split('-').slice(0, 2).join('-'), gender: '', label: name.replace(/Neural$/, ''), multilingual: /Multilingual/.test(name)}));
  }
}

/** The creator marks her take final (dubs are fitted to it), or a dub take done (checked by ear). */
export function setFlag(dir, lang, key, flag, value) {
  checkArgs(lang, key);
  if (!['final', 'done'].includes(flag)) throw fail('Unknown flag');
  const takes = readJson(takesFile(dir), {});
  const t = takes[lang]?.[key];
  if (!t) throw fail('Record or make this line first', 409);
  t[flag] = Boolean(value);
  writeJson(takesFile(dir), takes);
  return t;
}

export function status(root, playlist, dir, plan, approved) {
  const v = state(dir);
  const face = Boolean(v.face);
  const lines = plan ? scriptLines(plan, face, Number(v.faceSeconds) || 0) : [];
  const langs = languages(root, playlist);
  const takes = readJson(takesFile(dir), {});
  const texts = Object.fromEntries(langs.slice(1).map((l) => [l, readJson(textFile(dir, l), {})]));
  const dubs = langs.slice(1);
  const hosts = plan?.kit && Array.isArray(plan.hosts) ? plan.hosts : [];
  const list = dubs.length ? voiceList(root) : [];
  return {
    ready: Boolean(approved),
    face,
    langs,
    lines,
    takes,
    texts,
    check: check(lines, langs, takes, texts),
    hasKey: Boolean(apiKey()),
    hosts,
    voices: voiceSettings(dir, dubs, hosts, list),
    lineVoice: readJson(lineVoiceFile(dir), {}),
    voiceList: list,
  };
}

const checkArgs = (lang, key) => {
  if (!LANG.test(lang)) throw fail('Unknown language');
  if (!KEY.test(key)) throw fail('Unknown line');
};

/** Save one take: kind "audio" (the voice WAV) or "camera" (camera + mic WebM for a face line). */
export function saveTake(dir, code, lang, key, kind, buf, meta = {}, isDub = false) {
  checkArgs(lang, key);
  if (!Buffer.isBuffer(buf) || buf.length < 100) throw fail('The take is empty');
  const takes = readJson(takesFile(dir), {});
  const t = {...(takes[lang]?.[key] || {})};
  if (kind === 'camera') {
    if (buf.subarray(0, 4).toString('hex') !== '1a45dfa3') throw fail('That is not a WebM video');
    const rel = `camera/${code}-${key}.webm`;
    fs.mkdirSync(path.join(dir, 'camera'), {recursive: true});
    fs.writeFileSync(path.join(dir, rel), buf);
    t.camera = rel;
  } else {
    if (buf.subarray(0, 4).toString() !== 'RIFF') throw fail('That is not a WAV file');
    const rel = `voiceover/${lang}/${code}-${key}.wav`;
    fs.mkdirSync(path.join(dir, 'voiceover', lang), {recursive: true});
    fs.writeFileSync(path.join(dir, rel), buf);
    Object.assign(t, {
      file: rel,
      dur: Number(meta.dur) || 0,
      peak: Number(meta.peak) || 0,
      trimIn: Number(meta.trimIn) || 0, // seconds cut from the start (the camera clip starts there too)
      source: meta.source === 'tts' ? 'tts' : 'mic',
    });
    // a new take is never final or done on its own: the creator confirms it (a dub she recorded herself counts as checked)
    t.final = false;
    t.done = isDub && meta.source !== 'tts';
    for (const k of ['voice', 'text']) if (meta[k]) t[k] = String(meta[k]).slice(0, 2000);
    for (const k of ['rate', 'pitch']) if (meta[k] !== undefined) t[k] = Number(meta[k]) || 0;
    if (meta.fitted) t.fitted = meta.fitted === 'true';
  }
  t.updated = new Date().toISOString();
  takes[lang] = {...(takes[lang] || {}), [key]: t};
  writeJson(takesFile(dir), takes);
  return t;
}

export function deleteTake(dir, lang, key) {
  checkArgs(lang, key);
  const takes = readJson(takesFile(dir), {});
  const t = takes[lang]?.[key];
  if (!t) return {ok: true};
  for (const rel of [t.file, t.camera]) if (rel) fs.rmSync(path.join(dir, rel), {force: true});
  delete takes[lang][key];
  writeJson(takesFile(dir), takes);
  return {ok: true};
}

export function setText(dir, lang, key, text) {
  checkArgs(lang, key);
  const all = readJson(textFile(dir, lang), {});
  all[key] = String(text || '').trim();
  writeJson(textFile(dir, lang), all);
  return all;
}

/** A dub language's script, translated with Claude (needs the API key). Lines that already have text are kept. */
export async function translate(root, playlist, dir, plan, lang) {
  if (!LANG.test(lang)) throw fail('Unknown language');
  if (!apiKey()) throw fail('Add an Anthropic API key in Settings, or ask Claude in the video thread to translate the script.', 409);
  const lines = scriptLines(plan, false);
  const have = readJson(textFile(dir, lang), {});
  const todo = lines.filter((l) => !have[l.key]);
  if (!todo.length) return have;
  const voice = languages(root, playlist)[0];
  const client = new Anthropic({apiKey: apiKey(), timeout: 10 * 60 * 1000});
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    messages: [{
      role: 'user',
      content: [
        `Translate this video script from ${voice} into ${lang} for a dubbed voice-over.`,
        'Keep the meaning, names, numbers and dates exactly. Keep each line about as long to say as the original, so it fits the same moment of the video. Jargon in "double quotes" stays as it is.',
        'Answer with only a JSON object mapping each key to its translated line.',
        '',
        JSON.stringify(Object.fromEntries(todo.map((l) => [l.key, l.vo])), null, 1),
      ].join('\n'),
    }],
  });
  const text = msg.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
  let out;
  try {
    out = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    throw fail('The translation came back in a form that could not be read; try again.', 502);
  }
  for (const l of todo) if (typeof out[l.key] === 'string' && out[l.key].trim()) have[l.key] = out[l.key].trim();
  writeJson(textFile(dir, lang), have);
  return have;
}

/** One line in a synthetic voice (MP3 bytes). The page turns it into a take like a recorded one. */
export function speak(root, lang, text, voice, rate = 0, pitch = 0) {
  if (!LANG.test(lang)) throw fail('Unknown language');
  voice = voice || TTS_VOICES[lang];
  if (!voice || !VOICE.test(voice)) throw fail(`No synthetic voice for ${lang}`);
  rate = Math.max(-50, Math.min(100, Math.round(Number(rate) || 0)));
  pitch = Math.max(-20, Math.min(20, Math.round(Number(pitch) || 0)));
  if (!String(text || '').trim()) throw fail('This line has no text in that language yet');
  const script = [path.join(root, 'studio', 'tools', 'voice', 'tts.py'), path.join(APP_DIR, 'engine', 'tools', 'voice', 'tts.py')].find((f) => fs.existsSync(f));
  if (!script) throw fail('The synthetic voice tool (engine/tools/voice/tts.py) is not installed', 409);
  const out = path.join(os.tmpdir(), `cs-tts-${process.pid}-${Date.now()}.mp3`);
  return new Promise((resolve, reject) => {
    const p = spawn(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [script, 'say', voice, String(rate), String(pitch), out]);
    const err = [];
    p.stderr.on('data', (c) => err.push(c));
    p.on('error', () => reject(fail('Python is not available for the synthetic voice', 409)));
    p.on('close', (c) => {
      if (c !== 0 || !fs.existsSync(out)) return reject(fail(`Synthetic voice failed: ${Buffer.concat(err).toString().trim().split('\n').pop() || 'no output'}`, 502));
      const buf = fs.readFileSync(out);
      fs.rmSync(out, {force: true});
      resolve(buf);
    });
    p.stdin.end(Buffer.from(String(text).replace(/["“”]/g, ''), 'utf8'));
  });
}
