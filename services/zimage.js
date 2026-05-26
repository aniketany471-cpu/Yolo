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
 * Parse model preference keyword from a user prompt.
 * Keywords: "grok:", "using grok", "with grok" → "grok"
 *           "gpt:", "using gpt", "with gpt"   → "gpt"
 * Returns { cleanPrompt, forceProvider: "gpt"|"grok"|null }
 */
export function parseImageModelKeyword(text) {
  const t = String(text || "");

  const grokRe = /^grok\s*:\s*|(?:^|\s)(?:using|with|via)\s+grok\b/i;
  const gptRe  = /^gpt\s*:\s*|(?:^|\s)(?:using|with|via)\s+gpt(?:[- ]?(?:1|image[- ]?1))?\b/i;

  if (grokRe.test(t)) {
    return { cleanPrompt: t.replace(grokRe, " ").trim(), forceProvider: "grok" };
  }
  if (gptRe.test(t)) {
    return { cleanPrompt: t.replace(gptRe, " ").trim(), forceProvider: "gpt" };
  }
  return { cleanPrompt: t, forceProvider: null };
}

/**
 * Edit an existing image using a text instruction.
 *
 * Attempt 1 — gpt-image-1 native edit (/images/edits):
 *   The real inpainting API. Works when BluesMinds has gpt-image-1 available.
 *
 * Attempt 2 — Vision-describe → Grok-regenerate (fallback):
 *   When the edit endpoint is down/broken, we:
 *     a) send the original image to a vision model (gpt-4o-mini) and get a
 *        rich textual description of every visual detail
 *     b) append the user's edit instruction to that description
 *     c) feed the combined prompt to grok-imagine-image-lite to generate a
 *        new image that matches the description with the requested change
 *   Not true inpainting, but produces a visually consistent result.
 *
 * Returns { buffer: Buffer, provider: string }
 */
export async function editImage(imageBuffer, prompt) {
  const apiKey = process.env.BLUEMINDS_API_KEY;
  if (!apiKey) throw new Error("BLUEMINDS_API_KEY not set");
  const baseUrl = (process.env.BLUEMINDS_BASE_URL || "https://api.bluesminds.com").replace(/\/+$/, "");
  const errors = [];

  // ── Attempt 1: gpt-image-1 native edit (/images/edits) ───────────────────
  try {
    const url = `${baseUrl}/v1/images/edits`;

    // API requires a square PNG, max 4 MB
    const sharpMod = await import("sharp");
    const sharp = sharpMod.default || sharpMod;
    const meta = await sharp(imageBuffer).metadata();
    const dim = Math.min(Math.max(meta.width || 1024, meta.height || 1024), 1024);
    const pngBuffer = await sharp(imageBuffer)
      .resize(dim, dim, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();

    const form = new FormData();
    form.append("model", OPENAI_MODEL);
    form.append("prompt", sanitizePrompt(prompt));
    form.append("n", "1");
    form.append("image", new File([pngBuffer], "image.png", { type: "image/png" }));

    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form
    }, PROVIDER_TIMEOUT_MS);

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);

    const b64 = data?.data?.[0]?.b64_json;
    if (b64) return { buffer: Buffer.from(b64, "base64"), provider: "gpt-image-1-edit" };

    const imageUrl = data?.data?.[0]?.url;
    if (imageUrl) return { buffer: await downloadImageBuffer(imageUrl), provider: "gpt-image-1-edit" };

    throw new Error("No content in response");
  } catch (e) {
    console.warn(`[img] gpt-image-1 edit failed, falling back to vision+grok: ${e.message}`);
    errors.push(`gpt-image-1-edit: ${e.message}`);
  }

  // ── Attempt 2: Vision-describe → Grok-regenerate ─────────────────────────
  try {
    console.log("[img] edit_fallback=vision+grok — describing image with gpt-4o-mini vision...");

    // Convert image to base64 for the vision model
    const imgB64 = imageBuffer.toString("base64");

    const visionRes = await fetchWithTimeout(
      `${baseUrl}/v1/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: [
              {
                type: "text",
                text: "Describe this image with maximum detail for an image generation prompt. Cover: all subjects (people, objects, animals), their appearance (clothing, hair, expression, pose), exact colors, lighting, shadows, background elements, art style, composition, mood, and any text visible. Be exhaustive and specific. Output only the description with no introduction or commentary."
              },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${imgB64}` }
              }
            ]
          }]
        })
      },
      35_000
    );

    const visionData = await visionRes.json().catch(() => ({}));
    const description = visionData?.choices?.[0]?.message?.content?.trim();
    if (!description) throw new Error(`Vision model returned no description (model: ${visionData?.model || "unknown"})`);

    console.log(`[img] vision description obtained (${description.length} chars), generating with grok...`);

    // Combine description with the edit instruction
    const editGenPrompt = sanitizePrompt(
      `${description}\n\nNow apply this specific change: ${prompt}. ` +
      `Keep all other visual details exactly the same — same subjects, same colors, same background, same style, same composition. Only change what was explicitly requested.`
    );

    const buffer = await grokImagineImage(editGenPrompt);
    console.log("[img] vision+grok edit succeeded");
    return { buffer, provider: "grok-vision-edit" };
  } catch (e) {
    console.warn(`[img] vision+grok edit fallback failed: ${e.message}`);
    errors.push(`grok-vision-edit: ${e.message}`);
  }

  throw new Error(
    `Image editing failed — all providers exhausted:\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}`
  );
}

/**
 * Build a precise image generation prompt from a vision analysis result.
 * Combines summary, objects, style and context into a single descriptive prompt.
 */
export function buildImagePromptFromVision(visionResult) {
  const parts = [];
  if (visionResult.summary)          parts.push(visionResult.summary);
  if (visionResult.detected_context) parts.push(visionResult.detected_context);
  if (visionResult.objects?.length)  parts.push(`featuring ${visionResult.objects.slice(0, 8).join(", ")}`);
  if (visionResult.type && visionResult.type !== "unknown") parts.push(`${visionResult.type} style`);
  const raw = parts.filter(Boolean).join(". ");
  return sanitizePrompt(raw || "similar image");
}

/**
 * Generate an image for the given prompt.
 *
 * options.forceProvider = "gpt"  → skip straight to gpt-image-1 (3 attempts)
 * options.forceProvider = "grok" → skip straight to grok-imagine (3 attempts)
 * (no forceProvider)             → gpt-image-1 first, grok backup, zimage-turbo last resort
 *
 * Returns { buffer: Buffer, provider: string }
 */
export async function generateImage(prompt, config = {}, options = {}) {
  void config;
  const errors = [];
  const force = options.forceProvider || null;

  if (force) {
    console.log(`[img] forceProvider=${force} (user-selected model)`);
  }

  // ── Priority 1: OpenAI GPT-Image-1 ─────────────────────────────────────────
  // Run if: no force, or user forced "gpt"
  if (!force || force === "gpt") {
    const maxAttempts = force === "gpt" ? 3 : OPENAI_MAX_ATTEMPTS;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[img] provider=gpt-image-1 model=${OPENAI_MODEL} attempt=${attempt}/${maxAttempts}`);
      try {
        const buffer = await openaiImage(prompt, options);
        console.log(`[img] generation_success=true provider=gpt-image-1 attempt=${attempt}`);
        return { buffer, provider: "gpt-image-1" };
      } catch (e) {
        console.warn(`[img] gpt-image-1 attempt ${attempt}/${maxAttempts} failed: ${e.message}`);
        errors.push(`gpt-image-1[${attempt}]: ${e.message}`);
        if (attempt < maxAttempts) {
          console.log(`[img] retrying gpt-image-1 in ${OPENAI_RETRY_DELAY / 1000}s...`);
          await sleep(OPENAI_RETRY_DELAY);
        }
      }
    }
    // If user forced gpt and it failed all attempts, tell them clearly
    if (force === "gpt") {
      throw new Error(`gpt-image-1 failed after ${maxAttempts} attempts:\n${errors.join("\n")}`);
    }
  }

  // ── Priority 2: Grok Imagine Image Lite ────────────────────────────────────
  // Run if: no force, or user forced "grok"
  if (!force || force === "grok") {
    const maxAttempts = force === "grok" ? 3 : GROK_MAX_ATTEMPTS;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[img] provider=grok-imagine model=${GROK_IMAGINE_MODEL} attempt=${attempt}/${maxAttempts}`);
      try {
        const buffer = await grokImagineImage(prompt);
        console.log(`[img] generation_success=true provider=grok-imagine attempt=${attempt}`);
        return { buffer, provider: "grok-imagine" };
      } catch (e) {
        console.warn(`[img] grok-imagine attempt ${attempt}/${maxAttempts} failed: ${e.message}`);
        errors.push(`grok-imagine[${attempt}]: ${e.message}`);
        if (attempt < maxAttempts) {
          console.log(`[img] retrying grok-imagine in ${GROK_RETRY_DELAY / 1000}s...`);
          await sleep(GROK_RETRY_DELAY);
        }
      }
    }
    // If user forced grok and it failed all attempts, tell them clearly
    if (force === "grok") {
      throw new Error(`grok-imagine failed after ${maxAttempts} attempts:\n${errors.join("\n")}`);
    }
  }

  // ── Priority 3: Zimage Turbo — last resort (never reached on forced provider) ─
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
