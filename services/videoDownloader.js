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
  return /(^|\s)(download|save|yt|youtube|ig|insta|instagram|reel|video)(\s|$)/i.test(String(text || ""));
}

function waitForProcess(cmd, args, { cwd, timeoutMs, onLog } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
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
  return files.find((f) => !/\.(part|ytdl|temp|tmp)$/i.test(f.path)) || null;
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
  const args = [
    "--no-playlist",
    "--restrict-filenames",
    "--newline",
    "--retries", "2",
    "--fragment-retries", "2",
    "--socket-timeout", "20",
    "--max-filesize", `${Math.max(1, Number(maxFileSizeMb) || 50)}M`,
    "--merge-output-format", "mp4",
    "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo*+bestaudio/best[ext=mp4]/best",
    "-o", path.join(workDir, "video_%(id)s.%(ext)s"),
  ];

  if (ffmpegPath) args.push("--ffmpeg-location", ffmpegPath);
  if (cookiesPath && await fs.pathExists(cookiesPath)) args.push("--cookies", cookiesPath);
  args.push(url);

  try {
    await waitForProcess(ytdlpPath, args, { cwd: workDir, timeoutMs, onLog });
    const file = await findDownloadedVideo(workDir);
    if (!file) throw new Error("No downloaded video file found");
    if (file.size <= 0) throw new Error("Downloaded video is empty");
    if (file.size > maxBytes) {
      throw new Error(`Downloaded video exceeds ${maxFileSizeMb} MB limit`);
    }
    return { filePath: file.path, size: file.size, workDir };
  } catch (error) {
    await fs.remove(workDir).catch(() => {});
    throw error;
  }
}
