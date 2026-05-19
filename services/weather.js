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
function parseLocationParts(locationName) {
  const tokens = locationName.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return { locality: locationName.trim(), region: "" };
  const region = tokens.slice(1).join(" ");
  return { locality: tokens[0], region };
}
function norm(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function scoreCandidate(locality, region, candidate) {
  const city = norm(candidate?.LocalizedName || "");
  const admin = norm(candidate?.AdministrativeArea?.LocalizedName || "");
  const country = norm(candidate?.Country?.LocalizedName || "");
  const fullRegion = norm(`${admin} ${country}`);
  const localityN = norm(locality);
  const regionN = norm(region);
  const localityMatch = city.includes(localityN) || localityN.includes(city);
  const regionMatch = !regionN || fullRegion.includes(regionN) || regionN.includes(admin);
  let score = 0;
  if (localityMatch) score += 70;
  if (regionMatch) score += 30;
  return score;
}

async function resolveLocationKey(locationName, apiKey) {
  const cacheKey = locationName.toLowerCase();
  const cached = getCache(locationCache, cacheKey);
  if (cached) {
    console.log("[weather] location cache hit");
    return cached;
  }

  console.log("[weather] resolving location");
  const { locality, region } = parseLocationParts(locationName);
  console.log(`[weather] parsed_locality=${locality}`);
  console.log(`[weather] parsed_region=${region || "none"}`);
  const url = `https://dataservice.accuweather.com/locations/v1/cities/search?apikey=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(locationName)}`;
  console.log("[weather] location_search_url_execution=true");
  const resp = await fetch(url);
  console.log(`[weather] location_search_status=${resp.status}`);
  if (!resp.ok) throw new Error(`location_search_http_${resp.status}`);
  const data = await resp.json();
  const candidates = Array.isArray(data) ? data : [];
  if (candidates.length === 0) throw new Error("invalid_location");
  let best = null;
  let bestScore = -1;
  for (const c of candidates.slice(0, 8)) {
    const s = scoreCandidate(locality, region, c);
    console.log(`[weather] candidate_city=${c?.LocalizedName || ""}`);
    console.log(`[weather] candidate_region=${c?.AdministrativeArea?.LocalizedName || ""}`);
    console.log(`[weather] location_match_score=${s}`);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  if (!best?.Key || bestScore < 60) throw new Error("invalid_location");

  const resolved = {
    key: best.Key,
    name: `${best.LocalizedName}, ${best.AdministrativeArea?.LocalizedName || ""}, ${best.Country?.LocalizedName || ""}`.replace(/,\s*,/g, ",").trim().replace(/,\s*$/, "")
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
  console.log(`[weather] api_key_present=${!!(apiKey && apiKey.trim())}`);
  if (!apiKey) throw new Error("missing_accuweather_key");
  const locationName = extractLocation(query);
  if (!locationName) throw new Error("missing_location");

  const cacheKey = locationName.toLowerCase();
  const cachedWeather = getCache(weatherCache, cacheKey);
  if (cachedWeather) return cachedWeather;

  const loc = await resolveLocationKey(locationName, apiKey);
  console.log(`[weather] resolved_location_key=${loc.key}`);
  console.log("[weather] fetching AccuWeather data");

  const currentUrl = `https://dataservice.accuweather.com/currentconditions/v1/${encodeURIComponent(loc.key)}?apikey=${encodeURIComponent(apiKey)}&details=true`;
  const forecastUrl = `https://dataservice.accuweather.com/forecasts/v1/daily/1day/${encodeURIComponent(loc.key)}?apikey=${encodeURIComponent(apiKey)}&details=true&metric=true`;

  console.log("[weather] location_search_url_executed=true");
  const [currentResp, dailyResp] = await Promise.all([fetch(currentUrl), fetch(forecastUrl)]);
  console.log(`[weather] current_conditions_status=${currentResp.status}`);
  console.log(`[weather] forecast_status=${dailyResp.status}`);
  if (!currentResp.ok) throw new Error(`current_conditions_http_${currentResp.status}`);
  if (!dailyResp.ok) throw new Error(`forecast_http_${dailyResp.status}`);

  const currentData = await currentResp.json();
  const dailyData = await dailyResp.json();
  const normalized = normalizeWeather(Array.isArray(currentData) ? currentData[0] : null, dailyData, loc.name);
  console.log("[weather] current_conditions_ok=true");
  console.log("[weather] forecast_ok=true");
  if (!validateWeather(normalized)) {
    let reason = "malformed_data";
    if (!normalized.location) reason = "invalid_location";
    else if (!Number.isFinite(normalized.temperature_c)) reason = "no_temperature";
    else if (!normalized.condition) reason = "no_condition";
    else if (!/^\d{4}-\d{2}-\d{2}T/.test(normalized.timestamp)) reason = "invalid_timestamp";
    console.log(`[weather] validation_failed=${reason}`);
    throw new Error(`validation_failed_${reason}`);
  }

  console.log("[weather] validation success");
  setCache(weatherCache, cacheKey, normalized, WEATHER_TTL_MS);
  return normalized;
}
