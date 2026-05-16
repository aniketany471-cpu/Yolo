/**
 * services/musicDownloader.js
 * Production-grade music downloader — no hardcoded paths, multi-strategy fallback.
 * Compatible with Railway, Render, Replit, Docker, VPS, Termux.
 * Pure ESM (matches project "type":"module"). No TypeScript.
 */

import { spawn, spawnSync } from "child_process";
import { createWriteStream } from "fs";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");

// ─── Binary detection cache ───────────────────────────────────────────────────
let _ytdlpPath = undefined; // undefined = not yet checked, null = not found
let _ffmpegPath = undefined;
let _hasPythonYtdlp = undefined;

function detectBinary(name) {
  // 1. Env override (YTDL_PATH for yt-dlp, FFMPEG_PATH for ffmpeg)
  const envKey = name === "yt-dlp" ? "YTDL_PATH" : name === "ffmpeg" ? "FFMPEG_PATH" : null;
  if (envKey && process.env[envKey]) {
    const p = process.env[envKey];
    if (fs.existsSync(p)) return p;
  }

  // 2. which / where
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const r = spawnSync(cmd, [name], { encoding: "utf8", timeout: 3000 });
    const found = r.stdout?.split("\n")[0]?.trim();
    if (found && fs.existsSync(found)) return found;
  } catch {}

  // 3. Common system paths
  const sysPaths = [
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
    `/bin/${name}`,
    `/opt/homebrew/bin/${name}`,
    `/opt/conda/bin/${name}`,
    `/home/user/.local/bin/${name}`,
    `${process.env.HOME || ""}/.local/bin/${name}`,
  ];
  for (const p of sysPaths) {
    if (p && fs.existsSync(p)) return p;
  }

  // 4. Bundled in node_modules (yt-dlp via youtube-dl-exec)
  if (name === "yt-dlp") {
    const bundled = [
      path.join(ROOT, "node_modules", "youtube-dl-exec", "bin", "yt-dlp"),
      path.join(ROOT, "node_modules", "youtube-dl-exec", "bin", "yt-dlp.exe"),
      path.join(ROOT, "node_modules", ".bin", "yt-dlp"),
    ];
    for (const p of bundled) {
      try {
        if (fs.existsSync(p)) {
          // Ensure executable permissions
          try { fs.chmodSync(p, 0o755); } catch {}
          return p;
        }
      } catch {}
    }
  }

  return null;
}

function checkPythonYtdlp() {
  try {
    const r = spawnSync("python3", ["-m", "yt_dlp", "--version"], {
      encoding: "utf8",
      timeout: 5000,
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

export function getYtdlpPath() {
  if (_ytdlpPath === undefined) _ytdlpPath = detectBinary("yt-dlp");
  return _ytdlpPath || null;
}

export function getFfmpegPath() {
  if (_ffmpegPath === undefined) _ffmpegPath = detectBinary("ffmpeg");
  return _ffmpegPath || null;
}

export function hasPythonYtdlp() {
  if (_hasPythonYtdlp === undefined) _hasPythonYtdlp = checkPythonYtdlp();
  return _hasPythonYtdlp;
}

// ─── Version helpers ──────────────────────────────────────────────────────────
function getBinaryVersion(binaryPath, versionArgs = ["--version"]) {
  try {
    const r = spawnSync(binaryPath, versionArgs, { encoding: "utf8", timeout: 5000 });
    return r.stdout?.split("\n")[0]?.trim() || null;
  } catch {
    return null;
  }
}

// ─── Startup diagnostics ──────────────────────────────────────────────────────
export function runStartupDiagnostics(addLog) {
  const info = (msg) => (addLog ? addLog(msg, "info") : console.log("[MusicDL]", msg));
  const warn = (msg) => (addLog ? addLog(msg, "warn") : console.warn("[MusicDL]", msg));

  const ytdlp = getYtdlpPath();
  const ffmpeg = getFfmpegPath();
  const python = hasPythonYtdlp();

  // yt-dlp
  if (ytdlp) {
    const ver = getBinaryVersion(ytdlp);
    info(`✓ yt-dlp detected: ${ytdlp}${ver ? ` (${ver})` : ""}`);
  } else if (python) {
    const ver = getBinaryVersion("python3", ["-m", "yt_dlp", "--version"]);
    warn(`⚠ yt-dlp binary not found — using python3 -m yt_dlp${ver ? ` (${ver})` : ""}`);
  } else {
    warn("⚠ yt-dlp not found — will use @distube/ytdl-core JS fallback (limited quality)");
  }

  // ffmpeg
  if (ffmpeg) {
    const ver = getBinaryVersion(ffmpeg, ["-version"]);
    info(`✓ ffmpeg detected: ${ffmpeg}${ver ? ` (${ver.split(" ").slice(0, 3).join(" ")})` : ""}`);
  } else {
    warn("⚠ ffmpeg not found — will download raw audio (m4a/webm), no mp3 conversion");
  }

  // Temp dir
  const musicTmp = path.join(ROOT, "exports", "music");
  try {
    fs.mkdirSync(musicTmp, { recursive: true });
    const testFile = path.join(musicTmp, ".write_test");
    fs.writeFileSync(testFile, "");
    fs.unlinkSync(testFile);
    info(`✓ temp directory writable: ${musicTmp}`);
  } catch (e) {
    warn(`⚠ temp directory not writable: ${musicTmp} — ${e.message}`);
  }

  const activeStrategy = ytdlp
    ? "yt-dlp binary"
    : python
    ? "python3 -m yt_dlp"
    : "@distube/ytdl-core JS";
  info(`✓ audio pipeline ready — active strategy: ${activeStrategy}`);
}

// ─── Diagnostics status (for API endpoint) ───────────────────────────────────
export function getDiagnosticsStatus() {
  const ytdlp = getYtdlpPath();
  const ffmpeg = getFfmpegPath();
  const python = hasPythonYtdlp();

  return {
    ytdlp: {
      ok: !!ytdlp,
      path: ytdlp,
      version: ytdlp ? getBinaryVersion(ytdlp) : null,
    },
    ffmpeg: {
      ok: !!ffmpeg,
      path: ffmpeg,
      version: ffmpeg ? getBinaryVersion(ffmpeg, ["-version"])?.split(" ").slice(0, 3).join(" ") : null,
    },
    python3YtDlp: {
      ok: python,
      version: python ? getBinaryVersion("python3", ["-m", "yt_dlp", "--version"]) : null,
    },
    activeStrategy: ytdlp
      ? "yt-dlp binary"
      : python
      ? "python3 -m yt_dlp"
      : "@distube/ytdl-core JS",
    tempDir: path.join(ROOT, "exports", "music"),
  };
}

// ─── Process spawner ──────────────────────────────────────────────────────────
function spawnProcess(cmd, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let stderr = "";
    let stdout = "";

    let proc;
    try {
      proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (spawnErr) {
      return reject(spawnErr);
    }

    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    proc.on("close", (code) => {
      const elapsed = Date.now() - start;
      if (code === 0) {
        resolve({ stdout, stderr, elapsed });
      } else {
        const err = new Error(`Process exited ${code}: ${stderr.slice(-500)}`);
        err.stdout = stdout;
        err.stderr = stderr;
        err.elapsed = elapsed;
        reject(err);
      }
    });

    proc.on("error", (err) => {
      err.stderr = stderr;
      err.elapsed = Date.now() - start;
      reject(err);
    });

    const timer = setTimeout(() => {
      try { proc.kill("SIGTERM"); } catch {}
      reject(new Error(`Download timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    proc.on("close", () => clearTimeout(timer));
  });
}

// ─── Filename sanitizer ───────────────────────────────────────────────────────
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/__+/g, "_")
    .slice(0, 120);
}

// ─── Find actual output file (yt-dlp may change extension) ───────────────────
function findOutputFile(requestedPath) {
  if (fs.existsSync(requestedPath)) return requestedPath;
  const base = requestedPath.replace(/\.[^.]+$/, "");
  for (const ext of [".mp3", ".m4a", ".webm", ".opus", ".ogg", ".wav"]) {
    const candidate = base + ext;
    if (fs.existsSync(candidate)) return candidate;
  }
  return requestedPath;
}

// ─── Build yt-dlp CLI args ────────────────────────────────────────────────────
function buildArgs(url, outputPath, opts = {}) {
  const { clientArgs, userAgent, format, cookies, ffmpegPath } = opts;
  const ffmpeg = ffmpegPath || getFfmpegPath();
  const canConvert = !!ffmpeg;

  const args = [
    url,
    "--no-playlist",
    "--no-check-certificates",
    "--geo-bypass",
    "--retries", "3",
    "--fragment-retries", "3",
    "--socket-timeout", "30",
    "--output", outputPath,
    "--no-warnings",
    "--quiet",
    "--no-part",
    "--progress",
  ];

  if (canConvert) {
    args.push("--extract-audio", "--audio-format", "mp3", "--audio-quality", "0");
    args.push("--ffmpeg-location", ffmpeg);
  } else {
    // No ffmpeg — download best audio-only stream without conversion
    args.push("-f", "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best[height<=144]");
  }

  if (clientArgs) args.push("--extractor-args", clientArgs);
  if (userAgent) args.push("--user-agent", userAgent);
  if (format && canConvert) args.push("-f", format);
  if (cookies && fs.existsSync(cookies)) args.push("--cookies", cookies);

  return args;
}

// ─── Strategy 1: yt-dlp binary ────────────────────────────────────────────────
async function strategyYtdlpBinary(url, outputPath, options, onLog) {
  const binary = getYtdlpPath();
  if (!binary) throw new Error("yt-dlp binary not available");

  const { cookies } = options;

  const clients = [
    {
      name: "ios",
      clientArgs: "youtube:player_client=ios",
      userAgent:
        "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iPhone OS 17_5_1 like Mac OS X;)",
      format: "bestaudio[ext=m4a]/bestaudio/best",
    },
    {
      name: "tv_embedded",
      clientArgs: "youtube:player_client=tv_embedded",
      format: "bestaudio/best",
    },
    {
      name: "mweb",
      clientArgs: "youtube:player_client=mweb",
      userAgent:
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
      format: "bestaudio/best",
    },
    {
      name: "web_creator",
      clientArgs: "youtube:player_client=web_creator",
      format: "bestaudio/best",
    },
  ];

  let lastErr;
  for (const client of clients) {
    try {
      onLog?.(`[musicDL] yt-dlp ${client.name} client...`);
      const args = buildArgs(url, outputPath, {
        clientArgs: client.clientArgs,
        userAgent: client.userAgent,
        format: client.format,
        cookies,
      });
      const { elapsed, stderr } = await spawnProcess(binary, args);
      if (stderr) onLog?.(`[musicDL] yt-dlp stderr: ${stderr.slice(0, 200)}`);
      const actualPath = findOutputFile(outputPath);
      onLog?.(
        `[musicDL] ✓ yt-dlp:${client.name} done in ${(elapsed / 1000).toFixed(1)}s → ${path.basename(actualPath)}`
      );
      return { filepath: actualPath, strategy: `yt-dlp:${client.name}`, elapsed };
    } catch (e) {
      onLog?.(`[musicDL] ${client.name} failed: ${e.message.slice(0, 120)}`);
      lastErr = e;
    }
  }
  throw lastErr || new Error("All yt-dlp clients failed");
}

// ─── Strategy 2: python3 -m yt_dlp ───────────────────────────────────────────
async function strategyPythonYtdlp(url, outputPath, options, onLog) {
  if (!hasPythonYtdlp()) throw new Error("python3 -m yt_dlp not available");

  const { cookies } = options;
  const ffmpeg = getFfmpegPath();
  const canConvert = !!ffmpeg;

  onLog?.("[musicDL] python3 -m yt_dlp fallback...");

  const args = [
    "-m", "yt_dlp",
    url,
    "--no-playlist",
    "--no-check-certificates",
    "--output", outputPath,
    "--quiet",
    "--no-part",
    "--retries", "3",
    "--socket-timeout", "30",
  ];

  if (canConvert) {
    args.push("--extract-audio", "--audio-format", "mp3", "--audio-quality", "0");
    args.push("--ffmpeg-location", ffmpeg);
  } else {
    args.push("-f", "bestaudio[ext=m4a]/bestaudio/best");
  }

  if (cookies && fs.existsSync(cookies)) args.push("--cookies", cookies);

  const { elapsed } = await spawnProcess("python3", args);
  const actualPath = findOutputFile(outputPath);
  onLog?.(
    `[musicDL] ✓ python3:yt_dlp done in ${(elapsed / 1000).toFixed(1)}s → ${path.basename(actualPath)}`
  );
  return { filepath: actualPath, strategy: "python3:yt_dlp", elapsed };
}

// ─── Strategy 3: @distube/ytdl-core (pure JS, no binary) ─────────────────────
async function strategyYtdlCore(url, outputPath, options, onLog) {
  onLog?.("[musicDL] @distube/ytdl-core JS fallback...");
  const start = Date.now();

  let ytdl;
  try {
    ytdl = (await import("@distube/ytdl-core")).default;
  } catch {
    throw new Error("@distube/ytdl-core not installed or not importable");
  }

  const vidId =
    url.match(/[?&]v=([^&]+)/)?.[1] || url.match(/youtu\.be\/([^?&]+)/)?.[1];
  if (!vidId) throw new Error("Cannot extract video ID — ytdl-core requires a YouTube URL");

  const cleanUrl = `https://www.youtube.com/watch?v=${vidId}`;

  let info;
  try {
    info = await ytdl.getInfo(cleanUrl);
  } catch (e) {
    throw new Error(`ytdl-core getInfo failed: ${e.message}`);
  }

  const format = ytdl.chooseFormat(info.formats, {
    quality: "highestaudio",
    filter: "audioonly",
  });

  if (!format) throw new Error("ytdl-core: no suitable audio format found");

  // Output as m4a since we can't convert without ffmpeg
  const actualPath = outputPath.replace(/\.mp3$/, `.${format.container || "m4a"}`);

  await new Promise((resolve, reject) => {
    const fileStream = createWriteStream(actualPath);
    const audioStream = ytdl(cleanUrl, { format });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { audioStream.destroy(); } catch {}
      try { fileStream.destroy(); } catch {}
      reject(new Error("ytdl-core timeout after 90s"));
    }, 90000);

    audioStream.on("error", (e) => { clearTimeout(timer); reject(e); });
    fileStream.on("error", (e) => { clearTimeout(timer); reject(e); });
    fileStream.on("finish", () => {
      clearTimeout(timer);
      if (!timedOut) resolve();
    });

    audioStream.pipe(fileStream);
  });

  const elapsed = Date.now() - start;
  onLog?.(
    `[musicDL] ✓ ytdl-core done in ${(elapsed / 1000).toFixed(1)}s → ${path.basename(actualPath)}`
  );
  return {
    filepath: actualPath,
    strategy: "ytdl-core",
    elapsed,
    warning: "Raw audio (no ffmpeg) — format may be m4a/webm instead of mp3",
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * downloadAudio(url, outputPath, options)
 *
 * @param {string} url         YouTube URL or search-result URL
 * @param {string} outputPath  Desired output path (e.g. /app/exports/music/music_abc.mp3)
 * @param {object} options     { cookies?: string, onLog?: fn, timeoutMs?: number }
 * @returns {{ filepath, strategy, elapsed, warning? }}
 */
export async function downloadAudio(url, outputPath, options = {}) {
  const { onLog, cookies, timeoutMs } = options;

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // Normalize URL — always use clean v= form to avoid token/param issues
  const vidId =
    url.match(/[?&]v=([^&]+)/)?.[1] || url.match(/youtu\.be\/([^?&]+)/)?.[1];
  const cleanUrl = vidId ? `https://www.youtube.com/watch?v=${vidId}` : url;

  const opts = { cookies, timeoutMs };

  const strategies = [
    () => strategyYtdlpBinary(cleanUrl, outputPath, opts, onLog),
    () => strategyPythonYtdlp(cleanUrl, outputPath, opts, onLog),
    () => strategyYtdlCore(cleanUrl, outputPath, opts, onLog),
  ];

  let lastErr;
  for (const strategy of strategies) {
    try {
      const result = await strategy();
      // Verify the file actually exists and has content
      if (!fs.existsSync(result.filepath)) {
        throw new Error(`Output file not found after download: ${result.filepath}`);
      }
      const stat = fs.statSync(result.filepath);
      if (stat.size < 1024) {
        fs.unlinkSync(result.filepath);
        throw new Error(`Output file too small (${stat.size} bytes) — download likely failed`);
      }
      return result;
    } catch (e) {
      onLog?.(`[musicDL] Strategy failed: ${e.message.slice(0, 200)}`);
      lastErr = e;
    }
  }

  throw new Error(
    `❌ All download strategies failed.\nLast error: ${lastErr?.message || "unknown"}\n` +
    `Ensure yt-dlp is installed: https://github.com/yt-dlp/yt-dlp#installation`
  );
}

export { sanitizeFilename };
