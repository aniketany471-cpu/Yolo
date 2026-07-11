// ──────────────────────────────────────────────────────────────────────────
// Router service.
//
// The router NEVER answers the user. It only decides which model should
// handle a request and returns structured JSON:
//   { model, confidence, reason }
//
// Decision order:
//   1. Attachment-based routing (image / audio / explicit image-gen request
//      / coding request) — deterministic, no model call needed.
//   2. Lightweight router model (ROUTER_MODEL), if configured — asked to
//      classify plain text requests only.
//   3. Below-confidence or router failure -> PRIMARY_MODEL (DeepSeek-V4-Pro).
// ──────────────────────────────────────────────────────────────────────────
import { MODELS, TASK, PRIMARY_MODEL, ROUTER_MODEL, ROUTER_CONFIDENCE_THRESHOLD } from "../config/models.js";
import { chatCompletion } from "../providers/iamhcProvider.js";
import { logRouterDecision, logRouterFallback } from "../utils/logger.js";

const CODING_PATTERN = /\b(code|codebase|function|bug|error|stack ?trace|refactor|debug|compile|syntax|regex|typescript|javascript|python|api endpoint|unit test|npm|pip install|traceback|exception|null pointer|segfault|write a script|fix this code|write code|implement a function)\b/i;
const IMAGE_GEN_PATTERN = /\b(generate an? image|create an? image|make an? image|draw|render an? image|edit this image|edit the photo|image of|picture of|wallpaper|poster|logo|thumbnail)\b/i;

function heuristicDecision(text) {
  const t = String(text || "");
  if (IMAGE_GEN_PATTERN.test(t)) {
    return { model: MODELS[TASK.IMAGE_GEN], confidence: 0.95, reason: "Detected image generation/edit request", source: "heuristic" };
  }
  if (CODING_PATTERN.test(t)) {
    return { model: MODELS[TASK.CODING], confidence: 0.85, reason: "Detected coding/debugging request", source: "heuristic" };
  }
  return null;
}

/**
 * Decide which model should handle a request.
 *
 * @param {object} input
 * @param {string} input.text - the user's message text (may be empty for pure attachments).
 * @param {object} input.attachments - { image?: boolean, audio?: boolean, document?: boolean }
 * @param {string} [input.apiKey] - override API key for the router-model call.
 * @returns {Promise<{model: string, confidence: number, reason: string, source: string}>}
 */
export async function route({ text = "", attachments = {}, apiKey } = {}) {
  // 1) Deterministic attachment-based routing — always wins, no model call.
  if (attachments.image || attachments.document) {
    const decision = { model: MODELS[TASK.VISION], confidence: 1, reason: "Image/document attachment detected", source: "attachment" };
    logRouterDecision(decision);
    return decision;
  }
  if (attachments.audio) {
    const decision = { model: MODELS[TASK.ASR], confidence: 1, reason: "Audio attachment detected", source: "attachment" };
    logRouterDecision(decision);
    return decision;
  }

  // 2) Heuristic keyword routing for coding / image-generation text requests.
  const heuristic = heuristicDecision(text);
  if (heuristic) {
    logRouterDecision(heuristic);
    return heuristic;
  }

  // 3) Lightweight router model classifies everything else.
  if (ROUTER_MODEL) {
    const routerPrompt = [
      "You are a routing classifier. Do NOT answer the user's message.",
      "Choose exactly one model for handling this request from this list:",
      `- ${MODELS[TASK.GENERAL]} (general chat, reasoning, planning, writing, fallback)`,
      `- ${MODELS[TASK.VISION]} (image understanding, screenshots, OCR, documents)`,
      `- ${MODELS[TASK.CODING]} (coding, debugging, code generation, refactoring)`,
      `- ${MODELS[TASK.IMAGE_GEN]} (image generation and editing)`,
      "Respond with ONLY compact JSON, no prose, no markdown fences:",
      '{"model": "<one of the above>", "confidence": <0.00-1.00>, "reason": "<short reason>"}',
      "",
      `User message: ${text}`,
    ].join("\n");

    const result = await chatCompletion({
      model: ROUTER_MODEL,
      prompt: routerPrompt,
      apiKey,
      extra: { temperature: 0 },
      maxRetries: 0,
    });

    if (result.ok) {
      try {
        const jsonText = result.content.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
        const parsed = JSON.parse(jsonText);
        const knownModels = Object.values(MODELS);
        if (parsed && knownModels.includes(parsed.model) && typeof parsed.confidence === "number") {
          const decision = { model: parsed.model, confidence: parsed.confidence, reason: parsed.reason || "", source: "router_model" };
          if (decision.confidence < ROUTER_CONFIDENCE_THRESHOLD) {
            logRouterFallback({ from: decision.model, to: PRIMARY_MODEL, cause: `low_confidence(${decision.confidence})` });
            const fallback = { model: PRIMARY_MODEL, confidence: decision.confidence, reason: `Low router confidence for ${decision.model}: ${decision.reason}`, source: "confidence_fallback" };
            logRouterDecision(fallback);
            return fallback;
          }
          logRouterDecision(decision);
          return decision;
        }
      } catch (e) {
        logRouterFallback({ from: ROUTER_MODEL, to: PRIMARY_MODEL, cause: `unparseable_router_response: ${e.message}` });
      }
    } else {
      logRouterFallback({ from: ROUTER_MODEL, to: PRIMARY_MODEL, cause: result.error || "router_model_failed" });
    }
  }

  // 4) Final fallback — always safe, never blocks the user.
  const fallback = { model: PRIMARY_MODEL, confidence: 1, reason: "Default fallback — no router model or classification failed", source: "default_fallback" };
  logRouterDecision(fallback);
  return fallback;
}

export default { route };
