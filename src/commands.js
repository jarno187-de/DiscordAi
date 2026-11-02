import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import * as brain from './brain.js';
import { speak } from './speak.js';
import { obsessionOfTheDay } from './personality.js';
import { watermark } from './watermark.js';

const NO_PINGS = { parse: [] };

export const definitions = [
  new SlashCommandBuilder().setName('braincell').setDescription("Check on Brian's one and only brain cell"),
  new SlashCommandBuilder()
    .setName('feed')
    .setDescription('Feed the brain cell something. Anything. He will eat it.')
    .addStringOption((o) => o.setName('food').setDescription('What do you feed him?').setRequired(true).setMaxLength(100)),
  new SlashCommandBuilder().setName('steal').setDescription("Steal Brian's brain cell. He will not take it well."),
  new SlashCommandBuilder().setName('giveback').setDescription('Return the brain cell you stole (coward)'),
  new SlashCommandBuilder()
    .setName('conspiracy')
    .setDescription('Brian reveals the "truth" about someone')
    .addUserOption((o) => o.setName('target').setDescription('The suspect').setRequired(true)),
  new SlashCommandBuilder()
    .setName('advice')
    .setDescription('Get life advice from someone with one brain cell')
    .addStringOption((o) => o.setName('problem').setDescription('Your problem').setRequired(true).setMaxLength(300)),
  new SlashCommandBuilder()
    .setName('rate')
    .setDescription('Brian rates literally anything on a scale that makes no sense')
    .addStringOption((o) => o.setName('thing').setDescription('What should he rate?').setRequired(true).setMaxLength(200)),
  new SlashCommandBuilder()
    .setName('opinion')
    .setDescription('What does Brian think of you (or someone else)?')
    .addUserOption((o) => o.setName('user').setDescription('Leave empty for yourself')),
].map((c) => c.setDMPermission(false).toJSON());

function bar(value) {
  const filled = Math.round(value / 10);
  return '🟩'.repeat(filled) + '⬛'.repeat(10 - filled);
}

const who = (i) => ({ id: i.user.id, realName: i.member?.displayName || i.user.globalName || i.user.username });

const handlers = {
  async braincell(i) {
    const g = brain.getState(i.guildId);
    const tier = brain.tierOf(g);
    const embed = new EmbedBuilder()
      .setTitle(`🧠 The Brain Cell — ${brain.TIER_LABELS[tier]}`)
      .setColor(g.holder ? 0xe74c3c : g.energy >= 45 ? 0x2ecc71 : 0xf1c40f);

    if (g.holder) {
      const left = brain.STEAL_DURATION_MS - (Date.now() - g.holder.since);
      embed.setDescription(
        `🚨 **STOLEN** by <@${g.holder.userId}>!\nIt will crawl back home in about **${brain.fmtDuration(left)}**.\n` +
          'Use `/steal` to steal it from the thief, or the thief can `/giveback`.',
      );
    } else {
      embed.setDescription(`Safe inside Brian's skull. For now.\n\n**Energy:** ${bar(g.energy)} ${g.energy}/100`);
    }

    embed.addFields({ name: "Today's obsession", value: obsessionOfTheDay(i.guildId) });
    const top = brain.leaderboard(i.guildId);
    if (top.length) {
      embed.addFields({
        name: '🏆 Most wanted thieves (time holding the cell)',
        value: top.map((e, n) => `${n + 1}. <@${e.id}> — ${brain.fmtDuration(e.heldMs)} (${e.steals}× stolen)`).join('\n'),
      });
    }
    embed.setFooter({ text: `Thoughts thought so far: ${g.thoughts || 0}` });
    await i.reply({ embeds: [embed], allowedMentions: NO_PINGS });
  },

  async feed(i) {
    const food = i.options.getString('food', true);
    const res = brain.feed(i.guildId, i.user.id, food);
    if (!res.ok) {
      return i.reply({
        content: `Brian is still chewing. Try again in ${brain.fmtDuration(res.waitMs)}.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    await i.deferReply();
    const task = res.stolen
      ? `${who(i).realName} tries to feed you "${food}", but your brain cell is stolen so the food just rattles around your empty head. React in 1-2 sentences.`
      : `${who(i).realName} just fed your brain cell "${food}". It was ${res.note}. ` +
        `Your energy went from ${res.before} to ${res.after}. React to eating it in 1-2 sentences.`;
    const text = await speak({ guildId: i.guildId, speaker: who(i), task });
    const gained = res.after - res.before;
    const extra = res.value > gained ? ' · brain cell is full, the rest leaked out of his ears' : '';
    await i.editReply({
      content: `🍽️ *${who(i).realName} feeds Brian **${food}***\n${text}\n-# 🧠 Energy ${res.before} → ${res.after} (${gained >= 0 ? '+' : ''}${gained})${extra}`,
      allowedMentions: NO_PINGS,
    });
  },

  async steal(i) {
    const me = who(i);
    const res = brain.steal(i.guildId, i.user.id, me.realName);
    if (!res.ok) {
      const msg = {
        already: "You already have the brain cell, genius. It's in your pocket. Stop patting it.",
        cooldown: `Your thief hands are tired. Try again in ${brain.fmtDuration(res.waitMs)}.`,
        protected: `${res.holder?.name} is still guarding it. Try again in ${brain.fmtDuration(res.waitMs)}.`,
      }[res.reason];
      return i.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }
    await i.deferReply();
    const task = res.victim
      ? `${me.realName} just stole your brain cell from ${res.victim.name}, who had stolen it before! You still have zero brain cells. React to this chaos.`
      : `${me.realName} just STOLE your one and only brain cell! You are now completely brainless. React dramatically (in caveman speak).`;
    const text = await speak({ guildId: i.guildId, speaker: me, task });
    const header = res.victim
      ? `🦝 **${me.realName}** snatched the brain cell from **${res.victim.name}**!`
      : `🧠💨 **${me.realName}** stole Brian's brain cell!`;
    await i.editReply({
      content: `${header}\n${text}\n-# It crawls back home in ${brain.fmtDuration(brain.STEAL_DURATION_MS)} — unless someone steals it first.`,
      allowedMentions: NO_PINGS,
    });
  },

  async giveback(i) {
    const res = brain.giveBack(i.guildId, i.user.id);
    if (!res.ok) {
      return i.reply({ content: "You don't have the brain cell. Nobody trusts you with it.", flags: MessageFlags.Ephemeral });
    }
    await i.deferReply();
    const text = await speak({
      guildId: i.guildId,
      speaker: who(i),
      task: `${who(i).realName} just gave your brain cell back! You can think again. React with emotional, overly dramatic gratitude (but stay a little suspicious of them).`,
    });
    await i.editReply({ content: `🧠✨ The brain cell is home!\n${text}`, allowedMentions: NO_PINGS });
  },

  async conspiracy(i) {
    const target = i.options.getUser('target', true);
    const member = await i.guild.members.fetch(target.id).catch(() => null);
    const name = member?.displayName || target.globalName || target.username;
    const isBrian = target.id === i.client.user.id;
    await i.deferReply();
    const targetData = brain.meet(i.guildId, target.id);
    const task = isBrian
      ? 'Someone asked you for a conspiracy theory about YOURSELF. Reveal an absurd secret about yourself in 2-4 dramatic sentences.'
      : `Reveal an absurd, harmless conspiracy theory about ${name} (you call them "${targetData.fakeName}"). ` +
        '2-4 sentences, very dramatic, obviously a joke, tie it to your obsession of the day.';
    const text = await speak({ guildId: i.guildId, speaker: who(i), task });
    await i.editReply({ content: `🕵️ **THE TRUTH ABOUT ${name.toUpperCase()}**\n${text}`, allowedMentions: NO_PINGS });
  },

  async advice(i) {
    const problem = i.options.getString('problem', true);
    await i.deferReply();
    const text = await speak({
      guildId: i.guildId,
      speaker: who(i),
      task: `${who(i).realName} asks you for advice: "${problem}". Give terrible, absurd, completely useless (but harmless and never dangerous) advice in 2-3 sentences, with total confidence.`,
    });
    await i.editReply({ content: `> ${problem}\n${text}`, allowedMentions: NO_PINGS });
  },

  async rate(i) {
    const thing = i.options.getString('thing', true);
    await i.deferReply();
    const text = await speak({
      guildId: i.guildId,
      speaker: who(i),
      task: `Rate "${thing}" on a completely made-up nonsense scale (for example "7 out of 3 geese" or "4 soggy spoons out of a lasagna"). One or two sentences with a ridiculous reason.`,
    });
    await i.editReply({ content: `📊 **Rating: ${thing}**\n${text}`, allowedMentions: NO_PINGS });
  },

  async opinion(i) {
    const target = i.options.getUser('user') || i.user;
    if (target.id === i.client.user.id) {
      return i.reply({ content: 'Brian thinks Brian is a 10/10 genius with a perfect brain cell. 🧠👑' });
    }
    const member = await i.guild.members.fetch(target.id).catch(() => null);
    const name = member?.displayName || target.globalName || target.username;
    const u = brain.meet(i.guildId, target.id);
    await i.deferReply();
    const text = await speak({
      guildId: i.guildId,
      speaker: who(i),
      task:
        `Tell everyone what you honestly think of ${name}, whom you insist is called "${u.fakeName}". ` +
        `Your relationship: ${brain.friendshipLabel(u.friendship)}. They stole your brain cell ${u.steals} time(s) and fed you ${u.feeds} time(s). 1-2 sentences.`,
    });
    const embed = new EmbedBuilder()
      .setTitle(`Brian's file on ${name}`)
      .setColor(u.friendship >= 0 ? 0x3498db : 0xc0392b)
      .addFields(
        { name: 'Brian calls them', value: `"${u.fakeName}"`, inline: true },
        { name: 'Status', value: `${brain.friendshipLabel(u.friendship)} (${u.friendship})`, inline: true },
        { name: 'Crimes', value: `🦝 ${u.steals} steals · 🍽️ ${u.feeds} feeds · ⏱️ ${brain.fmtDuration(u.heldMs)} held`, inline: false },
      )
      .setDescription(text);
    await i.editReply({ embeds: [embed], allowedMentions: NO_PINGS });
  },
};

export async function handle(interaction) {
  const h = handlers[interaction.commandName];
  if (!h) return;
  // Sign every reply (including errors and ephemeral ones) with the watermark.
  const reply = interaction.reply.bind(interaction);
  const editReply = interaction.editReply.bind(interaction);
  interaction.reply = (p) => reply(watermark(p));
  interaction.editReply = (p) => editReply(watermark(p));
  try {
    await h(interaction);
  } catch (err) {
    console.error(`[cmd /${interaction.commandName}]`, err);
    const msg = { content: 'Brian tripped over his own brain cell. Something broke. 🫠', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content: msg.content }).catch(() => {});
    else await interaction.reply(msg).catch(() => {});
  }
}
