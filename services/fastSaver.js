// ─────────────────────────────────────────────────────────────────────────────
// FastSaver API wrapper  —  https://api.fastsaver.io/v1
//
// Confirmed working endpoints (tested 2026-07-16):
//   GET  /youtube/info?url=...         → video info + available formats
//   GET  /youtube/search?query=...&page=1 → music search results
//   POST /youtube/download  {url, format} → {ok, download_url}  (tunnel, ~60s TTL)
//
// format values: "audio" | "144p" | "240p" | "360p" | "480p" | "720p" | "1080p"
// ─────────────────────────────────────────────────────────────────────────────

import https from "node:https";
import http from "node:http";
import fs from "fs-extra";
import path from "node:path";

const BASE = "https://api.fastsaver.io/v1";

function apiFetch(urlStr, { method = "GET", body = null, apiKey } = {}) {
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
        "User-Agent": "Donna-Bot/1.0",
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
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("FastSaver API timeout")); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/** Fetch YouTube video info (title, author, duration, available formats + file sizes) */
export async function ytInfo(url, apiKey) {
  const res = await apiFetch(`${BASE}/youtube/info?url=${encodeURIComponent(url)}`, { apiKey });
  if (res.status !== 200 || !res.body?.ok) throw new Error(`ytInfo failed: ${JSON.stringify(res.body).slice(0, 120)}`);
  return res.body;
}

/** Search YouTube by query (music/song name). Returns array of results. */
export async function ytSearch(query, apiKey) {
  const res = await apiFetch(`${BASE}/youtube/search?query=${encodeURIComponent(query)}&page=1`, { apiKey });
  if (res.status !== 200 || !res.body?.ok) throw new Error(`ytSearch failed: ${JSON.stringify(res.body).slice(0, 120)}`);
  return res.body.results || [];
}

/** Get a tunnel download URL for a YouTube video/audio.
 *  format: "audio" | "144p" | "240p" | "360p" | "480p" | "720p" | "1080p"
 *  Returns the tunnel URL string (valid ~60s — use immediately). */
export async function ytDownloadUrl(url, format, apiKey) {
  const res = await apiFetch(`${BASE}/youtube/download`, {
    method: "POST",
    body: { url, format },
    apiKey,
  });
  if (res.status !== 200 || !res.body?.ok || !res.body?.download_url) {
    throw new Error(`ytDownloadUrl failed: ${JSON.stringify(res.body).slice(0, 120)}`);
  }
  return res.body.download_url;
}

/** Stream a tunnel URL to a local file. Returns file size in bytes. */
export async function streamToFile(tunnelUrl, destPath) {
  await fs.ensureDir(path.dirname(destPath));
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, redirects = 0) => {
      if (redirects > 5) return reject(new Error("Too many redirects"));
      const url = new URL(currentUrl);
      const lib = url.protocol === "https:" ? https : http;
      lib.get(currentUrl, { headers: { "User-Agent": "Donna-Bot/1.0" }, timeout: 120000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return follow(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`Tunnel download failed: HTTP ${res.statusCode}`));
        }
        const out = fs.createWriteStream(destPath);
        res.pipe(out);
        out.on("finish", () => resolve(out.bytesWritten));
        out.on("error", reject);
        res.on("error", reject);
      }).on("error", reject).on("timeout", () => reject(new Error("Stream download timed out")));
    };
    follow(tunnelUrl);
  });
}

/** Pick best video format that fits within maxMb (default 45MB). Falls back to lower quality. */
export function pickVideoFormat(formats, maxMb = 45) {
  const maxBytes = maxMb * 1024 * 1024;
  const order = ["720p", "480p", "360p", "240p", "144p"];
  for (const fmt of order) {
    const f = formats.find((x) => x.format === fmt && x.type === "video");
    if (f && f.filesize && f.filesize <= maxBytes) return fmt;
    if (f && !f.filesize) return fmt; // no size info, try anyway
  }
  return "360p"; // last resort
}

/** Check if message text contains a YouTube URL */
export function extractYouTubeUrl(text = "") {
  const m = String(text).match(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})[^\s]*/i
  );
  if (!m) return null;
  const raw = m[0];
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

/** Check if message text contains an Instagram URL */
export function extractInstagramUrl(text = "") {
  const m = String(text).match(
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)[^\s]*/i
  );
  if (!m) return null;
  const raw = m[0];
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

/** Returns true if message sounds like a music/song download request (no URL needed) */
export function isMusicByNameRequest(text = "") {
  const t = String(text).toLowerCase();
  // Must have at least one download/play intent word
  const hasIntent = /\b(download|mp3|song|music|audio|send me|play|gaana|gana|track|bajao|de de|bhej|bhejo)\b/i.test(t);
  // Must NOT already contain a YouTube/Instagram URL (that case is handled separately)
  const hasUrl = /https?:\/\/|youtu\.be|youtube\.com|instagram\.com/i.test(t);
  if (!hasIntent || hasUrl) return false;
  // Must have at least some non-intent content that could be a song name (> 3 words total or > 15 chars)
  const stripped = t.replace(/\b(download|mp3|song|music|audio|send|play|gaana|gana|track|bajao|de|bhej|bhejo|me|the|a|an|please|plz|pls|kar|karo|bhai|mitr|yaar|bro)\b/gi, "").trim();
  return stripped.length > 3;
}

/** Extract the song/artist name from a download-by-name request */
export function extractSongQuery(text = "") {
  return text
    .replace(/\b(download|mp3|audio|send me|send|play|bajao|bhej|bhejo|gaana|gana|music|song|track|please|plz|pls|kar|karo|de de|de)\b/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .trim()
    .replace(/\s+/g, " ");
}
