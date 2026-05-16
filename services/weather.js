/**
 * Weather service — dual provider
 * Primary:  OpenWeatherMap  (env: OPENWEATHER_API_KEY)
 * Fallback: WeatherAPI.com  (env: WEATHERAPI_KEY)
 *
 * Public API:
 *   getWeather(location: string) → { message: string, data: object, source: string }
 */

const TIMEOUT_MS = 12_000;

async function fetchWithTimeout(url, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Wind degrees → 16-point compass
function degToCompass(deg) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round((deg ?? 0) / 22.5) % 16];
}

// OWM condition code → emoji
function owmEmoji(code, isDay = true) {
  if (code >= 200 && code < 300) return "⛈";
  if (code >= 300 && code < 400) return "🌦";
  if (code === 511)               return "🌨";
  if (code >= 500 && code < 600) return "🌧";
  if (code >= 600 && code < 700) return "❄️";
  if (code >= 700 && code < 800) return "🌫";
  if (code === 800)               return isDay ? "☀️" : "🌙";
  if (code === 801)               return isDay ? "🌤" : "🌤";
  if (code === 802)               return "⛅";
  if (code >= 803)                return "☁️";
  return "🌡";
}

// WeatherAPI condition code → emoji
function waEmoji(code, isDay = true) {
  const sunny  = [1000];
  const pcloudy= [1003];
  const cloudy = [1006,1009];
  const mist   = [1030,1135,1147];
  const rain   = [1063,1072,1150,1153,1168,1171,1180,1183,1186,1189,1192,1195,1198,1201,1240,1243,1246];
  const snow   = [1066,1069,1114,1117,1204,1207,1210,1213,1216,1219,1222,1225,1237,1249,1252,1255,1258,1261,1264];
  const storm  = [1087,1273,1276,1279,1282];
  if (sunny.includes(code))   return isDay ? "☀️" : "🌙";
  if (pcloudy.includes(code)) return isDay ? "🌤" : "🌤";
  if (cloudy.includes(code))  return "☁️";
  if (mist.includes(code))    return "🌫";
  if (storm.includes(code))   return "⛈";
  if (snow.includes(code))    return "❄️";
  if (rain.includes(code))    return "🌧";
  return "🌡";
}

function formatUnixLocal(unix, offsetSec) {
  if (!unix) return null;
  const d = new Date((unix + offsetSec) * 1000);
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ── UV index label ────────────────────────────────────────────────────────────
function uvLabel(uv) {
  if (uv == null) return null;
  if (uv <= 2)  return `${uv} (Low)`;
  if (uv <= 5)  return `${uv} (Moderate)`;
  if (uv <= 7)  return `${uv} (High)`;
  if (uv <= 10) return `${uv} (Very High)`;
  return `${uv} (Extreme)`;
}

// ── Provider 1: OpenWeatherMap ────────────────────────────────────────────────

async function fromOpenWeather(location) {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) throw new Error("OPENWEATHER_API_KEY not configured");

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${key}&units=metric`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const parsed = (() => { try { return JSON.parse(body); } catch { return {}; } })();
    throw new Error(`${res.status} — ${parsed.message || body.slice(0, 120)}`);
  }

  const d = await res.json();
  const offsetSec = d.timezone ?? 0;
  const nowUnix   = Math.floor(Date.now() / 1000);
  const isDay     = nowUnix >= (d.sys?.sunrise ?? 0) && nowUnix < (d.sys?.sunset ?? Infinity);
  const code      = d.weather?.[0]?.id ?? 800;
  const windSpeedMs = d.wind?.speed ?? 0;
  const windGustMs  = d.wind?.gust ?? null;

  return {
    city:         d.name ?? location,
    region:       null,
    country:      d.sys?.country ?? "",
    tempC:        Math.round(d.main.temp),
    feelsC:       Math.round(d.main.feels_like),
    condition:    (d.weather?.[0]?.description ?? "—").replace(/\b\w/g, c => c.toUpperCase()),
    emoji:        owmEmoji(code, isDay),
    humidity:     d.main.humidity,
    windKph:      Math.round(windSpeedMs * 3.6),
    windDir:      degToCompass(d.wind?.deg),
    windGustKph:  windGustMs != null ? Math.round(windGustMs * 3.6) : null,
    visKm:        d.visibility != null ? Math.round(d.visibility / 1000) : null,
    pressureHpa:  d.main.pressure,
    cloudPct:     d.clouds?.all ?? null,
    uvIndex:      null,
    dewPointC:    null,
    sunrise:      formatUnixLocal(d.sys?.sunrise, offsetSec),
    sunset:       formatUnixLocal(d.sys?.sunset,  offsetSec),
    localTime:    null,
    source:       "OpenWeatherMap",
  };
}

// ── Provider 2: WeatherAPI.com ────────────────────────────────────────────────

async function fromWeatherApi(location) {
  const key = process.env.WEATHERAPI_KEY;
  if (!key) throw new Error("WEATHERAPI_KEY not configured");

  const url = `https://api.weatherapi.com/v1/current.json?key=${key}&q=${encodeURIComponent(location)}&aqi=no`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const parsed = (() => { try { return JSON.parse(body); } catch { return {}; } })();
    throw new Error(`${res.status} — ${parsed.error?.message || body.slice(0, 120)}`);
  }

  const d   = await res.json();
  const loc = d.location;
  const cur = d.current;
  const isDay = cur.is_day === 1;
  const waCode = cur.condition?.code ?? 1000;

  return {
    city:        loc.name,
    region:      loc.region || null,
    country:     loc.country,
    tempC:       Math.round(cur.temp_c),
    feelsC:      Math.round(cur.feelslike_c),
    condition:   cur.condition?.text ?? "—",
    emoji:       waEmoji(waCode, isDay),
    humidity:    cur.humidity,
    windKph:     Math.round(cur.wind_kph),
    windDir:     cur.wind_dir,
    windGustKph: cur.gust_kph != null ? Math.round(cur.gust_kph) : null,
    visKm:       cur.vis_km  != null ? Math.round(cur.vis_km)  : null,
    pressureHpa: Math.round(cur.pressure_mb),
    cloudPct:    cur.cloud   ?? null,
    uvIndex:     cur.uv      ?? null,
    dewPointC:   cur.dewpoint_c != null ? Math.round(cur.dewpoint_c) : null,
    sunrise:     null,
    sunset:      null,
    localTime:   loc.localtime ?? null,
    source:      "WeatherAPI",
  };
}

// ── Format ────────────────────────────────────────────────────────────────────

function formatWeatherMessage(w) {
  const locParts = [w.city, w.region, w.country].filter(Boolean);
  const locLine  = locParts.join(", ");
  const divider  = "┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄";

  const lines = [
    `${w.emoji} **Weather — ${w.city}**`,
    divider,
    `🌡 **Temperature** — ${w.tempC}°C  _(feels like ${w.feelsC}°C)_`,
    `🌥 **Condition** — ${w.condition}`,
    `💧 **Humidity** — ${w.humidity}%`,
  ];

  // Wind line
  const windLine = `🌬 **Wind** — ${w.windKph} km/h ${w.windDir}${w.windGustKph ? `  _(gusts ${w.windGustKph} km/h)_` : ""}`;
  lines.push(windLine);

  if (w.visKm     != null) lines.push(`👁 **Visibility** — ${w.visKm} km`);
  if (w.pressureHpa != null) lines.push(`📊 **Pressure** — ${w.pressureHpa} hPa`);
  if (w.cloudPct  != null) lines.push(`☁️ **Cloud Cover** — ${w.cloudPct}%`);

  const uv = uvLabel(w.uvIndex);
  if (uv) lines.push(`☀️ **UV Index** — ${uv}`);

  if (w.dewPointC != null) lines.push(`🫧 **Dew Point** — ${w.dewPointC}°C`);

  if (w.sunrise && w.sunset) {
    lines.push(`🌅 **Sunrise** — ${w.sunrise}   🌇 **Sunset** — ${w.sunset}`);
  }

  lines.push(divider);
  lines.push(`📍 _${locLine}_`);
  if (w.localTime) lines.push(`🕒 _Local time: ${w.localTime}_`);
  lines.push(`🔌 _Source: ${w.source}_`);

  return lines.join("\n");
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch current weather for a location string.
 * Primary:  OpenWeatherMap  (OPENWEATHER_API_KEY env var)
 * Fallback: WeatherAPI.com  (WEATHERAPI_KEY env var)
 *
 * @param {string} location  e.g. "London, UK" or "Tokyo"
 * @returns {{ message: string, data: object, source: string }}
 */
export async function getWeather(location) {
  const loc = location.trim().slice(0, 200);
  const errors = [];

  // 1. OpenWeatherMap (primary)
  if (process.env.OPENWEATHER_API_KEY) {
    try {
      const w = await fromOpenWeather(loc);
      return { message: formatWeatherMessage(w), data: w, source: w.source };
    } catch (e) {
      console.warn(`[weather] OpenWeatherMap failed: ${e.message}`);
      errors.push(`OpenWeatherMap: ${e.message}`);
    }
  } else {
    errors.push("OpenWeatherMap: OPENWEATHER_API_KEY not set");
  }

  // 2. WeatherAPI.com (fallback)
  if (process.env.WEATHERAPI_KEY) {
    try {
      const w = await fromWeatherApi(loc);
      return { message: formatWeatherMessage(w), data: w, source: w.source };
    } catch (e) {
      console.warn(`[weather] WeatherAPI failed: ${e.message}`);
      errors.push(`WeatherAPI: ${e.message}`);
    }
  } else {
    errors.push("WeatherAPI: WEATHERAPI_KEY not set");
  }

  throw new Error(
    `No weather data available for "${loc}".\n${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}`
  );
}
