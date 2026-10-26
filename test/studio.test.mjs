// node --test test/  · runs against a throwaway copy of a channel folder built in a temp dir.
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadTaxonomy, pickValues, applicableStandards, hashtagsFor, cardProblems, setHashtag} from '../server/taxonomy.mjs';
import * as P from '../server/playlists.mjs';
import * as V from '../server/videos.mjs';

const PLAYLIST_MD = `# News Explained by Aqsa

Helpful tech news: what happened, what it means, and how to fix or protect yourself.
Rules: \`../../BRAND-GUIDE.md\` (process A3, News flow C1). Built in \`../../studio/\`.

## Taxonomy defaults
| Field | Default |
|---|---|
| Format | **News** (flow: BRAND-GUIDE C1) |
| Topic | per piece (shown as CATEGORY) |
| Cause | always **Explained** (lead, shown on the thumbnail) plus one that gives the audience action (e.g. Stay Safe) |
| Codes | N01, N02 … |

| Code | Folder | Topic | Section | Label | Standards check | Status |
|---|---|---|---|---|---|---|
| N01 | \`N01-php2shell/\` | Cybersecurity, Software | Safety | Breaking News | Reviewed; kept as is (24 Oct 2026) | Final video (music + SFX); voice-over pending |
`;

const README = `# N01 · PHP2Shell

- notes about files

## Taxonomy card (24 Oct 2026)
| Field | Value |
|---|---|
| Topic | Cybersecurity, Software |
| Section | Safety |
| Format | News (the base for the News flow) |
| News label | Breaking News (owner kept it) |
| Region | Global |
| Industry | Software, Telecom |
| Audience | Developers, Businesses |
| Breakout | none |
| Cause | Explained (lead), Stay Safe, Cyber Resilience |

## Standards check (audit, 24 Oct 2026)
| Standard | Result | Evidence / gap |
|---|---|---|
| Two Sources | Gap | missing one |
| Harm Check | Pass | fine |

**Owner's verdict (24 Oct 2026):** kept as is.

## Corrections
None yet.
`;

let root;
let tax;
before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-'));
  fs.writeFileSync(path.join(root, 'BRAND-GUIDE.md'), '# guide\n');
  const pl = path.join(root, 'playlists', 'news-explained-by-aqsa');
  fs.mkdirSync(path.join(pl, 'N01-php2shell', 'video'), {recursive: true});
  fs.mkdirSync(path.join(pl, 'N01-php2shell', 'youtube'), {recursive: true});
  fs.writeFileSync(path.join(pl, 'PLAYLIST.md'), PLAYLIST_MD);
  fs.writeFileSync(path.join(pl, 'N01-php2shell', 'README.md'), README);
  fs.writeFileSync(path.join(pl, 'N01-php2shell', 'video', 'N01-ur-1080p-sfx.mp4'), '');
  fs.writeFileSync(path.join(pl, 'N01-php2shell', 'youtube', 'ur-Latn.md'), 'https://a.example https://b.example');
  tax = loadTaxonomy(root);
});

test('pickValues keeps the order of appearance and splits notes', () => {
  assert.deepEqual(pickValues(tax, 'cause', 'Explained (lead), Stay Safe, Cyber Resilience'), {values: ['Explained', 'Stay Safe', 'Cyber Resilience'], note: 'lead'});
  assert.deepEqual(pickValues(tax, 'label', 'Breaking News').values, ['Breaking']);
  assert.deepEqual(pickValues(tax, 'industry', 'Media, Social Media').values, ['Media']);
  assert.deepEqual(pickValues(tax, 'topic', 'Social Media').values, ['Social Media']);
});

test('standards and hashtags follow the card', () => {
  const card = {topic: ['Cybersecurity'], section: ['Safety'], format: ['News'], label: ['Breaking'], cause: ['Explained', 'Stay Safe'], region: ['Pakistan']};
  const names = applicableStandards(tax, card).map((s) => s.name);
  for (const n of ['Two Sources', 'Breaking Discipline', 'Harm Check', 'Responsible Disclosure', 'Action Steps', 'Inclusive Voices']) assert.ok(names.includes(n), n);
  assert.ok(!names.includes('Market Neutral'));
  assert.equal(hashtagsFor(tax, card)[0], '#CyberSecurity');
  assert.deepEqual(cardProblems(tax, card), []);
  assert.match(cardProblems(tax, {...card, format: ['Opinion']}).join(), /not yet defined/);
  assert.match(cardProblems(tax, {...card, topic: []}).join(), /Topic/);
});

test('hashtag overrides are saved in brand/taxonomy.json', () => {
  setHashtag(root, 'topic', 'AI', 'ArtificialIntelligence');
  const t = loadTaxonomy(root);
  assert.equal(t.fields.topic.values.find((v) => v.value === 'AI').hashtag, '#ArtificialIntelligence');
  setHashtag(root, 'topic', 'AI', '#AI');
});

test('existing playlist imports from PLAYLIST.md', () => {
  const p = P.loadPlaylist(root, tax, 'news-explained-by-aqsa');
  assert.equal(p.name, 'News Explained by Aqsa');
  assert.equal(p.codePrefix, 'N');
  assert.deepEqual(p.defaults.cause.values, ['Explained']);
  assert.equal(p.rows.N01.status, 'Final video (music + SFX); voice-over pending');
  const v = p.videos[0];
  assert.equal(v.title, 'PHP2Shell');
  assert.deepEqual(v.card.cause, ['Explained', 'Stay Safe', 'Cyber Resilience']);
  const status = Object.fromEntries(v.gates.map((g) => [g.id, g.status]));
  assert.deepEqual(status, {0: 'done', 1: 'done', 2: 'done', 3: 'done', 4: 'kept', 5: 'done', 6: 'todo', 7: 'done'});
  assert.equal(p.nameField, null); // an invented name is flagged
});

test('playlist names come from the taxonomy; the folder follows the name', () => {
  assert.throws(() => P.updatePlaylist(root, tax, 'news-explained-by-aqsa', {}), /not in our taxonomy/);
  assert.throws(() => P.renamePlaylist(root, tax, 'news-explained-by-aqsa', {name: 'Cyber Stuff'}), /not in our taxonomy/);
  const p = P.renamePlaylist(root, tax, 'news-explained-by-aqsa', {name: 'Cybersecurity'});
  assert.equal(p.slug, 'cybersecurity');
  assert.equal(p.nameField, 'topic');
  assert.deepEqual(p.defaults.topic.values, ['Cybersecurity']); // the name leads its field
  assert.equal(p.videos[0].code, 'N01');
  assert.ok(!fs.existsSync(path.join(root, 'playlists', 'news-explained-by-aqsa')));
});

test('saving a playlist writes PLAYLIST.md in the same shape and keeps rows', () => {
  const p = P.loadPlaylist(root, tax, 'cybersecurity');
  const saved = P.updatePlaylist(root, tax, p.slug, {...p, instructions: ['Show the advisory on screen']});
  const md = fs.readFileSync(path.join(root, 'playlists', p.slug, 'PLAYLIST.md'), 'utf8');
  assert.match(md, /^# Cybersecurity\n/);
  assert.match(md, /\| Cause \| always \*\*Explained\*\* \(lead/);
  assert.match(md, /\| N01 \| `N01-php2shell\/` \| Cybersecurity, Software \| Safety \| Breaking News \| Reviewed; kept as is/);
  assert.match(md, /- Show the advisory on screen/);
  assert.equal(saved.rows.N01.check, 'Reviewed; kept as is (24 Oct 2026)');
  // a second save is stable (reads playlist.json now)
  P.updatePlaylist(root, tax, p.slug, saved);
  assert.equal(fs.readFileSync(path.join(root, 'playlists', p.slug, 'PLAYLIST.md'), 'utf8'), md);
});

test('saving a card rewrites only the card table', () => {
  const dir = path.join(root, 'playlists', 'cybersecurity');
  const v = V.getVideo(root, tax, dir, 'N01-php2shell');
  V.saveCard(root, tax, dir, 'N01-php2shell', {...v.card, region: ['Global', 'Pakistan']});
  const md = fs.readFileSync(path.join(dir, 'N01-php2shell', 'README.md'), 'utf8');
  assert.match(md, /\| Region \| Global, Pakistan \|/);
  assert.match(md, /\| News label \| Breaking News \(owner kept it\) \|/);
  assert.match(md, /\| Cause \| Explained, Stay Safe, Cyber Resilience \(lead\) \|/);
  assert.match(md, /## Standards check \(audit, 24 Oct 2026\)\n\| Standard/);
  assert.match(md, /- notes about files/);
  assert.equal(V.getVideo(root, tax, dir, 'N01-php2shell').card.region.length, 2);
});

test('create, rename and archive a playlist and a video', () => {
  const s = P.suggestPlaylists(root, tax);
  assert.ok(s.every((x) => x.name === x.defaults.topic.values[0])); // names are the Topic itself
  assert.deepEqual(s.find((x) => x.name === 'Cybersecurity').covered, ['Cybersecurity']);
  const privacy = s.find((x) => x.name === 'Privacy');
  assert.notEqual(privacy.codePrefix, 'N');
  const made = P.createPlaylist(root, tax, {...privacy, slug: 'ignored'});
  assert.equal(made.slug, 'privacy');
  assert.ok(fs.existsSync(path.join(root, 'playlists', made.slug, 'PLAYLIST.md')));
  assert.throws(() => P.createPlaylist(root, tax, privacy), /already exists/);
  assert.throws(() => P.createPlaylist(root, tax, {...privacy, name: 'Privacy Explained by Aqsa'}), /not in our taxonomy/);

  const renamed = P.renamePlaylist(root, tax, made.slug, {name: 'Digital ID'});
  assert.equal(renamed.name, 'Digital ID');
  assert.ok(fs.existsSync(path.join(root, 'playlists', 'digital-id', 'playlist.json')));

  const dir = path.join(root, 'playlists', 'cybersecurity');
  const v = V.renameVideo(root, tax, dir, 'N01-php2shell', {title: 'PHP2Shell Explained', slug: 'php2shell-explained'});
  assert.equal(v.folder, 'N01-php2shell-explained');
  assert.equal(v.title, 'PHP2Shell Explained');
  assert.match(fs.readFileSync(path.join(dir, v.folder, 'README.md'), 'utf8'), /^# N01 · PHP2Shell Explained/);

  const to = V.archiveVideo(root, dir, v.folder);
  assert.match(to, /^archive\/playlists\/cybersecurity\/N01-php2shell-explained-removed-/);
  assert.ok(fs.existsSync(path.join(root, to, 'README.md')));
  assert.match(P.archivePlaylist(root, 'digital-id'), /^archive\/playlists\/digital-id-removed-/);
  assert.throws(() => P.archivePlaylist(root, '../x'), /bad playlist/);
});

// ---- Phase 2 ----
import {planProblems, withTiming, planSchema} from '../server/plan-schema.mjs';
import * as PL from '../server/planner.mjs';

const PLAN = {
  title: 'Test', titleRoman: 'Test "PTA"', asOf: '2026-10-24', newsLabel: 'Developing', summary: 'S', causeApproach: 'C',
  card: {topic: ['Mobile Networks'], section: 'Everyday', region: ['Pakistan'], industry: [], audience: ['Consumers'], breakout: ['Phone Taxes'], cause: ['Explained', 'Consumer Rights']},
  standards: [{name: 'Two Sources', how: 'two'}],
  sources: [{id: 'S1', outlet: 'PTA', title: 'Notice', url: 'https://pta.gov.pk/', date: '2026-10-22', kind: 'primary'}],
  scenes: [
    {kind: 'hook', title: 'Hook', visual: 'v', onScreen: ['PTA'], lines: [{vo: 'ek do teen char panch chhe saat aath nau das', cue: ''}], sourceIds: ['S1']},
    {kind: 'fix', title: 'Fix', visual: 'v', onScreen: [], lines: [{vo: 'short', cue: ''}, {vo: 'another short line', cue: ''}], sourceIds: []},
  ],
  quotes: [], thumbnail: {jargonTitle: 'PTA', urduLine: 'a\n[[b]]', urduLineRoman: 'a b', stamp: 'CHECK NOW', keyVisual: 'k'},
  youtube: {description: 'd', tags: ['t'], hashtags: ['PTATax']}, conceptItems: [], openQuestions: [],
};

test('plan schema uses taxonomy enums and is strict-shaped', () => {
  const s = planSchema(tax);
  assert.equal(s.additionalProperties, false);
  assert.ok(s.properties.card.properties.topic.items.enum.includes('Cybersecurity'));
  assert.deepEqual(s.required, Object.keys(s.properties));
});

test('plan checks and timing', () => {
  assert.deepEqual(planProblems(PLAN), []);
  assert.match(planProblems({...PLAN, scenes: [{...PLAN.scenes[0], sourceIds: ['S9']}]}).join(), /unknown source S9/);
  const p = withTiming(PLAN);
  assert.equal(p.scenes[0].start, 0);
  assert.equal(p.scenes[0].lines[0].start, 0.6);
  assert.equal(p.scenes[0].lines[0].end, Math.round((0.6 + 10 / 2.6) * 100) / 100);
  assert.equal(Math.round((p.scenes[1].lines[0].end - p.scenes[1].lines[0].start) * 100) / 100, 1.6); // minimum line length
  assert.equal(p.scenes[1].start, p.scenes[0].end);
});

test('new video, hand-off plan, import and approve', async () => {
  const slug = 'cybersecurity';
  const pdir = path.join(root, 'playlists', slug);
  const pl = P.loadPlaylist(root, tax, slug);
  assert.throws(() => V.createVideo(root, tax, pl, pdir, {title: 'x'}), /concept/);
  assert.throws(() => V.createVideo(root, tax, pl, pdir, {title: 'x', pdf: {name: 'a.pdf', data: Buffer.from('nope').toString('base64')}}), /not a PDF/);
  for (const f of fs.readdirSync(pdir)) if (/^N\d+-x$/.test(f)) fs.rmSync(path.join(pdir, f), {recursive: true});

  // N01 was archived by an earlier test, so its code is not reused
  const v = V.createVideo(root, tax, pl, pdir, {title: 'PTA tax', concept: 'Fees changed', links: 'https://pta.gov.pk/ junk'});
  assert.equal(v.code, 'N02');
  assert.deepEqual(v.card.cause, ['Explained']);
  const dir = path.join(pdir, v.folder);
  assert.match(fs.readFileSync(path.join(dir, 'concept', 'concept.md'), 'utf8'), /- https:\/\/pta\.gov\.pk\//);

  process.env.CS_SETTINGS = path.join(root, 'no-settings.json');
  delete process.env.ANTHROPIC_API_KEY;
  let st = PL.startPlan(root, tax, pl, v, dir, {});
  assert.equal(st.job.status, 'handoff');
  assert.match(fs.readFileSync(path.join(dir, 'plan', 'brief.md'), 'utf8'), /plan-v1\.json/);
  await assert.rejects(PL.importPlan(root, tax, pl, v, dir), /No new plan/);

  fs.writeFileSync(path.join(dir, 'plan', 'plan-v1.json'), JSON.stringify({...PLAN, scenes: []}));
  await assert.rejects(PL.importPlan(root, tax, pl, v, dir), /not complete/);
  fs.writeFileSync(path.join(dir, 'plan', 'plan-v1.json'), JSON.stringify(PLAN));
  try {
    st = await PL.importPlan(root, tax, pl, v, dir);
  } catch (e) {
    // the PDF needs Python + reportlab; the plan itself is saved before that step
    if (!/Python|PDF/.test(e.message)) throw e;
    st = PL.status(dir);
  }
  assert.equal(st.current, 1);
  assert.ok(st.plan.meta.hashtags.includes('#PTATax'));
  assert.ok(st.plan.meta.requiredStandards.includes('Action Steps'));

  st = PL.approvePlan(root, tax, pl, V.getVideo(root, tax, pdir, v.folder), dir, (card) => V.saveCard(root, tax, pdir, v.folder, card));
  assert.equal(st.approved.version, 1);
  const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  assert.match(readme, /\| News label \| Developing News \|/);
  assert.match(readme, /## Standards list \(from plan v1/);
  assert.match(fs.readFileSync(path.join(dir, 'youtube', 'ur-Latn.md'), 'utf8'), /## Sources\n- PTA: Notice \(2026-10-22\) https:\/\/pta\.gov\.pk\//);
  const g = Object.fromEntries(V.getVideo(root, tax, pdir, v.folder).gates.map((x) => [x.id, x.status]));
  assert.equal(g[0], 'done');
  assert.equal(g[1], 'done');
  assert.equal(V.nextCode(root, pdir, 'N'), 'N03');
});

// ---- Phase 3 ----
import * as PV from '../server/preview.mjs';

test('sample plan with graphics passes the schema checks', () => {
  const sample = JSON.parse(fs.readFileSync(new URL('./fixtures/sample-plan.json', import.meta.url)));
  assert.deepEqual(planProblems(sample), []);
  const types = planSchema(tax).properties.scenes.items.properties.lines.items.properties.graphic.properties.type.enum;
  for (const s of sample.scenes) for (const l of s.lines) assert.ok(types.includes(l.graphic.type), l.graphic.type);
});

test('preview props follow the owner layout rule, and approval needs a current preview', () => {
  const sample = JSON.parse(fs.readFileSync(new URL('./fixtures/sample-plan.json', import.meta.url)));
  const studio = path.join(root, 'studio', 'public', 'audio', 'beds');
  fs.mkdirSync(studio, {recursive: true});
  fs.writeFileSync(path.join(studio, 'news-bed-b-calm-explainer.wav'), '');
  const props = PV.propsFor(root, {name: 'Cybersecurity', production: {bed: 'b', voiceLanguage: 'ur-Latn'}}, {code: 'N05'}, {...sample, meta: {version: 2}});
  assert.equal(props.playlist, 'Cybersecurity'); // top-right with the dot
  assert.equal(props.label, 'Breaking News'); // top-left
  assert.equal(props.cause, 'Explained'); // outlined next to the label
  assert.equal(props.bed, 'audio/beds/news-bed-b-calm-explainer.wav');
  assert.ok(props.plan.duration > 60 && props.plan.scenes[0].lines[0].start > 0);
  assert.equal(props.plan.meta, undefined);
  assert.equal(PV.studioCheck(root).ok, false);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-pv-'));
  assert.throws(() => PV.approvePreview(dir), /No preview/);
  fs.mkdirSync(path.join(dir, 'preview'));
  fs.writeFileSync(path.join(dir, 'preview', 'preview-v1.json'), JSON.stringify({version: 1, planVersion: 1}));
  fs.writeFileSync(path.join(dir, 'video.json'), JSON.stringify({plan: {approved: {version: 2}}, preview: {current: 1}}));
  assert.equal(PV.status(dir).stale, true);
  assert.throws(() => PV.approvePreview(dir), /plan changed/);
  fs.writeFileSync(path.join(dir, 'video.json'), JSON.stringify({plan: {approved: {version: 1}}, preview: {current: 1}}));
  const st = PV.approvePreview(dir);
  assert.equal(st.approved.version, 1);
  const vj = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
  assert.match(vj.approved, /preview v1/); // gate 5
  assert.equal(vj.stage, 'record');
});

test('director: inserts come from the plan facts and keep apart', async () => {
  const {direct, figureIn, dateIn, placesIn, summary} = await import('../server/director.mjs');
  const {withTiming} = await import('../server/plan-schema.mjs');
  assert.deepEqual(figureIn('PHP ki 167 million installs hain'), {value: '167M', label: 'installs'});
  assert.equal(figureIn('20 October ko 2026 mein do bugs'), null);
  assert.equal(dateIn('20 October ko leak'), '20 OCT');
  assert.deepEqual(placesIn('Pakistan aur UAE mein', '/nonexistent'), ['United Arab Emirates', 'Pakistan']);
  assert.deepEqual(placesIn('Duniya bhar ki news', '/nonexistent'), ['*']);
  const plan = withTiming(JSON.parse(fs.readFileSync(new URL('./fixtures/sample-plan.json', import.meta.url), 'utf8')));
  const ins = direct(plan, '/nonexistent');
  assert.ok(ins.length >= 4, summary(ins));
  assert.ok(new Set(ins.map((x) => x.kind)).size >= 2);
  for (let i = 1; i < ins.length; i++) assert.ok(ins[i].from >= ins[i - 1].to, 'inserts overlap');
  const quiet = new Set(['hook', 'intro', 'midcta', 'helpcta']);
  assert.ok(ins.every((x) => !quiet.has(plan.scenes[x.scene].kind)));
  const ids = new Set(plan.sources.map((s) => s.id));
  assert.ok(ins.filter((x) => x.sourceId).every((x) => ids.has(x.sourceId)), 'only real sources');
});

test('brand profile: defaults, validation, and what it drives', async () => {
  const Bm = await import('../server/brand.mjs');
  const PV = await import('../server/preview.mjs');
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-brand-'));
  const empty = Bm.loadProfile(r);
  assert.equal(empty.exists, false);
  assert.equal(empty.captionsInVideo, false);
  assert.throws(() => Bm.saveProfile(r, {name: 'X', colors: {accent: 'red'}}), /#1A2B3C/);
  assert.throws(() => Bm.saveProfile(r, {name: ''}), /name/);
  const saved = Bm.saveProfile(r, {name: 'Travel Tales', colors: {accent: '#22AA66'}, sound: {defaultBed: 'b'}, languages: {voice: 'en-US', subtitles: ['en-US']}});
  assert.equal(saved.exists, true);
  assert.equal(saved.colors.brand, Bm.DEFAULTS.colors.brand, 'unset fields keep defaults');
  assert.ok(!('exists' in JSON.parse(fs.readFileSync(Bm.profileFile(r), 'utf8'))));
  const prod = P.defaultProduction(r);
  assert.equal(prod.bed, 'b');
  assert.deepEqual(prod.subtitles, ['en-US']);
  const plan = JSON.parse(fs.readFileSync(new URL('./fixtures/sample-plan.json', import.meta.url), 'utf8'));
  const props = PV.propsFor(r, {name: 'Travel', production: {}}, {code: 'T01'}, plan);
  assert.equal(props.captions, false);
  assert.equal(props.brand.name, 'Travel Tales');
  assert.equal(props.brand.colors.accent, '#22AA66');
  assert.equal(props.lang, 'en-US');
});

test('thumbnail stamp: plan suggestion, own words, none, and the brand rule', async () => {
  const PV = await import('../server/preview.mjs');
  const Bm = await import('../server/brand.mjs');
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-stamp-'));
  const dir = path.join(r, 'v');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'video.json'), '{}');
  const plan = {thumbnail: {stamp: 'PATCH NOW · HELP OTHERS'}};
  const prof = Bm.loadProfile(r);
  assert.equal(PV.stampFor(dir, plan, prof), 'PATCH NOW · HELP OTHERS');
  PV.setStamp(dir, {mode: 'custom', text: 'UPDATE NOW · STAY SAFE'});
  assert.equal(PV.stampFor(dir, plan, prof), 'UPDATE NOW · STAY SAFE');
  PV.setStamp(dir, {mode: 'none'});
  assert.equal(PV.stampFor(dir, plan, prof), '');
  assert.throws(() => PV.setStamp(dir, {mode: 'custom', text: ' '}), /stamp text/);
  PV.setStamp(dir, {mode: 'plan'});
  assert.equal(PV.stampFor(dir, plan, {...prof, thumbnail: {stamp: 'none'}}), '');
  assert.throws(() => Bm.saveProfile(r, {name: 'X', theme: {default: ''}}), /theme/);
});

test('themes: stored in full, versioned, locked per video', async () => {
  const TH = await import('../server/themes.mjs');
  const PV = await import('../server/preview.mjs');
  const Bm = await import('../server/brand.mjs');
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-theme-'));
  const dir = path.join(r, 'v');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'video.json'), '{}');
  // nothing stored until used; then a full copy, not a name
  assert.deepEqual(TH.storedVersions(r, 'newspaper'), []);
  assert.deepEqual(TH.adoptTheme(r, 'newspaper'), {id: 'newspaper', version: 1});
  const stored = JSON.parse(fs.readFileSync(path.join(r, 'brand', 'themes', 'newspaper', 'v1.json'), 'utf8'));
  assert.equal(stored.palette.bg0, TH.BUILTIN.newspaper.palette.bg0);
  assert.equal(stored.fonts.head, 'Playfair Display');
  assert.deepEqual(TH.adoptTheme(r, 'newspaper'), {id: 'newspaper', version: 1}, 'adopting again keeps the stored copy');
  // a video locks its theme; the brand's later edits to the stored file do not reach a locked version
  PV.setTheme(r, dir, 'oldtv');
  const locked = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8')).theme;
  assert.deepEqual(locked, {id: 'oldtv', version: 1});
  assert.equal(PV.themeFor(r, {}, dir).effect.crt, true);
  // brand default, and older profiles that said scheme: light
  assert.equal(PV.themeFor(r, {}, null).id, 'dark');
  Bm.saveProfile(r, {name: 'X', scheme: 'light'});
  assert.equal(PV.themeFor(r, {}, null).id, 'light');
  assert.equal(PV.themeFor(r, {production: {theme: 'documentary'}}, null).id, 'documentary');
  // after the preview is approved the theme stays
  fs.writeFileSync(path.join(dir, 'video.json'), JSON.stringify({theme: locked, preview: {approved: {version: 1}}}));
  assert.throws(() => PV.setTheme(r, dir, 'dark'), /stays the same/);
  assert.throws(() => TH.loadTheme(r, 'newspaper', 7), /not stored/);
  assert.ok(TH.listThemes(r).some((t) => t.id === 'documentary' && t.builtin));
});

test('brand colours are tuned to read on each theme canvas', async () => {
  const B = await import('../server/brand.mjs');
  const {BUILTIN} = await import('../server/themes.mjs');
  const p = {...B.DEFAULTS, colors: {...B.DEFAULTS.colors, accent: '#FFD23F', highlight: '#7CF5FF'}};
  const paper = BUILTIN.newspaper.palette;
  const c = B.brandProps(p, BUILTIN.newspaper).colors;
  for (const k of ['accent', 'highlight']) {
    assert.ok(B.contrast(c[k], paper.bg0) >= 3 && B.contrast(c[k], paper.card) >= 3, `${k} ${c[k]} reads on paper`);
    assert.notEqual(c[k], p.colors[k]);
  }
  // a colour that already reads is left alone; the brand fill and canvas colours are never touched
  assert.equal(B.brandProps(p, BUILTIN.dark).colors.accent, '#FFD23F');
  assert.equal(c.brand, p.colors.brand);
  assert.equal(B.readableOn('#D0353B', [paper.bg0, paper.card]), '#D0353B');
  // a dark accent is lightened on a dark canvas
  const navy = B.readableOn('#1A237E', ['#0A0A0A', '#141414']);
  assert.ok(B.contrast(navy, '#0A0A0A') >= 3);
});

test('thumbnail text stays short in every language', async () => {
  const {thumbnailProblems} = await import('../server/plan-schema.mjs');
  const ok = {jargonTitle: 'PHP2Shell', urduLine: 'بڑا خطرہ،\nاور اس کا [[عملی حل]]', lines: [{lang: 'en-US', text: 'Big threat,\nand the [[real fix]]'}]};
  assert.deepEqual(thumbnailProblems({thumbnail: ok}), []);
  const long = {...ok, jargonTitle: 'Critical PHP Remote Code Execution', lines: [{lang: 'en-US', text: 'A very big threat to every website owner\nfix'}]};
  const p = thumbnailProblems({thumbnail: long});
  assert.equal(p.length, 2);
  assert.match(p[0], /title .* too long/);
  assert.match(p[1], /en-US line is too long/);
});

test('recording: script lines, takes per language, checks', async () => {
  const RC = await import('../server/recording.mjs');
  const plan = JSON.parse(fs.readFileSync(path.join('test', 'fixtures', 'sample-plan.json'), 'utf8'));
  plan.scenes[0].lines[0].layout = 'face-full';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-rec-'));
  // graphics only: every line is voice, whatever the plan says
  assert.ok(RC.scriptLines(plan, false).every((l) => l.layout === 'voice'));
  const lines = RC.scriptLines(plan, true);
  assert.equal(lines[0].key, '0-0');
  assert.equal(lines[0].layout, 'face-full');
  assert.ok(lines[0].slot > 0);

  const wav = (n = 2000) => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(n)]);
  const webm = Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.alloc(2000)]);
  assert.throws(() => RC.saveTake(dir, 'N02', 'ur-Latn', '../x', 'audio', wav()), /Unknown line/);
  assert.throws(() => RC.saveTake(dir, 'N02', 'ur-Latn', '0-0', 'audio', webm), /not a WAV/);
  RC.saveTake(dir, 'N02', 'ur-Latn', '0-0', 'audio', wav(), {dur: '3.2', peak: '0.4', trimIn: '0.3'});
  RC.saveTake(dir, 'N02', 'ur-Latn', lines[1].key, 'audio', wav(), {dur: '2', peak: '0.001'});
  assert.ok(fs.existsSync(path.join(dir, 'voiceover', 'ur-Latn', 'N02-0-0.wav')));

  let c = RC.check(lines, ['ur-Latn'], JSON.parse(fs.readFileSync(path.join(dir, 'voiceover', 'takes.json'), 'utf8')))['ur-Latn'];
  assert.ok(c.missing.includes('0-0'), 'a face line needs its camera take too');
  assert.deepEqual(c.silent, [lines[1].key]);
  RC.saveTake(dir, 'N02', 'ur-Latn', '0-0', 'camera', webm);
  assert.ok(fs.existsSync(path.join(dir, 'camera', 'N02-0-0.webm')));
  c = RC.check(lines, ['ur-Latn'], JSON.parse(fs.readFileSync(path.join(dir, 'voiceover', 'takes.json'), 'utf8')))['ur-Latn'];
  assert.ok(!c.missing.includes('0-0'));
  assert.equal(c.done, 2);

  // a dub language: its own text and takes
  RC.setText(dir, 'en-US', '0-0', 'Breaking news: two critical PHP flaws.');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'voiceover', 'en-US', 'text.json'), 'utf8'))['0-0'], 'Breaking news: two critical PHP flaws.');
  RC.deleteTake(dir, 'ur-Latn', '0-0');
  assert.ok(!fs.existsSync(path.join(dir, 'camera', 'N02-0-0.webm')));
});

test('face choice: set per video until the plan is approved', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-face-'));
  fs.writeFileSync(path.join(dir, 'video.json'), '{}');
  assert.deepEqual(V.setFace(dir, {face: true, faceAmount: 'lots', faceSeconds: 6}), {face: true, faceAmount: 'lots', faceSeconds: 6});
  fs.writeFileSync(path.join(dir, 'video.json'), JSON.stringify({face: true, plan: {approved: {version: 1}}}));
  assert.throws(() => V.setFace(dir, {face: false}), /approved/);
});

test('finish: lines as long as their longest language, voice tracks and subtitles', async () => {
  const FN = await import('../server/finish.mjs');
  const plan = {scenes: [{title: 'A', lines: [{vo: 'one two three', start: 0.6, end: 2.2}, {vo: 'four', start: 2.65, end: 4.25}]}], duration: 5};
  const takes = {ur: {'0-0': {dur: 2, peak: 0.5}, '0-1': {dur: 0.5, peak: 0.5}}, en: {'0-0': {dur: 2.8, peak: 0.5}}};
  const t = FN.retime(plan, ['ur', 'en'], takes);
  const p = FN.PACE;
  assert.equal(t.lines['0-0'].start, p.sceneIn);
  assert.equal(t.lines['0-0'].longest, 'en');
  assert.ok(Math.abs(t.lines['0-0'].end - (p.sceneIn + 2.8 + p.breath)) < 1e-6);
  assert.ok(Math.abs(t.lines['0-1'].end - t.lines['0-1'].start - p.minLine) < 1e-6); // short take: minimum window
  assert.ok(Math.abs(t.duration - (t.lines['0-1'].end + p.sceneOut)) < 1e-6);
  const timed = FN.timedPlan(plan, t);
  assert.equal(timed.scenes[0].lines[1].start, t.lines['0-1'].start);
  // WAV round trip and subtitles
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cs-fin-')), 'x.wav');
  FN.writeWav(f, new Float32Array([0, 0.5, -0.5]), 16000);
  const w = FN.readWav(f);
  assert.equal(w.rate, 16000);
  assert.ok(Math.abs(w.data[1] - 0.5) < 1e-3);
  const cues = FN.cuesFor('word '.repeat(30).trim(), 1, 7);
  assert.ok(cues.length >= 2 && cues.every((c) => c.text.split('\n').every((r) => r.length <= 42)));
  assert.equal(cues[0].start, 1);
  assert.ok(Math.abs(cues.at(-1).end - 7) < 1e-6);
  assert.match(FN.srt(cues), /^1\n00:00:01,000 --> /);
  // the description's chapters follow the voices (first at 0:00); other sections are kept
  const vd = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-yt-'));
  fs.mkdirSync(path.join(vd, 'youtube'));
  const md = '# T\n\nx\n\n## Chapters\n0:00 A\n0:40 B\n\n## Sources\n- s1\n\n_Draft from plan v1 (d). Chapters use estimated timings until the voice is recorded._\n';
  fs.writeFileSync(path.join(vd, 'youtube', 'ur-Latn.md'), md);
  FN.timeDescriptions(vd, {scenes: [{title: 'A'}, {title: 'B'}]}, {scenes: [{start: 0.4}, {start: 75.2}]});
  const out = fs.readFileSync(path.join(vd, 'youtube', 'ur-Latn.md'), 'utf8');
  assert.match(out, /## Chapters\n0:00 A\n1:15 B\n\n## Sources\n- s1\n/);
  assert.match(out, /Chapters timed to the recorded voice\./);
  assert.deepEqual(Object.keys(FN.SIZES), ['1080', '1440', '2160']);
});

test('cutout styles: the brand keeps some, the director rotates through them', async () => {
  const CU = await import('../server/cutouts.mjs');
  const {direct} = await import('../server/director.mjs');
  const {withTiming} = await import('../server/plan-schema.mjs');
  assert.deepEqual(CU.cleanCutouts({ref: ['torn', 'nope', 'slam'], map: [], bogus: ['x']}), {ref: ['torn', 'slam']});
  const st = CU.styler({cutouts: {ref: ['torn', 'slam']}});
  assert.deepEqual([st('ref'), st('ref'), st('ref'), st('place')], ['torn', 'slam', 'torn', 'tactical']);
  assert.equal(st('stat'), undefined);
  const plan = withTiming(JSON.parse(fs.readFileSync(new URL('../assets/sample-plan.json', import.meta.url))));
  const ins = direct(plan, os.tmpdir(), {style: CU.styler({cutouts: {keyword: ['box']}})});
  assert.ok(ins.length >= 4);
  assert.ok(ins.filter((x) => x.kind === 'keyword').every((x) => x.style === 'box'));
  assert.ok(ins.filter((x) => x.kind === 'ref').every((x) => CU.CATEGORIES[0].styles.some((s) => s.id === x.style)));
  // placement: full screen unless the brand sets a category "over"; date stamps sit over the scene
  assert.deepEqual(CU.cleanPlaces({keyword: 'over', map: 'full', bogus: 'over'}), {keyword: 'over'});
  const pl = CU.placer({cutoutPlace: {keyword: 'over'}});
  assert.deepEqual([pl('keyword'), pl('place'), pl('ref'), pl('stat'), pl('date')], ['over', 'full', 'full', 'full', 'over']);
  const placed = direct(plan, os.tmpdir(), {style: CU.styler({}), place: pl});
  assert.ok(placed.every((x) => x.place === pl(x.kind)));
});

test('creator media: matched to lines by name, audio pauses the voice', async () => {
  const MD = await import('../server/media.mjs');
  const {withTiming} = await import('../server/plan-schema.mjs');
  const plan = {scenes: [{title: 'A', lines: [{vo: 'Karachi mein "flood" aaya', layout: 'voice'}, {vo: 'Minister ne phone par kaha', layout: 'voice'}, {vo: 'Karachi flood street', layout: 'face-full'}]}]};
  const items = [{name: 'karachi-flood-street.mp4', kind: 'video', dur: 5, words: MD.words('karachi-flood-street.mp4')}, {name: 'minister-phone-call.m4a', kind: 'audio', dur: 6, words: MD.words('minister-phone-call.m4a')}];
  const m = MD.match(plan, items);
  assert.equal(m['0-0'].name, 'karachi-flood-street.mp4'); // never the face moment, even with more words
  assert.equal(m['0-1'].name, 'minister-phone-call.m4a');
  const timed = withTiming(MD.withPauses(plan, items));
  const plain = withTiming(plan);
  assert.ok(Math.abs(timed.scenes[0].lines[2].start - plain.scenes[0].lines[2].start - 6.4) < 0.02);
  assert.equal(MD.kindOf('a.JPG'), 'image');
  assert.equal(MD.kindOf('a.txt'), null);
});

test('remote documentary kit: hosts, plan shape, footage slots, travel styles', async () => {
  const K = await import('../server/kits.mjs');
  const {planSchema, richnessProblems} = await import('../server/plan-schema.mjs');
  const {numberSlots} = await import('../server/planner.mjs');
  const FT = await import('../server/footage.mjs');
  const CU = await import('../server/cutouts.mjs');
  const {scriptLines, hostVoices} = await import('../server/recording.mjs');

  // hosts: 1 to 3, names cleaned, one gender each, no repeats
  const hosts = K.cleanHosts([{name: ' Sara<> ', gender: 'female'}, {name: 'Omar', gender: 'male'}, {name: 'sara', gender: 'male'}, {name: 'Ali', gender: 'x'}, {name: 'Zed'}]);
  assert.deepEqual(hosts, [{name: 'Sara', gender: 'female'}, {name: 'Omar', gender: 'male'}, {name: 'Ali', gender: ''}]);
  assert.deepEqual(K.speakersOf(hosts.slice(0, 2)), ['Sara', 'Omar', 'all']);
  assert.equal(K.kitOf({kit: 'travel-doc'}).id, 'travel-doc');
  assert.equal(K.kitOf({}).id, 'news');

  // the travel schema: kit scenes, a speaker per line, the studio layout and the travel graphics
  const tax = loadTaxonomy(root);
  const schema = JSON.stringify(planSchema(tax, {kit: K.KITS['travel-doc'], hosts: hosts.slice(0, 2)}));
  for (const w of ['"speaker"', '"studio"', '"footage"', '"weather"', '"phrases"', '"rating"', 'geography', 'itinerary']) assert.ok(schema.includes(w), w);
  assert.ok(!JSON.stringify(planSchema(tax)).includes('"weather"'));

  // the sample plan: footage shots numbered by line, then by shot
  const sample = numberSlots(JSON.parse(fs.readFileSync(new URL('../assets/sample-travel.json', import.meta.url), 'utf8')));
  const shots = FT.slots(sample);
  assert.ok(shots.length >= 3);
  assert.match(shots[0].slot, /^F\d{2}-1$/);
  assert.ok(shots.every((x) => x.query));
  assert.ok(!richnessProblems(sample).some((p) => /speaker/i.test(p)), richnessProblems(sample).join('; '));

  // the creator's files fill slots by name
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-'));
  FT.save(dir, shots[0].slot, 'my clip.mp4', Buffer.from('x'));
  fs.writeFileSync(path.join(FT.footageDir(dir), `${shots[1].slot}-rialto.jpg`), 'x');
  const st = FT.status(dir, sample);
  assert.equal(st.filled, 2);
  assert.equal(st.slots[1].kind, 'image');
  FT.remove(dir, shots[0].slot);
  assert.equal(FT.status(dir, sample).filled, 1);
  assert.throws(() => FT.save(dir, 'F01-1', 'notes.txt', Buffer.from('x')));
  assert.equal(FT.pickFile({video_files: [{file_type: 'video/mp4', width: 3840, height: 2160}, {file_type: 'video/mp4', width: 1920, height: 1080}, {file_type: 'video/mp4', width: 1080, height: 1920}]}).width, 1920);

  // travel graphics get the brand's kept styles, in rotation; news plans are left as they are
  const styled = CU.styleGraphics(sample, {cutouts: {weather: ['app']}});
  const gs = styled.scenes.flatMap((s) => s.lines.map((l) => l.graphic)).filter(Boolean);
  assert.ok(gs.filter((g) => g.type === 'weather').every((g) => g.style === 'app'));
  assert.ok(gs.filter((g) => ['map', 'route', 'tiers', 'phrases', 'dosdonts', 'rating', 'footage'].includes(g.type)).every((g) => g.style));
  assert.equal(CU.styleGraphics({...sample, kit: undefined}, {}).scenes[0].lines[0].graphic?.style, sample.scenes[0].lines[0].graphic?.style);
  // a look the creator's plan asked for wins over the rotation; an unknown one is ignored
  const asked = structuredClone(sample);
  const wx = asked.scenes.flatMap((s) => s.lines).filter((l) => l.graphic?.type === 'weather');
  wx[0].graphic.style = 'weather:calendar';
  const mp = asked.scenes.flatMap((s) => s.lines).find((l) => l.graphic?.type === 'map');
  mp.graphic.style = 'map:nope';
  const out = CU.styleGraphics(asked, {cutouts: {weather: ['app']}}).scenes.flatMap((s) => s.lines);
  assert.equal(out.find((l) => l.graphic?.type === 'weather').graphic.style, 'calendar');
  assert.ok(CU.CATEGORIES.find((c) => c.id === 'travelmap').styles.some((x) => x.id === out.find((l) => l.graphic?.type === 'map').graphic.style));
  assert.ok(schema.includes('"map:atlas"') && schema.includes('"weather:calendar"'));
  // a road trip (made-up road, real stops and key areas) gets one of its own map styles
  const rt = gs.find((g) => g.type === 'roadtrip');
  assert.ok(rt && rt.items.every((it) => /-?\d+(\.\d+)?\s*,\s*-?\d+/.test(it.detail)));
  assert.ok(CU.CATEGORIES.find((c) => c.id === 'roadtrip').styles.some((x) => x.id === rt.style));
  assert.ok(schema.includes('"roadtrip:nav"'));

  // recording: each line says who speaks; each host gets a dub voice of their gender, not shared
  assert.ok(scriptLines(sample, true).every((l) => typeof l.speaker === 'string'));
  const list = [{name: 'tr-TR-EmelNeural', locale: 'tr-TR', gender: 'Female'}, {name: 'tr-TR-AhmetNeural', locale: 'tr-TR', gender: 'Male'}, {name: 'en-US-AvaNeural', locale: 'en-US', gender: 'Female'}];
  const hv = hostVoices('tr', [{name: 'Sara', gender: 'female'}, {name: 'Omar', gender: 'male'}, {name: 'Ayla', gender: 'female'}], {Ayla: {voice: 'tr-TR-EmelNeural'}}, list, 'tr-TR-EmelNeural');
  assert.equal(hv.Omar.voice, 'tr-TR-AhmetNeural');
  assert.equal(hv.Ayla.voice, 'tr-TR-EmelNeural');
  assert.notEqual(hv.Sara.voice, 'tr-TR-EmelNeural');
});

test('edited video assets: ids, what the probe reads, scene changes, sound', async () => {
  const AS = await import('../server/assets.mjs');
  assert.equal(AS.idFor('IMG_2045.MOV', new Set()), 'img-2045');
  assert.equal(AS.idFor('IMG 2045.mov', new Set(['img-2045'])), 'img-2045-2');
  assert.equal(AS.kindOf('a.HEIC'), 'image');
  assert.equal(AS.kindOf('a.mp4.uploading'), null);
  // a phone clip on its side, HDR (HLG), with the place it was filmed
  const p = AS.probeInfo({format: {duration: '12.5', tags: {'com.apple.quicktime.location.ISO6709': '+36.3167+074.6500+2400/'}}, streams: [{codec_type: 'video', width: 3840, height: 2160, avg_frame_rate: '30000/1001', color_transfer: 'arib-std-b67', side_data_list: [{rotation: -90}]}, {codec_type: 'audio'}]});
  assert.deepEqual([p.w, p.h, p.fps, p.hdr, p.audio, p.dur], [2160, 3840, 29.97, true, true, 12.5]);
  assert.deepEqual(p.place, {lat: 36.3167, lon: 74.65});
  // tiny frames: a cut at 2 s (the jump to dark at 3 s is too soon after it for a new scene), a dark stretch from 3 s
  const fr = (v) => new Uint8Array(576).fill(v);
  const frames = [...Array(4).fill(fr(120)), ...Array(2).fill(fr(200)), ...Array(4).fill(fr(5))];
  const sc = AS.scenesFrom(frames);
  assert.deepEqual(sc.cuts, [0, 2]);
  assert.deepEqual(sc.dark, [[3, 5]]);
  // sound only where it is loud enough
  const s = new Float32Array(8000 * 2);
  for (let i = 8000; i < 16000; i++) s[i] = Math.sin(i / 3) * 0.3;
  const w = AS.waveFrom(s, 8000);
  assert.equal(w.peaks.length, 40);
  assert.deepEqual(w.sound, [[1, 2]]);
});

test('edit timeline: clean, layout, split', async () => {
  const ED = await import('../server/edit.mjs');
  const UI = await import('../public/edit.js');
  const assets = [{id: 'drive', kind: 'video', dur: 100, ready: true}, {id: 'fort', kind: 'image', ready: true}, {id: 'note', kind: 'audio', dur: 8, ready: true}, {id: 'later', kind: 'video', dur: 9, ready: false}];
  const e = ED.clean({
    scenes: [{id: 'hook', title: 'Hook'}],
    main: [
      {id: 'a', kind: 'video', asset: 'drive', in: 10, out: 20, speed: 2, scene: 'hook'},
      {id: 'b', kind: 'image', asset: 'fort', dur: 3, scene: 'nope'},
      {id: 'c', kind: 'gap', dur: 2.5, note: 'the bridge'},
      {id: 'd', kind: 'video', asset: 'later', in: 0, out: 5}, // not processed yet: dropped
      {id: 'e', kind: 'audio', asset: 'note', in: 0, out: 8}, // sound only cannot go on the video track
      {id: 'a', kind: 'video', asset: 'drive', in: -5, out: 500, volume: 9}, // clamped, id made unique
    ],
    voice: [{id: 'v', kind: 'audio', asset: 'note', in: 1, out: 7, at: 4, speaker: 'Aqsa'}],
    music: [], over: [],
  }, assets);
  assert.deepEqual(e.main.map((c) => c.kind), ['video', 'image', 'gap', 'video']);
  assert.equal(e.main[0].scene, 'hook');
  assert.equal(e.main[1].scene, undefined);
  assert.deepEqual([e.main[3].in, e.main[3].out, e.main[3].volume], [0, 100, 2]);
  assert.notEqual(e.main[3].id, 'a');
  assert.equal(ED.clipDur(e.main[0]), 5); // 10 s at double speed
  const lay = ED.layoutOf(e);
  assert.deepEqual(lay.starts, [0, 5, 8, 10.5]);
  assert.equal(lay.duration, 110.5);
  // the editor's split keeps both halves on the same seconds of the original
  const it = UI.itemsOf(e, 'main')[0];
  const [x, y] = UI.splitClip(it, 2);
  assert.deepEqual([x.in, x.out, y.in, y.out], [10, 14, 14, 20]);
  assert.equal(UI.splitClip(it, 0.01), null);
  const [p, q] = UI.splitClip(UI.itemsOf(e, 'voice')[0], 6);
  assert.deepEqual([p.in, p.out, q.in, q.out, q.at], [1, 3, 3, 7, 6]);
});

test('first cut: the cut becomes the timeline', async () => {
  const CT = await import('../server/cut.mjs');
  const ED = await import('../server/edit.mjs');
  const assets = [{id: 'drive', kind: 'video', dur: 60, w: 1920, h: 1080, ready: true}, {id: 'tall', kind: 'video', dur: 10, w: 1080, h: 1920, ready: true}, {id: 'fort', kind: 'image', w: 4000, h: 3000, ready: true}];
  const g = {type: 'title', kicker: '', title: '', items: [], lines: [], stamp: '', highlights: [], sourceId: ''};
  const beat = (o) => ({kind: 'clip', asset: '', in: 0, out: 0, dur: 0, sound: 'mute', vo: {speaker: '', text: ''}, graphic: g, note: '', ...o});
  const cut = {scenes: [
    {title: 'Hook', beats: [
      beat({asset: 'drive', in: 2, out: 3, sound: 'under', vo: {speaker: 'Aqsa', text: 'Subah paanch baje hum Gilgit se nikle aur aage sirf pahar the'}}),
      beat({kind: 'photo', asset: 'fort', dur: 4}),
      beat({asset: 'tall', in: 1, out: 8, sound: 'own'}),
    ]},
    {title: 'Road', beats: [
      beat({kind: 'graphic', dur: 6, graphic: {...g, type: 'roadtrip', title: 'Gilgit → Karimabad', items: [{label: 'Gilgit', value: '', detail: '35.92, 74.31', tone: 'neutral'}]}, note: 'the drive'}),
      beat({kind: 'camera', dur: 3, vo: {speaker: 'Bilal', text: 'Comment mein batayein'}}),
      beat({kind: 'gap', dur: 4, note: 'the tea seller'}),
      beat({asset: 'missing', in: 0, out: 5}),
    ]},
  ]};
  const e = ED.clean(CT.toEdit(cut, assets), assets);
  assert.deepEqual(e.main.map((c) => c.kind), ['video', 'image', 'video', 'graphic', 'gap', 'gap', 'gap']);
  // the clip under a voice-over line grows to fit the line (11 words at 2.6 a second)
  assert.equal(e.main[0].out, 2 + CT.voDur('Subah paanch baje hum Gilgit se nikle aur aage sirf pahar the'));
  assert.equal(e.main[0].volume, 0.25);
  assert.equal(e.main[2].fit, 'blur'); // a vertical phone clip
  assert.equal(e.main[3].graphic.type, 'roadtrip');
  assert.equal(e.main[4].camera, true);
  assert.equal(e.main[4].speaker, 'Bilal');
  assert.equal(e.main[6].note, 'A clip is needed here'); // a clip that is not in the footage
  assert.deepEqual(e.voice.map((c) => [c.kind, c.at, c.speaker]), [['line', 0, 'Aqsa']]);
  assert.deepEqual(e.scenes.map((s) => s.title), ['Hook', 'Road']);
  assert.equal(new Set(e.main.slice(0, 3).map((c) => c.scene)).size, 1);
  // the schema Claude answers with is strict-shaped
  const sc = CT.cutSchema(['Aqsa', 'Bilal']);
  assert.equal(sc.additionalProperties, false);
  assert.deepEqual(sc.properties.scenes.items.properties.beats.items.properties.vo.properties.speaker.enum, ['', 'Aqsa', 'Bilal']);
});

test('graphics on the timeline: brand styles, what each piece draws, Claude\'s answers', async () => {
  const ED = await import('../server/edit.mjs');
  const PC = await import('../server/pieces.mjs');
  const profile = {cutouts: {roadtrip: ['journal', 'nav'], keyword: ['box'], clip: ['tv']}, cutoutPlace: {keyword: 'over'}};
  const g = {type: 'roadtrip', kicker: '', title: 'Gilgit → Karimabad', items: [], lines: [], stamp: '', highlights: [], sourceId: ''};
  const assets = [{id: 'drive', kind: 'video', ready: true, dur: 60, proxy: 'edit/proxy/drive.mp4'}];
  const e = ED.clean({
    main: [
      {id: 'm1', kind: 'graphic', dur: 5, graphic: g},
      {id: 'm2', kind: 'graphic', dur: 5, graphic: {...g, style: 'atlas'}}, // a style the creator picked stays
      {id: 'm3', kind: 'graphic', dur: 5, graphic: g},
      {id: 'm4', kind: 'video', asset: 'drive', in: 4, out: 9, look: {label: 'KKH'}},
    ],
    over: [
      {id: 'o1', kind: 'graphic', at: 1, dur: 3, cutout: {kind: 'keyword', text: 'KKH', bogus: 'x', place: 'nowhere'}},
      {id: 'o2', kind: 'graphic', at: 6, dur: 3, cutout: {kind: 'stat', value: '2,500 m'}},
      {id: 'o3', kind: 'graphic', at: 9, dur: 3, cutout: {kind: 'nonsense'}, prompt: 'an idea'},
    ],
  }, assets);
  assert.equal(e.over[0].cutout.bogus, undefined);
  assert.equal(e.over[0].cutout.place, undefined); // unknown place: the brand decides
  assert.equal(e.over[2].cutout, undefined);
  const s = PC.assignStyles(e, profile);
  assert.deepEqual(s.main.slice(0, 3).map((c) => c.graphic.style), ['nav', 'atlas', 'journal']);
  assert.equal(s.main[3].look.style, 'tv');
  assert.deepEqual([s.over[0].cutout.style, s.over[0].cutout.place], ['box', 'over']);
  assert.equal(s.over[1].cutout.place, 'full'); // stat: one look, full screen
  // the same edit keeps its styles the next time
  assert.deepEqual(PC.assignStyles(JSON.parse(JSON.stringify(s)), profile), s);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const g1 = PC.specOf(s.main[0], 'main', byId);
  assert.deepEqual([g1.dur, g1.alpha, g1.piece.graphic.style], [5, false, 'nav']);
  const look = PC.specOf(s.main[3], 'main', byId);
  assert.deepEqual([look.piece.insert.kind, look.piece.insert.start, look.piece.insert.place, look.src.asset], ['clip', 4, 'full', 'drive']);
  assert.equal(PC.specOf(s.over[0], 'over', byId).alpha, true); // over the footage: see-through
  assert.equal(PC.specOf(s.over[1], 'over', byId).alpha, false);
  assert.equal(PC.specOf(s.over[2], 'over', byId), null); // an idea, nothing drawn yet
  assert.deepEqual(PC.pending(s).map(({c}) => c.id), ['o3']);
  // Claude's answer, cleaned; a graphic answer needs a type
  const res = PC.answersOf({graphics: [
    {id: 'o3', kind: 'cutout', graphic: {type: 'title'}, cutout: {kind: 'stat', place: '', value: '1,300 km', label: 'KKH', text: '', places: []}, seconds: 4},
    {id: 'x', kind: 'graphic', graphic: {}, seconds: 50},
  ]});
  assert.deepEqual(res, {o3: {cutout: {kind: 'stat', value: '1,300 km', label: 'KKH'}, dur: 4}});
  assert.equal(PC.graphicsSchema().additionalProperties, false);
});

test('sound and colour: noise cleanup, levelling, music under voices, grades', async () => {
  const DSP = await import('../server/dsp.mjs');
  const SO = await import('../server/sound.mjs');
  const MX = await import('../public/mix.js');
  const ED = await import('../server/edit.mjs');
  // a tone in steady noise: the noise between the words drops, the tone stays
  const r = 48000;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  const x = new Float32Array(r * 3).map((_, i) => (i > r && i < 2 * r ? 0.3 * Math.sin((2 * Math.PI * 440 * i) / r) : 0) + 0.05 * rnd());
  const y = DSP.denoise(x, r, 'medium');
  const rms = (a, s, e) => Math.sqrt(a.slice(s, e).reduce((q, v) => q + v * v, 0) / (e - s));
  assert.ok(rms(y, 0, r) < rms(x, 0, r) / 2.5);
  assert.ok(Math.abs(rms(y, 1.2 * r, 1.8 * r) - rms(x, 1.2 * r, 1.8 * r)) < 0.01);
  // loudness from ffmpeg's loudnorm report, and the volume that reaches the target
  assert.equal(SO.loudnessOf('[Parsed_loudnorm_0]\n{\n\t"input_i" : "-24.00",\n\t"input_tp" : "-3.1"\n}'), -24);
  assert.equal(SO.loudnessOf('{"input_i" : "-inf"}'), null);
  assert.equal(SO.volumeFor(-24, -16), 2); // capped at 200%
  assert.equal(SO.volumeFor(-10, -16), 0.5);
  // music goes down while someone talks, with ramps
  assert.ok(Math.abs(MX.duckAt(5, [[4, 6]], MX.DUCK.strong) - 0.3) < 1e-9);
  assert.equal(MX.duckAt(10, [[4, 6]], MX.DUCK.strong), 1);
  assert.ok(MX.duckAt(6.25, [[4, 6]], MX.DUCK.strong) > 0.3 && MX.duckAt(6.25, [[4, 6]], MX.DUCK.strong) < 1);
  assert.equal(MX.duckAt(5, [[4, 6]], MX.DUCK.off), 1);
  const items = (e, k) => (k === 'main' ? e.main.map((c, i) => ({c, start: i * 10, end: i * 10 + 10})) : e[k].map((c) => ({c, start: c.at, end: c.at + c.dur})));
  const talk = MX.talkIntervals({main: [{kind: 'video', asset: 'v', in: 2, out: 12, volume: 1}], over: [], voice: [{kind: 'line', at: 20, dur: 3}]}, new Map([['v', {sound: [[0, 5], [8, 9]]}]]), items);
  assert.deepEqual(talk, [[0, 3], [6, 7], [20, 23]]);
  // grades: cleaned, and drawn the same everywhere
  assert.deepEqual(MX.cleanGrade({exposure: 5, saturation: -0.333, look: 'moody', junk: 1}), {look: 'moody', exposure: 2, saturation: -0.33});
  assert.equal(MX.cleanGrade({exposure: 0}), null);
  assert.equal(MX.gradeParts({}).css, 'brightness(1) contrast(1) saturate(1)');
  assert.equal(MX.gradeParts({}).matrix, '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0');
  const warm = MX.gradeParts({temperature: 1}).matrix.split(' ').map(Number);
  assert.ok(warm[0] > 1 && warm[12] < 1); // more red, less blue
  const assets = [{id: 'v', kind: 'video', dur: 30, ready: true}, {id: 'm', kind: 'audio', dur: 60, ready: true}];
  const e = ED.clean({main: [{id: 'a', kind: 'video', asset: 'v', in: 0, out: 5, clean: 'strong', grade: {temperature: 0.4}}], music: [{id: 'b', kind: 'audio', asset: 'm', in: 0, out: 60, at: 0, duck: 'light', clean: 'loud'}]}, assets);
  assert.deepEqual([e.main[0].clean, e.main[0].grade], ['strong', {temperature: 0.4}]);
  assert.deepEqual([e.music[0].duck, e.music[0].clean], ['light', undefined]);
});

test('edit render: what is left, subtitles, chapters', async () => {
  const ER = await import('../server/editrender.mjs');
  const edit = {
    scenes: [{id: 's1', title: 'Hook'}, {id: 's2', title: 'The drive'}],
    main: [
      {id: 'a', kind: 'gap', dur: 5, scene: 's1', note: 'sunrise'},
      {id: 'b', kind: 'graphic', dur: 6, scene: 's2', prompt: 'map'},
      {id: 'c', kind: 'gap', dur: 4, scene: 's2', camera: true, speaker: 'Hina'},
    ],
    over: [], music: [],
    voice: [{id: 'v', kind: 'line', at: 1, dur: 4, speaker: 'Aqsa', text: 'Subah paanch baje Gilgit se nikle. Aage sirf pahar the, aur sadak kabhi khatam nahi hoti thi, bas modh aur modh aur modh.'}],
  };
  assert.deepEqual(ER.todo(edit), ['1 space still wait for a clip', '1 piece to camera not recorded', '1 voice-over line not recorded', '1 graphic not written yet']);
  const srt = ER.srtOf('/nonexistent', edit);
  assert.match(srt, /^1\n00:00:01,000 --> 00:00:0\d,\d{3}\nSubah/);
  assert.match(srt, /\n2\n.*--> 00:00:05,000\n/); // a long line is split, the last cue ends with the line
  assert.equal(ER.chaptersOf(edit), '0:00 Hook\n0:05 The drive');
  assert.deepEqual(ER.itemsOf(edit, 'main').map((x) => [x.start, x.end]), [[0, 5], [5, 11], [11, 15]]);
});

test('any creator: renderer in the app, own taxonomy, beds, channel folder, updates', async () => {
  const {rendererDir, APP_DIR} = await import('../server/workspace.mjs');
  const UP = await import('../server/update.mjs');
  const PV = await import('../server/preview.mjs');
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-new-'));
  // no studio/ in the channel: the app's engine/ renders
  assert.equal(rendererDir(fresh), path.join(APP_DIR, 'engine'));
  fs.mkdirSync(path.join(fresh, 'studio'));
  assert.equal(rendererDir(fresh), path.join(fresh, 'studio'));
  fs.rmSync(path.join(fresh, 'studio'), {recursive: true});
  // brand files come from the channel folder into the renderer's public folder
  fs.mkdirSync(path.join(fresh, 'brand'));
  fs.writeFileSync(path.join(fresh, 'brand', 'profile.json'), JSON.stringify({name: 'Wander', logo: {main: 'brand/test-logo-x.png'}, presenter: {photo: '../secret.png'}}));
  fs.writeFileSync(path.join(fresh, 'brand', 'test-logo-x.png'), 'png');
  const pub = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-pub-'));
  PV.syncBrandFiles(fresh, pub);
  assert.equal(fs.readFileSync(path.join(pub, 'public', 'brand', 'test-logo-x.png'), 'utf8'), 'png');
  assert.ok(!fs.existsSync(path.join(pub, 'secret.png'))); // never outside the channel folder
  // a channel's own taxonomy replaces the starting one; hashtag edits stay in the same file
  assert.ok(!loadTaxonomy(fresh).own);
  fs.writeFileSync(path.join(fresh, 'brand', 'taxonomy.json'), JSON.stringify({order: ['topic'], fields: {topic: {label: 'Topic', rule: 'min1', values: [{value: 'Mountains'}]}}, standards: [], formats: {}}));
  setHashtag(fresh, 'topic', 'Mountains', 'mountains pk');
  const own = loadTaxonomy(fresh);
  assert.ok(own.own);
  assert.deepEqual(own.fields.topic.values, [{value: 'Mountains', hashtag: '#mountainspk'}]);
  // the app's music beds, for a channel without its own
  const beds = P.listBeds(fresh);
  assert.ok(beds.length >= 1 && beds.every((b) => b.mp3.startsWith('eng/audio/beds/')));
  // versions
  assert.equal(UP.compareVersions('1.2.10', '1.2.9'), 1);
  assert.equal(UP.compareVersions('1.0', '1.0.0'), 0);
  assert.equal(UP.compareVersions('0.9.9', '1.0.0'), -1);
  assert.match(UP.currentVersion(), /^\d+\.\d+\.\d+$/);
});

test('command line for project threads: quick steps only, links', async () => {
  const {spawnSync} = await import('node:child_process');
  const {APP_DIR} = await import('../server/workspace.mjs');
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-cli-'));
  const cli = (...args) => JSON.parse(spawnSync(process.execPath, [path.join(APP_DIR, 'cli.mjs'), ...args], {env: {...process.env, CS_ROOT: fresh}, encoding: 'utf8'}).stdout);
  assert.equal(cli('GET', '/api/state').root, fresh);
  assert.match(cli('POST', '/api/playlists/x/videos/A01-y/preview').error, /runs in the app only/);
  assert.equal(cli('links', 'mountains', 'M01-hunza').record, 'http://127.0.0.1:4330/#/p/mountains/v/M01-hunza/record');
});

test('per video: kit, format and hosts follow the playlist unless the video sets its own', async () => {
  const K = await import('../server/kits.mjs');
  const slug = 'cybersecurity';
  const pdir = path.join(root, 'playlists', slug);
  const pl = P.loadPlaylist(root, tax, slug);

  // nothing set: the playlist's
  const same = K.forVideo(tax, pl, {});
  assert.equal(same.kit, 'news');
  assert.deepEqual(same.own, {kit: false, format: false, hosts: false});
  // a format with no defined flow is refused; an unknown one falls back to the playlist's
  assert.equal(K.forVideo(tax, pl, {format: 'Explainer'}).flow, 'not yet defined');
  assert.equal(K.forVideo(tax, pl, {format: 'Nope'}).format, pl.format);
  assert.throws(() => V.createVideo(root, tax, pl, pdir, {title: 'x', concept: 'y', format: 'Explainer'}), /not defined/);

  // a travel video inside a News playlist, with two hosts
  assert.throws(() => V.createVideo(root, tax, pl, pdir, {title: 'Hunza', kit: 'travel-doc'}), /hosts/);
  const v = V.createVideo(root, tax, pl, pdir, {title: 'Hunza', kit: 'travel-doc', hosts: [{name: 'Sara', gender: 'female'}, {name: 'Omar', gender: 'male'}]});
  const dir = path.join(pdir, v.folder);
  const j = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
  assert.equal(j.kit, 'travel-doc');
  assert.equal(j.hosts.length, 2);
  assert.equal(j.face, true);
  const eff = K.forVideo(tax, pl, j);
  assert.equal(eff.kit, 'travel-doc');
  assert.ok(eff.own.kit && eff.own.hosts);

  // change it before the plan: one host, then back to the playlist's
  assert.equal(V.setVideoSetup(tax, pl, dir, {hosts: [{name: 'Sara', gender: 'female'}]}).hosts.length, 1);
  assert.throws(() => V.setVideoSetup(tax, pl, dir, {kit: 'travel-edit'}), /made differently/);
  const back = V.setVideoSetup(tax, pl, dir, {kit: null, hosts: null});
  assert.equal(back.kit, 'news');
  const j2 = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
  assert.ok(!('kit' in j2) && !('hosts' in j2));

  // fixed once the plan is approved
  fs.writeFileSync(path.join(dir, 'video.json'), JSON.stringify({...j2, plan: {approved: true}}));
  assert.throws(() => V.setVideoSetup(tax, pl, dir, {format: 'News'}), /approved/);
  fs.rmSync(dir, {recursive: true});
});
