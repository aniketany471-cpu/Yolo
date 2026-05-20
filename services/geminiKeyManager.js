const COOLDOWN_MS = 10 * 60 * 1000;

const state = {
  loaded: false,
  keys: [],
  cooldowns: new Map(),
  failures: new Map(),
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

function selectNextHealthyKey() {
  ensureLoaded();
  if (!state.keys.length) return null;
  const now = Date.now();
  for (let offset = 0; offset < state.keys.length; offset++) {
    const idx = (state.currentIndex + offset) % state.keys.length;
    const key = state.keys[idx];
    const until = state.cooldowns.get(key) || 0;
    if (until > now) continue;
    state.currentIndex = (idx + 1) % state.keys.length;
    return { key, index: idx };
  }
  return null;
}

function markCooldown(key, index, reason) {
  const until = Date.now() + COOLDOWN_MS;
  state.cooldowns.set(key, until);
  state.failures.set(key, (state.failures.get(key) || 0) + 1);
  console.warn(`[gemini-keys] key_failed=${index + 1} reason=${reason}`);
  console.warn(`[gemini-keys] cooldown_started=${index + 1}`);
}

export function getGeminiPrimaryKey() {
  ensureLoaded();
  return state.keys[0] || "";
}

export async function withGeminiKeyRotation(executor, { source = "unknown", overrideKey } = {}) {
  ensureLoaded();
  if (overrideKey && overrideKey.trim()) {
    return await executor(overrideKey.trim(), 0);
  }
  if (!state.keys.length) return null;

  const tried = new Set();
  while (tried.size < state.keys.length) {
    const selected = selectNextHealthyKey();
    if (!selected) {
      console.warn("[gemini-keys] all_keys_exhausted");
      return null;
    }
    if (tried.has(selected.index)) continue;
    tried.add(selected.index);
    console.log(`[gemini-keys] using_key=${selected.index + 1}`);

    try {
      return await executor(selected.key, selected.index);
    } catch (error) {
      const reason = (error?.message || "unknown").slice(0, 80);
      if (!isRetriableError(error)) throw error;
      markCooldown(selected.key, selected.index, reason);
      const next = selectNextHealthyKey();
      if (next) console.log(`[gemini-keys] rotating_to=${next.index + 1}`);
    }
  }
  console.warn("[gemini-keys] all_keys_exhausted");
  return null;
}
