// Content Studio from the command line, for Claude in a project thread (the skills in skills/): the same
// code and files as the app, without the app running. Prints one JSON object.
//   node cli.mjs GET  /api/state
//   node cli.mjs POST /api/playlists '{"name":"Mountains", ...}'      (a body as JSON, or @file.json)
//   node cli.mjs links <playlist> [<video folder>]                    (the app's pages for the creator)
// Only quick steps run here (reading, creating, cards, importing and approving plans, approvals). Renders,
// recording, editing and anything long happen in the app, on the creator's PC: give the creator the link.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from './server/index.mjs';
import {findRoot} from './server/workspace.mjs';

const ALLOWED = [
  ['GET', /^\/api\/(state|brand|settings|suggestions|themes)$/],
  ['GET', /^\/api\/playlists\/[a-z0-9-]+$/],
  ['GET', /^\/api\/playlists\/[a-z0-9-]+\/videos\/[A-Za-z0-9-]+(\/(plan|preview|record|footage|media))?$/],
  ['POST', /^\/api\/playlists$/],
  ['PUT', /^\/api\/playlists\/[a-z0-9-]+$/],
  ['POST', /^\/api\/playlists\/[a-z0-9-]+\/rename$/],
  ['POST', /^\/api\/preview-card$/],
  ['POST', /^\/api\/playlists\/[a-z0-9-]+\/videos$/],
  ['PUT', /^\/api\/playlists\/[a-z0-9-]+\/videos\/[A-Za-z0-9-]+\/(card|face|setup|theme|preview\/stamp)$/],
  ['POST', /^\/api\/playlists\/[a-z0-9-]+\/videos\/[A-Za-z0-9-]+\/(rename|plan|plan\/import|plan\/approve|preview\/approve)$/],
  ['PUT', /^\/api\/brand$/],
];

const PORT = Number(process.env.PORT || 4330);
const say = (o, code = 0) => {
  process.stdout.write(JSON.stringify(o, null, 1) + '\n');
  process.exit(code);
};

/** The app's pages a thread hands the creator (the app runs on their PC at 127.0.0.1). */
export function links(playlist, video) {
  const base = `http://127.0.0.1:${PORT}/#`;
  const out = {home: `${base}/`, brand: `${base}/brand`, settings: `${base}/settings`};
  if (playlist) Object.assign(out, {playlist: `${base}/p/${playlist}`, newVideo: `${base}/p/${playlist}/new-video`});
  if (playlist && video) Object.assign(out, {video: `${base}/p/${playlist}/v/${video}`, record: `${base}/p/${playlist}/v/${video}/record`, edit: `${base}/p/${playlist}/v/${video}/edit`});
  return out;
}

// the thread writes plans itself: starting a plan here always writes the hand-off brief (plan/brief.md and
// plan/plan-schema.json), never an API call
delete process.env.ANTHROPIC_API_KEY;
process.env.CS_SETTINGS = path.join(os.tmpdir(), 'content-studio-cli-no-settings.json');

async function main() {
  const [method = '', target = '', arg] = process.argv.slice(2);
  if (method === 'links') return say(links(target, arg));
  const m = method.toUpperCase();
  if (!/^(GET|POST|PUT)$/.test(m) || !target.startsWith('/api/')) {
    return say({error: 'Usage: node cli.mjs GET|POST|PUT /api/... [json | @file.json]  ·  node cli.mjs links <playlist> [<video>]'}, 2);
  }
  if (!ALLOWED.some(([am, re]) => am === m && re.test(target))) {
    return say({error: `${m} ${target} runs in the app only (renders, recording, editing). Give the creator the link from "node cli.mjs links".`}, 3);
  }
  const body = arg ? JSON.parse(arg.startsWith('@') ? fs.readFileSync(arg.slice(1), 'utf8') : arg) : {};
  const routes = createServer(findRoot(), {routesOnly: true, noJobs: true});
  for (const [rm, re, fn] of routes) {
    const hit = re.exec(target);
    if (!hit || rm !== m) continue;
    const out = await fn(hit, body, new URL(target, 'http://127.0.0.1'));
    return say(out ?? {});
  }
  say({error: 'not found'}, 4);
}

main().catch((e) => say({error: e.message, status: e.status || 500}, 1));
