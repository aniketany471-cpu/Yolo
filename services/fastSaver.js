// ─────────────────────────────────────────────────────────────────────────────
// FastSaver API wrapper  —  https://api.fastsaver.io/v1
//
// Confirmed working endpoints (tested 2026-07-16):
//   GET  /youtube/info?url=...                → video info + available formats
//   GET  /youtube/search?query=...&page=1     → music/video search results
//   POST /youtube/download  {url, format}     → {ok, download_url}  (tunnel ~60s TTL)
//   GET  /fetch?url=...                       → Instagram / generic media fetch
//
// format values: "audio" | "144p" | "240p" | "360p" | "480p" | "720p" | "1080p"
// ─────────────────────────────────────────────────────────────────────────────

import https from "node:https";
import http from "node:http";
import fs from "fs-extra";
import path from "node:path";

const BASE = "https://api.fastsaver.io/v1";

// ── Core HTTP helper ──────────────────────────────────────────────────────────
function apiFetch(urlStr, { method = "GET", body = null, apiKey, timeoutMs = 25000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === "https:" ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
        "User-Agent": "Donna-Bot/2.0",
        Accept: "application/json",
      },
    };
    const req = lib.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error("FastSaver API timeout")); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── YouTube ───────────────────────────────────────────────────────────────────

/** Fetch YouTube video info (title, author, duration, available formats + file sizes) */
export async function ytInfo(url, apiKey) {
  const res = await apiFetch(`${BASE}/youtube/info?url=${encodeURIComponent(url)}`, { apiKey });
  if (res.status !== 200 || !res.body?.ok) {
    throw new Error(`ytInfo failed (${res.status}): ${JSON.stringify(res.body).slice(0, 120)}`);
  }
  return res.body;
}

/** Search YouTube by query. Returns array of {video_id, title, duration, thumbnail_url}. */
export async function ytSearch(query, apiKey) {
  const res = await apiFetch(`${BASE}/youtube/search?query=${encodeURIComponent(query)}&page=1`, { apiKey });
  if (res.status !== 200 || !res.body?.ok) {
    throw new Error(`ytSearch failed (${res.status}): ${JSON.stringify(res.body).slice(0, 120)}`);
  }
  return res.body.results || [];
}

/** Get a tunnel download URL for a YouTube video/audio.
 *  format: "audio" | "144p" | "240p" | "360p" | "480p" | "720p" | "1080p"
 *  Returns the tunnel URL string (valid ~60s — stream to file immediately). */
export async function ytDownloadUrl(url, format, apiKey) {
  const res = await apiFetch(`${BASE}/youtube/download`, {
    method: "POST",
    body: { url, format },
    apiKey,
    timeoutMs: 30000,
  });
  if (res.status !== 200 || !res.body?.ok || !res.body?.download_url) {
    throw new Error(`ytDownloadUrl failed (${res.status}): ${JSON.stringify(res.body).slice(0, 120)}`);
  }
  return res.body.download_url;
}

// ── Instagram / generic media ─────────────────────────────────────────────────

/** Fetch Instagram/generic media info via FastSaver /fetch endpoint.
 *  Returns {ok, url, urls, thumbnail, ...} on success.
 *  Throws if the fetch fails or the content is unavailable. */
export async function igFetch(url, apiKey) {
  const res = await apiFetch(`${BASE}/fetch?url=${encodeURIComponent(url)}`, { apiKey, timeoutMs: 30000 });
  if (res.status !== 200) {
    throw new Error(`igFetch HTTP ${res.status}: ${JSON.stringify(res.body).slice(0, 120)}`);
  }
  if (!res.body?.ok) {
    const detail = res.body?.detail || "unknown error";
    throw new Error(`igFetch failed: ${detail}`);
  }
  return res.body;
}

// ── File streaming ────────────────────────────────────────────────────────────

/** Stream a tunnel/download URL to a local file. Returns bytes written. */
export async function streamToFile(downloadUrl, destPath) {
  await fs.ensureDir(path.dirname(destPath));
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, redirects = 0) => {
      if (redirects > 8) return reject(new Error("Too many redirects"));
      const url = new URL(currentUrl);
      const lib = url.protocol === "https:" ? https : http;
      lib.get(currentUrl, {
        headers: { "User-Agent": "Donna-Bot/2.0" },
        timeout: 120000,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, currentUrl).href;
          return follow(next, redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }
        const out = fs.createWriteStream(destPath);
        res.pipe(out);
        out.on("finish", () => resolve(out.bytesWritten));
        out.on("error", reject);
        res.on("error", reject);
      }).on("error", reject).on("timeout", () => reject(new Error("Stream timed out")));
    };
    follow(downloadUrl);
  });
}

// ── Format helpers ────────────────────────────────────────────────────────────

/** Pick best video format that fits within maxMb. Falls back to lower quality. */
export function pickVideoFormat(formats, maxMb = 45) {
  const maxBytes = maxMb * 1024 * 1024;
  const order = ["720p", "480p", "360p", "240p", "144p"];
  for (const fmt of order) {
    const f = formats.find((x) => x.format === fmt && x.type === "video");
    if (f && f.filesize && f.filesize <= maxBytes) return fmt;
    if (f && !f.filesize) return fmt; // no size info — try anyway
  }
  return "360p";
}

// ── URL / intent detection ────────────────────────────────────────────────────

/** Extract a YouTube URL from text. Returns full URL string or null. */
export function extractYouTubeUrl(text = "") {
  const m = String(text).match(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?(?:[^&\s]+&)*v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})[^\s<>"]*/i
  );
  if (!m) return null;
  const raw = m[0];
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

/** Extract an Instagram URL from text. Returns full URL string or null. */
export function extractInstagramUrl(text = "") {
  const m = String(text).match(
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)[^\s<>"]*/i
  );
  if (!m) return null;
  const raw = m[0];
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

/** Returns true if text sounds like the user wants to download something (explicit intent). */
export function hasDownloadIntent(text = "") {
  return /\b(download|save|dl|mp3|mp4|video save|send me|bhej|bhejo|de de|dedo)\b/i.test(String(text));
}

/** Returns true if text is a music-by-name request (no URL, download + something that could be a title). */
export function isMusicByNameRequest(text = "") {
  const t = String(text);
  const hasUrl = /https?:\/\/|youtu\.be|youtube\.com|instagram\.com/i.test(t);
  if (hasUrl) return false;
  const hasIntent = /\b(download|mp3|song|music|audio|gaana|gana|track|bajao|bhej|bhejo|send me|play)\b/i.test(t);
  if (!hasIntent) return false;
  // Strip intent words — remaining text should look like a song/artist name
  const stripped = t
    .replace(/\b(download|mp3|song|music|audio|gaana|gana|track|bajao|bhej|bhejo|send|play|me|the|a|an|please|plz|pls|kar|karo|bhai|mitr|yaar|bro|fast|jaldi|karo|de|do)\b/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .trim();
  return stripped.length > 2;
}

/** Strip intent/filler words to get the song query from a by-name request. */
export function extractSongQuery(text = "") {
  return String(text)
    .replace(/\b(download|mp3|mp4|audio|video|clip|send me|send|play|bajao|bhej|bhejo|gaana|gana|music|song|track|please|plz|pls|kar|karo|de de|dedo|de|do|fast|jaldi|in|as)\b/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .trim()
    .replace(/\s+/g, " ");
}
