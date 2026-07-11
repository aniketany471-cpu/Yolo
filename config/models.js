// ──────────────────────────────────────────────────────────────────────────
// Central model configuration for Donna (Skye).
// This is the ONLY place model names / provider settings should be edited.
// Switching a model = change a value here, nothing else.
// ──────────────────────────────────────────────────────────────────────────

export const IAMHC_BASE_URL = (process.env.IAMHC_BASE_URL || "https://api.iamhc.cn/v1").replace(/\/+$/, "");

function apiKey() {
  return (process.env.IAMHC_API_KEY || "").trim();
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
export const MODELS = {
  [TASK.GENERAL]: process.env.MODEL_GENERAL || "DeepSeek-V4-Pro",
  [TASK.VISION]: process.env.MODEL_VISION || "Qwen3.6-35B-A3B",
  [TASK.CODING]: process.env.MODEL_CODING || "kat-coder-pro-v2",
  [TASK.IMAGE_GEN]: process.env.MODEL_IMAGE_GEN || "step-image-edit-2",
  [TASK.ASR]: process.env.MODEL_ASR || "stepaudio-2.5-asr",
  [TASK.TTS]: process.env.MODEL_TTS || "stepaudio-2.5-tts",
};

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

export default {
  IAMHC_BASE_URL,
  TASK,
  MODELS,
  PRIMARY_MODEL,
  ROUTER_MODEL,
  ROUTER_CONFIDENCE_THRESHOLD,
  getIamhcApiKey,
};
