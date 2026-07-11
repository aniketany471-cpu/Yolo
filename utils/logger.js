// ──────────────────────────────────────────────────────────────────────────
// Centralized logging for the routing/provider layer.
// Keeps a consistent, greppable log format:
//   [Router] selected=... confidence=... reason="..."
//   [Router][Fallback] ...
//   [Provider][Model=...] ...
// ──────────────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString();
}

export function logRouterDecision({ model, confidence, reason, source }) {
  console.log(
    `[${ts()}][Router] selected=${model} confidence=${Number(confidence).toFixed(2)} source=${source || "model"} reason="${(reason || "").slice(0, 160)}"`
  );
}

export function logRouterFallback({ from, to, cause }) {
  console.warn(`[${ts()}][Router][Fallback] ${from} -> ${to} cause="${cause}"`);
}

export function logProviderCall({ model, status, latencyMs }) {
  console.log(`[${ts()}][Provider][Model=${model}] status=${status} latency=${latencyMs}ms`);
}

export function logProviderError({ model, error }) {
  console.error(`[${ts()}][Provider][Model=${model}] ERROR: ${String(error).slice(0, 300)}`);
}

export function logModelFallback({ from, to, cause }) {
  console.warn(`[${ts()}][ModelFallback] ${from} -> ${to} cause="${cause}"`);
}

export default {
  logRouterDecision,
  logRouterFallback,
  logProviderCall,
  logProviderError,
  logModelFallback,
};
