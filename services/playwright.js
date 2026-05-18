/**
 * Playwright Live Scraper
 * Uses headless Chromium to render JS-heavy pages and extract live data.
 * Priority sources per query type:
 *   Weather       → AccuWeather (city-aware)
 *   Cricket/IPL   → Cricbuzz → ESPN Cricinfo → Google
 *   Football      → Google Sports → FlashScore
 *   General       → Google Search
 */

import { chromium } from 'playwright';

const NAV_TIMEOUT = 25_000;

let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', '--disable-gpu',
        '--no-first-run', '--no-zygote', '--single-process',
        '--disable-blink-features=AutomationControlled',
      ],
    });
  }
  return browser;
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
 * Handles typos — AccuWeather's own fuzzy search will clean them up.
 */
function extractCity(query) {
  const q = query.trim();
  // "weather in Delhi" / "temp in new york" / "forecast for Mumbai"
  let m = q.match(/(?:weather|temp(?:erature)?|forecast|climate)\s+(?:in|of|for|at)\s+(.+?)(?:\s+(?:today|now|tonight|tomorrow|this week|right now|forecast))?$/i);
  if (m) return m[1].trim();
  // "Delhi weather" / "mumbai temperature"
  m = q.match(/^(.+?)\s+(?:weather|temp(?:erature)?|forecast|climate)/i);
  if (m) return m[1].trim();
  // "what's the weather in Delhi today"
  m = q.match(/(?:what(?:'s| is)|how(?:'s| is)|tell me)\s+the\s+(?:weather|temp)\s+(?:in|of|for|at)?\s*(.+?)(?:\s+today|\s+now|\s+tonight)?$/i);
  if (m) return m[1].trim();
  // Fallback: strip noise words and return what's left
  const stripped = q
    .replace(/\b(?:weather|temperature|temp|forecast|climate|today|now|tonight|tomorrow|right now|in|of|for|at|what|is|how|the|tell|me)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return stripped || q;
}

/**
 * Scrape AccuWeather for a city's current weather + short forecast.
 * Returns formatted string or null if scraping failed.
 */
export async function getWeather(query) {
  const city = extractCity(query);
  console.log(`[playwright] Weather query — city detected: "${city}"`);

  const { ctx, page } = await newPage();
  try {
    // Step 1: Search for city on AccuWeather
    const searchUrl = `https://www.accuweather.com/en/search-locations?query=${encodeURIComponent(city)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(2500);

    // Step 2: Click first location result to get to the actual forecast page
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

    // Step 3: Extract structured weather data via DOM queries
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
        // Daily forecast panels
        forecast:   getAll('.daily-list-item, [class*="DailyForecast"] [class*="day"], [class*="daily"] [class*="panel"]').slice(0, 3),
        pageTitle:  document.title || '',
      };
    });

    const lines = [];
    // Use page title to confirm the actual city AccuWeather matched
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

    // Step 4: DOM queries got nothing — fall back to raw text extraction
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

/**
 * Fetch Cricbuzz live scores — best source for IPL / cricket.
 */
async function fromCricbuzz(query) {
  const { ctx, page } = await newPage();
  try {
    await page.goto('https://www.cricbuzz.com/cricket-match/live-scores', {
      waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT,
    });
    await page.waitForTimeout(3000);
    const text = await extractText(page);
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    const scoreLines = lines.filter(l =>
      /\d+\/\d+|\bover[s]?\b|\bwkt[s]?\b|\bwicket[s]?\b|\brun[s]?\b|\blive\b|\bvs\.?\b|\binning[s]?\b|\bbatting\b|\bbowling\b|\bIPL\b|\bT20\b|\bODI\b|\bTest\b/i.test(l)
    );
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
 * Fetch ESPN Cricinfo live scores — fallback for cricket.
 */
async function fromESPN(query) {
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
      return '🏏 Live Cricket Scores (ESPN Cricinfo)\n' + scoreLines.slice(0, 30).join('\n')}
    return null;
  } catch(e) {
    console.warn('[playwright] ESPN error:', e.message);
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
 * Cricket: Cricbuzz → ESPN → Google
 * Others:  Google
 */
export async function getLiveScore(query) {
  const isCricket = /cricket|ipl|odi|t20|test match|bcci|wicket|batting|bowling|over[s]?\b|ball by ball|scorecard/i.test(query);

  if (isCricket) {
    console.log('[playwright] Cricket query — trying Cricbuzz first');
    const cb = await fromCricbuzz(query);
    if (cb) return cb;

    console.log('[playwright] Cricbuzz empty — trying ESPN Cricinfo');
    const espn = await fromESPN(query);
    if (espn) return espn;
  }

  // General / fallback: Google
  console.log('[playwright] Falling back to Google live search');
  const { text } = await googleLiveSearch(query + ' live score today');
  const lines = text.split('\n').filter(l => l.trim().length > 2);
  const scoreLines = lines.filter(l =>
    /\d+[-\/]\d+|\bover[s]?\b|\binning[s]?\b|\bwicket|\bgoal|\brun[s]?\b|\bpoint[s]?\b|\bset\b|\bperiod\b|\blive\b|\bscore\b/i.test(l)
  );
  const result = (scoreLines.length ? scoreLines : lines.slice(0, 25)).join('\n').slice(0, 2000);
  return result || null;
}
