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

const TIMEOUT_MS = 6_000;

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

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MOBILE_UA  = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36";
const CONSENT_COOKIE = "CONSENT=YES+cb.20240101-07-p0.en+FX+953; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg";

async function fetchGoogleDesktop(query, gl = "in") {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=${gl}&num=5&pws=0&safe=off`;
  const res = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": DESKTOP_UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      "Cookie": CONSENT_COOKIE,
    },
  });
  if (!res.ok) throw new Error(`Google desktop HTTP ${res.status}`);
  return await res.text();
}

async function fetchGoogleMobile(query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=in&num=5`;
  const res = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": MOBILE_UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Cookie": CONSENT_COOKIE,
    },
  });
  if (!res.ok) throw new Error(`Google mobile HTTP ${res.status}`);
  return await res.text();
}

async function fetchGoogleHTML(query) {
  // Default: desktop with India locale (most accurate for all regions)
  return fetchGoogleDesktop(query, "in");
}

// ── WMO weather code → description ───────────────────────────────────────────

const WMO = {
  0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",
  45:"Foggy",48:"Icy fog",
  51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",
  61:"Light rain",63:"Rain",65:"Heavy rain",
  71:"Light snow",73:"Snow",75:"Heavy snow",77:"Snow grains",
  80:"Light showers",81:"Rain showers",82:"Heavy showers",
  85:"Snow showers",86:"Heavy snow showers",
  95:"Thunderstorm",96:"Thunderstorm with hail",99:"Thunderstorm with heavy hail",
};

// ── Open-Meteo (free, no API key, very accurate) ──────────────────────────────

async function fromOpenMeteo(location) {
  // Step 1: Geocode with Nominatim (OpenStreetMap, free)
  const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
  const geoRes = await fetchWithTimeout(geoUrl, {
    headers: { "User-Agent": "BlueMindBot/1.0 (Telegram AI userbot)" },
  });
  if (!geoRes.ok) throw new Error(`Geocoding HTTP ${geoRes.status}`);
  const geoData = await geoRes.json();
  if (!geoData.length) throw new Error(`Location not found: "${location}"`);
  const { lat, lon, display_name } = geoData[0];
  const city = display_name.split(",")[0].trim();

  // Step 2: Current weather from Open-Meteo
  const wUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation&wind_speed_unit=kmh&timezone=auto`;
  const wRes = await fetchWithTimeout(wUrl, { headers: HEADERS });
  if (!wRes.ok) throw new Error(`Open-Meteo HTTP ${wRes.status}`);
  const wData = await wRes.json();
  const cur = wData.current;
  if (!cur) throw new Error("Open-Meteo returned no current data");

  return {
    city,
    tempC:     Math.round(cur.temperature_2m),
    feelsLike: Math.round(cur.apparent_temperature),
    humidity:  cur.relative_humidity_2m,
    wind:      `${Math.round(cur.wind_speed_10m)} km/h`,
    condition: WMO[cur.weather_code] || "Clear",
  };
}

// ── Google Weather parser — extract everything from raw HTML ──────────────────

function parseWeatherHTML(html) {
  let tempC = null, condition = "", humidity = "", wind = "", feelsLike = "";

  // ── Temperature (6 patterns, most → least specific) ──────────────────────

  // 1. wob_t class: <span class="wob_t ...">42</span>
  if (tempC === null) {
    const m = html.match(/class="wob_t[^"]*"[^>]*>\s*(-?\d{1,3})\s*<\/span>/);
    if (m) tempC = parseInt(m[1]);
  }

  // 2. Embedded JS/JSON data value attribute: data-value="42"
  if (tempC === null) {
    const m = html.match(/data-value="(-?\d{1,3})"/);
    if (m) tempC = parseInt(m[1]);
  }

  // 3. JSON array pattern: ["42","°C"] or ["42", "\u00b0C"]
  if (tempC === null) {
    const m = html.match(/\["(-?\d{1,3})","(?:°|\\u00b0)C"\]/);
    if (m) tempC = parseInt(m[1]);
  }

  // 4. Page title or meta: "42°C" or "42 °C"
  if (tempC === null) {
    const titleM = html.match(/<title>[^<]*?(-?\d{1,3})\s*°C[^<]*<\/title>/i);
    if (titleM) tempC = parseInt(titleM[1]);
  }

  // 5. Any span/div content that is just a number right before °C
  if (tempC === null) {
    const m = html.match(/>(-?\d{1,3})<\/(?:span|div)>\s*°/);
    if (m) tempC = parseInt(m[1]);
  }

  // 6. Last resort — first standalone °C occurrence in the page (weather card is always near top)
  if (tempC === null) {
    const slice = html.slice(0, 30000); // weather card is always in first 30KB
    const m = slice.match(/(-?\d{1,3})\s*°C/);
    if (m) tempC = parseInt(m[1]);
  }

  // ── Condition ─────────────────────────────────────────────────────────────
  const cond1 = html.match(/class="wob_dc[^"]*"[^>]*>([\s\S]*?)<\/span>/);
  if (cond1) condition = stripTags(cond1[1]).trim();

  if (!condition) {
    // alt: data-local-attribute or aria-label on the weather icon
    const cond2 = html.match(/(?:aria-label|title)="([A-Za-z][a-z ]+(?:sky|cloud|rain|sun|snow|fog|storm|drizzle|shower|overcast|clear|wind)[a-z ]*)"/i);
    if (cond2) condition = cond2[1];
  }

  // ── Feels like ────────────────────────────────────────────────────────────
  const fl = html.match(/(?:Feels like|feels_like)[^0-9-]*(-?\d{1,3})/i);
  if (fl) feelsLike = fl[1];

  // ── Humidity ──────────────────────────────────────────────────────────────
  const hum = html.match(/Humidity[^0-9]*(\d{1,3})%/i) ||
              html.match(/class="wob_hm[^"]*"[^>]*>(\d{1,3})%/i);
  if (hum) humidity = hum[1];

  // ── Wind ──────────────────────────────────────────────────────────────────
  const wd = html.match(/Wind(?:speed)?[^0-9]*(\d+(?:\.\d+)?)\s*(?:km\/h|kph|kmh)/i) ||
             html.match(/class="wob_ws[^"]*"[^>]*>([^<]+)<\/span>/i);
  if (wd) wind = wd[1].includes("km") ? wd[1].trim() : `${wd[1].trim()} km/h`;

  return { tempC, condition, feelsLike, humidity, wind };
}

// ── Google Weather scraper — desktop first, mobile if temp still missing ──────

async function fromGoogleWeather(location) {
  const query = `weather in ${location}`;

  // Attempt 1: Desktop Google with India locale
  const desktopHtml = await fetchGoogleDesktop(query, "in");
  let parsed = parseWeatherHTML(desktopHtml);

  // Attempt 2: Mobile Google — simpler HTML, often has the card even when desktop doesn't
  if (parsed.tempC === null) {
    console.warn(`[weather] Desktop parse missed temp for "${location}", trying mobile...`);
    const mobileHtml = await fetchGoogleMobile(query);
    const mobileParsed = parseWeatherHTML(mobileHtml);
    // Merge: use mobile values for anything still missing
    parsed = {
      tempC:     mobileParsed.tempC     ?? parsed.tempC,
      condition: mobileParsed.condition || parsed.condition,
      feelsLike: mobileParsed.feelsLike || parsed.feelsLike,
      humidity:  mobileParsed.humidity  || parsed.humidity,
      wind:      mobileParsed.wind      || parsed.wind,
    };
  }

  if (parsed.tempC === null) {
    throw new Error(`Could not extract temperature for "${location}" from Google`);
  }

  return { city: location, ...parsed };
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
 * Get current weather — tries Google card first, falls back to Open-Meteo.
 * Zero API keys, always works.
 */
export async function getWeatherFree(location) {
  const loc = location.trim().slice(0, 200);
  let w;
  try {
    w = await fromGoogleWeather(loc);
  } catch (e) {
    console.warn(`[weather] Google card failed (${e.message}), using Open-Meteo`);
    w = await fromOpenMeteo(loc);
  }
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
