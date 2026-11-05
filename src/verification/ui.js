import { EmbedBuilder } from 'discord.js';

export const COLOR = 0x9b87f5;

export function simpleEmbed(text, color = COLOR) {
  return { embeds: [new EmbedBuilder().setColor(color).setDescription(text)], components: [] };
}
