const RETRY_DELAYS_MS = [1500, 3000, 5000];
const TIMEOUT_MS = 20000;
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_VISION_MODEL = "meta-llama/llama-3.2-11b-vision-instruct:free";

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

function buildVisionPayload(model, imageUrl, prompt) {
  return {
    model,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageUrl } }
      ]
    }],
    temperature: 0.1
  };
}

async function requestVision(model, imageUrl, openrouterApiKey) {
  const prompt = `Analyze this image and return ONLY valid raw JSON. Do not wrap in markdown. Do not explain. Do not use code blocks. Do not add extra text before or after JSON. Use exactly this schema: {"type":"","summary":"","visible_text":"","objects":[],"detected_context":"","confidence":0.0}. visible_text must include OCR text when present.`;
  if (typeof imageUrl !== "string" || !imageUrl.startsWith("data:image/")) throw new Error("invalid image url");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
        ...(process.env.HTTP_REFERER ? { "HTTP-Referer": process.env.HTTP_REFERER } : {}),
        ...(process.env.X_TITLE ? { "X-Title": process.env.X_TITLE } : {})
      },
      body: JSON.stringify(buildVisionPayload(model, imageUrl, prompt)),
      signal: controller.signal
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const errMsg = data?.error?.message || `openrouter_http_${response.status}`;
      throw new Error(errMsg);
    }
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string") throw new Error("malformed response");
    return { text };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("vision timeout");
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runVisionPipeline(mimeType, base64Data) {
  const configuredModel = (process.env.VISION_MODEL || DEFAULT_VISION_MODEL).trim() || DEFAULT_VISION_MODEL;
  const models = [configuredModel];
  const openrouterApiKey = (process.env.OPENROUTER_API_KEY || "").trim();
  if (!openrouterApiKey) throw new Error("VISION_TEMPORARILY_BUSY");

  const imageDataUrl = `data:${mimeType};base64,${base64Data}`;
  let lastReason = "unknown";

  console.log("[vision] using_openrouter=true");
  console.log(`[vision] model=${configuredModel}`);
  console.log("[vision] image_analysis_started");

  for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
    const model = models[modelIndex];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const resp = await requestVision(model, imageDataUrl, openrouterApiKey);
        const raw = (resp?.text || "");
        const cleaned = stripCodeFences(raw).trim();
        if (!cleaned) throw new Error("empty response");
        let parsed = safeJsonParse(cleaned);
        if (!parsed) {
          const extracted = extractFirstJsonObject(cleaned);
          if (extracted) parsed = safeJsonParse(extracted);
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("parse failure");

        const { result, valid } = normalizeAndValidate(parsed);
        const responseValid = !!(valid && (result.visible_text || result.summary || result.detected_context));
        console.log(`[vision] OCR_success=${!!result.visible_text}`);
        console.log(`[vision] response_valid=${responseValid}`);
        if (!responseValid) throw new Error("validation failure");
        return result;
      } catch (e) {
        const msg = (e?.message || String(e)).toLowerCase();
        lastReason = msg.slice(0, 120);
        const retriable = msg.includes("503") || msg.includes("429") || msg.includes("quota") || msg.includes("rate limit") || msg.includes("timeout") || msg.includes("empty response") || msg.includes("parse failure") || msg.includes("validation failure") || msg.includes("malformed response") || msg.includes("network");
        console.warn(`[vision] failure model=${model} attempt=${attempt}/3 retriable=${retriable}`);
        if (!retriable) break;
        if (attempt < 3) await sleep(RETRY_DELAYS_MS[attempt - 1] || 1500);
      }
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
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) throw new Error("VISION_TEMPORARILY_BUSY");

  const mimeType = imageRef.media?.document?.mimeType || "image/jpeg";
  const base64Data = imageBuffer.toString("base64");
  return await runVisionPipeline(mimeType, base64Data);
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
