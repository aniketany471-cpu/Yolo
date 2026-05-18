import { browserTool } from './browser.js';

export async function sportsTool({ prompt, config, performWebSearch }) {
  // 1) quick search API path
  if (performWebSearch && config?.searchEnabled === 1) {
    const q = `${prompt} live score`; 
    const data = await performWebSearch(q, config, false);
    if (data) return { ok: true, data, source: 'search' };
  }
  // 2) browser fallback (google widget / Cricbuzz page)
  const browserRes = await browserTool({ query: `${prompt} live score cricbuzz` });
  if (browserRes.ok) return browserRes;
  return { ok: false, data: '', source: 'none' };
}
