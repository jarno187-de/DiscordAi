// Tiny client for OpenAI-compatible chat APIs (Groq, Pollinations, OpenRouter, Gemini, ...).
// Brian tries each provider in order. If all of them fail, he falls back to canned stupidity.
import { config } from './config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function endpointFor(baseUrl) {
  if (baseUrl.endsWith('/chat/completions') || baseUrl.endsWith('pollinations.ai/openai')) return baseUrl;
  return `${baseUrl}/chat/completions`;
}

function buildProviders() {
  const list = [];
  // Groq always needs a key; a custom keyless endpoint (e.g. a proxy) is allowed without one.
  if (config.ai.apiKey || !config.ai.baseUrl.includes('api.groq.com')) {
    list.push({
      name: 'primary',
      url: endpointFor(config.ai.baseUrl),
      apiKey: config.ai.apiKey,
      model: config.ai.model,
      minIntervalMs: config.ai.minIntervalMs,
      maxWaitMs: 15000, // happy to wait a bit for our main brain
      nextAllowedAt: 0,
    });
  }
  if (config.ai.pollinationsFallback) {
    list.push({
      name: 'pollinations',
      url: 'https://text.pollinations.ai/openai',
      apiKey: config.ai.pollinationsKey,
      model: 'openai-fast',
      // Without a key Pollinations allows ~1 reply / 45 s per IP.
      minIntervalMs: config.ai.pollinationsKey ? 3000 : 46000,
      maxWaitMs: 0, // never make people wait 45 s – just use the next fallback
      nextAllowedAt: 0,
    });
  }
  return list;
}

const providers = buildProviders();

export function describeProviders() {
  if (!providers.length) return 'none (canned lines only)';
  return providers.map((p) => `${p.name} (${p.model})`).join(' → ');
}

/** Free tiers tell us how long to wait. Respect it so we don't get banned. */
function parseRetryAfter(res, bodyText) {
  const header = Number(res.headers.get('retry-after'));
  if (header > 0) return header * 1000;
  const m = /retry after (\d+(?:\.\d+)?)\s*s/i.exec(bodyText) || /try again in (\d+(?:\.\d+)?)s/i.exec(bodyText);
  return m ? Number(m[1]) * 1000 : 30000;
}

async function callProvider(p, messages, { temperature, maxTokens }) {
  const wait = p.nextAllowedAt - Date.now();
  if (wait > p.maxWaitMs) return null;
  if (wait > 0) await sleep(wait);
  p.nextAllowedAt = Date.now() + p.minIntervalMs;

  const headers = { 'Content-Type': 'application/json' };
  if (p.apiKey) headers.Authorization = `Bearer ${p.apiKey}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.ai.timeoutMs);
  try {
    const res = await fetch(p.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: p.model, messages, temperature, max_tokens: maxTokens }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429 || res.status === 402) {
        const ms = parseRetryAfter(res, body);
        p.nextAllowedAt = Date.now() + ms;
        console.warn(`[ai:${p.name}] rate limited, cooling down ${Math.round(ms / 1000)}s`);
      } else if (res.status === 401 || res.status === 403) {
        p.nextAllowedAt = Infinity; // stop hammering it
        console.error(`[ai:${p.name}] key rejected (HTTP ${res.status}). Check AI_API_KEY in .env. Using fallbacks only.`);
      } else {
        console.warn(`[ai:${p.name}] HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  } catch (err) {
    console.warn(`[ai:${p.name}] ${err.name === 'AbortError' ? 'timeout' : err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let queue = Promise.resolve();

/** Returns the model's reply, or null if every provider is unavailable. Never throws. */
export function chat(messages, opts = {}) {
  const o = { temperature: 1.0, maxTokens: 300, ...opts };
  const job = queue.then(async () => {
    for (const p of providers) {
      const text = await callProvider(p, messages, o);
      if (text) return text;
    }
    return null;
  });
  queue = job.catch(() => {});
  return job;
}
