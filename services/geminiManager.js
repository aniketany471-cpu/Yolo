import { GoogleGenAI } from "@google/genai";

const REQUEST_TIMEOUT_MS = 20000;
const perMessage = new Map();

function getState(requestId = "global") {
  if (!perMessage.has(requestId)) perMessage.set(requestId, { total: 0, primary: 0, fallback: 0 });
  return perMessage.get(requestId);
}

export function beginGeminiRequestScope(requestId) {
  perMessage.set(requestId, { total: 0, primary: 0, fallback: 0 });
}

export async function requestGemini({ source = "unknown", requestId = "global", apiKey, model, contents, config = {}, tools, attemptType = "primary" }) {
  const cleanKey = (apiKey || "").trim();
  if (!cleanKey) return null;
  const state = getState(requestId);
  if (state.total >= 3 || (attemptType === "primary" && state.primary >= 2) || (attemptType === "fallback" && state.fallback >= 1)) {
    console.warn(`[gemini-manager] blocked requestId=${requestId} source=${source} type=${attemptType} total=${state.total}`);
    return null;
  }
  state.total += 1;
  if (attemptType === "primary") state.primary += 1;
  if (attemptType === "fallback") state.fallback += 1;
  console.log(`[gemini-manager] requestId=${requestId} source=${source} type=${attemptType} total=${state.total}`);

  const ai = new GoogleGenAI({ apiKey: cleanKey });
  try {
    const resp = await Promise.race([
      ai.models.generateContent({ model, contents, config, ...(tools ? { tools } : {}) }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), REQUEST_TIMEOUT_MS))
    ]);
    return resp;
  } catch (e) {
    console.warn(`[gemini-manager] requestId=${requestId} source=${source} error=${e?.message || e}`);
    throw e;
  }
}
