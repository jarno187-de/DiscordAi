import 'dotenv/config';

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export const config = {
  token: process.env.DISCORD_TOKEN,
  guildId: process.env.GUILD_ID || null,
  ai: {
    // Primary brain: any OpenAI-compatible API. Default = Groq's free tier.
    baseUrl: (process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'llama-3.1-8b-instant',
    minIntervalMs: num(process.env.AI_MIN_INTERVAL_MS, 0),
    timeoutMs: num(process.env.AI_TIMEOUT_MS, 30000),
    // Backup brain: Pollinations.ai, free and works without any key (but slow-ish limits).
    pollinationsFallback: (process.env.POLLINATIONS_FALLBACK ?? 'true').toLowerCase() !== 'false',
    pollinationsKey: process.env.POLLINATIONS_KEY || '',
  },
  chatChannelIds: (process.env.CHAT_CHANNEL_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  interjectChance: num(process.env.INTERJECT_CHANCE, 0.02),
  reactChance: num(process.env.REACT_CHANCE, 0.03),
  dataFile: process.env.DATA_FILE || 'data/brain.json',
  botName: process.env.BOT_NAME || 'Brian',
  // Signature added to every message the bot sends.
  watermark: process.env.WATERMARK ?? 'made by jarnoo__',
  // Brian answers every message that contains this word. Set TRIGGER_WORD= (empty) to disable.
  triggerWord: (process.env.TRIGGER_WORD ?? 'brian').trim().toLowerCase(),
};
