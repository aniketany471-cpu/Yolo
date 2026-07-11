// ──────────────────────────────────────────────────────────────────────────
// Top-level AI service: ties router + provider + fallback + logging together.
// This is the single entry point server.js should call for routed text/chat
// requests. Vision/image-gen/TTS/ASR keep their own dedicated service modules
// (services/vision.js, services/zimage.js, services/tts.js, services/asr.js)
// — this service decides WHICH of those paths to use, and directly handles
// the two text-based models (general chat + coding).
// ──────────────────────────────────────────────────────────────────────────
import { route } from "../router/router.js";
import { normalizeContextMessages } from "../providers/iamhcProvider.js";
import { routedChatCompletion as chatCompletion } from "./providerGateway.js";
import { MODELS, TASK, getTextModelChain } from "../config/models.js";
import { logModelFallback } from "../utils/logger.js";

const TEXT_MODELS = new Set([MODELS[TASK.GENERAL], MODELS[TASK.CODING]]);

/**
 * Route + answer a text-based request (general chat or coding).
 * For non-text categories (vision/image_gen/asr/tts) this returns the
 * router's decision without calling a text model — the caller should then
 * invoke the corresponding dedicated service.
 *
 * Never throws and never surfaces raw model/API errors to the caller. If
 * the router's chosen model fails, walks that task's ordered fallback
 * chain (config/models.js: getTextModelChain) trying each next-best model
 * in turn until one succeeds or the chain is exhausted — never just
 * retries the same broken model.
 */
export async function getRoutedResponse({ text, context = [], systemInstruction, attachments = {}, apiKey } = {}) {
  const decision = await route({ text, attachments, apiKey });

  if (!TEXT_MODELS.has(decision.model)) {
    // Vision / image-gen / ASR / TTS — hand back the decision so the caller
    // dispatches to the matching dedicated service.
    return { handled: false, decision };
  }

  const messages = normalizeContextMessages(text, context, systemInstruction);
  const chain = getTextModelChain(decision.model);

  let result = null;
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    result = await chatCompletion({ model, messages, apiKey });
    if (result.ok) break;
    const nextModel = chain[i + 1];
    if (nextModel) {
      logModelFallback({ from: model, to: nextModel, cause: result.error || `status_${result.status}` });
    }
  }

  if (!result || !result.ok) {
    // Every model in the chain failed — never expose raw model errors to
    // the user, return null so the caller shows a generic "couldn't get
    // that" message like the rest of the bot does.
    return { handled: true, decision, content: null };
  }

  return { handled: true, decision, content: result.content };
}

export default { getRoutedResponse };
