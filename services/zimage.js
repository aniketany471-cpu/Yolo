/**
 * Image generation service
 * Priority 1: OpenAI GPT-Image-1     — 3 attempts (via Bluesminds API) — most reliable
 * Priority 2: Grok Imagine Image Lite — 2 attempts (via Bluesminds API)
 * Priority 3: Zimage Turbo           — last resort only
 */

const ZIMAGE_GENERATE_URL = "https://zimageturbo.ai/api/generate";

const PROVIDER_TIMEOUT_MS  = 90_000;
const DOWNLOAD_TIMEOUT_MS  = 30_000;
const OPENAI_MODEL         = "gpt-image-1";
const GROK_IMAGINE_MODEL   = "grok-imagine-image-lite";

// Retry config — exhaust free providers before touching paid zimage-turbo
const OPENAI_MAX_ATTEMPTS = 3;    // gpt-image-1: attempt 1 + 2 retries (most reliable)
const OPENAI_RETRY_DELAY  = 4000; // ms between openai retries
const GROK_MAX_ATTEMPTS   = 2;    // grok: attempt 1 + 1 retry (backup)
const GROK_RETRY_DELAY    = 3000; // ms between grok retries

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sanitizePrompt(prompt) {
  return String(prompt || "")
    .replace(/[<>{}|\\^`[\]]/g, "")
    .trim()
    .slice(0, 1000);
}

function pickOpenAISize(options = {}) {
  const width  = Number(options.width)  || null;
  const height = Number(options.height) || null;

  if (width && height) {
    if (width > height) return "1536x1024";
    if (height > width) return "1024x1536";
  }

  if (options.aspect_ratio === "16:9" || options.aspect_ratio === "3:2" || options.aspect_ratio === "4:3") {
    return "1536x1024";
  }
  if (options.aspect_ratio === "9:16" || options.aspect_ratio === "2:3" || options.aspect_ratio === "3:4") {
    return "1024x1536";
  }

  return "1024x1024";
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function downloadImageBuffer(url, extraHeaders = {}) {
  const res = await fetchWithTimeout(url, { headers: extraHeaders }, DOWNLOAD_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Image download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Provider 1: Grok Imagine Image Lite via Bluesminds ───────────────────────
async function grokImagineImage(prompt) {
  const apiKey  = process.env.BLUEMINDS_API_KEY;
  if (!apiKey) throw new Error("BLUEMINDS_API_KEY not set");
  const baseUrl = (process.env.BLUEMINDS_BASE_URL || "https://api.bluesminds.com").replace(/\/+$/, "");
  const url     = `${baseUrl}/v1/images/generations`;

  // Try b64_json first (no CDN download = no 403), then url as fallback
  for (const responseFormat of ["b64_json", "url"]) {
    const res = await fetchWithTimeout(
      url,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body:    JSON.stringify({
          model:           GROK_IMAGINE_MODEL,
          prompt:          sanitizePrompt(prompt),
          n:               1,
          size:            "1024x1024",
          response_format: responseFormat,
        }),
      },
      PROVIDER_TIMEOUT_MS
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      throw new Error(`Grok Imagine error: ${msg}`);
    }

    // b64_json path — no CDN needed
    const b64 = data?.data?.[0]?.b64_json;
    if (b64) return Buffer.from(b64, "base64");

    // URL path — download with browser-like headers to avoid 403
    const imageUrl = data?.data?.[0]?.url;
    if (imageUrl) {
      return downloadImageBuffer(imageUrl, {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36",
        "Referer":    "https://x.ai/",
        "Accept":     "image/webp,image/apng,image/*,*/*;q=0.8",
      });
    }

    if (responseFormat === "b64_json") continue;
  }

  throw new Error("Grok Imagine returned no image content");
}

// ── Provider 2: OpenAI GPT-Image-1 via Bluesminds ────────────────────────────
async function openaiImage(prompt, options = {}) {
  const apiKey  = process.env.BLUEMINDS_API_KEY;
  if (!apiKey) throw new Error("BLUEMINDS_API_KEY not set in environment");
  const baseUrl = (process.env.BLUEMINDS_BASE_URL || "").replace(/\/+$/, "");
  if (!baseUrl) throw new Error("BLUEMINDS_BASE_URL not set in environment");
  const imageGenerateUrl = `${baseUrl}/v1/images/generations`;

  const body = {
    model:   OPENAI_MODEL,
    prompt:  sanitizePrompt(prompt),
    size:    pickOpenAISize(options),
    quality: "high",
    n:       1,
  };

  const res = await fetchWithTimeout(
    imageGenerateUrl,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body:    JSON.stringify(body),
    },
    PROVIDER_TIMEOUT_MS
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(`OpenAI image error: ${msg}`);
  }

  const imageB64 = data?.data?.[0]?.b64_json;
  const imageUrl = data?.data?.[0]?.url;
  if (imageB64) return Buffer.from(imageB64, "base64");
  if (imageUrl) return downloadImageBuffer(imageUrl);

  throw new Error("OpenAI returned no image content");
}

// ── Provider 3: Zimage Turbo ──────────────────────────────────────────────────
async function zimageTurbo(prompt, options = {}) {
  const apiKey = process.env.ZIMAGE_API_KEY;
  if (!apiKey) throw new Error("ZIMAGE_API_KEY not set in environment");

  const body = {
    prompt: sanitizePrompt(prompt),
    model:  options.model || "turbo",
    ...(options.width           && { width:           options.width }),
    ...(options.height          && { height:          options.height }),
    ...(options.aspect_ratio    && { aspect_ratio:    options.aspect_ratio }),
    ...(options.negative_prompt && { negative_prompt: options.negative_prompt }),
  };

  const res = await fetchWithTimeout(
    ZIMAGE_GENERATE_URL,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body:    JSON.stringify(body),
    },
    PROVIDER_TIMEOUT_MS
  );

  const data = await res.json();
  if (!res.ok || data.code !== 200) {
    throw new Error(`Zimage API error ${res.status}: ${data.message || JSON.stringify(data).slice(0, 200)}`);
  }

  const imageUrl = data.data?.images?.[0];
  if (!imageUrl) {
    throw new Error(`Zimage returned no image URL. Response: ${JSON.stringify(data).slice(0, 300)}`);
  }

  return downloadImageBuffer(imageUrl);
}

/**
 * Generate an image for the given prompt.
 *
 * Attempt order (zimage-turbo only reached if all free attempts fail):
 *   1. GPT-Image-1      — attempt 1 of 3  (most reliable)
 *   2. GPT-Image-1      — attempt 2 of 3  (after 4 s)
 *   3. GPT-Image-1      — attempt 3 of 3  (after 4 s)
 *   4. Grok Imagine     — attempt 1 of 2  (backup)
 *   5. Grok Imagine     — attempt 2 of 2  (after 3 s)
 *   6. Zimage Turbo     — last resort only
 *
 * Returns { buffer: Buffer, provider: string }
 */
export async function generateImage(prompt, config = {}, options = {}) {
  void config;
  const errors = [];

  // ── Priority 1: OpenAI GPT-Image-1 — up to 3 attempts ──────────────────────
  for (let attempt = 1; attempt <= OPENAI_MAX_ATTEMPTS; attempt++) {
    console.log(`[img] provider=gpt-image-1 model=${OPENAI_MODEL} attempt=${attempt}/${OPENAI_MAX_ATTEMPTS}`);
    try {
      const buffer = await openaiImage(prompt, options);
      console.log(`[img] generation_success=true provider=gpt-image-1 attempt=${attempt}`);
      return { buffer, provider: "gpt-image-1" };
    } catch (e) {
      console.warn(`[img] gpt-image-1 attempt ${attempt}/${OPENAI_MAX_ATTEMPTS} failed: ${e.message}`);
      errors.push(`gpt-image-1[${attempt}]: ${e.message}`);
      if (attempt < OPENAI_MAX_ATTEMPTS) {
        console.log(`[img] retrying gpt-image-1 in ${OPENAI_RETRY_DELAY / 1000}s...`);
        await sleep(OPENAI_RETRY_DELAY);
      }
    }
  }

  // ── Priority 2: Grok Imagine Image Lite — up to 2 attempts ─────────────────
  for (let attempt = 1; attempt <= GROK_MAX_ATTEMPTS; attempt++) {
    console.log(`[img] fallback_provider=grok-imagine model=${GROK_IMAGINE_MODEL} attempt=${attempt}/${GROK_MAX_ATTEMPTS}`);
    try {
      const buffer = await grokImagineImage(prompt);
      console.log(`[img] generation_success=true provider=grok-imagine attempt=${attempt}`);
      return { buffer, provider: "grok-imagine" };
    } catch (e) {
      console.warn(`[img] grok-imagine attempt ${attempt}/${GROK_MAX_ATTEMPTS} failed: ${e.message}`);
      errors.push(`grok-imagine[${attempt}]: ${e.message}`);
      if (attempt < GROK_MAX_ATTEMPTS) {
        console.log(`[img] retrying grok-imagine in ${GROK_RETRY_DELAY / 1000}s...`);
        await sleep(GROK_RETRY_DELAY);
      }
    }
  }

  // ── Priority 3: Zimage Turbo — last resort ──────────────────────────────────
  console.log("[img] switching_provider=zimage_turbo (last resort — all free providers exhausted)");
  try {
    const buffer = await zimageTurbo(prompt, options);
    console.log("[img] generation_success=true provider=zimage-turbo");
    return { buffer, provider: "zimage-turbo" };
  } catch (e) {
    console.warn(`[img] zimage-turbo failed: ${e.message}`);
    errors.push(`zimage: ${e.message}`);
  }

  throw new Error(
    `All image providers failed:\n${errors.map((err, i) => `  ${i + 1}. ${err}`).join("\n")}`
  );
}
