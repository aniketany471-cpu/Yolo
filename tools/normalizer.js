const STOP = [/^https?:\/\//i,/^\s*<[^>]+>/,/^\s*\{.*\}\s*$/];

export function normalizeToolText(input = '', maxLen = 2200) {
  let text = String(input || '').replace(/\r/g, '');
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/\s{2,}/g, ' ').trim();
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const cleaned = [];
  const seen = new Set();
  for (const line of lines) {
    if (STOP.some((re) => re.test(line))) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(line);
    if (cleaned.join('\n').length >= maxLen) break;
  }
  return cleaned.join('\n').slice(0, maxLen);
}

export function cleanupFinalResponse(text = '') {
  const lines = String(text).split('\n').map((x) => x.trim()).filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const l of lines) {
    const k = l.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function summarizeForContext(text = '', maxChars = 700) {
  const t = normalizeToolText(text, maxChars);
  return t.length > maxChars ? `${t.slice(0, maxChars - 1)}…` : t;
}
