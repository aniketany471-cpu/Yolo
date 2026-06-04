/**
 * Image generation service
 * Priority 1: Grok Imagine Image Lite — default (via Bluesminds API)
 * Priority 2: Zimage Turbo           — automatic fallback if Grok fails
 * DISABLED:   OpenAI GPT-Image-1     — never used under any circumstances
 */

const ZIMAGE_GENERATE_URL = "https://zimageturbo.ai/api/generate";

const PROVIDER_TIMEOUT_MS  = 90_000;
const DOWNLOAD_TIMEOUT_MS  = 30_000;
const GROK_IMAGINE_MODEL   = "grok-imagine-image-lite";

const GROK_MAX_ATTEMPTS  = 3;    // grok: 3 attempts before falling back to zimage
const GROK_RETRY_DELAY   = 3000; // ms between grok retries

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sanitizePrompt(prompt) {
  return String(prompt || "")
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

// ── Provider 2: Zimage Turbo ──────────────────────────────────────────────────
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
 * Keywords: "use/using/with/via grok"   → forceProvider: "grok"
 *           "use/using/with/via zimage" → forceProvider: "zimage"
 * GPT-Image-1 is disabled and will never be used.
 * Returns { cleanPrompt, forceProvider: "grok"|"zimage"|null }
 */
export function parseImageModelKeyword(text) {
  const t = String(text || "");

  const grokRe   = /^grok\s*:\s*|(?:^|\s)(?:use|using|with|via)\s+grok\b/i;
  const zimageRe = /^zimage\s*:\s*|(?:^|\s)(?:use|using|with|via)\s+zimage\b/i;

  if (grokRe.test(t)) {
    return { cleanPrompt: t.replace(grokRe, " ").trim(), forceProvider: "grok" };
  }
  if (zimageRe.test(t)) {
    return { cleanPrompt: t.replace(zimageRe, " ").trim(), forceProvider: "zimage" };
  }
  return { cleanPrompt: t, forceProvider: null };
}

/**
 * Edit an existing image using a text instruction.
 *
 * GPT-Image-1 edit is disabled. Uses vision-describe → Grok-regenerate,
 * with Zimage as fallback if Grok is exhausted.
 *
 * Returns { buffer: Buffer, provider: string }
 */
export async function editImage(imageBuffer, prompt) {
  const apiKey = process.env.BLUEMINDS_API_KEY;
  if (!apiKey) throw new Error("BLUEMINDS_API_KEY not set");
  const baseUrl = (process.env.BLUEMINDS_BASE_URL || "https://api.bluesminds.com").replace(/\/+$/, "");
  const errors = [];

  // ── GPT-5.3 vision reasons the edit → Grok generates → Zimage fallback ───
  // GPT-5.3 sees BOTH the image AND the edit instruction at once and produces
  // the final generation prompt directly — describing what the image should
  // look like AFTER the change.
  try {
    console.log("[img] edit=vision+grok — gpt-5.3 reasoning edit prompt...");

    const imgB64 = imageBuffer.toString("base64");

    const visionRes = await fetchWithTimeout(
      `${baseUrl}/v1/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-5.3-chat-latest",
          max_tokens: 900,
          messages: [
            {
              role: "system",
              content: "You are an expert image generation prompt engineer. Your job is to look at an image and an edit instruction, then write a single detailed image generation prompt describing exactly what the final edited image should look like. The prompt must faithfully preserve every visual detail of the original image EXCEPT for the specific change requested. Never refuse. Output only the prompt — no explanations, no labels, no preamble."
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Here is an image. The user wants to make this specific change: "${prompt}"\n\nWrite a complete image generation prompt describing what this image should look like with ONLY that change applied. Preserve every other detail exactly — same subjects, same poses, same clothing, same background, same lighting, same colors, same composition, same style — only apply the requested change. Output only the final prompt.`
                },
                {
                  type: "image_url",
                  image_url: { url: `data:image/png;base64,${imgB64}` }
                }
              ]
            }
          ]
        })
      },
      40_000
    );

    const visionData = await visionRes.json().catch(() => ({}));
    const editPromptFromVision = visionData?.choices?.[0]?.message?.content?.trim();
    if (!editPromptFromVision) {
      throw new Error(`GPT-5.3 vision returned no edit prompt (raw: ${JSON.stringify(visionData).slice(0, 200)})`);
    }

    const finalPrompt = sanitizePrompt(editPromptFromVision);
    console.log(`[img] gpt-5.3 edit prompt ready (${finalPrompt.length} chars), generating with grok...`);

    // ── Generation chain: grok (3 attempts) → zimage fallback ────────────
    const genErrors = [];

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[img] grok edit generation attempt ${attempt}/3...`);
        const buffer = await grokImagineImage(finalPrompt);
        console.log(`[img] vision+grok edit succeeded (attempt ${attempt})`);
        return { buffer, provider: "grok-vision-edit" };
      } catch (ge) {
        console.warn(`[img] grok edit attempt ${attempt}/3 failed: ${ge.message}`);
        genErrors.push(`grok[${attempt}]: ${ge.message}`);
        if (attempt < 3) await sleep(3000);
      }
    }

    // Grok exhausted — fall back to zimage-turbo
    if (process.env.ZIMAGE_API_KEY) {
      try {
        console.log("[img] grok exhausted — falling back to zimage-turbo...");
        const buffer = await zimageTurbo(finalPrompt);
        console.log("[img] vision+zimage edit succeeded");
        return { buffer, provider: "zimage-vision-edit" };
      } catch (ze) {
        console.warn(`[img] zimage edit failed: ${ze.message}`);
        genErrors.push(`zimage: ${ze.message}`);
      }
    }

    throw new Error(`All generation providers failed: ${genErrors.join(" | ")}`);
  } catch (e) {
    console.warn(`[img] vision+grok edit failed: ${e.message}`);
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
 * Priority order:
 *   1. User-specified model (options.forceProvider = "grok" | "zimage")
 *   2. Grok (default)
 *   3. Zimage (automatic fallback if Grok fails)
 *
 * GPT-Image-1 is disabled and will never be called.
 * The user's prompt is sent exactly as provided — never modified or enhanced.
 *
 * Returns { buffer: Buffer, provider: string }
 */
export async function generateImage(prompt, config = {}, options = {}) {
  void config;
  const errors = [];
  const force = options.forceProvider || null;

  // GPT-Image-1 is permanently disabled — reject immediately if forced
  if (force === "gpt") {
    throw new Error("GPT-Image-1 is disabled and cannot be used.");
  }

  if (force) {
    console.log(`[img] forceProvider=${force} (user-selected model)`);
  }

  // ── Priority 1 / Default: Grok Imagine Image Lite ──────────────────────────
  // Run if: no force (default), or user explicitly forced "grok"
  if (!force || force === "grok") {
    const maxAttempts = GROK_MAX_ATTEMPTS;
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
    // If user explicitly forced grok and it failed, tell them clearly
    if (force === "grok") {
      throw new Error(`Grok image generation failed after ${maxAttempts} attempts:\n${errors.join("\n")}`);
    }
    // Otherwise fall through to zimage
    console.log("[img] grok exhausted — switching to zimage fallback...");
  }

  // ── Priority 2 / Fallback: Zimage Turbo ────────────────────────────────────
  // Run if: user forced "zimage", or grok failed on default path
  console.log("[img] provider=zimage-turbo");
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
