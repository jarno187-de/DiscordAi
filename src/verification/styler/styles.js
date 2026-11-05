// Style presets. Each preset only decides the "frame" around a name —
// emojis and wording always come from the channel's own name.
//
// Formatters get: { e: emoji, slug: 'off-topic', title: 'Off Topic' }
//   text     -> text / announcement / forum channels (Discord forces lowercase + hyphens)
//   voice    -> voice / stage channels (spaces and capitals allowed)
//   category -> categories (Discord shows them in uppercase anyway)

const SMALL_CAPS = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ',
  n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
};
export const SMALL_CAPS_REVERSE = Object.fromEntries(
  Object.entries(SMALL_CAPS).filter(([k, v]) => k !== v).map(([k, v]) => [v, k]),
);

export const smallCaps = (s) => [...s].map((c) => SMALL_CAPS[c.toLowerCase()] ?? c).join('');

export const STYLES = [
  {
    id: 'clean',
    name: 'Clean Dots',
    blurb: 'Simple and tidy — a soft dot between emoji and name.',
    text: ({ e, slug }) => `${e}・${slug}`,
    voice: ({ e, title }) => `${e}・${title}`,
    category: ({ e, title }) => `${e} ${title}`,
  },
  {
    id: 'bars',
    name: 'Sleek Bars',
    blurb: 'Sharp vertical bars with framed categories.',
    text: ({ e, slug }) => `${e}┃${slug}`,
    voice: ({ e, title }) => `${e}┃${title}`,
    category: ({ e, title }) => `━ ${e} ${title} ━`,
  },
  {
    id: 'brackets',
    name: 'Cozy Brackets',
    blurb: 'Emojis tucked into little corner brackets.',
    text: ({ e, slug }) => `「${e}」${slug}`,
    voice: ({ e, title }) => `「${e}」${title}`,
    category: ({ e, title }) => `﹝${e}﹞${title}`,
  },
  {
    id: 'arrows',
    name: 'Arrows',
    blurb: 'Pointy and modern, categories open like a tree.',
    text: ({ e, slug }) => `${e}»${slug}`,
    voice: ({ e, title }) => `${e}» ${title}`,
    category: ({ e, title }) => `╭・${e} ${title}`,
  },
  {
    id: 'smallcaps',
    name: 'Small Caps',
    blurb: 'Aesthetic small-caps lettering with sparkly categories.',
    text: ({ e, slug }) => `${e}︱${smallCaps(slug)}`,
    voice: ({ e, title }) => `${e}︱${smallCaps(title)}`,
    category: ({ e, title }) => `✦ ${e} ${smallCaps(title)} ✦`,
  },
  {
    id: 'sparkle',
    name: 'Sparkle',
    blurb: 'Soft, dreamy decorations — great for cozy servers.',
    text: ({ e, slug }) => `${e}﹒${slug}`,
    voice: ({ e, title }) => `${e}﹒${title}`,
    category: ({ e, title }) => `⋆˚｡ ${e} ${title} ｡˚⋆`,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    blurb: 'Just emoji + name, categories stay plain text.',
    text: ({ e, slug }) => `${e}-${slug}`,
    voice: ({ e, title }) => `${e} ${title}`,
    category: ({ title }) => `${title}`,
  },
];

export const AUTO_STYLE_ID = 'auto';

export function getStyle(id) {
  return STYLES.find((s) => s.id === id) ?? null;
}
