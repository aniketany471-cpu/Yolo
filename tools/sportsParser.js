import { normalizeToolText } from './normalizer.js';

const SCORE_RE = /(\b[A-Z]{2,5}\b)\s*(\d{1,3})\/(\d{1,2})(?:\s*\(?\s*(\d{1,2}(?:\.\d)?)\s*ov(?:ers?)?\s*\)?)?/gi;
const VS_RE = /([A-Z][A-Za-z .&]{2,30})\s+vs\.?\s+([A-Z][A-Za-z .&]{2,30})/i;

export function parseSportsSnapshot(raw = '') {
  const text = normalizeToolText(raw, 5000);
  const scores = [];
  let m;
  while ((m = SCORE_RE.exec(text)) !== null) {
    scores.push({ team: m[1], runs: Number(m[2]), wickets: Number(m[3]), overs: m[4] || null });
    if (scores.length >= 4) break;
  }
  const vs = text.match(VS_RE);
  const teams = vs ? [vs[1].trim(), vs[2].trim()] : [];
  const valid = scores.every((s) => s.runs >= 0 && s.wickets >= 0 && s.wickets <= 10);
  return { valid: valid && scores.length > 0, teams, scores, raw: text.slice(0, 1400) };
}

export function formatSportsUpdate(parsed) {
  if (!parsed?.valid) return null;
  const lead = parsed.scores[0];
  const oversTxt = lead.overs ? ` after ${lead.overs} overs` : '';
  const extra = parsed.scores[1] ? ` | ${parsed.scores[1].team} ${parsed.scores[1].runs}/${parsed.scores[1].wickets}${parsed.scores[1].overs ? ` (${parsed.scores[1].overs} ov)` : ''}` : '';
  return `${lead.team} are at ${lead.runs}/${lead.wickets}${oversTxt}.${extra}`;
}
