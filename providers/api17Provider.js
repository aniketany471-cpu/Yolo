// ──────────────────────────────────────────────────────────────────────────
// Generic OpenAI-compatible provider client for api.17.wtf.
// Mirrors providers/iamhcProvider.js exactly — same request/response shape —
// just pointed at a different gateway + key. Model-agnostic: never hardcode
// a model name here, config/models.js decides which models run here.
// ──────────────────────────────────────────────────────────────────────────
import { API17_BASE_URL, getApi17ApiKey } from "../config/models.js";
import { logProviderCall, logProviderError } from "../utils/logger.js";
import { isModelBrokenError, normalizeContextMessages, extractContent } from "./iamhcProvider.js";

const REQUEST_TIMEOUT_MS = Number(process.env.API17_TIMEOUT_MS || 30000);

function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Single non-streaming chat completion call for ANY model on the api.17.wtf
 * gateway. Retries transient failures once. Never throws — always returns
 * { ok, content, status, error, broken }.
 */
export async function chatCompletion({ model, prompt, context = [], systemInstruction, apiKey, messages, extra = {}, maxRetries = 1 }) {
  const cleanKey = getApi17ApiKey(apiKey);
  if (!cleanKey) {
    return { ok: false, error: "No valid api17 API key configured.", status: 0 };
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
      const response = await fetch(`${API17_BASE_URL}/chat/completions`, {
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

export default { chatCompletion };
