// Tiny JSON file storage: per-server settings + a backup of the last change (for /restore).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Settings live in data/ next to the bot (or in VERIFICATION_DATA_DIR if set).
// The bot only ever writes here — it never touches your .env file.
const DATA_DIR = process.env.VERIFICATION_DATA_DIR
  ? path.resolve(process.env.VERIFICATION_DATA_DIR)
  : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'verification');
const CONFIG_FILE = path.join(DATA_DIR, 'guilds.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

fs.mkdirSync(BACKUP_DIR, { recursive: true });

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function getGuildConfig(guildId) {
  return readJson(CONFIG_FILE, {})[guildId] ?? {};
}

export function setGuildConfig(guildId, patch) {
  const all = readJson(CONFIG_FILE, {});
  all[guildId] = { ...all[guildId], ...patch };
  writeJson(CONFIG_FILE, all);
  return all[guildId];
}

// kind = 'names' (style changes, /restore) or 'verification' (permission setup)
const backupFile = (guildId, kind = 'names') =>
  path.join(BACKUP_DIR, kind === 'names' ? `${guildId}.json` : `${guildId}-${kind}.json`);

/** names backup = { at, styleName, renamed: [{ id, name, parentId }], created: [id] } */
export function saveBackup(guildId, backup, kind = 'names') {
  writeJson(backupFile(guildId, kind), backup);
}

export function loadBackup(guildId, kind = 'names') {
  return readJson(backupFile(guildId, kind), null);
}

export function clearBackup(guildId, kind = 'names') {
  fs.rmSync(backupFile(guildId, kind), { force: true });
}
