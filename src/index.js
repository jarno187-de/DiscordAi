import { Client, Events, GatewayIntentBits, Partials, ActivityType } from 'discord.js';
import { config } from './config.js';
import * as store from './store.js';
import * as brain from './brain.js';
import * as commands from './commands.js';
import { speak } from './speak.js';
import { describeProviders } from './ai.js';
import { watermark } from './watermark.js';
import { RANDOM_REACTIONS, STYLES, resolveStyle } from './personality.js';

if (!config.token) {
  console.error('❌ DISCORD_TOKEN is missing. Copy .env.example to .env and put your bot token in it.');
  process.exit(1);
}

store.load();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

// ── Short-term memory: the last few messages per channel ──
const HISTORY_SIZE = 14;
const history = new Map(); // channelId -> [{ authorId, name, content, own }]

function remember(message) {
  let text = message.cleanContent?.trim();
  // Drop our own small-print lines (watermark, energy info) so the AI doesn't start copying them.
  if (message.author.id === client.user.id) text = text?.replace(/^-# .*$/gm, '').trim();
  else if (text) text = parseMessage(text).prompt; // the AI shouldn't see ".brian" or "/style ..."
  if (!text) return;
  const list = history.get(message.channelId) || [];
  list.push({
    authorId: message.author.id,
    name: message.member?.displayName || message.author.globalName || message.author.username,
    content: text.slice(0, 500),
    own: message.author.id === client.user.id,
  });
  while (list.length > HISTORY_SIZE) list.shift();
  history.set(message.channelId, list);
}

function historyAsMessages(channelId) {
  return (history.get(channelId) || []).map((m) =>
    m.own ? { role: 'assistant', content: m.content } : { role: 'user', content: `${m.name}: ${m.content}` },
  );
}

// ── ".brian <prompt> /style <style>" ──
const PREFIX_RE = /^\.brian\b\s*/i;
const STYLE_RE = /(?:^|\s)\/style(?:\s+(\S+))?/i;

/** Splits a message into the actual prompt and the requested style name (if any). */
function parseMessage(content) {
  const m = STYLE_RE.exec(content);
  const prompt = content.replace(PREFIX_RE, '').replace(STYLE_RE, ' ').trim();
  return { prompt, styleName: m ? m[1] || '' : null };
}

// ── Anti-spam ──
const userCooldown = new Map();
const interjectCooldown = new Map();
const USER_COOLDOWN_MS = 4000;
const INTERJECT_COOLDOWN_MS = 3 * 60 * 1000;

const busyChannels = new Set();
const triggerRe = config.triggerWord
  ? new RegExp(`\\b${config.triggerWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
  : null;

function isAddressed(message) {
  if (PREFIX_RE.test(message.content)) return true;
  if (message.mentions.users.has(client.user.id)) return true;
  if (message.mentions.repliedUser?.id === client.user.id) return true;
  if (config.chatChannelIds.includes(message.channelId)) return true;
  if (triggerRe && triggerRe.test(message.content)) return true;
  return false;
}

async function respond(message, task, style = 'dumb') {
  const speaker = {
    id: message.author.id,
    realName: message.member?.displayName || message.author.globalName || message.author.username,
  };
  busyChannels.add(message.channelId);
  const typing = setInterval(() => message.channel.sendTyping().catch(() => {}), 8000);
  message.channel.sendTyping().catch(() => {});
  try {
    const text = await speak({
      guildId: message.guildId,
      speaker,
      history: historyAsMessages(message.channelId),
      task,
      style,
    });
    await message.reply(watermark({ content: text, allowedMentions: { parse: [], repliedUser: false } }));
  } finally {
    clearInterval(typing);
    busyChannels.delete(message.channelId);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`🧠 ${c.user.tag} is online with exactly one brain cell.`);
  console.log(`   AI chain: ${describeProviders()}`);
  c.user.setActivity('with my brain cell', { type: ActivityType.Playing });

  try {
    if (config.guildId) {
      const g = await c.guilds.fetch(config.guildId);
      await g.commands.set(commands.definitions);
      console.log(`✅ Slash commands registered on server "${g.name}".`);
    } else {
      await c.application.commands.set(commands.definitions);
      console.log('✅ Slash commands registered globally (may take a while to show up).');
    }
  } catch (err) {
    console.error('⚠️ Could not register slash commands:', err.message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.inGuild()) return;
  await commands.handle(interaction);
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.inGuild()) return;
  remember(message);
  if (message.author.bot) return;

  try {
    // Random weird emoji reaction, just because.
    if (Math.random() < config.reactChance) {
      const emoji = RANDOM_REACTIONS[Math.floor(Math.random() * RANDOM_REACTIONS.length)];
      message.react(emoji).catch(() => {});
    }

    const now = Date.now();
    if (isAddressed(message)) {
      if (now - (userCooldown.get(message.author.id) || 0) < USER_COOLDOWN_MS) return;
      userCooldown.set(message.author.id, now);

      const { prompt, styleName } = parseMessage(message.content);
      const style = resolveStyle(styleName);
      if (!style) {
        const list = Object.keys(STYLES).map((k) => `\`${k}\``).join(', ');
        await message.reply(
          watermark({
            content: `I don't know the style \`${styleName || '(nothing)'}\`. Try one of: ${list}\nExample: \`.brian how are you /style insult\``,
            allowedMentions: { parse: [], repliedUser: false },
          }),
        );
        return;
      }

      const delta = brain.vibeCheck(message.content);
      if (delta) brain.adjustFriendship(message.guildId, message.author.id, delta);

      await respond(message, prompt ? undefined : 'They called you but said nothing else. Greet them.', style);
      return;
    }

    // Brian sometimes butts into conversations nobody invited him to.
    if (
      Math.random() < config.interjectChance &&
      !busyChannels.has(message.channelId) &&
      now - (interjectCooldown.get(message.channelId) || 0) > INTERJECT_COOLDOWN_MS
    ) {
      interjectCooldown.set(message.channelId, now);
      await respond(
        message,
        'Nobody talked to you, but you butt into this conversation uninvited with one short, dumb, confident comment about what they are saying.',
        'dumb',
      );
    }
  } catch (err) {
    console.error('[message]', err);
  }
});

client.login(config.token);
