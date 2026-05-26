/**
 * Sports realtime reader — auto-detects sport + live/realtime intent in a
 * message and fetches authoritative live-score / event pages via Jina Reader.
 *
 * All source URLs are verified working with Jina Reader as of May 2026.
 * Covers: Cricket, IPL, Football/Soccer, Basketball/NBA, NFL, Tennis, F1,
 * UFC/MMA, Boxing, MLB, NHL, Rugby, Golf, Badminton, Kabaddi, PKL, WWE,
 * Table Tennis, Volleyball, Cycling, Athletics, Olympics, Chess, Esports.
 */

import { readLink } from "./linkReader.js";

const MAX_CONTENT_CHARS = 3500;

// ── Verified working sport source map ─────────────────────────────────────────
// Each entry: { key, keywords, sites }
// sites: ordered list — first 2 fetched in parallel via Jina Reader
const SPORT_SOURCES = [
  {
    key: "ipl",
    keywords: /\bipl\b|\bindi[a]?n\s*premier\s*league\b/i,
    sites: [
      "https://www.iplt20.com/matches/results",
      "https://www.espncricinfo.com/",
    ],
  },
  {
    key: "cricket",
    keywords: /\bcricket\b|\bt20\b|\btest\s*match\b|\bodi\b|\bbcb\b|\bbcci\b|\bwicket\b|\binnings\b|\bcricbuzz\b|\bcricinfo\b/i,
    sites: [
      "https://www.espncricinfo.com/",
      "https://www.cricbuzz.com/",
    ],
  },
  {
    key: "premier_league",
    keywords: /\bpremier\s*league\b|\bepl\b|\bbarclays\b/i,
    sites: [
      "https://www.bbc.com/sport/football/scores-fixtures",
      "https://www.skysports.com/premier-league",
    ],
  },
  {
    key: "champions_league",
    keywords: /\bchampions\s*league\b|\bucl\b|\beuropa\s*league\b/i,
    sites: [
      "https://www.bbc.com/sport/football/scores-fixtures",
      "https://www.bbc.com/sport/football",
    ],
  },
  {
    key: "football",
    keywords: /\bfootball\b|\bsoccer\b|\bla\s*liga\b|\bbundesliga\b|\bserie\s*a\b|\bligue\s*1\b|\bfifa\b|\bworld\s*cup.*foot|\bwcq\b/i,
    sites: [
      "https://www.bbc.com/sport/football/scores-fixtures",
      "https://www.bbc.com/sport/football",
    ],
  },
  {
    key: "nba",
    keywords: /\bnba\b|\bbasketball\b|\bnba\s*playoffs\b|\bnba\s*finals\b/i,
    sites: [
      "https://www.nba.com/scores",
      "https://www.bbc.com/sport/basketball",
    ],
  },
  {
    key: "nfl",
    keywords: /\bnfl\b|\bamerican\s*football\b|\bsuper\s*bowl\b|\btouchdown\b/i,
    sites: [
      "https://www.nfl.com/scores",
      "https://www.bbc.com/sport/american-football",
    ],
  },
  {
    key: "tennis",
    keywords: /\btennis\b|\bwimbledon\b|\bus\s*open.*tennis|\bfrench\s*open\b|\baustralian\s*open\b|\batp\b|\bwta\b|\bgrand\s*slam\b/i,
    sites: [
      "https://www.bbc.com/sport/tennis",
      "https://www.bbc.com/sport/tennis/scores-fixtures",
    ],
  },
  {
    key: "f1",
    keywords: /\bf1\b|\bformula\s*1\b|\bformula\s*one\b|\bgrand\s*prix\b|\bpit\s*stop\b|\bfastest\s*lap\b/i,
    sites: [
      "https://www.motorsport.com/f1/results/",
      "https://www.bbc.com/sport/formula1",
    ],
  },
  {
    key: "motogp",
    keywords: /\bmotogp\b|\bmoto\s*gp\b|\bsuperbike\b/i,
    sites: [
      "https://www.motogp.com/en/Results+Statistics",
      "https://www.bbc.com/sport/motorsport",
    ],
  },
  {
    key: "ufc",
    keywords: /\bufc\b|\bmma\b|\bmixed\s*martial\b|\boctagon\b|\bsubmission.*fight|\bknockout.*fight/i,
    sites: [
      "https://www.ufc.com/events",
      "https://www.bbc.com/sport/mixed-martial-arts",
    ],
  },
  {
    key: "boxing",
    keywords: /\bboxing\b|\bwba\b|\bwbc\b|\bibf\b|\bwbo\b|\bheavyweight.*fight|\bboxer\b/i,
    sites: [
      "https://www.bbc.com/sport/boxing",
      "https://www.skysports.com/boxing",
    ],
  },
  {
    key: "mlb",
    keywords: /\bmlb\b|\bbaseball\b|\bworld\s*series\b|\bhome\s*run\b/i,
    sites: [
      "https://www.mlb.com/scores",
      "https://www.bbc.com/sport/baseball",
    ],
  },
  {
    key: "nhl",
    keywords: /\bnhl\b|\bice\s*hockey\b|\bstanley\s*cup\b|\bpuck\b/i,
    sites: [
      "https://www.nhl.com/scores",
      "https://www.bbc.com/sport/ice-hockey",
    ],
  },
  {
    key: "rugby",
    keywords: /\brugby\b|\bsix\s*nations\b|\brwc\b|\brugby\s*world\s*cup\b|\bscrum\b/i,
    sites: [
      "https://www.bbc.com/sport/rugby-union/scores-fixtures",
      "https://www.bbc.com/sport/rugby-union",
    ],
  },
  {
    key: "golf",
    keywords: /\bgolf\b|\bpga\b|\bthe\s*masters\b|\bus\s*open.*golf|\bbogey\b|\beagle\b.*golf|\bbirdie\b.*golf/i,
    sites: [
      "https://www.bbc.com/sport/golf",
      "https://www.pgatour.com/leaderboard",
    ],
  },
  {
    key: "badminton",
    keywords: /\bbadminton\b|\bbwf\b|\bshuttle\b/i,
    sites: [
      "https://www.bwfbadminton.com/news/",
      "https://www.bbc.com/sport",
    ],
  },
  {
    key: "kabaddi",
    keywords: /\bkabaddi\b|\bpro\s*kabaddi\b|\bpkl\b/i,
    sites: [
      "https://www.prokabaddi.com/matches",
      "https://www.bbc.com/sport",
    ],
  },
  {
    key: "wwe",
    keywords: /\bwwe\b|\bwrestlemania\b|\braw\b.*wwe|\bsmackdown\b|\baew\b/i,
    sites: [
      "https://www.wwe.com/events",
      "https://www.bbc.com/sport",
    ],
  },
  {
    key: "cycling",
    keywords: /\bcycling\b|\btour\s*de\s*france\b|\bgiro\b|\bvuelta\b/i,
    sites: [
      "https://www.cyclingnews.com/results/",
      "https://www.bbc.com/sport/cycling",
    ],
  },
  {
    key: "athletics",
    keywords: /\bathletics\b|\bworld\s*athletics\b|\bmarathon\b|\bsprinting\b|\b100m\b|\b200m\b|\bdiamond\s*league\b/i,
    sites: [
      "https://worldathletics.org/competition/calendar-results",
      "https://www.bbc.com/sport/athletics",
    ],
  },
  {
    key: "olympics",
    keywords: /\bolympics\b|\bolympic\s*games\b|\bmedal\s*table\b/i,
    sites: [
      "https://olympics.com/en/olympic-games",
      "https://www.bbc.com/sport/olympics",
    ],
  },
  {
    key: "chess",
    keywords: /\bchess\b|\bfide\b|\bworld\s*chess\b|\bgrandmaster\b/i,
    sites: [
      "https://www.chess.com/news",
      "https://lichess.org/blog",
    ],
  },
  {
    key: "esports",
    keywords: /\besports\b|\be-sports\b|\bvalorant.*tournament|\bcsgo.*tournament|\blol.*worlds|\bdota.*major|\bpubg.*championship/i,
    sites: [
      "https://www.bbc.com/sport",
      "https://www.espn.com/esports/",
    ],
  },
  {
    key: "table_tennis",
    keywords: /\btable\s*tennis\b|\bping\s*pong\b|\bittf\b/i,
    sites: [
      "https://www.ittf.com/tournaments/",
      "https://www.bbc.com/sport",
    ],
  },
  {
    key: "volleyball",
    keywords: /\bvolleyball\b|\bfivb\b|\bbeach\s*volleyball\b/i,
    sites: [
      "https://www.fivb.com/en/volleyball/competitions",
      "https://www.bbc.com/sport",
    ],
  },
];

// Fallback when sport is unrecognised but message is sports-themed
const GENERAL_SPORTS_SITES = [
  "https://www.bbc.com/sport",
  "https://www.skysports.com/results",
];

// ── Realtime intent detection ─────────────────────────────────────────────────
const REALTIME_SPORTS_RE = /\blive\b|\bscore[s]?\b|\bresult[s]?\b|\bupcom[i]?ng\b|\btoday\b|\btonight\b|\bright\s*now\b|\bcurrent\b|\blatest\b|\bwho\s*won\b|\bwho\s*is\s*winning\b|\bwhat.*score\b|\bhappened\b|\bwhen\s*is\b|\bwhen\s*does\b|\bfixture[s]?\b|\bschedule\b|\bkickoff\b|\bstart.*time\b|\bline[\s-]?up\b|\bstanding[s]?\b|\bpoints\s*table\b|\bleaderboard\b|\bnext\s*match\b|\blast\s*match\b|\byesterday\b|\blast\s*night\b|\blast\s*race\b|\blast\s*game\b|\blast\s*round\b|\bwinner\b|\bchampion\b/i;

const SPORTS_KEYWORDS_RE = /\bcricket\b|\bipl\b|\bfootball\b|\bsoccer\b|\bbasketball\b|\bnba\b|\bnfl\b|\btennis\b|\bf1\b|\bformula\s*(1|one)\b|\bgrand\s*prix\b|\bufc\b|\bmma\b|\bboxing\b|\bmlb\b|\bnhl\b|\brugby\b|\bgolf\b|\bbadminton\b|\bkabaddi\b|\bpkl\b|\bwwe\b|\bwrestling\b|\bcycling\b|\bathletics\b|\bolympics\b|\bchess\b|\besports\b|\bvolleyball\b|\btable\s*tennis\b|\bsport[s]?\b|\bmotogp\b|\bpremier\s*league\b|\bepl\b|\buchampions\s*league\b|\bla\s*liga\b|\bbundesliga\b|\bwimbledon\b|\batp\b|\bwta\b|\bt20\b|\btest\s*match\b|\bodi\b|\bgp\b/i;

/**
 * Returns true when the message has sports + realtime intent.
 */
export function isSportsRealtimeQuery(text) {
  const t = String(text || "");
  return SPORTS_KEYWORDS_RE.test(t) && REALTIME_SPORTS_RE.test(t);
}

function detectSports(text) {
  return SPORT_SOURCES.filter((s) => s.keywords.test(String(text || ""))).slice(0, 2);
}

/**
 * Fetch sports context for a message with realtime sports intent.
 * Detects sport → picks authoritative sites → fetches via Jina → returns block.
 */
export async function fetchSportsContext(messageText) {
  if (!isSportsRealtimeQuery(messageText)) return "";

  const matched = detectSports(messageText);
  const sitesToFetch = matched.length > 0
    ? matched.flatMap((s) => s.sites).slice(0, 2)
    : GENERAL_SPORTS_SITES.slice(0, 2);

  const sport = matched.length > 0 ? matched.map((s) => s.key).join(", ") : "general";
  console.log(`[sports-reader] sport=${sport} fetching ${sitesToFetch.length} source(s)`);

  const results = await Promise.allSettled(
    sitesToFetch.map((url) =>
      readLink(url).then((content) => ({ url, content }))
    )
  );

  const blocks = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.content && r.value.content.length > 150) {
      blocks.push(
        `[SOURCE: ${r.value.url}]\n${r.value.content.slice(0, MAX_CONTENT_CHARS)}\n[END SOURCE]`
      );
    } else {
      const reason = r.status === "rejected" ? r.reason?.message : "empty or blocked";
      console.warn(`[sports-reader] source failed: ${reason}`);
    }
  }

  if (blocks.length === 0) return "";

  const now = new Date().toUTCString();
  return (
    `[REALTIME SPORTS DATA — fetched ${now}]\n` +
    `Sport detected: ${sport}\n\n` +
    blocks.join("\n\n") +
    `\n[END SPORTS DATA]\n\n` +
    `Use the above live data to answer the user's sports question. ` +
    `Extract scores, results, race winners, fixtures, standings, or upcoming events as relevant. ` +
    `Cite the source URL and the fetch timestamp. Do NOT add information beyond what is in the data above.`
  );
}

export const ALL_SPORTS = SPORT_SOURCES.map((s) => ({ sport: s.key, sites: s.sites }));
