import { spawn } from "child_process";
import path from "path";
import fs from "fs-extra";

const SUPPORTED_HOSTS = ["youtube.com", "youtu.be", "instagram.com"];
const URL_RE = /https?:\/\/[^\s<>()]+|(?:www\.)?(?:youtube\.com|youtu\.be|instagram\.com)\/[^\s<>()]+/gi;

export const VIDEO_DOWNLOADER_MESSAGES = {
  downloading: "Tham ja zara mitr 😭\n\nvideo kheech raha hu...",
  success: "Le mitr 😎🔥",
  failure: "Are mitr 😭\n\nyo video download na ho payi.",
};

function normalizeUrlCandidate(candidate) {
  const trimmed = String(candidate || "").trim().replace(/[),.]+$/g, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function extractUrls(text = "") {
  return Array.from(String(text || "").matchAll(URL_RE), (m) => normalizeUrlCandidate(m[0])).filter(Boolean);
}

export function isSupportedVideoUrl(rawUrl = "") {
  try {
    const url = new URL(normalizeUrlCandidate(rawUrl));
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!SUPPORTED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return false;

    if (host === "youtu.be" || host.endsWith(".youtu.be")) {
      return url.pathname.split("/").filter(Boolean).length >= 1;
    }

    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      return url.pathname === "/watch" && url.searchParams.has("v") || url.pathname.startsWith("/shorts/");
    }

    if (host === "instagram.com" || host.endsWith(".instagram.com")) {
      return url.pathname.startsWith("/reel/") || url.pathname.startsWith("/p/");
    }
  } catch (_) {
    return false;
  }
  return false;
}

export function extractSupportedVideoUrl(text = "") {
  const urls = extractUrls(text);
  return urls.find((url) => isSupportedVideoUrl(url)) || null;
}

export function hasDownloaderIntent(text = "") {
  const t = String(text || "");
  // "download" as a prefix catches "downloadker", "downloadkaro", "downloadkr", etc. (Hinglish variants)
  if (/\bdownload\w*/i.test(t)) return true;
  // Explicit standalone keywords
  if (/(^|\s)(save|dl)(\s|$)/i.test(t)) return true;
  // Hinglish intent phrases around media words
  if (/\b(reel|video|mp4|mp3)\b.{0,30}\b(lelo|le\s*lo|karo|karna|bhej|bhejo|send|chahiye|dedo|de\s*do)\b/i.test(t)) return true;
  if (/\b(lelo|le\s*lo|bhej|bhejo|send|dedo|de\s*do).{0,30}\b(reel|video|mp4|mp3)\b/i.test(t)) return true;
  return false;
}

function waitForProcess(cmd, args, { cwd, timeoutMs, onLog } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const timer = setTimeout(() => {
      try { proc.kill("SIGTERM"); } catch (_) {}
      setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch (_) {}
      }, 2500).unref?.();
      finish(reject, new Error(`yt-dlp timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    proc.stdout.on("data", (d) => {
      const chunk = d.toString();
      stdout += chunk;
      onLog?.(chunk.trim());
    });
    proc.stderr.on("data", (d) => {
      const chunk = d.toString();
      stderr += chunk;
      onLog?.(chunk.trim());
    });
    proc.on("close", (code) => {
      if (code === 0) return finish(resolve, { stdout, stderr });
      const err = new Error((stderr || stdout || `yt-dlp exited with code ${code}`).slice(-1000));
      err.stdout = stdout;
      err.stderr = stderr;
      finish(reject, err);
    });
    proc.on("error", (err) => finish(reject, err));
  });
}

async function findDownloadedVideo(workDir) {
  const entries = await fs.readdir(workDir);
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(workDir, entry);
    const stat = await fs.stat(filePath).catch(() => null);
    if (stat?.isFile()) files.push({ path: filePath, size: stat.size, mtimeMs: stat.mtimeMs });
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const VIDEO_EXTS = /\.(mp4|mkv|webm|mov|avi|flv|m4v)$/i;
  const SKIP_EXTS = /\.(part|ytdl|temp|tmp|fdash|m4a|mp3|ogg|wav|aac|opus|f\d+)$/i;
  return (
    files.find((f) => VIDEO_EXTS.test(f.path) && f.size > 0) ||
    files.find((f) => !SKIP_EXTS.test(f.path) && f.size > 0) ||
    null
  );
}

export async function downloadAudioWithYtDlp({
  url,
  ytdlpPath,
  ffmpegPath,
  outputRoot,
  cookiesPath,
  timeoutMs = 120000,
  onLog,
}) {
  if (!ytdlpPath) throw new Error("yt-dlp binary is not available");

  const jobId = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const workDir = path.join(outputRoot, jobId);
  await fs.ensureDir(workDir);

  const isYouTube = /youtu\.?be/.test(url);
  const hasCookies = cookiesPath && await fs.pathExists(cookiesPath);

  const baseArgs = [
    "--no-playlist",
    "--restrict-filenames",
    "--newline",
    "--retries", "3",
    "--fragment-retries", "3",
    "--socket-timeout", "25",
    "--no-check-certificates",
    "-f", "bestaudio[ext=m4a]/bestaudio/best",
    "--extract-audio",
    "--audio-format", "mp3",
    "--audio-quality", "0",
    "-o", path.join(workDir, "audio_%(title)s.%(ext)s"),
  ];
  if (ffmpegPath) baseArgs.push("--ffmpeg-location", ffmpegPath);
  if (process.env.YOUTUBE_PROXY) baseArgs.push("--proxy", process.env.YOUTUBE_PROXY);

  // Strategy order (Render-compatible, no bgutil/PO token needed):
  //   1. android           -- native API, no PO token, no sig challenge (confirmed working 2026)
  //   2. android_testsuite -- alternate android variant
  //   3. ios               -- Apple API, no PO token
  //   4. tv_embedded       -- TV player, no PO token
  //   5. web_embedded      -- embedded web player fallback
  const strategies = [];
  if (isYouTube) {
    strategies.push({ name: "android", args: [...baseArgs, "--extractor-args", "youtube:player_client=android", "--user-agent", "com.google.android.youtube/19.44.34 (Linux; U; Android 14) gzip", "--sleep-interval", "1", "--max-sleep-interval", "4", url] });
    strategies.push({ name: "android_testsuite", args: [...baseArgs, "--extractor-args", "youtube:player_client=android_testsuite", "--sleep-interval", "1", "--max-sleep-interval", "4", url] });
    strategies.push({ name: "ios", args: [...baseArgs, "--extractor-args", "youtube:player_client=ios", "--user-agent", "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iPhone OS 17_5_1 like Mac OS X;)", "--sleep-interval", "1", "--max-sleep-interval", "4", url] });
    strategies.push({ name: "tv_embedded", args: [...baseArgs, "--extractor-args", "youtube:player_client=tv_embedded", "--sleep-interval", "2", "--max-sleep-interval", "5", url] });
    { const w = [...baseArgs, "--extractor-args", "youtube:player_client=web_embedded", "--sleep-interval", "2", "--max-sleep-interval", "5"]; if (hasCookies) w.push("--cookies", cookiesPath); w.push(url); strategies.push({ name: "web_embedded", args: w }); }
  } else {
    const args = [...baseArgs, url];
    if (hasCookies) args.splice(-1, 0, "--cookies", cookiesPath);
    strategies.push({ name: "default", args });
  }

  let lastError;
  for (const strategy of strategies) {
    try {
      onLog?.(`[musicDL] Trying ${strategy.name}...`);
      await waitForProcess(ytdlpPath, strategy.args, { cwd: workDir, timeoutMs, onLog });
      const entries = await fs.readdir(workDir);
      const mp3 = entries.find((e) => e.endsWith(".mp3"));
      if (!mp3) throw new Error("No MP3 file found after download");
      const filePath = path.join(workDir, mp3);
      const stat = await fs.stat(filePath);
      if (stat.size === 0) throw new Error("Downloaded MP3 is empty");
      return { filePath, size: stat.size, workDir };
    } catch (error) {
      onLog?.(`[musicDL] ${strategy.name} failed: ${error.message?.slice(0, 150)}`);
      lastError = error;
      // Remove partial files before next attempt
      const entries = await fs.readdir(workDir).catch(() => []);
      for (const e of entries) await fs.remove(path.join(workDir, e)).catch(() => {});
    }
  }

  await fs.remove(workDir).catch(() => {});
  throw lastError || new Error("All audio download strategies failed");
}

export async function downloadVideoWithYtDlp({
  url,
  ytdlpPath,
  ffmpegPath,
  outputRoot,
  cookiesPath,
  maxFileSizeMb = 50,
  timeoutMs = 180000,
  onLog,
}) {
  if (!isSupportedVideoUrl(url)) throw new Error("Unsupported video URL");
  if (!ytdlpPath) throw new Error("yt-dlp binary is not available");

  const jobId = `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const workDir = path.join(outputRoot, jobId);
  await fs.ensureDir(workDir);

  const maxBytes = Math.max(1, Number(maxFileSizeMb) || 50) * 1024 * 1024;
  const isYouTube = /youtu\.?be/.test(url);
  const hasCookies = cookiesPath && await fs.pathExists(cookiesPath);

  const baseArgs = [
    "--no-playlist",
    "--restrict-filenames",
    "--newline",
    "--retries", "3",
    "--fragment-retries", "3",
    "--socket-timeout", "25",
    "--no-check-certificates",
    "--max-filesize", `${Math.max(1, Number(maxFileSizeMb) || 50)}M`,
    "--merge-output-format", "mp4",
    "-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720][ext=mp4]/best[height<=720]/best",
    "--format-sort", "vcodec:h264,ext:mp4:m4a,res:720,br",
    "-o", path.join(workDir, "video_%(id)s.%(ext)s"),
  ];
  if (ffmpegPath) baseArgs.push("--ffmpeg-location", ffmpegPath);
  if (process.env.YOUTUBE_PROXY) baseArgs.push("--proxy", process.env.YOUTUBE_PROXY);

  // Strategy order (Render-compatible, no bgutil/PO token needed):
  //   1. android           -- native API, no PO token, no sig challenge (confirmed working 2026)
  //   2. android_testsuite -- alternate android variant
  //   3. ios               -- Apple API, no PO token
  //   4. tv_embedded       -- TV player, no PO token
  //   5. web_embedded      -- embedded web player fallback
  const strategies = [];
  if (isYouTube) {
    strategies.push({ name: "android", args: [...baseArgs, "--extractor-args", "youtube:player_client=android", "--user-agent", "com.google.android.youtube/19.44.34 (Linux; U; Android 14) gzip", "--sleep-interval", "1", "--max-sleep-interval", "4", url] });
    strategies.push({ name: "android_testsuite", args: [...baseArgs, "--extractor-args", "youtube:player_client=android_testsuite", "--sleep-interval", "1", "--max-sleep-interval", "4", url] });
    strategies.push({ name: "ios", args: [...baseArgs, "--extractor-args", "youtube:player_client=ios", "--user-agent", "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iPhone OS 17_5_1 like Mac OS X;)", "--sleep-interval", "1", "--max-sleep-interval", "4", url] });
    strategies.push({ name: "tv_embedded", args: [...baseArgs, "--extractor-args", "youtube:player_client=tv_embedded", "--sleep-interval", "2", "--max-sleep-interval", "5", url] });
    { const w = [...baseArgs, "--extractor-args", "youtube:player_client=web_embedded", "--sleep-interval", "2", "--max-sleep-interval", "5"]; if (hasCookies) w.push("--cookies", cookiesPath); w.push(url); strategies.push({ name: "web_embedded", args: w }); }
  } else {
    // Non-YouTube (Instagram etc.)
    const args = [...baseArgs, url];
    if (hasCookies) args.splice(-1, 0, "--cookies", cookiesPath);
    strategies.push({ name: "default", args });
  }

  let lastError;
  for (const strategy of strategies) {
    try {
      onLog?.(`[videoDL] Trying ${strategy.name}...`);
      await waitForProcess(ytdlpPath, strategy.args, { cwd: workDir, timeoutMs, onLog });
      const file = await findDownloadedVideo(workDir);
      if (!file) throw new Error("No downloaded video file found");
      if (file.size <= 0) throw new Error("Downloaded video is empty");
      if (file.size > maxBytes) throw new Error(`Downloaded video exceeds ${maxFileSizeMb} MB limit`);
      return { filePath: file.path, size: file.size, workDir };
    } catch (error) {
      onLog?.(`[videoDL] ${strategy.name} failed: ${error.message?.slice(0, 150)}`);
      lastError = error;
      const entries = await fs.readdir(workDir).catch(() => []);
      for (const e of entries) await fs.remove(path.join(workDir, e)).catch(() => {});
    }
  }

  await fs.remove(workDir).catch(() => {});
  throw lastError || new Error("All video download strategies failed");
}
