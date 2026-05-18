/**
 * BluesMinds AI Full Audit Script
 * ================================
 * Tests every BluesMinds model individually against the live API.
 * Runs non-streaming and streaming tests. Measures latency.
 * Prints a final summary table.
 *
 * Usage:
 *   node scripts_ai_audit.mjs
 *   BASE_URL=http://localhost:5173 node scripts_ai_audit.mjs
 *   DIRECT=1 node scripts_ai_audit.mjs   # bypass /api/ai/test, hit BluesMinds directly
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const DIRECT = !!process.env.DIRECT;
const PROBE = 'Reply with exactly: AUDIT_OK';
const BM_API_KEY_ENV = process.env.BLUEMINDS_API_KEY || '';
const BM_BASE = 'https://api.bluesminds.com/v1';

// ─── Helpers ────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function apiGet(path) {
  const r = await fetch(BASE_URL + path, { headers: { 'Content-Type': 'application/json' } });
  return { ok: r.ok, status: r.status, data: r.ok ? await r.json().catch(() => ({})) : {} };
}

async function apiPost(path, body) {
  const r = await fetch(BASE_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await r.json(); } catch {}
  return { ok: r.ok, status: r.status, data };
}

/**
 * Test a model directly against the BluesMinds API (bypasses server).
 */
async function testDirect(model, apiKey) {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch(`${BM_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: PROBE }], temperature: 0.3 }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const latency = Date.now() - start;
    const raw = await r.text();
    let content = null, errMsg = null;
    try {
      const d = JSON.parse(raw);
      content = d?.choices?.[0]?.message?.content?.trim() || null;
      if (!content) {
        errMsg = d?.error?.message || `Empty content. Keys: ${Object.keys(d).join(', ')}`;
      }
    } catch {
      errMsg = `JSON parse failed. Status=${r.status}. Body=${raw.slice(0, 80) || '(empty)'}`;
    }
    return { ok: !!content, latency, content, error: errMsg, status: r.status };
  } catch (e) {
    return { ok: false, latency: Date.now() - start, error: e.name === 'AbortError' ? 'TIMEOUT (20s)' : e.message, status: 0 };
  }
}

/**
 * Test a model via the server's /api/ai/test endpoint.
 */
async function testViaServer(model) {
  const start = Date.now();
  const r = await apiPost('/api/ai/test', { provider: 'bluesminds', model, prompt: PROBE });
  return {
    ok: r.data?.ok === true,
    latency: r.data?.latency || (Date.now() - start),
    content: r.data?.text || null,
    error: r.data?.error || (r.ok ? null : `HTTP ${r.status}`),
    knownBad: r.data?.knownBad || false,
    status: r.status,
  };
}

/**
 * Test streaming for a model directly against the BluesMinds API.
 */
async function testStream(model, apiKey) {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch(`${BM_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Say: STREAM_OK' }], temperature: 0.3, stream: true }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { ok: false, chunks: 0, text: '', latency: Date.now() - start, error: `HTTP ${r.status}: ${body.slice(0, 60)}` };
    }
    const decoder = new TextDecoder();
    const reader = r.body.getReader();
    let text = '', chunks = 0, firstChunkMs = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const raw = decoder.decode(value, { stream: true });
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        try {
          const j = JSON.parse(line.slice(6));
          const delta = j?.choices?.[0]?.delta;
          const chunk = delta?.content ?? delta?.text ?? '';
          if (chunk) {
            if (firstChunkMs === null) firstChunkMs = Date.now() - start;
            text += chunk;
            chunks++;
          }
        } catch {}
      }
    }
    const latency = Date.now() - start;
    return { ok: chunks > 0, chunks, text, latency, firstChunkMs };
  } catch (e) {
    return { ok: false, chunks: 0, text: '', latency: Date.now() - start, error: e.name === 'AbortError' ? 'TIMEOUT (20s)' : e.message };
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(72)}`);
console.log('  BLUEMINDS AI FULL AUDIT');
console.log(`  Mode: ${DIRECT ? 'DIRECT (bypass server)' : 'via /api/ai/test'}`);
console.log(`  Target: ${DIRECT ? BM_BASE : BASE_URL}`);
console.log(`${'═'.repeat(72)}\n`);

// Step 1: Verify server health (skip if DIRECT mode)
let apiKey = BM_API_KEY_ENV;
let serverModels = [];
if (!DIRECT) {
  const state = await apiGet('/api/state');
  if (!state.ok) {
    console.error(`❌ Server at ${BASE_URL} is not reachable (status=${state.status}). Run the server first.`);
    process.exit(1);
  }
  const cfg = state.data?.config || {};
  apiKey = cfg.bluesmindsApiKey || BM_API_KEY_ENV;
  console.log(`✅ Server health: OK`);
  console.log(`   Provider: ${cfg.aiProvider || '(not set)'}`);
  console.log(`   Active Model: ${cfg.activeModel || '(not set)'}`);
  console.log(`   BluesMinds Key: ${apiKey ? apiKey.slice(0, 8) + '…' : 'MISSING'}\n`);

  // Also get filtered model list from server
  const bmList = await apiGet('/api/bluesminds/models');
  if (bmList.ok) {
    serverModels = bmList.data?.models || [];
    const bad = bmList.data?.bad || [];
    console.log(`📋 Model list from server: ${serverModels.length} available, ${bad.length} filtered (known-bad)\n`);
  }
}

if (!apiKey) {
  console.error('❌ No BluesMinds API key found. Set BLUEMINDS_API_KEY or configure via UI.');
  process.exit(1);
}

// Step 2: Fetch full model list from BluesMinds
console.log('Fetching all models from BluesMinds API…');
let allModels = [];
try {
  const r = await fetch(`${BM_BASE}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const d = await r.json();
  allModels = (d.data || []).map(m => m.id).sort();
  console.log(`   Total: ${allModels.length} models\n`);
} catch (e) {
  console.error(`❌ Failed to fetch model list: ${e.message}`);
  process.exit(1);
}

// ─── Non-streaming tests ───────────────────────────────────────────────────

console.log(`${'─'.repeat(72)}`);
console.log('  NON-STREAMING TEST — all models (sequential with 800ms gap)');
console.log(`${'─'.repeat(72)}`);

const results = [];
for (let i = 0; i < allModels.length; i++) {
  const model = allModels[i];
  process.stdout.write(`  [${String(i + 1).padStart(3)}/${allModels.length}] ${model.padEnd(55)} `);
  const r = DIRECT ? await testDirect(model, apiKey) : await testViaServer(model);
  results.push({ model, ...r, stream: null });
  if (r.ok) {
    process.stdout.write(`✅  ${r.latency}ms\n`);
  } else if (r.knownBad) {
    process.stdout.write(`⚠️  KNOWN BAD (skipped)\n`);
  } else {
    process.stdout.write(`❌  ${r.error?.slice(0, 60) || 'unknown error'}\n`);
  }
  // Small delay to avoid rate limiting
  if (i < allModels.length - 1) await sleep(800);
}

// ─── Streaming tests on working models ────────────────────────────────────

const workingModels = results.filter(r => r.ok).map(r => r.model);
if (workingModels.length > 0) {
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`  STREAMING TEST — ${workingModels.length} working models`);
  console.log(`${'─'.repeat(72)}`);
  for (const model of workingModels) {
    process.stdout.write(`  ${model.padEnd(55)} `);
    const s = await testStream(model, apiKey);
    const entry = results.find(r => r.model === model);
    if (entry) entry.stream = s;
    if (s.ok) {
      process.stdout.write(`✅  chunks=${s.chunks} ttft=${s.firstChunkMs}ms total=${s.latency}ms\n`);
    } else {
      process.stdout.write(`⚠️  ${s.error || 'no chunks'}\n`);
    }
    await sleep(600);
  }
}

// ─── Final summary ────────────────────────────────────────────────────────

const working = results.filter(r => r.ok);
const failed = results.filter(r => !r.ok && !r.knownBad);
const knownBad = results.filter(r => r.knownBad);
const streamOk = results.filter(r => r.stream?.ok);
const streamBroken = working.filter(r => r.stream && !r.stream.ok);

console.log(`\n${'═'.repeat(72)}`);
console.log('  FINAL AUDIT REPORT');
console.log(`${'═'.repeat(72)}`);
console.log(`  Total models tested : ${results.length}`);
console.log(`  ✅ Working           : ${working.length}`);
console.log(`  ❌ Failed            : ${failed.length}`);
console.log(`  ⚠️  Known-bad (skip) : ${knownBad.length}`);
console.log(`  🌊 Stream OK         : ${streamOk.length}`);
console.log(`  🌊 Stream broken     : ${streamBroken.length}`);
console.log('');

if (working.length > 0) {
  console.log('✅ WORKING MODELS:');
  for (const r of working.sort((a, b) => (a.latency || 0) - (b.latency || 0))) {
    const streamStatus = r.stream?.ok ? '🌊' : r.stream ? '⚠️ ' : '  ';
    console.log(`  ${streamStatus} ${r.model.padEnd(50)} ${String(r.latency || 0).padStart(5)}ms`);
  }
  console.log('');
}

if (failed.length > 0) {
  console.log('❌ FAILED MODELS:');
  for (const r of failed) {
    console.log(`  ${r.model.padEnd(50)} HTTP ${r.status || 0}: ${(r.error || '').slice(0, 60)}`);
  }
  console.log('');
}

if (knownBad.length > 0) {
  console.log('⚠️  KNOWN-BAD (filtered from picker):');
  for (const r of knownBad) {
    console.log(`  ${r.model}`);
  }
  console.log('');
}

console.log(`${'═'.repeat(72)}\n`);
if (failed.length > 0) process.exitCode = 2;
