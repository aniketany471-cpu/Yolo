/**
 * Zimage Turbo image generation service
 * Endpoint: POST https://zimageturbo.ai/api/generate
 * Auth:     Authorization: Bearer <ZIMAGE_API_KEY>
 * Response: { code: 200, data: { task_id: "...", images: ["<url>"] } }
 */

const GENERATE_URL = "https://zimageturbo.ai/api/generate";
const PROVIDER_TIMEOUT_MS = 90_000;  // Zimage can take a while
const DOWNLOAD_TIMEOUT_MS = 30_000;

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

// ── Provider: Zimage Turbo ────────────────────────────────────────────────────

async function zimageTurbo(prompt, options = {}) {
  const apiKey = process.env.ZIMAGE_API_KEY;
  if (!apiKey) throw new Error("ZIMAGE_API_KEY not set in environment");

  const body = {
    prompt: sanitizePrompt(prompt),
    model: options.model || "turbo",
    ...(options.width && { width: options.width }),
    ...(options.height && { height: options.height }),
    ...(options.aspect_ratio && { aspect_ratio: options.aspect_ratio }),
    ...(options.negative_prompt && { negative_prompt: options.negative_prompt }),
  };

  const res = await fetchWithTimeout(
    GENERATE_URL,
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

  const data = await res.json();

  if (!res.ok || data.code !== 200) {
    throw new Error(
      `Zimage API error ${res.status}: ${data.message || JSON.stringify(data).slice(0, 200)}`
    );
  }

  // Response: { code: 200, data: { task_id: "...", images: ["<url>"] } }
  const imageUrl = data.data?.images?.[0];
  if (!imageUrl) {
    throw new Error(`Zimage returned no image URL. Response: ${JSON.stringify(data).slice(0, 300)}`);
  }

  return downloadImageBuffer(imageUrl);
}

// ── Provider: Bluesminds fallback ─────────────────────────────────────────────

async function bluesmindsImage(prompt, apiKey) {
  if (!apiKey) throw new Error("Bluesminds API key not provided");

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
  const imageUrl = data?.data?.[0]?.url;
  if (!imageUrl) throw new Error("Bluesminds returned no image URL");
  return downloadImageBuffer(imageUrl);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate an image for the given prompt.
 * Primary: Zimage Turbo (requires ZIMAGE_API_KEY env var)
 * Fallback: Bluesminds DALL-E
 * Returns { buffer: Buffer, provider: string }
 */
export async function generateImage(prompt, config = {}, options = {}) {
  const errors = [];

  // 1. Zimage Turbo (primary)
  if (process.env.ZIMAGE_API_KEY) {
    try {
      const buffer = await zimageTurbo(prompt, options);
      console.log(`[img] Zimage Turbo succeeded`);
      return { buffer, provider: "zimage-turbo" };
    } catch (e) {
      console.warn(`[img] Zimage Turbo failed: ${e.message}`);
      errors.push(`zimage: ${e.message}`);
    }
  } else {
    errors.push("zimage: ZIMAGE_API_KEY not set");
  }

  // 2. Bluesminds (fallback)
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
  } else {
    errors.push("bluesminds: no API key in config");
  }

  throw new Error(
    `All image providers failed:\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}`
  );
}
