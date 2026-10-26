// Reference stills for themes: the same sample story drawn in each theme, in the creator's own brand,
// saved to brand/reference/themes/<id>/v<N>/. The Brand page shows them to pick a theme, and video
// previews are compared against them (brand-setup skill). One bundle renders every theme.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {APP_DIR, readJson, rendererDir} from './workspace.mjs';
import {loadProfile, brandProps, defaultThemeId} from './brand.mjs';
import * as CU from './cutouts.mjs';
import {adoptTheme, loadTheme, installThemeFonts, stillsDir} from './themes.mjs';
import {withTiming} from './plan-schema.mjs';
import {direct} from './director.mjs';
import {numberSlots} from './planner.mjs';
import {studioCheck, run, npmInstall} from './preview.mjs';

let job = null; // one sample job at a time

const SHOTS = [
  ['1-title', (p) => 1.6],
  ['2-coverage', (p) => p.scenes.find((s) => s.kind === 'montage')?.start + 2.4],
  ['3-map', (p) => p.scenes.find((s) => s.kind === 'map')?.start + 4.2],
  ['4-numbers', (p) => p.scenes.find((s) => s.kind === 'numbers')?.start + 3.2],
  ['5-fix', (p) => p.scenes.find((s) => s.kind === 'fix')?.start + 3],
];

export const samplesStatus = () => (job ? {status: job.status, progress: job.progress, ids: job.ids, error: job.error || null} : null);

export function startSamples(root, ids, opts = {}) {
  if (job?.status === 'running') throw Object.assign(new Error('Sample stills are already being made'), {status: 409});
  const check = studioCheck(root);
  if (!check.ok && check.why !== 'install') throw Object.assign(new Error(check.why), {status: 400});
  const plan = withTiming(readJson(path.join(APP_DIR, 'assets', 'sample-plan.json')));
  plan.thumbnail = {...plan.thumbnail, stamp: ''};
  const profile = loadProfile(root);
  const refs = ids.map((id) => adoptTheme(root, id));
  job = {status: 'running', progress: 0, ids, started: new Date().toISOString()};
  const jobFile = path.join(os.tmpdir(), `content-studio-samples-${process.pid}-${Date.now()}.json`);
  (async () => {
    if (!check.ok) await npmInstall(check.studio);
    const fontFiles = installThemeFonts(check.studio);
    const variants = refs.map(({id, version}) => {
      const out = stillsDir(root, id, version);
      return {
        props: {code: 'SAMPLE', playlist: 'Playlist', label: plan.newsLabel ? `${plan.newsLabel} News` : profile.chrome.label, cause: plan.card.cause[0] || '', lang: profile.languages.voice, bed: null, fx: 0, captions: false, plan, inserts: direct(plan, root, {style: CU.styler(profile), place: CU.placer(profile)}), brand: profile.exists ? brandProps(profile, loadTheme(root, id, version)) : undefined, theme: loadTheme(root, id, version), fontFiles},
        thumb: path.join(out, '6-thumbnail.jpg'),
        stills: SHOTS.map(([name, at]) => ({frame: Math.round((at(plan) || 1) * 30), out: path.join(out, `${name}.jpg`)})),
      };
    });
    fs.writeFileSync(jobFile, JSON.stringify({studio: check.studio, variants, stillScale: 0.5, browserExecutable: opts.browserExecutable || process.env.CS_BROWSER || undefined}));
    await run([path.join(APP_DIR, 'render', 'render.mjs'), jobFile], check.studio, (m) => {
      if (m.error) job.error = m.error;
      if (m.stage === 'samples') job.progress = m.progress;
    });
    job.status = 'done';
  })()
    .catch((e) => Object.assign(job, {status: 'error', error: job.error || e.message}))
    .finally(() => fs.rm(jobFile, {force: true}, () => {}));
  return samplesStatus();
}

// ---------- cutout style samples (server/cutouts.mjs): one still per style, on the brand's default theme ----------
let cutJob = null;
export const cutoutSamplesStatus = () => (cutJob ? {status: cutJob.status, progress: cutJob.progress, error: cutJob.error || null} : null);

/** One sample insert per category, from the sample story (no invented facts beyond it). */
export function sampleInsert(plan, cat, photo) {
  const s = plan.sources;
  const ref = (x) => ({outlet: x.outlet, date: x.date, headline: x.title, url: x.url.replace(/^https?:\/\/(www\.)?/, '')});
  const q = plan.quotes[0] || {speaker: 'Spokesperson', text: 'A short statement.', date: ''};
  switch (cat) {
    case 'ref': return {kind: 'ref', ...ref(s[1] || s[0]), others: s.filter((_, i) => i !== 1).slice(0, 3).map(ref)};
    case 'quote': return {kind: 'quote', speaker: q.speaker, text: q.text, marks: ['most severe', 'software history'], outlet: s.find((x) => x.id === q.sourceId)?.outlet || '', date: q.date};
    case 'doc': return {kind: 'doc', ...ref(s[0])};
    case 'keyword': return {kind: 'keyword', text: 'PHP2Shell', sub: 'WHAT IT IS'};
    case 'map': return {kind: 'place', places: ['Germany', 'France', 'United Kingdom', 'Italy', 'Spain', 'Poland'], label: 'EUROPE'};
    case 'clip': return {kind: 'footage', ...ref(s[0])};
    case 'audio': return {kind: 'audio', name: 'sample', label: 'Phone call with the minister'};
    case 'photo': return {kind: 'photo', name: 'sample', label: 'Server room, Karachi', url: photo};
  }
  return null;
}
export function startCutoutSamples(root, opts = {}) {
  if (cutJob?.status === 'running') throw Object.assign(new Error('Cutout samples are already being made'), {status: 409});
  const check = studioCheck(root);
  if (!check.ok && check.why !== 'install') throw Object.assign(new Error(check.why), {status: 400});
  const plan = withTiming(readJson(path.join(APP_DIR, 'assets', 'sample-plan.json')));
  plan.thumbnail = {...plan.thumbnail, stamp: ''};
  const profile = loadProfile(root);
  // the placement on the Brand page, even before it is saved
  const place = CU.placer(opts.place ? {...profile, cutoutPlace: CU.cleanPlaces(opts.place)} : profile);
  const ref = adoptTheme(root, defaultThemeId(profile));
  const theme = loadTheme(root, ref.id, ref.version);
  // a quiet middle line to lay each sample over
  const line = plan.scenes.find((sc) => sc.kind === 'risk')?.lines[0] || plan.scenes[Math.floor(plan.scenes.length / 2)].lines[0];
  // travel graphics are drawn from a sample travel guide (assets/sample-travel.json)
  const tplan = withTiming(numberSlots(readJson(path.join(APP_DIR, 'assets', 'sample-travel.json'))));
  const travel = {plan: tplan, lines: tplan.scenes.flatMap((sc) => sc.lines)};
  const out = CU.samplesDir(root);
  // the sample photo: the presenter's photo from the brand, when there is one
  const pic = profile.presenter?.photo && (fs.existsSync(path.join(root, profile.presenter.photo)) || fs.existsSync(path.join(rendererDir(root), 'public', profile.presenter.photo))) ? `static:${profile.presenter.photo}` : undefined;
  cutJob = {status: 'running', progress: 0, started: new Date().toISOString()};
  const jobFile = path.join(os.tmpdir(), `content-studio-cutouts-${process.pid}-${Date.now()}.json`);
  (async () => {
    if (!check.ok) await npmInstall(check.studio);
    const fontFiles = installThemeFonts(check.studio);
    const common = {code: 'SAMPLE', playlist: 'Playlist', label: plan.newsLabel ? `${plan.newsLabel} News` : profile.chrome.label, cause: plan.card.cause[0] || '', lang: profile.languages.voice, bed: null, fx: 0, captions: false, plan, brand: profile.exists ? brandProps(profile, theme) : undefined, theme, fontFiles};
    const cats = CU.CATEGORIES.filter((c) => !opts.only || opts.only.includes(c.id) || opts.only.includes(c.group));
    const variants = cats.flatMap((c) => c.styles.map((st) => {
      if (c.graphic) {
        // a travel graphic: the sample travel guide's line of that type, drawn in this style
        const i = travel.lines.findIndex((l) => l.graphic?.type === c.graphic);
        const l = travel.lines[i];
        const tp = {...travel.plan, scenes: travel.plan.scenes.map((sc) => ({...sc, lines: sc.lines.map((x) => (x === l ? {...x, layout: 'voice', graphic: {...x.graphic, style: st.id}} : x))}))};
        const at = c.graphic === 'footage' ? l.start + Math.min(2.2, (l.end - l.start) / 2) : l.end - 0.1;
        return {props: {...common, label: '', cause: '', plan: tp, inserts: [], footage: {}}, stills: [{frame: Math.round(at * 30), out: path.join(out, CU.sampleName(c.id, st.id))}]};
      }
      const x = {...sampleInsert(plan, c.id, pic), style: st.id, place: place(sampleInsert(plan, c.id, pic).kind), from: line.start, to: line.start + 4};
      return {props: {...common, inserts: [x]}, stills: [{frame: Math.round((line.start + 2.4) * 30), out: path.join(out, CU.sampleName(c.id, st.id))}]};
    }));
    fs.mkdirSync(out, {recursive: true});
    fs.writeFileSync(jobFile, JSON.stringify({studio: check.studio, variants, stillScale: 0.5, browserExecutable: opts.browserExecutable || process.env.CS_BROWSER || undefined}));
    await run([path.join(APP_DIR, 'render', 'render.mjs'), jobFile], check.studio, (m) => {
      if (m.error) cutJob.error = m.error;
      if (m.stage === 'samples') cutJob.progress = m.progress;
    });
    cutJob.status = 'done';
  })()
    .catch((e) => Object.assign(cutJob, {status: 'error', error: cutJob.error || e.message}))
    .finally(() => fs.rm(jobFile, {force: true}, () => {}));
  return cutoutSamplesStatus();
}
