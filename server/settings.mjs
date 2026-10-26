// Per-PC settings (the Anthropic API key). Kept in the user's home folder, never in the channel
// folder, so a synced or shared channel folder never carries the key.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readJson, writeJson} from './workspace.mjs';

const file = () => process.env.CS_SETTINGS || path.join(os.homedir(), '.content-studio', 'settings.json');

export const loadSettings = () => readJson(file(), {});

export function saveSettings(patch) {
  const next = {...loadSettings(), ...patch};
  for (const [k, v] of Object.entries(next)) if (v === null || v === '') delete next[k];
  writeJson(file(), next);
  try {
    fs.chmodSync(file(), 0o600);
  } catch {}
  return next;
}

// The key from the environment wins, then the saved one.
export function apiKey() {
  return process.env.ANTHROPIC_API_KEY || loadSettings().anthropicApiKey || '';
}

// The Pexels key (free, pexels.com/api): fills empty footage slots with licensed stock clips.
export function pexelsKey() {
  return process.env.PEXELS_API_KEY || loadSettings().pexelsApiKey || '';
}

// What the UI may see: never the key itself.
export function publicSettings() {
  const key = apiKey();
  const px = pexelsKey();
  return {
    hasKey: !!key, keySource: process.env.ANTHROPIC_API_KEY ? 'environment' : key ? 'saved' : null, keyHint: key ? `…${key.slice(-4)}` : '', file: file(),
    hasPexels: !!px, pexelsSource: process.env.PEXELS_API_KEY ? 'environment' : px ? 'saved' : null, pexelsHint: px ? `…${px.slice(-4)}` : '',
  };
}
