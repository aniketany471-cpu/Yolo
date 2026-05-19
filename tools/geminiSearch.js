/**
 * Gemini Grounding Search — live web data via Google Search tool.
 *
 * Protections:
 *  - Model: gemini-2.5-flash-lite  (lower quota than 2.0-flash)
 *  - 60-second response cache keyed on normalised query + type
 *  - 10-second global cooldown (max 1 grounding call per 10 s)
 *  - 429 / quota errors: return null immediately, 30 s extra backoff
 *
 * Sports/weather return structured [VERIFIED:type] fact blocks.
 * DeepSeek gets exact field labels — never guesses missing fields.
 */

import { requestGemini } from '../services/geminiManager.js';

const SEARCH_MODEL_SPORTS  = 'gemini-2.0-flash';     // reliable grounding for live results
const SEARCH_MODEL_GENERAL = 'gemini-2.5-flash-lite'; // quota-saving for weather/general

// ── Cache ─────────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 60_000;
const cache = new Map();
function cacheKey(q, t) { return t + ':' + q.toLowerCase().replace(/\s+/g, ' ').trim(); }
function getCached(q, t) {
  const e = cache.get(cacheKey(q, t));
  if (!e || Date.now() > e.expiresAt) { cache.delete(cacheKey(q, t)); return null; }
  return e.result;
}
function setCache(q, t, r) {
  cache.set(cacheKey(q, t), { result: r, expiresAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > 200) { const now = Date.now(); for (const [k, v] of cache) { if (now > v.expiresAt) cache.delete(k); } }
}

// ── Global cooldown ───────────────────────────────────────────────────────────
const COOLDOWN_MS = 10_000;
let lastCallAt = 0;
function onCooldown() { return (Date.now() - lastCallAt) < COOLDOWN_MS; }

// ── Quota error detection ─────────────────────────────────────────────────────
function isQuotaError(e) {
  const msg = (e && e.message ? e.message : String(e)).toLowerCase();
  return msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota') || msg.includes('rate limit') || msg.includes('too many requests');
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ── Per-type prompts ─────────────────────────────────────────────────────────
function buildPrompt(query, type) {
  const today = 'Today is ' + todayStr() + '.';

  if (type === 'sports') {
    return (
      today + ' Use this exact date when searching.\n\n' +
      'Search for information about: ' + query + '\n\n' +
      'This may be asking about a PAST result OR an UPCOMING match. Check both.\n' +
      'Only search TODAY and yesterday. Do NOT use results from previous seasons or years.\n\n' +
      'Return ONLY a valid JSON object — no markdown, no extra text:\n' +
      '{\n' +
      '  "match_date": "YYYY-MM-DD",\n' +
      '  "teams": ["Team A", "Team B"],\n' +
      '  "winner": "Team A or empty string if upcoming/live",\n' +
      '  "score": "scorecard or empty string if upcoming",\n' +
      '  "status": "Result",\n' +
      '  "match_time": "7:30 PM IST or empty if completed",\n' +
      '  "venue": "stadium name",\n' +
      '  "key_event": "one-line highlight or empty"\n' +
      '}\n\n' +
      'status must be EXACTLY one of: "Live" | "Result" | "Innings Break" | "Upcoming" | "No match"\n' +
      'For UPCOMING matches: winner and score must be empty strings, match_time must be set.\n' +
      'For COMPLETED matches: winner must be the exact winning team name, score must have run totals.\n' +
      'If truly no match today or yesterday: {"status":"No match","teams":[],"winner":"","score":""}'
    );
  }

  if (type === 'weather') {
    return (
      today + '\n\n' +
      'Find the CURRENT real-time weather for: ' + query + '\n\n' +
      'Return ONLY a valid JSON object — no markdown, no extra text, nothing else:\n' +
      '{\n' +
      '  "city": "City, Region",\n' +
      '  "temp_c": "32",\n' +
      '  "feels_like_c": "36",\n' +
      '  "condition": "Partly Cloudy",\n' +
      '  "humidity": "72%",\n' +
      '  "wind": "18 km/h SW",\n' +
      '  "high_low": "35 / 28",\n' +
      '  "outlook": "Chance of rain in the evening"\n' +
      '}\n\n' +
      'Rules:\n' +
      '- temp_c must be a number only (no degree symbol)\n' +
      '- All fields should be strings. Omit optional fields if unknown.'
    );
  }

  // General realtime
  return (
    today + ' Use this date for context when searching.\n\n' +
    'Search for current, accurate information about: ' + query + '\n\n' +
    'Return only factual information from TODAY or the most recent available date.\n' +
    'Include exact numbers, prices, names, dates where available.\n' +
    'Do NOT report outdated information from previous years.\n' +
    'Just state the facts directly — no "I found" or "According to".'
  );
}

// ── Structured fact extraction and validation ─────────────────────────────────
function parseGroundedFact(text, type) {
  // Extract JSON — handle markdown code fences and leading/trailing text
  let jsonStr = text.trim();
  const mdMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch) jsonStr = mdMatch[1].trim();
  const braceStart = jsonStr.indexOf('{');
  const braceEnd   = jsonStr.lastIndexOf('}');
  if (braceStart === -1 || braceEnd <= braceStart) return null;
  jsonStr = jsonStr.slice(braceStart, braceEnd + 1);

  let data;
  try { data = JSON.parse(jsonStr); } catch { return null; }

  if (type === 'sports') {
    const { teams, winner, score, status, match_date, venue, key_event } = data;
    console.log('[gemini-search] Sports JSON: status=' + status + ' winner=' + (winner || 'none') + ' score=' + (score ? score.slice(0,40) : 'none'));

    if (status === 'No match' || (!teams || !teams.length)) {
      // Return null — let Serper cross-check before trusting Gemini's 'No match'
      console.warn('[gemini-search] Sports: Gemini returned No match — handing off to Serper');
      return null;
    }
    // Upcoming match — no winner/score yet
    if (status === 'Upcoming') {
      if (!teams || !teams.length) { console.warn('[gemini-search] Upcoming: no teams — returning null'); return null; }
      const lines = [
        '[VERIFIED:sports_upcoming]',
        'Date: ' + (match_date || 'Today'),
        'Match: ' + (Array.isArray(teams) ? teams.join(' vs ') : teams),
        'Status: Upcoming',
      ];
      if (data.match_time) lines.push('Time: ' + data.match_time);
      if (venue) lines.push('Venue: ' + venue);
      return lines.join('\n');
    }
    if (!winner || !score) {
      console.warn('[gemini-search] Sports JSON: missing winner or score — returning null');
      return null;
    }
    const lines = [
      '[VERIFIED:sports_result]',
      'Date: ' + (match_date || 'Today'),
      'Teams: ' + (Array.isArray(teams) ? teams.join(' vs ') : teams),
      'Winner: ' + winner,
      'Score: ' + score,
      'Status: ' + (status || 'Result'),
    ];
    if (venue) lines.push('Venue: ' + venue);
    if (key_event) lines.push('Highlight: ' + key_event);
    return lines.join('\n');
  }

  if (type === 'weather') {
    const { city, temp_c, condition, feels_like_c, humidity, wind, high_low, outlook } = data;
    console.log('[gemini-search] Weather JSON: city=' + city + ' temp=' + temp_c + ' condition=' + condition);

    if (!city || !temp_c || !condition) {
      console.warn('[gemini-search] Weather JSON: missing required fields — returning null');
      return null;
    }
    const lines = [
      '[VERIFIED:weather]',
      'City: ' + city,
      'Temperature: ' + temp_c + '°C',
      feels_like_c ? 'Feels like: ' + feels_like_c + '°C' : '',
      'Condition: ' + condition,
      humidity ? 'Humidity: ' + humidity : '',
      wind ? 'Wind: ' + wind : '',
      high_low ? 'High / Low: ' + high_low + '°C' : '',
      outlook ? 'Outlook: ' + outlook : '',
    ].filter(Boolean);
    return lines.join('\n');
  }

  return null; // general: no JSON parsing
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

  // Cache hit
  const cached = getCached(query, type);
  if (cached !== null) {
    console.log('[gemini-search] Cache hit (' + type + '): "' + query.slice(0, 60) + '"');
    return cached;
  }

  // Cooldown
  if (onCooldown()) {
    const wait = Math.ceil((COOLDOWN_MS - (Date.now() - lastCallAt)) / 1000);
    console.log('[gemini-search] Cooldown ' + wait + 's — skipping: "' + query.slice(0, 50) + '"');
    return null;
  }

  lastCallAt = Date.now();
  try {
    console.log('[gemini-search] Grounding (' + (type === 'sports' ? SEARCH_MODEL_SPORTS : SEARCH_MODEL_GENERAL) + ', type=' + type + '): "' + query.slice(0, 80) + '"');
    const response = await requestGemini({
      source: 'realtime_grounding',
      requestId: `search:${type}:${query.slice(0, 30)}`,
      apiKey: cleanKey,
      model: type === 'sports' ? SEARCH_MODEL_SPORTS : SEARCH_MODEL_GENERAL,
      contents: [{ role: 'user', parts: [{ text: buildPrompt(query, type) }] }],
      tools: [{ googleSearch: {} }],
      config: { temperature: 0 },
      attemptType: 'primary',
    });

    const text = (response.text || '').trim();
    if (!text || text.length < 10) {
      console.warn('[gemini-search] Empty response');
      return null;
    }

    // Sports / weather: extract and validate structured JSON fact
    if (type === 'sports' || type === 'weather') {
      const structured = parseGroundedFact(text, type);
      if (structured !== null) {
        console.log('[gemini-search] OK (' + type + ', verified) — ' + structured.length + ' chars');
        setCache(query, type, structured);
        return structured;
      }
      // JSON extraction failed — return raw text (better than nothing, Serper still available as fallback)
      console.warn('[gemini-search] ' + type + ': JSON parse failed — using raw text');
    }

    console.log('[gemini-search] OK (' + type + ', raw) — ' + text.length + ' chars');
    setCache(query, type, text);
    return text;

  } catch (e) {
    const msg = (e && e.message ? e.message : String(e)).split('\n')[0];
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
