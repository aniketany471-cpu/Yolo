import { GoogleGenAI } from "@google/genai";

const RETRY_DELAYS_MS = [1500, 3000, 5000];
const TIMEOUT_MS = 20000;

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

async function requestVision(ai, model, mimeType, base64Data) {
  const prompt = `Analyze this image and return ONLY valid minified JSON. Do not use markdown. Do not use code blocks. Do not add explanations. Do not add intro text. Do not add comments. Do not add trailing text. Use exactly this schema: {"type":"","summary":"","visible_text":"","objects":[],"detected_context":"","confidence":0.0}. visible_text must include OCR text when present.`;

  const timed = ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: base64Data } }] }],
    config: { temperature: 0.1 }
  });

  return await Promise.race([
    timed,
    new Promise((_, reject) => setTimeout(() => reject(new Error("vision timeout")), TIMEOUT_MS))
  ]);
}
async function runVisionPipeline(ai, mimeType, base64Data) {
  const models = ["gemini-2.5-flash", "gemini-1.5-flash"];
  let lastReason = "unknown";
  console.log("[vision] entering retry wrapper");
  for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
    const model = models[modelIndex];
    if (modelIndex > 0) console.log("[vision] switching fallback model gemini-1.5-flash");
    console.log(`[vision] active model=${model}`);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[vision] retry ${attempt}/3 model=${model}`);
        console.log(`[vision] executing attempt ${attempt}/3`);
        const resp = await requestVision(ai, model, mimeType, base64Data);
        const raw = (resp?.text || "").trim();
        console.log(`[vision] response length=${raw.length} model=${model}`);
        if (!raw) throw new Error("empty response");
        let parsed = safeJsonParse(raw);
        if (!parsed) {
          const extracted = extractFirstJsonObject(raw);
          if (extracted) {
            console.log("[vision] JSON extraction success");
            parsed = safeJsonParse(extracted);
          }
        }
        if (!parsed) throw new Error("parse failure");
        console.log("[vision] parse success");
        const { result, valid } = normalizeAndValidate(parsed);
        if (!valid) throw new Error("validation failure");
        console.log("[vision] validation success");
        if (result.visible_text) console.log("[vision] OCR detected");
        console.log(`[vision] Gemini Vision success model=${model}`);
        return result;
      } catch (e) {
        const msg = (e?.message || String(e)).toLowerCase();
        lastReason = msg.slice(0, 120);
        const retriable = msg.includes("503") || msg.includes("429") || msg.includes("overload") || msg.includes("unavailable") || msg.includes("timeout") || msg.includes("empty response") || msg.includes("parse failure") || msg.includes("validation failure");
        console.warn(`[vision] failure model=${model} attempt=${attempt}/3 retriable=${retriable}`);
        if (!retriable) break;
        if (attempt < 3) await sleep(RETRY_DELAYS_MS[attempt - 1] || 1500);
      }
    }
  }
  console.warn(`[vision] final failure after retries reason=${lastReason}`);
  throw new Error("VISION_TEMPORARILY_BUSY");
}

export async function analyzeTelegramImageWithGemini(client, message, geminiApiKey) {
  const imageRef = extractImageFromMessage(message);
  if (!imageRef) return null;
  const cleanKey = (geminiApiKey || "").trim();
  if (!cleanKey) throw new Error("VISION_TEMPORARILY_BUSY");

  console.log(`[vision] image detected (${imageRef.source})`);
  const imageBuffer = await client.downloadMedia(imageRef.media, {});
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) throw new Error("VISION_TEMPORARILY_BUSY");

  const mimeType = imageRef.media?.document?.mimeType || "image/jpeg";
  const base64Data = imageBuffer.toString("base64");
  const ai = new GoogleGenAI({ apiKey: cleanKey });
  return await runVisionPipeline(ai, mimeType, base64Data);
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
