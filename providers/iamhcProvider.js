// ──────────────────────────────────────────────────────────────────────────
// Generic OpenAI-compatible provider client for api.iamhc.cn.
// This is model-agnostic — every model in config/models.js is called through
// the same chatCompletion() function. Never hardcode a model name here.
// ──────────────────────────────────────────────────────────────────────────
import { IAMHC_BASE_URL, getIamhcApiKey } from "../config/models.js";
import { logProviderCall, logProviderError } from "../utils/logger.js";

const REQUEST_TIMEOUT_MS = Number(process.env.IAMHC_TIMEOUT_MS || 30000);

function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

export function isModelBrokenError(status, errText) {
  if (status === 403 || status === 404 || status === 410 || status === 412) return true;
  const t = (errText || "").toLowerCase();
  return (
    t.includes("tier restriction") ||
    t.includes("suspended") ||
    t.includes("not found") ||
    t.includes("notfounderror") ||
    t.includes("reached its end of life") ||
    t.includes("model_not_found") ||
    t.includes("no available channel") ||
    t.includes("agent not found") ||
    t.includes("model not found")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeContextMessages(prompt, context = [], systemInstruction) {
  const messages = [];
  if (systemInstruction?.trim()) {
    messages.push({ role: "system", content: systemInstruction.trim() });
  }
  for (const c of context || []) {
    const role = c?.role === "model" ? "assistant" : c?.role;
    const text = typeof c?.content === "string" ? c.content : c?.parts?.[0]?.text;
    if (!role || typeof text !== "string" || !text.trim()) continue;
    messages.push({ role, content: text });
  }
  if (prompt !== undefined && prompt !== null) {
    messages.push({ role: "user", content: prompt });
  }
  return messages;
}

export function extractContent(data) {
  if (!data || typeof data !== "object") return null;
  const standard = data?.choices?.[0]?.message?.content;
  if (typeof standard === "string" && standard.trim()) return standard.trim();
  const alt = data?.output?.text || data?.data?.text || data?.text || data?.content || data?.choices?.[0]?.text;
  if (typeof alt === "string" && alt.trim()) return alt.trim();
  return null;
}

/**
 * Single non-streaming chat completion call for ANY model on the iamhc
 * gateway. Retries transient failures once. Never throws — always returns
 * { ok, content, status, error, broken }.
 */
export async function chatCompletion({ model, prompt, context = [], systemInstruction, apiKey, messages, extra = {}, maxRetries = 1 }) {
  const cleanKey = getIamhcApiKey(apiKey);
  if (!cleanKey) {
    return { ok: false, error: "No valid iamhc API key configured.", status: 0 };
  }

  const body = {
    model,
    messages: messages || normalizeContextMessages(prompt, context, systemInstruction),
    temperature: 0.7,
    ...extra,
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const started = Date.now();
    try {
      const response = await fetch(`${IAMHC_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cleanKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const latency = Date.now() - started;

      if (!response.ok) {
        const rawBody = await response.text().catch(() => "");
        logProviderCall({ model, status: response.status, latencyMs: latency });
        const broken = isModelBrokenError(response.status, rawBody);
        if (!broken && attempt < maxRetries && isRetryableStatus(response.status)) {
          await sleep(300 * Math.pow(2, attempt));
          continue;
        }
        return { ok: false, status: response.status, error: rawBody.slice(0, 300), broken };
      }

      const data = await response.json();
      logProviderCall({ model, status: response.status, latencyMs: latency });
      const content = extractContent(data);
      if (!content) {
        return { ok: false, status: response.status, error: "Empty content in response", broken: false, raw: data };
      }
      return { ok: true, status: response.status, content, raw: data };
    } catch (e) {
      const isTimeout = e?.name === "AbortError";
      const msg = isTimeout ? `Timed out after ${REQUEST_TIMEOUT_MS}ms` : (e?.message || String(e));
      logProviderError({ model, error: msg });
      if (attempt < maxRetries && !isTimeout) {
        await sleep(300 * Math.pow(2, attempt));
        continue;
      }
      return { ok: false, status: 0, error: msg };
    } finally {
      clearTimeout(timeout);
    }
  }
  return { ok: false, status: 0, error: "Request failed after all retries" };
}

export default { chatCompletion, extractContent, normalizeContextMessages, isModelBrokenError };
