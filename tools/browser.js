let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  chromium = null;
}
let sharedBrowser = null;
let lastHealth = 0;
async function getBrowser() {
  if (!chromium) return null;
  if (sharedBrowser) return sharedBrowser;
  sharedBrowser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  return sharedBrowser;
}
export async function browserHealthCheck() {
  if (!chromium) return { ok: false, reason: 'playwright_unavailable' };
  const now = Date.now();
  if (now - lastHealth < 60000) return { ok: true, cached: true };
  try {
    const b = await getBrowser();
    const page = await b.newPage();
    await page.goto('about:blank', { timeout: 5000 });
    await page.close();
    lastHealth = now;
    return { ok: true };
  } catch (e) {
    sharedBrowser = null;
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
    return { ok: true, data: text.slice(0, 4000), source: 'browser' };
  } catch (e) {
    if (String(e?.message || '').toLowerCase().includes('browser')) sharedBrowser = null;
    return { ok: false, reason: e.message };
  } finally {
    try { if (page) await page.close(); } catch {}
  }
}
