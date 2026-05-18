/**
 * Playwright Live Scraper
 * Uses headless Chromium to render JS-heavy pages and extract live data.
 * Handles: live scores, stock prices, real-time data that plain fetch() cannot get.
 *
 * Exported API:
 *   scrapePage(url, opts)   — render any URL and return its visible text
 *   googleLiveSearch(query) — render a Google SERP and return visible text
 *   getLiveScore(query)     — extract live score lines from a Google Sports search
 */

import { chromium } from 'playwright';

const NAV_TIMEOUT = 20_000;

let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
      ],
    });
  }
  return browser;
}

process.on('exit',    () => { if (browser) browser.close().catch(() => {}); });
process.on('SIGTERM', () => { if (browser) browser.close().catch(() => {}); });

/**
 * Scrape a URL with a real headless browser and return its visible text.
 * @param {string} url
 * @param {{ waitFor?: string, timeout?: number }} opts
 * @returns {Promise<{ text: string, title: string, url: string }>}
 */
export async function scrapePage(url, opts = {}) {
  const b = await getBrowser();
  const ctx = await b.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();
  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: opts.timeout || NAV_TIMEOUT,
    });

    if (opts.waitFor) {
      await page.waitForSelector(opts.waitFor, { timeout: 8000 }).catch(() => {});
    } else {
      await page.waitForTimeout(2500);
    }

    const title = await page.title().catch(() => '');
    const text = await page.evaluate(() => {
      ['script', 'style', 'nav', 'footer', 'iframe', 'noscript'].forEach(tag => {
        document.querySelectorAll(tag).forEach(el => el.remove());
      });
      return document.body?.innerText || '';
    });

    return {
      text: text.replace(/
{3,}/g, '

').trim().slice(0, 8000),
      title,
      url,
    };
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * Search Google with a real browser and return the rendered SERP text.
 * Best for: live scores, weather cards, featured snippets, knowledge panels.
 * @param {string} query
 * @returns {Promise<{ text: string, title: string }>}
 */
export async function googleLiveSearch(query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us`;
  return scrapePage(url, { waitFor: '#search', timeout: 20000 });
}

/**
 * Get live sports scores or any real-time result for a query.
 * Renders Google with Chromium so JS-rendered score cards are fully visible.
 * @param {string} query  e.g. "India vs Australia cricket score"
 * @returns {Promise<string>}
 */
export async function getLiveScore(query) {
  const { text } = await googleLiveSearch(query + ' live score');
  const lines = text.split('
').filter(l => l.trim().length > 2);
  const scoreLines = lines.filter(l =>
    /d+[-/]d+|over[s]?|innings?|wicket|goal|run[s]?|point[s]?|set|period|live|score/i.test(l)
  );
  const result = (scoreLines.length ? scoreLines : lines.slice(0, 20)).join('
').slice(0, 2000);
  return result || 'No live score data found.';
}
