// Reads the server's channel layout (used by the verification wizard).

import { ChannelType } from 'discord.js';
import { isVoiceKind } from './styler/engine.js';

const KIND_BY_TYPE = {
  [ChannelType.GuildText]: 'text',
  [ChannelType.GuildAnnouncement]: 'announcement',
  [ChannelType.GuildForum]: 'forum',
  [ChannelType.GuildMedia]: 'media',
  [ChannelType.GuildVoice]: 'voice',
  [ChannelType.GuildStageVoice]: 'stage',
  [ChannelType.GuildCategory]: 'category',
};

export const kindOf = (channel) => KIND_BY_TYPE[channel.type] ?? 'text';

/** The server's channels in the order Discord shows them. Channels the bot can't edit are counted in `skipped`. */
export async function snapshot(guild) {
  const all = [...(await guild.channels.fetch()).values()].filter((c) => c && !c.isThread() && KIND_BY_TYPE[c.type] !== undefined);
  const sortChildren = (a, b) =>
    Number(isVoiceKind(kindOf(a))) - Number(isVoiceKind(kindOf(b))) || a.rawPosition - b.rawPosition || a.id.localeCompare(b.id);

  let skipped = 0;
  const toEntry = (c) => ({ id: c.id, name: c.name, kind: kindOf(c) });
  const editable = (c) => {
    if (c.manageable) return true;
    skipped++;
    return false;
  };

  const categories = all
    .filter((c) => c.type === ChannelType.GuildCategory)
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((cat) => ({
      id: cat.id,
      name: cat.name,
      editable: editable(cat),
      children: all.filter((c) => c.parentId === cat.id).filter(editable).sort(sortChildren).map(toEntry),
    }));

  const loose = all.filter((c) => !c.parentId && c.type !== ChannelType.GuildCategory).filter(editable).sort(sortChildren).map(toEntry);
  return { categories, loose, skipped };
}
