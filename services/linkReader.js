/**
 * Link reader — fetches any public URL and returns clean readable text.
 * Uses Jina Reader (r.jina.ai) which handles JS-heavy sites, paywalls, and
 * social pages by rendering and extracting the meaningful content.
 *
 * Supported: X/Twitter, Reddit, Instagram (public), any product/article page,
 * news sites, GitHub, docs, YouTube (description/comments), etc.
 */

const MAX_CONTENT_CHARS = 4500;
const JINA_TIMEOUT_MS = 12_000;

const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;

/**
 * Extract all URLs from a text string.
 * @param {string} text
 * @returns {string[]} deduplicated list of URLs
 */
export function extractUrls(text) {
  const matches = String(text || "").match(URL_REGEX) || [];
  return [...new Set(matches)];
}

/**
 * Fetch a single URL via Jina Reader and return cleaned markdown text.
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function readLink(url) {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JINA_TIMEOUT_MS);
  try {
    const res = await fetch(jinaUrl, {
      headers: {
        Accept: "text/plain, text/markdown",
        "X-No-Cache": "true",
        "X-Return-Format": "markdown",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.text();
    return raw.trim().slice(0, MAX_CONTENT_CHARS);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read up to `maxLinks` URLs found in a message and return a formatted
 * context block ready to be injected into the AI prompt.
 *
 * @param {string} messageText
 * @param {number} [maxLinks=2]
 * @returns {Promise<string>} context block, or "" if no URLs / all failed
 */
export async function buildLinkContext(messageText, maxLinks = 2) {
  const urls = extractUrls(messageText).slice(0, maxLinks);
  if (urls.length === 0) return "";

  const results = await Promise.allSettled(urls.map((u) => readLink(u)));

  const blocks = [];
  for (let i = 0; i < urls.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && r.value && r.value.length > 100) {
      blocks.push(
        `[LINK ${i + 1}: ${urls[i]}]\n${r.value}\n[END LINK ${i + 1}]`
      );
    } else {
      const reason = r.status === "rejected" ? r.reason?.message : "empty or too-short response";
      console.warn(`[link-reader] Failed to read ${urls[i]}: ${reason}`);
      // Always include a note so the AI can relay it to the user
      blocks.push(
        `[LINK ${i + 1}: ${urls[i]}]\n` +
        `STATUS: Could not fetch this link. ` +
        `It is either a private/locked account, login-required page, or the site blocked access.\n` +
        `[END LINK ${i + 1}]`
      );
    }
  }

  return (
    `[LINK FETCH RESULTS]\n` +
    blocks.join("\n\n") +
    `\n[END LINK FETCH RESULTS]\n\n` +
    `INSTRUCTIONS: For each link above — if content was fetched, use it to answer the user. ` +
    `If a link shows STATUS: Could not fetch, tell the user clearly: ` +
    `"I couldn't read that link — it looks like a private account or the page requires login." ` +
    `Do not guess or make up content for unfetchable links.`
  );
}
