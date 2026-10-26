// Story -> first cut (Travel Video Editing kit). Claude reads the creator's story and the footage log (what is
// said in each clip, a still at each scene change, length, sound, dark parts, when and where it was filmed)
// and writes the edit: scenes of beats, each a clip with its seconds, a photo, a graphic with its facts, a piece
// to camera to record, or a space for a missing clip; voice-over lines per speaker; the music mood.
// "API first" as for plans: with an Anthropic API key it runs here; without one, edit/brief.md and
// edit/cut-schema.json are written for Claude in a project thread, which writes edit/cut.json back.
//   concept/concept.md     the story (the video page edits it)
//   edit/cut.json          Claude's cut as it came (also the hand-off answer)
//   edit/edit.json         the timeline made from it (the previous edit is kept as a version first)
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import {read, readJson, write, writeJson, today} from './workspace.mjs';
import {apiKey} from './settings.mjs';
import {loadProfile} from './brand.mjs';
import {GRAPHICS, GRAPHICS_EXTRA, graphicSchema} from './plan-schema.mjs';
import {languageName} from './kits.mjs';
import {MODEL} from './planner.mjs';
import * as AS from './assets.mjs';
import * as ED from './edit.mjs';
import * as SP from './speech.mjs';

const fail = (msg, status = 400) => Object.assign(new Error(msg), {status});
const jobs = new Map(); // video dir -> {status, log, error, usage}
const cutFile = (dir) => path.join(AS.editDir(dir), 'cut.json');
const briefFile = (dir) => path.join(AS.editDir(dir), 'brief.md');
const storyFile = (dir) => path.join(dir, 'concept', 'concept.md');
const WORDS_PER_SEC = 2.6;
const MAX_IMAGES = 90;

// graphics that suit an edited trip video (the travel ones, and the general ones that show a fact)
const EDIT_TYPES = ['title', 'clippings', 'quote', 'timeline', 'map', 'bars', 'number', 'stamps', 'cards', 'flow', 'table', 'checklist', 'route', 'roadtrip', 'weather', 'tiers', 'phrases', 'dosdonts', 'rating'];
export const EDIT_GRAPHICS = [...GRAPHICS, ...GRAPHICS_EXTRA].filter(([k]) => EDIT_TYPES.includes(k));

// ---------- the story ----------
export function story(dir) {
  return read(storyFile(dir), '').replace(/^# .*\n+/, '').trim();
}
export function setStory(dir, video, text) {
  write(storyFile(dir), `# ${video.code} · ${video.title} · story\n\n${String(text || '').trim()}\n`);
  return {story: story(dir)};
}

// ---------- what Claude is told ----------
const str = (description) => ({type: 'string', description});
const num = (description) => ({type: 'number', description});
const arr = (items, description) => ({type: 'array', items, description});
const obj = (properties, description) => ({type: 'object', description, properties, required: Object.keys(properties), additionalProperties: false});

export function cutSchema(speakers) {
  const beat = obj({
    kind: {type: 'string', enum: ['clip', 'photo', 'graphic', 'camera', 'gap'], description: 'clip = part of a video file; photo = a photo; graphic = a generated on-brand graphic; camera = a piece to camera the speaker records later; gap = a space for a clip the creator still has to film or find'},
    asset: str('The footage id for clip and photo (from the footage log), else ""'),
    in: num('clip: start second in the original (0 otherwise)'),
    out: num('clip: end second in the original (0 otherwise)'),
    dur: num('photo, graphic, camera, gap: seconds on screen (0 for clip)'),
    sound: {type: 'string', enum: ['own', 'under', 'mute'], description: 'clip: own = its own sound at full level (talks with locals, a reaction, ambience that tells the story), under = its sound low under the voice-over, mute = silent. Others: mute'},
    vo: obj({speaker: speakers.length ? {type: 'string', enum: ['', ...speakers], description: 'Who says it ("" when no voice-over)'} : str('Who says it, or ""'), text: str('The voice-over line in the voice language, spoken naturally, matching the speaker\'s gender in the grammar; "" for none. For camera beats: what the speaker says to the camera.')}, 'Voice-over that starts with this beat'),
    graphic: {...graphicSchema(EDIT_GRAPHICS), description: 'graphic beats: the graphic and its facts (only facts from the story, the footage or well-known sources; never invented). Other beats: type "title" with empty fields'},
    note: str('Why this beat, or what to film for a gap (one line)'),
  }, 'One moment of the video');
  return obj({
    title: str('Working title of the video'),
    summary: str('Two or three sentences: the story of the cut and its hook'),
    scenes: arr(obj({title: str('Scene name, e.g. "Hook", "Gilgit to Karimabad", "Baltit Fort"'), beats: arr(beat, 'Beats in order')}, 'A scene'), 'The video, start to end'),
    music: obj({mood: str('Music mood, e.g. "warm acoustic, slow build"'), where: str('Where music plays and where it drops out')}, 'Music'),
    cuts: arr(str('A part left out on purpose and why (e.g. "drive.mp4 0:40-1:10: dark, shaky")'), 'Odd parts cut out'),
    questions: arr(str('Question for the creator'), 'What the creator should decide or add'),
  }, 'The first cut');
}

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const ranges = (list) => (list || []).map(([a, b]) => `${a.toFixed(1)}-${b.toFixed(1)}`).join(', ');

/** The footage log as text: one block per file. */
export function footageLog(dir) {
  const assets = AS.status(dir).assets.filter((a) => a.ready);
  return assets.map((a) => {
    const t = SP.transcriptOf(dir, a.id);
    const head = `### ${a.id} · ${a.file} · ${a.kind}${a.dur ? ` · ${a.dur.toFixed(1)} s` : ''}${a.w ? ` · ${a.w}×${a.h}${a.h > a.w ? ' (vertical)' : ''}` : ''}${a.created ? ` · filmed ${a.created}` : ''}${a.place ? ` · at ${a.place.lat}, ${a.place.lon}` : ''}`;
    const lines = [head];
    if (a.kind === 'video') lines.push(`Scene changes at: ${(a.stills || []).map((s) => s.t.toFixed(1)).join(', ')} s`);
    if (a.kind !== 'image') lines.push(a.audio === false ? 'No sound.' : `Sound at: ${ranges(a.sound) || 'none'}`);
    if (a.dark?.length) lines.push(`Dark: ${ranges(a.dark)}`);
    if (t?.segments?.length) lines.push(`Said (${t.lang || 'language detected per clip'}):`, ...t.segments.slice(0, 400).map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`));
    else if (a.kind !== 'image' && a.sound?.length) lines.push('Said: (no transcript yet)');
    return lines.join('\n');
  }).join('\n\n');
}

/** Stills to show Claude: a share of each clip's scene stills and every photo, at most MAX_IMAGES. */
export function stillsFor(dir) {
  const assets = AS.status(dir).assets.filter((a) => a.ready && a.stills?.length);
  const per = Math.max(2, Math.floor(MAX_IMAGES / Math.max(1, assets.length)));
  const out = [];
  for (const a of assets) {
    const st = a.stills.length > per ? a.stills.filter((_, i) => i % Math.ceil(a.stills.length / per) === 0) : a.stills;
    for (const s of st) out.push({asset: a.id, t: s.t, file: s.file, kind: a.kind});
  }
  return out.slice(0, MAX_IMAGES);
}

export function systemPrompt(profile) {
  return [
    `You are the editor of ${profile.name || 'this creator'}'s travel videos. You cut the creator's own footage into a finished story, the way a skilled travel vlog editor would, and keep it in their voice and brand.`,
    '',
    'How to cut:',
    '- Hook first (15-30 s): the strongest moments of the trip and one line that makes the viewer stay. No "welcome to my channel" at the start.',
    '- Then the story in the order it makes most sense (usually the order of the trip), in scenes with a clear name each.',
    '- Use the creator\'s story as the backbone: every moment, place and person they mention is used if the footage has it. Where they want something the footage lacks, put a gap beat with a note saying exactly what to film or find.',
    '- Cut out odd parts: dark or black stretches, long silences, false starts, "umm", repeated takes (keep the best one), the camera pointing at the ground. List the bigger ones in cuts.',
    '- Real moments keep their own sound (sound "own"): conversations with locals, a reaction, a seller calling out, the call to prayer, a waterfall. Do not talk over them.',
    '- B-roll goes under voice-over (sound "under") in short cuts: 2-6 s each, varied (wide, close, detail, motion). Talking parts stay as long as the thought.',
    '- Voice-over lines are short and spoken, in the voice language, by the speaker who lived that moment; alternate speakers when there are several. Match each speaker\'s gender in the grammar (in Urdu: "main gayi thi" for a woman, "main gaya tha" for a man).',
    '- Pieces to camera (kind "camera") where a speaker should tell something directly: the opening promise after the hook, a turning point, the verdict, the closing. Write what they say.',
    '- Graphics where a fact helps: a road trip map for the drive with stops and distances, a route, prices, a timeline, a phrase, a do and don\'t, a rating at the end, a reference to a news story or a source (clippings, quote). Only facts from the story, the footage, or well-known sources; never invent numbers.',
    '- Photos 3-5 s each. Vertical phone clips are fine (they get a blurred fill).',
    '- clip in/out are seconds of the original file; stay inside its length, and start and end on a natural point (the start or end of a sentence in "Said", a scene change).',
    '- The video is as long as the story needs; most trips work at 8-15 minutes. Do not pad.',
    '- End with a short closing: what the trip meant, a question for the comments, the next video.',
  ].join('\n');
}

export function briefText(root, playlist, video, dir) {
  const profile = loadProfile(root);
  const speakers = playlist.hosts || [];
  const voice = playlist.production?.voiceLanguage || profile.languages?.voice || 'ur-Latn';
  return [
    `# First cut: ${video.code} · ${video.title}`,
    '',
    `Today: ${today()}. Playlist: ${playlist.name}. Voice language: ${languageName(voice)} (${voice}).`,
    `Speakers: ${speakers.map((h) => `${h.name} (${h.gender || 'gender not set'})`).join(', ') || 'one, not named'}.`,
    (playlist.instructions || []).length ? `\n## Standing instructions\n${playlist.instructions.map((s) => `- ${s}`).join('\n')}` : '',
    '',
    '## The creator\'s story',
    story(dir) || '(no story given: find it in the footage)',
    '',
    '## Footage log',
    'Each file: its id, length, sound, scene changes and what is said with times. Stills of the scenes are attached (or in edit/stills/<id>/).',
    '',
    footageLog(dir),
  ].join('\n');
}

// ---------- turning the cut into the timeline ----------
const uid = () => Math.random().toString(36).slice(2, 9);
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
export const voDur = (text) => Math.max(1.2, Math.round((words(text) / WORDS_PER_SEC + 0.3) * 10) / 10);

export function toEdit(cut, assets) {
  const byId = new Map(assets.filter((a) => a.ready).map((a) => [a.id, a]));
  const e = {...ED.empty(), scenes: []};
  let t = 0;
  for (const sc of cut.scenes || []) {
    const sid = `s${uid()}`;
    e.scenes.push({id: sid, title: sc.title || 'Scene'});
    for (const b of sc.beats || []) {
      const a = b.asset ? byId.get(b.asset) : null;
      const vo = b.vo?.text?.trim() ? {speaker: b.vo.speaker || '', text: b.vo.text.trim()} : null;
      let c = null;
      if (b.kind === 'clip' && a && (a.kind === 'video' || a.kind === 'image')) {
        if (a.kind === 'image') c = {kind: 'image', asset: a.id, dur: b.dur || 4, move: 'slow'};
        else {
          const inn = Math.max(0, Math.min(a.dur - 0.5, Number(b.in) || 0));
          let out = Math.max(inn + 0.5, Math.min(a.dur, Number(b.out) || a.dur));
          if (vo && b.sound !== 'own') out = Math.min(a.dur, Math.max(out, inn + voDur(vo.text))); // room for the line when the clip allows
          c = {kind: 'video', asset: a.id, in: inn, out, speed: 1, volume: b.sound === 'under' ? 0.25 : 1, mute: b.sound === 'mute', fadeIn: 0, fadeOut: 0};
        }
      } else if ((b.kind === 'photo' || b.kind === 'clip') && a?.kind === 'image') c = {kind: 'image', asset: a.id, dur: b.dur || 4, move: 'slow'};
      else if (b.kind === 'graphic') c = {kind: 'graphic', dur: b.dur || Math.max(4, vo ? voDur(vo.text) : 5), graphic: b.graphic, prompt: b.note || b.graphic?.title || ''};
      else if (b.kind === 'camera') c = {kind: 'gap', camera: true, dur: Math.max(b.dur || 0, vo ? voDur(vo.text) : 4), speaker: vo?.speaker || '', text: vo?.text || '', note: `Piece to camera${vo?.speaker ? `: ${vo.speaker}` : ''}`};
      else c = {kind: 'gap', dur: b.dur || 3, note: b.note || 'A clip is needed here'};
      c.id = uid();
      c.scene = sid;
      if (b.note && !c.note) c.note = b.note;
      if (c.kind === 'video' || c.kind === 'image') c.fit = a.w && a.h && a.h > a.w ? 'blur' : 'cover';
      e.main.push(c);
      const d = ED.clipDur(c);
      // the voice-over line waits on the Voice track until it is recorded (a camera piece is recorded on camera)
      if (vo && b.kind !== 'camera') e.voice.push({id: uid(), kind: 'line', at: Math.round(t * 1000) / 1000, dur: voDur(vo.text), speaker: vo.speaker, text: vo.text});
      t += d;
    }
  }
  return e;
}

// ---------- running ----------
export function status(dir) {
  const j = jobs.get(dir);
  const cut = readJson(cutFile(dir), null);
  return {
    story: story(dir),
    hasKey: Boolean(apiKey()),
    job: j ? {status: j.status, log: j.log.slice(-6), error: j.error || null} : null,
    cut: cut ? {title: cut.title, summary: cut.summary, questions: cut.questions || [], cuts: cut.cuts || [], music: cut.music || null, made: cut.made || null} : null,
    handoff: fs.existsSync(briefFile(dir)) && !apiKey() ? {brief: 'edit/brief.md', expects: 'edit/cut.json'} : null,
  };
}

/** Apply a cut: keep the current edit as a version, then the new timeline. */
export function applyCut(dir, cut) {
  const assets = AS.status(dir).assets;
  const e = toEdit(cut, assets);
  if (!e.main.length) throw fail('The cut has no beats');
  if (ED.load(dir).main.length) ED.saveVersion(dir, 'Before Claude\'s cut');
  writeJson(cutFile(dir), {...cut, made: cut.made || new Date().toISOString()});
  return ED.save(dir, e);
}

export function startCut(root, playlist, video, dir) {
  if (jobs.get(dir)?.status === 'running') throw fail('Claude is already cutting this video', 409);
  const ready = AS.status(dir).assets.filter((a) => a.ready);
  if (!ready.length) throw fail('Add the footage first', 409);
  const speakers = (playlist.hosts || []).map((h) => h.name);
  if (!apiKey()) {
    write(briefFile(dir), [
      briefText(root, playlist, video, dir),
      '',
      '## How to cut it',
      systemPrompt(loadProfile(root)),
      '',
      '## How to deliver',
      `Look at the stills in \`edit/stills/<id>/\` (and photos in \`edit/proxy/\`) next to the log, then write the cut as JSON to \`${path.relative(root, cutFile(dir)).split(path.sep).join('/')}\`, matching \`edit/cut-schema.json\`. Content Studio turns it into the timeline when the creator presses "Check for the cut".`,
      '',
      'Work on this cut in its own project thread, not in the Content Studio development thread. Ask the creator any questions there, and say there when the file is written.',
    ].join('\n'));
    writeJson(path.join(AS.editDir(dir), 'cut-schema.json'), cutSchema(speakers));
    return status(dir);
  }
  const job = {status: 'running', log: ['Reading the story and the footage…'], usage: {}};
  jobs.set(dir, job);
  runApi(root, playlist, video, dir, job, speakers)
    .then((cut) => {
      job.log.push('Building the timeline…');
      applyCut(dir, cut);
      job.status = 'done';
      job.log.push('The first cut is on the timeline.');
    })
    .catch((e) => {
      job.status = 'error';
      job.error = e instanceof Anthropic.AuthenticationError ? 'The API key was not accepted. Check it in Settings.' : e.message;
    })
    .finally(() => setTimeout(() => jobs.get(dir) === job && jobs.delete(dir), 10 * 60 * 1000).unref());
  return status(dir);
}

/** Hand-off: take the cut Claude wrote in the project thread. */
export function importCut(dir) {
  const cut = readJson(cutFile(dir), null);
  if (!cut) throw fail('No cut yet: edit/cut.json is not there', 404);
  return applyCut(dir, cut);
}

async function runApi(root, playlist, video, dir, job, speakers) {
  const client = new Anthropic({apiKey: apiKey(), timeout: 30 * 60 * 1000});
  const content = [{type: 'text', text: briefText(root, playlist, video, dir)}];
  for (const s of stillsFor(dir)) {
    content.push({type: 'text', text: `${s.kind === 'image' ? 'Photo' : 'Still'}: ${s.asset}${s.kind === 'image' ? '' : ` at ${s.t.toFixed(1)} s`}`});
    content.push({type: 'image', source: {type: 'base64', media_type: 'image/jpeg', data: fs.readFileSync(path.join(dir, s.file)).toString('base64')}});
  }
  const submit = {name: 'submit_cut', description: 'Submit the first cut. Call once, with every field filled.', input_schema: cutSchema(speakers), strict: true, eager_input_streaming: true};
  const messages = [{role: 'user', content}];
  let strict = true;
  for (let turn = 0; turn < 4; turn++) {
    let msg;
    try {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        thinking: {type: 'adaptive'},
        output_config: {effort: 'high'},
        system: [{type: 'text', text: systemPrompt(loadProfile(root)), cache_control: {type: 'ephemeral'}}],
        tools: [{type: 'web_search_20260209', name: 'web_search', max_uses: 8}, strict ? submit : {...submit, strict: undefined}],
        messages,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      stream.on('streamEvent', (ev) => {
        if (ev.type === 'content_block_start' && ev.content_block.type === 'tool_use') job.log.push('Writing the cut…');
        if (ev.type === 'content_block_start' && ev.content_block.type === 'server_tool_use') job.log.push('Checking a fact…');
      });
      msg = await stream.finalMessage();
    } catch (e) {
      if (strict && e instanceof Anthropic.BadRequestError && /schema|strict/i.test(e.message)) {
        strict = false;
        turn--;
        continue;
      }
      throw e;
    }
    if (msg.stop_reason === 'refusal') throw new Error('Claude declined this request. Use the hand-off brief instead.');
    const call = msg.content.find((b) => b.type === 'tool_use' && b.name === 'submit_cut');
    if (call) return typeof call.input === 'string' ? JSON.parse(call.input) : call.input;
    messages.push({role: 'assistant', content: msg.content});
    if (msg.stop_reason === 'pause_turn') continue;
    messages.push({role: 'user', content: 'Now call submit_cut with the complete cut.'});
  }
  throw new Error('No cut after 4 steps.');
}
