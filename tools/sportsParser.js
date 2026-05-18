import { normalizeToolText } from './normalizer.js';

// ── Cricket: TEAM 123/4 (overs optional) ─────────────────────────────────────
const SCORE_RE = /(\b[A-Z]{2,5}\b)\s*(\d{1,3})\/(\d{1,2})(?:\s*\(?\s*(\d{1,2}(?:\.\d)?)\s*ov(?:ers?)?\s*\)?)?/gi;

// ── FIX-6: Additional sport formats ─────────────────────────────────────────
// Football/soccer: "Arsenal 2 - 1 Chelsea" or "Arsenal 2-1 Chelsea"
// Each team name: max 2 Title-Case words (e.g. "Man United", "Real Madrid").
// Using lowercase-body words (/[A-Z][a-z]{1,14}/) prevents greedily absorbing
// competition names like "Premier League" or trailing words like "result".
const FOOTBALL_RE = /([A-Z][a-z]{1,14}(?:\s+[A-Z][a-z]{1,14})?)\s+(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Z][a-z]{1,14}(?:\s+[A-Z][a-z]{1,14})?)/;

// NBA/basketball: "Lakers 108, Warriors 102"
const NBA_RE = /([A-Z][A-Za-z .]{2,24})\s+(\d{2,3})\s*,\s*([A-Z][A-Za-z .]{2,24})\s+(\d{2,3})/;

// Tennis: lines like "Djokovic 6-3 6-4" or "Alcaraz def. Djokovic 7-6 6-3"
const TENNIS_RE = /([A-Z][A-Za-z-]{2,24})\s+(?:def\.?\s+([A-Z][A-Za-z-]{2,24})\s+)?((?:\d-\d[\s,]*){2,})/;

// F1: "1. Verstappen" or "P1 Verstappen" or "1st: Verstappen"
const F1_RE = /(?:^|\n)\s*(?:1[.):]|P1|1st[.:]?)\s+([A-Z][A-Za-z .]{2,30})/m;

const VS_RE = /([A-Z][A-Za-z .&]{2,30})\s+vs\.?\s+([A-Z][A-Za-z .&]{2,30})/i;

// ── Attempt to extract non-cricket score summary ──────────────────────────────
function tryAltSports(text) {
  const fb = text.match(FOOTBALL_RE);
  if (fb) {
    return `${fb[1].trim()} ${fb[2]} – ${fb[3]} ${fb[4].trim()}`;
  }
  const nba = text.match(NBA_RE);
  if (nba) {
    return `${nba[1].trim()} ${nba[2]} – ${nba[3].trim()} ${nba[4]}`;
  }
  const tennis = text.match(TENNIS_RE);
  if (tennis) {
    const player2Part = tennis[2] ? ` def. ${tennis[2].trim()}` : '';
    return `${tennis[1].trim()}${player2Part}  ${tennis[3].trim()}`;
  }
  const f1 = text.match(F1_RE);
  if (f1) {
    return `P1: ${f1[1].trim()}`;
  }
  return null;
}

export function parseSportsSnapshot(raw = '') {
  const text = normalizeToolText(raw, 5000);

  // ── Cricket path (unchanged) ──────────────────────────────────────────────
  const scores = [];
  let m;
  while ((m = SCORE_RE.exec(text)) !== null) {
    scores.push({ team: m[1], runs: Number(m[2]), wickets: Number(m[3]), overs: m[4] || null });
    if (scores.length >= 4) break;
  }
  const vs = text.match(VS_RE);
  const teams = vs ? [vs[1].trim(), vs[2].trim()] : [];
  const valid = scores.every((s) => s.runs >= 0 && s.wickets >= 0 && s.wickets <= 10);

  if (valid && scores.length > 0) {
    return { valid: true, teams, scores, altResult: null, raw: text.slice(0, 1400) };
  }

  // ── FIX-6: Non-cricket fallback ───────────────────────────────────────────
  const altResult = tryAltSports(text);
  return { valid: false, teams, scores: [], altResult, raw: text.slice(0, 1400) };
}

export function formatSportsUpdate(parsed) {
  // Cricket formatted card (existing behavior preserved)
  if (parsed?.valid) {
    const lead = parsed.scores[0];
    const oversTxt = lead.overs ? ` after ${lead.overs} overs` : '';
    const extra = parsed.scores[1]
      ? ` | ${parsed.scores[1].team} ${parsed.scores[1].runs}/${parsed.scores[1].wickets}${parsed.scores[1].overs ? ` (${parsed.scores[1].overs} ov)` : ''}`
      : '';
    return `${lead.team} are at ${lead.runs}/${lead.wickets}${oversTxt}.${extra}`;
  }

  // FIX-6: Non-cricket — return the alt result if one was found
  if (parsed?.altResult) {
    return parsed.altResult;
  }

  return null;
}
