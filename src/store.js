// Dead-simple JSON persistence. Brian doesn't deserve a database.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

let data = { guilds: {} };
let saveTimer = null;

export function load() {
  try {
    data = JSON.parse(fs.readFileSync(config.dataFile, 'utf8'));
    if (!data.guilds) data.guilds = {};
  } catch {
    data = { guilds: {} };
  }
}

export function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.mkdirSync(path.dirname(config.dataFile), { recursive: true });
    const tmp = `${config.dataFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, config.dataFile);
  }, 1000);
}

export function guild(id) {
  if (!data.guilds[id]) {
    data.guilds[id] = {
      energy: 100, // health of THE brain cell, 0-100
      energyUpdatedAt: Date.now(),
      holder: null, // { userId, name, since } when someone stole the brain cell
      users: {},
      thoughts: 0,
    };
  }
  return data.guilds[id];
}

export function user(guildId, userId) {
  const g = guild(guildId);
  if (!g.users[userId]) {
    g.users[userId] = {
      friendship: 0, // -100 (arch-nemesis) .. 100 (best friend)
      fakeName: null, // the wrong name Brian insists on calling you
      steals: 0,
      feeds: 0,
      heldMs: 0,
      lastSteal: 0,
      lastFeed: 0,
    };
  }
  return g.users[userId];
}
