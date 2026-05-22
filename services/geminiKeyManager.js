const COOLDOWN_MS = 5 * 60 * 1000;
const HARD_COOLDOWN_MS = 10 * 60 * 1000;

const state = {
  loaded: false,
  keys: [],
  cooldowns: new Map(),
  consecutive429: new Map(),
  currentIndex: 0
};

function normalizeKeys() {
  const keys = [];
  for (let i = 1; i <= 20; i++) {
    const v = (process.env[`GEMINI_API_KEY_${i}`] || "").trim();
    if (v) keys.push(v);
  }
  const legacy = (process.env.GEMINI_API_KEY || "").trim();
  if (legacy && !keys.includes(legacy)) keys.push(legacy);
  return keys;
}

function ensureLoaded() {
  if (state.loaded) return;
  state.keys = normalizeKeys();
  state.loaded = true;
  console.log(`[gemini-keys] loaded=${state.keys.length}`);
}

function isRetriableError(error) {
  const msg = (error?.message || String(error || "")).toLowerCase();
  return msg.includes("429") || msg.includes("quota") || msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("overloaded") || msg.includes("temporar") || msg.includes("unavailable") || msg.includes("resource_exhausted") || /\b5\d\d\b/.test(msg);
}

function isQuotaLikeError(error) {
  const msg = (error?.message || String(error || "")).toLowerCase();
  return msg.includes("429") || msg.includes("resource_exhausted") || msg.includes("quota exceeded") || msg.includes("quota") || msg.includes("rate limit") || msg.includes("too many requests");
}

function selectNextHealthyKey(keys) {
  if (!keys.length) return null;
  const now = Date.now();
  for (let offset = 0; offset < keys.length; offset++) {
    const idx = (state.currentIndex + offset) % keys.length;
    const key = keys[idx];
    const until = state.cooldowns.get(key) || 0;
    if (until > now) {
      console.warn(`[KEY SKIPPED] index=${idx + 1}`);
      console.warn(`[KEY COOLDOWN] until=${new Date(until).toISOString()} ms_remaining=${until - now}`);
      continue;
    }
    state.currentIndex = (idx + 1) % keys.length;
    return { key, index: idx };
  }
  return null;
}

function markCooldown(key, index, reason, error) {
  const quotaLike = isQuotaLikeError(error);
  const prev429 = state.consecutive429.get(key) || 0;
  const next429 = quotaLike ? prev429 + 1 : 0;
  state.consecutive429.set(key, next429);
  const cooldownMs = quotaLike && next429 >= 2 ? HARD_COOLDOWN_MS : COOLDOWN_MS;
  const until = Date.now() + cooldownMs;
  state.cooldowns.set(key, until);
  console.warn(`[KEY ROTATION] key_failed index=${index + 1} reason=${reason}`);
  console.warn(`[KEY COOLDOWN] index=${index + 1} ms=${cooldownMs} until=${new Date(until).toISOString()} consecutive_429=${next429}`);
}

export function getGeminiPrimaryKey() {
  ensureLoaded();
  return state.keys[0] || "";
}

export async function withGeminiKeyRotation(executor, { source = "unknown", overrideKey } = {}) {
  ensureLoaded();
  const trimmedOverride = (overrideKey || "").trim();
  const candidateKeys = trimmedOverride && !state.keys.includes(trimmedOverride)
    ? [trimmedOverride, ...state.keys]
    : [...state.keys];
  if (!candidateKeys.length) return null;

  const tried = new Set();
  while (tried.size < candidateKeys.length) {
    const selected = selectNextHealthyKey(candidateKeys);
    if (!selected) {
      console.warn("[ALL KEYS EXHAUSTED]");
      return null;
    }
    if (tried.has(selected.index)) continue;
    tried.add(selected.index);
    console.log(`[ACTIVE KEY INDEX] ${selected.index + 1}`);

    try {
      return await executor(selected.key, selected.index);
    } catch (error) {
      const reason = (error?.message || "unknown").slice(0, 80);
      if (!isRetriableError(error)) throw error;
      markCooldown(selected.key, selected.index, reason, error);
      const next = selectNextHealthyKey(candidateKeys);
      if (next) console.log(`[KEY ROTATION] rotating_to=${next.index + 1} source=${source}`);
    }
  }
  console.warn("[ALL KEYS EXHAUSTED]");
  return null;
}
