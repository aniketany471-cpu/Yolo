import { cleanupFinalResponse } from '../tools/normalizer.js';

const API_LEAK = [/\{\s*"[^"]+"\s*:/, /<html/i, /<body/i, /stack trace/i, /exception/i, /error:\s*$/i];
const URL_ONLY = /^https?:\/\/\S+$/i;

function humanizeLead(text, intent = 'casual_chat') {
  if (intent === 'sports') return text.replace(/^According to .*?:?/i, 'Quick update:');
  if (intent === 'web_search' || intent === 'realtime') return text.replace(/^According to .*?:?/i, "I checked the latest and");
  return text;
}

export function optimizeResponse(raw = '', { intent = 'casual_chat' } = {}) {
  let text = String(raw || '').trim();
  text = cleanupFinalResponse(text);
  text = text.replace(/\bAccording to search results\b/gi, 'I checked the latest updates');
  text = text.replace(/\bAs an AI[^.]*\.?/gi, '').trim();
  text = text.replace(/\n{3,}/g, '\n\n');
  text = humanizeLead(text, intent);
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !API_LEAK.some((re) => re.test(l)))
    .filter((l) => !URL_ONLY.test(l));
  const dedup = [];
  const seen = new Set();
  for (const l of lines) {
    const k = l.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(l);
  }
  text = dedup.join('\n');
  if (text.length > 3500) text = `${text.slice(0, 3490)}…`;
  return text.trim();
}

export function buildConversationalToolContext(raw = '', { source = 'search', intent = 'casual_chat' } = {}) {
  const cleaned = cleanupFinalResponse(String(raw || '').replace(/\s{2,}/g, ' ').trim());
  const noUrls = cleaned
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !URL_ONLY.test(l))
    .slice(0, 8);
  if (!noUrls.length) return '';
  const lead =
    source === 'sports'
      ? 'Latest match update I pulled:'
      : source === 'browser'
        ? 'I checked a live page and found:'
        : 'I checked the latest and found:';
  const body = noUrls.map((l) => `- ${l}`).join('\n');
  return `[CONVERSATIONAL LIVE CONTEXT]\n${lead}\n${body}\nUse this as context and answer naturally in a human tone (${intent}).\n[/CONVERSATIONAL LIVE CONTEXT]`;
}

export function formatTelegramMessage(text = '') {
  const clean = String(text || '').trim();
  if (!clean) return { text: '', parseMode: 'markdown' };
  const words = clean.split(/\s+/).length;
  if (words > 140) {
    const html = clean
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br/>');
    return { text: `<blockquote expandable>${html}</blockquote>`, parseMode: 'html' };
  }
  return { text: clean, parseMode: 'markdown' };
}

export function safeUserFacingError(_err, type = 'generic') {
  if (type === 'realtime') return "I'm having trouble fetching the latest data right now.";
  if (type === 'image') return 'Image generation hit a snag right now. Try again in a bit.';
  return "Something glitched on my side just now — try again in a sec.";
}
