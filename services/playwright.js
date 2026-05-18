/**
 * Playwright Live Scraper — Multi-source
 * Uses headless Chromium to render JS-heavy pages and extract live data.
 * Priority sources per query type:
 *   Weather       → AccuWeather (city-aware)
 *   Cricket/IPL   → Cricbuzz → ESPN Cricinfo → NDTV Sports → Google Sports
 *   Football      → FlashScore → BBC Sport → Google Sports
 *   General       → Google Sports → Google Search
 */

import { chromium } from 'playwright';

const NAV_TIMEOUT = 25_000;

let browser = null;

// System Chromium paths tried if Playwright-managed binary fails
const SYSTEM_CHROMIUM_PATHS = [
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
];

function findSystemChromium() {
  for (const p of SYSTEM_CHROMIUM_PATHS) {
    try {
      // sync check using node built-in (works in ESM via createRequire trick)
      const { statSync } = Object.assign({}, { statSync: (() => { try { return require('fs').statSync; } catch { return null; } })() });
      if (statSync) statSync(p);
      return p;
    } catch {}
  }
  return undefined;
}

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-first-run',
  '--no-zygote',
  '--disable-extensions',
  '--disable-default-apps',
  '--disable-background-networking',
  '--disable-sync',
  '--mute-audio',
  '--disable-blink-features=AutomationControlled',
];

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  browser = null;

  // 1. Try Playwright-managed Chromium
  try {
    browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
    return browser;
  } catch (e) {
    console.warn('[playwright] Playwright Chromium failed:', e.message?.split('\n')[0]);
    browser = null;
  }

  // 2. Try any system-installed Chromium as fallback
  const sysChr = findSystemChromium();
  if (sysChr) {
    try {
      console.warn('[playwright] Falling back to system Chromium:', sysChr);
      browser = await chromium.launch({ headless: true, executablePath: sysChr, args: LAUNCH_ARGS });
      return browser;
    } catch (e2) {
      console.error('[playwright] System Chromium also failed:', e2.message?.split('\n')[0]);
      browser = null;
    }
  }

  throw new Error('Playwright: all Chromium launch attempts failed');
}

process.on('exit',    () => { if (browser) browser.close().catch(() => {}); });
process.on('SIGTERM', () => { if (browser) browser.close().catch(() => {}); });

async function newPage() {
  const b = await getBrowser();
  const ctx = await b.newContext({
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
    viewport: { width: 412, height: 915 },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });
  return { ctx, page: await ctx.newPage() };
}

async function extractText(page) {
  return page.evaluate(() => {
    ['script','style','nav','footer','iframe','noscript','header'].forEach(t =>
      document.querySelectorAll(t).forEach(el => el.remove())
    );
    return (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
  });
}

/**
 * Pull the city name out of a weather query.
 */
function extractCity(query) {
  const q = query.trim();
  let m = q.match(/(?:weather|temp(?:erature)?|forecast|climate)\s+(?:in|of|for|at)\s+(.+?)(?:\s+(?:today|now|tonight|tomorrow|this week|right now|forecast))?$/i);
  if (m) return m[1].trim();
  m = q.match(/^(.+?)\s+(?:weather|temp(?:erature)?|forecast|climate)/i);
  if (m) return m[1].trim();
  m = q.match(/(?:what(?:'s| is)|how(?:'s| is)|tell me)\s+the\s+(?:weather|temp)\s+(?:in|of|for|at)?\s*(.+?)(?:\s+today|\s+now|\s+tonight)?$/i);
  if (m) return m[1].trim();
  const stripped = q
    .replace(/\b(?:weather|temperature|temp|forecast|climate|today|now|tonight|tomorrow|right now|in|of|for|at|what|is|how|the|tell|me)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return stripped || q;
}

/**
 * Scrape AccuWeather for a city's current weather + short forecast.
 */
export async function getWeather(query) {
  const city = extractCity(query);
  console.log(`[playwright] Weather query — city detected: "${city}"`);

  const { ctx, page } = await newPage();
  try {
    const searchUrl = `https://www.accuweather.com/en/search-locations?query=${encodeURIComponent(city)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(2500);

    const locationHref = await page.evaluate(() => {
      const selectors = [
        'a[href*="/weather-forecast/"]',
        'a[href*="/current-weather/"]',
        'a[href*="/hourly-weather-forecast/"]',
        '.search-results a',
        '.location-list a',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.href) return el.href;
      }
      return null;
    });

    if (locationHref) {
      console.log(`[playwright] AccuWeather location URL: ${locationHref}`);
      await page.goto(locationHref, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await page.waitForTimeout(2500);
    } else {
      console.warn('[playwright] AccuWeather: no location result found for city:', city);
    }

    const structured = await page.evaluate(() => {
      const get = (sel) => document.querySelector(sel)?.innerText?.trim() || null;
      const getAll = (sel) => [...document.querySelectorAll(sel)].map(e => e.innerText?.trim()).filter(Boolean);
      return {
        temp:       get('.temp-container .temp, .display-temp, .cur-con-weather-card .temp, [class*="CurrentConditions"] [class*="temperature"]'),
        condition:  get('.phrase, .weather-phrase, [class*="CurrentConditions"] [class*="phrase"]'),
        realFeel:   get('.real-feel, [class*="real-feel"], [class*="realFeel"]'),
        hiLo:       get('.hi-lo-wrapper, .temp-history, [class*="hiLo"], [class*="high-low"]'),
        wind:       get('[class*="wind"] [class*="value"], [data-testid="wind"]'),
        humidity:   get('[class*="humidity"] [class*="value"], [data-testid="humidity"]'),
        uv:         get('[class*="uvIndex"] [class*="value"], [data-testid="uvIndex"]'),
        forecast:   getAll('.daily-list-item, [class*="DailyForecast"] [class*="day"], [class*="daily"] [class*="panel"]').slice(0, 3),
        pageTitle:  document.title || '',
      };
    });

    const lines = [];
    const titleCity = structured.pageTitle
      .replace(/weather forecast|current weather|hourly forecast|accuweather|[-|]/gi, '')
      .trim();

    lines.push(`📍 ${titleCity || city} — AccuWeather`);
    if (structured.temp)      lines.push(`🌡 Now: ${structured.temp}`);
    if (structured.condition) lines.push(`☁️ ${structured.condition}`);
    if (structured.realFeel)  lines.push(`🤔 Feels like: ${structured.realFeel}`);
    if (structured.hiLo)      lines.push(`📊 ${structured.hiLo.replace(/\n+/g, '  ')}`);
    if (structured.wind)      lines.push(`💨 Wind: ${structured.wind}`);
    if (structured.humidity)  lines.push(`💧 Humidity: ${structured.humidity}`);
    if (structured.uv)        lines.push(`☀️ UV Index: ${structured.uv}`);
    if (structured.forecast?.length) {
      lines.push('');
      lines.push('📅 Coming up:');
      structured.forecast.forEach(f => lines.push(`· ${f.replace(/\n+/g, ' ')}`));
    }

    const result = lines.join('\n').trim();
    if (result.length > 60 && structured.temp) {
      console.log(`[playwright] AccuWeather OK — ${result.length} chars`);
      return result;
    }

    console.warn('[playwright] AccuWeather DOM extraction weak, trying raw text');
    const rawText = await extractText(page);
    const rawLines = rawText.split('\n').filter(l => l.trim().length > 1);
    const weatherLines = rawLines.filter(l =>
      /°[CF]|\bfeel[s]?\b|\bhumid|\bwind|\brain|\bcloud|\bsunny|\bpartly|\bchance|\bprecip|\bhigh\b|\blow\b|\bkm\/h|\bmph|\bmm\b|\bforecast\b/i.test(l)
    );
    if (weatherLines.length >= 2) {
      return `📍 ${city} — AccuWeather\n${weatherLines.slice(0, 15).join('\n')}`;
    }

    return null;
  } catch (e) {
    console.warn('[playwright] AccuWeather error:', e.message);
    return null;
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * Scrape any URL and return visible text.
 */
export async function scrapePage(url, opts = {}) {
  const { ctx, page } = await newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: opts.timeout || NAV_TIMEOUT });
    if (opts.waitFor) {
      await page.waitForSelector(opts.waitFor, { timeout: 8000 }).catch(() => {});
    }
    await page.waitForTimeout(opts.wait || 2000);
    const title = await page.title().catch(() => '');
    const text  = await extractText(page);
    return { text: text.slice(0, 8000), title, url };
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ── Cricket Sources ────────────────────────────────────────────────────────────

const SCORE_PATTERN = /\d+\/\d+|\bover[s]?\b|\bwkt[s]?\b|\bwicket[s]?\b|\brun[s]?\b|\blive\b|\bvs\.?\b|\binning[s]?\b|\bbatting\b|\bbowling\b|\bIPL\b|\bT20\b|\bODI\b|\bTest\b/i;

/**
 * Cricbuzz live scores.
 */
async function fromCricbuzz() {
  const { ctx, page } = await newPage();
  try {
    await page.goto('https://www.cricbuzz.com/cricket-match/live-scores', {
      waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT,
    });
    await page.waitForTimeout(3000);
    const text = await extractText(page);
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    const scoreLines = lines.filter(l => SCORE_PATTERN.test(l));
    if (scoreLines.length >= 2) {
      return '🏏 Live Cricket Scores (Cricbuzz)\n' + scoreLines.slice(0, 30).join('\n');
    }
    return null;
  } catch(e) {
    console.warn('[playwright] Cricbuzz error:', e.message);
    return null;
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * ESPN Cricinfo live scores.
 */
async function fromESPN() {
  const { ctx, page } = await newPage();
  try {
    await page.goto('https://www.espncricinfo.com/live-cricket-score', {
      waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT,
    });
    await page.waitForTimeout(3000);
    const text = await extractText(page);
    const lines = text.split('\n').filter(l => l.trim().length > 1);
    const scoreLines = lines.filter(l =>
      /\d+\/\d+|\bover[s]?\b|\bwicket[s]?\b|\blive\b|\bvs\.?\b|\binning[s]?\b/i.test(l)
    );
    if (scoreLines.length >= 2) {
      return '🏏 Live Cricket Scores (ESPN Cricinfo)\n' + scoreLines.slice(0, 30).join('\n');
    }
    return null;
  } catch(e) {
    console.warn('[playwright] ESPN error:', e.message);
    return null;
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * NDTV Sports cricket live scores.
 */
async function fromNDTVCricket() {
  const { ctx, page } = await newPage();
  try {
    await page.goto('https://sports.ndtv.com/cricket/live-scores', {
      waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT,
    });
    await page.waitForTimeout(2500);
    const text = await extractText(page);
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    const scoreLines = lines.filter(l => SCORE_PATTERN.test(l));
    if (scoreLines.length >= 2) {
      return '🏏 Live Cricket Scores (NDTV Sports)\n' + scoreLines.slice(0, 30).join('\n');
    }
    return null;
  } catch(e) {
    console.warn('[playwright] NDTV Sports error:', e.message);
    return null;
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * IPL official site — best for IPL-specific scores.
 */
async function fromIPLT20() {
  const { ctx, page } = await newPage();
  try {
    await page.goto('https://www.iplt20.com/matches/results', {
      waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT,
    });
    await page.waitForTimeout(2500);
    const text = await extractText(page);
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    const scoreLines = lines.filter(l =>
      /\d+\/\d+|\bover[s]?\b|\bwicket[s]?\b|\brun[s]?\b|\bIPL\b|\bT20\b|\bvs\.?\b|\blive\b|\bresult\b/i.test(l)
    );
    if (scoreLines.length >= 2) {
      return '🏏 IPL Scores (iplt20.com)\n' + scoreLines.slice(0, 30).join('\n');
    }
    return null;
  } catch(e) {
    console.warn('[playwright] IPLT20 error:', e.message);
    return null;
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ── Football Sources ───────────────────────────────────────────────────────────

const FOOTBALL_PATTERN = /\d+[-:]\d+|\bgoal[s]?\b|\bmin\b|\bfull.?time\b|\bhalf.?time\b|\blive\b|\bvs\.?\b|\bmatch\b|\bpremier\b|\bliga\b|\bserie\b|\bleague\b/i;

/**
 * FlashScore — real-time football + multi-sport scores.
 */
async function fromFlashScore() {
  const { ctx, page } = await newPage();
  try {
    await page.goto('https://www.flashscore.com/', {
      waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT,
    });
    await page.waitForTimeout(3000);
    const text = await extractText(page);
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    const scoreLines = lines.filter(l => FOOTBALL_PATTERN.test(l));
    if (scoreLines.length >= 2) {
      return '⚽ Live Football Scores (FlashScore)\n' + scoreLines.slice(0, 30).join('\n');
    }
    return null;
  } catch(e) {
    console.warn('[playwright] FlashScore error:', e.message);
    return null;
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * BBC Sport — football live scores.
 */
async function fromBBCSport() {
  const { ctx, page } = await newPage();
  try {
    await page.goto('https://www.bbc.com/sport/football/scores-fixtures', {
      waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT,
    });
    await page.waitForTimeout(2500);
    const text = await extractText(page);
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    const scoreLines = lines.filter(l => FOOTBALL_PATTERN.test(l));
    if (scoreLines.length >= 2) {
      return '⚽ Live Football Scores (BBC Sport)\n' + scoreLines.slice(0, 30).join('\n');
    }
    return null;
  } catch(e) {
    console.warn('[playwright] BBC Sport error:', e.message);
    return null;
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ── General Sports Source ──────────────────────────────────────────────────────

/**
 * Google Sports search — works for any sport query.
 */
async function fromGoogleSports(query) {
  const { ctx, page } = await newPage();
  try {
    const sportQuery = query.toLowerCase().includes('score') || query.toLowerCase().includes('result')
      ? query
      : query + ' live score today';
    const url = 'https://www.google.com/search?q=' + encodeURIComponent(sportQuery) + '&hl=en&gl=in';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await Promise.race([
      page.waitForSelector('#search',       { timeout: 8000 }),
      page.waitForSelector('[data-attrid]', { timeout: 8000 }),
      page.waitForSelector('.card-section', { timeout: 8000 }),
    ]).catch(() => {});
    await page.waitForTimeout(2000);
    const text = await extractText(page);
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    // Prefer lines that actually have score data
    const scoreLines = lines.filter(l =>
      /\d+\/\d+|\d+[-:]\d+|\bover[s]?\b|\binning[s]?\b|\bwicket|\bgoal|\brun[s]?\b|\bpoint[s]?\b|\bset\b|\bperiod\b|\blive\b|\bscore\b|\bvs\.?\b/i.test(l)
    );
    const result = (scoreLines.length >= 2 ? scoreLines : lines).slice(0, 30).join('\n').slice(0, 2500);
    return result.length > 50 ? `🔍 Google Sports: ${sportQuery}\n${result}` : null;
  } catch(e) {
    console.warn('[playwright] Google Sports error:', e.message);
    return null;
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * Google search with a real browser — works for general live queries.
 */
export async function googleLiveSearch(query) {
  const { ctx, page } = await newPage();
  try {
    const url = 'https://www.google.com/search?q=' + encodeURIComponent(query) + '&hl=en&gl=in';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await Promise.race([
      page.waitForSelector('#search',       { timeout: 8000 }),
      page.waitForSelector('[data-attrid]', { timeout: 8000 }),
      page.waitForSelector('.card-section', { timeout: 8000 }),
    ]).catch(() => {});
    await page.waitForTimeout(2000);
    const title = await page.title().catch(() => '');
    const text  = await extractText(page);
    return { text: text.slice(0, 6000), title };
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * Get live scores for any sport query.
 * Cricket: Cricbuzz → ESPN Cricinfo → NDTV Sports → IPL T20 → Google Sports
 * Football: FlashScore → BBC Sport → Google Sports
 * General: Google Sports → raw Google fallback
 */
export async function getLiveScore(query) {
  const isCricket  = /cricket|ipl|odi|t20|test match|bcci|wicket|batting|bowling|over[s]?\b|ball.?by.?ball|scorecard/i.test(query);
  const isIPL      = /\bipl\b|indian premier league/i.test(query);
  const isFootball = /football|soccer|premier league|la liga|serie a|bundesliga|champions league|epl|goal[s]?\b|bpl|ligue/i.test(query);

  if (isCricket || isIPL) {
    // 1. IPL official site first if it's an IPL query
    if (isIPL) {
      console.log('[playwright] IPL query — trying iplt20.com');
      const ipl = await fromIPLT20().catch(() => null);
      if (ipl) return ipl;
    }

    // 2. Cricbuzz
    console.log('[playwright] Cricket query — trying Cricbuzz');
    const cb = await fromCricbuzz().catch(() => null);
    if (cb) return cb;

    // 3. ESPN Cricinfo
    console.log('[playwright] Cricbuzz empty — trying ESPN Cricinfo');
    const espn = await fromESPN().catch(() => null);
    if (espn) return espn;

    // 4. NDTV Sports
    console.log('[playwright] ESPN empty — trying NDTV Sports');
    const ndtv = await fromNDTVCricket().catch(() => null);
    if (ndtv) return ndtv;

    // 5. Google Sports
    console.log('[playwright] NDTV empty — trying Google Sports');
    const google = await fromGoogleSports(query).catch(() => null);
    if (google) return google;

    return null;
  }

  if (isFootball) {
    // 1. FlashScore
    console.log('[playwright] Football query — trying FlashScore');
    const flash = await fromFlashScore().catch(() => null);
    if (flash) return flash;

    // 2. BBC Sport
    console.log('[playwright] FlashScore empty — trying BBC Sport');
    const bbc = await fromBBCSport().catch(() => null);
    if (bbc) return bbc;

    // 3. Google Sports
    console.log('[playwright] BBC empty — trying Google Sports');
    const google = await fromGoogleSports(query).catch(() => null);
    if (google) return google;

    return null;
  }

  // General sports query — Google Sports then raw Google
  console.log('[playwright] General sports — trying Google Sports');
  const google = await fromGoogleSports(query).catch(() => null);
  if (google) return google;

  // Final raw fallback
  const { text } = await googleLiveSearch(query + ' live score today').catch(() => ({ text: '' }));
  const lines = text.split('\n').filter(l => l.trim().length > 2);
  const scoreLines = lines.filter(l =>
    /\d+[-\/]\d+|\bover[s]?\b|\binning[s]?\b|\bwicket|\bgoal|\brun[s]?\b|\bpoint[s]?\b|\bset\b|\bperiod\b|\blive\b|\bscore\b/i.test(l)
  );
  const result = (scoreLines.length ? scoreLines : lines.slice(0, 25)).join('\n').slice(0, 2000);
  return result || null;
}
