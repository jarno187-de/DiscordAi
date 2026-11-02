// The one place where Brian actually "thinks". Every message & command goes through here.
import { chat } from './ai.js';
import * as brain from './brain.js';
import { systemPrompt, fallbackLine, cleanReply } from './personality.js';
import { config } from './config.js';

/**
 * @param {object} p
 * @param {string} p.guildId
 * @param {{id:string, realName:string}} [p.speaker] who Brian is talking to
 * @param {Array<{role:string, content:string}>} [p.history] recent chat
 * @param {string} [p.task] extra instruction for this specific reply
 */
export async function speak({ guildId, speaker, history = [], task }) {
  const g = brain.getState(guildId);
  const tier = brain.tierOf(g);
  const sp = speaker ? { ...speaker, user: brain.meet(guildId, speaker.id) } : null;

  const messages = [
    { role: 'system', content: systemPrompt({ g, tier, guildId, speaker: sp, botName: config.botName }) },
    ...history,
  ];
  if (task) messages.push({ role: 'user', content: `[${task}]` });
  if (messages.length === 1) messages.push({ role: 'user', content: '[Say something.]' });

  const raw = await chat(messages, { temperature: tier === 'galaxy' ? 0.9 : 1.1, maxTokens: 400 });
  let text = raw ? cleanReply(raw, config.botName) : fallbackLine(tier);

  // A nearly dead brain cell can't produce long thoughts, no matter what the model thinks.
  const limit = { fumes: 220, none: 180 }[tier];
  if (limit && text.length > limit) {
    const cut = text.slice(0, limit);
    text = `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 40))}... ${tier === 'none' ? 'UGG.' : 'zzz'}`;
  }

  brain.think(guildId);
  if (g.justReturned) {
    g.justReturned = false;
  }
  return text || fallbackLine(tier);
}
