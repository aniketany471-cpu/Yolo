const TEMP_ERROR_COOLDOWN_MS = 15 * 1000;
const QUOTA_COOLDOWN_MS = 60 * 1000;

const state = {
  loaded: false,
  keys: [],
  keyStates: [],
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
  state.keyStates = state.keys.map(() => ({
    cooldownUntil: 0,
    failures: 0,
    lastUsed: 0,
    requests: 0
  }));
  state.loaded = true;
  console.log(`[gemini-keys] loaded=${state.keys.length}`);
}

function isRetriableError(error) {
  const msg = (error?.message || String(error || "")).toLowerCase();
  return msg.includes("429") || msg.includes("quota") || msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("overloaded") || msg.includes("temporar") || msg.includes("unavailable") || msg.includes("resource_exhausted") || /\b5\d\d\b/.test(msg);
}

function isQuotaLikeError(error) {
  const msg = (error?.message || String(error || "")).toLowerCase();
  return msg.includes("429") || msg.includes("resource_exhausted") || msg.includes("quota exceeded");
}

function isTemporaryError(error) {
  const msg = (error?.message || String(error || "")).toLowerCase();
  return msg.includes("503") || msg.includes("econnreset") || msg.includes("etimedout") || msg.includes("fetch failed") || msg.includes("socket hang up") || msg.includes("timeout") || msg.includes("temporar") || msg.includes("unavailable") || /\b5\d\d\b/.test(msg);
}

function restoreIfExpired(index) {
  const ks = state.keyStates[index];
  if (!ks) return;
  if (ks.cooldownUntil > 0 && Date.now() >= ks.cooldownUntil) {
    ks.cooldownUntil = 0;
    console.log("[KEY RESTORED]", index + 1);
  }
}

function selectNextHealthyKey(keys) {
  if (!keys.length) return null;
  const now = Date.now();
  for (let offset = 0; offset < keys.length; offset++) {
    const idx = (state.currentIndex + offset) % keys.length;
    const keyState = state.keyStates[idx];
    restoreIfExpired(idx);
    const until = keyState?.cooldownUntil || 0;
    console.log("[KEY STATUS]", {
      index: idx + 1,
      cooldownUntil: until,
      failures: keyState?.failures || 0
    });
    if (until > now) {
      console.log("[KEY COOLDOWN]", idx + 1);
      continue;
    }
    state.currentIndex = (idx + 1) % keys.length;
    return { key: keys[idx], index: idx };
  }
  return null;
}

function selectOldestCooldownKey(keys) {
  let best = null;
  for (let i = 0; i < keys.length; i++) {
    restoreIfExpired(i);
    const until = state.keyStates[i]?.cooldownUntil || 0;
    if (best === null || until < best.cooldownUntil) best = { key: keys[i], index: i, cooldownUntil: until };
  }
  return best;
}

function markCooldown(index, error) {
  const keyState = state.keyStates[index];
  if (!keyState) return;
  keyState.failures += 1;
  if (isQuotaLikeError(error)) {
    keyState.cooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
    console.log("[KEY QUOTA ERROR]", error?.message || String(error || ""));
  } else if (isTemporaryError(error)) {
    keyState.cooldownUntil = Date.now() + TEMP_ERROR_COOLDOWN_MS;
    console.log("[KEY TEMP ERROR]", error?.message || String(error || ""));
  }
  console.log("[KEY COOLDOWN]", index + 1);
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
    let selected = selectNextHealthyKey(candidateKeys);
    if (!selected) {
      const retryKey = selectOldestCooldownKey(candidateKeys);
      if (!retryKey) return null;
      console.log("[KEY RETRY]", retryKey.index + 1);
      selected = { key: retryKey.key, index: retryKey.index };
    }
    if (tried.has(selected.index)) continue;
    tried.add(selected.index);
    console.log(`[ACTIVE KEY INDEX] ${selected.index + 1}`);
    state.keyStates[selected.index].lastUsed = Date.now();
    state.keyStates[selected.index].requests += 1;

    try {
      return await executor(selected.key, selected.index);
    } catch (error) {
      if (!isRetriableError(error)) throw error;
      markCooldown(selected.index, error);
      const next = selectNextHealthyKey(candidateKeys);
      if (next) console.log(`[KEY ROTATION] rotating_to=${next.index + 1} source=${source}`);
    }
  }
  return null;
}
