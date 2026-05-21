import sharp from "sharp";
import { requestGemini } from "./geminiManager.js";

const RETRY_DELAYS_MS = [1500, 3000, 5000];
const PRIMARY_MODEL = "gpt-5.5-2026-04-23";
const GEMINI_PRIMARY_MODEL = "gemini-2.5-flash";
const GEMINI_FALLBACK_MODEL = "gemini-1.5-flash-latest";
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

function extractTextFromGeminiResponse(resp) {
  if (!resp) return "";
  if (typeof resp?.text === "string" && resp.text.trim()) return resp.text;
  if (typeof resp?.outputText === "string" && resp.outputText.trim()) return resp.outputText;
  const candidate = resp?.candidates?.[0]?.content?.parts;
  if (Array.isArray(candidate)) return candidate.map((p) => p?.text || "").join("\n").trim();
  return "";
}


function extractTextFromOpenAICompatibleResponse(resp) {
  const contentToText = (content) => {
    if (!content) return "";
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (!item) return "";
          if (typeof item === "string") return item;
          if (typeof item?.text === "string") return item.text;
          if (typeof item?.content === "string") return item.content;
          if (typeof item?.value === "string") return item.value;
          return "";
        })
        .filter(Boolean)
        .join("\n")
        .trim();
    }
    if (typeof content === "object") {
      if (typeof content?.text === "string") return content.text.trim();
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
  let pipeline = sharp(imageBuffer, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();
  const tooWide = (meta.width || 0) > MAX_IMAGE_DIMENSION;
  const tooTall = (meta.height || 0) > MAX_IMAGE_DIMENSION;
  if (tooWide || tooTall) pipeline = pipeline.resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: "inside", withoutEnlargement: true });

  let out = await pipeline.jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  if (out.length > MAX_IMAGE_BYTES) {
    out = await sharp(out).jpeg({ quality: 60, mozjpeg: true }).toBuffer();
  }
  return { mimeType: "image/jpeg", base64Data: out.toString("base64") };
}

async function requestVisionWithGemini({ model, mimeType, base64Data, requestId, attemptType }) {
  const resp = await requestGemini({
    source: "vision",
    requestId,
    model,
    contents: [{ role: "user", parts: [{ text: buildVisionExtractionPrompt() }, { inlineData: { mimeType, data: base64Data } }] }],
    config: { temperature: 0.1 },
    attemptType
  });

  if (!resp) throw new Error("quota exceeded");
  return parseVisionText(extractTextFromGeminiResponse(resp));
}

async function requestVisionWithBluesMinds({ mimeType, base64Data }) {
  const apiKey = process.env.BLUESMINDS_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("missing bluesminds/openai key");

  const res = await fetch("https://api.bluesminds.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: PRIMARY_MODEL,
      max_tokens: 420,
      temperature: 0,
      messages: [{ role: "user", content: [{ type: "text", text: buildVisionExtractionPrompt() }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }] }]
    })
  });

  if (!res.ok) throw new Error(`blueminds ${res.status}`);
  const json = await res.json();
  const rawType = Array.isArray(json?.choices) ? "choices" : typeof json;
  console.log(`[vision] raw_response_type=${rawType}`);

  const normalized = extractTextFromOpenAICompatibleResponse(json);
  const malformed = !normalized;
  console.log("[vision] normalized_response=true");
  console.log(`[vision] extracted_text_length=${normalized.length}`);
  console.log(`[vision] malformed_response=${malformed}`);
  if (malformed) throw new Error("malformed response");

  return parseVisionText(normalized);
}

async function runVisionPipeline(mimeType, base64Data, requestId = "vision") {
  console.log("[vision] provider=blueminds");
  console.log(`[vision] model=${PRIMARY_MODEL}`);
  console.log("[vision] primary_vision_started=true");
  console.log("[vision] image_analysis_started=true");

  try {
    const result = await requestVisionWithBluesMinds({ mimeType, base64Data, requestId });
    console.log("[vision] total_requests_used=1");
    return result;
  } catch (e) {
    console.warn(`[vision] primary_failed=${(e?.message || "unknown").slice(0, 100)}`);
  }

  const attempts = [
    { model: GEMINI_PRIMARY_MODEL, index: 1, max: 2, attemptType: "primary", log: "gemini-2.5-flash" },
    { model: GEMINI_PRIMARY_MODEL, index: 2, max: 2, attemptType: "primary", log: "gemini-2.5-flash" },
    { model: GEMINI_FALLBACK_MODEL, index: 1, max: 1, attemptType: "fallback", log: "gemini-1.5-flash-latest" }
  ];

  for (let i = 0; i < attempts.length; i++) {
    const current = attempts[i];
    try {
      console.log(`[vision] switching_to_fallback=${current.log}`);
      const result = await requestVisionWithGemini({ ...current, mimeType, base64Data, requestId });
      console.log(`[vision] total_requests_used=${i + 2}`);
      return result;
    } catch (e) {
      const retriable = isRetriableVisionError(e);
      if (retriable) console.log("[vision] rotating_gemini_key");
      if (!retriable) break;
      if (i < attempts.length - 1) await sleep(RETRY_DELAYS_MS[i] || 1500);
    }
  }

  console.log("[vision] switching_to_fallback=gpt-4o-mini");
  throw new Error("VISION_TEMPORARILY_BUSY");
}

export async function analyzeTelegramImageWithGemini(client, message, _geminiApiKey, requestId = "vision") {
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
