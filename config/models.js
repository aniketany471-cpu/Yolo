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

function dedupe(arr) {
  return arr.filter(Boolean).filter((m, i, a) => a.indexOf(m) === i);
}

// Further models tried, in order, if the router's chosen model AND its
// immediate fallback both fail — configurable without code changes.
const GENERAL_EXTRA_FALLBACKS = (process.env.MODEL_GENERAL_EXTRA_FALLBACKS || "posiden/hy3,posiden/nemotron-3-ultra")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

// Cross-provider redundancy for normal chat: DeepSeek-V4-Flash (free, on
// api17) is tried first, then DeepSeek-V4-Pro (on the original iamhc
// gateway) as the next-best model — so a normal chat survives either whole
// PROVIDER being down, not just one model within a single provider.
const DEEPSEEK_PRO_MODEL = process.env.MODEL_GENERAL_IAMHC_FALLBACK || "DeepSeek-V4-Pro";

// Ordered "next best model" chains per text task. When a reply fails, the
// caller tries each subsequent model here in turn instead of giving up or
// retrying the same broken model.
const TEXT_MODEL_CHAINS = {
  [TASK.GENERAL]: dedupe([MODELS[TASK.GENERAL], DEEPSEEK_PRO_MODEL, GENERAL_FALLBACK_MODEL, ...GENERAL_EXTRA_FALLBACKS]),
  [TASK.CODING]: dedupe([MODELS[TASK.CODING], MODELS[TASK.GENERAL], DEEPSEEK_PRO_MODEL, GENERAL_FALLBACK_MODEL, ...GENERAL_EXTRA_FALLBACKS]),
};

/**
 * Full ordered list of models to try for a text reply, starting with the
 * router's actual chosen model (even if it's a stale override that isn't
 * literally MODELS[task]) followed by that task's proven-working fallback
 * chain, deduped.
 */
export function getTextModelChain(model) {
  const entry = Object.entries(MODELS).find(([, m]) => m === model);
  const task = entry ? entry[0] : null;
  const chain = TEXT_MODEL_CHAINS[task] || [MODELS[TASK.GENERAL], GENERAL_FALLBACK_MODEL, ...GENERAL_EXTRA_FALLBACKS];
  return dedupe([model, ...chain]);
}

// Looks up which gateway a given model name should be called through.
// Detected from the model NAME itself, not from which task it's assigned
// to — every model on api.17.wtf is namespaced as "owner/model" (e.g.
// "posiden/deepseek-v4-flash", "persia/gpt-5.4-mini"), while every iamhc
// model is a bare name (e.g. "DeepSeek-V4-Pro", "kat-coder-pro-v2").
//
// This must stay name-based rather than task-based: if a task's env var
// override (MODEL_GENERAL, MODEL_VISION, ...) still points at an old
// iamhc model name (e.g. leftover "DeepSeek-V4-Pro" on a deploy that
// predates api.17.wtf), a task-based map would wrongly send it to api17
// and get an empty/failed response even though the model exists on iamhc.
export function getProviderForModel(model) {
  if (!model) return "iamhc";
  return model.includes("/") ? "api17" : "iamhc";
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
  getProviderForModel,
  getTextModelChain,
  PRIMARY_MODEL,
  ROUTER_MODEL,
  ROUTER_CONFIDENCE_THRESHOLD,
  getIamhcApiKey,
  getApi17ApiKey,
};
