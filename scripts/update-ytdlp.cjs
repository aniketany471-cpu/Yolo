#!/usr/bin/env node
// Runs via postinstall on every Render build.
// Directly downloads the latest yt-dlp binary from GitHub releases
// (more reliable than yt-dlp -U which fails when the binary is read-only).
const https = require("https");
const fs    = require("fs");
const path  = require("path");
const { execSync } = require("child_process");

const binPath = path.resolve(__dirname, "../node_modules/youtube-dl-exec/bin/yt-dlp");

function download(url, dest, hops) {
  hops = hops || 0;
  return new Promise(function(resolve, reject) {
    if (hops > 6) return reject(new Error("Too many redirects"));
    https.get(url, { headers: { "User-Agent": "node" } }, function(res) {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location, dest, hops + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error("HTTP " + res.statusCode + " from " + url));
      }
      var file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", function() { file.close(resolve); });
      file.on("error", reject);
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function main() {
  if (!fs.existsSync(binPath)) {
    console.warn("[update-ytdlp] Binary not found at", binPath, "— skipping");
    return;
  }

  // Log current version
  try {
    var before = execSync(binPath + " --version", { encoding: "utf8" }).trim();
    console.log("[update-ytdlp] Current yt-dlp version:", before);
  } catch (e) {
    console.warn("[update-ytdlp] Could not read current version:", e.message);
  }

  var tmpPath = binPath + ".new";
  // GitHub releases: latest/download redirects to actual release asset
  var url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

  try {
    console.log("[update-ytdlp] Downloading latest yt-dlp binary...");
    await download(url, tmpPath);
    fs.chmodSync(tmpPath, 0o755);
    fs.renameSync(tmpPath, binPath);
    var after = execSync(binPath + " --version", { encoding: "utf8" }).trim();
    console.log("[update-ytdlp] Updated to:", after);
    console.log("[update-ytdlp] Done — yt-dlp is now up to date.");
  } catch (err) {
    console.warn("[update-ytdlp] Direct download failed:", err.message);
    // Try the self-update flag as a fallback
    try {
      console.log("[update-ytdlp] Trying yt-dlp -U as fallback...");
      execSync(binPath + " -U", { stdio: "inherit", timeout: 120000 });
    } catch (e2) {
      console.warn("[update-ytdlp] Fallback also failed (non-fatal):", e2.message);
    }
    // Clean up temp file if left behind
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
}

main().catch(function(e) {
  console.warn("[update-ytdlp] Unexpected error (non-fatal):", e.message);
});