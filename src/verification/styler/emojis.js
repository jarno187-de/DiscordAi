// Keyword -> emoji dictionary.
// Every entry has several emoji variants so the bot can mix things up
// (rerolls, avoiding duplicates inside a category) instead of one fixed look.
// `weak: true` marks generic words ("chat", "voice", ...) that should lose
// against a more specific word in the same name ("music lounge" -> 🎵, not 🛋️).
// `textOnly: true` entries are ignored for voice channels (a voice "General" gets 🔊, not 💬).

export const KEYWORDS = [
  // ── Info / start here ───────────────────────────────────────────
  { keys: ['rules', 'rule', 'tos', 'guidelines', 'regulations'], emojis: ['📜', '📋', '⚖️'] },
  { keys: ['announcements', 'announcement', 'announce', 'news'], emojis: ['📢', '📣', '📰'] },
  { keys: ['updates', 'update', 'changelog', 'patch notes', 'patchnotes'], emojis: ['🆕', '🔔', '📰'] },
  { keys: ['welcome', 'arrivals', 'joins', 'join', 'hello', 'start here', 'starthere'], emojis: ['👋', '🎉', '🌸'] },
  { keys: ['goodbye', 'goodbyes', 'leaves', 'leave', 'bye', 'farewell'], emojis: ['🚪', '🥀', '👋'] },
  { keys: ['info', 'information', 'about', 'server info', 'serverinfo'], emojis: ['📌', 'ℹ️', '🧭'] },
  { keys: ['important', 'pinned', 'read me', 'readme'], emojis: ['📌', '❗', '🚩'] },
  { keys: ['verify', 'verification', 'verified'], emojis: ['✅', '🔐', '🛂'] },
  { keys: ['roles', 'role', 'self roles', 'selfroles', 'reaction roles', 'reactionroles', 'pronouns'], emojis: ['🎭', '🏷️', '🎨'] },
  { keys: ['faq', 'q&a', 'qna'], emojis: ['❓', '💡', '📖'] },
  { keys: ['links', 'link', 'resources', 'socials', 'social media'], emojis: ['🔗', '📚', '🌐'] },
  { keys: ['partners', 'partner', 'partnership', 'partnerships', 'affiliates'], emojis: ['🤝', '💞', '🫱'] },
  { keys: ['boosts', 'boost', 'boosters', 'booster', 'nitro', 'supporters', 'donators', 'vip'], emojis: ['💎', '🚀', '💖'] },

  // ── Community ───────────────────────────────────────────────────
  { keys: ['general', 'main', 'lobby'], emojis: ['💬', '🗨️', '☕'], weak: true, textOnly: true },
  { keys: ['chat', 'chats', 'talk', 'chatting', 'discussion', 'discuss', 'text', 'text channels'], emojis: ['💬', '🗨️', '🗯️'], weak: true, textOnly: true },
  { keys: ['off topic', 'offtopic', 'random', 'misc', 'miscellaneous', 'other'], emojis: ['🎲', '🌀', '🧩'] },
  { keys: ['community', 'social', 'hangout', 'hangouts'], emojis: ['🌐', '🏡', '🫂'] },
  { keys: ['introductions', 'introduction', 'intros', 'intro', 'introduce yourself', 'about me'], emojis: ['🙋', '👤', '🪪'] },
  { keys: ['memes', 'meme', 'funny', 'shitpost', 'shitposting', 'humor', 'jokes'], emojis: ['😂', '🐸', '🤡'] },
  { keys: ['media', 'pics', 'pictures', 'photos', 'photography', 'images', 'gallery'], emojis: ['🖼️', '📸', '🌄'] },
  { keys: ['selfies', 'selfie'], emojis: ['🤳', '📸'] },
  { keys: ['art', 'artwork', 'drawing', 'drawings', 'creative', 'creations', 'showcase'], emojis: ['🎨', '🖌️', '✏️'] },
  { keys: ['clips', 'videos', 'video', 'edits'], emojis: ['🎞️', '📹', '🎬'] },
  { keys: ['quotes', 'quote', 'thoughts', 'qotd'], emojis: ['💭', '🗯️', '✍️'] },
  { keys: ['vent', 'venting', 'feelings', 'mental health', 'support group'], emojis: ['🌧️', '🫂', '💙'] },
  { keys: ['birthdays', 'birthday', 'bday'], emojis: ['🎂', '🥳', '🎈'] },
  { keys: ['counting', 'count', 'numbers'], emojis: ['🔢', '🧮'] },
  { keys: ['starboard', 'highlights', 'hall of fame', 'best of'], emojis: ['⭐', '🌟', '🏅'] },
  { keys: ['fun', 'games corner', 'party'], emojis: ['🎉', '🎈', '🪅'] },

  // ── Interests ───────────────────────────────────────────────────
  { keys: ['music', 'songs', 'song', 'spotify', 'playlist', 'playlists', 'radio'], emojis: ['🎵', '🎶', '🎧'] },
  { keys: ['gaming', 'games', 'game', 'gamers', 'lfg', 'looking for group'], emojis: ['🎮', '🕹️', '👾'] },
  { keys: ['minecraft', 'mc'], emojis: ['⛏️', '🧱', '🟩'] },
  { keys: ['valorant', 'csgo', 'cs2', 'fps', 'shooter', 'fortnite', 'apex', 'cod'], emojis: ['🎯', '🔫', '💥'] },
  { keys: ['league', 'lol', 'moba', 'dota'], emojis: ['⚔️', '🛡️', '🏹'] },
  { keys: ['rpg', 'dnd', 'd&d', 'roleplay', 'rp', 'tabletop'], emojis: ['🐉', '🎲', '🗡️'] },
  { keys: ['anime', 'manga', 'weeb'], emojis: ['🍥', '🌸', '🎌'] },
  { keys: ['movies', 'movie', 'films', 'film', 'cinema', 'tv', 'shows', 'series', 'netflix'], emojis: ['🎬', '🍿', '📺'] },
  { keys: ['books', 'book', 'reading', 'library', 'literature'], emojis: ['📚', '📖', '🔖'] },
  { keys: ['writing', 'stories', 'poetry', 'poems'], emojis: ['✍️', '🪶', '📝'] },
  { keys: ['study', 'studying', 'school', 'homework', 'learning', 'education', 'university', 'college'], emojis: ['🎓', '📚', '✏️'] },
  { keys: ['coding', 'code', 'programming', 'dev', 'development', 'developers', 'tech', 'technology'], emojis: ['💻', '⌨️', '🛠️'] },
  { keys: ['pets', 'pet', 'animals', 'cats', 'cat', 'dogs', 'dog'], emojis: ['🐾', '🐶', '🐱'] },
  { keys: ['food', 'cooking', 'recipes', 'baking', 'drinks'], emojis: ['🍕', '🍳', '🍰'] },
  { keys: ['sports', 'sport', 'football', 'soccer', 'basketball', 'fitness', 'gym', 'workout'], emojis: ['⚽', '🏀', '💪'] },
  { keys: ['travel', 'traveling', 'outdoors', 'nature'], emojis: ['✈️', '🌍', '🏕️'] },
  { keys: ['fashion', 'outfits', 'style'], emojis: ['👗', '👟', '🕶️'] },
  { keys: ['cars', 'car', 'vehicles', 'motorsport'], emojis: ['🚗', '🏎️', '🛞'] },
  { keys: ['streams', 'stream', 'streaming', 'live', 'twitch', 'youtube', 'content'], emojis: ['🔴', '📺', '📡'] },
  { keys: ['economy', 'casino', 'gambling', 'coins', 'bank'], emojis: ['🪙', '🎰', '💰'] },
  { keys: ['shop', 'store', 'market', 'marketplace', 'trading', 'trade', 'buy', 'sell'], emojis: ['🛒', '💰', '🏪'] },
  { keys: ['crypto', 'stocks', 'finance', 'investing'], emojis: ['📈', '💹', '🪙'] },
  { keys: ['nsfw', '18+'], emojis: ['🔞'] },

  // ── Engagement ──────────────────────────────────────────────────
  { keys: ['events', 'event', 'tournaments', 'tournament', 'schedule'], emojis: ['📅', '🎪', '🏆'] },
  { keys: ['giveaways', 'giveaway', 'rewards', 'prizes'], emojis: ['🎁', '🎉', '🎀'] },
  { keys: ['polls', 'poll', 'vote', 'votes', 'voting'], emojis: ['📊', '🗳️', '✋'] },
  { keys: ['suggestions', 'suggestion', 'ideas', 'idea', 'feedback'], emojis: ['💡', '📝', '🗳️'] },
  { keys: ['levels', 'level', 'leveling', 'xp', 'rank', 'ranks', 'leaderboard'], emojis: ['📈', '🏆', '🥇'] },
  { keys: ['promo', 'promotion', 'self promo', 'selfpromo', 'advertise', 'advertising', 'ads'], emojis: ['🚀', '📣', '✨'] },

  // ── Help / staff / bots ─────────────────────────────────────────
  { keys: ['support', 'help', 'questions', 'question', 'ask', 'assistance'], emojis: ['🆘', '❓', '🙋'] },
  { keys: ['tickets', 'ticket', 'reports', 'report', 'appeals', 'appeal'], emojis: ['🎫', '📨', '🧾'] },
  { keys: ['staff', 'team', 'moderators', 'moderator', 'mods', 'mod', 'moderation'], emojis: ['🛡️', '🔨', '👮'] },
  { keys: ['admin', 'admins', 'administration', 'management', 'owner', 'owners'], emojis: ['👑', '🛠️', '🔧'] },
  { keys: ['logs', 'log', 'audit', 'mod log', 'modlog', 'records'], emojis: ['📁', '🗃️', '🧾'] },
  { keys: ['bots', 'bot', 'commands', 'command', 'cmds', 'bot commands', 'botcommands'], emojis: ['🤖', '⌨️', '🧪'] },
  { keys: ['spam', 'testing', 'test', 'sandbox'], emojis: ['🧪', '🗑️', '🌀'] },
  { keys: ['archive', 'archived', 'old', 'legacy'], emojis: ['📦', '🗄️', '🕰️'] },
  { keys: ['private', 'secret', 'hidden'], emojis: ['🔒', '🤫', '🕶️'] },

  // ── Voice-ish ───────────────────────────────────────────────────
  { keys: ['voice', 'voice channels', 'vc', 'vcs', 'call', 'calls'], emojis: ['🔊', '🎙️', '📞'], weak: true },
  { keys: ['lounge', 'chill', 'chilling', 'cozy', 'hangout vc', 'couch'], emojis: ['🛋️', '☕', '🌙'], weak: true },
  { keys: ['afk', 'sleep', 'sleeping', 'idle'], emojis: ['💤', '😴', '🌙'] },
  { keys: ['stage', 'podcast', 'karaoke', 'open mic', 'openmic'], emojis: ['🎤', '🎙️', '🎭'] },
  { keys: ['movie night', 'watch party', 'watchparty', 'watch together'], emojis: ['🍿', '🎬', '📽️'] },
  { keys: ['duo', 'duos', 'trio', 'squad', 'squads', 'party up'], emojis: ['👥', '🎧', '🫂'] },
];

// Used when nothing in the name matches a keyword.
export const FALLBACK = {
  text: ['💬', '✨', '🌟', '🪐', '🔹', '🌿'],
  announcement: ['📢', '📣'],
  forum: ['🗂️', '🧵', '📝'],
  media: ['🖼️', '📸'],
  voice: ['🔊', '🎧', '🎙️'],
  stage: ['🎤', '🎙️'],
  category: ['✨', '📂', '🌟', '🪐', '🌿', '🔹'],
  voiceCategory: ['🔊', '🎧', '🎙️'],
};
