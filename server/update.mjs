// Updates of the app itself (Settings → "Check for updates"). The latest version is the main branch of
// the public releases repo (skillovert/content-studio, or CS_UPDATE_REPO); its package.json says the
// version. Installing runs "Update Content Studio.cmd" (setup/install.ps1 -Mode update) in its own
// window, which shows each step, keeps a backup of the app, replaces only the app's own files
// (never the channel folder's content, packages are kept) and starts the app again.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {APP_DIR, readJson} from './workspace.mjs';

export const REPO = process.env.CS_UPDATE_REPO || 'skillovert/content-studio';
export const BRANCH = 'main';
const fail = (msg, status = 400) => Object.assign(new Error(msg), {status});

export const currentVersion = () => readJson(path.join(APP_DIR, 'package.json'), {}).version || '0.0.0';

/** -1, 0 or 1, comparing "1.2.10" style versions part by part. */
export function compareVersions(a, b) {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** What is installed and what is published: {current, latest, newer, notes, repo}. */
export async function check() {
  const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/package.json`;
  let res;
  try {
    res = await fetch(url, {signal: AbortSignal.timeout(15000), headers: {'Cache-Control': 'no-cache'}});
  } catch {
    throw fail('Could not reach GitHub to check for updates. Check the internet connection and try again.', 502);
  }
  if (!res.ok) throw fail(`No published version found (${res.status}).`, 502);
  const pkg = await res.json();
  const current = currentVersion();
  const latest = String(pkg.version || '0.0.0');
  return {current, latest, newer: compareVersions(latest, current) > 0, notes: pkg.releaseNotes || '', repo: REPO};
}

/** Starts the update window and stops this server shortly after, so its files can be replaced. */
export function startUpdate({exit = true} = {}) {
  if (process.platform !== 'win32') throw fail('Updating from the app works on Windows. Elsewhere, download the new version by hand.', 409);
  const cmd = path.join(APP_DIR, 'Update Content Studio.cmd');
  if (!fs.existsSync(cmd)) throw fail('"Update Content Studio.cmd" is missing from the app folder.', 409);
  const p = spawn('cmd.exe', ['/c', 'start', '"Content Studio update"', `"${cmd}"`], {detached: true, stdio: 'ignore', windowsVerbatimArguments: true, cwd: APP_DIR});
  p.unref();
  if (exit) setTimeout(() => process.exit(0), 1500);
  return {started: true};
}
