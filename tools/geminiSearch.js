/**
 * Gemini Grounding Search — live web data via Google Search tool.
 *
 * Protections added:
 *  - Model: gemini-2.5-flash-lite (lower quota pressure)
 *  - 60-second response cache keyed on normalised query
 *  - 10-second global cooldown (max 1 grounding call per 10 s)
 *  - 429 / quota errors: return null immediately, never retry
 */

import { GoogleGenAI } from '@google/genai';

const SEARCH_MODEL = 'gemini-2.5-flash-lite';   // lower quota than 2.0-flash

// ── Cache ────────────────────────────────────────────────────────────────────
const CACHE_TTL_MS  = 60_000;   // 60 seconds
const cache = new Map();        // normalizedKey → { result, expiresAt }

function cacheKey(query) {
  return query.toLowerCase().replace(/\s+/g, ' ').trim();
}

function getCached(query) {
  const k = cacheKey(query);
  const entry = cache.get(k);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(k); return null; }
  return entry.result;
}

function setCache(query, result) {
  cache.set(cacheKey(query), { result, expiresAt: Date.now() + CACHE_TTL_MS });
  // Evict old entries — keep cache bounded
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) { if (now > v.expiresAt) cache.delete(k); }
  }
}

// ── Cooldown ─────────────────────────────────────────────────────────────────
const COOLDOWN_MS = 10_000;     // 10 seconds between calls globally
let lastCallAt = 0;

function onCooldown() {
  return (Date.now() - lastCallAt) < COOLDOWN_MS;
}

// ── Quota-error detection ─────────────────────────────────────────────────────
function isQuotaError(e) {
  const msg = (e?.message || String(e)).toLowerCase();
  return msg.includes('429') || msg.includes('resource_exhausted') ||
         msg.includes('quota') || msg.includes('rate limit') ||
         msg.includes('too many requests');
}

/**
 * Search the live web via Gemini grounding and return a factual summary.
 * Returns cached result if available; respects cooldown; never retries on 429.
 *
 * @param {string} query  — the user question or search phrase
 * @param {string} apiKey — Gemini API key
 * @returns {Promise<string|null>}
 */
export async function geminiGroundedSearch(query, apiKey) {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey || cleanKey.length < 5) return null;

  // 1. Cache hit?
  const cached = getCached(query);
  if (cached !== null) {
    console.log('[gemini-search] Cache hit —', query.slice(0, 60));
    return cached;
  }

  // 2. Cooldown active?
  if (onCooldown()) {
    const wait = Math.ceil((COOLDOWN_MS - (Date.now() - lastCallAt)) / 1000);
    console.log(`[gemini-search] Cooldown active (${wait}s left) — skipping: "${query.slice(0, 60)}"`);
    return null;
  }

  // 3. Call Gemini grounding
  lastCallAt = Date.now();
  try {
    console.log(`[gemini-search] Grounding (${SEARCH_MODEL}): "${query.slice(0, 80)}"`);
    const ai = new GoogleGenAI({ apiKey: cleanKey });

    const prompt =
      'Search for current, accurate information about: ' + query + '\n\n' +
      'Return only the factual information you find. Be concise and specific.\n' +
      'Include exact numbers, scores, prices, temperatures, dates where available.\n' +
      'Do NOT add commentary, opinions, or conversational text.\n' +
      'Do NOT say "I found" or "According to" — just state the facts directly.';

    const response = await ai.models.generateContent({
      model: SEARCH_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      config: { temperature: 0 },
    });

    const text = response.text && response.text.trim();
    if (!text || text.length < 15) {
      console.warn('[gemini-search] Empty response');
      return null;
    }

    console.log(`[gemini-search] OK — ${text.length} chars`);
    setCache(query, text);
    return text;

  } catch (e) {
    const msg = (e?.message || String(e)).split('\n')[0];
    if (isQuotaError(e)) {
      console.warn('[gemini-search] Quota/429 — backing off, returning null:', msg);
      // Extend cooldown aggressively on quota errors (30 s extra)
      lastCallAt = Date.now() + 30_000;
      return null;
    }
    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
      console.warn('[gemini-search] Invalid API key — skipping');
      return null;
    }
    console.warn('[gemini-search] Error:', msg);
    return null;
  }
}
