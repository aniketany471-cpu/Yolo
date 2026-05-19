/**
 * Gemini Grounding Search — live web data via Google Search tool.
 *
 * Protections:
 *  - Model: gemini-2.5-flash-lite  (lower quota than 2.0-flash)
 *  - 60-second response cache keyed on normalised query + type
 *  - 10-second global cooldown (max 1 grounding call per 10 s)
 *  - 429 / quota errors: return null immediately, 30 s extra backoff, never retry
 *
 * Prompts are tuned per query type so Gemini returns structured facts:
 *  - 'sports'  → actual score line  e.g. "KKR 245/6 (20 ovs)"
 *  - 'weather' → temperature + condition + high/low
 *  - 'general' → concise factual summary
 */

import { GoogleGenAI } from '@google/genai';

const SEARCH_MODEL = 'gemini-2.5-flash-lite';

// ── Cache ────────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 60_000;
const cache = new Map();

function cacheKey(query, type) {
  return `${type}:${query.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}
function getCached(query, type) {
  const entry = cache.get(cacheKey(query, type));
  if (!entry || Date.now() > entry.expiresAt) { cache.delete(cacheKey(query, type)); return null; }
  return entry.result;
}
function setCache(query, type, result) {
  cache.set(cacheKey(query, type), { result, expiresAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) { if (now > v.expiresAt) cache.delete(k); }
  }
}

// ── Global cooldown ───────────────────────────────────────────────────────────
const COOLDOWN_MS = 10_000;
let lastCallAt = 0;
function onCooldown() { return (Date.now() - lastCallAt) < COOLDOWN_MS; }

// ── Quota error detection ────────────────────────────────────────────────────
function isQuotaError(e) {
  const msg = (e?.message || String(e)).toLowerCase();
  return msg.includes('429') || msg.includes('resource_exhausted') ||
         msg.includes('quota') || msg.includes('rate limit') ||
         msg.includes('too many requests');
}

// ── Per-type prompts ─────────────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return d.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function buildPrompt(query, type) {
  const today = `Today's date is ${todayStr()}.`;

  if (type === 'sports') {
    return (
      `${today} Search using this exact date context.\n\n` +
      `Find the CURRENT LIVE or most recent score for: ${query}\n\n` +
      `You MUST include:\n` +
      `- Teams playing (e.g. CSK vs SRH)\n` +
      `- Current score in format: TEAM X/Y (Z ovs) — for cricket\n` +
      `- Match status: Live / Innings Break / Result / Completed\n` +
      `- Venue if available\n` +
      `- Recent wickets or key events if available\n\n` +
      `IMPORTANT: Search for matches happening TODAY (${todayStr()}) or yesterday. ` +
      `Do NOT report results from previous seasons or years.\n` +
      `If NO match is live or recently played, say: "No live match at this time."\n` +
      `State only facts. No commentary, no links.`
    );
  }
  if (type === 'weather') {
    return (
      `${today}\n\n` +
      `Find the CURRENT weather for: ${query}\n\n` +
      `You MUST include:\n` +
      `- City name and region\n` +
      `- Temperature in °C (and °F)\n` +
      `- Feels like temperature\n` +
      `- Weather condition (e.g. Partly Cloudy, Sunny, Rain)\n` +
      `- Humidity %\n` +
      `- Wind speed km/h and direction\n` +
      `- Today's High / Low\n` +
      `- Short 1-day outlook if available\n\n` +
      `State only facts. No commentary.`
    );
  }
  // General realtime
  return (
    `${today} Use this date for context when searching.\n\n` +
    `Search for current, accurate information about: ${query}\n\n` +
    `Return only factual information from TODAY or the most recent available date.\n` +
    `Include exact numbers, scores, prices, temperatures, dates where available.\n` +
    `Do NOT report outdated information from previous years unless the query is historical.\n` +
    `Do NOT say "I found" or "According to" — just state the facts directly.`
  );
}

/**
 * Search the live web via Gemini grounding.
 *
 * @param {string} query   — user question / search phrase
 * @param {string} apiKey  — Gemini API key
 * @param {string} [type]  — 'sports' | 'weather' | 'general' (default: 'general')
 * @returns {Promise<string|null>}
 */
export async function geminiGroundedSearch(query, apiKey, type = 'general') {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey || cleanKey.length < 5) return null;

  // 1. Cache hit
  const cached = getCached(query, type);
  if (cached !== null) {
    console.log(`[gemini-search] Cache hit (${type}) — "${query.slice(0, 60)}"`);
    return cached;
  }

  // 2. Cooldown
  if (onCooldown()) {
    const wait = Math.ceil((COOLDOWN_MS - (Date.now() - lastCallAt)) / 1000);
    console.log(`[gemini-search] Cooldown ${wait}s — skipping: "${query.slice(0, 50)}"`);
    return null;
  }

  lastCallAt = Date.now();
  try {
    console.log(`[gemini-search] Grounding (${SEARCH_MODEL}, type=${type}): "${query.slice(0, 80)}"`);
    const ai = new GoogleGenAI({ apiKey: cleanKey });

    const response = await ai.models.generateContent({
      model: SEARCH_MODEL,
      contents: [{ role: 'user', parts: [{ text: buildPrompt(query, type) }] }],
      tools: [{ googleSearch: {} }],
      config: { temperature: 0 },
    });

    const text = (response.text || '').trim();
    if (!text || text.length < 15) {
      console.warn('[gemini-search] Empty response');
      return null;
    }

    console.log(`[gemini-search] OK (${type}) — ${text.length} chars`);
    setCache(query, type, text);
    return text;

  } catch (e) {
    const msg = (e?.message || String(e)).split('\n')[0];
    if (isQuotaError(e)) {
      console.warn('[gemini-search] Quota/429 — backing off 30s:', msg);
      lastCallAt = Date.now() + 30_000;
      return null;
    }
    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
      console.warn('[gemini-search] Invalid API key');
      return null;
    }
    console.warn('[gemini-search] Error:', msg);
    return null;
  }
}
