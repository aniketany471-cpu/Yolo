/**
 * Playwright Live Scraper
 * Uses headless Chromium to render JS-heavy pages and extract live data.
 * Priority sources per query type:
 *   Cricket/IPL  → Cricbuzz → ESPN Cricinfo → Google
 *   Football     → Google Sports → FlashScore
 *   General      → Google Search
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
    return (document.body?.innerText || '').replace(/
{3,}/g, '

').trim();
  });
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
    const lines = text.split('
').map(l => l.trim()).filter(l => l.length > 1);

    // Pull match blocks: team names, scores, overs, status
    const scoreLines = lines.filter(l =>
      /d+/d+|over[s]?|wkt[s]?|wicket[s]?|run[s]?|live|vs.?|inning[s]?|batting|bowling|IPL|T20|ODI|Test/i.test(l)
    );

    if (scoreLines.length >= 2) {
      return '🏏 Live Cricket Scores (Cricbuzz)
' + scoreLines.slice(0, 30).join('
');
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
    const lines = text.split('
').map(l => l.trim()).filter(l => l.length > 1);
    const scoreLines = lines.filter(l =>
      /d+/d+|over[s]?|wicket[s]?|live|vs.?|inning[s]?/i.test(l)
    );
    if (scoreLines.length >= 2) {
      return '🏏 Live Cricket Scores (ESPN Cricinfo)
' + scoreLines.slice(0, 30).join('
');
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
 * Google search with a real browser — works for general live queries.
 */
export async function googleLiveSearch(query) {
  const { ctx, page } = await newPage();
  try {
    const url = 'https://www.google.com/search?q=' + encodeURIComponent(query) + '&hl=en&gl=in';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    // Wait for either search results or a sports/answer card
    await Promise.race([
      page.waitForSelector('#search',          { timeout: 8000 }),
      page.waitForSelector('[data-attrid]',    { timeout: 8000 }),
      page.waitForSelector('.card-section',    { timeout: 8000 }),
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
  const isCricket = /cricket|ipl|odi|t20|test match|bcci|wicket|batting|bowling|over[s]?|ball by ball|scorecard/i.test(query);

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
  const lines = text.split('
').filter(l => l.trim().length > 2);
  const scoreLines = lines.filter(l =>
    /d+[-/]d+|over[s]?|inning[s]?|wicket|goal|run[s]?|point[s]?|set|period|live|score/i.test(l)
  );
  const result = (scoreLines.length ? scoreLines : lines.slice(0, 25)).join('
').slice(0, 2000);
  return result || null;
}
