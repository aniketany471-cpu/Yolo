let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  chromium = null;
}

let sharedBrowser = null;
let lastHealth = 0;

// FIX-8: Track consecutive page-level failures so a run of broken navigations
// (which don't crash the browser) invalidates the health cache early.
let failStreak = 0;
const MAX_FAIL_STREAK = 3;
// FIX-8: Reduced from 60 s → 30 s so stale "healthy" state clears faster.
const HEALTH_CACHE_MS = 30_000;

async function getBrowser() {
  if (!chromium) return null;
  if (sharedBrowser) return sharedBrowser;
  sharedBrowser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  return sharedBrowser;
}

export async function browserHealthCheck() {
  if (!chromium) return { ok: false, reason: 'playwright_unavailable' };
  const now = Date.now();
  // FIX-8: Skip cache when failStreak has forced a reset (lastHealth was cleared).
  if (now - lastHealth < HEALTH_CACHE_MS) return { ok: true, cached: true };
  try {
    const b = await getBrowser();
    const page = await b.newPage();
    await page.goto('about:blank', { timeout: 5000 });
    await page.close();
    lastHealth = now;
    failStreak = 0;
    return { ok: true };
  } catch (e) {
    sharedBrowser = null;
    lastHealth = 0;
    return { ok: false, reason: e.message };
  }
}

export async function browserTool({ query, url }) {
  if (!chromium) return { ok: false, reason: 'playwright_unavailable' };
  const health = await browserHealthCheck();
  if (!health.ok) return { ok: false, reason: health.reason || 'browser_unhealthy' };
  const browser = await getBrowser();
  let page = null;
  try {
    page = await browser.newPage();
    if (url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    else await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const text = await page.locator('body').innerText();
    // FIX-8: Successful navigation resets the failure streak.
    failStreak = 0;
    return { ok: true, data: text.slice(0, 4000), source: 'browser' };
  } catch (e) {
    // FIX-8: Track page-level failures. After MAX_FAIL_STREAK consecutive failures,
    // force a browser restart by nulling sharedBrowser and clearing the health cache.
    failStreak++;
    if (String(e?.message || '').toLowerCase().includes('browser') || failStreak >= MAX_FAIL_STREAK) {
      sharedBrowser = null;
      lastHealth = 0;
      failStreak = 0;
    }
    return { ok: false, reason: e.message };
  } finally {
    try { if (page) await page.close(); } catch {}
  }
}
