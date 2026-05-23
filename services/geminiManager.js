import { GoogleGenAI } from "@google/genai";
import { withGeminiKeyRotation } from "./geminiKeyManager.js";

const REQUEST_TIMEOUT_MS = 20000;
const perMessage = new Map();
let EXTERNAL_REQUEST_COUNT = 0;
const REQUEST_KEY_LOCK = new Map();

function getState(requestId = "global") {
  if (!perMessage.has(requestId)) perMessage.set(requestId, { total: 0, primary: 0, fallback: 0 });
  return perMessage.get(requestId);
}

export function beginGeminiRequestScope(requestId) {
  perMessage.set(requestId, { total: 0, primary: 0, fallback: 0 });
}

export async function requestGemini({ source = "unknown", requestId = "global", apiKey, model, contents, config = {}, tools, attemptType = "primary" }) {
  const overrideKey = (apiKey || "").trim();
  const state = getState(requestId);
  if (state.total >= 2 || (attemptType === "primary" && state.primary >= 1) || (attemptType === "fallback" && state.fallback >= 1)) {
    console.warn(`[gemini-manager] blocked requestId=${requestId} source=${source} type=${attemptType} total=${state.total}`);
    return null;
  }
  state.total += 1;
  if (attemptType === "primary") state.primary += 1;
  if (attemptType === "fallback") state.fallback += 1;
  console.log(`[gemini-manager] requestId=${requestId} source=${source} type=${attemptType} total=${state.total}`);
  EXTERNAL_REQUEST_COUNT += 1;
  console.log("[EXTERNAL_REQUEST_COUNT]", EXTERNAL_REQUEST_COUNT);
  if (EXTERNAL_REQUEST_COUNT > 2) {
    throw new Error("External request hard limit exceeded");
  }

  try {
    return await withGeminiKeyRotation(async (key) => {
      if (!REQUEST_KEY_LOCK.has(requestId)) {
        REQUEST_KEY_LOCK.set(requestId, key);
      }
      const lockedKey = REQUEST_KEY_LOCK.get(requestId);
      const ai = new GoogleGenAI({ apiKey: lockedKey || key });
      if (lockedKey && key !== lockedKey) {
        throw new Error("Request scoped key lock violated");
      }
      const resp = await Promise.race([
        ai.models.generateContent({ model, contents, config, ...(tools ? { tools } : {}) }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), REQUEST_TIMEOUT_MS))
      ]);
      return resp;
    }, { source, overrideKey });
  } catch (e) {
    console.warn(`[gemini-manager] requestId=${requestId} source=${source} error=${e?.message || e}`);
    throw e;
  }
}
