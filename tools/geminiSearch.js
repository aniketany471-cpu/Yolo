/**
 * Gemini Grounding Search - replaces Playwright for live web data.
 * Uses Gemini's built-in Google Search tool to retrieve current information.
 * Returns a clean factual summary - NOT a conversational response.
 * DeepSeek/BluesMinds uses this as context to generate the final reply.
 */

import { GoogleGenAI } from '@google/genai';

const SEARCH_MODEL = 'gemini-2.0-flash';

/**
 * Search the live web via Gemini grounding and return a factual summary.
 * @param {string} query  - the user question or search phrase
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<string|null>} plain-text factual context, or null on failure
 */
export async function geminiGroundedSearch(query, apiKey) {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey || cleanKey.length < 5) return null;

  try {
    const ai = new GoogleGenAI({ apiKey: cleanKey });

    const prompt =
      'Search for current, accurate information about: ' + query + '\n\n' +
      'Return only the factual information you find. Be concise and specific.\n' +
      'Include exact numbers, scores, prices, temperatures, dates where available.\n' +
      'Do NOT add commentary, opinions, or conversational text.\n' +
      'Do NOT say "I found" or "According to" - just state the facts directly.';

    const response = await ai.models.generateContent({
      model: SEARCH_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      config: { temperature: 0 },
    });

    const text = response.text && response.text.trim();
    if (!text || text.length < 15) {
      console.warn('[gemini-search] Empty response from grounding');
      return null;
    }

    console.log('[gemini-search] Grounding OK - ' + text.length + ' chars');
    return text;
  } catch (e) {
    const msg = (e && e.message && e.message.split('\n')[0]) || String(e);
    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
      console.warn('[gemini-search] Invalid API key - skipping');
    } else {
      console.warn('[gemini-search] Error:', msg);
    }
    return null;
  }
}
