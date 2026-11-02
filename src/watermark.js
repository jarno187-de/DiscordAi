// Every single message Brian sends carries this signature.
import { config } from './config.js';

// Discord markdown would turn "__" into underline, so escape it in normal text.
const escapeMd = (s) => s.replace(/([_*~`|\\])/g, '\\$1');

/** Adds the watermark to a message payload (string or { content, embeds, ... }). */
export function watermark(payload) {
  if (!config.watermark) return payload;
  const p = typeof payload === 'string' ? { content: payload } : { ...payload };

  if (p.embeds?.length) {
    // Embed-only messages: sign the footer of the last embed (footers ignore markdown).
    p.embeds = p.embeds.map((e, idx) => {
      const data = typeof e.toJSON === 'function' ? e.toJSON() : { ...e };
      if (idx === p.embeds.length - 1) {
        const old = data.footer?.text;
        data.footer = { ...data.footer, text: old ? `${old} · ${config.watermark}` : config.watermark };
      }
      return data;
    });
    if (!p.content) return p;
  }

  const line = `-# ${escapeMd(config.watermark)}`;
  p.content = p.content ? `${p.content}\n${line}` : line;
  return p;
}
