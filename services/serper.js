/**
 * Serper Search Service — Real-time Google Search Intelligence
 *
 * Features:
 *  - Typo/spell correction (fuzzy + dictionary)
 *  - Search intent detection (weather, news, sports, crypto, finance…)
 *  - Query optimization before sending to Serper
 *  - Result extraction: featured snippets, answer boxes, knowledge graph, news
 *  - Confidence scoring for corrections
 *  - Retry + Tavily fallback
 */

const SERPER_TIMEOUT = 10_000;

// ── Typo correction dictionary ────────────────────────────────────────────────
const TYPO_MAP = {
  // Weather
  wether: 'weather', wheather: 'weather', wather: 'weather', waether: 'weather',
  temprature: 'temperature', tempature: 'temperature', temerature: 'temperature', temputer: 'temperature',
  forcast: 'forecast', forcaste: 'forecast', forcst: 'forecast',
  humiity: 'humidity', humidty: 'humidity', humditiy: 'humidity',
  rainning: 'raining', raning: 'raining', raing: 'raining',
  clody: 'cloudy', clouy: 'cloudy', cludy: 'cloudy',
  snwoing: 'snowing', snwing: 'snowing',
  // "rn" / "atm"
  rn: 'right now', atm: 'at the moment',
  // Cities (India-heavy since the codebase targets Indian users)
  delhii: 'delhi', dehli: 'delhi', dlhi: 'delhi', deli: 'delhi',
  mumabi: 'mumbai', mubai: 'mumbai', mumbi: 'mumbai', mumbei: 'mumbai',
  prayagra: 'prayagraj', prayagarj: 'prayagraj',
  bangalor: 'bangalore', banglore: 'bangalore', bangaloru: 'bangalore',
  chenai: 'chennai', chenni: 'chennai', chinnai: 'chennai',
  kolkatta: 'kolkata', calcuta: 'kolkata', calcutta: 'kolkata',
  hydrabad: 'hyderabad', hyderbad: 'hyderabad', hyderabad: 'hyderabad',
  pune: 'pune', ahmdabad: 'ahmedabad', ahemdabad: 'ahmedabad',
  // World cities
  newdelhi: 'new delhi', newyork: 'new york', losangeles: 'los angeles',
  sanfransisco: 'san francisco', londen: 'london', londn: 'london',
  tokio: 'tokyo', toky: 'tokyo', dubaii: 'dubai', duabi: 'dubai',
  singapure: 'singapore', singapur: 'singapore',
  // Crypto / Finance
  btc: 'bitcoin', eth: 'ethereum', bnb: 'binance coin',
  doge: 'dogecoin', sol: 'solana', xrp: 'ripple',
  crpto: 'crypto', cryto: 'crypto', cryptocureency: 'cryptocurrency',
  prise: 'price', prce: 'price', rpice: 'price', pric: 'price',
  stok: 'stock', stosk: 'stocks', shaer: 'share',
  nifity: 'nifty', sencex: 'sensex', senex: 'sensex',
  // News / time
  lates: 'latest', lastest: 'latest', lattes: 'latest', latets: 'latest',
  newz: 'news', nwes: 'news', nws: 'news',
  currnet: 'current', curren: 'current', curent: 'current',
  tody: 'today', todya: 'today', todat: 'today',
  tomoro: 'tomorrow', tomarrow: 'tomorrow', tmrw: 'tomorrow',
  ystrday: 'yesterday', yestrday: 'yesterday',
  // Sports
  mtch: 'match', macth: 'match', mach: 'match', mtach: 'match',
  scor: 'score', scroe: 'score', scrore: 'score',
  crcket: 'cricket', crickt: 'cricket',
  footbal: 'football', soccor: 'soccer', soccar: 'soccer',
  // Tech / Products
  andriod: 'android', andorid: 'android',
  // General
  elction: 'election', elecction: 'election',
  goverment: 'government', govrnment: 'government',
  celebirty: 'celebrity', celevrity: 'celebrity',
  anounce: 'announce', annonce: 'announce',
};

// Simple Levenshtein distance for fuzzy fallback
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    dp[i][j] = a[i - 1] === b[j - 1]
      ? dp[i - 1][j - 1]
      : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  }
  return dp[m][n];
}

function correctWord(word) {
  const lower = word.toLowerCase();
  if (TYPO_MAP[lower]) return TYPO_MAP[lower];
  // Fuzzy match against dictionary keys for words > 4 chars
  if (lower.length > 4) {
    let best = null, bestDist = Infinity;
    for (const key of Object.keys(TYPO_MAP)) {
      if (Math.abs(key.length - lower.length) > 2) continue;
      const d = levenshtein(lower, key);
      if (d <= 1 && d < bestDist) { bestDist = d; best = key; }
    }
    if (best) return TYPO_MAP[best];
  }
  return word;
}

export function correctTypos(text) {
  return text.trim().split(/\s+/).map(correctWord).join(' ');
}

// ── Intent detection ──────────────────────────────────────────────────────────
const INTENT_PATTERNS = [
  { intent: 'weather',   patterns: [/\b(weather|wether|wheather|temp(erature)?|forecast|forcast|rain|raining|snow|humid|wind|sunny|cloudy|hot|cold|climate|feels like|uv index)\b/i] },
  { intent: 'news',      patterns: [/\b(news|latest|breaking|headline|happening|current events?|what happened|what's going on)\b/i] },
  { intent: 'sports',    patterns: [/\b(match|score|ipl|cricket|football|soccer|nba|nfl|fifa|wimbledon|formula.?1|f1|tournament|league|won|beat|vs\.?|versus)\b/i] },
  { intent: 'crypto',    patterns: [/\b(bitcoin|btc|ethereum|eth|crypto|coin|token|nft|blockchain|binance|solana|dogecoin|ripple|defi)\b/i] },
  { intent: 'finance',   patterns: [/\b(stock|share|nifty|sensex|nasdaq|dow jones|forex|dollar|rupee|euro|exchange rate|interest rate|market cap|ipo)\b/i] },
  { intent: 'celebrity', patterns: [/\b(who is|celebrity|actor|actress|singer|musician|born|age|net worth|biography|wiki|famous)\b/i] },
  // Website / service legitimacy checks — "is sparify genuine?", "is this a scam?"
  { intent: 'verify',    patterns: [
    /\b(genuine|legit|legitimate|scam|fake|real|safe|trusted|reliable|fraud|phishing|authentic|sketchy|shady)\b/i,
    /\b(is .{1,50}(safe|real|good|trusted|working|down|worth it|a scam|genuine|legit))\b/i,
    /\b(reviews?|rating|trustworthy|worth it|recommend|complaints?)\b/i,
  ]},
  // General lookup — "what is X", any website/app/service/company query, URLs
  { intent: 'lookup',    patterns: [
    /\b(what is|what are|who made|who owns|tell me about|explain|define|meaning of|about)\b/i,
    /\b(website|site|app|platform|service|company|brand|product|tool|software|startup)\b/i,
    /https?:\/\/|www\.|\.com\b|\.io\b|\.net\b|\.org\b|\.in\b/i,
  ]},
  { intent: 'general',   patterns: [/\b(today|latest|current|recent|now|live|real.?time|breaking|2024|2025|2026|election|launch|release|announce)\b/i] },
];

export function detectIntent(text) {
  const lower = text.toLowerCase();
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some(p => p.test(lower))) return intent;
  }
  return null;
}

// ── Query optimizer ───────────────────────────────────────────────────────────
const FILLER = /\b(is it|what is the|what's the|tell me about|can you|please|hey|just|the|a|an|do you know)\b/gi;

export function optimizeQuery(raw, corrected, intent) {
  let q = corrected.replace(FILLER, ' ').replace(/\s{2,}/g, ' ').trim();

  switch (intent) {
    case 'weather':
      if (!/\bweather\b/i.test(q)) q = 'weather ' + q;
      if (!/\btoday|now|current|right now\b/i.test(q)) q += ' today';
      // Ask for the full weather card including detail metrics
      q += ' humidity wind speed air quality';
      break;
    case 'news':
      if (!/\bnews|latest|breaking\b/i.test(q)) q = 'latest news ' + q;
      break;
    case 'crypto':
      if (!/\bprice|today|live|usd\b/i.test(q)) q += ' price today USD';
      break;
    case 'finance':
      if (!/\btoday|live|current\b/i.test(q)) q += ' today';
      break;
    case 'sports':
      if (!/\bscore|result|today|live\b/i.test(q)) q += ' latest score result';
      break;
    case 'verify':
      if (!/\breviews?|legit|scam|safe|genuine\b/i.test(q)) q += ' reviews legit or scam';
      break;
    case 'lookup':
      if (!/\bwhat is|about|review|info\b/i.test(q)) q += ' what is review';
      break;
  }

  return q.trim();
}

// ── Confidence scoring ────────────────────────────────────────────────────────
export function confidenceScore(original, corrected) {
  const origWords = original.toLowerCase().split(/\s+/);
  const corrWords = corrected.toLowerCase().split(/\s+/);
  let changed = 0;
  const len = Math.min(origWords.length, corrWords.length);
  for (let i = 0; i < len; i++) if (origWords[i] !== corrWords[i]) changed++;
  return Math.max(0.1, 1 - (changed / Math.max(origWords.length, 1)) * 0.6);
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function fetchWithTimeout(url, opts, ms = SERPER_TIMEOUT) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Weather-specific extractor ────────────────────────────────────────────────
function extractWeatherData(data) {
  const parts = [];

  if (data.answerBox) {
    const ab = data.answerBox;

    // Location header
    const location = ab.title || ab.place || '';
    if (location) parts.push(`Location: ${location}`);

    // Temperature — try dedicated fields first, then snippet
    const tempC = ab.temperature || ab.temp || ab.tempC || '';
    const tempF = ab.temperatureF || ab.tempF || '';
    const condition = ab.description || ab.weather || ab.condition || ab.subtitle || '';
    if (tempC || tempF) {
      const tempStr = tempC && tempF ? `${tempC}°C (${tempF}°F)` : tempC ? `${tempC}°C` : `${tempF}°F`;
      parts.push(`Temperature: ${tempStr}${condition ? ' · ' + condition : ''}`);
    } else if (condition) {
      parts.push(`Condition: ${condition}`);
    }

    // Feels like
    if (ab.feelsLike || ab.feels_like || ab.apparentTemp) {
      parts.push(`Feels like: ${ab.feelsLike || ab.feels_like || ab.apparentTemp}`);
    }

    // Humidity
    if (ab.humidity) parts.push(`Humidity: ${ab.humidity}`);

    // Wind
    if (ab.wind || ab.windSpeed || ab.wind_speed) {
      parts.push(`Wind: ${ab.wind || ab.windSpeed || ab.wind_speed}`);
    }

    // Visibility
    if (ab.visibility) parts.push(`Visibility: ${ab.visibility}`);

    // UV index
    if (ab.uvIndex || ab.uv) parts.push(`UV Index: ${ab.uvIndex || ab.uv}`);

    // AQI / air quality
    if (ab.airQuality || ab.aqi || ab.air_quality) {
      parts.push(`Air Quality: ${ab.airQuality || ab.aqi || ab.air_quality}`);
    }

    // High / Low for today
    if (ab.high || ab.low) {
      const hl = [ab.high && `High: ${ab.high}`, ab.low && `Low: ${ab.low}`].filter(Boolean).join('  ');
      parts.push(`Today: ${hl}`);
    }

    // Forecast array
    if (Array.isArray(ab.forecast) && ab.forecast.length) {
      const fc = ab.forecast.slice(0, 3).map(d => {
        const day = d.day || d.date || '';
        const hi = d.high || d.tempHigh || '';
        const lo = d.low || d.tempLow || '';
        const cond = d.description || d.condition || '';
        return `${day}: ${cond}${hi ? ' · High ' + hi : ''}${lo ? ' / Low ' + lo : ''}`.trim();
      });
      if (fc.length) parts.push('Forecast:\n' + fc.map(f => '· ' + f).join('\n'));
    }

    // If we only got a raw snippet and nothing structured, fall back to snippet
    if (parts.length <= 1 && (ab.snippet || ab.answer)) {
      parts.push(ab.snippet || ab.answer);
    }
  }

  // Supplement with organic snippets that contain weather detail keywords
  if (data.organic?.length && parts.length < 4) {
    const weatherDetail = /humid|wind|aqi|air quality|feels like|visib|uv|forecast|high.*low/i;
    for (const r of data.organic.slice(0, 5)) {
      if (r.snippet && weatherDetail.test(r.snippet)) {
        parts.push('Detail: ' + r.snippet.slice(0, 200));
        break;
      }
    }
  }

  return parts.length ? parts.join('\n') : null;
}

// ── Extract + summarize Serper response ──────────────────────────────────────
function extractSerperSummary(data, intent) {
  const parts = [];

  // Weather gets its own dedicated rich extractor
  if (intent === 'weather') {
    const weatherData = extractWeatherData(data);
    if (weatherData) return weatherData;
  }

  // 1. Answer / featured snippet
  if (data.answerBox) {
    const ab = data.answerBox;
    const answer = ab.answer || (ab.snippetHighlighted ? ab.snippetHighlighted.join(' ') : null) || ab.snippet;
    if (answer) parts.push(`Answer: ${answer}`);
    if (ab.title && !parts.length) parts.push(`Featured: ${ab.title}`);
  }

  // 2. Knowledge graph
  if (data.knowledgeGraph) {
    const kg = data.knowledgeGraph;
    const kParts = [];
    if (kg.description) kParts.push(kg.description);
    if (kg.attributes) {
      Object.entries(kg.attributes).slice(0, 5).forEach(([k, v]) => kParts.push(`${k}: ${v}`));
    }
    if (kParts.length) parts.push('Info: ' + kParts.join(' | '));
  }

  // 3. News items (always for news intent, otherwise as supplement)
  if (data.news?.length && (intent === 'news' || parts.length === 0)) {
    const items = data.news.slice(0, 4).map(n => `• ${n.title}${n.date ? ` (${n.date})` : ''}${n.snippet ? ' — ' + n.snippet.slice(0, 100) : ''}`);
    parts.push('Latest News:\n' + items.join('\n'));
  }

  // 4. Organic results (supplement)
  if (data.organic?.length && parts.length < 3) {
    const snippets = data.organic.slice(0, 3)
      .map(r => `• ${r.title}: ${r.snippet}`)
      .filter(s => s.length > 20);
    if (snippets.length) parts.push(snippets.join('\n'));
  }

  return parts.length ? parts.join('\n\n').slice(0, 1800) : null;
}

// ── needsSearch — exported intent gate ───────────────────────────────────────
/**
 * Check whether a raw user message needs a live web search.
 * Typo-tolerant and intent-aware.
 * @returns {{ needs: boolean, intent: string|null, corrected: string }}
 */
export function needsSearch(text) {
  const corrected = correctTypos(text);
  const intent = detectIntent(corrected);
  return { needs: intent !== null, intent, corrected };
}

// ── Primary search via Serper ─────────────────────────────────────────────────
/**
 * Search using the Serper (Google) API.
 * @param {string} rawQuery  Original user message
 * @param {object} config    DB config row
 * @returns {{ summary: string, intent: string, optimizedQuery: string, corrected: string, confidence: number } | null}
 */
export async function serperSearch(rawQuery, config) {
  const key = config.serperKey || process.env.SERPER_API_KEY;
  if (!key) return null;

  const corrected = correctTypos(rawQuery);
  const intent = detectIntent(corrected) || 'general';
  const optimizedQuery = optimizeQuery(rawQuery, corrected, intent);
  const confidence = confidenceScore(rawQuery, corrected);

  console.log(`[serper] intent=${intent} confidence=${confidence.toFixed(2)} query="${optimizedQuery}"`);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetchWithTimeout(
        'https://google.serper.dev/search',
        {
          method: 'POST',
          headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            q: optimizedQuery,
            gl: 'us',
            hl: 'en',
            num: 8,
            ...(intent === 'news' ? { type: 'news' } : {}),
          }),
        }
      );

      if (!res.ok) throw new Error(`Serper HTTP ${res.status}`);

      const data = await res.json();
      const summary = extractSerperSummary(data, intent);

      if (summary) {
        return { summary, intent, optimizedQuery, corrected, confidence };
      }
    } catch (e) {
      if (attempt === 2) console.warn(`[serper] Failed: ${e.message}`);
      else await new Promise(r => setTimeout(r, 900));
    }
  }

  return null;
}
