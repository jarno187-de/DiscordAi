// Verification system: Verified / Unverified roles, per-channel visibility and a "Verify" button.
//
// How access works (so it also works for people who have no role at all yet):
//   @everyone  -> sees exactly what Unverified sees
//   Unverified -> sees the channels ticked for "Unverified"
//   Verified   -> sees the channels ticked for "Verified" (role overwrites beat @everyone)
// Staff roles with their own "allow" overwrites keep their access, admins always see everything.

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, StringSelectMenuBuilder, ChannelType, EmbedBuilder,
  GatewayIntentBits, MessageFlags, PermissionFlagsBits, RoleSelectMenuBuilder, Routes, escapeMarkdown,
} from 'discord.js';
import { snapshot } from './guild.js';
import { cleanName, formatName, isTextKind, resolveStyle } from './styler/engine.js';
import { getGuildConfig, setGuildConfig, saveBackup, loadBackup, clearBackup } from './storage.js';
import { COLOR, simpleEmbed } from './ui.js';
import { RULES } from './verify-flow.js';

const EPHEMERAL = { flags: MessageFlags.Ephemeral };
const REASON = 'Verification setup';
const OK = 0x57f287;
const WARN = 0xfee75c;
const BAD = 0xed4245;
const MAX_SELECT = 25;

export const VID = {
  verifiedRole: 'verif:verified-role',
  unverifiedRole: 'verif:unverified-role',
  createRoles: 'verif:create-roles',
  next: 'verif:next',
  verifyChannel: 'verif:verify-channel',
  createChannel: 'verif:create-channel',
  unverifiedChannels: 'verif:unverified-channels',
  verifiedChannels: 'verif:verified-channels',
  suggest: 'verif:suggest',
  preview: 'verif:preview',
  autoRole: 'verif:auto-role',
  minAge: 'verif:min-age',
  logChannel: 'verif:log-channel',
  existing: 'verif:existing',
  apply: 'verif:apply',
  back: 'verif:back',
  close: 'verif:close',
  verifyButton: 'verify:go', // the public button in the verify channel (works forever, not tied to a session)
};

const ALL_CHANNEL_TYPES = [
  ChannelType.GuildCategory, ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum,
  ChannelType.GuildMedia, ChannelType.GuildVoice, ChannelType.GuildStageVoice,
];

// ── Pure logic (tested) ──────────────────────────────────────────────────────

const tokens = (name) => cleanName(name).toLowerCase().split(' ');
const isVerifyName = (name) => tokens(name).some((t) => /^verif(y|ication|ied)?$/.test(t));
const PUBLIC_WORDS = new Set(['rules', 'rule', 'welcome', 'verify', 'verification', 'guidelines', 'tos']);
const isPublicName = (name) => tokens(name).some((t) => PUBLIC_WORDS.has(t));

/** Smart defaults: verify + rules + welcome for Unverified, everything except #verify for Verified. */
export function suggestSelection(structure) {
  const channels = [...structure.loose, ...structure.categories.flatMap((c) => c.children)];
  const verify = channels.find((c) => isTextKind(c.kind) && isVerifyName(c.name));
  const verifyChannelId = verify?.id ?? null;

  const unverifiedIds = channels.filter((c) => c.id === verifyChannelId || isPublicName(c.name)).map((c) => c.id).slice(0, MAX_SELECT);
  const verifiedIds = [
    ...structure.categories.map((c) => c.id),
    ...structure.loose.filter((c) => c.id !== verifyChannelId).map((c) => c.id),
  ].slice(0, MAX_SELECT);

  return { verifyChannelId, unverifiedIds, verifiedIds };
}

/**
 * Works out who can see what. Ticking a category = all channels in it.
 * The verify channel is always visible to Unverified, and only visible to Verified if ticked directly.
 * returns [{ category: row|null, channels: row[] }], row = { id, name, kind, unverified, verified, isVerify, skip }
 */
export function computeAccess(structure, { unverifiedIds = [], verifiedIds = [], verifyChannelId = null }) {
  const U = new Set(unverifiedIds);
  const V = new Set(verifiedIds);
  const row = (ch, parent) => {
    const isVerify = ch.id === verifyChannelId;
    return {
      id: ch.id,
      name: ch.name,
      kind: ch.kind,
      isVerify,
      unverified: isVerify || U.has(ch.id) || (!!parent && U.has(parent.id)),
      verified: V.has(ch.id) || (!isVerify && !!parent && V.has(parent.id)),
    };
  };

  const groups = [];
  if (structure.loose.length) groups.push({ category: null, channels: structure.loose.map((c) => row(c, null)) });
  for (const cat of structure.categories) {
    const channels = cat.children.map((c) => row(c, cat));
    groups.push({
      category: {
        id: cat.id,
        name: cat.name,
        kind: 'category',
        isVerify: false,
        skip: cat.editable === false,
        // A category stays visible if anything inside it is.
        unverified: U.has(cat.id) || channels.some((c) => c.unverified),
        verified: V.has(cat.id) || channels.some((c) => c.verified),
      },
      channels,
    });
  }
  return groups;
}

// ── Sessions ─────────────────────────────────────────────────────────────────

const SESSION_TTL = 14 * 60 * 1000;
const sessions = new Map();
const keyOf = (i) => `${i.guildId}:${i.user.id}`;

const hasMemberIntent = (client) => client.options.intents.has(GatewayIntentBits.GuildMembers);

function findRole(guild, word) {
  return guild.roles.cache.find((r) => !r.managed && r.id !== guild.id && cleanName(r.name).toLowerCase() === word) ?? null;
}

function newSession(interaction) {
  const cfg = getGuildConfig(interaction.guildId).verification ?? {};
  const g = interaction.guild;
  const session = {
    page: 'roles',
    verifiedRoleId: (g.roles.cache.has(cfg.verifiedRoleId) && cfg.verifiedRoleId) || findRole(g, 'verified')?.id || null,
    unverifiedRoleId: (g.roles.cache.has(cfg.unverifiedRoleId) && cfg.unverifiedRoleId) || findRole(g, 'unverified')?.id || null,
    verifyChannelId: null,
    createVerify: false, // true = create a brand-new verify channel on Apply
    unverifiedIds: null,
    verifiedIds: null,
    autoRole: cfg.autoUnverified ?? true,
    minAgeDays: cfg.minAccountAgeDays ?? RULES.defaultMinAgeDays,
    logChannelId: cfg.logChannelId ?? null,
    verifyExisting: false,
    error: null,
    busy: false,
  };
  const key = keyOf(interaction);
  clearTimeout(sessions.get(key)?.timer);
  session.timer = setTimeout(() => sessions.delete(key), SESSION_TTL);
  sessions.set(key, session);
  return session;
}

// ── Views ────────────────────────────────────────────────────────────────────

/** Name for a new verify channel, in the server's style (e.g. "🛂・verify"). */
export function verifyChannelName(guildId) {
  const style = resolveStyle(getGuildConfig(guildId).lastStyleId ?? 'clean');
  return formatName('verify', 'text', style, { emoji: '🛂' }).name;
}

function verifyChannelLabel(session, guild) {
  if (session.createVerify) return `🆕 **${escapeMarkdown(verifyChannelName(guild.id))}** — I'll create it at the top of your server when you hit Apply`;
  return session.verifyChannelId ? `<#${session.verifyChannelId}>` : '*not set — pick one or let me create a new one*';
}

const btn = (id, label, style, emoji) => {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  return b;
};

function mentionList(ids, guild) {
  if (!ids?.length) return '*nothing selected*';
  const parts = ids.map((id) => {
    const ch = guild.channels.cache.get(id);
    return ch?.type === ChannelType.GuildCategory ? `📁 **${escapeMarkdown(ch.name)}**` : `<#${id}>`;
  });
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    if (out.length + parts[i].length > 950) return `${out}…and ${parts.length - i} more`;
    out += (out ? ', ' : '') + parts[i];
  }
  return out;
}

function roleWarnings(session, guild) {
  const warn = [];
  const me = guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) warn.push('I need the **Manage Roles** permission.');
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) warn.push('I need the **Manage Channels** permission.');
  for (const id of [session.verifiedRoleId, session.unverifiedRoleId]) {
    const role = id && guild.roles.cache.get(id);
    if (role && !role.editable) warn.push(`My role must be **above** <@&${role.id}> (Server Settings → Roles → drag my role up).`);
  }
  if (session.verifiedRoleId && session.verifiedRoleId === session.unverifiedRoleId) warn.push('Verified and Unverified must be **two different** roles.');
  return warn;
}

function rolesView(session, guild) {
  const warn = roleWarnings(session, guild);
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🔐 Verification Setup · Step 1/3 — Roles')
    .setDescription([
      'New members start as **Unverified** and only see the few channels you allow (like verify & rules).',
      'Once they click **Verify**, they get **Verified** and unlock the channels you picked for them.',
      '',
      'Pick your two roles below — or let me create them.',
    ].join('\n'))
    .addFields(
      { name: '✅ Verified role', value: session.verifiedRoleId ? `<@&${session.verifiedRoleId}>` : '*not set*', inline: true },
      { name: '🔒 Unverified role', value: session.unverifiedRoleId ? `<@&${session.unverifiedRoleId}>` : '*not set*', inline: true },
    );
  if (warn.length) embed.addFields({ name: '⚠️ Heads up', value: warn.map((w) => `• ${w}`).join('\n') });
  if (session.error) embed.addFields({ name: '❌', value: session.error });

  const verifiedSelect = new RoleSelectMenuBuilder().setCustomId(VID.verifiedRole).setPlaceholder('✅ Choose the Verified role').setMinValues(0).setMaxValues(1);
  const unverifiedSelect = new RoleSelectMenuBuilder().setCustomId(VID.unverifiedRole).setPlaceholder('🔒 Choose the Unverified role').setMinValues(0).setMaxValues(1);
  if (session.verifiedRoleId) verifiedSelect.setDefaultRoles(session.verifiedRoleId);
  if (session.unverifiedRoleId) unverifiedSelect.setDefaultRoles(session.unverifiedRoleId);

  const ready = session.verifiedRoleId && session.unverifiedRoleId && !warn.length;
  const buttons = new ActionRowBuilder();
  if (!session.verifiedRoleId || !session.unverifiedRoleId) buttons.addComponents(btn(VID.createRoles, 'Create missing roles', ButtonStyle.Primary, '✨'));
  buttons.addComponents(btn(VID.next, 'Next', ButtonStyle.Success, '➡️').setDisabled(!ready), btn(VID.close, 'Cancel', ButtonStyle.Danger));

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(verifiedSelect), new ActionRowBuilder().addComponents(unverifiedSelect), buttons],
  };
}

function channelsView(session, guild) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🔐 Verification Setup · Step 2/3 — Channels')
    .setDescription([
      'Tick which channels each group can see. Ticking a **category** includes every channel in it.',
      '',
      '🔓 **Unverified** — usually just verify, rules & welcome',
      '✅ **Verified** — usually everything except the verify channel',
      '',
      'Everything not ticked is **hidden** for that group. Staff roles with their own permissions keep their access.',
    ].join('\n'))
    .addFields(
      { name: '🛂 Verify channel (gets the Verify button)', value: verifyChannelLabel(session, guild) },
      { name: '🔓 Unverified can see', value: mentionList(session.unverifiedIds, guild) },
      { name: '✅ Verified can see', value: mentionList(session.verifiedIds, guild) },
    );
  if (session.error) embed.addFields({ name: '❌', value: session.error });

  const verifySelect = new ChannelSelectMenuBuilder()
    .setCustomId(VID.verifyChannel)
    .setPlaceholder('🛂 Verify channel')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(0).setMaxValues(1);
  if (session.verifyChannelId) verifySelect.setDefaultChannels(session.verifyChannelId);

  const multi = (id, placeholder, values) => {
    const m = new ChannelSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder)
      .setChannelTypes(...ALL_CHANNEL_TYPES).setMinValues(0).setMaxValues(MAX_SELECT);
    if (values?.length) m.setDefaultChannels(...values.slice(0, MAX_SELECT));
    return m;
  };

  const buttons = new ActionRowBuilder().addComponents(btn(VID.back, 'Back', ButtonStyle.Secondary, '↩️'));
  buttons.addComponents(
    btn(VID.createChannel, `New verify channel: ${session.createVerify ? 'On' : 'Off'}`, session.createVerify ? ButtonStyle.Primary : ButtonStyle.Secondary, '🆕'),
    btn(VID.suggest, 'Suggest for me', ButtonStyle.Secondary, '🪄'),
    btn(VID.preview, 'Preview', ButtonStyle.Success, '➡️').setDisabled(!session.verifyChannelId && !session.createVerify),
    btn(VID.close, 'Cancel', ButtonStyle.Danger),
  );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(verifySelect),
      new ActionRowBuilder().addComponents(multi(VID.unverifiedChannels, '🔓 Channels Unverified can see', session.unverifiedIds)),
      new ActionRowBuilder().addComponents(multi(VID.verifiedChannels, '✅ Channels Verified can see', session.verifiedIds)),
      buttons,
    ],
  };
}

const icons = (r) => `${r.unverified ? '🔓' : '➖'}${r.verified ? '✅' : '➖'}`;

function previewView(session, guild, groups, skipped) {
  const lines = [];
  if (session.createVerify) lines.push(`🔓➖ **${escapeMarkdown(verifyChannelName(guild.id))}** 🛂 *(new — created on Apply)*`);
  for (const g of groups) {
    if (g.category) lines.push(`${icons(g.category)} **${escapeMarkdown(g.category.name)}**${g.category.skip ? ' *(locked — skipped)*' : ''}`);
    else lines.push('*No category*');
    for (const ch of g.channels) lines.push(`┗ ${icons(ch)} <#${ch.id}>${ch.isVerify ? ' 🛂' : ''}`);
  }
  let description = '🔓 = Unverified can see · ✅ = Verified can see · ➖ = hidden\n\n';
  let hidden = 0;
  for (const l of lines) {
    if (description.length + l.length > 3900) { hidden++; continue; }
    description += `${l}\n`;
  }
  if (hidden) description += `*…and ${hidden} more*`;

  const memberIntent = hasMemberIntent(guild.client);
  const notes = [
    session.createVerify
      ? `🛂 I'll create **${escapeMarkdown(verifyChannelName(guild.id))}** at the top and post the **Verify** button there.`
      : `🛂 The **Verify** button will be posted in <#${session.verifyChannelId}>.`,
    'Nobody can chat in the verify channel — they just click the button.',
  ];
  if (!session.verifyExisting) notes.push('⚠️ Members who don\'t have **Verified** yet will only see 🔓 channels until they click Verify.');
  if (skipped) notes.push(`🔒 ${skipped} channel(s) skipped — I'm not allowed to edit them.`);
  if (!memberIntent) notes.push('ℹ️ Enable the **Server Members Intent** for the bot (Developer Portal → Bot) to unlock the two options below.');

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🔐 Verification Setup · Step 3/3 — Preview')
    .setDescription(description.trim())
    .addFields(
      { name: 'Roles', value: `✅ <@&${session.verifiedRoleId}> · 🔒 <@&${session.unverifiedRoleId}>` },
      {
        name: 'Options',
        value: [
          `${session.autoRole && memberIntent ? '✅' : '❌'} Give new members **Unverified** automatically`,
          `${session.verifyExisting && memberIntent ? '✅' : '❌'} Give all **current** members **Verified** right now`,
        ].join('\n'),
      },
      {
        name: '🛡️ Bot protection',
        value: [
          '🧩 Image captcha with a code (new image on every try, 3 min limit)',
          `📅 Accounts younger than **${session.minAgeDays} day${session.minAgeDays === 1 ? '' : 's'}** are blocked${session.minAgeDays ? '' : ' *(off)*'}`,
          '🚩 Accounts Discord flagged as spam & bot accounts are blocked',
          '⚡ Answers faster than a human can type count as failed',
          '🔒 Too many wrong answers → lockout',
          '🎯 New accounts without avatar get a harder captcha',
          `📝 Log: ${session.logChannelId ? `<#${session.logChannelId}>` : '*off — pick a channel below*'}`,
          '⚙️ Fine-tune everything later with `/verification-settings`',
        ].join('\n'),
      },
      { name: 'Good to know', value: notes.join('\n') },
    )
    .setFooter({ text: 'Nothing has changed yet. Undo later with /verification-restore' });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        btn(VID.apply, 'Apply', ButtonStyle.Success, '✅'),
        btn(VID.back, 'Back', ButtonStyle.Secondary, '↩️'),
        btn(VID.close, 'Cancel', ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        btn(VID.autoRole, `Auto-role new members: ${session.autoRole ? 'On' : 'Off'}`, ButtonStyle.Secondary, '🔒').setDisabled(!memberIntent),
        btn(VID.existing, `Verify current members: ${session.verifyExisting ? 'On' : 'Off'}`, ButtonStyle.Secondary, '👥').setDisabled(!memberIntent),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(VID.minAge).setPlaceholder('📅 Minimum account age').addOptions(
          [0, 1, 3, 7, 14, 30].map((d) => ({
            label: d ? `Account at least ${d} day${d === 1 ? '' : 's'} old` : 'No minimum account age',
            value: String(d),
            emoji: '📅',
            default: session.minAgeDays === d,
          })),
        ),
      ),
      (() => {
        const m = new ChannelSelectMenuBuilder().setCustomId(VID.logChannel).setPlaceholder('📝 Log channel for verifications (optional)')
          .setChannelTypes(ChannelType.GuildText).setMinValues(0).setMaxValues(1);
        if (session.logChannelId) m.setDefaultChannels(session.logChannelId);
        return new ActionRowBuilder().addComponents(m);
      })(),
    ],
  };
}

function progressView(text, done, total) {
  const width = 16;
  const filled = total ? Math.round((done / total) * width) : 0;
  return {
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🔐 Setting up verification…')
      .setDescription(`${text}\n${'▰'.repeat(filled)}${'▱'.repeat(width - filled)}  **${done}/${total}**`)],
    components: [],
  };
}

export function verifyMessage(guild, rulesChannelId, custom = {}) {
  const fill = (t) => t.replaceAll('{server}', guild.name).replaceAll('{rules}', rulesChannelId ? `<#${rulesChannelId}>` : '#rules');
  const embed = new EmbedBuilder()
    .setColor(custom.color ?? COLOR)
    .setTitle(custom.title ? fill(custom.title) : '🛂 Verification')
    .setDescription(custom.text ? fill(custom.text) : [
      `Welcome to **${escapeMarkdown(guild.name)}**! ✨`,
      '',
      rulesChannelId ? `📜 Please read <#${rulesChannelId}> first.` : '📜 Please make sure you read the rules first.',
      '✅ Then click **Verify** below and type the code from the image.',
      '🔓 That unlocks the rest of the server.',
      '',
      'By verifying you agree to follow the rules. Have fun!',
    ].join('\n'));
  if (guild.iconURL()) embed.setThumbnail(guild.iconURL());
  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(btn(VID.verifyButton, custom.button || 'Verify', ButtonStyle.Success, '✅'))],
  };
}

// ── Applying / restoring ─────────────────────────────────────────────────────

function snapshotOverwrite(channel, id) {
  const ow = channel.permissionOverwrites.cache.get(id);
  return ow ? { type: ow.type, allow: ow.allow.bitfield.toString(), deny: ow.deny.bitfield.toString() } : null;
}

async function applyVerification(guild, session, groups, onProgress) {
  const me = guild.members.me;
  const isAdmin = me.permissions.has(PermissionFlagsBits.Administrator);
  const self = me.roles.botRole ?? me; // so I don't lock myself out of channels
  const everyone = guild.roles.everyone;
  const verified = guild.roles.cache.get(session.verifiedRoleId);
  const unverified = guild.roles.cache.get(session.unverifiedRoleId);

  const rows = groups.flatMap((g) => [g.category, ...g.channels].filter(Boolean)).filter((r) => !r.skip);
  const backup = { at: Date.now(), channels: [] };
  const errors = [];
  let done = 0;

  for (const r of rows) {
    const channel = guild.channels.cache.get(r.id);
    if (!channel) continue;
    const targets = [];
    const noChat = r.isVerify ? { SendMessages: false, AddReactions: false, CreatePublicThreads: false, CreatePrivateThreads: false } : {};
    if (!isAdmin) targets.push([self, { ViewChannel: true, ...(r.isVerify ? { SendMessages: true, EmbedLinks: true } : {}) }]);
    targets.push(
      [everyone, { ViewChannel: r.unverified, ...noChat }],
      [unverified, { ViewChannel: r.unverified, ...noChat }],
      [verified, { ViewChannel: r.verified, ...noChat }],
    );

    const saved = {};
    for (const [t] of targets) saved[t.id] = snapshotOverwrite(channel, t.id);
    try {
      for (const [target, perms] of targets) await channel.permissionOverwrites.edit(target, perms, { reason: REASON });
    } catch (err) {
      errors.push({ name: channel.name, reason: err.message?.slice(0, 100) ?? 'error' });
    }
    backup.channels.push({ id: channel.id, selfId: isAdmin ? null : self.id, overwrites: saved });
    done++;
    await onProgress?.('Updating channel permissions…', done, rows.length);
  }
  return { backup, errors, done };
}

/** Posts (or re-posts) the verify message. `target.verifyChannelId` = where to post. */
export async function postVerifyMessage(guild, target, oldCfg) {
  const channel = guild.channels.cache.get(target.verifyChannelId);
  if (!channel) throw new Error('the verify channel no longer exists');
  // Remove the previous verify message so there's only ever one.
  if (oldCfg?.messageId && oldCfg?.verifyChannelId) {
    const oldChannel = guild.channels.cache.get(oldCfg.verifyChannelId);
    await oldChannel?.messages?.delete(oldCfg.messageId).catch(() => {});
  }
  const rules = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.id !== channel.id
    && tokens(c.name).some((t) => t === 'rules' || t === 'rule'));
  const msg = await channel.send(verifyMessage(guild, rules?.id ?? guild.rulesChannelId, oldCfg?.message));
  return msg.id;
}

async function verifyCurrentMembers(guild, session, onProgress) {
  const members = await guild.members.fetch();
  const todo = [...members.values()].filter((m) => !m.user.bot && !m.roles.cache.has(session.verifiedRoleId));
  let done = 0;
  let failed = 0;
  for (const m of todo) {
    try {
      await m.roles.add(session.verifiedRoleId, REASON);
      if (m.roles.cache.has(session.unverifiedRoleId)) await m.roles.remove(session.unverifiedRoleId, REASON);
    } catch {
      failed++;
    }
    done++;
    await onProgress?.('Giving current members the Verified role…', done, todo.length);
  }
  return { verified: done - failed, failed };
}

/** Undo the last verification setup. Used by /verification-restore */
export async function restoreVerification(interaction) {
  const { guild } = interaction;
  const backup = loadBackup(guild.id, 'verification');
  if (!backup) return interaction.reply({ ...simpleEmbed('There\'s no verification setup to undo.'), ...EPHEMERAL });
  await interaction.deferReply(EPHEMERAL);

  let restored = 0;
  const errors = [];
  for (const entry of backup.channels) {
    const channel = guild.channels.cache.get(entry.id);
    if (!channel) continue;
    // Restore my own overwrite last, so I keep access while fixing the others.
    const ids = Object.keys(entry.overwrites).sort((a, b) => Number(a === entry.selfId) - Number(b === entry.selfId));
    try {
      for (const id of ids) {
        const ow = entry.overwrites[id];
        if (ow) await guild.client.rest.put(Routes.channelPermission(channel.id, id), { body: ow, reason: `${REASON} (restore)` });
        else if (channel.permissionOverwrites.cache.has(id)) await channel.permissionOverwrites.delete(id, `${REASON} (restore)`);
      }
      restored++;
    } catch (err) {
      errors.push(`• ${escapeMarkdown(channel.name)} — ${err.message?.slice(0, 100)}`);
    }
  }

  const cfg = getGuildConfig(guild.id).verification;
  let deletedChannel = false;
  if (backup.createdChannelId && guild.channels.cache.has(backup.createdChannelId)) {
    // The verify channel was created by the setup -> remove it again.
    deletedChannel = await guild.channels.cache.get(backup.createdChannelId).delete(`${REASON} (restore)`).then(() => true, () => false);
  } else if (cfg?.messageId) {
    await guild.channels.cache.get(cfg.verifyChannelId)?.messages?.delete(cfg.messageId).catch(() => {});
  }
  setGuildConfig(guild.id, { verification: { ...cfg, messageId: null, enabled: false } });
  if (!errors.length) clearBackup(guild.id, 'verification');

  return interaction.editReply(simpleEmbed([
    `↩️ Permissions restored on **${restored}** channel${restored === 1 ? '' : 's'} and the Verify button was removed.`,
    deletedChannel ? '🗑️ The verify channel I created was deleted.' : '',
    'The roles themselves were kept — delete them in Server Settings if you don\'t need them anymore.',
    errors.length ? `\n**Couldn't restore ${errors.length}:**\n${errors.slice(0, 10).join('\n')}` : '',
  ].filter(Boolean).join('\n'), errors.length ? WARN : OK));
}

// ── Interaction handlers ─────────────────────────────────────────────────────

export async function onVerificationCommand(interaction) {
  const me = interaction.guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles) || !me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply({ ...simpleEmbed('🔒 I need the **Manage Roles** and **Manage Channels** permissions for verification.', BAD), ...EPHEMERAL });
  }
  const session = newSession(interaction);
  return interaction.reply({ ...rolesView(session, interaction.guild), ...EPHEMERAL });
}

async function render(interaction, session, { deferred = false } = {}) {
  const { guild } = interaction;
  let view;
  if (session.page === 'roles') view = rolesView(session, guild);
  else if (session.page === 'channels') view = channelsView(session, guild);
  else {
    const structure = await snapshot(guild);
    view = previewView(session, guild, computeAccess(structure, session), structure.skipped);
  }
  session.error = null;
  return deferred ? interaction.editReply(view) : interaction.update(view);
}

function validRole(guild, id) {
  const role = guild.roles.cache.get(id);
  if (!role) return 'That role no longer exists.';
  if (role.managed) return `${role} belongs to a bot/integration — pick a normal role.`;
  if (role.id === guild.id) return 'You can\'t use @everyone here.';
  return null;
}

export async function onVerificationComponent(interaction) {
  const session = sessions.get(keyOf(interaction));
  if (!session) return interaction.update(simpleEmbed('⌛ This setup has expired. Run `/verification` again.'));
  if (session.busy) return interaction.deferUpdate();
  const { guild } = interaction;

  switch (interaction.customId) {
    case VID.verifiedRole:
    case VID.unverifiedRole: {
      const id = interaction.values[0] ?? null;
      const field = interaction.customId === VID.verifiedRole ? 'verifiedRoleId' : 'unverifiedRoleId';
      const problem = id && validRole(guild, id);
      if (problem) session.error = problem;
      else session[field] = id;
      return render(interaction, session);
    }
    case VID.createRoles: {
      await interaction.deferUpdate();
      if (!session.verifiedRoleId) {
        session.verifiedRoleId = (await guild.roles.create({ name: 'Verified', color: 0x57f287, permissions: [], reason: REASON })).id;
      }
      if (!session.unverifiedRoleId) {
        session.unverifiedRoleId = (await guild.roles.create({ name: 'Unverified', color: 0x99aab5, permissions: [], reason: REASON })).id;
      }
      return render(interaction, session, { deferred: true });
    }
    case VID.next: {
      session.page = 'channels';
      if (!session.unverifiedIds) {
        Object.assign(session, suggestSelection(await snapshot(guild)));
        session.createVerify = !session.verifyChannelId; // no verify channel yet -> plan a new one
      }
      return render(interaction, session);
    }
    case VID.suggest: {
      Object.assign(session, suggestSelection(await snapshot(guild)));
      session.createVerify = !session.verifyChannelId;
      return render(interaction, session);
    }
    case VID.verifyChannel: {
      session.verifyChannelId = interaction.values[0] ?? null;
      if (session.verifyChannelId) {
        session.createVerify = false;
        // The verify channel belongs to Unverified, not Verified.
        if (!session.unverifiedIds.includes(session.verifyChannelId)) session.unverifiedIds = [session.verifyChannelId, ...session.unverifiedIds].slice(0, MAX_SELECT);
        session.verifiedIds = session.verifiedIds.filter((id) => id !== session.verifyChannelId);
      }
      return render(interaction, session);
    }
    case VID.unverifiedChannels:
      session.unverifiedIds = [...interaction.values];
      return render(interaction, session);
    case VID.verifiedChannels:
      session.verifiedIds = [...interaction.values];
      return render(interaction, session);
    case VID.createChannel: {
      // Toggle: create a brand-new verify channel on Apply instead of using an existing one.
      session.createVerify = !session.createVerify;
      if (session.createVerify) session.verifyChannelId = null;
      return render(interaction, session);
    }
    case VID.preview:
      if (!session.verifyChannelId && !session.createVerify) return render(interaction, session);
      session.page = 'preview';
      await interaction.deferUpdate();
      return render(interaction, session, { deferred: true });
    case VID.autoRole:
      session.autoRole = !session.autoRole;
      await interaction.deferUpdate();
      return render(interaction, session, { deferred: true });
    case VID.minAge:
      session.minAgeDays = Number(interaction.values[0]);
      await interaction.deferUpdate();
      return render(interaction, session, { deferred: true });
    case VID.logChannel:
      session.logChannelId = interaction.values[0] ?? null;
      await interaction.deferUpdate();
      return render(interaction, session, { deferred: true });
    case VID.existing:
      session.verifyExisting = !session.verifyExisting;
      await interaction.deferUpdate();
      return render(interaction, session, { deferred: true });
    case VID.back:
      session.page = session.page === 'preview' ? 'channels' : 'roles';
      return render(interaction, session);
    case VID.close:
      clearTimeout(session.timer);
      sessions.delete(keyOf(interaction));
      return interaction.update(simpleEmbed('👋 Verification setup closed. Nothing was changed.'));
    case VID.apply:
      return apply(interaction, session);
    default:
      return undefined;
  }
}

async function apply(interaction, session) {
  const { guild } = interaction;
  const warn = roleWarnings(session, guild);
  if (warn.length) {
    session.page = 'roles';
    session.error = warn.join('\n');
    return render(interaction, session);
  }
  session.busy = true;
  await interaction.update(progressView('Getting started…', 0, 1));

  let last = 0;
  const onProgress = async (text, done, total) => {
    if (Date.now() - last < 2500 && done < total) return;
    last = Date.now();
    await interaction.editReply(progressView(text, done, total)).catch(() => {});
  };

  try {
    let createdChannelId = null;
    if (session.createVerify) {
      const channel = await guild.channels.create({
        name: verifyChannelName(guild.id),
        type: ChannelType.GuildText,
        position: 0,
        topic: '✅ Click the Verify button below to unlock the server.',
        reason: REASON,
      });
      createdChannelId = channel.id;
      session.verifyChannelId = channel.id;
      session.unverifiedIds = [channel.id, ...session.unverifiedIds.filter((id) => id !== channel.id)];
      session.verifiedIds = session.verifiedIds.filter((id) => id !== channel.id);
    }

    const structure = await snapshot(guild);
    const groups = computeAccess(structure, session);
    const memberIntent = hasMemberIntent(interaction.client);
    const oldCfg = getGuildConfig(guild.id).verification;

    const { backup, errors, done } = await applyVerification(guild, session, groups, onProgress);
    backup.createdChannelId = createdChannelId;
    saveBackup(guild.id, backup, 'verification');

    let messageId = null;
    let messageError = null;
    try {
      messageId = await postVerifyMessage(guild, session, oldCfg);
    } catch (err) {
      messageError = err.message;
    }

    setGuildConfig(guild.id, {
      verification: {
        ...oldCfg, // keep everything set in /verification-settings
        enabled: true,
        verifiedRoleId: session.verifiedRoleId,
        unverifiedRoleId: session.unverifiedRoleId,
        verifyChannelId: session.verifyChannelId,
        messageId,
        autoUnverified: session.autoRole,
        minAccountAgeDays: session.minAgeDays,
        logChannelId: session.logChannelId,
      },
    });

    let members = null;
    if (session.verifyExisting && memberIntent) members = await verifyCurrentMembers(guild, session, onProgress);

    const lines = [
      ...(createdChannelId ? [`🆕 Created the verify channel <#${createdChannelId}>`] : []),
      `✅ Permissions set on **${done - errors.length}** channel${done - errors.length === 1 ? '' : 's'}`,
      messageId ? `🛂 Verify button posted in <#${session.verifyChannelId}>` : `❌ Couldn't post the Verify button: ${messageError}`,
      session.autoRole && memberIntent ? '🔒 New members get **Unverified** automatically' : '🔒 New members without a role see the same as Unverified',
    ];
    if (members) lines.push(`👥 ${members.verified} current member${members.verified === 1 ? '' : 's'} verified${members.failed ? ` (${members.failed} failed)` : ''}`);
    if (errors.length) lines.push('', `**Couldn't update ${errors.length}:**`, ...errors.slice(0, 10).map((e) => `• ${escapeMarkdown(e.name)} — ${e.reason}`));
    lines.push('', 'Undo everything with `/verification-restore`.');

    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(errors.length || !messageId ? WARN : OK).setTitle('🎉 Verification is live!').setDescription(lines.join('\n'))],
      components: [],
    });
  } catch (err) {
    console.error('Verification setup failed:', err);
    await interaction.editReply(simpleEmbed(`❌ Something went wrong: ${err.message}`, BAD)).catch(() => {});
  } finally {
    clearTimeout(session.timer);
    sessions.delete(keyOf(interaction));
  }
}

export { onVerifyButton } from './verify-flow.js';

/** Gives new members the Unverified role (needs the Server Members Intent). */
export async function onMemberJoin(member) {
  const cfg = getGuildConfig(member.guild.id).verification;
  if (!cfg?.enabled || !cfg.autoUnverified || !cfg.unverifiedRoleId || member.user.bot) return;
  await member.roles.add(cfg.unverifiedRoleId, 'New member — not verified yet').catch((err) => {
    console.warn(`Could not give Unverified to ${member.user.tag}: ${err.message}`);
  });
}

// For tests only.
export const _internal = { rolesView, channelsView, previewView, applyVerification };
