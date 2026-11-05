// The styling engine. Pure functions, no discord.js in here, so it is easy to test.

import { KEYWORDS, FALLBACK } from './emojis.js';
import { STYLES, AUTO_STYLE_ID, getStyle, SMALL_CAPS_REVERSE } from './styles.js';

const MAX_NAME = 100;
const TEXT_KINDS = new Set(['text', 'announcement', 'forum', 'media']);
const VOICE_KINDS = new Set(['voice', 'stage']);

const EMOJI_CHAR = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const EMOJI_PARTS = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|‍|️|⃣)/gu;
// Decorative characters people (and this bot) put into channel names.
const DECOR = /[・┃│︱|»«›‹「」『』【】〔〕﹝﹞〘〙⟢⟣⟡✦✧✩✪★☆•·∙◦○●◇◆▸▹►▻─━═╭╮╰╯┊┆╏┃⊹⋆˚｡₊‧﹒꒰꒱⌇༘︰⁺˖⭑⭒⟫⟪⤷↳➤➜→]/gu;
const SEPARATORS = /[-_.~:;>+=*#/\\]+/g;

const UPPER_WORDS = new Set([
  'vc', 'vcs', 'afk', 'faq', 'qna', 'qotd', 'dm', 'dms', 'tts', 'gta', 'fps', 'rpg', 'mmo', 'nsfw', 'ai',
  'tv', 'irl', 'pc', 'ps5', 'ps4', 'xp', 'lfg', 'dnd', 'mc', 'cs2', 'pvp', 'pve', 'ui', 'ux', 'vip', 'diy', 'id',
]);
const SMALL_WORDS = new Set(['a', 'an', 'and', 'the', 'of', 'to', 'in', 'on', 'for', 'or', 'with', 'at', 'by']);

// ── Small helpers ────────────────────────────────────────────────────────────

export function isTextKind(kind) { return TEXT_KINDS.has(kind); }
export function isVoiceKind(kind) { return VOICE_KINDS.has(kind); }

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Small seeded PRNG so a preview and its "Apply" give exactly the same result.
function rngFor(...parts) {
  let a = hashString(parts.join('|'));
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** Returns the first emoji found at the start of a name (before any letters), or null. */
export function leadingEmoji(raw) {
  for (const { segment } of segmenter.segment(raw)) {
    if (EMOJI_CHAR.test(segment)) return segment;
    if (/[\p{L}\p{N}]/u.test(segment)) return null;
  }
  return null;
}

/**
 * Strips emojis, decorations, fancy fonts and separators:
 * "「🎮」ɢᴀᴍɪɴɢ-ᴄʜᴀᴛ" -> "gaming chat",  "💬・off-topic" -> "off topic"
 * Original casing is kept ("Among Us" stays "Among Us").
 */
export function cleanName(raw) {
  let s = [...String(raw ?? '')].map((c) => SMALL_CAPS_REVERSE[c] ?? c).join('');
  s = s.replace(EMOJI_PARTS, ' ').replace(DECOR, ' ').replace(SEPARATORS, ' ');
  s = s.replace(/[()[\]{}]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function words(clean) {
  return clean.split(' ').filter(Boolean);
}

function slugify(clean) {
  return words(clean)
    .map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
    .join('-');
}

function titleCase(clean) {
  return words(clean)
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (UPPER_WORDS.has(lower)) return lower.toUpperCase();
      if (w !== lower) return w; // user already chose a casing ("PvP", "McDonald's")
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

// ── Emoji matching ───────────────────────────────────────────────────────────

/** Finds the keyword entry that fits a (cleaned) name best, or null. */
export function matchKeyword(clean) {
  const lower = clean.toLowerCase();
  const tokens = words(lower).map((t) => t.replace(/[^\p{L}\p{N}&+]/gu, '')).filter(Boolean);
  if (!tokens.length) return null;
  const compact = tokens.join('');
  const singular = (t) => (t.length > 3 ? t.replace(/(ies)$/, 'y').replace(/s$/, '') : t);
  const singularTokens = tokens.map(singular);

  let best = null;
  let bestScore = 0;
  for (const entry of KEYWORDS) {
    for (const key of entry.keys) {
      const k = key.toLowerCase().replace(/[\s-]/g, '');
      let score = 0;
      if (compact === k) score = 100;
      else if (key.includes(' ') && lower.includes(key)) score = 70 + k.length; // multi-word key
      else if (tokens.includes(k)) score = 50 + k.length;
      else if (singularTokens.includes(singular(k))) score = 45 + k.length;
      else if (k.length >= 4 && compact.includes(k)) score = 20 + k.length;
      if (score && entry.weak) score -= 30;
      if (score > bestScore) { best = entry; bestScore = score; }
    }
  }
  return best;
}

function pickFrom(list, rng, used) {
  const free = list.filter((e) => !used?.has(e));
  const pool = free.length ? free : list;
  return pool[Math.floor(rng() * pool.length)];
}

/** Chooses an emoji for a channel/category name. */
export function chooseEmoji(clean, kind, { seed = 0, used, fallbackKey } = {}) {
  const rng = rngFor(seed, kind, clean.toLowerCase());
  let entry = matchKeyword(clean);
  if (entry?.textOnly && isVoiceKind(kind)) entry = null;
  if (entry) {
    // First variant is the "best" one — prefer it unless rerolled or already used.
    const preferFirst = seed === 0 && !used?.has(entry.emojis[0]);
    return preferFirst ? entry.emojis[0] : pickFrom(entry.emojis, rng, used);
  }
  const fb = FALLBACK[fallbackKey ?? kind] ?? FALLBACK.text;
  return pickFrom(fb, rng, used);
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function resolveStyle(styleId, seed = 0) {
  if (!styleId || styleId === AUTO_STYLE_ID) return STYLES[Math.abs(seed) % STYLES.length];
  return getStyle(styleId) ?? STYLES[0];
}

function clip(name) {
  const chars = [...name];
  return chars.length > MAX_NAME ? chars.slice(0, MAX_NAME).join('') : name;
}

/**
 * Formats one name in a style.
 * @param {string} raw     current or desired name (decorations are stripped first)
 * @param {string} kind    'text' | 'voice' | 'category' | 'announcement' | 'forum' | 'stage' | 'media'
 * @param {object} style   a style from styles.js
 * @param {object} opts    { emoji, seed, used, keepEmoji, fallbackKey }
 */
export function formatName(raw, kind, style, opts = {}) {
  const clean = cleanName(raw);
  if (!clean) return { name: raw, emoji: null, clean };
  const kept = opts.keepEmoji ? leadingEmoji(raw) : null;
  const e = opts.emoji || kept || chooseEmoji(clean, kind, opts);
  opts.used?.add(e);
  const parts = { e, slug: slugify(clean) || clean.toLowerCase(), title: titleCase(clean) };

  let name;
  if (kind === 'category') name = style.category(parts);
  else if (isVoiceKind(kind)) name = style.voice(parts);
  else name = style.text(parts);
  return { name: clip(name), emoji: e, clean };
}

/** Example names for showing what a style looks like. */
export function styleExample(style) {
  const t = formatName('general', 'text', style, { emoji: '💬' }).name;
  const v = formatName('lounge', 'voice', style, { emoji: '🔊' }).name;
  const c = formatName('community', 'category', style, { emoji: '🌐' }).name;
  return { text: t, voice: v, category: c };
}

// ── Plans ────────────────────────────────────────────────────────────────────

function categoryFallbackKey(children) {
  if (children.length && children.every((c) => isVoiceKind(c.kind))) return 'voiceCategory';
  return 'category';
}

/**
 * Restyle everything that already exists.
 * `seed` varies the emoji picks (0 = best match), `styleSeed` picks the preset when styleId is 'auto'.
 * structure = { categories: [{ id, name, children: [{ id, name, kind }] }], loose: [{ id, name, kind }] }
 * returns { style, groups: [{ category: change|null, channels: change[] }] }
 * change = { id, kind, oldName, newName }
 */
export function buildRestylePlan(structure, { styleId, seed = 0, styleSeed = seed, keepEmoji = false } = {}) {
  const style = resolveStyle(styleId, styleSeed);
  const groups = [];
  const usedCategoryEmojis = new Set();

  const restyleChildren = (children) => {
    const used = new Set();
    return children.map((ch) => {
      const { name } = formatName(ch.name, ch.kind, style, { seed, used, keepEmoji });
      return { id: ch.id, kind: ch.kind, oldName: ch.name, newName: name };
    });
  };

  if (structure.loose?.length) groups.push({ category: null, channels: restyleChildren(structure.loose) });

  for (const cat of structure.categories ?? []) {
    const { name } = formatName(cat.name, 'category', style, {
      seed, used: usedCategoryEmojis, keepEmoji, fallbackKey: categoryFallbackKey(cat.children),
    });
    groups.push({
      // Categories the bot can't edit keep their name (but their channels still get restyled).
      category: { id: cat.id, kind: 'category', oldName: cat.name, newName: cat.editable === false ? cat.name : name },
      channels: restyleChildren(cat.children),
    });
  }
  return { style, groups };
}

const VOICE_MARKER = /\s*\((?:voice|vc)\)\s*$|^\s*(?:🔊|🎙️|🎧)\s*/iu;
const TEXT_MARKER = /\s*\(text\)\s*$/i;
const VOICE_CATEGORY = /\b(voice|vc|vcs|calls?|voice channels)\b/i;
const BULLET = /^\s*(?:[-•*>]|\d+[.)])\s+/;

/**
 * Parses a layout the user typed, e.g.
 *
 *   Info: rules, announcements, roles
 *   Community: general, memes, media
 *   Voice: Lounge, Gaming, Music
 *
 * or with bullets:
 *
 *   Community
 *   - general
 *   - memes
 *
 * Channels can be forced to voice with "(voice)" or a leading 🔊, and to text with "(text)".
 * Inside a category whose name contains "voice"/"vc", channels are voice by default.
 */
export function parseLayout(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim());
  const groups = [];
  let current = null;
  const loose = { name: null, channels: [] };

  const addItems = (group, raw) => {
    const isVoiceCat = group.name && VOICE_CATEGORY.test(cleanName(group.name));
    for (let item of raw.split(',')) {
      item = item.trim().replace(/^#/, '');
      if (!item) continue;
      let kind = isVoiceCat ? 'voice' : 'text';
      if (TEXT_MARKER.test(item)) { kind = 'text'; item = item.replace(TEXT_MARKER, ''); }
      if (VOICE_MARKER.test(item)) { kind = 'voice'; item = item.replace(VOICE_MARKER, ''); }
      if (cleanName(item)) group.channels.push({ name: item.trim(), kind });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const isBullet = BULLET.test(line);
    const body = line.replace(BULLET, '');
    const colon = body.indexOf(':');

    if (!isBullet && colon > 0) {
      current = { name: body.slice(0, colon).trim(), channels: [] };
      groups.push(current);
      addItems(current, body.slice(colon + 1));
      continue;
    }
    if (!isBullet && !body.includes(',')) {
      // Header if the next non-empty line is a bullet; otherwise it's a single channel.
      const next = lines.slice(i + 1).find(Boolean);
      if (next && BULLET.test(next)) {
        current = { name: body, channels: [] };
        groups.push(current);
        continue;
      }
    }
    addItems(current ?? loose, body);
  }

  return loose.channels.length ? [loose, ...groups] : groups;
}

function kindGroup(kind) {
  if (kind === 'category') return 'category';
  return isVoiceKind(kind) ? 'voice' : 'text';
}

function matchKey(name) {
  return cleanName(name).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Builds a plan from a typed layout. Channels/categories that already exist
 * (same name, ignoring emojis/decorations) are reused and renamed/moved instead of duplicated.
 * returns { style, groups: [{ category: action|null, channels: action[] }] }
 * action = { op: 'create'|'update', id?, kind, oldName?, newName, oldParentId? }
 */
export function buildLayoutPlan(layout, structure, { styleId, seed = 0, styleSeed = seed } = {}) {
  const style = resolveStyle(styleId, styleSeed);
  const existing = [];
  for (const cat of structure.categories ?? []) {
    existing.push({ id: cat.id, name: cat.name, kind: 'category', parentId: null });
    for (const ch of cat.children) existing.push({ ...ch, parentId: cat.id });
  }
  for (const ch of structure.loose ?? []) existing.push({ ...ch, parentId: null });

  const claimed = new Set();
  const findExisting = (name, kind) => {
    const key = matchKey(name);
    const found = existing.find((e) => !claimed.has(e.id) && kindGroup(e.kind) === kindGroup(kind) && matchKey(e.name) === key);
    if (found) claimed.add(found.id);
    return found;
  };

  const usedCategoryEmojis = new Set();
  const groups = layout.map((g) => {
    let category = null;
    if (g.name) {
      const { name } = formatName(g.name, 'category', style, {
        seed, used: usedCategoryEmojis, fallbackKey: categoryFallbackKey(g.channels),
      });
      const ex = findExisting(g.name, 'category');
      category = ex
        ? { op: 'update', id: ex.id, kind: 'category', oldName: ex.name, newName: name }
        : { op: 'create', kind: 'category', newName: name };
    }
    const used = new Set();
    const channels = g.channels.map((ch) => {
      const ex = findExisting(ch.name, ch.kind);
      const kind = ex ? ex.kind : ch.kind;
      const { name } = formatName(ch.name, kind, style, { seed, used });
      return ex
        ? { op: 'update', id: ex.id, kind, oldName: ex.name, newName: name, oldParentId: ex.parentId }
        : { op: 'create', kind, newName: name };
    });
    return { category, channels };
  });

  return { style, groups };
}
