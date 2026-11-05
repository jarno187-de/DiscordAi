// What happens when someone clicks "Verify":
//
//   1. Background checks (before any captcha is shown)
//      • bot/system accounts are rejected
//      • accounts Discord itself flagged as spammers are rejected
//      • accounts younger than the configured minimum age are rejected
//      • too many failed attempts -> locked out for a while
//      • a "risk score" (new account, no avatar) makes the captcha harder
//   2. Image captcha: a distorted code that has to be typed into a form
//      • the code is random per attempt, bound to that user, expires after 3 minutes
//      • answers faster than a human could read + type are treated as a bot
//      • a wrong answer gives a NEW image; 3 wrong answers = 15 minute lockout
//   3. Only then: Verified role on, Unverified role off (+ optional log message)

import crypto from 'node:crypto';
import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
  ModalBuilder, TextInputBuilder, TextInputStyle, UserFlags, escapeMarkdown,
} from 'discord.js';
import { renderCaptcha, randomCode } from './captcha.js';
import { getGuildConfig } from './storage.js';

const EPHEMERAL = { flags: MessageFlags.Ephemeral };
const COLOR = 0x9b87f5;
const OK = 0x57f287;
const WARN = 0xfee75c;
const BAD = 0xed4245;

export const CID = {
  verify: 'verify:go', // public button in the verify channel
  enter: 'verify:enter',
  refresh: 'verify:refresh',
  modal: 'verify:modal',
  input: 'code',
};

export const RULES = {
  challengeTtl: 3 * 60 * 1000, // captcha expires after 3 min
  minSolveMs: 3500, // nobody reads + types a captcha faster than this
  maxFails: 3, // wrong answers before lockout
  lockMs: 15 * 60 * 1000, // lockout duration
  maxRefresh: 3, // "new image" clicks per challenge
  defaultMinAgeDays: 7,
};

/** All verification settings with their defaults (changed via /verification-settings). */
export const DEFAULTS = {
  enabled: true,
  minAccountAgeDays: RULES.defaultMinAgeDays,
  codeLength: 6,
  difficulty: 'auto', // 'easy' | 'normal' | 'hard' | 'auto' (harder for risky accounts)
  expiryMin: 3,
  minSolveSec: 3.5, // 0 = off
  maxFails: RULES.maxFails,
  lockMin: RULES.lockMs / 60000,
  maxRefresh: RULES.maxRefresh,
  blockSpammers: true,
  blockNoAvatar: false,
  kickOnLockout: false,
  autoUnverified: true,
  dmOnVerify: false,
  logChannelId: null,
  successText: '',
};

export function settingsOf(cfg) {
  return { ...DEFAULTS, ...Object.fromEntries(Object.entries(cfg ?? {}).filter(([, v]) => v !== undefined && v !== null)) };
}

const DIFFICULTY = { easy: 0, normal: 1, hard: 2 };

const DAY = 24 * 60 * 60 * 1000;
const challenges = new Map(); // guild:user -> { code, issuedAt, risk, refreshes }
const failures = new Map(); // guild:user -> { count, lockedUntil }
const key = (guildId, userId) => `${guildId}:${userId}`;

// ── Background checks ────────────────────────────────────────────────────────

/**
 * Looks at the account before showing a captcha.
 * returns { blocked: string|null, risk: 0..2, ageDays, notes: string[] }
 */
export function assessAccount(user, { minAgeDays = RULES.defaultMinAgeDays, blockSpammers = true, blockNoAvatar = false, now = Date.now() } = {}) {
  const ageDays = (now - user.createdTimestamp) / DAY;
  const notes = [];
  if (user.bot || user.system) return { blocked: 'Bot accounts can\'t verify.', risk: 2, ageDays, notes: ['bot account'] };
  if (blockSpammers && user.flags?.has?.(UserFlags.Spammer)) {
    return { blocked: 'Your account has been flagged by Discord as likely spam.', risk: 2, ageDays, notes: ['flagged as spammer by Discord'] };
  }
  if (ageDays < minAgeDays) {
    const left = Math.ceil(minAgeDays - ageDays);
    return {
      blocked: `Your Discord account is too new. This server requires accounts to be at least **${minAgeDays} day${minAgeDays === 1 ? '' : 's'}** old — try again in ${left} day${left === 1 ? '' : 's'}.`,
      risk: 2,
      ageDays,
      notes: [`account ${ageDays.toFixed(1)} days old`],
    };
  }
  if (blockNoAvatar && !user.avatar) {
    return { blocked: 'This server requires a profile picture. Set one in your Discord settings, then click Verify again.', risk: 2, ageDays, notes: ['no avatar (blocked by setting)'] };
  }
  let risk = 0;
  if (ageDays < 30) { risk++; notes.push('account < 30 days'); }
  if (!user.avatar) { risk++; notes.push('no avatar'); }
  return { blocked: null, risk: Math.min(risk, 2), ageDays, notes };
}

function lockInfo(k, now = Date.now()) {
  const f = failures.get(k);
  if (f?.lockedUntil && f.lockedUntil > now) return Math.ceil((f.lockedUntil - now) / 60000);
  if (f?.lockedUntil && f.lockedUntil <= now) failures.delete(k);
  return 0;
}

function registerFailure(k, st = DEFAULTS) {
  const lockMs = st.lockMin * 60000;
  const f = failures.get(k) ?? { count: 0, lockedUntil: 0 };
  f.count++;
  if (f.count >= st.maxFails) {
    f.lockedUntil = Date.now() + lockMs;
    f.count = 0;
  }
  failures.set(k, f);
  setTimeout(() => { if (failures.get(k) === f && f.lockedUntil <= Date.now()) failures.delete(k); }, lockMs + 1000).unref?.();
  return f;
}

// ── Challenges ───────────────────────────────────────────────────────────────

export function newChallenge(k, risk, refreshes = 0, st = DEFAULTS) {
  const auto = st.difficulty === 'auto';
  const difficulty = auto ? risk : DIFFICULTY[st.difficulty] ?? 1;
  const code = randomCode(st.codeLength + (auto && risk >= 2 ? 1 : 0));
  const challenge = { code, issuedAt: Date.now(), risk, difficulty, refreshes, ttl: st.expiryMin * 60000, maxRefresh: st.maxRefresh };
  challenges.set(k, challenge);
  setTimeout(() => { if (challenges.get(k) === challenge) challenges.delete(k); }, challenge.ttl + 1000).unref?.();
  return challenge;
}

/** Checks an answer. returns 'ok' | 'wrong' | 'expired' | 'too-fast' */
export function checkAnswer(challenge, answer, now = Date.now(), minSolveMs = RULES.minSolveMs) {
  if (!challenge || now - challenge.issuedAt > (challenge.ttl ?? RULES.challengeTtl)) return 'expired';
  if (now - challenge.issuedAt < minSolveMs) return 'too-fast';
  const given = Buffer.from(String(answer).toUpperCase().replace(/[\s-]/g, ''));
  const expected = Buffer.from(challenge.code);
  if (given.length !== expected.length) return 'wrong';
  return crypto.timingSafeEqual(given, expected) ? 'ok' : 'wrong';
}

function captchaView(challenge, guildName, notice) {
  const file = new AttachmentBuilder(renderCaptcha(challenge.code, { difficulty: challenge.difficulty ?? challenge.risk }), { name: 'captcha.png' });
  const embed = new EmbedBuilder()
    .setColor(notice ? WARN : COLOR)
    .setTitle('🧩 Prove you\'re human')
    .setDescription([
      notice ?? `Almost there! Type the **${challenge.code.length} characters** from the image to join **${escapeMarkdown(guildName)}**.`,
      '',
      '• Click **Enter code** and type what you see',
      '• Capital or small letters don\'t matter',
      '• Can\'t read it? Click **New image**',
    ].join('\n'))
    .setImage('attachment://captcha.png')
    .setFooter({ text: `This code expires in ${Math.round((challenge.ttl ?? RULES.challengeTtl) / 60000)} minute(s).` });
  return {
    embeds: [embed],
    files: [file],
    attachments: [],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(CID.enter).setLabel('Enter code').setStyle(ButtonStyle.Success).setEmoji('⌨️'),
        new ButtonBuilder().setCustomId(CID.refresh).setLabel('New image').setStyle(ButtonStyle.Secondary).setEmoji('🔄')
          .setDisabled(challenge.refreshes >= (challenge.maxRefresh ?? RULES.maxRefresh)),
      ),
    ],
  };
}

const plain = (text, color) => ({ embeds: [new EmbedBuilder().setColor(color).setDescription(text)], components: [], files: [], attachments: [] });

// ── Logging ──────────────────────────────────────────────────────────────────

async function log(guild, cfg, color, text) {
  console.log(`[verify] ${guild.name}: ${text.replace(/\*\*/g, '')}`);
  if (!cfg.logChannelId) return;
  const channel = guild.channels.cache.get(cfg.logChannelId);
  await channel?.send({ embeds: [new EmbedBuilder().setColor(color).setDescription(text).setTimestamp()] }).catch(() => {});
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/** Someone clicked the public "Verify" button. */
export async function onVerifyButton(interaction) {
  const raw = getGuildConfig(interaction.guildId).verification;
  if (!raw?.verifiedRoleId) {
    return interaction.reply({ ...plain('Verification isn\'t set up right now. Please contact a staff member.', WARN), ...EPHEMERAL });
  }
  const cfg = settingsOf(raw);
  if (!cfg.enabled) {
    return interaction.reply({ ...plain('⏸️ Verification is paused right now. Please try again later or contact a staff member.', WARN), ...EPHEMERAL });
  }
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (member.roles.cache.has(cfg.verifiedRoleId)) {
    return interaction.reply({ ...plain('✨ You\'re already verified — enjoy the server!', OK), ...EPHEMERAL });
  }
  if (member.pending) {
    return interaction.reply({ ...plain('📜 Please accept the server rules first (the banner at the bottom of your screen), then click Verify again.', WARN), ...EPHEMERAL });
  }

  const k = key(interaction.guildId, interaction.user.id);
  const lockedMin = lockInfo(k);
  if (lockedMin) {
    return interaction.reply({ ...plain(`⏳ Too many wrong answers. Please try again in **${lockedMin} min**.`, BAD), ...EPHEMERAL });
  }

  // Fetch the full user so we get Discord's account flags.
  const user = await interaction.user.fetch(true).catch(() => interaction.user);
  const check = assessAccount(user, cfg.minAccountAgeDays !== undefined ? { ...cfg, minAgeDays: cfg.minAccountAgeDays } : cfg);
  if (check.blocked) {
    await log(interaction.guild, cfg, BAD, `⛔ <@${user.id}> was **blocked** before the captcha — ${check.notes.join(', ')}`);
    return interaction.reply({ ...plain(`⛔ ${check.blocked}`, BAD), ...EPHEMERAL });
  }

  const challenge = newChallenge(k, check.risk, 0, cfg);
  challenge.notes = check.notes;
  return interaction.reply({ ...captchaView(challenge, interaction.guild.name), ...EPHEMERAL });
}

/** "Enter code" -> show the form. */
export async function onEnterCode(interaction) {
  const challenge = challenges.get(key(interaction.guildId, interaction.user.id));
  if (!challenge || Date.now() - challenge.issuedAt > challenge.ttl) {
    return interaction.update(plain('⌛ This captcha expired. Click **Verify** in the verify channel to get a new one.', WARN));
  }
  const input = new TextInputBuilder()
    .setCustomId(CID.input)
    .setLabel('Code from the image')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(4)
    .setMaxLength(12)
    .setPlaceholder('e.g. K7PX3A');
  return interaction.showModal(new ModalBuilder().setCustomId(CID.modal).setTitle('Verification').addComponents(new ActionRowBuilder().addComponents(input)));
}

/** "New image" -> same rules, fresh code. */
export async function onRefresh(interaction) {
  const k = key(interaction.guildId, interaction.user.id);
  const old = challenges.get(k);
  if (!old) return interaction.update(plain('⌛ This captcha expired. Click **Verify** again.', WARN));
  if (old.refreshes >= old.maxRefresh) return interaction.deferUpdate();
  const challenge = newChallenge(k, old.risk, old.refreshes + 1, settingsOf(getGuildConfig(interaction.guildId).verification));
  challenge.notes = old.notes;
  return interaction.update(captchaView(challenge, interaction.guild.name));
}

/** The form with the code was submitted. */
export async function onCodeSubmit(interaction) {
  const { guild } = interaction;
  const raw = getGuildConfig(interaction.guildId).verification;
  const cfg = settingsOf(raw);
  const k = key(interaction.guildId, interaction.user.id);
  const challenge = challenges.get(k);
  const respond = (view) => (interaction.isFromMessage() ? interaction.update(view) : interaction.reply({ ...view, ...EPHEMERAL }));

  if (!raw?.verifiedRoleId || !cfg.enabled) return respond(plain('Verification isn\'t set up right now.', WARN));
  if (lockInfo(k)) return respond(plain(`⏳ Too many wrong answers. Please try again in **${lockInfo(k)} min**.`, BAD));

  const answer = interaction.fields.getTextInputValue(CID.input);
  const result = checkAnswer(challenge, answer, Date.now(), cfg.minSolveSec * 1000);
  const seconds = challenge ? ((Date.now() - challenge.issuedAt) / 1000).toFixed(1) : '?';

  if (result === 'expired') {
    challenges.delete(k);
    return respond(plain('⌛ This captcha expired. Click **Verify** in the verify channel to get a new one.', WARN));
  }

  if (result !== 'ok') {
    challenges.delete(k);
    const f = registerFailure(k, cfg);
    const why = result === 'too-fast' ? 'answered faster than a human can type' : 'wrong code';
    if (f.lockedUntil) {
      if (cfg.kickOnLockout) {
        await respond(plain(`🚪 That's ${cfg.maxFails} wrong answers — you've been removed from the server. You can rejoin and try again.`, BAD));
        const m = await guild.members.fetch(interaction.user.id).catch(() => null);
        const kicked = await m?.kick(`Failed the captcha ${cfg.maxFails}×`).then(() => true, () => false);
        await log(guild, cfg, BAD, `🚪 <@${interaction.user.id}> failed the captcha ${cfg.maxFails}× and was **${kicked ? 'kicked' : 'locked out (kick failed)'}** (last: ${why})`);
        return undefined;
      }
      await log(guild, cfg, BAD, `🔒 <@${interaction.user.id}> failed the captcha ${cfg.maxFails}× and was **locked out** for ${cfg.lockMin} min (last: ${why})`);
      return respond(plain(`🔒 That's ${cfg.maxFails} wrong answers. Take a short break and try again in **${cfg.lockMin} minutes**.`, BAD));
    }
    await log(guild, cfg, WARN, `❌ <@${interaction.user.id}> failed the captcha (${why}, ${seconds}s)`);
    const left = cfg.maxFails - f.count;
    const next = newChallenge(k, challenge.risk, challenge.refreshes, cfg);
    next.notes = challenge.notes;
    const notice = result === 'too-fast'
      ? `🤖 That was suspiciously fast. Take your time and type the code from this **new** image. (${left} ${left === 1 ? 'try' : 'tries'} left)`
      : `❌ That wasn't right. Here's a **new** image — try again. (${left} ${left === 1 ? 'try' : 'tries'} left)`;
    return respond(captchaView(next, guild.name, notice));
  }

  // ✅ Passed.
  challenges.delete(k);
  failures.delete(k);
  const member = await guild.members.fetch(interaction.user.id);
  try {
    await member.roles.add(cfg.verifiedRoleId, `Passed captcha in ${seconds}s`);
    if (cfg.unverifiedRoleId && member.roles.cache.has(cfg.unverifiedRoleId)) await member.roles.remove(cfg.unverifiedRoleId, 'Verified');
  } catch {
    return respond(plain('😕 You passed, but I couldn\'t give you the role. Please let a staff member know.', BAD));
  }
  const notes = challenge.notes?.length ? ` · ${challenge.notes.join(', ')}` : '';
  await log(guild, cfg, OK, `✅ <@${interaction.user.id}> **verified** (captcha solved in ${seconds}s${notes})`);
  const welcome = cfg.successText?.trim()
    ? cfg.successText.replaceAll('{server}', guild.name).replaceAll('{user}', `<@${interaction.user.id}>`)
    : `🎉 You're verified! Welcome to **${escapeMarkdown(guild.name)}** — the whole server is open for you now.`;
  if (cfg.dmOnVerify) {
    await interaction.user.send({ embeds: [new EmbedBuilder().setColor(OK).setTitle(`✅ Verified on ${guild.name}`).setDescription(welcome)] }).catch(() => {});
  }
  return respond(plain(welcome, OK));
}

// For tests.
export const _state = { challenges, failures, key };
