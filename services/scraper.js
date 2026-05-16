/**
 * Free real-time data scraper — zero API keys required
 *
 * Sources:
 *   Google News RSS  — https://news.google.com/rss/search
 *   DuckDuckGo HTML  — https://html.duckduckgo.com/html/
 *   wttr.in JSON     — https://wttr.in/<location>?format=j1
 *   Bing News RSS    — https://www.bing.com/news/search (fallback)
 *
 * Public API:
 *   searchNews(query)           → { articles: [{title,source,published,url}], formatted: string }
 *   searchWeb(query, maxResults)→ { results: [{title,snippet,url}], formatted: string }
 *   getWeatherFree(location)    → { message: string, data: object }
 */

const TIMEOUT_MS = 12_000;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
};

async function fetchWithTimeout(url, options = {}, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&[a-z]+;/gi, " ");
}

function stripTags(html) {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function timeAgo(dateStr) {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return ""; }
}

// ── Google News RSS ───────────────────────────────────────────────────────────

async function fromGoogleNewsRSS(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetchWithTimeout(url, { headers: { ...HEADERS, Accept: "application/rss+xml,application/xml;q=0.9,*/*;q=0.8" } });
  if (!res.ok) throw new Error(`Google News RSS ${res.status}`);
  const xml = await res.text();

  const items = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
  for (const m of itemMatches) {
    const block = m[1];

    const title   = decodeHtmlEntities(stripTags((block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ""));
    const source  = decodeHtmlEntities(stripTags((block.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || ""));
    const pubDate = ((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "").trim();
    const link    = ((block.match(/<link>([\s\S]*?)<\/link>/) || block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/) || [])[1] || "").trim();
    const desc    = decodeHtmlEntities(stripTags((block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "")).slice(0, 200);

    if (title) items.push({ title, source, published: pubDate, timeAgo: timeAgo(pubDate), url: link, snippet: desc });
    if (items.length >= 8) break;
  }

  if (!items.length) throw new Error("No Google News results");
  return items;
}

// ── Bing News RSS (fallback) ──────────────────────────────────────────────────

async function fromBingNewsRSS(query) {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
  const res = await fetchWithTimeout(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Bing News ${res.status}`);
  const xml = await res.text();

  const items = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
  for (const m of itemMatches) {
    const block = m[1];
    const title   = decodeHtmlEntities(stripTags((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ""));
    const desc    = decodeHtmlEntities(stripTags((block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "")).slice(0, 200);
    const pubDate = ((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "").trim();
    const link    = ((block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "").trim();
    if (title) items.push({ title, source: "Bing News", published: pubDate, timeAgo: timeAgo(pubDate), url: link, snippet: desc });
    if (items.length >= 8) break;
  }

  if (!items.length) throw new Error("No Bing News results");
  return items;
}

// ── DuckDuckGo HTML search ────────────────────────────────────────────────────

async function fromDuckDuckGo(query, maxResults = 5) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
    body: `q=${encodeURIComponent(query)}&b=&kl=wt-wt`,
  });
  if (!res.ok) throw new Error(`DuckDuckGo ${res.status}`);
  const html = await res.text();

  const results = [];

  // Extract result blocks
  const resultBlocks = html.matchAll(/<div class="result__body">([\s\S]*?)<\/div>\s*<\/div>/gi);
  for (const m of resultBlocks) {
    const block = m[1];

    // Title
    const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
    const title = decodeHtmlEntities(stripTags(titleMatch?.[1] || ""));

    // URL
    const hrefMatch = block.match(/href="([^"]+)"/i);
    let url2 = hrefMatch?.[1] || "";
    if (url2.startsWith("//duckduckgo.com/l/?uddg=")) {
      url2 = decodeURIComponent(url2.split("uddg=")[1]?.split("&")[0] || "");
    }

    // Snippet
    const snipMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
    const snippet = decodeHtmlEntities(stripTags(snipMatch?.[1] || "")).slice(0, 300);

    if (title && title.length > 3) {
      results.push({ title, url: url2, snippet });
    }
    if (results.length >= maxResults) break;
  }

  // Fallback parser for different HTML structure
  if (!results.length) {
    const altMatches = html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<\/a>/gi);
    for (const m of altMatches) {
      const title = decodeHtmlEntities(stripTags(m[1]));
      const url2 = m[2];
      if (title.length > 3) results.push({ title, url: url2, snippet: "" });
      if (results.length >= maxResults) break;
    }
  }

  if (!results.length) throw new Error("No DuckDuckGo results parsed");
  return results;
}

// ── wttr.in free weather ──────────────────────────────────────────────────────

function wttrEmoji(weatherCode) {
  const c = parseInt(weatherCode);
  if ([113].includes(c))               return "☀️";
  if ([116].includes(c))               return "🌤";
  if ([119, 122].includes(c))          return "☁️";
  if ([143, 248, 260].includes(c))     return "🌫";
  if ([176, 185, 293, 296, 299, 302, 305, 308, 353, 356, 359].includes(c)) return "🌧";
  if ([179, 182, 263, 266, 281, 284, 311, 314, 317, 320, 323, 326, 329, 332, 335, 338, 350, 362, 365, 368, 371, 374, 377].includes(c)) return "❄️";
  if ([200, 386, 389, 392, 395].includes(c)) return "⛈";
  return "🌡";
}

async function fromWttrIn(location) {
  const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1`;
  const res = await fetchWithTimeout(url, { headers: { ...HEADERS, Accept: "application/json" } });
  if (!res.ok) throw new Error(`wttr.in ${res.status}`);
  const d = await res.json();

  const cur = d.current_condition?.[0];
  if (!cur) throw new Error("wttr.in returned no data");

  const area = d.nearest_area?.[0];
  const city    = area?.areaName?.[0]?.value || location;
  const country = area?.country?.[0]?.value || "";
  const code    = cur.weatherCode;

  return {
    city, country,
    tempC:       parseInt(cur.temp_C),
    feelsC:      parseInt(cur.FeelsLikeC),
    condition:   cur.weatherDesc?.[0]?.value || "—",
    emoji:       wttrEmoji(code),
    humidity:    parseInt(cur.humidity),
    windKph:     parseInt(cur.windspeedKmph),
    windDir:     cur.winddir16Point || "",
    visKm:       parseInt(cur.visibility),
    pressureHpa: parseInt(cur.pressure),
    cloudPct:    parseInt(cur.cloudcover),
    uvIndex:     parseInt(cur.uvIndex),
    localTime:   d.nearest_area?.[0]?.country?.[0]?.value ? null : null,
    source:      "wttr.in (free)",
  };
}

function formatWeatherFree(w) {
  const loc = [w.city, w.country].filter(Boolean).join(", ");
  const lines = [
    `${w.emoji} **Weather — ${w.city}**`,
    `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄`,
    `🌡 **Temperature** — ${w.tempC}°C  _(feels like ${w.feelsC}°C)_`,
    `🌥 **Condition** — ${w.condition}`,
    `💧 **Humidity** — ${w.humidity}%`,
    `🌬 **Wind** — ${w.windKph} km/h ${w.windDir}`,
  ];
  if (w.visKm  != null) lines.push(`👁 **Visibility** — ${w.visKm} km`);
  if (w.pressureHpa != null) lines.push(`📊 **Pressure** — ${w.pressureHpa} hPa`);
  if (w.cloudPct != null) lines.push(`☁️ **Cloud Cover** — ${w.cloudPct}%`);
  if (w.uvIndex != null) lines.push(`☀️ **UV Index** — ${w.uvIndex}`);
  lines.push(`┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄`);
  lines.push(`📍 _${loc}_`);
  lines.push(`🔌 _Source: ${w.source}_`);
  return lines.join("\n");
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Search latest news for a query (no API key needed).
 * Primary: Google News RSS  |  Fallback: Bing News RSS
 */
export async function searchNews(query) {
  const q = query.trim().slice(0, 200);
  let articles;

  try {
    articles = await fromGoogleNewsRSS(q);
    console.log(`[scraper] Google News: ${articles.length} articles for "${q}"`);
  } catch (e) {
    console.warn(`[scraper] Google News failed (${e.message}), trying Bing...`);
    try {
      articles = await fromBingNewsRSS(q);
      console.log(`[scraper] Bing News: ${articles.length} articles for "${q}"`);
    } catch (e2) {
      throw new Error(`All news sources failed: ${e.message} | ${e2.message}`);
    }
  }

  const lines = [`📰 **Latest News: ${q}**`, `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄`];
  articles.slice(0, 6).forEach((a, i) => {
    lines.push(`**${i + 1}. ${a.title}**`);
    if (a.source) lines.push(`   _${a.source}${a.timeAgo ? " · " + a.timeAgo : ""}_`);
    if (a.snippet && a.snippet.length > 10) lines.push(`   ${a.snippet}`);
    lines.push("");
  });
  lines.push(`🕒 _Updated just now · Scraped live_`);

  return { articles, formatted: lines.join("\n").trim() };
}

/**
 * Search the web for real-time information (no API key needed).
 * Uses DuckDuckGo HTML scraping.
 */
export async function searchWeb(query, maxResults = 5) {
  const q = query.trim().slice(0, 300);
  const results = await fromDuckDuckGo(q, maxResults);
  console.log(`[scraper] DuckDuckGo: ${results.length} results for "${q}"`);

  const lines = [`🔍 **Web Search: ${q}**`, `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄`];
  results.forEach((r, i) => {
    lines.push(`**${i + 1}. ${r.title}**`);
    if (r.snippet) lines.push(`   ${r.snippet}`);
    lines.push("");
  });
  lines.push(`🕒 _Live results · DuckDuckGo_`);

  return { results, formatted: lines.join("\n").trim() };
}

/**
 * Get current weather without any API key via wttr.in.
 * Returns same shape as the paid weather service.
 */
export async function getWeatherFree(location) {
  const loc = location.trim().slice(0, 200);
  const w = await fromWttrIn(loc);
  return { message: formatWeatherFree(w), data: w, source: "wttr.in" };
}
