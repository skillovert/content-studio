// Content Studio: local web app for a creator's channel folder.
//   node server/index.mjs            -> http://127.0.0.1:4330 (opens the browser)
// Listens on 127.0.0.1 only; nothing is online. Reads and writes the channel folder found by findRoot().
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {exec} from 'node:child_process';
import {APP_DIR, findRoot, readJson} from './workspace.mjs';
import * as B from './brand.mjs';
import * as TH from './themes.mjs';
import * as SM from './samples.mjs';
import * as UP from './update.mjs';
import {loadTaxonomy, setHashtag, applicableStandards, hashtagsFor, cardProblems} from './taxonomy.mjs';
import * as P from './playlists.mjs';
import * as V from './videos.mjs';
import * as PL from './planner.mjs';
import * as PV from './preview.mjs';
import * as RC from './recording.mjs';
import * as FN from './finish.mjs';
import * as AS from './assets.mjs';
import * as ED from './edit.mjs';
import * as SP from './speech.mjs';
import * as CT from './cut.mjs';
import * as PC from './pieces.mjs';
import * as SO from './sound.mjs';
import * as ER from './editrender.mjs';
import * as MD from './media.mjs';
import * as FT from './footage.mjs';
import {kitList, LENGTHS, forVideo} from './kits.mjs';
import * as CU from './cutouts.mjs';
import {publicSettings, saveSettings, pexelsKey, apiKey} from './settings.mjs';

const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf', '.json': 'application/json'};

/** opts.routesOnly: the API routes alone, for the command line (cli.mjs); opts.noJobs: never start a render. */
export function createServer(root = findRoot(), opts = {}) {
  const tax = () => loadTaxonomy(root);
  const pdir = (slug) => path.join(P.playlistsDir(root), slug);
  // playlist + video + folder, for the plan routes
  const ctx = (m) => {
    const t = tax();
    const dir = path.join(pdir(m[1]), m[2]);
    // the playlist as this video sees it (its own kit, format and hosts when it sets them)
    const playlist = forVideo(t, P.loadPlaylist(root, t, m[1]), readJson(path.join(dir, 'video.json'), {}));
    const video = V.getVideo(root, t, pdir(m[1]), m[2]);
    return {t, playlist, video, dir};
  };

  // the approved plan, with a pause after each line whose audio clip (the creator's media) plays there
  const approvedPlan = (dir) => {
    const v = PL.status(dir).approved?.version;
    const plan = v ? readJson(path.join(dir, 'plan', `plan-v${v}.json`)) : null;
    return plan ? MD.withPauses(plan, MD.list(dir)) : null;
  };

  // media list + which line each file goes on (by the plan's words) + whether the preview already used it
  const mediaStatus = (c) => {
    const items = MD.list(c.dir);
    const v = PL.status(c.dir).approved?.version;
    const plan = v ? readJson(path.join(c.dir, 'plan', `plan-v${v}.json`)) : null;
    const where = plan ? MD.match(plan, items) : {};
    const lineOf = Object.fromEntries(Object.entries(where).map(([k, it]) => {
      const [si, li] = k.split('-').map(Number);
      return [it.name, {key: k, scene: plan.scenes[si]?.title, vo: plan.scenes[si]?.lines[li]?.vo}];
    }));
    return {items: items.map((it) => ({...it, line: lineOf[it.name] || null, url: `/ws/${path.relative(root, path.join(c.dir, 'media', it.name)).split(path.sep).map(encodeURIComponent).join('/')}`})), planApproved: Boolean(plan), previewApproved: Boolean(PV.status(c.dir).approved)};
  };

  // footage slots of the approved plan (else the newest plan), with the files that fill them
  const footageStatus = (c) => {
    const plan = approvedPlan(c.dir) || PL.status(c.dir).plan;
    const st = FT.status(c.dir, plan, {hasPexels: Boolean(pexelsKey())});
    const url = (f) => `/ws/${path.relative(root, path.join(FT.footageDir(c.dir), f)).split(path.sep).map(encodeURIComponent).join('/')}`;
    return {...st, slots: st.slots.map((x) => ({...x, url: x.file ? url(x.file) : null})), previewApproved: Boolean(PV.status(c.dir).approved)};
  };

  // the pieces of an edited video's graphics, started when any is missing (a render problem shows, the edit still saves)
  const piecesNow = (c) => {
    try {
      return PC.startPieces(root, c.playlist, c.dir);
    } catch (e) {
      return {...PC.publicStatus(root, c.playlist, c.dir), job: {status: 'error', error: e.message}};
    }
  };

  // the footage of an edited video, with which clips have a transcript, and the speech-to-text job
  const assetsStatus = (dir) => {
    const st = AS.status(dir);
    return {...st, assets: st.assets.map((a) => ({...a, transcript: fs.existsSync(SP.transcriptFile(dir, a.id))})), speech: SP.videoStatus(dir)};
  };

  const json = (res, status, data) => {
    res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
    res.end(JSON.stringify(data));
  };
  const body = (req) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > 600 * 1024 * 1024) req.destroy(Object.assign(new Error('Upload too large (max 600 MB)'), {status: 413}));
        else chunks.push(c);
      });
      req.on('end', () => {
        // recordings and the creator's media arrive as raw bytes; everything else is JSON
        if (/^(audio|video|image)\/|^application\/octet-stream/.test(req.headers['content-type'] || '')) return resolve(Buffer.concat(chunks));
        try {
          resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
        } catch (e) {
          reject(Object.assign(new Error('bad JSON'), {status: 400}));
        }
      });
      req.on('error', reject);
    });

  // Serve a file from a fixed base folder only (no "..").
  const sendFrom = (req, res, base, rel) => {
    const file = path.resolve(base, rel);
    if (!file.startsWith(path.resolve(base) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return json(res, 404, {error: 'not found'});
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const size = fs.statSync(file).size;
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Number(range[2]) : size - 1;
      res.writeHead(206, {'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1});
      return fs.createReadStream(file, {start, end}).pipe(res);
    }
    res.writeHead(200, {'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': type.startsWith('text/html') ? 'no-store' : 'max-age=60'});
    fs.createReadStream(file).pipe(res);
  };

  const routes = [
    ['GET', /^\/api\/state$/, () => {
      const t = tax();
      return {root, taxonomy: t, playlists: P.listPlaylists(root, t), beds: P.listBeds(root), brand: B.loadProfile(root), production: P.defaultProduction(root), kits: kitList(), lengths: LENGTHS};
    }],
    ['GET', /^\/api\/brand$/, () => B.loadProfile(root)],
    ['GET', /^\/api\/themes$/, () => {
      const profile = B.loadProfile(root);
      // per theme, the brand colours that get adjusted to read on its canvas
      const tuned = (id) => {
        const c = B.brandProps(profile, TH.loadTheme(root, id)).colors;
        return Object.fromEntries(['accent', 'highlight'].filter((k) => c[k] !== profile.colors[k]).map((k) => [k, c[k]]));
      };
      return {themes: TH.listThemes(root).map((t) => ({...t, tuned: tuned(t.id)})), samples: SM.samplesStatus(), default: B.defaultThemeId(profile), colors: profile.colors};
    }],
    ['POST', /^\/api\/themes\/samples$/, (m, b) => SM.startSamples(root, Array.isArray(b?.ids) && b.ids.length ? b.ids : Object.keys(TH.BUILTIN))],
    ['POST', /^\/api\/themes\/([a-z0-9-]+)\/update$/, (m) => TH.adoptTheme(root, m[1], {update: true})],
    ['PUT', /^\/api\/brand$/, (m, b) => B.saveProfile(root, b)],
    ['GET', /^\/api\/suggestions$/, () => P.suggestPlaylists(root, tax())],
    ['POST', /^\/api\/playlists$/, (m, b) => P.createPlaylist(root, tax(), b)],
    ['GET', /^\/api\/playlists\/([a-z0-9-]+)$/, (m) => P.loadPlaylist(root, tax(), m[1])],
    ['PUT', /^\/api\/playlists\/([a-z0-9-]+)$/, (m, b) => P.updatePlaylist(root, tax(), m[1], b)],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/rename$/, (m, b) => P.renamePlaylist(root, tax(), m[1], b)],
    ['DELETE', /^\/api\/playlists\/([a-z0-9-]+)$/, (m) => ({archivedTo: P.archivePlaylist(root, m[1])})],
    // preview what a set of defaults means before saving (standards + hashtags)
    ['POST', /^\/api\/preview-card$/, (m, b) => {
      const t = tax();
      return {standards: applicableStandards(t, b), hashtags: hashtagsFor(t, b), problems: cardProblems(t, b, {kit: b?.kit})};
    }],
    ['GET', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)$/, (m) => {
      const c = ctx(m);
      const {kit, kitName, format, hosts, flow, own} = c.playlist;
      return {...c.video, setup: {kit, kitName, format, hosts, flow, own}};
    }],
    ['PUT', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/card$/, (m, b) => V.saveCard(root, tax(), pdir(m[1]), m[2], b)],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/rename$/, (m, b) => V.renameVideo(root, tax(), pdir(m[1]), m[2], b)],
    ['DELETE', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)$/, (m) => ({archivedTo: V.archiveVideo(root, pdir(m[1]), m[2])})],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos$/, (m, b) => {
      const t = tax();
      return V.createVideo(root, t, P.loadPlaylist(root, t, m[1]), pdir(m[1]), b);
    }],
    ['GET', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/plan$/, (m) => PL.status(ctx(m).dir)],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/plan$/, (m, b) => {
      const c = ctx(m);
      return PL.startPlan(root, c.t, c.playlist, c.video, c.dir, {feedback: String(b.feedback || '').trim() || undefined});
    }],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/plan\/import$/, (m) => {
      const c = ctx(m);
      return PL.importPlan(root, c.t, c.playlist, c.video, c.dir);
    }],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/plan\/approve$/, (m) => {
      const c = ctx(m);
      const out = PL.approvePlan(root, c.t, c.playlist, c.video, c.dir, (card) => V.saveCard(root, c.t, pdir(m[1]), m[2], card));
      // the preview follows the approved plan on its own (one less click); a failure shows on the preview step
      try {
        if (!opts.noJobs) PV.startPreview(root, c.playlist, c.video, c.dir, approvedPlan(c.dir));
      } catch {
        /* shown when the owner opens the preview step */
      }
      return out;
    }],
    ['GET', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/preview$/, (m) => {
      const c = ctx(m);
      return {...PV.status(c.dir), studio: PV.studioCheck(root), planStamp: approvedPlan(c.dir)?.thumbnail?.stamp || ''};
    }],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/preview$/, (m) => {
      const c = ctx(m);
      return PV.startPreview(root, c.playlist, c.video, c.dir, approvedPlan(c.dir));
    }],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/preview\/approve$/, (m) => PV.approvePreview(ctx(m).dir)],
    ['PUT', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/preview\/stamp$/, (m, b) => PV.setStamp(ctx(m).dir, b)],
    ['PUT', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/theme$/, (m, b) => PV.setTheme(root, ctx(m).dir, String(b?.id || ''))],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/plan\/pdf$/, async (m) => {
      const c = ctx(m);
      const st = PL.status(c.dir);
      if (!st.current) throw Object.assign(new Error('No plan yet'), {status: 404});
      await PL.renderPdf(root, c.dir, c.video.code, st.current);
      return PL.status(c.dir);
    }],
    // recording studio (after the preview is approved)
    ['GET', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/record$/, (m) => {
      const c = ctx(m);
      const pv = PV.status(c.dir);
      const approved = pv.approved && pv.approved.version === pv.current;
      return {...RC.status(root, c.playlist, c.dir, approvedPlan(c.dir), approved), code: c.video.code, title: c.video.title, preview: approved && pv.video ? `/ws/playlists/${m[1]}/${m[2]}/preview/${pv.video}` : null};
    }],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/record\/take\/([\w-]+)\/(\d+-\d+)$/, (m, b, url) => {
      const c = ctx(m);
      const pv = PV.status(c.dir);
      if (!(pv.approved && pv.approved.version === pv.current)) throw Object.assign(new Error('Approve the preview first; recording follows it'), {status: 409});
      return RC.saveTake(c.dir, c.video.code, m[3], m[4], url.searchParams.get('kind') === 'camera' ? 'camera' : 'audio', b, Object.fromEntries(url.searchParams), m[3] !== RC.languages(root, c.playlist)[0]);
    }],
    ['DELETE', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/record\/take\/([\w-]+)\/(\d+-\d+)$/, (m) => RC.deleteTake(ctx(m).dir, m[3], m[4])],
    ['PUT', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/record\/text$/, (m, b) => RC.setText(ctx(m).dir, String(b.lang || ''), String(b.key || ''), b.text)],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/record\/translate$/, (m, b) => {
      const c = ctx(m);
      return RC.translate(root, c.playlist, c.dir, approvedPlan(c.dir), String(b.lang || ''));
    }],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/record\/speak$/, async (m, b) => ({raw: await RC.speak(root, String(b.lang || ''), b.text, b.voice, b.rate, b.pitch), type: 'audio/mpeg'})],
    ['PUT', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/record\/flag$/, (m, b) => RC.setFlag(ctx(m).dir, String(b.lang || ''), String(b.key || ''), String(b.flag || ''), b.value)],
    ['PUT', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/record\/voice$/, (m, b) => RC.setVoice(ctx(m).dir, String(b.lang || ''), b)],
    ['PUT', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/record\/line-voice$/, (m, b) => RC.setLineVoice(ctx(m).dir, String(b.key || ''), String(b.lang || ''), b.value || null)],
    // cutout styles (brand-wide) and their sample stills
    ['GET', /^\/api\/cutouts$/, () => {
      const dir = CU.samplesDir(root);
      const p = B.loadProfile(root);
      return {
        categories: CU.CATEGORIES.map((c) => ({...c, styles: c.styles.map((st) => ({...st, sample: fs.existsSync(path.join(dir, CU.sampleName(c.id, st.id))) ? `/ws/brand/reference/cutouts/${CU.sampleName(c.id, st.id)}?t=${fs.statSync(path.join(dir, CU.sampleName(c.id, st.id))).mtimeMs | 0}` : null}))})),
        picked: p.cutouts || {},
        job: SM.cutoutSamplesStatus(),
      };
    }],
    ['POST', /^\/api\/cutouts\/samples$/, (m, b) => SM.startCutoutSamples(root, {place: b?.place, only: Array.isArray(b?.only) && b.only.length ? b.only.map(String) : undefined})],
    // the creator's own clips, audio and photos for one video, and the lines they go on
    ['GET', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/media$/, (m) => {
      const c = ctx(m);
      return mediaStatus(c);
    }],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/media$/, (m, b, url) => {
      const c = ctx(m);
      MD.save(root, c.dir, url.searchParams.get('name'), b);
      return mediaStatus(c);
    }],
    ['DELETE', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/media\/([\w.-]+)$/, (m) => {
      const c = ctx(m);
      MD.remove(c.dir, m[3]);
      return mediaStatus(c);
    }],
    // footage slots: the creator's licensed clips (named by slot), or Pexels for the empty ones
    ['GET', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/footage$/, (m) => footageStatus(ctx(m))],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/footage\/(F\d{2,3}-\d)$/, (m, b, url) => {
      const c = ctx(m);
      FT.save(c.dir, m[3], url.searchParams.get('name'), b);
      return footageStatus(c);
    }],
    ['DELETE', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/footage\/(F\d{2,3}-\d)$/, (m) => {
      const c = ctx(m);
      FT.remove(c.dir, m[3]);
      return footageStatus(c);
    }],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/footage\/fill$/, (m) => {
      const c = ctx(m);
      FT.fillFromPexels(c.dir, approvedPlan(c.dir) || PL.status(c.dir).plan, pexelsKey());
      return footageStatus(c);
    }],
    // finish: re-timed voice tracks, subtitles and a check video per language
    ['GET', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/finish$/, (m) => {
      const c = ctx(m);
      return FN.status(root, c.playlist, c.video, c.dir);
    }],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/finish$/, (m) => {
      const c = ctx(m);
      return FN.make(root, c.playlist, c.video, c.dir, approvedPlan(c.dir));
    }],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/finish\/check$/, (m, b) => {
      const c = ctx(m);
      return FN.startCheck(root, c.playlist, c.video, c.dir, approvedPlan(c.dir), String(b.lang || ''), `http://127.0.0.1:${Number(process.env.PORT || 4330)}`);
    }],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/finish\/final$/, (m, b) => {
      const c = ctx(m);
      return FN.startFinal(root, c.playlist, c.video, c.dir, approvedPlan(c.dir), String(b.lang || ''), String(b.size || '1080'), `http://127.0.0.1:${Number(process.env.PORT || 4330)}`);
    }],
    // an edited video's story and Claude's first cut (server/cut.mjs)
    ['GET', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/cut$/, (m) => CT.status(ctx(m).dir)],
    ['PUT', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/story$/, (m, b) => {
      const c = ctx(m);
      return CT.setStory(c.dir, c.video, b.story);
    }],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/cut$/, (m) => {
      const c = ctx(m);
      return CT.startCut(root, c.playlist, c.video, c.dir);
    }],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/cut\/import$/, (m) => (CT.importCut(ctx(m).dir), CT.status(ctx(m).dir))],
    // an edited video's timeline (edit/edit.json) and its saved versions
    ['GET', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/edit$/, (m) => {
      const c = ctx(m);
      const profile = B.loadProfile(root);
      // a cut or a version brought back may hold graphics without the brand's style yet
      const e = ED.load(c.dir);
      if (JSON.stringify(PC.assignStyles(JSON.parse(JSON.stringify(e)), profile)) !== JSON.stringify(e)) ED.save(c.dir, PC.assignStyles(e, profile));
      return {...ED.status(c.dir, (c.playlist.hosts || []).map((x) => x.name)), title: c.video.title, code: c.video.code, looks: PC.lookChoices(profile), pieces: piecesNow(c), sound: SO.status(c.dir)};
    }],
    ['PUT', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/edit$/, (m, b) => {
      const c = ctx(m);
      const out = ED.save(c.dir, PC.assignStyles(b, B.loadProfile(root)));
      return {...out, pieces: piecesNow(c)};
    }],
    // a take recorded in the editor (a voice-over line, a piece to camera, a voice note at a point): into raw/recorded/,
    // then read like any other file; the answer names its footage id
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/edit\/record$/, async (m, req, url) => {
      const c = ctx(m);
      const {file} = await AS.upload(c.dir, url.searchParams.get('name'), req, 'recorded');
      const rel = `recorded/${file.split('/').pop()}`;
      const id = AS.scan(c.dir).assets.find((a) => a.file === rel)?.id;
      try {
        AS.processAll(root, c.dir);
      } catch {
        /* already reading files: the editor asks again */
      }
      return {file: rel, id};
    }, {stream: true}],
    // preview and final of the edit (server/editrender.mjs)
    ['GET', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/edit\/render$/, (m) => {
      const c = ctx(m);
      return ER.status(c.dir, c.video);
    }],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/edit\/render$/, (m, b) => {
      const c = ctx(m);
      return ER.startRender(root, c.playlist, c.video, c.dir, {kind: b.kind === 'final' ? 'final' : 'preview', size: String(b.size || '1080')});
    }],
    // the edit's sound: noise cleanup per file and levelling (server/sound.mjs)
    ['GET', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/edit\/sound$/, (m) => SO.status(ctx(m).dir)],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/edit\/clean$/, (m, b) => SO.startClean(root, ctx(m).dir, String(b.asset || ''), String(b.strength || 'medium'))],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/edit\/level$/, (m) => SO.startLevel(root, ctx(m).dir)],
    // the edit's graphics: each rendered alone for the editor (server/pieces.mjs), and written by Claude from an idea
    ['GET', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/edit\/pieces$/, (m) => {
      const c = ctx(m);
      return PC.publicStatus(root, c.playlist, c.dir);
    }],
    ['GET', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/edit\/graphics$/, (m) => PC.writingStatus(ctx(m).dir)],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/edit\/graphics$/, (m, b) => {
      const c = ctx(m);
      return PC.startWriting(root, c.playlist, c.video, c.dir, Array.isArray(b?.ids) ? b.ids.map(String) : null);
    }],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/edit\/graphics\/import$/, (m) => PC.importAnswers(ctx(m).dir)],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/edit\/versions$/, (m, b) => ED.saveVersion(ctx(m).dir, b.name)],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/edit\/versions\/(\d+)\/restore$/, (m) => ED.restore(ctx(m).dir, m[3])],
    // an edited video's raw material: originals in raw/, working copies, stills and waveforms in edit/
    ['GET', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/assets$/, (m) => assetsStatus(ctx(m).dir)],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/assets\/transcribe$/, (m, b) => (SP.startTranscribe(root, ctx(m).dir, b.language || null), assetsStatus(ctx(m).dir))],
    // speech to text (whisper.cpp), installed once per PC
    ['GET', /^\/api\/speech$/, () => SP.status()],
    ['POST', /^\/api\/speech\/install$/, (m, b) => SP.startInstall(b.model)],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/assets\/process$/, (m) => {
      // after the working copies, the clips are listened to (when speech to text is installed)
      const dir = ctx(m).dir;
      AS.processAll(root, dir, {after: async () => SP.ready() && SP.waiting(dir).length && SP.startTranscribe(root, dir)});
      return assetsStatus(dir);
    }],
    ['POST', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/assets\/upload$/, (m, req, url) => AS.upload(ctx(m).dir, url.searchParams.get('name'), req), {stream: true}],
    ['PUT', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/face$/, (m, b) => V.setFace(ctx(m).dir, b)],
    // the kind of video, its format and speakers, when this video differs from the playlist
    ['PUT', /^\/api\/playlists\/([a-z0-9-]+)\/videos\/([A-Za-z0-9-]+)\/setup$/, (m, b) => {
      const t = tax();
      const out = V.setVideoSetup(t, P.loadPlaylist(root, t, m[1]), path.join(pdir(m[1]), m[2]), b);
      // a brief already handed to Claude is written again for the new setup
      const c = ctx(m);
      if (!apiKey() && fs.existsSync(path.join(c.dir, 'plan', 'brief.md')) && out.flow === 'defined') PL.startPlan(root, c.t, c.playlist, c.video, c.dir);
      return out;
    }],
    ['GET', /^\/api\/settings$/, () => ({...publicSettings(), model: PL.MODEL, version: UP.currentVersion()})],
    // the app's own updates (server/update.mjs)
    ['GET', /^\/api\/update$/, () => UP.check()],
    ['POST', /^\/api\/update$/, () => UP.startUpdate()],
    ['PUT', /^\/api\/settings$/, (m, b) => {
      if ('anthropicApiKey' in b) {
        const k = String(b.anthropicApiKey || '').trim();
        if (k && !/^sk-ant-[\w-]{20,}$/.test(k)) throw Object.assign(new Error('That does not look like an Anthropic API key (it starts with sk-ant-)'), {status: 400});
        saveSettings({anthropicApiKey: k || null});
      }
      if ('pexelsApiKey' in b) {
        const k = String(b.pexelsApiKey || '').trim();
        if (k && !/^[A-Za-z0-9]{20,80}$/.test(k)) throw Object.assign(new Error('That does not look like a Pexels API key (letters and numbers from pexels.com/api)'), {status: 400});
        saveSettings({pexelsApiKey: k || null});
      }
      return {...publicSettings(), model: PL.MODEL};
    }],
    ['PUT', /^\/api\/taxonomy\/hashtag$/, (m, b) => (setHashtag(root, b.field, b.value, b.hashtag), loadTaxonomy(root))],
  ];
  if (opts.routesOnly) return routes;

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    try {
      if (url.pathname.startsWith('/api/')) {
        // the API changes files: refuse requests from other web pages (only this app's own page may call it)
        const origin = req.headers.origin;
        if (req.method !== 'GET' && origin && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return json(res, 403, {error: 'forbidden'});
        for (const [method, re, fn, opt] of routes) {
          const m = re.exec(url.pathname);
          if (!m || req.method !== method) continue;
          // big uploads are streamed to disk by the route itself
          const out = await fn(m, opt?.stream ? req : method === 'GET' || method === 'DELETE' ? {} : await body(req), url);
          if (Buffer.isBuffer(out?.raw)) return res.writeHead(200, {'Content-Type': out.type, 'Cache-Control': 'no-store'}).end(out.raw);
          return json(res, 200, out);
        }
        return json(res, 404, {error: 'not found'});
      }
      // brand assets straight from the channel folder (fonts, logo, photo, beds)
      if (url.pathname.startsWith('/ws/')) {
        const rel = decodeURIComponent(url.pathname.slice(4));
        // music beds that come with the app (a channel without its own)
        if (rel.startsWith('eng/audio/')) return sendFrom(req, res, path.join(APP_DIR, 'engine', 'public'), rel.slice(4));
        if (!/^(brand|audio|playlists)\//.test(rel)) return json(res, 404, {error: 'not found'});
        return sendFrom(req, res, root, rel);
      }
      return sendFrom(req, res, path.join(APP_DIR, 'public'), url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1)));
    } catch (e) {
      if (!e.status) console.error(e);
      json(res, e.status || 500, {error: e.message});
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith(path.join('server', 'index.mjs'))) {
  const PORT = Number(process.env.PORT || 4330);
  const root = findRoot();
  createServer(root).listen(PORT, '127.0.0.1', () => {
    const link = `http://127.0.0.1:${PORT}`;
    console.log(`Content Studio: ${link}\nChannel folder: ${root}\nKeep this window open while you work.`);
    if (process.env.NO_OPEN) return;
    if (process.platform === 'win32') exec(`start "" ${link}`);
    else exec(`${process.platform === 'darwin' ? 'open' : 'xdg-open'} ${link}`);
  });
}
