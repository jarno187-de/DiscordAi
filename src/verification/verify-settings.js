// /verification-settings — every verification option in one menu.
// Changes are saved immediately and apply to the next person who clicks Verify.

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, EmbedBuilder, MessageFlags,
  ModalBuilder, PermissionFlagsBits, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { getGuildConfig, setGuildConfig } from './storage.js';
import { DEFAULTS, settingsOf } from './verify-flow.js';
import { postVerifyMessage } from './verification.js';

const EPHEMERAL = { flags: MessageFlags.Ephemeral };
const COLOR = 0x9b87f5;

const SID = {
  page: 'vset:page',
  codeLength: 'vset:code-length',
  difficulty: 'vset:difficulty',
  expiryMin: 'vset:expiry',
  minSolveSec: 'vset:min-solve',
  minAccountAgeDays: 'vset:min-age',
  maxFails: 'vset:max-fails',
  lockMin: 'vset:lock',
  logChannel: 'vset:log',
  toggle: 'vset:toggle:', // + setting name
  editMessage: 'vset:edit-message',
  editWelcome: 'vset:edit-welcome',
  repost: 'vset:repost',
  reset: 'vset:reset',
  messageModal: 'vset:message-modal',
  welcomeModal: 'vset:welcome-modal',
};

const pages = new Map(); // guild:user -> page
const pageKey = (i) => `${i.guildId}:${i.user.id}`;

const load = (guildId) => getGuildConfig(guildId).verification ?? {};
const save = (guildId, patch) => setGuildConfig(guildId, { verification: { ...load(guildId), ...patch } });

const onOff = (v) => (v ? '✅ On' : '❌ Off');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const DIFF_LABEL = { auto: '🎯 Auto (harder for risky accounts)', easy: '🟢 Easy', normal: '🟡 Normal', hard: '🔴 Hard' };

// ── View ─────────────────────────────────────────────────────────────────────

function select(id, placeholder, options, current) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).addOptions(
      options.map(([value, label, emoji]) => ({ value: String(value), label, emoji, default: String(current) === String(value) })),
    ),
  );
}

const toggleBtn = (name, label, value, emoji) => new ButtonBuilder()
  .setCustomId(SID.toggle + name)
  .setLabel(`${label}: ${value ? 'On' : 'Off'}`)
  .setStyle(value ? ButtonStyle.Success : ButtonStyle.Secondary)
  .setEmoji(emoji);

export function settingsView(guild, page = 'captcha', notice = null) {
  const raw = load(guild.id);
  const st = settingsOf(raw);
  const me = guild.members.me;
  const warnings = [];
  if (!raw.verifiedRoleId) warnings.push('Verification isn\'t set up yet — run `/verification` first. You can still prepare the settings.');
  if (st.kickOnLockout && !me.permissions.has(PermissionFlagsBits.KickMembers)) warnings.push('**Kick on lockout** is on, but I don\'t have the **Kick Members** permission.');
  if (st.logChannelId && !guild.channels.cache.has(st.logChannelId)) warnings.push('The log channel no longer exists.');

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('⚙️ Verification Settings')
    .setDescription([
      notice ?? 'Pick a section below. Changes are saved **instantly** and apply to the next person who clicks Verify.',
      st.enabled ? '' : '\n⏸️ **Verification is paused** — nobody can verify right now.',
    ].join(''))
    .addFields(
      {
        name: '🧩 Captcha',
        value: [
          `Code length: **${st.codeLength}** characters`,
          `Difficulty: **${DIFF_LABEL[st.difficulty]}**`,
          `Code expires after: **${plural(st.expiryMin, 'minute')}**`,
          `Too-fast check: **${st.minSolveSec ? `answers under ${st.minSolveSec}s fail` : 'off'}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '🛡️ Security',
        value: [
          `Verification: **${onOff(st.enabled)}**`,
          `Min. account age: **${st.minAccountAgeDays ? plural(st.minAccountAgeDays, 'day') : 'none'}**`,
          `Wrong answers allowed: **${st.maxFails}** → ${st.kickOnLockout ? '**kick**' : `**${plural(st.lockMin, 'min')} lockout**`}`,
          `Block spam-flagged accounts: **${onOff(st.blockSpammers)}**`,
          `Require profile picture: **${onOff(st.blockNoAvatar)}**`,
          `Auto-give Unverified on join: **${onOff(st.autoUnverified)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '💬 Messages & Log',
        value: [
          `Log channel: ${st.logChannelId ? `<#${st.logChannelId}>` : '**off**'}`,
          `Verify message: **${raw.message?.title || raw.message?.text ? 'custom' : 'default'}**`,
          `Welcome text after verifying: **${st.successText ? 'custom' : 'default'}**`,
          `DM after verifying: **${onOff(st.dmOnVerify)}**`,
        ].join('\n'),
      },
    );
  if (warnings.length) embed.addFields({ name: '⚠️ Heads up', value: warnings.map((w) => `• ${w}`).join('\n') });

  const rows = [select(SID.page, 'Choose a section', [
    ['captcha', 'Captcha', '🧩'], ['security', 'Security', '🛡️'], ['messages', 'Messages & Log', '💬'],
  ], page)];

  if (page === 'captcha') {
    rows.push(
      select(SID.codeLength, 'Code length', [4, 5, 6, 7, 8].map((n) => [n, `${n} characters${n === 6 ? ' (recommended)' : ''}`, '🔤']), st.codeLength),
      select(SID.difficulty, 'Difficulty', Object.entries(DIFF_LABEL).map(([v, l]) => [v, l.replace(/^\S+ /, ''), l.split(' ')[0]]), st.difficulty),
      select(SID.expiryMin, 'Code expires after', [1, 2, 3, 5, 10].map((n) => [n, `Expires after ${plural(n, 'minute')}`, '⏱️']), st.expiryMin),
      select(SID.minSolveSec, 'Too-fast check', [[0, 'Off', '⚡'], ...[2, 3.5, 5, 8].map((n) => [n, `Answers faster than ${n}s count as bot`, '⚡'])], st.minSolveSec),
    );
  } else if (page === 'security') {
    rows.push(
      select(SID.minAccountAgeDays, 'Minimum account age', [[0, 'No minimum', '📅'], ...[1, 3, 7, 14, 30, 60, 90].map((d) => [d, `At least ${plural(d, 'day')} old`, '📅'])], st.minAccountAgeDays),
      select(SID.maxFails, 'Wrong answers allowed', [1, 2, 3, 4, 5, 10].map((n) => [n, `${plural(n, 'wrong answer')} allowed`, '❌']), st.maxFails),
      select(SID.lockMin, 'Lockout duration', [[5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [180, '3 hours'], [1440, '24 hours']].map(([v, l]) => [v, `Lockout: ${l}`, '🔒']), st.lockMin),
      new ActionRowBuilder().addComponents(
        toggleBtn('enabled', 'Verification', st.enabled, st.enabled ? '▶️' : '⏸️'),
        toggleBtn('blockSpammers', 'Block spam', st.blockSpammers, '🚩'),
        toggleBtn('blockNoAvatar', 'Need avatar', st.blockNoAvatar, '🖼️'),
        toggleBtn('kickOnLockout', 'Kick on lockout', st.kickOnLockout, '🚪'),
        toggleBtn('autoUnverified', 'Auto-role', st.autoUnverified, '🔒'),
      ),
    );
  } else {
    const log = new ChannelSelectMenuBuilder().setCustomId(SID.logChannel).setPlaceholder('📝 Log channel (empty = off)')
      .setChannelTypes(ChannelType.GuildText).setMinValues(0).setMaxValues(1);
    if (st.logChannelId) log.setDefaultChannels(st.logChannelId);
    rows.push(
      new ActionRowBuilder().addComponents(log),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(SID.editMessage).setLabel('Edit verify message').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId(SID.editWelcome).setLabel('Edit welcome text').setStyle(ButtonStyle.Primary).setEmoji('🎉'),
        new ButtonBuilder().setCustomId(SID.repost).setLabel('Repost verify message').setStyle(ButtonStyle.Secondary).setEmoji('🔁').setDisabled(!raw.verifyChannelId),
        toggleBtn('dmOnVerify', 'DM', st.dmOnVerify, '📩'),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(SID.reset).setLabel('Reset all settings to default').setStyle(ButtonStyle.Danger).setEmoji('♻️'),
      ),
    );
  }
  return { embeds: [embed], components: rows };
}

// ── Handlers ─────────────────────────────────────────────────────────────────

export async function onSettingsCommand(interaction) {
  pages.set(pageKey(interaction), 'captcha');
  return interaction.reply({ ...settingsView(interaction.guild, 'captcha'), ...EPHEMERAL });
}

const NUMERIC = {
  [SID.codeLength]: 'codeLength',
  [SID.expiryMin]: 'expiryMin',
  [SID.minSolveSec]: 'minSolveSec',
  [SID.minAccountAgeDays]: 'minAccountAgeDays',
  [SID.maxFails]: 'maxFails',
  [SID.lockMin]: 'lockMin',
};
const TOGGLES = new Set(['enabled', 'blockSpammers', 'blockNoAvatar', 'kickOnLockout', 'autoUnverified', 'dmOnVerify']);

export async function onSettingsComponent(interaction) {
  const { guild, customId } = interaction;
  const k = pageKey(interaction);
  const page = () => pages.get(k) ?? 'captcha';
  const refresh = (notice) => interaction.update(settingsView(guild, page(), notice));

  if (customId === SID.page) {
    pages.set(k, interaction.values[0]);
    return refresh();
  }
  if (NUMERIC[customId]) {
    save(guild.id, { [NUMERIC[customId]]: Number(interaction.values[0]) });
    return refresh('✅ Saved.');
  }
  if (customId === SID.difficulty) {
    save(guild.id, { difficulty: interaction.values[0] });
    return refresh('✅ Saved.');
  }
  if (customId === SID.logChannel) {
    save(guild.id, { logChannelId: interaction.values[0] ?? null });
    return refresh(interaction.values[0] ? `✅ Verifications will be logged in <#${interaction.values[0]}>.` : '✅ Logging turned off.');
  }
  if (customId.startsWith(SID.toggle)) {
    const name = customId.slice(SID.toggle.length);
    if (!TOGGLES.has(name)) return interaction.deferUpdate();
    save(guild.id, { [name]: !settingsOf(load(guild.id))[name] });
    return refresh('✅ Saved.');
  }
  if (customId === SID.reset) {
    const raw = load(guild.id);
    const keep = { verifiedRoleId: raw.verifiedRoleId, unverifiedRoleId: raw.unverifiedRoleId, verifyChannelId: raw.verifyChannelId, messageId: raw.messageId };
    setGuildConfig(guild.id, { verification: { ...keep, ...DEFAULTS, message: null } });
    return refresh('♻️ All settings are back to default (roles and channels were kept).');
  }
  if (customId === SID.editMessage) {
    const msg = load(guild.id).message ?? {};
    const field = (id, label, style, max, value, placeholder) => {
      const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(false).setMaxLength(max).setPlaceholder(placeholder);
      if (value) t.setValue(value);
      return new ActionRowBuilder().addComponents(t);
    };
    return interaction.showModal(new ModalBuilder().setCustomId(SID.messageModal).setTitle('Verify message (empty = default)').addComponents(
      field('title', 'Title', TextInputStyle.Short, 200, msg.title, '🛂 Verification'),
      field('text', 'Text — {server} and {rules} work here', TextInputStyle.Paragraph, 2000, msg.text, 'Welcome to {server}! Read {rules}, then click Verify.'),
      field('button', 'Button label', TextInputStyle.Short, 40, msg.button, 'Verify'),
    ));
  }
  if (customId === SID.editWelcome) {
    const t = new TextInputBuilder().setCustomId('text').setLabel('Shown after verifying ({user}, {server})').setStyle(TextInputStyle.Paragraph)
      .setRequired(false).setMaxLength(1000).setPlaceholder('🎉 Welcome {user}! Enjoy {server}.');
    const current = load(guild.id).successText;
    if (current) t.setValue(current);
    return interaction.showModal(new ModalBuilder().setCustomId(SID.welcomeModal).setTitle('Welcome text (empty = default)')
      .addComponents(new ActionRowBuilder().addComponents(t)));
  }
  if (customId === SID.repost) return repost(interaction);
  return interaction.deferUpdate();
}

async function repost(interaction, prefix = '') {
  const raw = load(interaction.guildId);
  if (!raw.verifyChannelId) return interaction.update(settingsView(interaction.guild, pages.get(pageKey(interaction)), 'Run `/verification` first.'));
  await interaction.deferUpdate();
  let notice;
  try {
    const messageId = await postVerifyMessage(interaction.guild, raw, raw);
    save(interaction.guildId, { messageId });
    notice = `${prefix}🔁 Verify message posted in <#${raw.verifyChannelId}>.`;
  } catch (err) {
    notice = `${prefix}❌ Couldn't post the verify message: ${err.message}`;
  }
  return interaction.editReply(settingsView(interaction.guild, pages.get(pageKey(interaction)) ?? 'messages', notice));
}

export async function onSettingsModal(interaction) {
  const get = (id) => interaction.fields.getTextInputValue(id)?.trim() ?? '';
  if (interaction.customId === SID.messageModal) {
    const message = { title: get('title'), text: get('text'), button: get('button') };
    save(interaction.guildId, { message: message.title || message.text || message.button ? message : null });
    // Update the live message right away.
    if (load(interaction.guildId).verifyChannelId) return repost(interaction, '✏️ Verify message saved. ');
    return interaction.update(settingsView(interaction.guild, 'messages', '✏️ Verify message saved — it will be used once verification is set up.'));
  }
  if (interaction.customId === SID.welcomeModal) {
    save(interaction.guildId, { successText: get('text') });
    return interaction.update(settingsView(interaction.guild, 'messages', '🎉 Welcome text saved.'));
  }
  return undefined;
}
