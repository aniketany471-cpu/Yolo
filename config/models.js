// ──────────────────────────────────────────────────────────────────────────
// Central model configuration for Donna (Skye).
// This is the ONLY place model names / provider settings should be edited.
// Switching a model = change a value here, nothing else.
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
  GENERAL: "general",       // chat, reasoning, planning, writing, fallback
  VISION: "vision",         // image understanding, screenshots, OCR, documents
  CODING: "coding",         // coding, debugging, code generation, refactoring
  IMAGE_GEN: "image_gen",   // image generation and editing
  ASR: "asr",               // speech-to-text
  TTS: "tts",               // text-to-speech
};

// Model assigned to each task category. Change values here to swap models.
// GENERAL and VISION now run on the api.17.wtf gateway (see MODEL_PROVIDER
// below) — DeepSeek for normal chat.
//
// NOTE on GPT models on api.17.wtf: as of this account's current key, the
// real "gpt-5.4"/"gpt-5.5" models return HTTP 402 "insufficient tokens" (no
// paid balance), "persia/gpt-5.4-mini" returns HTTP 403 (no permission for
// that group), and "latina/gpt-5.6-luna" returns HTTP 200 but always empty
// content (broken upstream). None of them are usable right now, so
// MODEL_GENERAL_FALLBACK and MODEL_VISION default to "posiden/mimo-v2.5" —
// a free model on the same account that actually works for both text and
// image input. Once the account has GPT access/balance, just set
// MODEL_VISION / MODEL_GENERAL_FALLBACK env vars to the real gpt-5.x model
// name — no code changes needed.
export const MODELS = {
  [TASK.GENERAL]: process.env.MODEL_GENERAL || "posiden/deepseek-v4-flash",
  [TASK.VISION]: process.env.MODEL_VISION || "posiden/mimo-v2.5",
  [TASK.CODING]: process.env.MODEL_CODING || "kat-coder-pro-v2",
  [TASK.IMAGE_GEN]: process.env.MODEL_IMAGE_GEN || "step-image-edit-2",
  [TASK.ASR]: process.env.MODEL_ASR || "stepaudio-2.5-asr",
  [TASK.TTS]: process.env.MODEL_TTS || "stepaudio-2.5-tts",
};

// Fallback for normal chat — used when the DeepSeek general model fails, so
// "normal chats" get a second model on api.17.wtf instead of retrying the
// same failed model. See the GPT note above for why this isn't a gpt-5.x
// model yet.
export const GENERAL_FALLBACK_MODEL = process.env.MODEL_GENERAL_FALLBACK || "posiden/mimo-v2.5";

// Which gateway serves each task's model. "api17" = api.17.wtf (DeepSeek/GPT,
// free models), "iamhc" = the original gateway (still used for coding,
// image-gen, ASR, TTS, which api17 doesn't offer).
export const MODEL_PROVIDER = {
  [TASK.GENERAL]: "api17",
  [TASK.VISION]: "api17",
  [TASK.CODING]: "iamhc",
  [TASK.IMAGE_GEN]: "iamhc",
  [TASK.ASR]: "iamhc",
  [TASK.TTS]: "iamhc",
};

// Looks up which gateway a given model name should be called through, by
// reverse-matching it against MODELS. Falls back to "iamhc" for any model
// not found here (e.g. the router's own classifier model).
export function getProviderForModel(model) {
  const entry = Object.entries(MODELS).find(([, m]) => m === model);
  const task = entry ? entry[0] : null;
  return MODEL_PROVIDER[task] || "iamhc";
}

// The primary/default model — used whenever routing is skipped or falls back.
export const PRIMARY_MODEL = MODELS[TASK.GENERAL];

// Lightweight router model. If unset/unavailable, the router falls back to
// heuristic (attachment/keyword) routing only, never to answering the user.
export const ROUTER_MODEL = process.env.MODEL_ROUTER || "sensenova-6.7-flash-lite";

// Router never answers user questions — this is only a confidence floor for
// its own model choice. Below this, we always use the primary model.
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
  MODEL_PROVIDER,
  getProviderForModel,
  PRIMARY_MODEL,
  ROUTER_MODEL,
  ROUTER_CONFIDENCE_THRESHOLD,
  getIamhcApiKey,
  getApi17ApiKey,
};
