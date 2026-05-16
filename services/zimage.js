/**
 * Modular Image Generation Service
 * Primary provider: Zimage Turbo
 * Fallback: Bluesminds DALL-E endpoint
 *
 * Add future providers here — they just need to return a Buffer.
 */

const PROVIDER_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

function sanitizePrompt(prompt) {
  return prompt
    .replace(/[<>{}|\\^`[\]]/g, "")
    .trim()
    .slice(0, 1000);
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

function extractImageUrl(data) {
  // Handles common API response shapes
  return (
    data?.url ||
    data?.image_url ||
    data?.image ||
    data?.data?.[0]?.url ||
    data?.data?.[0]?.b64_json && `data:image/png;base64,${data.data[0].b64_json}` ||
    data?.output?.[0] ||
    data?.images?.[0] ||
    data?.result?.url ||
    null
  );
}

// ── Provider: Zimage Turbo ────────────────────────────────────────────────────

async function zimageTurbo(prompt, options = {}) {
  const apiKey = process.env.ZIMAGE_API_KEY;
  if (!apiKey) throw new Error("ZIMAGE_API_KEY is not set");

  const baseUrl =
    process.env.ZIMAGE_API_URL || "https://api.zimage.ai/v1/generate";

  const body = {
    prompt: sanitizePrompt(prompt),
    model: options.model || "turbo",
    width: options.width || 1024,
    height: options.height || 1024,
    num_images: 1,
    ...(options.extra || {}),
  };

  const res = await fetchWithTimeout(
    baseUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    PROVIDER_TIMEOUT_MS
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Zimage API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const imageUrl = extractImageUrl(data);
  if (!imageUrl) throw new Error("Zimage returned no image URL");

  if (imageUrl.startsWith("data:")) {
    const b64 = imageUrl.split(",")[1];
    return Buffer.from(b64, "base64");
  }

  return downloadImageBuffer(imageUrl);
}

// ── Provider: Bluesminds DALL-E fallback ─────────────────────────────────────

async function bluesmindsImage(prompt, apiKey) {
  if (!apiKey) throw new Error("Bluesminds API key not set");

  const res = await fetchWithTimeout(
    "https://api.bluesminds.com/v1/images/generations",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "flux",
        prompt: sanitizePrompt(prompt),
        n: 1,
        size: "1024x1024",
      }),
    },
    PROVIDER_TIMEOUT_MS
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Bluesminds image ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const imageUrl = extractImageUrl(data);
  if (!imageUrl) throw new Error("Bluesminds returned no image URL");
  return downloadImageBuffer(imageUrl);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate an image for the given prompt.
 * Tries Zimage Turbo first; falls back to Bluesminds.
 * Returns { buffer: Buffer, provider: string }
 */
export async function generateImage(prompt, config = {}, options = {}) {
  const errors = [];

  // 1. Zimage Turbo (primary)
  if (process.env.ZIMAGE_API_KEY) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const buffer = await zimageTurbo(prompt, options);
        console.log(`[img] Zimage Turbo succeeded (attempt ${attempt})`);
        return { buffer, provider: "zimage-turbo" };
      } catch (e) {
        console.warn(`[img] Zimage attempt ${attempt} failed: ${e.message}`);
        errors.push(`zimage(${attempt}): ${e.message}`);
        if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  // 2. Bluesminds DALL-E (fallback)
  const bmKey = (config.bluesmindsApiKey || "").trim();
  if (bmKey) {
    try {
      const buffer = await bluesmindsImage(prompt, bmKey);
      console.log("[img] Bluesminds fallback succeeded");
      return { buffer, provider: "bluesminds" };
    } catch (e) {
      console.warn(`[img] Bluesminds fallback failed: ${e.message}`);
      errors.push(`bluesminds: ${e.message}`);
    }
  }

  // 3. Future providers: add here (OpenAI, Stability, Replicate, HuggingFace)

  throw new Error(
    `All image providers failed:\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}`
  );
}
