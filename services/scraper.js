/**
 * Real-time data scraper — Google only, zero API keys required.
 *
 * Sources:
 *   Google Search HTML  — weather card, web results
 *   Google News RSS     — https://news.google.com/rss/search
 *   Bing News RSS       — fallback when Google News fails
 *
 * Public API:
 *   searchNews(query)            → { articles, formatted }
 *   searchWeb(query, maxResults) → { results, formatted }
 *   getWeatherFree(location)     → { message, data, source }
 */

const TIMEOUT_MS = 14_000;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Upgrade-Insecure-Requests": "1",
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

function weatherEmoji(condition = "") {
  const c = condition.toLowerCase();
  if (c.includes("thunder") || c.includes("storm"))  return "⛈";
  if (c.includes("drizzle") || c.includes("shower"))  return "🌦";
  if (c.includes("rain"))                              return "🌧";
  if (c.includes("snow") || c.includes("blizzard"))   return "❄️";
  if (c.includes("fog") || c.includes("mist") || c.includes("haze")) return "🌫";
  if (c.includes("cloud") || c.includes("overcast"))  return "☁️";
  if (c.includes("partly") || c.includes("mostly"))   return "🌤";
  if (c.includes("clear") || c.includes("sunny"))     return "☀️";
  if (c.includes("wind"))                              return "💨";
  return "🌡";
}

// ── Google Search HTML fetch ──────────────────────────────────────────────────

async function fetchGoogleHTML(query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us&num=10&pws=0`;
  const res = await fetchWithTimeout(url, {
    headers: {
      ...HEADERS,
      "Cookie": "CONSENT=YES+cb; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg",
    },
  });
  if (!res.ok) throw new Error(`Google search HTTP ${res.status}`);
  return await res.text();
}

// ── Google Weather scraper ────────────────────────────────────────────────────

async function fromGoogleWeather(location) {
  const html = await fetchGoogleHTML(`weather in ${location}`);

  // Google weather card patterns — multiple selectors for resilience
  let tempC = null, condition = "", humidity = "", wind = "", feelsLike = "";

  // Temperature: Google uses <span class="wob_t"> for the number
  // Pattern 1: wob_t class (most common)
  const tempMatch = html.match(/class="wob_t[^"]*"[^>]*>(\d+)<\/span>/);
  if (tempMatch) tempC = parseInt(tempMatch[1]);

  // Pattern 2: BNeawe tAd8D AP7Wnd (Google's answer box)
  if (tempC === null) {
    const temp2 = html.match(/(\d+)°C/);
    if (temp2) tempC = parseInt(temp2[1]);
  }

  // Condition: wob_dc class
  const condMatch = html.match(/class="wob_dc[^"]*"[^>]*>([\s\S]*?)<\/span>/);
  if (condMatch) condition = stripTags(condMatch[1]).trim();

  // Feels like
  const feelsMatch = html.match(/feels like[^<]*<[^>]+>(\d+)/i) ||
                     html.match(/Feels like[^0-9]*(\d+)/);
  if (feelsMatch) feelsLike = feelsMatch[1];

  // Humidity
  const humMatch = html.match(/Humidity[^0-9]*(\d+)%/i);
  if (humMatch) humidity = humMatch[1];

  // Wind
  const windMatch = html.match(/Wind[^0-9]*(\d+(?:\.\d+)?\s*(?:km\/h|mph|kph))/i);
  if (windMatch) wind = windMatch[1];

  if (tempC === null) throw new Error("Google weather card not found — Google may have changed its layout");

  return { city: location, tempC, feelsLike, condition, humidity, wind };
}

// ── Google News RSS ───────────────────────────────────────────────────────────

async function fromGoogleNewsRSS(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetchWithTimeout(url, {
    headers: { ...HEADERS, Accept: "application/rss+xml,application/xml;q=0.9,*/*;q=0.8" },
  });
  if (!res.ok) throw new Error(`Google News RSS ${res.status}`);
  const xml = await res.text();

  const items = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
  for (const m of itemMatches) {
    const block = m[1];
    const title   = decodeHtmlEntities(stripTags(
      (block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
       block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ""
    ));
    const source  = decodeHtmlEntities(stripTags(
      (block.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || ""
    ));
    const pubDate = ((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "").trim();
    const link    = ((block.match(/<link>([\s\S]*?)<\/link>/) ||
                      block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/) || [])[1] || "").trim();
    const desc    = decodeHtmlEntities(stripTags(
      (block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
       block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || ""
    )).slice(0, 200);

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

// ── Google Search web results ─────────────────────────────────────────────────

async function fromGoogleSearch(query, maxResults = 5) {
  const html = await fetchGoogleHTML(query);
  const results = [];

  // Pattern 1: Standard organic results — <h3> inside <a>
  const blockRe = /<div[^>]+jsname[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<\/div>/gi;
  const hrefRe  = /href="(https?:\/\/[^"&]+)"/;

  // Simpler reliable parse: find all <a href="http..."> with an <h3> inside
  const linkBlocks = html.matchAll(/<a href="(https?:\/\/[^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/gi);
  for (const m of linkBlocks) {
    const url    = m[1].split("&")[0];
    const title  = decodeHtmlEntities(stripTags(m[2]));
    if (!title || title.length < 3) continue;
    if (url.includes("google.com")) continue;

    // Try to find a snippet near this match
    const idx    = m.index || 0;
    const nearby = html.slice(idx, idx + 800);
    const snipM  = nearby.match(/class="[^"]*(?:VwiC3b|s3v9rd|aCOpRe|st)[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/i);
    const snippet = snipM ? decodeHtmlEntities(stripTags(snipM[1])).slice(0, 250) : "";

    results.push({ title, url, snippet });
    if (results.length >= maxResults) break;
  }

  // Fallback: any <h3> adjacent to an external href
  if (results.length < 2) {
    const h3s = html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi);
    for (const m of h3s) {
      const title = decodeHtmlEntities(stripTags(m[1]));
      if (!title || title.length < 5) continue;
      const nearby = html.slice(Math.max(0, m.index - 200), m.index + 200);
      const hm = nearby.match(/href="(https?:\/\/(?!www\.google)[^"]+)"/);
      if (hm) {
        results.push({ title, url: hm[1].split("&")[0], snippet: "" });
        if (results.length >= maxResults) break;
      }
    }
  }

  if (!results.length) throw new Error("No Google results parsed");
  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get current weather by scraping Google's weather card.
 * Absolutely zero API keys. Returns same shape as paid weather service.
 */
export async function getWeatherFree(location) {
  const loc = location.trim().slice(0, 200);
  const w = await fromGoogleWeather(loc);
  const emoji = weatherEmoji(w.condition);

  const lines = [
    `${emoji} **${w.city}**`,
    `🌡 **${w.tempC}°C**${w.feelsLike ? `  _(feels like ${w.feelsLike}°C)_` : ""}`,
  ];
  if (w.condition) lines.push(`☁️ ${w.condition}`);
  if (w.humidity)  lines.push(`💧 Humidity: ${w.humidity}%`);
  if (w.wind)      lines.push(`🌬 Wind: ${w.wind}`);

  return { message: lines.join("\n"), data: w, source: "Google" };
}

/**
 * Search latest news (Google News RSS → Bing fallback).
 */
export async function searchNews(query) {
  const q = query.trim().slice(0, 200);
  let articles;

  try {
    articles = await fromGoogleNewsRSS(q);
  } catch (e) {
    console.warn(`[scraper] Google News failed (${e.message}), trying Bing...`);
    try {
      articles = await fromBingNewsRSS(q);
    } catch (e2) {
      throw new Error(`All news sources failed: ${e.message} | ${e2.message}`);
    }
  }

  const lines = [`📰 **${q}**`, `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄`];
  articles.slice(0, 6).forEach((a, i) => {
    lines.push(`**${i + 1}. ${a.title}**`);
    if (a.source) lines.push(`   _${a.source}${a.timeAgo ? " · " + a.timeAgo : ""}_`);
    if (a.snippet && a.snippet.length > 10) lines.push(`   ${a.snippet}`);
    lines.push("");
  });

  return { articles, formatted: lines.join("\n").trim() };
}

/**
 * Search the web via Google (no API key needed).
 */
export async function searchWeb(query, maxResults = 5) {
  const q = query.trim().slice(0, 300);
  let results;

  try {
    results = await fromGoogleSearch(q, maxResults);
  } catch (e) {
    throw new Error(`Google search failed: ${e.message}`);
  }

  const lines = [`🔍 **${q}**`, `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄`];
  results.forEach((r, i) => {
    lines.push(`**${i + 1}. ${r.title}**`);
    if (r.snippet) lines.push(`   ${r.snippet}`);
    lines.push("");
  });

  return { results, formatted: lines.join("\n").trim() };
}
