/**
 * Image generation service.
 *
 * PRIMARY:  step-image-edit-2 on the iamhc gateway (api.iamhc.cn) — verified
 *           working directly against the provider on 2026-07-12.
 * FALLBACK: Zimage Turbo (https://zimageturbo.ai) — used automatically if
 *           step-image-edit-2 fails.
 *
 * Both api17 and zyloo were checked for a working image-generation model on
 * 2026-07-12: api17 has no image endpoint at all (404), and every image
 * model zyloo advertises in its catalog ("gpt-image-1", "dall-e-3",
 * "qwen-image-*", "doubao-seedream-*", "mj_*", etc.) returned "Unknown
 * model" — none are actually enabled on that key/plan despite being listed.
 * Grok Imagine (via the old Bluesminds API) has been removed entirely.
 * DISABLED: OpenAI GPT-Image-1 — never used under any circumstances.
 *
 * Callers can force a specific provider via options.forceProvider
 * ("step" | "zimage"), which is also how the "step:"/"zimage:" prompt
 * keywords below resolve — see parseImageModelKeyword().
 */
import { IAMHC_BASE_URL, getIamhcApiKey } from "../config/models.js";

const ZIMAGE_GENERATE_URL = "https://zimageturbo.ai/api/generate";
const STEP_IMAGE_MODEL = "step-image-edit-2";

const PROVIDER_TIMEOUT_MS  = 90_000;
const DOWNLOAD_TIMEOUT_MS  = 30_000;

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

// ── step-image-edit-2 (iamhc) — PRIMARY ────────────────────────────────────
async function stepImageEdit2(prompt, options = {}) {
  const apiKey = getIamhcApiKey(options.apiKey);
  if (!apiKey) throw new Error("IAMHC_API_KEY not set in environment");

  const body = {
    model: STEP_IMAGE_MODEL,
    prompt: sanitizePrompt(prompt),
    n: 1,
    size: options.size || "1024x1024",
  };

  const res = await fetchWithTimeout(
    `${IAMHC_BASE_URL}/images/generations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    },
    PROVIDER_TIMEOUT_MS
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`step-image-edit-2 API error ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  }

  const item = data?.data?.[0];
  const imageUrl = item?.url;
  if (imageUrl) return downloadImageBuffer(imageUrl);
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  throw new Error(`step-image-edit-2 returned no image. Response: ${JSON.stringify(data).slice(0, 300)}`);
}

// ── Zimage Turbo — FALLBACK ─────────────────────────────────────────────────
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
 * Parse model preference keyword from a user prompt, so a user can pick
 * which working image model to use directly in their message, e.g.
 * "step: a red car" or "generate a car using zimage".
 * step-image-edit-2 is the default/primary anyway, so this is only needed
 * to force Zimage Turbo (the fallback) explicitly, or to be explicit about
 * wanting step. Any other provider name (gpt, groq, dall-e, etc.) is left
 * in the prompt text rather than silently stripped, since none of those
 * are actually wired to a working model.
 * Returns { cleanPrompt, forceProvider: "step"|"zimage"|null }
 */
export function parseImageModelKeyword(text) {
  const t = String(text || "");

  const stepRe = /^step\s*:\s*|(?:^|\s)(?:use|using|with|via)\s+step\b/i;
  const zimageRe = /^zimage\s*:\s*|(?:^|\s)(?:use|using|with|via)\s+zimage\b/i;

  if (stepRe.test(t)) {
    return { cleanPrompt: t.replace(stepRe, " ").trim(), forceProvider: "step" };
  }
  if (zimageRe.test(t)) {
    return { cleanPrompt: t.replace(zimageRe, " ").trim(), forceProvider: "zimage" };
  }
  return { cleanPrompt: t, forceProvider: null };
}

/**
 * Edit an existing image using a text instruction.
 *
 * Uses iamhc vision to reason about the requested edit and produce a full
 * generation prompt, then generates the edited image with Zimage Turbo.
 *
 * Returns { buffer: Buffer, provider: string }
 */
export async function editImage(imageBuffer, prompt) {
  const apiKey = process.env.IAMHC_API_KEY;
  if (!apiKey) throw new Error("IAMHC_API_KEY not set");
  const baseUrl = (process.env.IAMHC_BASE_URL || "https://api.iamhc.cn").replace(/\/+$/, "");

  console.log("[img] edit=vision+zimage — iamhc reasoning edit prompt...");

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
    throw new Error(`iamhc vision returned no edit prompt (raw: ${JSON.stringify(visionData).slice(0, 200)})`);
  }

  const finalPrompt = sanitizePrompt(editPromptFromVision);
  console.log(`[img] edit prompt ready (${finalPrompt.length} chars), generating with zimage-turbo...`);

  const buffer = await zimageTurbo(finalPrompt);
  console.log("[img] vision+zimage edit succeeded");
  return { buffer, provider: "zimage-vision-edit" };
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
 * PRIMARY:  step-image-edit-2 (iamhc). FALLBACK: Zimage Turbo, tried
 * automatically if step-image-edit-2 fails. GPT-Image-1 is disabled and
 * never called. The user's prompt is sent exactly as provided — never
 * modified or enhanced.
 *
 * options.forceProvider: "step" | "zimage" — skips the fallback chain and
 * uses exactly the requested provider (throws if that one fails).
 *
 * Returns { buffer: Buffer, provider: string }
 */
export async function generateImage(prompt, config = {}, options = {}) {
  void config;
  const force = options.forceProvider || null;

  // GPT-Image-1 is permanently disabled — reject immediately if forced
  if (force === "gpt") {
    throw new Error("GPT-Image-1 is disabled and cannot be used.");
  }

  if (force === "zimage") {
    console.log("[img] provider=zimage-turbo (forced)");
    const buffer = await zimageTurbo(prompt, options);
    console.log("[img] generation_success=true provider=zimage-turbo");
    return { buffer, provider: "zimage-turbo" };
  }

  if (force === "step") {
    console.log("[img] provider=step-image-edit-2 (forced)");
    const buffer = await stepImageEdit2(prompt, options);
    console.log("[img] generation_success=true provider=step-image-edit-2");
    return { buffer, provider: "step-image-edit-2" };
  }

  // Default: step-image-edit-2 primary, Zimage Turbo fallback.
  console.log("[img] provider=step-image-edit-2");
  try {
    const buffer = await stepImageEdit2(prompt, options);
    console.log("[img] generation_success=true provider=step-image-edit-2");
    return { buffer, provider: "step-image-edit-2" };
  } catch (e) {
    console.warn(`[img] step-image-edit-2 failed: ${e.message}, falling back to zimage-turbo`);
  }

  try {
    const buffer = await zimageTurbo(prompt, options);
    console.log("[img] generation_success=true provider=zimage-turbo (fallback)");
    return { buffer, provider: "zimage-turbo" };
  } catch (e) {
    console.warn(`[img] zimage-turbo failed: ${e.message}`);
    throw new Error(`Image generation failed on both step-image-edit-2 and zimage-turbo: ${e.message}`);
  }
}
