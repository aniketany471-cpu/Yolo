import { MODELS, TASK, getIamhcApiKey } from "../config/models.js";
import { chatCompletion } from "../providers/iamhcProvider.js";

// sharp lazy-loaded to defer ~80MB libvips until first image request
let _sharp = null;
async function getSharp() {
  if (!_sharp) { const m = await import("sharp"); _sharp = m.default; _sharp.concurrency(1); }
  return _sharp;
}
const RETRY_DELAYS_MS = [1500, 3000, 5000];

// Vision model fallback chain — same idea as the text router's provider
// fallback: try the configured model first, then fall back to alternates
// instead of dying when one model/provider is down. Configure via env
// without touching code: MODEL_VISION (primary, see config/models.js) and
// MODEL_VISION_FALLBACK (comma-separated list of extra models to try).
const VISION_FALLBACK_MODELS = (process.env.MODEL_VISION_FALLBACK || "gpt-5.5-2026-04-23")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const VISION_MODELS = [MODELS[TASK.VISION], ...VISION_FALLBACK_MODELS].filter(
  (m, i, arr) => m && arr.indexOf(m) === i
);

const MAX_IMAGE_BYTES = 2_400_000;
const MAX_IMAGE_DIMENSION = 1600;
const MIN_MEANINGFUL_BYTES = 5_000;

function extractImageFromMessage(message) {
  if (!message) return null;
  const media = message.media || null;
  if (media?.photo) return { media, source: "photo" };
  if (media?.document) {
    const mimeType = media.document?.mimeType || "";
    if (mimeType.startsWith("image/")) return { media, source: "image_document" };
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}
function stripCodeFences(text) {
  return (text || "")
    .replace(/^\s*```json\s*/i, "")
    .replace(/^\s*```\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function normalizeAndValidate(parsed) {
  const result = {
    type: String(parsed?.type || "unknown"),
    summary: String(parsed?.summary || "").trim(),
    visible_text: String(parsed?.visible_text || "").trim(),
    objects: Array.isArray(parsed?.objects) ? parsed.objects.slice(0, 20) : [],
    detected_context: String(parsed?.detected_context || "").trim(),
    confidence: Number.isFinite(Number(parsed?.confidence)) ? Number(parsed.confidence) : 0
  };
  const valid = !!result.summary && !!result.detected_context;
  return { result, valid };
}

function buildVisionExtractionPrompt() {
  return `Analyze image. Return ONLY compact JSON schema: {"type":"","summary":"","visible_text":"","objects":[],"detected_context":"","confidence":0.0}. Include OCR text in visible_text.`;
}

function extractTextFromOpenAICompatibleResponse(resp) {
  const contentToText = (content) => {
    if (!content) return "";
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      const chunks = [];
      for (const item of content) {
        const blockType = typeof item === "object" ? item?.type || "object" : typeof item;
        console.log(`[vision] content_block_type=${blockType}`);

        let chunk = "";
        if (typeof item === "string") chunk = item;
        else if (item && typeof item === "object") {
          if (typeof item?.text === "string") chunk = item.text;
          else if (typeof item?.content === "string") chunk = item.content;
          else if (typeof item?.output_text === "string") chunk = item.output_text;
          else if (typeof item?.value === "string") chunk = item.value;
        }

        const normalizedChunk = String(chunk || "").trim();
        console.log(`[vision] extracted_chunk=${normalizedChunk.slice(0, 200)}`);
        if (normalizedChunk) chunks.push(normalizedChunk);
      }
      return chunks.join("\n").trim();
    }
    if (typeof content === "object") {
      if (typeof content?.text === "string") return content.text.trim();
      if (typeof content?.content === "string") return content.content.trim();
      if (typeof content?.output_text === "string") return content.output_text.trim();
      if (typeof content?.value === "string") return content.value.trim();
    }
    return "";
  };

  if (!resp || typeof resp !== "object") return "";
  const choice0 = resp?.choices?.[0] || null;

  const candidates = [
    choice0?.message?.content,
    choice0?.content,
    resp?.output_text,
    resp?.outputText
  ];

  for (const candidate of candidates) {
    const text = contentToText(candidate);
    if (text) return text;
  }

  return "";
}
function parseVisionText(rawText) {
  const cleaned = stripCodeFences(rawText || "").trim();
  if (!cleaned) throw new Error("malformed response");
  let parsed = safeJsonParse(cleaned);
  if (!parsed) {
    const extracted = extractFirstJsonObject(cleaned);
    if (extracted) parsed = safeJsonParse(extracted);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("malformed response");
  const { result, valid } = normalizeAndValidate(parsed);
  const responseValid = !!(valid && (result.visible_text || result.summary || result.detected_context));
  console.log(`[vision] OCR_success=${!!result.visible_text}`);
  console.log(`[vision] response_valid=${responseValid}`);
  if (!responseValid) throw new Error("ocr validation failure");
  return result;
}

function isRetriableVisionError(error) {
  const msg = (error?.message || String(error || "")).toLowerCase();
  return msg.includes("429") || msg.includes("quota") || msg.includes("overload") || msg.includes("timeout") || msg.includes("temporary") || msg.includes("unavailable") || /\b5\d\d\b/.test(msg);
}

function shouldSkipPremiumVision({ mimeType, base64Data }) {
  if (!mimeType?.startsWith("image/")) return true;
  const bytes = Buffer.byteLength(base64Data || "", "base64");
  if (bytes < MIN_MEANINGFUL_BYTES) return true;
  if (mimeType.includes("webp") || mimeType.includes("gif")) return true;
  return false;
}

async function optimizeImagePayload(imageBuffer, mimeType) {
  let pipeline = (await getSharp())(imageBuffer, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();
  const tooWide = (meta.width || 0) > MAX_IMAGE_DIMENSION;
  const tooTall = (meta.height || 0) > MAX_IMAGE_DIMENSION;
  if (tooWide || tooTall) pipeline = pipeline.resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: "inside", withoutEnlargement: true });

  let out = await pipeline.jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  if (out.length > MAX_IMAGE_BYTES) {
    out = await (await getSharp())(out).jpeg({ quality: 60, mozjpeg: true }).toBuffer();
  }
  return { mimeType: "image/jpeg", base64Data: out.toString("base64") };
}

async function requestVisionWithIamhc({ model, mimeType, base64Data }) {
  const apiKey = getIamhcApiKey(process.env.OPENAI_API_KEY);
  if (!apiKey) throw new Error("missing iamhc/openai key");

  const result = await chatCompletion({
    model,
    apiKey,
    maxRetries: 0, // retry/fallback across models is handled by runVisionPipeline
    messages: [{ role: "user", content: [{ type: "text", text: buildVisionExtractionPrompt() }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }] }],
    extra: { max_tokens: 420, temperature: 0 }
  });

  if (!result.ok) throw new Error(`iamhc ${result.status || 0}: ${(result.error || "request failed").slice(0, 200)}`);

  const normalized = (result.content || "").trim();
  const malformed = !normalized;
  console.log("[vision] normalized_response=true");
  console.log(`[vision] extracted_text_length=${normalized.length}`);
  console.log(`[vision] malformed_response=${malformed}`);
  if (malformed) throw new Error("malformed response");

  return parseVisionText(normalized);
}

async function runVisionPipeline(mimeType, base64Data, requestId = "vision") {
  console.log("[vision] provider=iamhc");
  console.log(`[vision] model_chain=${VISION_MODELS.join(",")}`);
  console.log("[vision] primary_vision_started=true");
  console.log("[vision] image_analysis_started=true");

  const attempts = RETRY_DELAYS_MS.length + 1;
  let lastError = null;
  let totalRequestsUsed = 0;

  for (let m = 0; m < VISION_MODELS.length; m++) {
    const model = VISION_MODELS[m];
    console.log(`[vision] trying_model=${model}`);
    for (let i = 0; i < attempts; i++) {
      totalRequestsUsed++;
      try {
        const result = await requestVisionWithIamhc({ model, mimeType, base64Data, requestId });
        console.log(`[vision] total_requests_used=${totalRequestsUsed} succeeded_model=${model}`);
        return result;
      } catch (e) {
        lastError = e;
        console.warn(`[vision] model=${model} attempt_${i + 1}_failed=${(e?.message || "unknown").slice(0, 100)}`);
        const retriable = isRetriableVisionError(e);
        if (!retriable || i >= attempts - 1) break;
        await sleep(RETRY_DELAYS_MS[i] || 1500);
      }
    }
    if (m < VISION_MODELS.length - 1) {
      console.warn(`[vision] model_exhausted=${model} falling_back_to=${VISION_MODELS[m + 1]}`);
    }
  }

  throw new Error(`VISION_TEMPORARILY_BUSY: ${lastError?.message || "unknown"}`);
}

export async function analyzeTelegramImageWithGemini(client, message, _unusedApiKey, requestId = "vision") {
  const imageRef = extractImageFromMessage(message);
  if (!imageRef) return null;

  console.log(`[vision] image detected (${imageRef.source})`);
  const imageBuffer = await client.downloadMedia(imageRef.media, {});
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) throw new Error("invalid image");

  let mimeType = imageRef.media?.document?.mimeType || "image/jpeg";
  let base64Data = imageBuffer.toString("base64");

  if (!shouldSkipPremiumVision({ mimeType, base64Data })) {
    const optimized = await optimizeImagePayload(imageBuffer, mimeType);
    mimeType = optimized.mimeType;
    base64Data = optimized.base64Data;
  }

  return await runVisionPipeline(mimeType, base64Data, requestId);
}

export function buildVisionPrompt(userText, visionResult) {
  return [
    "User uploaded an image.",
    `Image type: ${visionResult.type}`,
    `Image summary: ${visionResult.summary}`,
    `Visible text: ${visionResult.visible_text || "(none)"}`,
    `Objects: ${(visionResult.objects || []).join(", ") || "(none)"}`,
    `Detected context: ${visionResult.detected_context || "(none)"}`,
    `Confidence: ${visionResult.confidence}`,
    "Generate a natural helpful reply.",
    userText ? `User caption/message: ${userText}` : ""
  ].filter(Boolean).join("\n");
}
