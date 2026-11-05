// Takeover after an update / reinstall: looks at what the bot already set up on the server
// and fills in any missing settings, so everything just keeps working as before.
//
// This only READS the server. It never renames, moves, reposts or deletes anything.
// Settings that already exist in data/guilds.json are never overwritten.

import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig, setGuildConfig } from './storage.js';
import { cleanName, formatName, isVoiceKind } from './styler/engine.js';
import { STYLES } from './styler/styles.js';
import { kindOf } from './guild.js';

const VERIFY_BUTTON = 'verify:go';
const LOG_PATTERN = /verified\*\* \(captcha|failed the captcha|blocked\*\* before the captcha|locked out/i;
const MAX_CHANNELS_TO_SCAN = 60;
const MESSAGES_PER_CHANNEL = 50;

const tokens = (name) => cleanName(name).toLowerCase().split(' ');

/** Which style preset do the current channel names match best? Returns a style id or null. */
export function detectStyle(channels) {
  let best = null;
  let bestScore = 0;
  for (const style of STYLES) {
    let score = 0;
    for (const ch of channels) {
      const kind = ch.kind ?? 'text';
      if (formatName(ch.name, kind, style, { keepEmoji: true }).name === ch.name) score++;
    }
    if (score > bestScore) { best = style.id; bestScore = score; }
  }
  // Needs a few matches, otherwise the server just isn't styled by us.
  return bestScore >= Math.min(3, channels.length) && bestScore > 0 ? best : null;
}

function findRoleByName(guild, word) {
  return guild.roles.cache.find((r) => !r.managed && r.id !== guild.id && cleanName(r.name).toLowerCase() === word) ?? null;
}

function buttonIds(message) {
  return (message.components ?? []).flatMap((row) => row.components ?? []).map((c) => c.customId ?? c.data?.custom_id).filter(Boolean);
}

/** Roles from the verify channel's permissions: Unverified can see it, Verified can't. */
function rolesFromOverwrites(guild, channel) {
  let verified = null;
  let unverified = null;
  for (const ow of channel.permissionOverwrites?.cache?.values() ?? []) {
    if (ow.type !== 0 || ow.id === guild.id) continue;
    const role = guild.roles.cache.get(ow.id);
    if (!role || role.managed) continue;
    if (ow.allow?.has?.(PermissionFlagsBits.ViewChannel)) unverified ??= role;
    else if (ow.deny?.has?.(PermissionFlagsBits.ViewChannel)) verified ??= role;
  }
  return { verified, unverified };
}

/**
 * Scans the server and returns what could be recovered (without saving anything).
 * returns { verification: {...}|null, styleId: string|null, found: string[] }
 */
export async function scanGuild(guild) {
  const me = guild.members.me;
  const found = [];
  const all = [...guild.channels.cache.values()].filter((c) => c && !c.isThread?.());

  // Verify channels first, then the rest.
  const textChannels = all
    .filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
    .filter((c) => !me?.permissionsIn || me.permissionsIn(c).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]))
    .sort((a, b) => Number(!tokens(a.name).some((t) => t.startsWith('verif'))) - Number(!tokens(b.name).some((t) => t.startsWith('verif'))))
    .slice(0, MAX_CHANNELS_TO_SCAN);

  let verifyMessage = null;
  let logChannel = null;
  for (const channel of textChannels) {
    if (verifyMessage && logChannel) break;
    const messages = await channel.messages?.fetch({ limit: MESSAGES_PER_CHANNEL }).catch(() => null);
    if (!messages) continue;
    for (const msg of messages.values()) {
      if (msg.author?.id !== me?.id) continue;
      if (!verifyMessage && buttonIds(msg).includes(VERIFY_BUTTON)) verifyMessage = msg;
      if (!logChannel && msg.embeds?.some((e) => LOG_PATTERN.test(e.description ?? ''))) logChannel = channel;
    }
  }

  let verification = null;
  if (verifyMessage) {
    const channel = verifyMessage.channel;
    const fromOverwrites = rolesFromOverwrites(guild, channel);
    const verified = findRoleByName(guild, 'verified') ?? fromOverwrites.verified;
    const unverified = findRoleByName(guild, 'unverified') ?? fromOverwrites.unverified;
    const embed = verifyMessage.embeds?.[0];
    const button = (verifyMessage.components ?? []).flatMap((r) => r.components ?? []).find((c) => (c.customId ?? c.data?.custom_id) === VERIFY_BUTTON);
    verification = {
      enabled: !!verified,
      verifyChannelId: channel.id,
      messageId: verifyMessage.id,
      verifiedRoleId: verified?.id ?? null,
      unverifiedRoleId: unverified?.id ?? null,
      logChannelId: logChannel?.id ?? null,
      // Keep the exact look of the existing message for any future repost.
      message: { title: embed?.title ?? '', text: embed?.description ?? '', button: button?.label ?? 'Verify', color: embed?.color ?? null },
    };
    found.push(`verify message in #${channel.name}`);
    if (verified) found.push(`Verified role "${verified.name}"`);
    if (unverified) found.push(`Unverified role "${unverified.name}"`);
    if (logChannel) found.push(`log channel #${logChannel.name}`);
  }

  const named = all.map((c) => ({ name: c.name, kind: kindOf(c) })).filter((c) => !isVoiceKind(c.kind) || c.name);
  const styleId = detectStyle(named);
  if (styleId) found.push(`style "${STYLES.find((s) => s.id === styleId).name}"`);

  return { verification, styleId, found };
}

/** Fills in missing settings for one server. Existing saved settings always win. */
export async function recoverGuild(guild) {
  const cfg = getGuildConfig(guild.id);
  const v = cfg.verification ?? {};
  const verifyOk = v.verifiedRoleId && guild.roles.cache.has(v.verifiedRoleId)
    && v.verifyChannelId && guild.channels.cache.has(v.verifyChannelId) && v.messageId;
  const styleOk = !!cfg.lastStyleId;
  if (verifyOk && styleOk) return { changed: false, found: [] };

  const scan = await scanGuild(guild);
  const patch = {};
  const used = [];

  if (!verifyOk && scan.verification) {
    // Only fill gaps — anything already saved stays exactly as it is.
    const saved = Object.fromEntries(Object.entries(v).filter(([, val]) => val !== null && val !== undefined));
    if (!guild.channels.cache.has(saved.verifyChannelId)) { delete saved.verifyChannelId; delete saved.messageId; }
    if (!guild.roles.cache.has(saved.verifiedRoleId)) delete saved.verifiedRoleId;
    if (!guild.roles.cache.has(saved.unverifiedRoleId)) delete saved.unverifiedRoleId;
    patch.verification = { ...scan.verification, ...saved };
    used.push(...scan.found.filter((f) => !f.startsWith('style')));
  }
  if (!styleOk && scan.styleId) {
    patch.lastStyleId = scan.styleId;
    if (!cfg.styleId) patch.styleId = scan.styleId;
    used.push(...scan.found.filter((f) => f.startsWith('style')));
  }
  if (!Object.keys(patch).length) return { changed: false, found: [] };
  setGuildConfig(guild.id, patch);
  return { changed: true, found: used };
}

export async function recoverAll(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      const { changed, found } = await recoverGuild(guild);
      if (changed) console.log(`♻️  ${guild.name}: took over existing setup — ${found.join(', ')}`);
    } catch (err) {
      console.warn(`Could not check existing setup on ${guild.name}: ${err.message}`);
    }
  }
}
