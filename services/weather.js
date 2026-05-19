const LOCATION_TTL_MS = 24 * 60 * 60 * 1000;
const WEATHER_TTL_MS = 2 * 60 * 1000;

const locationCache = new Map();
const weatherCache = new Map();

function getCache(map, key) {
  const item = map.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    map.delete(key);
    return null;
  }
  return item.value;
}
function setCache(map, key, value, ttl) {
  map.set(key, { value, expiresAt: Date.now() + ttl });
}

function extractLocation(query) {
  const q = (query || "").trim();
  const stripped = q
    .replace(/\b(weather|temperature|temp|forecast|humidity|wind|uv|today|tomorrow|tonight|this evening|currently|now|in|at)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || "";
}

async function resolveLocationKey(locationName, apiKey) {
  const cacheKey = locationName.toLowerCase();
  const cached = getCache(locationCache, cacheKey);
  if (cached) {
    console.log("[weather] location cache hit");
    return cached;
  }

  console.log("[weather] resolving location");
  const url = `https://dataservice.accuweather.com/locations/v1/cities/search?apikey=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(locationName)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`location search failed ${resp.status}`);
  const data = await resp.json();
  const first = Array.isArray(data) ? data[0] : null;
  if (!first?.Key) throw new Error("invalid location");

  const resolved = {
    key: first.Key,
    name: `${first.LocalizedName}, ${first.AdministrativeArea?.LocalizedName || ""}, ${first.Country?.LocalizedName || ""}`.replace(/,\s*,/g, ",").trim().replace(/,\s*$/, "")
  };
  setCache(locationCache, cacheKey, resolved, LOCATION_TTL_MS);
  return resolved;
}

function normalizeWeather(current, daily, locName) {
  const metric = current?.Temperature?.Metric;
  const feels = current?.RealFeelTemperature?.Metric;
  const wind = current?.Wind?.Speed?.Metric;
  const d0 = Array.isArray(daily?.DailyForecasts) ? daily.DailyForecasts[0] : null;
  const isDay = current?.IsDayTime === true;

  return {
    location: locName,
    temperature_c: Number(metric?.Value),
    feels_like_c: Number(feels?.Value),
    condition: String(current?.WeatherText || "").trim(),
    humidity: Number(current?.RelativeHumidity),
    wind_kph: Number(wind?.Value),
    uv_index: Number(current?.UVIndex),
    forecast: String(d0?.Day?.IconPhrase || d0?.Night?.IconPhrase || "").trim(),
    is_day: isDay,
    timestamp: new Date(current?.EpochTime ? current.EpochTime * 1000 : Date.now()).toISOString(),
    source: "accuweather"
  };
}

function validateWeather(w) {
  return !!w.location && Number.isFinite(w.temperature_c) && !!w.condition && /^\d{4}-\d{2}-\d{2}T/.test(w.timestamp);
}

export async function getAccuWeather(query, apiKey) {
  if (!apiKey) throw new Error("missing accuweather key");
  const locationName = extractLocation(query);
  if (!locationName) throw new Error("missing location");

  const cacheKey = locationName.toLowerCase();
  const cachedWeather = getCache(weatherCache, cacheKey);
  if (cachedWeather) return cachedWeather;

  const loc = await resolveLocationKey(locationName, apiKey);
  console.log("[weather] fetching AccuWeather data");

  const currentUrl = `https://dataservice.accuweather.com/currentconditions/v1/${encodeURIComponent(loc.key)}?apikey=${encodeURIComponent(apiKey)}&details=true`;
  const forecastUrl = `https://dataservice.accuweather.com/forecasts/v1/daily/1day/${encodeURIComponent(loc.key)}?apikey=${encodeURIComponent(apiKey)}&details=true&metric=true`;

  const [currentResp, dailyResp] = await Promise.all([fetch(currentUrl), fetch(forecastUrl)]);
  if (!currentResp.ok || !dailyResp.ok) throw new Error("weather fetch failed");

  const currentData = await currentResp.json();
  const dailyData = await dailyResp.json();
  const normalized = normalizeWeather(Array.isArray(currentData) ? currentData[0] : null, dailyData, loc.name);
  if (!validateWeather(normalized)) throw new Error("weather validation failed");

  console.log("[weather] validation success");
  setCache(weatherCache, cacheKey, normalized, WEATHER_TTL_MS);
  return normalized;
}
