import { requestGemini } from "./geminiManager.js";

const RETRY_DELAYS_MS = [1500, 3000, 5000];

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
  return `Analyze this image and return ONLY valid raw JSON. Do not wrap in markdown. Do not explain. Do not use code blocks. Do not add extra text before or after JSON. Use exactly this schema: {"type":"","summary":"","visible_text":"","objects":[],"detected_context":"","confidence":0.0}. visible_text must include OCR text when present.`;
}

function extractTextFromGeminiResponse(resp) {
  if (!resp) return "";
  if (typeof resp?.text === "string" && resp.text.trim()) return resp.text;
  if (typeof resp?.outputText === "string" && resp.outputText.trim()) return resp.outputText;
  const candidate = resp?.candidates?.[0]?.content?.parts;
  if (Array.isArray(candidate)) {
    return candidate.map((p) => p?.text || "").join("\n").trim();
  }
  return "";
}

function isRetriableVisionError(error) {
  const msg = (error?.message || String(error || "")).toLowerCase();
  return msg.includes("429") || msg.includes("quota") || msg.includes("overload") || msg.includes("timeout") || msg.includes("temporary") || msg.includes("unavailable") || /\b5\d\d\b/.test(msg);
}

async function requestVisionWithGemini({ model, mimeType, base64Data, requestId, attemptType }) {
  if (!base64Data || typeof base64Data !== "string") throw new Error("invalid image payload");
  if (!mimeType || !mimeType.startsWith("image/")) throw new Error("unsupported media");

  const contents = [
    {
      role: "user",
      parts: [
        { text: buildVisionExtractionPrompt() },
        { inlineData: { mimeType, data: base64Data } }
      ]
    }
  ];

  const resp = await requestGemini({
    source: "vision",
    requestId,
    model,
    contents,
    config: { temperature: 0.1 },
    attemptType
  });

  if (!resp) throw new Error("quota exceeded");
  const text = extractTextFromGeminiResponse(resp);
  if (!text) throw new Error("malformed response");
  return { text };
}

async function runVisionPipeline(mimeType, base64Data, requestId = "vision") {
  const primaryModel = "gemini-2.5-flash";
  const fallbackModel = "gemini-1.5-flash";
  let lastReason = "unknown";

  console.log("[vision] provider=gemini");
  console.log("[vision] image_analysis_started");

  const attempts = [
    { model: primaryModel, index: 1, max: 2, attemptType: "primary" },
    { model: primaryModel, index: 2, max: 2, attemptType: "primary" },
    { model: fallbackModel, index: 1, max: 1, attemptType: "fallback" }
  ];

  for (let i = 0; i < attempts.length; i++) {
    const current = attempts[i];
    try {
      if (current.attemptType === "primary") {
        console.log(`[vision] model=${current.model} attempt=${current.index}/${current.max}`);
        if (current.index === 2) console.log("[vision] retrying_primary=true");
      } else {
        console.log(`[vision] switching_to_fallback=${current.model}`);
        console.log(`[vision] fallback_attempt=${current.index}/${current.max}`);
      }

      const resp = await requestVisionWithGemini({
        model: current.model,
        mimeType,
        base64Data,
        requestId,
        attemptType: current.attemptType
      });
      const raw = (resp?.text || "");
      const cleaned = stripCodeFences(raw).trim();
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
      console.log(`[vision] total_requests_used=${i + 1}`);
      if (!responseValid) throw new Error("ocr validation failure");
      return result;
    } catch (e) {
      const msg = (e?.message || String(e)).toLowerCase();
      lastReason = msg.slice(0, 120);
      const retriable = isRetriableVisionError(e);
      if (retriable) console.log("[vision] rotating_gemini_key");
      if (!retriable) break;
      if (i < attempts.length - 1) await sleep(RETRY_DELAYS_MS[i] || 1500);
    }
  }

  console.warn(`[vision] final failure after retries reason=${lastReason}`);
  throw new Error("VISION_TEMPORARILY_BUSY");
}

export async function analyzeTelegramImageWithGemini(client, message, geminiApiKey, requestId = "vision") {
  const imageRef = extractImageFromMessage(message);
  if (!imageRef) return null;

  console.log(`[vision] image detected (${imageRef.source})`);
  const imageBuffer = await client.downloadMedia(imageRef.media, {});
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) throw new Error("invalid image");

  const mimeType = imageRef.media?.document?.mimeType || "image/jpeg";
  const base64Data = imageBuffer.toString("base64");
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
