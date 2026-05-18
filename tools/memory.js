export function inferTopic(prompt = '') {
  const p = prompt.toLowerCase();
  if (/(ipl|cricket|nba|f1|match|score)/.test(p)) return 'sports';
  if (/(code|bug|api|javascript|python|sql)/.test(p)) return 'coding';
  if (/(image|photo|logo|art|wallpaper)/.test(p)) return 'image';
  if (/(weather|news|price|stock|crypto|latest|current)/.test(p)) return 'realtime';
  return 'general';
}

export function compressContext(rows = [], maxChars = 1800) {
  const lines = rows
    .filter((r) => r?.content)
    .map((r) => `${r.role}: ${String(r.content).replace(/\s+/g, ' ').trim()}`);
  const uniq = [];
  const seen = new Set();
  for (const l of lines) {
    const k = l.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(l);
  }
  let out = uniq.join('\n');
  if (out.length > maxChars) out = out.slice(out.length - maxChars);
  return out;
}
