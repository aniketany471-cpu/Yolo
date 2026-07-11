// ──────────────────────────────────────────────────────────────────────────
// Central model configuration for Donna.
// This is the ONLY place model names / provider settings should be edited.
// Switching a model = change a value here, nothing else.
//
// PROVIDER ROUTING — automatic, name-based:
//   "owner/model"  (contains "/") → api.17.wtf  (API17_API_KEY)
//   "BareModelName" (no "/")      → api.iamhc.cn (IAMHC_API_KEY)
//
// NORMAL CHAT FALLBACK ORDER — both DeepSeek Flash providers first:
//   1. posiden/deepseek-v4-flash  — api17 gateway  (primary)
//   2. DeepSeek-V4-Flash          — iamhc gateway  (same model, second provider)
//   3. posiden/mimo-v2.5          — api17 fallback  (first non-DeepSeek)
//   4. posiden/hy3                — api17 fallback
//   5. posiden/nemotron-3-ultra   — api17 fallback
// ──────────────────────────────────────────────────────────────────────────

export const IAMHC_BASE_URL = (process.env.IAMHC_BASE_URL || "https://api.iamhc.cn/v1").replace(/\/+$/, "");
export const API17_BASE_URL = (process.env.API17_BASE_URL || "https://api.17.wtf/v1").replace(/\/+$/, "");

function apiKey() {
  return (process.env.IAMHC_API_KEY || "").trim();
}

function api17Key() {
  return (process.env.API17_API_KEY || "").trim();
}

// Task categories the router can select between.
export const TASK = {
  GENERAL:   "general",    // chat, reasoning, planning, writing, fallback
  VISION:    "vision",     // image understanding, screenshots, OCR, documents
  CODING:    "coding",     // coding, debugging, code generation, refactoring
  IMAGE_GEN: "image_gen",  // image generation and editing
  ASR:       "asr",        // speech-to-text
  TTS:       "tts",        // text-to-speech
};

// ── Primary model per task ─────────────────────────────────────────────────
// Change a value here (or set the matching env var on Railway) to swap models.
export const MODELS = {
  [TASK.GENERAL]:   process.env.MODEL_GENERAL   || "posiden/deepseek-v4-flash", // api17
  [TASK.VISION]:    process.env.MODEL_VISION    || "posiden/mimo-v2.5",          // api17
  [TASK.CODING]:    process.env.MODEL_CODING    || "kat-coder-pro-v2",           // iamhc
  [TASK.IMAGE_GEN]: process.env.MODEL_IMAGE_GEN || "step-image-edit-2",
  [TASK.ASR]:       process.env.MODEL_ASR       || "stepaudio-2.5-asr",
  [TASK.TTS]:       process.env.MODEL_TTS       || "stepaudio-2.5-tts",
};

// ── DeepSeek Flash on the iamhc gateway ────────────────────────────────────
// Same DeepSeek Flash model, second provider. Tried immediately after the
// api17 variant fails — so both DeepSeek providers are exhausted before we
// ever touch any non-DeepSeek model.
// Override via MODEL_DEEPSEEK_IAMHC env var if iamhc ever renames it.
const DEEPSEEK_IAMHC = process.env.MODEL_DEEPSEEK_IAMHC || process.env.MODEL_GENERAL_IAMHC_FALLBACK || "DeepSeek-V4-Flash";

// ── First non-DeepSeek fallback ─────────────────────────────────────────────
// Used after both DeepSeek Flash providers fail.
export const GENERAL_FALLBACK_MODEL = process.env.MODEL_GENERAL_FALLBACK || "posiden/mimo-v2.5";

// ── Additional fallbacks ────────────────────────────────────────────────────
// Tried in order after GENERAL_FALLBACK_MODEL. Comma-separated, no spaces.
const GENERAL_EXTRA_FALLBACKS = (process.env.MODEL_GENERAL_EXTRA_FALLBACKS || "posiden/hy3,posiden/nemotron-3-ultra")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

function dedupe(arr) {
  return arr.filter(Boolean).filter((m, i, a) => a.indexOf(m) === i);
}

// ── Full ordered fallback chains per task ──────────────────────────────────
//
// GENERAL:  api17-DeepSeek → iamhc-DeepSeek → mimo → hy3 → nemotron
// CODING:   kat-coder-pro  → api17-DeepSeek  → iamhc-DeepSeek → mimo → …
//
// getTextModelChain() always prepends the actual router-chosen model so any
// env-var override is tried first even if it doesn't appear in this list.
const TEXT_MODEL_CHAINS = {
  [TASK.GENERAL]: dedupe([
    MODELS[TASK.GENERAL],   // posiden/deepseek-v4-flash (api17)  ← PRIMARY
    DEEPSEEK_IAMHC,         // DeepSeek-V4-Flash         (iamhc)  ← SECOND DEEPSEEK
    GENERAL_FALLBACK_MODEL, // posiden/mimo-v2.5          (api17)  ← first non-DeepSeek fallback
    ...GENERAL_EXTRA_FALLBACKS,
  ]),
  [TASK.CODING]: dedupe([
    MODELS[TASK.CODING],    // kat-coder-pro-v2           (iamhc)  ← PRIMARY for coding
    MODELS[TASK.GENERAL],   // posiden/deepseek-v4-flash  (api17)
    DEEPSEEK_IAMHC,         // DeepSeek-V4-Flash          (iamhc)
    GENERAL_FALLBACK_MODEL,
    ...GENERAL_EXTRA_FALLBACKS,
  ]),
};

/**
 * Full ordered list of models to try for a text reply.
 * Starts with the router's chosen model, then that task's fallback chain,
 * deduped. For any unknown model the GENERAL chain is used, ensuring both
 * DeepSeek Flash providers are always tried before non-DeepSeek models.
 */
export function getTextModelChain(model) {
  const entry = Object.entries(MODELS).find(([, m]) => m === model);
  const task  = entry ? entry[0] : null;
  const chain = TEXT_MODEL_CHAINS[task] || TEXT_MODEL_CHAINS[TASK.GENERAL];
  return dedupe([model, ...chain]);
}

/**
 * Returns which gateway a given model should be called through.
 * Detection is name-based: "owner/model" → api17, bare name → iamhc.
 */
export function getProviderForModel(model) {
  if (!model) return "iamhc";
  return model.includes("/") ? "api17" : "iamhc";
}

// The primary/default model — used whenever routing is skipped or falls back.
export const PRIMARY_MODEL = MODELS[TASK.GENERAL];

// Lightweight router model (for intent classification only — never answers users).
// Falls back to heuristic routing if unset/unavailable.
export const ROUTER_MODEL = process.env.MODEL_ROUTER || "sensenova-6.7-flash-lite";

// Router confidence floor. Below this we always use the primary model.
export const ROUTER_CONFIDENCE_THRESHOLD = 0.70;

export const getIamhcApiKey = (overrideKey) => {
  const clean = (overrideKey || apiKey()).trim();
  return clean && clean !== "undefined" && clean !== "null" && clean.length > 5 ? clean : "";
};

export const getApi17ApiKey = (overrideKey) => {
  const clean = (overrideKey || api17Key()).trim();
  return clean && clean !== "undefined" && clean !== "null" && clean.length > 5 ? clean : "";
};

export default {
  IAMHC_BASE_URL,
  API17_BASE_URL,
  TASK,
  MODELS,
  GENERAL_FALLBACK_MODEL,
  getProviderForModel,
  getTextModelChain,
  PRIMARY_MODEL,
  ROUTER_MODEL,
  ROUTER_CONFIDENCE_THRESHOLD,
  getIamhcApiKey,
  getApi17ApiKey,
};
