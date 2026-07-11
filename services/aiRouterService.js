// ──────────────────────────────────────────────────────────────────────────
// Top-level AI service: ties router + provider + fallback + logging together.
// This is the single entry point server.js should call for routed text/chat
// requests. Vision/image-gen/TTS/ASR keep their own dedicated service modules
// (services/vision.js, services/zimage.js, services/tts.js, services/asr.js)
// — this service decides WHICH of those paths to use, and directly handles
// the two text-based models (general chat + coding).
// ──────────────────────────────────────────────────────────────────────────
import { route } from "../router/router.js";
import { chatCompletion, normalizeContextMessages } from "../providers/iamhcProvider.js";
import { PRIMARY_MODEL, MODELS, TASK } from "../config/models.js";
import { logModelFallback } from "../utils/logger.js";

const TEXT_MODELS = new Set([MODELS[TASK.GENERAL], MODELS[TASK.CODING]]);

/**
 * Route + answer a text-based request (general chat or coding).
 * For non-text categories (vision/image_gen/asr/tts) this returns the
 * router's decision without calling a text model — the caller should then
 * invoke the corresponding dedicated service.
 *
 * Never throws and never surfaces raw model/API errors to the caller —
 * on any text-model failure it retries once with PRIMARY_MODEL.
 */
export async function getRoutedResponse({ text, context = [], systemInstruction, attachments = {}, apiKey } = {}) {
  const decision = await route({ text, attachments, apiKey });

  if (!TEXT_MODELS.has(decision.model)) {
    // Vision / image-gen / ASR / TTS — hand back the decision so the caller
    // dispatches to the matching dedicated service.
    return { handled: false, decision };
  }

  const messages = normalizeContextMessages(text, context, systemInstruction);
  let result = await chatCompletion({ model: decision.model, messages, apiKey });

  if (!result.ok && decision.model !== PRIMARY_MODEL) {
    logModelFallback({ from: decision.model, to: PRIMARY_MODEL, cause: result.error || `status_${result.status}` });
    result = await chatCompletion({ model: PRIMARY_MODEL, messages, apiKey });
  }

  if (!result.ok) {
    // Never expose model errors to the user — return null, caller shows a
    // generic "couldn't get that" message like the rest of the bot does.
    return { handled: true, decision, content: null };
  }

  return { handled: true, decision, content: result.content };
}

export default { getRoutedResponse };
