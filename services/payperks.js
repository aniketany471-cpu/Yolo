// ─────────────────────────────────────────────────────────────────────────────
// services/payperks.js
// Primary download backend for YouTube audio (mp3) and video (mp4).
//
// API: https://payperks.in/api/?url={url}&format=mp3&async=1
//      https://payperks.in/api/?url={url}&format=mp4&quality=1440p&async=1
//
// Flow:
//   1. POST to API endpoint → receives { ok, async, job_id, status_url }
//   2. Poll status_url until status === "completed" / "done" / "ready"
//   3. Return download_url for the caller to stream to disk
// ─────────────────────────────────────────────────────────────────────────────

import https from "node:https";
import http from "node:http";

const BASE = "https://payperks.in";
const POLL_INTERVAL_MS = 3000;   // 3 s between polls
const MAX_POLLS = 40;            // ~2 min max wait

// ── Simple HTTP GET helper ────────────────────────────────────────────────────
function httpGet(urlStr, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.get(
      urlStr,
      { headers: { "User-Agent": "Donna-Bot/2.0", Accept: "application/json" }, timeout: timeoutMs },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Payperks request timed out"));
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Core fetch ────────────────────────────────────────────────────────────────

/**
 * Start a Payperks async download job and poll until it completes.
 *
 * @param {string} url        Full YouTube URL
 * @param {"mp3"|"mp4"} fmt   "mp3" for audio, "mp4" for video
 * @param {string} [quality]  e.g. "1440p", "720p" (ignored for mp3)
 * @returns {Promise<string>} Direct download URL ready to stream
 */
/**
 * @param {string} url         Full YouTube URL
 * @param {"mp3"|"mp4"} fmt    "mp3" for audio, "mp4" for video
 * @param {string} [quality]   e.g. "1440p", "720p" (ignored for mp3)
 * @param {object} [opts]
 * @param {function} [opts.onProgress]  Called with integer 0-100 as job progresses
 * @returns {Promise<string>} Direct download URL ready to stream
 */
export async function payperksFetch(url, fmt = "mp4", quality = "1440p", { onProgress } = {}) {
  const isAudio = fmt === "mp3";
  const qs = isAudio
    ? `url=${encodeURIComponent(url)}&format=mp3&async=1`
    : `url=${encodeURIComponent(url)}&format=mp4&quality=${quality}&async=1`;
  const apiUrl = `${BASE}/api/?${qs}`;

  onProgress?.(5);
  const initRes = await httpGet(apiUrl);
  const init = initRes.body;

  if (!init || !init.ok) {
    throw new Error(
      `Payperks init failed (HTTP ${initRes.status}): ${typeof init === "string" ? init.slice(0, 120) : JSON.stringify(init).slice(0, 120)}`
    );
  }

  // Synchronous response — direct download URL (no polling needed)
  if (!init.async) {
    const dlUrl = init.download_url || init.url || init.file_url;
    if (dlUrl) { onProgress?.(100); return dlUrl; }
    throw new Error("Payperks: sync response missing download_url");
  }

  // Async — poll the status endpoint until complete
  const statusPath = init.status_url;
  if (!statusPath) throw new Error("Payperks: missing status_url in async response");
  const statusUrl = statusPath.startsWith("http") ? statusPath : `${BASE}${statusPath}`;

  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS);
    // Report progress: 10 % base + up to 85 % across polls
    const pct = Math.min(10 + Math.round((i / MAX_POLLS) * 75), 85);
    onProgress?.(pct);

    let pollRes;
    try {
      pollRes = await httpGet(statusUrl);
    } catch (e) {
      // Transient network error during poll — keep trying
      continue;
    }
    const b = pollRes.body;
    if (!b || typeof b !== "object") continue;
    const status = (b.status || "").toLowerCase();

    if (status === "completed" || status === "done" || status === "ready" || status === "success") {
      const dlUrl = b.download_url || b.url || b.file_url || b.link;
      if (dlUrl) { onProgress?.(100); return dlUrl; }
      throw new Error("Payperks: job completed but no download_url in response");
    }

    if (status === "failed" || status === "error") {
      throw new Error(`Payperks job failed: ${b.message || b.error || "unknown reason"}`);
    }
    // status === "processing" or similar — keep polling
  }

  throw new Error(`Payperks: job timed out after ${(MAX_POLLS * POLL_INTERVAL_MS) / 1000}s`);
}

export default { payperksFetch };
