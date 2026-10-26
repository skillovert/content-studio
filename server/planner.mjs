// Phase 2: concept -> plan. "API first": with an Anthropic API key, Claude researches and writes the
// plan here (web search + fetch, the concept PDF attached). Without a key, the app writes a hand-off
// brief (plan/brief.md + plan/plan-schema.json) for Claude in the project, and imports the plan file
// Claude writes back. Either way the plan is checked, timed and turned into the plan PDF.
//
// Files in the video folder:
//   concept/concept.md, concept/*.pdf     what the owner gave
//   plan/plan-vN.json, plan/<CODE>-plan-vN.pdf   every version, never overwritten
//   plan/brief.md, plan/plan-schema.json  the hand-off brief (no key)
//   video.json  .plan = {current, versions[], approved, job}
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import {APP_DIR, read, readJson, write, writeJson, today} from './workspace.mjs';
import {applicableStandards, hashtagsFor} from './taxonomy.mjs';
import {planSchema, planProblems, withTiming, NEWS_SCENES, clock, FACE_AMOUNT} from './plan-schema.mjs';
import {apiKey} from './settings.mjs';
import {kitOf, cleanHosts, travelSystem, travelBrief} from './kits.mjs';
import {loadProfile} from './brand.mjs';

export const MODEL = 'claude-opus-5-5';
const jobs = new Map(); // video dir -> live job (status, log)

const planDir = (dir) => path.join(dir, 'plan');
const state = (dir) => readJson(path.join(dir, 'video.json'), {});
const setState = (dir, fn) => {
  const s = state(dir);
  writeJson(path.join(dir, 'video.json'), fn(s) || s);
};

// ---------- context ----------
function conceptOf(dir) {
  const text = read(path.join(dir, 'concept', 'concept.md'), '');
  const pdfs = fs.existsSync(path.join(dir, 'concept')) ? fs.readdirSync(path.join(dir, 'concept')).filter((f) => /\.pdf$/i.test(f)) : [];
  return {text, pdfs: pdfs.map((f) => path.join(dir, 'concept', f))};
}

/** The hosts of a kit playlist (1 to 3), else the brand's presenter. */
export function hostsOf(root, playlist) {
  const hosts = cleanHosts(playlist?.hosts, kitOf(playlist).maxHosts);
  if (hosts.length) return hosts;
  const p = loadProfile(root);
  return cleanHosts([{name: p.presenter?.name || p.name || 'Host', gender: p.presenter?.gender}]);
}
/** What the plan is checked and shaped with: the kit, and its hosts when the kit has them. */
const kitOpts = (root, playlist) => {
  const kit = kitOf(playlist);
  return {kit, hosts: kit.hosts ? hostsOf(root, playlist) : []};
};
/** The plan as the checks see it: a kit plan carries its kit and hosts. */
const tagged = (plan, {kit, hosts}) => (kit.id === 'news' ? plan : {...plan, kit: kit.id, hosts});

// Stable part (cached): the channel's rules, read live from the folder so new decisions apply at once.
function systemPrompt(root, kit) {
  const guide = read(path.join(root, 'BRAND-GUIDE.md'), '');
  if (kit && kit.id !== 'news') return travelSystem(loadProfile(root), guide);
  const pattern = read(path.join(root, 'studio', 'PATTERN.md'), '');
  const p = loadProfile(root);
  const who = p.presenter?.name || p.name || 'the creator';
  const about = [p.handle, p.site].filter(Boolean).join(', ');
  return [
    `You plan videos for the ${p.name || 'creator\'s'} channel${about ? ` (${about})` : ''}${p.role ? `, made by ${who}, ${p.role}` : ''}. The channel's voice, language and subjects are in its brand guide below.`,
    `Your plan is checked by the owner before anything is built, then drives an automatic graphics-driven video (Remotion), the voice-over ${who} records line by line, the subtitles and the YouTube text.`,
    '',
    'Work like a careful news producer:',
    '- Research the latest facts with web search, then open (web fetch) every page you cite. Primary documents first (advisories, gazettes, filings, release notes, datasets), then at least two independent outlets per key claim. Date every fact ("as of").',
    '- Quotes are verbatim, with speaker, outlet and date. Never invent a quote, number, URL or date. If something cannot be confirmed, leave it out of the script and list it under openQuestions.',
    '- Follow the brand guide below exactly: taxonomy (Part A1), standards (A2), the format\'s flow and story shape (Part C), tone and on-screen rules (B6). Where the guide and anything else differ, the guide wins.',
    `- Voice-over: in the channel's voice language (${p.languages?.voice || 'see the brand guide'}) as the brand guide describes it, jargon in "double quotes", helpful and not salesy. Never say the News label in the voice-over. On-screen text is jargon and keywords only.`,
    '- The video points to the sources in the description on screen, and says the illustrations are based on those sources.',
    '- For security stories: concept level only, no working exploit details; example IPs and hosts from documentation ranges (203.0.113.x).',
    '- Use the owner\'s concept and anything attached or linked in it; record how in conceptItems. When the concept is a full or partial plan (beats, lines, visuals, order), it is the backbone: keep what it gives, correct only what sources show is wrong (say so in openQuestions), and make it complete and richer around it.',
    '- Give every voice-over line a graphic: what is on screen while it plays (types and fields are in the schema; the look is N01\'s, see brand/reference). Pick the type that shows the fact best: a timeline for dates, a map for countries, numbers or bars for data, a quote card for verbatim quotes, a terminal or table for fix steps. Use "continue" to reveal the next item of the same graphic on the next line. Graphics show only facts, numbers and quotes from your sources.',
    '- Visuals are enriched and factual by default, without being asked (owner decision, 24 Oct 2026): show every fact you can as a graph or numbers, a map of the countries or regions, a timeline, a flow or diagram, a reference (news clipping, quote card, document, advisory) or a footage-style insert, built from the cited sources. Avoid plain text cards when a fact can be shown; use at least six kinds of factual graphic across the video.',
    '- The thumbnail and the video show the News label then the lead Cause top-left, and the playlist name with a cyan dot top-right; you do not need to add them.',
    '- Thumbnail text is short so it reads at phone size: the jargon title is 1 to 3 words (at most 16 characters) and the "threat + fix" line is two short lines (at most 24 characters each). Give the same line in every dub language of the playlist under thumbnail.lines; each language gets its own thumbnail.',
    '',
    'When the plan is complete, call the submit_plan tool once with the whole plan. Do not write the plan as text.',
    '',
    '=== BRAND-GUIDE.md ===',
    guide,
    '',
    '=== studio/PATTERN.md (News build details) ===',
    pattern,
  ].join('\n');
}

/** What the plan is told about the creator on camera: how much, how long each time, which styles. */
export function faceBrief(v) {
  if (!v.face) return 'On camera: no (graphics only). Every line has layout voice and faceFor 0.';
  const amount = FACE_AMOUNT[v.faceAmount] ? v.faceAmount : 'balanced';
  const max = Number(v.faceSeconds) || 0;
  return [
    `On camera: yes, ${amount} (her face in about ${Math.round(FACE_AMOUNT[amount] * 100)}% of the lines). She records herself, and the graphics are planned around her.`,
    max ? `Each face moment lasts at most ${max} seconds (faceFor <= ${max}): she looks into the camera for that long, then the graphic takes the whole screen and she reads the rest of the line off camera. Put the key words of the line first so they land on camera.` : 'A face moment may last the whole line (faceFor 0 = whole line) or a few seconds.',
    'Vary the placement through the video instead of repeating one: face-full for the hook, her intro and the closing call; face-left, face-right or face-split when a graphic explains what she says; face-circle or face-corner for a quick remark over a strong graphic; face-frame (old TV) or face-phone for a reaction or a quote she reads. Evidence lines (maps, numbers, timelines, clippings) stay voice so the graphic has the whole screen. Do not use the same placement on two lines in a row.',
  ].join(' ');
}

function briefText(root, tax, playlist, video, dir, {feedback, previous} = {}) {
  const card = {format: [playlist.format]};
  for (const [k, d] of Object.entries(playlist.defaults || {})) card[k] = d.values || [];
  const standards = applicableStandards(tax, card);
  const defaults = Object.entries(playlist.defaults || {})
    .map(([k, d]) => `- ${tax.fields[k]?.label || k}: ${(d.values || []).join(', ') || '(per piece)'}${d.note ? ` (${d.note})` : ''}`)
    .join('\n');
  const concept = conceptOf(dir);
  const {kit, hosts} = kitOpts(root, playlist);
  const v = readJson(path.join(dir, 'video.json'), {});
  const shape = kit.id === 'news'
    ? [`## Story shape for ${playlist.format}`, NEWS_SCENES.map(([k, d], i) => `${i + 1}. ${k}: ${d}`).join('\n'), 'Skip a step only when the story has nothing for it (e.g. no map when no regions were hit); say so in openQuestions.']
    : [travelBrief({hosts, voiceLanguage: playlist.production?.voiceLanguage, length: v.length || kit.defaultLength}), 'Skip a chapter only when the destination has nothing for it; say so in openQuestions.'];
  const lines = [
    `# Plan request: ${video.code} · ${video.title}`,
    '',
    `Today: ${today()}. Playlist: ${playlist.name} (format ${playlist.format}, code prefix ${playlist.codePrefix}).`,
    playlist.purpose ? `Playlist purpose: ${playlist.purpose}` : '',
    kit.id === 'news' ? faceBrief(v) : `Kit: ${kit.name}. Destination or topic: ${video.title}.`,
    `Dub languages (one thumbnail line each under thumbnail.lines): ${(playlist.production?.dubs || []).join(', ') || 'none'}.`,
    '',
    '## Playlist taxonomy defaults',
    defaults || '(none)',
    '',
    '## Standing instructions for every video in this playlist',
    (playlist.instructions || []).map((s) => `- ${s}`).join('\n') || '(none)',
    '',
    '## Standards that apply from the playlist defaults (add any more the card triggers)',
    standards.map((s) => `- ${s.name}: ${s.rule}`).join('\n'),
    '',
    ...shape,
    '',
    '## Owner\'s concept',
    concept.text.trim() || '(see the attached PDF)',
    concept.pdfs.length ? `\nAttached PDF${concept.pdfs.length > 1 ? 's' : ''}: ${concept.pdfs.map((p) => path.basename(p)).join(', ')} (recommended reading: it is the owner's own concept).` : '',
  ];
  if (previous) {
    lines.push('', `## Revise plan v${previous.version}`, 'The owner asked for these changes. Keep everything they did not mention; re-check facts that changed.', '', feedback || '(no notes)', '', '```json', JSON.stringify(previous.plan, null, 1), '```');
  }
  return lines.filter((l) => l !== null).join('\n');
}

// ---------- API run ----------
async function runApi(root, tax, playlist, video, dir, job, opts) {
  const client = new Anthropic({apiKey: apiKey(), timeout: 30 * 60 * 1000});
  const concept = conceptOf(dir);
  const content = [];
  for (const p of concept.pdfs) {
    content.push({type: 'document', source: {type: 'base64', media_type: 'application/pdf', data: fs.readFileSync(p).toString('base64')}, title: path.basename(p)});
  }
  content.push({type: 'text', text: briefText(root, tax, playlist, video, dir, opts)});
  const messages = [{role: 'user', content}];
  const ko = kitOpts(root, playlist);
  const submit = {
    name: 'submit_plan',
    description: 'Submit the finished video plan. Call once, with every field filled.',
    input_schema: planSchema(tax, ko),
    strict: true,
    eager_input_streaming: true,
  };
  let useStrict = true;
  for (let turn = 0; turn < 8; turn++) {
    job.log.push(turn ? `Continuing (step ${turn + 1})…` : 'Reading the concept and the brand guide…');
    const request = {
      model: MODEL,
      max_tokens: 64000,
      thinking: {type: 'adaptive'},
      output_config: {effort: 'high'},
      system: [{type: 'text', text: systemPrompt(root, ko.kit), cache_control: {type: 'ephemeral'}}],
      tools: [
        {type: 'web_search_20260209', name: 'web_search', max_uses: 20},
        {type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 25},
        useStrict ? submit : {...submit, strict: undefined},
      ],
      messages,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    };
    let msg;
    try {
      const stream = client.beta.messages.stream(request);
      stream.on('streamEvent', (ev) => {
        if (ev.type === 'content_block_start') {
          const b = ev.content_block;
          if (b.type === 'server_tool_use') job.log.push(b.name === 'web_fetch' ? 'Opening a source…' : 'Searching the web…');
          if (b.type === 'tool_use' && b.name === 'submit_plan') job.log.push('Writing the plan…');
        }
      });
      msg = await stream.finalMessage();
    } catch (e) {
      // a schema the strict validator can't take: retry once without strict (we validate below anyway)
      if (useStrict && e instanceof Anthropic.BadRequestError && /schema|strict/i.test(e.message)) {
        useStrict = false;
        job.log.push('Retrying without strict schema…');
        turn--;
        continue;
      }
      throw e;
    }
    job.usage = addUsage(job.usage, msg.usage);
    if (msg.stop_reason === 'refusal') throw new Error(`Claude declined this request (${msg.stop_details?.category || 'policy'}). Use the hand-off brief instead.`);
    const call = msg.content.find((b) => b.type === 'tool_use' && b.name === 'submit_plan');
    if (call) {
      let plan = call.input;
      if (typeof plan === 'string') plan = JSON.parse(plan);
      plan = tagged(plan, ko);
      const problems = planProblems(plan);
      if (!problems.length) return plan;
      job.log.push(`Plan incomplete (${problems.slice(0, 3).join('; ')}), asking for a fix…`);
      messages.push({role: 'assistant', content: msg.content});
      messages.push({role: 'user', content: [{type: 'tool_result', tool_use_id: call.id, is_error: true, content: `The plan was not accepted: ${problems.join('; ')}. Fix these and call submit_plan again with the whole plan.`}]});
      continue;
    }
    messages.push({role: 'assistant', content: msg.content});
    if (msg.stop_reason === 'pause_turn') continue; // server tools hit their loop limit; resume as is
    if (msg.stop_reason === 'max_tokens') throw new Error('The plan was too long for one answer. Shorten the concept or split the video.');
    messages.push({role: 'user', content: 'Now call submit_plan with the complete plan.'});
  }
  throw new Error('No plan after 8 steps.');
}

function addUsage(a = {}, u = {}) {
  const out = {...a};
  for (const k of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) out[k] = (out[k] || 0) + (u[k] || 0);
  out.web_search_requests = (out.web_search_requests || 0) + (u.server_tool_use?.web_search_requests || 0);
  return out;
}

// ---------- saving a plan version ----------
export function versions(dir) {
  const d = planDir(dir);
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .map((f) => /^plan-v(\d+)\.json$/.exec(f))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

export function savePlan(root, tax, playlist, video, dir, raw, meta = {}) {
  raw = tagged(raw, kitOpts(root, playlist));
  const problems = planProblems(raw);
  if (problems.length) throw Object.assign(new Error('Plan not accepted: ' + problems.join('; ')), {status: 422});
  const v = (versions(dir).slice(-1)[0] || 0) + 1;
  const plan = withTiming(numberSlots(raw));
  const card = {...plan.card, format: [playlist.format], label: plan.newsLabel ? [plan.newsLabel] : [], section: [plan.card.section]};
  plan.meta = {
    version: v,
    code: video.code,
    playlist: playlist.name,
    format: playlist.format,
    created: new Date().toISOString(),
    by: meta.by || 'api',
    model: meta.by === 'api' ? MODEL : undefined,
    feedback: meta.feedback || undefined,
    usage: meta.usage || undefined,
    hashtags: [...new Set([...hashtagsFor(tax, card), ...(plan.youtube?.hashtags || []).map((h) => '#' + String(h).replace(/^#/, ''))])],
    requiredStandards: applicableStandards(tax, card).map((s) => s.name),
  };
  writeJson(path.join(planDir(dir), `plan-v${v}.json`), plan);
  // a new plan version needs a new preview and a new approval
  setState(dir, (s) => ({...s, approved: null, preview: s.preview ? {...s.preview, approved: null} : undefined, plan: {...(s.plan || {}), current: v, approved: null}}));
  return {version: v, plan};
}

/** Footage lines get slot ids in order (F01, F02...; shots F01-1, F01-2), the names the creator's clips use. */
export function numberSlots(plan) {
  let n = 0;
  return {...plan, scenes: plan.scenes.map((s) => ({...s, lines: s.lines.map((l) => {
    if (l.graphic?.type !== 'footage') return l;
    const slot = `F${String(++n).padStart(2, '0')}`;
    return {...l, graphic: {...l.graphic, slot, items: (l.graphic.items || []).slice(0, 3).map((it, i) => ({...it, slot: `${slot}-${i + 1}`}))}};
  })}))};
}

export function renderPdf(root, dir, code, v) {
  const json = path.join(planDir(dir), `plan-v${v}.json`);
  const out = path.join(planDir(dir), `${code}-plan-v${v}.pdf`);
  const py = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  return new Promise((resolve, reject) => {
    const p = spawn(py, [path.join(APP_DIR, 'tools', 'plan_pdf.py'), json, out, root]);
    const err = [];
    p.stderr.on('data', (c) => err.push(c));
    p.on('error', (e) => reject(new Error(`Python not found (${e.message}). Install Python and run: python -m pip install reportlab`)));
    p.on('close', (c) => (c === 0 ? resolve(path.basename(out)) : reject(new Error('Plan PDF failed: ' + Buffer.concat(err).toString().trim().split('\n').slice(-3).join(' ')))));
  });
}

// ---------- public: start, status, import, approve ----------
export function status(dir) {
  const s = state(dir).plan || {};
  const live = jobs.get(dir);
  const vs = versions(dir);
  const current = s.current || vs.slice(-1)[0] || null;
  const plan = current ? readJson(path.join(planDir(dir), `plan-v${current}.json`)) : null;
  const handoff = fs.existsSync(path.join(planDir(dir), 'brief.md'));
  return {
    job: live ? {status: live.status, log: live.log.slice(-6), started: live.started, error: live.error, mode: live.mode} : s.job || null,
    versions: vs,
    current,
    approved: s.approved || null,
    plan,
    pdf: current && fs.existsSync(path.join(planDir(dir), `${plan?.meta?.code}-plan-v${current}.pdf`)) ? `${plan.meta.code}-plan-v${current}.pdf` : null,
    handoff: handoff ? {brief: 'plan/brief.md', expects: `plan/plan-v${(vs.slice(-1)[0] || 0) + 1}.json`} : null,
  };
}

export function startPlan(root, tax, playlist, video, dir, {feedback} = {}) {
  if (jobs.get(dir)?.status === 'running') throw Object.assign(new Error('A plan is already being made for this video'), {status: 409});
  const cur = status(dir);
  const previous = cur.plan ? {version: cur.current, plan: stripMeta(cur.plan)} : null;
  const opts = {feedback, previous: feedback ? previous : null};

  if (!apiKey()) {
    // hand-off: everything Claude in the project needs, in the video's own plan folder
    const next = (versions(dir).slice(-1)[0] || 0) + 1;
    const kit = kitOf(playlist);
    const brief = [
      briefText(root, tax, playlist, video, dir, opts),
      ...(kit.id === 'news' ? [] : ['', '## How to plan it', travelSystem(loadProfile(root), '').replace(/\n*When the plan is complete[^\n]*\n?[^\n]*$/, '')]),
      '',
      '## How to deliver',
      `Read \`BRAND-GUIDE.md\`${kit.id === 'news' && fs.existsSync(path.join(root, 'studio', 'PATTERN.md')) ? ' and \`studio/PATTERN.md\`' : ''} first, research with primary sources, then write the plan as JSON to \`${path.relative(root, path.join(planDir(dir), `plan-v${next}.json`)).split(path.sep).join('/')}\`, matching \`plan/plan-schema.json\` exactly. Content Studio checks it, adds timings and makes the plan PDF when the owner presses "Check for plan".`,
      '',
      `Work on this plan in its own project thread (one thread per video plan), not in the Content Studio development thread. Ask the owner any plan questions there, and say there when the file is written.`,
    ].join('\n');
    write(path.join(planDir(dir), 'brief.md'), brief);
    writeJson(path.join(planDir(dir), 'plan-schema.json'), planSchema(tax, kitOpts(root, playlist)));
    setState(dir, (s) => ({...s, plan: {...(s.plan || {}), job: {status: 'handoff', at: new Date().toISOString(), feedback: feedback || undefined}}}));
    return status(dir);
  }

  const job = {status: 'running', mode: 'api', started: new Date().toISOString(), log: [], usage: {}};
  jobs.set(dir, job);
  runApi(root, tax, playlist, video, dir, job, opts)
    .then(async (raw) => {
      const {version} = savePlan(root, tax, playlist, video, dir, raw, {by: 'api', feedback, usage: job.usage});
      job.log.push('Making the plan PDF…');
      try {
        await renderPdf(root, dir, video.code, version);
      } catch (e) {
        job.log.push(e.message);
      }
      job.status = 'done';
      job.log.push(`Plan v${version} ready.`);
    })
    .catch((e) => {
      job.status = 'error';
      job.error = e instanceof Anthropic.AuthenticationError ? 'The API key was not accepted. Check it in Settings.' : e instanceof Anthropic.RateLimitError ? 'Rate limited by the API. Try again in a minute.' : e.message;
    })
    .finally(() => {
      setState(dir, (s) => ({...s, plan: {...(s.plan || {}), job: {status: job.status, at: new Date().toISOString(), error: job.error, usage: job.usage}}}));
      setTimeout(() => jobs.get(dir) === job && jobs.delete(dir), 10 * 60 * 1000).unref();
    });
  return status(dir);
}

// Hand-off: pick up the plan file Claude wrote (the newest plan-vN.json that is not yet current).
export async function importPlan(root, tax, playlist, video, dir) {
  const vs = versions(dir);
  const s = state(dir).plan || {};
  const latest = vs.slice(-1)[0];
  if (!latest || latest === s.current) throw Object.assign(new Error('No new plan file yet. Ask Claude in the project to make the plan from plan/brief.md.'), {status: 404});
  const file = path.join(planDir(dir), `plan-v${latest}.json`);
  const raw = readJson(file);
  const problems = planProblems(tagged(raw, kitOpts(root, playlist)));
  if (problems.length) throw Object.assign(new Error(`plan-v${latest}.json is not complete: ${problems.join('; ')}`), {status: 422});
  // re-save through savePlan so timing and meta are added the same way as API plans
  fs.renameSync(file, file + '.import');
  try {
    const {version} = savePlan(root, tax, playlist, video, dir, stripMeta(raw), {by: 'handoff', feedback: s.job?.feedback});
    fs.rmSync(file + '.import');
    await renderPdf(root, dir, video.code, version);
    setState(dir, (st) => ({...st, plan: {...(st.plan || {}), job: {status: 'done', at: new Date().toISOString()}}}));
  } catch (e) {
    if (fs.existsSync(file + '.import')) fs.renameSync(file + '.import', file);
    throw e;
  }
  return status(dir);
}

function stripMeta(plan) {
  const {meta, duration, ...rest} = plan;
  return {...rest, scenes: rest.scenes.map(({start, end, lines, ...s}) => ({...s, lines: lines.map(({start: a, end: b, words, ...l}) => l)}))};
}

// Approve: the plan becomes the piece's record (card, standards list, YouTube draft with sources).
export function approvePlan(root, tax, playlist, video, dir, saveCard) {
  const st = status(dir);
  if (!st.plan) throw Object.assign(new Error('No plan to approve'), {status: 404});
  const p = st.plan;
  const card = {...p.card, section: [p.card.section], format: [playlist.format], label: p.newsLabel ? [p.newsLabel] : [], notes: {}};
  saveCard(card);

  // gate 1: the standards list, with how each is met (the check itself is gate 4)
  const readme = path.join(dir, 'README.md');
  let text = read(readme, '');
  const block = ['## Standards list (from plan v' + st.current + ', ' + today() + ')', '| Standard | How this piece meets it |', '|---|---|', ...p.standards.map((s) => `| ${s.name} | ${s.how.replace(/\|/g, '\\|')} |`), ''].join('\n');
  text = /^## Standards list/m.test(text) ? text.replace(/^## Standards list[^\n]*\n(?:\|[^\n]*\n)*\n?/m, block + '\n') : text.replace(/^## Corrections/m, block + '\n## Corrections');
  if (!/^## Standards list/m.test(text)) text += '\n' + block;
  write(readme, text);

  // gate 2: description draft with sources, primary first
  const src = [...p.sources].sort((a, b) => (a.kind === 'primary' ? -1 : 0) - (b.kind === 'primary' ? -1 : 0));
  const chapters = p.scenes.map((s) => `${clock(s.start)} ${s.title}`).join('\n');
  // never overwrite a description someone wrote by hand
  const yt = path.join(dir, 'youtube', 'ur-Latn.md');
  const ytFile = !fs.existsSync(yt) || read(yt, '').includes('_Draft from plan v') ? yt : path.join(dir, 'youtube', 'ur-Latn.draft.md');
  write(ytFile, [
    `# ${p.titleRoman}`,
    '',
    p.youtube.description,
    '',
    '## Chapters',
    chapters,
    '',
    '## Sources',
    ...src.map((s) => `- ${s.outlet}: ${s.title}${s.date ? ` (${s.date})` : ''} ${s.url}`),
    '',
    '## Hashtags',
    p.meta.hashtags.join(' '),
    '',
    '## Tags',
    p.youtube.tags.join(', '),
    '',
    `_Draft from plan v${st.current} (${today()}). Chapters use estimated timings until the voice is recorded._`,
    '',
  ].join('\n'));

  setState(dir, (s) => ({...s, title: s.title || video.title, plan: {...(s.plan || {}), approved: {version: st.current, at: today()}}, stage: 'preview'}));
  return status(dir);
}
