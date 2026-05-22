/**
 * Image generation service
 * Priority 1: Grok Imagine Image Lite (via Bluesminds API)
 * Priority 2: OpenAI GPT-Image-1 (via Bluesminds API)
 * Priority 3: Zimage Turbo
 */

const ZIMAGE_GENERATE_URL = "https://zimageturbo.ai/api/generate";

const PROVIDER_TIMEOUT_MS = 90_000;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const OPENAI_MODEL        = "gpt-image-1";
const GROK_IMAGINE_MODEL  = "grok-imagine-image-lite";

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

async function downloadImageBuffer(url) {
  const res = await fetchWithTimeout(url, {}, DOWNLOAD_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Image download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Provider 1: Grok Imagine Image Lite via Bluesminds ───────────────────────
async function grokImagineImage(prompt) {
  const apiKey  = process.env.BLUEMINDS_API_KEY;
  if (!apiKey) throw new Error("BLUEMINDS_API_KEY not set");
  const baseUrl = (process.env.BLUEMINDS_BASE_URL || "https://api.bluesminds.com").replace(/\/+$/, "");
  const url     = `${baseUrl}/v1/images/generations`;

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model:  GROK_IMAGINE_MODEL,
        prompt: sanitizePrompt(prompt),
        n:      1,
        size:   "1024x1024",
      }),
    },
    PROVIDER_TIMEOUT_MS
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Grok Imagine error: ${msg}`);
  }

  const imageUrl = data?.data?.[0]?.url;
  if (!imageUrl) throw new Error("Grok Imagine returned no image URL");
  return downloadImageBuffer(imageUrl);
}

// ── Provider 2: OpenAI GPT-Image-1 via Bluesminds ────────────────────────────
async function openaiImage(prompt, options = {}) {
  const apiKey  = process.env.BLUEMINDS_API_KEY;
  if (!apiKey) throw new Error("BLUEMINDS_API_KEY not set in environment");
  const baseUrl = (process.env.BLUEMINDS_BASE_URL || "").replace(/\/+$/, "");
  if (!baseUrl) throw new Error("BLUEMINDS_BASE_URL not set in environment");
  const imageGenerateUrl = `${baseUrl}/images/generations`;

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
 * Priority 1: Grok Imagine Image Lite  (BLUEMINDS_API_KEY + api.bluesminds.com)
 * Priority 2: OpenAI GPT-Image-1       (BLUEMINDS_API_KEY + BLUEMINDS_BASE_URL)
 * Priority 3: Zimage Turbo             (ZIMAGE_API_KEY)
 * Returns { buffer: Buffer, provider: string }
 */
export async function generateImage(prompt, config = {}, options = {}) {
  void config;
  const errors = [];

  // ── Priority 1: Grok Imagine Image Lite ────────────────────────────────────
  console.log(`[img] provider=grok-imagine model=${GROK_IMAGINE_MODEL}`);
  console.log("[img] primary_generation_started=true");
  try {
    const buffer = await grokImagineImage(prompt);
    console.log("[img] generation_success=true provider=grok-imagine");
    return { buffer, provider: "grok-imagine" };
  } catch (e) {
    console.warn(`[img] Grok Imagine failed: ${e.message}`);
    errors.push(`grok-imagine: ${e.message}`);
  }

  // ── Priority 2: OpenAI GPT-Image-1 ─────────────────────────────────────────
  console.log(`[img] switching_provider=openai model=${OPENAI_MODEL}`);
  try {
    const buffer = await openaiImage(prompt, options);
    console.log("[img] generation_success=true provider=openai");
    return { buffer, provider: "openai" };
  } catch (e) {
    console.warn(`[img] OpenAI fallback failed: ${e.message}`);
    errors.push(`openai: ${e.message}`);
  }

  // ── Priority 3: Zimage Turbo ────────────────────────────────────────────────
  console.log("[img] switching_provider=zimage_turbo");
  try {
    const buffer = await zimageTurbo(prompt, options);
    console.log("[img] generation_success=true provider=zimage-turbo");
    return { buffer, provider: "zimage-turbo" };
  } catch (e) {
    console.warn(`[img] Zimage fallback failed: ${e.message}`);
    errors.push(`zimage: ${e.message}`);
  }

  throw new Error(
    `All image providers failed:\n${errors.map((err, i) => `  ${i + 1}. ${err}`).join("\n")}`
  );
}
