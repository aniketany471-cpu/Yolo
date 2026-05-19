import { GoogleGenAI } from "@google/genai";

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

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

export async function analyzeTelegramImageWithGemini(client, message, geminiApiKey) {
  const imageRef = extractImageFromMessage(message);
  if (!imageRef) return null;
  const cleanKey = (geminiApiKey || "").trim();
  if (!cleanKey) throw new Error("Gemini key missing for vision");

  console.log(`[vision] image detected (${imageRef.source})`);
  const imageBuffer = await client.downloadMedia(imageRef.media, {});
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error("image download failed");
  }

  const mimeType = imageRef.media?.document?.mimeType || "image/jpeg";
  const ai = new GoogleGenAI({ apiKey: cleanKey });
  console.log("[vision] vision request started (gemini-2.5-flash)");

  const prompt = `Analyze this image and return ONLY strict JSON with keys:\n{
"type": "",
"summary": "",
"visible_text": "",
"objects": [],
"detected_context": "",
"confidence": 0.0
}\nNo markdown, no explanation. visible_text must include OCR text when present.`;

  const resp = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: imageBuffer.toString("base64") } }
      ]
    }],
    config: { temperature: 0.2 }
  });

  const raw = (resp?.text || "").trim();
  const parsed = safeJsonParse(raw);
  if (!parsed) throw new Error("vision response was not valid JSON");

  const result = {
    type: String(parsed.type || "unknown"),
    summary: String(parsed.summary || ""),
    visible_text: String(parsed.visible_text || ""),
    objects: Array.isArray(parsed.objects) ? parsed.objects.slice(0, 20) : [],
    detected_context: String(parsed.detected_context || ""),
    confidence: Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : 0
  };

  if (result.visible_text) console.log("[vision] OCR detected");
  console.log("[vision] Gemini Vision success");
  return result;
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
