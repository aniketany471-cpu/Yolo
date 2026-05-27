/**
 * Link reader — fetches any public URL and returns clean readable text.
 * Uses Jina Reader (r.jina.ai) as the primary engine.
 *
 * Special handling for sites that block Jina:
 *   - Reddit: URL-slug parsing + oEmbed fallback (Reddit blocks all server IPs)
 *   - Others: detect blocked pages and give honest status instead of wrong error
 */

const MAX_CONTENT_CHARS = 4500;
const JINA_TIMEOUT_MS = 12_000;

const URL_REGEX =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;

/**
 * Extract all URLs from a text string.
 */
export function extractUrls(text) {
  const matches = String(text || "").match(URL_REGEX) || [];
  return [...new Set(matches)];
}

/**
 * Returns true if Jina returned a block/auth page rather than real content.
 */
function isBlockedContent(text) {
  if (!text || text.length > 5000) return false; // large responses are usually real
  const low = text.toLowerCase();
  return (
    low.includes("whoa there, pardner") ||
    low.includes("your request has been blocked") ||
    low.includes("you've been blocked by network security") ||
    low.includes("you need to log in") ||
    low.includes("please log in") ||
    low.includes("sign in to continue") ||
    (low.includes("403") && low.includes("forbidden") && text.length < 2000) ||
    (low.includes("login") && low.includes("blocked") && text.length < 2000) ||
    (low.includes("challenge") && text.length < 1500)
  );
}

/**
 * Strip UTM and tracking query parameters from a URL, keeping only the path.
 */
function stripTrackingParams(urlStr) {
  try {
    const u = new URL(urlStr);
    const TRACKING = ["utm_source", "utm_medium", "utm_campaign", "utm_term",
                      "utm_content", "utm_name", "fbclid", "gclid", "ref",
                      "share_id", "igshid", "s", "si"];
    TRACKING.forEach((p) => u.searchParams.delete(p));
    return u.toString();
  } catch {
    return urlStr;
  }
}

/**
 * Parse a Reddit URL into its components.
 * Returns null if not a Reddit URL.
 */
function parseRedditUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (!u.hostname.includes("reddit.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    // /r/{sub}/comments/{id}/{slug}/
    if (parts[0] !== "r" || parts[2] !== "comments") return null;
    const subreddit = parts[1] || null;
    const postId = parts[3] || null;
    const slug = parts[4] || null;
    const readableTitle = slug
      ? slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : null;
    return { subreddit, postId, readableTitle };
  } catch {
    return null;
  }
}

/**
 * Try Reddit oEmbed API — sometimes works, returns post title + author.
 */
async function fetchRedditOembed(cleanUrl) {
  try {
    const oembedUrl =
      "https://www.reddit.com/oembed?url=" + encodeURIComponent(cleanUrl);
    const res = await fetch(oembedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; telegrambot/1.0)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    if (!text.startsWith("{")) return null; // got HTML block page
    const data = JSON.parse(text);
    if (!data.author_name) return null;
    // Parse the HTML embed to extract title
    const titleMatch = data.html?.match(/>([^<]+)<\/a>/);
    const title = titleMatch ? titleMatch[1].trim() : null;
    return { author: data.author_name, title, providerName: data.provider_name };
  } catch {
    return null;
  }
}

/**
 * Fetch a Reddit URL — uses URL parsing + oEmbed since Reddit blocks Jina.
 */
async function readRedditUrl(urlStr) {
  const cleanUrl = stripTrackingParams(urlStr);
  const info = parseRedditUrl(cleanUrl);

  // Try oEmbed for extra metadata
  const oembed = await fetchRedditOembed(cleanUrl);

  const title = oembed?.title || info?.readableTitle || "unknown title";
  const author = oembed?.author || "unknown";
  const sub = info?.subreddit ? `r/${info.subreddit}` : "Reddit";

  return (
    `[Reddit post — partial info only, Reddit blocks external reading]\n` +
    `Subreddit: ${sub}\n` +
    `Title: ${title}\n` +
    `Author: u/${author}\n` +
    `Post ID: ${info?.postId || "unknown"}\n` +
    `URL: ${cleanUrl}\n\n` +
    `Note: Reddit prevents reading post body and comments from external services. ` +
    `Only title and author are available above.`
  );
}

/**
 * Fetch a single URL via Jina Reader and return cleaned text.
 * Falls back to URL-parsing for blocked sites.
 */
export async function readLink(url) {
  const cleanUrl = stripTrackingParams(url);

  // Reddit-specific handler (Reddit blocks Jina from all server IPs)
  const redditInfo = parseRedditUrl(cleanUrl);
  if (redditInfo) {
    return readRedditUrl(url);
  }

  // General Jina fetch
  const jinaUrl = `https://r.jina.ai/${cleanUrl}`;
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
    const raw = await res.text();
    if (isBlockedContent(raw)) {
      throw new Error("BLOCKED");
    }
    return raw.trim().slice(0, MAX_CONTENT_CHARS);
  } catch (e) {
    if (e.message === "BLOCKED") throw new Error("BLOCKED");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read up to `maxLinks` URLs found in a message and return a formatted
 * context block ready to be injected into the AI prompt.
 */
export async function buildLinkContext(messageText, maxLinks = 2) {
  const urls = extractUrls(messageText).slice(0, maxLinks);
  if (urls.length === 0) return "";

  const results = await Promise.allSettled(urls.map((u) => readLink(u)));

  const blocks = [];
  for (let i = 0; i < urls.length; i++) {
    const r = results[i];
    const url = urls[i];
    const redditInfo = parseRedditUrl(stripTrackingParams(url));

    if (r.status === "fulfilled" && r.value && r.value.length > 80) {
      blocks.push(`[LINK ${i + 1}: ${url}]\n${r.value}\n[END LINK ${i + 1}]`);
    } else {
      const reason = r.status === "rejected" ? r.reason?.message : "empty response";
      console.warn(`[link-reader] Failed to read ${url}: ${reason}`);

      let statusMsg;
      if (redditInfo) {
        // Reddit-specific: give what we know from the URL itself
        statusMsg =
          `STATUS: Reddit blocks external reading from servers. ` +
          `From the URL: this is a post in r/${redditInfo.subreddit}` +
          (redditInfo.readableTitle ? ` titled "${redditInfo.readableTitle}"` : "") +
          `. Post ID: ${redditInfo.postId}. ` +
          `Post body and comments are not accessible without Reddit login.`;
      } else if (reason === "BLOCKED") {
        statusMsg =
          `STATUS: This page blocked external reading (login required or access restricted). ` +
          `The site actively prevents bots from reading it.`;
      } else {
        statusMsg =
          `STATUS: Could not fetch this link (${reason}). ` +
          `It may be a private page, require login, or the site blocked access.`;
      }

      blocks.push(`[LINK ${i + 1}: ${url}]\n${statusMsg}\n[END LINK ${i + 1}]`);
    }
  }

  return (
    `[LINK FETCH RESULTS]\n` +
    blocks.join("\n\n") +
    `\n[END LINK FETCH RESULTS]\n\n` +
    `INSTRUCTIONS:\n` +
    `- If link content was successfully fetched: use it to answer the user directly.\n` +
    `- If a link shows STATUS with Reddit info: tell the user Reddit blocks external reading, ` +
    `then share the post title/subreddit you extracted and say they'd need to open it directly.\n` +
    `- If a link shows STATUS with blocked/restricted: tell the user clearly and honestly. ` +
    `Do NOT say "private account" unless the URL structure suggests it's a private profile.\n` +
    `- Never make up or guess content for links that could not be fetched.`
  );
}
