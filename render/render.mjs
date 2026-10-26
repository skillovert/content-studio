// Renders the preview video and the sample thumbnail with Remotion, using the studio's own install
// (studio/node_modules, studio/public, studio/src components). Run by server/preview.mjs as a child
// process:  node render/render.mjs <job.json>
// job: {studio, props, video, thumb, scale, stills?, browserExecutable?}. Prints one JSON object per line
// ({progress, stage} while working, then {done} or {error}).
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const say = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const HERE = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const studio = path.resolve(job.studio);
  const req = createRequire(path.join(studio, 'package.json'));
  const {bundle} = req('@remotion/bundler');
  const {selectComposition, renderMedia, renderStill} = req('@remotion/renderer');
  const modules = path.join(studio, 'node_modules');

  say({stage: 'bundle', progress: 0});
  const serveUrl = await bundle({
    entryPoint: path.join(HERE, '..', 'scenes', 'index.ts'),
    publicDir: path.join(studio, 'public'),
    onProgress: (p) => say({stage: 'bundle', progress: p / 100}),
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        alias: {...(config.resolve?.alias || {}), '@studio': path.join(studio, 'src')},
        modules: [modules, 'node_modules'],
      },
      resolveLoader: {...(config.resolveLoader || {}), modules: [modules, 'node_modules']},
    }),
  });

  // several looks from one bundle (theme reference stills): job.variants = [{props, stills, thumb}]
  if (job.variants?.length) {
    for (const [i, v] of job.variants.entries()) {
      const vc = {serveUrl, inputProps: v.props, ...(job.browserExecutable ? {browserExecutable: job.browserExecutable} : {})};
      if (v.thumb) {
        const comp = await selectComposition({...vc, id: 'Thumb'});
        fs.mkdirSync(path.dirname(v.thumb), {recursive: true});
        await renderStill({...vc, composition: comp, output: v.thumb, imageFormat: 'jpeg', jpegQuality: 88, scale: job.stillScale ?? 0.5, overwrite: true});
      }
      const comp = await selectComposition({...vc, id: 'Preview'});
      for (const st of v.stills || []) {
        fs.mkdirSync(path.dirname(st.out), {recursive: true});
        await renderStill({...vc, composition: comp, frame: st.frame, output: st.out, imageFormat: 'jpeg', jpegQuality: 85, scale: job.stillScale ?? 0.5, overwrite: true});
      }
      say({stage: 'samples', progress: (i + 1) / job.variants.length});
    }
    say({done: true});
    return;
  }

  // an edited video's graphics, one short video each: job.pieces = [{props, out, alpha}] (server/pieces.mjs)
  if (job.pieces?.length) {
    for (const [i, p] of job.pieces.entries()) {
      const vc = {serveUrl, inputProps: {...job.common, ...p.props}, ...(job.browserExecutable ? {browserExecutable: job.browserExecutable} : {})};
      const comp = await selectComposition({...vc, id: 'Piece'});
      fs.mkdirSync(path.dirname(p.out), {recursive: true});
      const tmp = p.out + (p.alpha ? '.part.webm' : '.part.mp4');
      await renderMedia({
        ...vc,
        composition: comp,
        // laid over the footage: VP8 WebM with a see-through background; full screen: H.264
        ...(p.alpha ? {codec: 'vp8', imageFormat: 'png', pixelFormat: 'yuva420p', crf: 12} : {codec: 'h264', crf: job.crf ?? 23, pixelFormat: 'yuv420p'}),
        audioCodec: p.alpha ? 'opus' : 'aac',
        scale: job.scale ?? 0.5,
        outputLocation: tmp,
        overwrite: true,
        concurrency: job.concurrency ?? null,
        onProgress: ({progress}) => say({stage: 'pieces', progress: (i + progress) / job.pieces.length, piece: i}),
      });
      fs.renameSync(tmp, p.out);
      say({stage: 'pieces', progress: (i + 1) / job.pieces.length, made: p.out});
    }
    say({done: true});
    return;
  }

  const common = {serveUrl, inputProps: job.props, ...(job.browserExecutable ? {browserExecutable: job.browserExecutable} : {})};
  if (job.thumb) {
    say({stage: 'thumbnail', progress: 0});
    const comp = await selectComposition({...common, id: 'Thumb'});
    fs.mkdirSync(path.dirname(job.thumb), {recursive: true});
    await renderStill({...common, composition: comp, output: job.thumb, imageFormat: 'jpeg', jpegQuality: 92, overwrite: true});
    // the same thumbnail in each dub language (its own line and badge): job.thumbs = [{lang, out}]
    for (const t of job.thumbs || []) {
      const props = {...job.props, lang: t.lang};
      const c = await selectComposition({...common, inputProps: props, id: 'Thumb'});
      await renderStill({...common, inputProps: props, composition: c, output: t.out, imageFormat: 'jpeg', jpegQuality: 92, overwrite: true});
    }
    say({stage: 'thumbnail', progress: 1});
  }
  if (job.stills?.length) {
    // frames of the preview as JPEGs (contact sheet for checks): job.stills = [{frame, out}]
    const comp = await selectComposition({...common, id: 'Preview'});
    for (const [i, st] of job.stills.entries()) {
      await renderStill({...common, composition: comp, frame: st.frame, output: st.out, imageFormat: 'jpeg', jpegQuality: 85, scale: job.stillScale ?? 0.5, overwrite: true});
      say({stage: 'stills', progress: (i + 1) / job.stills.length});
    }
  }
  if (job.video) {
    const comp = await selectComposition({...common, id: job.composition || 'Preview'});
    fs.mkdirSync(path.dirname(job.video), {recursive: true});
    const tmp = job.video + '.part.mp4';
    await renderMedia({
      ...common,
      composition: comp,
      codec: 'h264',
      crf: job.crf ?? 26,
      scale: job.scale ?? 0.5,
      pixelFormat: 'yuv420p',
      audioCodec: 'aac',
      outputLocation: tmp,
      overwrite: true,
      concurrency: job.concurrency ?? null,
      onProgress: ({progress}) => say({stage: 'video', progress}),
    });
    fs.renameSync(tmp, job.video);
  }
  // the sound alone (an edited video's mix), as WAV: job.audio = path
  if (job.audio) {
    const comp = await selectComposition({...common, id: job.composition || 'Preview'});
    fs.mkdirSync(path.dirname(job.audio), {recursive: true});
    const tmp = job.audio + '.part.wav';
    await renderMedia({...common, composition: comp, codec: 'wav', outputLocation: tmp, overwrite: true, onProgress: ({progress}) => say({stage: 'sound', progress})});
    fs.renameSync(tmp, job.audio);
  }
  say({done: true});
}

main().catch((e) => {
  say({error: String(e?.stack || e).slice(0, 2000)});
  process.exit(1);
});
