/**
 * Sports realtime reader — auto-detects sport + live/realtime intent in a
 * message and fetches authoritative live-score / event pages via Jina Reader.
 *
 * Covers: Cricket, IPL, Football/Soccer, Basketball/NBA, NFL, Tennis, F1,
 * UFC/MMA, Boxing, MLB, NHL, Rugby, Golf, Badminton, Kabaddi, PKL, WWE,
 * Table Tennis, Volleyball, Cycling, Athletics, Olympics, Chess, Esports.
 */

import { readLink } from "./linkReader.js";

const SPORTS_TIMEOUT_MS = 12_000;
const MAX_CONTENT_CHARS = 3500;

// ── Sport source map ──────────────────────────────────────────────────────────
// Each entry: { keywords, sites }
// keywords: regex terms that trigger this sport
// sites: ordered list of authoritative URLs to try (first 2 fetched in parallel)
const SPORT_SOURCES = [
  {
    key: "ipl",
    keywords: /\bipl\b|\bindi[a]?n\s*premier\s*league\b/i,
    sites: [
      "https://www.cricbuzz.com/cricket-match/live-scores",
      "https://www.espncricinfo.com/series/ipl-2025",
    ],
  },
  {
    key: "cricket",
    keywords: /\bcricket\b|\bt20\b|\btest match\b|\bodi\b|\bbcb\b|\bbcci\b|\bwicket\b|\bover\b|\binnings\b|\bcricbuzz\b|\bcricinfo\b/i,
    sites: [
      "https://www.cricbuzz.com/cricket-match/live-scores",
      "https://www.espncricinfo.com/live-cricket-scores",
    ],
  },
  {
    key: "football_epl",
    keywords: /\bpremier\s*league\b|\bepl\b|\bbarclays\b/i,
    sites: [
      "https://www.bbc.com/sport/football/scores-fixtures",
      "https://www.skysports.com/premier-league-results",
    ],
  },
  {
    key: "football_ucl",
    keywords: /\bchampions\s*league\b|\bucl\b|\beuropa\s*league\b/i,
    sites: [
      "https://www.bbc.com/sport/football/scores-fixtures",
      "https://www.flashscore.com/football/europe/champions-league/",
    ],
  },
  {
    key: "football",
    keywords: /\bfootball\b|\bsoccer\b|\bla\s*liga\b|\bbundesliga\b|\bserie\s*a\b|\bligue\s*1\b|\bgoal\b|\bfifa\b|\bworld\s*cup.*foot|\bwcq\b/i,
    sites: [
      "https://www.flashscore.com/football/",
      "https://www.bbc.com/sport/football/scores-fixtures",
    ],
  },
  {
    key: "nba",
    keywords: /\bnba\b|\bbasketball\b|\bnba\s*playoffs\b|\bnba\s*finals\b/i,
    sites: [
      "https://www.nba.com/scores",
      "https://www.espn.com/nba/scoreboard",
    ],
  },
  {
    key: "nfl",
    keywords: /\bnfl\b|\bamerican\s*football\b|\bsuper\s*bowl\b|\btouchdown\b/i,
    sites: [
      "https://www.nfl.com/scores",
      "https://www.espn.com/nfl/scoreboard",
    ],
  },
  {
    key: "tennis",
    keywords: /\btennis\b|\bwimbledon\b|\bus\s*open.*tennis|\bfrench\s*open\b|\baustralian\s*open\b|\batp\b|\bwta\b|\bdepends\s*game\b|\bset\b|\bace\b|\bgrand\s*slam\b/i,
    sites: [
      "https://www.atptour.com/en/scores/current",
      "https://www.espn.com/tennis/scoreboard",
    ],
  },
  {
    key: "f1",
    keywords: /\bf1\b|\bformula\s*1\b|\bformula\s*one\b|\bgrand\s*prix\b|\bgp\b.*race|\bfastest\s*lap\b|\bqualifying\b.*f1|\bpit\s*stop\b|\bcheckered\s*flag\b/i,
    sites: [
      "https://www.formula1.com/en/results/latest",
      "https://www.espn.com/f1/",
    ],
  },
  {
    key: "motogp",
    keywords: /\bmotogp\b|\bmoto\s*gp\b|\bsuperbike\b/i,
    sites: [
      "https://www.motogp.com/en/Results+Statistics",
      "https://www.espn.com/racing/",
    ],
  },
  {
    key: "ufc",
    keywords: /\bufc\b|\bmma\b|\bmixed\s*martial\b|\boctagn\b|\bknockout.*fight|\bsubmission.*fight/i,
    sites: [
      "https://www.ufc.com/events",
      "https://www.espn.com/mma/",
    ],
  },
  {
    key: "boxing",
    keywords: /\bboxing\b|\bprizefight\b|\bwba\b|\bwbc\b|\bibf\b|\bwbo\b|\bheavyweight.*fight|\bknockout\b/i,
    sites: [
      "https://www.skysports.com/boxing",
      "https://www.espn.com/boxing/",
    ],
  },
  {
    key: "mlb",
    keywords: /\bmlb\b|\bbaseball\b|\bworld\s*series\b|\bhome\s*run\b/i,
    sites: [
      "https://www.mlb.com/scores",
      "https://www.espn.com/mlb/scoreboard",
    ],
  },
  {
    key: "nhl",
    keywords: /\bnhl\b|\bice\s*hockey\b|\bstanley\s*cup\b|\bpuck\b/i,
    sites: [
      "https://www.nhl.com/scores",
      "https://www.espn.com/nhl/scoreboard",
    ],
  },
  {
    key: "rugby",
    keywords: /\brugby\b|\bsix\s*nations\b|\brwc\b|\brugby\s*world\s*cup\b|\btry.*rugby|\bscrum\b/i,
    sites: [
      "https://www.bbc.com/sport/rugby-union/scores-fixtures",
      "https://www.espn.com/rugby/",
    ],
  },
  {
    key: "golf",
    keywords: /\bgolf\b|\bpga\b|\bthe\s*masters\b|\bus\s*open.*golf|\bbogey\b|\beagle\b|\bbirdie\b.*golf/i,
    sites: [
      "https://www.pga.com/tour/leaderboard",
      "https://www.espn.com/golf/leaderboard",
    ],
  },
  {
    key: "badminton",
    keywords: /\bbadminton\b|\bbwf\b|\bshuttle\b|\bsmash.*badminton/i,
    sites: [
      "https://www.bwfbadminton.com/news/",
      "https://www.espn.com/sports/",
    ],
  },
  {
    key: "kabaddi",
    keywords: /\bkabaddi\b|\bpro\s*kabaddi\b|\bpkl\b|\braider\b|\btackle\b.*kabaddi/i,
    sites: [
      "https://www.prokabaddi.com/matches",
      "https://www.sports18.com/kabaddi",
    ],
  },
  {
    key: "wwe",
    keywords: /\bwwe\b|\bwrestling\b|\bwrestlemania\b|\braw\b.*wwe|\bsmackdown\b|\baew\b/i,
    sites: [
      "https://www.wwe.com/events",
      "https://www.espn.com/wwe/",
    ],
  },
  {
    key: "cycling",
    keywords: /\bcycling\b|\btour\s*de\s*france\b|\bgiro\b|\bvuelta\b/i,
    sites: [
      "https://www.cyclingnews.com/results/",
      "https://www.espn.com/cycling/",
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
    keywords: /\bolympics\b|\bolympic\s*games\b|\bparis\s*2024\b|\bla\s*2028\b|\bmedal\s*table\b/i,
    sites: [
      "https://olympics.com/en/olympic-games",
      "https://www.bbc.com/sport/olympics",
    ],
  },
  {
    key: "chess",
    keywords: /\bchess\b|\bfide\b|\bworld\s*chess\b|\bcheckmate\b|\bgrandmaster\b/i,
    sites: [
      "https://www.chess.com/news",
      "https://lichess.org/blog",
    ],
  },
  {
    key: "esports",
    keywords: /\besports\b|\be-sports\b|\bvalorant.*tournament|\bcsgo.*tournament|\blol.*worlds|\bleague.*legends.*worlds|\bdota.*major|\bpubg.*championship/i,
    sites: [
      "https://www.espn.com/esports/",
      "https://www.bbc.com/sport",
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
      "https://www.espn.com/sports/",
    ],
  },
];

// Fallback when sport is unrecognised but message is sports-themed
const GENERAL_SPORTS_SITES = [
  "https://www.bbc.com/sport",
  "https://www.espn.com/",
];

// ── Realtime intent detection ─────────────────────────────────────────────────
const REALTIME_SPORTS_RE = /\blive\b|\bscore[s]?\b|\bresult[s]?\b|\bupcom[i]?ng\b|\btoday\b|\btonight\b|\bright now\b|\bcurrent\b|\blatest\b|\bnow\b|\bwho\s*won\b|\bwho\s*is\s*winning\b|\bwhat.*score\b|\bhappened\b|\bwhen\s*is\b|\bwhen\s*does\b|\bfixture[s]?\b|\bschedule\b|\bkickoff\b|\bstart.*time\b|\bline[\s-]?up\b|\bstanding[s]?\b|\btable\b.*sport|\bpoints\s*table\b|\bleaderboard\b|\bnext\s*match\b|\blast\s*match\b|\bprevious\s*match\b/i;

const SPORTS_KEYWORDS_RE = /\bcricket\b|\bipl\b|\bfootball\b|\bsoccer\b|\bbasketball\b|\bnba\b|\bnfl\b|\btennis\b|\bf1\b|\bformula\s*1\b|\bgrand\s*prix\b|\bufc\b|\bmma\b|\bboxing\b|\bmlb\b|\bnhl\b|\brugby\b|\bgolf\b|\bbadminton\b|\bkabaddi\b|\bpkl\b|\bwwe\b|\bwrestling\b|\bcycling\b|\bathletics\b|\bolympics\b|\bchess\b|\besports\b|\bvolleyball\b|\btable\s*tennis\b|\bsport[s]?\b|\bmotogp\b|\bpremier\s*league\b|\bepl\b|\buchampions\s*league\b|\bla\s*liga\b|\bbundesliga\b|\bwimbledon\b|\batp\b|\bwta\b|\bt20\b|\btest\s*match\b|\bodi\b/i;

/**
 * Returns true when the message has sports + realtime intent.
 * @param {string} text
 * @returns {boolean}
 */
export function isSportsRealtimeQuery(text) {
  const t = String(text || "");
  return SPORTS_KEYWORDS_RE.test(t) && REALTIME_SPORTS_RE.test(t);
}

/**
 * Detect which sport(s) are mentioned in the message.
 * Returns matched SPORT_SOURCES entries (up to 2).
 */
function detectSports(text) {
  return SPORT_SOURCES.filter((s) => s.keywords.test(String(text || ""))).slice(0, 2);
}

/**
 * Fetch sports context for a message with realtime sports intent.
 * Detects sport → picks authoritative sites → fetches via Jina → returns block.
 *
 * @param {string} messageText
 * @returns {Promise<string>} context block, or "" if not a sports realtime query
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
    if (r.status === "fulfilled" && r.value.content && r.value.content.length > 80) {
      blocks.push(
        `[SOURCE: ${r.value.url}]\n${r.value.content.slice(0, MAX_CONTENT_CHARS)}\n[END SOURCE]`
      );
    } else {
      const reason = r.status === "rejected" ? r.reason?.message : "empty";
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
    `Extract scores, results, fixtures, standings, or upcoming events as relevant. ` +
    `State the source and timestamp. Do NOT add information beyond what is in the data above.`
  );
}

// ── Export the full source map for documentation purposes ─────────────────────
export const ALL_SPORTS = SPORT_SOURCES.map((s) => ({
  sport: s.key,
  sites: s.sites,
}));
