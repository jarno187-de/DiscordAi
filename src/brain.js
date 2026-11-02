// THE BRAIN CELL. Brian has exactly one, it's shared by the whole server,
// it gets tired when he thinks, it can be fed, and it can be STOLEN.
import * as store from './store.js';

export const STEAL_DURATION_MS = 10 * 60 * 1000; // the cell crawls back home after 10 min
export const STEAL_COOLDOWN_MS = 20 * 60 * 1000; // per user
export const STEAL_PROTECTION_MS = 45 * 1000; // a fresh thief can't be robbed instantly
export const FEED_COOLDOWN_MS = 90 * 1000;
const REGEN_EVERY_MS = 5 * 60 * 1000; // +1 energy every 5 min of rest

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

export const FAKE_NAMES = [
  'Kevin', 'Gregory', 'Big Steve', 'Doug', 'Pamela', 'Sir Reginald', 'Gary',
  "Lil' Darren", 'Moist Nathan', 'Barbara', 'Chad Thundersock', 'Brenda', 'Todd',
  'Captain Cheese', 'Wet Phil', 'Grandma', 'Lasagna', 'Mr. Tuesday', 'Duncan', 'Shrimp',
];

/** Applies regeneration + returns stolen cells whose time ran out. */
export function getState(guildId) {
  const g = store.guild(guildId);
  const now = Date.now();

  const ticks = Math.floor((now - g.energyUpdatedAt) / REGEN_EVERY_MS);
  if (ticks > 0) {
    g.energy = clamp(g.energy + ticks, 0, 100);
    g.energyUpdatedAt += ticks * REGEN_EVERY_MS;
    store.save();
  }

  if (g.holder && now - g.holder.since >= STEAL_DURATION_MS) {
    const u = store.user(guildId, g.holder.userId);
    u.heldMs += STEAL_DURATION_MS;
    g.lastEscapedFrom = g.holder.name;
    g.holder = null;
    g.justReturned = true; // Brian will celebrate on his next message
    store.save();
  }

  return g;
}

export function tierOf(g) {
  if (g.holder) return 'none';
  if (g.energy >= 75) return 'galaxy';
  if (g.energy >= 45) return 'normal';
  if (g.energy >= 20) return 'low';
  return 'fumes';
}

export const TIER_LABELS = {
  galaxy: '🌌 GALAXY BRAIN',
  normal: '🧠 Regular Brian',
  low: '🪫 Low Battery',
  fumes: '💀 Running on Fumes',
  none: '🕳️ NO BRAIN CELL',
};

/** Thinking is exhausting. Every reply costs the brain cell some energy. */
export function think(guildId) {
  const g = getState(guildId);
  g.thoughts = (g.thoughts || 0) + 1;
  if (!g.holder) {
    g.energy = clamp(g.energy - rand(2, 5), 0, 100);
    if (g.energy === 0) g.energy = 1; // it never fully dies. it just... lingers.
  }
  store.save();
}

export function meet(guildId, userId) {
  const u = store.user(guildId, userId);
  if (!u.fakeName) {
    u.fakeName = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)];
    store.save();
  }
  return u;
}

export function adjustFriendship(guildId, userId, delta) {
  const u = meet(guildId, userId);
  u.friendship = clamp(u.friendship + delta, -100, 100);
  store.save();
  return u.friendship;
}

/** Brian is very sensitive. A cheap vibe check that works even when the AI is down. */
export function vibeCheck(text) {
  const t = text.toLowerCase();
  let d = 0;
  if (/\b(good bot|love (you|u)|smart|genius|best|thank(s| you)|ty|cute|legend|king|goat|nice|cool|awesome)\b/.test(t)) d += 3;
  if (/\b(bad bot|dumb|stupid|idiot|moron|shut up|hate|useless|trash|cringe|stfu|clown|bozo)\b/.test(t)) d -= 4;
  return d;
}

export function friendshipLabel(score) {
  if (score <= -60) return 'ARCH-NEMESIS';
  if (score <= -25) return 'sworn enemy';
  if (score < -5) return 'suspicious person';
  if (score <= 5) return 'random stranger';
  if (score < 25) return 'acquaintance';
  if (score < 60) return 'good friend';
  return 'BEST FRIEND FOREVER';
}

// ── Feeding ────────────────────────────────────────────────
const FOOD_RULES = [
  { re: /crayon|glue|paste|play-?doh/, bonus: 25, note: 'his absolute favourite delicacy' },
  { re: /fish|salmon|walnut|blueberr|egg|avocado|broccoli|spinach|nuts?\b/, bonus: 15, note: 'actual brain food (suspiciously healthy)' },
  { re: /coffee|energy drink|red ?bull|monster|espresso/, bonus: 20, note: 'pure caffeine, the brain cell is vibrating' },
  { re: /pizza|burger|fries|chips|candy|cookie|cake|donut|sugar|nugget/, bonus: 8, note: 'junk food sugar rush' },
  { re: /rock|stone|sock|shoe|paper|sand|dirt|lego|soap/, bonus: -5, note: 'not food, but he ate it anyway' },
  { re: /poison|battery|nail|bleach|glass|uranium/, bonus: -20, note: 'a terrible idea that hurt the brain cell' },
];

export function nutrition(food) {
  const f = food.toLowerCase();
  let value = rand(-6, 12);
  let note = 'mystery food of questionable value';
  for (const rule of FOOD_RULES) {
    if (rule.re.test(f)) {
      value += rule.bonus;
      note = rule.note;
      break;
    }
  }
  return { value: clamp(value, -30, 35), note };
}

export function feed(guildId, userId, food) {
  const g = getState(guildId);
  const u = meet(guildId, userId);
  const now = Date.now();
  if (now - u.lastFeed < FEED_COOLDOWN_MS) {
    return { ok: false, waitMs: FEED_COOLDOWN_MS - (now - u.lastFeed) };
  }
  const { value, note } = nutrition(food);
  const before = g.energy;
  g.energy = clamp(g.energy + value, 1, 100);
  u.lastFeed = now;
  u.feeds += 1;
  u.friendship = clamp(u.friendship + (value >= 0 ? 3 : -3), -100, 100);
  store.save();
  return { ok: true, value, note, before, after: g.energy, stolen: Boolean(g.holder) };
}

// ── Stealing ───────────────────────────────────────────────
export function steal(guildId, userId, name) {
  const g = getState(guildId);
  const u = meet(guildId, userId);
  const now = Date.now();

  if (g.holder?.userId === userId) return { ok: false, reason: 'already' };
  if (now - u.lastSteal < STEAL_COOLDOWN_MS) {
    return { ok: false, reason: 'cooldown', waitMs: STEAL_COOLDOWN_MS - (now - u.lastSteal) };
  }
  if (g.holder && now - g.holder.since < STEAL_PROTECTION_MS) {
    return { ok: false, reason: 'protected', holder: g.holder, waitMs: STEAL_PROTECTION_MS - (now - g.holder.since) };
  }

  const victim = g.holder ? { ...g.holder } : null;
  if (victim) {
    store.user(guildId, victim.userId).heldMs += now - victim.since;
  }
  g.holder = { userId, name, since: now };
  g.justReturned = false;
  u.lastSteal = now;
  u.steals += 1;
  u.friendship = clamp(u.friendship - 15, -100, 100);
  store.save();
  return { ok: true, victim };
}

export function giveBack(guildId, userId) {
  const g = getState(guildId);
  if (g.holder?.userId !== userId) return { ok: false };
  const u = store.user(guildId, userId);
  u.heldMs += Date.now() - g.holder.since;
  u.friendship = clamp(u.friendship + 10, -100, 100);
  g.holder = null;
  store.save();
  return { ok: true };
}

export function leaderboard(guildId, limit = 5) {
  const g = getState(guildId);
  return Object.entries(g.users)
    .map(([id, u]) => {
      const live = g.holder?.userId === id ? Date.now() - g.holder.since : 0;
      return { id, heldMs: u.heldMs + live, steals: u.steals };
    })
    .filter((e) => e.heldMs > 0 || e.steals > 0)
    .sort((a, b) => b.heldMs - a.heldMs)
    .slice(0, limit);
}

export function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
