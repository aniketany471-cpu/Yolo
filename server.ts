import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { GoogleGenAI } from "@google/genai";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import multer from "multer";
import sharp from "sharp";
import fs from "fs-extra";
import yts from "yt-search";
import youtubedl from "youtube-dl-exec";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const exportsDir = path.join(__dirname, "exports");
fs.ensureDirSync(exportsDir);
const musicDir = path.join(exportsDir, "music");
fs.ensureDirSync(musicDir);
const tempDir = path.join(__dirname, "temp");
fs.ensureDirSync(tempDir);
const cookiesDir = path.join(__dirname, "cookies");
fs.ensureDirSync(cookiesDir);
const youtubeCookiesPath = path.join(cookiesDir, "youtube.txt");

const upload = multer({ dest: tempDir });

// Writes youtube_cookies from DB to disk so yt-dlp can use them
function syncCookiesToDisk() {
  try {
    const row = db.prepare("SELECT youtube_cookies FROM config WHERE id = 1").get() as { youtube_cookies?: string };
    const cookieText = row?.youtube_cookies || "";
    if (cookieText.trim()) {
      fs.outputFileSync(youtubeCookiesPath, cookieText);
      console.log(`[cookies] Wrote youtube.txt to disk (${cookieText.length} bytes)`);
    } else {
      if (fs.existsSync(youtubeCookiesPath)) fs.removeSync(youtubeCookiesPath);
      console.log("[cookies] No cookies in DB — youtube.txt removed.");
    }
  } catch (e) {
    console.error("[cookies] Failed to sync cookies to disk:", e);
  }
}

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT: " + err.stack);
});
process.on("unhandledRejection", (err: any) => {
  console.error("UNHANDLED: " + (err?.stack || err));
});

// Initialize SQLite DB
const db = new Database(path.join(__dirname, "bot_database.sqlite"));
db.pragma("journal_mode = WAL");

// Setup Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    text TEXT,
    createdAt INTEGER
  );
  
  CREATE TABLE IF NOT EXISTS targets (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT
  );
  
  CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY,
    minDelaySeconds INTEGER,
    maxDelaySeconds INTEGER,
    adminUsers TEXT,
    sudoUsers TEXT DEFAULT '',
    isRunning INTEGER,
    youtube_cookies TEXT,
    telegramApiId TEXT,
    telegramApiHash TEXT,
    telegramStringSession TEXT,
    globalCooldown INTEGER DEFAULT 3,
    perUserCooldown INTEGER DEFAULT 10,
    maxConcurrentTasks INTEGER DEFAULT 2,
    aiEnabled INTEGER DEFAULT 1,
    aiProvider TEXT DEFAULT 'gemini',
    geminiKey TEXT,
    groqKey TEXT,
    openRouterKey TEXT,
    autoDeleteCommands INTEGER DEFAULT 1,
    autoDeleteDelay INTEGER DEFAULT 0,
    autoDeleteWhitelist TEXT DEFAULT '',
    autoReplyDM INTEGER DEFAULT 0,
    autoReplyMention INTEGER DEFAULT 0,
    typingSimulation INTEGER DEFAULT 1,
    conversationMemory INTEGER DEFAULT 1,
    autoReplyDelayMin INTEGER DEFAULT 3,
    autoReplyDelayMax INTEGER DEFAULT 15,
    autoReplyPersonality TEXT DEFAULT 'You are a modern Telegram AI assistant. Reply intelligently, naturally, and concisely. Format responses beautifully for Telegram.',
    autoReplyWhitelist TEXT DEFAULT '',
    autoReplyBlacklist TEXT DEFAULT '',
    nsfwEnabled INTEGER DEFAULT 0,
    nsfwPersonality TEXT DEFAULT 'You are a flirty, mature, and consenting adult friend.',
    searchEnabled INTEGER DEFAULT 0,
    searchProvider TEXT DEFAULT 'tavily',
    searchApiKey TEXT DEFAULT '',
    aiMode TEXT DEFAULT 'intelligent',
    formattingEnabled INTEGER DEFAULT 1,
    cleanupEnabled INTEGER DEFAULT 1,
    bluesmindsApiKey TEXT DEFAULT '',
    activeModel TEXT DEFAULT 'gemini-1.5-flash',
    deepThinking INTEGER DEFAULT 0,
    publicCommandsEnabled INTEGER DEFAULT 1,
    blacklistedUsers TEXT DEFAULT '',
    whitelistedUsers TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS group_settings (
    chatId TEXT PRIMARY KEY,
    publicCommandsEnabled INTEGER DEFAULT 1,
    cooldownOverride INTEGER DEFAULT NULL,
    updatedAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS command_stats (
    command TEXT,
    userId TEXT,
    chatId TEXT,
    timestamp INTEGER
  );

  CREATE TABLE IF NOT EXISTS user_nsfw_prefs (
    userId TEXT PRIMARY KEY,
    nsfwEnabled INTEGER DEFAULT 0,
    ageConfirmed INTEGER DEFAULT 0,
    updatedAt INTEGER
  );
  
  CREATE TABLE IF NOT EXISTS nsfw_logs (
    id TEXT PRIMARY KEY,
    timestamp INTEGER,
    userId TEXT,
    chatId TEXT,
    message TEXT,
    violation TEXT
  );

  CREATE TABLE IF NOT EXISTS sudo_users (
    id TEXT PRIMARY KEY,
    userId TEXT,
    createdAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chatId TEXT,
    role TEXT,
    content TEXT,
    timestamp INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_conv_chat ON conversations(chatId);
  CREATE INDEX IF NOT EXISTS idx_conv_ts ON conversations(timestamp);
`);

// Migration for existing databases
try {
  db.exec("ALTER TABLE config ADD COLUMN sudoUsers TEXT DEFAULT '';");
} catch (e) {}
try {
  db.exec(
    "ALTER TABLE config ADD COLUMN publicCommandsEnabled INTEGER DEFAULT 1;",
  );
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN blacklistedUsers TEXT DEFAULT '';");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN whitelistedUsers TEXT DEFAULT '';");
} catch (e) {}

// ... existing try-catch migrations ...
try {
  db.exec("ALTER TABLE config ADD COLUMN youtube_cookies TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN telegramApiId TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN telegramApiHash TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN telegramStringSession TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN globalCooldown INTEGER DEFAULT 3;");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN perUserCooldown INTEGER DEFAULT 10;");
} catch (e) {}
try {
  db.exec(
    "ALTER TABLE config ADD COLUMN maxConcurrentTasks INTEGER DEFAULT 2;",
  );
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN aiEnabled INTEGER DEFAULT 1;");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN aiProvider TEXT DEFAULT 'gemini';");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN geminiKey TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN groqKey TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN openRouterKey TEXT;");
} catch (e) {}
try {
  db.exec(
    "ALTER TABLE config ADD COLUMN autoDeleteCommands INTEGER DEFAULT 0;",
  );
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN autoDeleteDelay INTEGER DEFAULT 0;");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN autoDeleteWhitelist TEXT DEFAULT '';");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN autoReplyDM INTEGER DEFAULT 0;");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN autoReplyMention INTEGER DEFAULT 0;");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN typingSimulation INTEGER DEFAULT 1;");
} catch (e) {}
try {
  db.exec(
    "ALTER TABLE config ADD COLUMN conversationMemory INTEGER DEFAULT 1;",
  );
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN autoReplyDelayMin INTEGER DEFAULT 3;");
} catch (e) {}
try {
  db.exec(
    "ALTER TABLE config ADD COLUMN autoReplyDelayMax INTEGER DEFAULT 15;",
  );
} catch (e) {}
try {
  db.exec(
    "ALTER TABLE config ADD COLUMN autoReplyPersonality TEXT DEFAULT 'You are a modern Telegram AI assistant. Reply intelligently, naturally, and concisely. Avoid robotic greetings, filler text, and generic explanations. Format responses beautifully for Telegram. Use short readable paragraphs. Always prioritize useful and accurate answers.';",
  );
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN autoReplyWhitelist TEXT DEFAULT '';");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN autoReplyBlacklist TEXT DEFAULT '';");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN nsfwEnabled INTEGER DEFAULT 0;");
} catch (e) {}
try {
  db.exec(
    "ALTER TABLE config ADD COLUMN nsfwPersonality TEXT DEFAULT 'You are a flirty, mature, and consenting adult friend.';",
  );
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN searchEnabled INTEGER DEFAULT 0;");
} catch (e) {}
try {
  db.exec(
    "ALTER TABLE config ADD COLUMN searchProvider TEXT DEFAULT 'tavily';",
  );
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN searchApiKey TEXT DEFAULT '';");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN aiMode TEXT DEFAULT 'intelligent';");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN formattingEnabled INTEGER DEFAULT 1;");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN cleanupEnabled INTEGER DEFAULT 1;");
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN bluesmindsApiKey TEXT DEFAULT '';");
} catch (e) {}
try {
  db.exec(
    "ALTER TABLE config ADD COLUMN activeModel TEXT DEFAULT 'gemini-1.5-flash';",
  );
} catch (e) {}
try {
  db.exec("ALTER TABLE config ADD COLUMN deepThinking INTEGER DEFAULT 0;");
} catch (e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS user_nsfw_prefs (
    userId TEXT PRIMARY KEY,
    nsfwEnabled INTEGER DEFAULT 0,
    ageConfirmed INTEGER DEFAULT 0,
    updatedAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS nsfw_logs (
    id TEXT PRIMARY KEY,
    timestamp INTEGER,
    userId TEXT,
    chatId TEXT,
    message TEXT,
    violation TEXT
  );

  CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    timestamp INTEGER,
    message TEXT,
    type TEXT
  );

  CREATE TABLE IF NOT EXISTS exports (
    id TEXT PRIMARY KEY,
    filename TEXT,
    filepath TEXT,
    createdAt INTEGER,
    type TEXT,
    status TEXT
  );

  INSERT OR IGNORE INTO config (id, minDelaySeconds, maxDelaySeconds, adminUsers, isRunning, youtube_cookies, globalCooldown, perUserCooldown, maxConcurrentTasks, aiEnabled, aiProvider, openRouterKey) 
  VALUES (1, 600, 1200, 'YOUR_TELEGRAM_ID', 0, '', 3, 10, 2, 1, 'openrouter', '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');

  -- Ensure existing columns have defaults if they were null from migrations
  UPDATE config SET 
    globalCooldown = COALESCE(globalCooldown, 3),
    perUserCooldown = COALESCE(perUserCooldown, 10),
    maxConcurrentTasks = COALESCE(maxConcurrentTasks, 2),
    aiEnabled = COALESCE(aiEnabled, 1),
    aiProvider = COALESCE(aiProvider, 'gemini'),
    autoDeleteCommands = COALESCE(autoDeleteCommands, 0),
    autoDeleteDelay = COALESCE(autoDeleteDelay, 0),
    autoDeleteWhitelist = COALESCE(autoDeleteWhitelist, ''),
    autoReplyDM = COALESCE(autoReplyDM, 0),
    autoReplyMention = COALESCE(autoReplyMention, 0),
    typingSimulation = COALESCE(typingSimulation, 1),
    conversationMemory = COALESCE(conversationMemory, 1),
    autoReplyDelayMin = COALESCE(autoReplyDelayMin, 3),
    autoReplyDelayMax = COALESCE(autoReplyDelayMax, 15),
    autoReplyPersonality = COALESCE(autoReplyPersonality, 'You are a modern Telegram AI assistant. Reply intelligently, naturally, and concisely. Avoid robotic greetings, filler text, and generic explanations. Format responses beautifully for Telegram. Use short readable paragraphs. Always prioritize useful and accurate answers.'),
    autoReplyWhitelist = COALESCE(autoReplyWhitelist, ''),
    autoReplyBlacklist = COALESCE(autoReplyBlacklist, ''),
    nsfwEnabled = COALESCE(nsfwEnabled, 0),
    nsfwPersonality = COALESCE(nsfwPersonality, 'You are a flirty, mature, and consenting adult friend.'),
    searchEnabled = COALESCE(searchEnabled, 0),
    searchProvider = COALESCE(searchProvider, 'tavily'),
    searchApiKey = COALESCE(searchApiKey, ''),
    aiMode = COALESCE(aiMode, 'intelligent'),
    formattingEnabled = COALESCE(formattingEnabled, 1),
    cleanupEnabled = COALESCE(cleanupEnabled, 1),
    bluesmindsApiKey = COALESCE(bluesmindsApiKey, ''),
    activeModel = COALESCE(activeModel, 'gemini-1.5-flash')
  WHERE id = 1;
`);

// Only update if key is missing or explicitly needed, but don't force provider if user changed it.
// Bootstrap credentials from env vars so Railway redeployments don't wipe them from the UI
{
  const envBootstrap = db
    .prepare(
      "SELECT telegramApiId, telegramApiHash, telegramStringSession, geminiKey, openRouterKey, groqKey, bluesmindsApiKey FROM config WHERE id = 1",
    )
    .get() as any;
  const envUpdates: Record<string, string> = {};
  if (!envBootstrap?.telegramApiId && process.env.TELEGRAM_API_ID)
    envUpdates.telegramApiId = process.env.TELEGRAM_API_ID;
  if (!envBootstrap?.telegramApiHash && process.env.TELEGRAM_API_HASH)
    envUpdates.telegramApiHash = process.env.TELEGRAM_API_HASH;
  if (!envBootstrap?.telegramStringSession && process.env.TELEGRAM_STRING_SESSION)
    envUpdates.telegramStringSession = process.env.TELEGRAM_STRING_SESSION;
  if (process.env.GEMINI_API_KEY)
    envUpdates.geminiKey = process.env.GEMINI_API_KEY;
  if (process.env.OPENROUTER_API_KEY)
    envUpdates.openRouterKey = process.env.OPENROUTER_API_KEY;
  if (process.env.GROQ_API_KEY)
    envUpdates.groqKey = process.env.GROQ_API_KEY;
  if (process.env.BLUESMINDS_API_KEY)
    envUpdates.bluesmindsApiKey = process.env.BLUESMINDS_API_KEY;
  if (Object.keys(envUpdates).length > 0) {
    for (const [k, v] of Object.entries(envUpdates)) {
      db.prepare(`UPDATE config SET ${k} = ? WHERE id = 1`).run(v);
    }
    console.log(
      "[startup] Bootstrapped missing credentials from environment variables:",
      Object.keys(envUpdates).join(", "),
    );
  }
}

async function getGeminiResponse(
  prompt: string,
  apiKey: string,
  model: string = "gemini-1.5-flash",
  context: any[] = [],
  systemInstruction?: string,
) {
  try {
    const cleanKey = apiKey?.trim();
    if (
      !cleanKey ||
      cleanKey === "undefined" ||
      cleanKey === "null" ||
      cleanKey.length < 5
    ) {
      return null;
    }

    const ai = new GoogleGenAI({ apiKey: cleanKey });

    // Validate model name for Gemini SDK (must be a valid gemini model name)
    let finalModel = model || "gemini-1.5-flash";
    if (!finalModel.startsWith("gemini-")) {
      finalModel = "gemini-1.5-flash"; // Fallback to safe default for Gemini SDK
    }

    // In SDK, contents is an array of objects with role and parts
    const contents =
      context.length > 0
        ? [...context, { role: "user", parts: [{ text: prompt }] }]
        : [{ role: "user", parts: [{ text: prompt }] }];

    const response = await ai.models.generateContent({
      model: finalModel,
      contents: contents as any,
      config: {
        systemInstruction:
          systemInstruction ||
          "You are a helpful assistant for a Telegram userbot.",
        temperature: 0.7,
      },
    });

    const aiText = response.text;
    return aiText?.trim() || null;
  } catch (e: any) {
    const errMsg = e?.message || String(e);
    if (
      errMsg.includes("API key not valid") ||
      errMsg.includes("invalid API key") ||
      errMsg.includes("API_KEY_INVALID")
    ) {
      console.warn(
        "[Gemini] Auth Warning: The provided API key was rejected. Skipping to next provider.",
      );
      return null;
    }
    console.error("[Gemini] API Error:", errMsg);
    return null;
  }
}

async function getGroqResponse(
  prompt: string,
  apiKey: string,
  model: string = "llama3-8b-8192",
  context: any[] = [],
  systemInstruction?: string,
) {
  try {
    const cleanKey = apiKey?.trim();
    if (!cleanKey || cleanKey === "undefined" || cleanKey === "null")
      return null;

    let finalModel = model || "llama3-8b-8192";
    // Crude check if it's likely a Groq-compatible model if user didn't specify one
    if (!finalModel.includes("-") && !finalModel.includes("/")) {
      finalModel = "llama3-8b-8192";
    }

    const messages =
      context.length > 0
        ? [
            ...(systemInstruction
              ? [{ role: "system", content: systemInstruction }]
              : []),
            ...context.map((c) => ({
              role: c.role === "model" ? "assistant" : c.role,
              content: c.parts[0].text,
            })),
            { role: "user", content: prompt },
          ]
        : [
            ...(systemInstruction
              ? [{ role: "system", content: systemInstruction }]
              : []),
            { role: "user", content: prompt },
          ];

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cleanKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: finalModel,
          messages,
        }),
      },
    );

    const contentType = response.headers.get("content-type");
    if (!response.ok || !contentType?.includes("application/json")) {
      const err = await response.text();
      console.error(
        `[Groq] API Error (${response.status}, ${contentType}):`,
        err.substring(0, 500),
      );
      return null;
    }

    const data = (await response.json()) as any;
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e: any) {
    console.error("[Groq] Fetch Error:", e?.message || e);
    return null;
  }
}

async function getOpenRouterResponse(
  prompt: string,
  apiKey: string,
  model: string = "google/gemini-2.0-flash-001",
  context: any[] = [],
  systemInstruction?: string,
) {
  try {
    const cleanKey = apiKey?.trim();
    if (!cleanKey || cleanKey === "undefined" || cleanKey === "null")
      return null;

    // OpenRouter handles most model names, so we can be more flexible
    const finalModel =
      model && (model.includes("/") || model.includes("-"))
        ? model
        : "google/gemini-2.0-flash-001";

    const messages =
      context.length > 0
        ? [
            ...(systemInstruction
              ? [{ role: "system", content: systemInstruction }]
              : []),
            ...context.map((c) => ({
              role: c.role === "model" ? "assistant" : c.role,
              content: c.parts[0].text,
            })),
            { role: "user", content: prompt },
          ]
        : [
            ...(systemInstruction
              ? [{ role: "system", content: systemInstruction }]
              : []),
            { role: "user", content: prompt },
          ];

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cleanKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ais-dev.run.app",
          "X-Title": "TG Userbot",
        },
        body: JSON.stringify({
          model: finalModel,
          messages,
        }),
      },
    );

    const contentType = response.headers.get("content-type");
    if (!response.ok || !contentType?.includes("application/json")) {
      const err = await response.text();
      console.error(
        `[OpenRouter] API Error (${response.status}, ${contentType}):`,
        err.substring(0, 500),
      );
      return null;
    }

    const data = (await response.json()) as any;
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e: any) {
    console.error("[OpenRouter] Fetch Error:", e?.message || e);
    return null;
  }
}

async function getBluesMindsResponse(
  prompt: string,
  apiKey: string,
  model: string = "gemini-1.5-flash",
  context: any[] = [],
  systemInstruction?: string,
) {
  try {
    const cleanKey = apiKey?.trim();
    if (!cleanKey || cleanKey === "undefined" || cleanKey === "null")
      return null;

    const messages =
      context.length > 0
        ? [
            ...(systemInstruction
              ? [{ role: "system", content: systemInstruction }]
              : []),
            ...context.map((c) => ({
              role: c.role === "model" ? "assistant" : c.role,
              content: c.parts[0].text,
            })),
            { role: "user", content: prompt },
          ]
        : [
            ...(systemInstruction
              ? [{ role: "system", content: systemInstruction }]
              : []),
            { role: "user", content: prompt },
          ];

    const response = await fetch(
      "https://api.bluesminds.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cleanKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: 0.7,
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      // Handle EOL or Unavailability (410 GONE, 503 SERVICE UNAVAILABLE, or specific error strings)
      if (
        errText.includes("reached its end of life") ||
        response.status === 410 ||
        response.status === 503 ||
        errText.includes("model_not_found") ||
        errText.includes("no available channel")
      ) {
        console.warn(
          `[AI] BluesMinds Warning (${response.status}): Model ${model} is discontinued or unavailable. Attempting fallback...`,
        );

        const fallbackChain = [
          "gemini-1.5-pro",
          "gemini-2.0-flash-exp",
          "deepseek-chat",
          "gpt-4o-mini",
          "gemini-1.5-flash",
        ];
        // Find current model's index and try the next one
        const currentIdx = fallbackChain.indexOf(model);
        const nextModel =
          fallbackChain[currentIdx + 1] ||
          (model !== "gemini-1.5-flash" ? "gemini-1.5-flash" : null);

        if (nextModel && nextModel !== model) {
          return getBluesMindsResponse(
            prompt,
            apiKey,
            nextModel,
            context,
            systemInstruction,
          );
        }
      }
      throw new Error(`BluesMinds API Error (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as any;
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e: any) {
    console.error(`[AI] BluesMinds Error:`, e.message || e);
    return null;
  }
}

const aiProcessingLock = new Set<string>();

// ... (existing music handlers might use targetQueue, but aiProcessingLock is for specific message IDs)

let isListenerActive = false;
let lastEventTimestamp = 0;

async function moderateContent(
  text: string,
): Promise<{ safe: boolean; reason?: string }> {
  const forbidden = [
    /\b(minor|child|toddler|kid|infant)\s+(porn|sex|erotica|nude|naked)\b/i,
    /\b(rape|non-consensual|forced|coercion|nonconsensual)\b/i,
    /\b(illegal|exploitative)\b/i,
    /\b(zoo|bestiality|animal)\s+(sex|porn)\b/i,
    /\b(underage)\b/i,
  ];

  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      return { safe: false, reason: "Harmful or illegal content detected." };
    }
  }
  return { safe: true };
}

async function performWebSearch(
  query: string,
  config: any,
  deep: boolean = false,
): Promise<string> {
  if (config.searchEnabled !== 1 || !config.searchApiKey) return "";

  try {
    const depth = deep ? "advanced" : "basic";
    const maxResults = deep ? 6 : 3;
    console.log(
      `[Search] Performing ${depth} web search for: "${query}" using Tavily...`,
    );
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: config.searchApiKey,
        query: query,
        search_depth: depth,
        max_results: maxResults,
      }),
    });

    if (!response.ok) {
      console.error(`[Search] API Error: ${response.status}`);
      return "";
    }

    const data = await response.json();
    if (data.results && data.results.length > 0) {
      return data.results
        .map(
          (r: any) =>
            `Source: ${r.title}\nContent: ${r.content}\nURL: ${r.url}`,
        )
        .join("\n\n---\n\n");
    }
  } catch (e) {
    console.error(`[Search] Error:`, e);
  }
  return "";
}

function cleanAIResponse(text: string, config: any): string {
  if (config.cleanupEnabled !== 1) return text;

  let cleaned = text;

  // Remove common AI robotic filler
  const fillers = [
    /^Hi there!?\s*/i,
    /^Hello!?\s*/i,
    /^Certainly!?\s*/i,
    /^Sure!?\s*/i,
    /^Okay!?\s*/i,
    /^Here is (?:a|the|some)\s*/i,
    /^Here's (?:a|the|some)\s*/i,
    /^I've (?:found|searched|researched)\s*/i,
    /^According to my (?:search|information|records)\s*/i,
    /^Based on (?:the|current)\s*/i,
    /^As an AI language model,?\s*/i,
    /^In my previous (?:role|response|message),?\s*/i,
    /Glad to (?:help|assist|provide information).*/i,
    /Hope this (?:helps|is useful|helps clarify).*/i,
    /Let me know if you need any (?:more|further) (?:help|assistance|info).*/i,
  ];

  for (const filler of fillers) {
    cleaned = cleaned.replace(filler, "");
  }

  // Trim leading/trailing whitespace and redundant newlines
  cleaned = cleaned.trim().replace(/\n{3,}/g, "\n\n");

  return cleaned;
}

function formatAiMessage(text: string): {
  text: string;
  parseMode: "html" | "markdown";
} {
  if (!text) return { text: "", parseMode: "markdown" };

  const wordCount = text.trim().split(/\s+/).length;

  // If message is longer than 100 words, use the expandable quote feature
  if (wordCount > 100) {
    // Simple MD to HTML converter for critical elements
    let htmlContent = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>") // Bold
      .replace(/__(.*?)__/g, "<u>$1</u>") // Underline
      .replace(/_(.*?)_/g, "<i>$1</i>") // Italic
      .replace(/`(.*?)`/g, "<code>$1</code>") // Inline code
      .replace(/\n/g, "<br/>"); // Newlines

    // Expanding blockquote is collapsed by default in Telegram
    return {
      text: `<blockquote expandable>${htmlContent}</blockquote>`,
      parseMode: "html",
    };
  }

  // If text is moderately long (>300 chars) but < 100 words, use standard blockquote
  if (text.length > 300) {
    const formatted = text
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    return { text: formatted, parseMode: "markdown" };
  }

  return { text, parseMode: "markdown" };
}

async function generateImage(
  prompt: string,
  apiKey: string,
  model: string = "flux",
) {
  try {
    const cleanKey = apiKey?.trim();
    if (!cleanKey) return null;

    const response = await fetch(
      "https://api.bluesminds.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cleanKey}`,
        },
        body: JSON.stringify({
          model: model,
          prompt: prompt,
          n: 1,
          size: "1024x1024",
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      console.error(`[AI] Image Gen Error (${response.status}):`, err);
      return null;
    }

    const data = (await response.json()) as any;
    // BluesMinds often returns data[0].url
    return data.data?.[0]?.url || null;
  } catch (e: any) {
    console.error("[AI] Image Gen Fetch Error:", e);
    return null;
  }
}

async function getAIResponse(
  prompt: string,
  config: any,
  chatId?: string,
  userId?: string,
  isNSFWActive: boolean = false,
  forceDeep: boolean = false,
) {
  const userGeminiK = (config.geminiKey || "").trim();
  const systemGeminiK = (process.env.GEMINI_API_KEY || "").trim();

  const groqK = (config.groqKey || "").trim();
  const openRouterK = (config.openRouterKey || "").trim();

  // Load context if memory is enabled
  let context: any[] = [];
  const memoryKey = userId ? `mem:${userId}:${chatId || "global"}` : chatId;

  if (memoryKey && config.conversationMemory === 1) {
    const history = db
      .prepare(
        "SELECT role, content FROM conversations WHERE chatId = ? ORDER BY timestamp DESC LIMIT 10",
      )
      .all(memoryKey) as any[];
    context = history.reverse().map((h) => ({
      role: h.role,
      parts: [{ text: h.content }],
    }));
  }

  // Realtime Context Injection
  const now = new Date();
  const dateStr = now.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "full",
    timeStyle: "short",
  });
  const timeContext = `[Current Context: Date is ${dateStr}. Timezone is Asia/Kolkata (IST). Current Year: 2026. Month: May 2026. You are operating in realtime. Never assume outdated relative dates.]`;

  // System Personality & Mode
  let systemPrompt =
    "You are a premium Telegram AI assistant. Reply with high-quality, structured formatting. \n\n" +
    "STRUCTURE RULES:\n" +
    "1. Use **Bold Headings** for sections, each ending with a single relevant emoji (e.g., **Current Status 🏛️**).\n" +
    "2. Bold key names, dates, and numbers within paragraphs for readability.\n" +
    "3. Use clean spacing between sections. Avoid robotic greetings or filler text.\n" +
    "4. Prioritize accurate, realtime data. If using search results, synthesize them into a coherent report.\n" +
    "5. Keep the tone professional, smart, and human-like.";

  if (config.formattingEnabled === 1) {
    systemPrompt +=
      "\n\nFORMATTING: Use standard Telegram Markdown (bold with **). Do not use headers (#). Use bullet points for lists.";
  }

  // Deep Thinking Enhancement
  const isDeep = forceDeep || config.deepThinking === 1;
  if (isDeep) {
    systemPrompt +=
      "\n\nDEEP THINKING MODE: Before providing your final answer, you must perform deep, logical reasoning. Consider edge cases, multi-step implications, and verify your facts. Structure your response to be exceptionally detailed and analytical.";
    // If using BluesMinds/OpenRouter, and model isn't already a reasoner, we can append a hint
    if (config.activeModel && !config.activeModel.includes("reasoner")) {
      prompt = `[REASONING REQUIRED] ${prompt}`;
    }
  }

  if (config.aiMode === "concise") {
    systemPrompt +=
      " Be extremely brief and direct. One or two sentences maximum.";
  } else if (config.aiMode === "detailed") {
    systemPrompt += " Provide in-depth information with clear sections.";
  } else if (config.aiMode === "casual") {
    systemPrompt += " Use a friendly, slang-inclusive, and relaxed tone.";
  }

  let personality = config.autoReplyPersonality;
  if (isNSFWActive && config.nsfwEnabled === 1) {
    personality =
      config.nsfwPersonality ||
      "You are a flirty, mature, and consenting adult friend.";
    systemPrompt = `[Mature Mode] ${personality}`;
  } else if (personality) {
    systemPrompt = `[Base Identity: ${personality}] ${systemPrompt}`;
  }

  // Web Search Trigger
  let searchContext = "";
  const searchKeywords = [
    "today",
    "latest",
    "current",
    "news",
    "score",
    "price",
    "who is",
    "what happened",
    "election",
    "weather",
    "match",
  ];
  const shouldSearch =
    config.searchEnabled === 1 &&
    (isDeep || searchKeywords.some((kw) => prompt.toLowerCase().includes(kw)));

  if (shouldSearch) {
    const results = await performWebSearch(prompt, config, isDeep);
    if (results) {
      searchContext = `[Web Search Results: ${results}] Use this information to provide an up-to-date answer. If the information is missing, state you couldn't find data for today.`;
    }
  }

  // Model-specific personality tweaks
  let modelNudge = "";
  if (config.activeModel?.includes("gpt-4")) {
    modelNudge =
      "\nYou are running on a high-intelligence GPT-4 class model. Provide extremely deep, nuanced, and analytically sound reasoning.";
  } else if (config.activeModel?.includes("claude")) {
    modelNudge =
      "\nYou are running on a Claude model. Be helpful, harmless, and honest. Maintain a refined, literary tone.";
  } else if (config.activeModel?.includes("deepseek")) {
    modelNudge =
      "\nYou are running on DeepSeek. Be exceptionally good at coding and logic-heavy explanations.";
  } else if (config.activeModel?.includes("gemini")) {
    modelNudge =
      "\nYou are running on Gemini. Be fast, multicapable, and modern in your tone.";
  }

  const finalPrompt = `${timeContext} ${systemPrompt} ${modelNudge} ${searchContext ? "\n\n" + searchContext : ""} \n\nUser Message: ${prompt}`;

  // Define potential providers
  const providers: { name: string; key: string; fn: any }[] = [];
  const geminiProvider = {
    name: "Gemini",
    key: userGeminiK || systemGeminiK,
    fn: (p: any, k: any, ctx: any, inst: any) =>
      getGeminiResponse(p, k, config.activeModel, ctx, inst),
  };
  const groqProvider = {
    name: "Groq",
    key: groqK,
    fn: (p: any, k: any, ctx: any, inst: any) =>
      getGroqResponse(p, k, config.activeModel, ctx, inst),
  };
  const orProvider = {
    name: "OpenRouter",
    key: openRouterK,
    fn: (p: any, k: any, ctx: any, inst: any) =>
      getOpenRouterResponse(p, k, config.activeModel, ctx, inst),
  };
  const bluesmindsProvider = {
    name: "BluesMinds",
    key: (config.bluesmindsApiKey || "").trim(),
    fn: (p: any, k: any, ctx: any, inst: any) =>
      getBluesMindsResponse(
        p,
        k,
        config.activeModel || "gemini-1.5-flash",
        ctx,
        inst,
      ),
  };

  if (config.aiProvider === "gemini") {
    providers.push(
      geminiProvider,
      bluesmindsProvider,
      groqProvider,
      orProvider,
    );
  } else if (config.aiProvider === "groq") {
    providers.push(
      groqProvider,
      bluesmindsProvider,
      geminiProvider,
      orProvider,
    );
  } else if (config.aiProvider === "bluesminds") {
    providers.push(
      bluesmindsProvider,
      geminiProvider,
      groqProvider,
      orProvider,
    );
  } else {
    providers.push(
      orProvider,
      bluesmindsProvider,
      geminiProvider,
      groqProvider,
    );
  }

  for (const p of providers) {
    if (
      p.key &&
      p.key !== "undefined" &&
      p.key !== "null" &&
      p.key.length > 5
    ) {
      try {
        const resRaw = await p.fn(
          prompt,
          p.key,
          context,
          `${timeContext} ${systemPrompt} ${searchContext ? "\n\n" + searchContext : ""}`,
        );
        if (resRaw) {
          const res = cleanAIResponse(resRaw, config);

          if (memoryKey && config.conversationMemory === 1) {
            db.prepare(
              "INSERT INTO conversations (chatId, role, content, timestamp) VALUES (?, ?, ?, ?)",
            ).run(memoryKey, "user", prompt, Date.now());
            db.prepare(
              "INSERT INTO conversations (chatId, role, content, timestamp) VALUES (?, ?, ?, ?)",
            ).run(memoryKey, "model", res, Date.now());
          }
          return res;
        }
      } catch (err: any) {
        console.error(`[AI] Exception in ${p.name}:`, err.message || err);
      }
    }
  }
  return null;
}

async function maybeDeleteCommand(
  client: TelegramClient | null,
  message: any,
  config: any,
) {
  if (!client || config.autoDeleteCommands !== 1) return;

  const chatId = message.chatId?.toString();
  const whitelistString = (config.autoDeleteWhitelist || "").trim();
  const whitelist = whitelistString
    ? whitelistString.split(",").map((s: string) => s.trim())
    : [];

  // If whitelist is not empty and chatId is not in whitelist, skip
  if (whitelist.length > 0 && !whitelist.includes(chatId)) {
    return;
  }

  const delay = (config.autoDeleteDelay || 0) * 1000;

  const deleteAction = async () => {
    try {
      if (!message.id) return;
      await client.deleteMessages(message.chatId, [message.id], {
        revoke: true,
      });
      console.log(
        `[BOT] Auto-deleted command message ${message.id} from chat ${chatId}`,
      );

      const logId = Math.random().toString(36).substring(2);
      db.prepare(
        "INSERT INTO logs (id, timestamp, message, type) VALUES (?, ?, ?, ?)",
      ).run(
        logId,
        Date.now(),
        `Auto-deleted command message (${message.id}) from chat ${chatId}`,
        "info",
      );
    } catch (e: any) {
      console.error(
        `[BOT] Failed to auto-delete command message ${message.id}: ${e.message}`,
      );
    }
  };

  if (delay <= 0) {
    await deleteAction();
  } else {
    setTimeout(deleteAction, delay);
  }
}

class TaskQueue {
  private queue: (() => Promise<any>)[] = [];
  private activeCount = 0;
  private maxConcurrent = 2;
  private readonly TASK_TIMEOUT = 120000; // 2 minute safety timeout

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
  }

  async add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        let timer: any;
        const timeoutPromise = new Promise((_, rej) => {
          timer = setTimeout(
            () => rej(new Error("Task execution timed out")),
            this.TASK_TIMEOUT,
          );
        });

        try {
          const result = await Promise.race([task(), timeoutPromise]);
          clearTimeout(timer);
          resolve(result as T);
        } catch (e) {
          clearTimeout(timer);
          reject(e);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0)
      return;
    this.activeCount++;
    const task = this.queue.shift();
    if (task) {
      try {
        await task();
      } catch (err) {
        console.error("[TaskQueue] Task failed:", err);
      } finally {
        this.activeCount--;
        this.process();
      }
    }
  }

  setMaxConcurrent(val: number) {
    this.maxConcurrent = val;
  }
}

const PermissionLevel = {
  PUBLIC: 0,
  SUDO: 1,
  ADMIN: 2,
  OWNER: 3,
};

type PermissionLevelValue = number;

class PermissionManager {
  static getLevel(userId: string, myId: string, config: any): number {
    if (userId === myId) return PermissionLevel.OWNER;
    const admins = (config.adminUsers || "")
      .split(",")
      .map((s: any) => s.trim())
      .filter(Boolean);
    if (admins.includes(userId)) return PermissionLevel.ADMIN;

    try {
      const isSudo = db
        .prepare("SELECT 1 FROM sudo_users WHERE userId = ?")
        .get(userId);
      if (isSudo) return PermissionLevel.SUDO;
    } catch (e) {}

    return PermissionLevel.PUBLIC;
  }

  static async check(
    command: string,
    userId: string,
    chatId: string,
    myId: string,
  ): Promise<{ allowed: boolean; reason?: string; level: number }> {
    const config = db.prepare("SELECT * FROM config WHERE id = 1").get() as any;
    const level = this.getLevel(userId, myId, config);

    const blacklisted = (config.blacklistedUsers || "")
      .split(",")
      .map((s: any) => s.trim())
      .filter(Boolean);
    const whitelisted = (config.whitelistedUsers || "")
      .split(",")
      .map((s: any) => s.trim())
      .filter(Boolean);

    if (level < PermissionLevel.OWNER && blacklisted.includes(userId)) {
      return { allowed: false, reason: "🚫 You are blacklisted.", level };
    }

    const publicCommands = [
      "ans",
      "music",
      "song",
      "gif",
      "sticker",
      "pdf",
      "summarize",
      "translate",
      "ping",
      "commands",
      "help",
      "nsfw",
      "confirmage",
    ];
    const cmdName = command
      .replace("/", "")
      .replace(".", "")
      .split(" ")[0]
      .toLowerCase();

    // Owner/Admin always allowed
    if (level >= PermissionLevel.ADMIN) return { allowed: true, level };

    // Sudo allowed for non-owner commands (we'll keep it simple for now)
    if (level === PermissionLevel.SUDO) {
      const ownerOnly = ["startbot", "stopbot", "reloadcookies"];
      if (ownerOnly.includes(cmdName))
        return { allowed: false, reason: "👑 Owner only command.", level };
      return { allowed: true, level };
    }

    // Public Commands check
    if (publicCommands.includes(cmdName)) {
      if (config.publicCommandsEnabled !== 1 && !whitelisted.includes(userId)) {
        return {
          allowed: false,
          reason: "🔒 Public commands are globally disabled.",
          level,
        };
      }

      const groupSettings = db
        .prepare("SELECT * FROM group_settings WHERE chatId = ?")
        .get(chatId) as any;
      if (groupSettings && groupSettings.publicCommandsEnabled === 0) {
        return {
          allowed: false,
          reason: "🔒 Public commands are disabled in this group.",
          level,
        };
      }

      return { allowed: true, level };
    }

    return { allowed: false, reason: "👮 Admin-only command.", level };
  }
}

class CommandProcessor {
  static async process(
    client: TelegramClient,
    message: any,
    config: any,
    myId: string,
    cmdName: string,
    textRaw: string,
    handler: (status: SmartStatus) => Promise<void>,
  ) {
    const chatId = message.chatId?.toString();
    const userId = message.senderId?.toString();
    const isMe = message.out || userId === myId;

    // 1. Permission Check
    const check = await PermissionManager.check(cmdName, userId, chatId, myId);
    if (!check.allowed) {
      if (check.reason && !isMe) {
        await client.sendMessage(message.chatId, {
          message: check.reason,
          replyTo: message.id,
        });
      }
      return;
    }

    // 2. Anti-Spam / Cooldown
    if (!isMe) {
      const now = Date.now();
      const lastUsed = userCooldowns.get(userId) || 0;
      const cooldownSec = (config.perUserCooldown || 10) * 1000;
      if (now - lastUsed < cooldownSec) {
        // Optional: Notify user or just ignore
        return;
      }
      userCooldowns.set(userId, now);
    }

    // 3. Auto Delete Command
    if (config.autoDeleteCommands === 1) {
      await maybeDeleteCommand(client, message, config);
    }

    // 4. Status Message
    const status = new SmartStatus(
      client,
      message.chatId,
      true,
      message.replyToMsgId || message.id,
    );

    // 5. Execute Command
    try {
      // Log usage
      db.prepare(
        "INSERT INTO command_stats (command, userId, chatId, timestamp) VALUES (?, ?, ?, ?)",
      ).run(cmdName, userId, chatId, Date.now());
      await handler(status);
    } catch (e: any) {
      console.error(`[CommandProcessor] Error in ${cmdName}:`, e);
      await status.fail(`Error: ${e.message || "Something went wrong"}`);
    }
  }
}

async function handleSummarize(
  client: TelegramClient,
  message: any,
  config: any,
  status: SmartStatus,
) {
  if (!message.replyToMsgId) {
    await status.fail("Reply to a message to summarize it.");
    return;
  }
  const repl = await client.getMessages(message.chatId, {
    ids: [message.replyToMsgId],
  });
  const text = repl[0]?.message;
  if (!text) return status.fail("No text found to summarize.");

  await status.update("📝 **Summarizing...**");
  const aiRes = await getAIResponse(
    `Summarize this text concisely: ${text}`,
    config,
    message.chatId.toString(),
    message.senderId?.toString(),
  );
  if (aiRes) {
    await status.finish(`📄 **Summary**\n\n${aiRes}`);
  } else {
    await status.fail("Summarization failed.");
  }
}

async function handleTranslate(
  client: TelegramClient,
  message: any,
  config: any,
  status: SmartStatus,
  args: string,
) {
  if (!message.replyToMsgId) {
    await status.fail("Reply to a message to translate it.");
    return;
  }
  const repl = await client.getMessages(message.chatId, {
    ids: [message.replyToMsgId],
  });
  const text = repl[0]?.message;
  if (!text) return status.fail("No text found to translate.");

  const targetLang = args || "English";
  await status.update(`🌐 **Translating to ${targetLang}...**`);
  const aiRes = await getAIResponse(
    `Translate this text to ${targetLang}. Only return the translation: ${text}`,
    config,
    message.chatId.toString(),
    message.senderId?.toString(),
  );
  if (aiRes) {
    await status.finish(`🌍 **Translation (${targetLang})**\n\n${aiRes}`);
  } else {
    await status.fail("Translation failed.");
  }
}

async function handleGif(
  client: TelegramClient,
  message: any,
  config: any,
  status: SmartStatus,
  query: string,
) {
  if (!query) return status.fail("Usage: /gif <search term>");
  await status.update(`🔍 **Searching for GIF: ${query}...**`);

  // Real implementation would use Giphy API, but for now we search for a link or use AI to describe it
  // We'll fallback to showing search availability
  await status.fail(
    "GIF search API not configured. Please use /img for custom generations.",
  );
}

async function handleSudoManagement(
  client: TelegramClient,
  message: any,
  myId: string,
  cmd: string,
  targetId: string,
) {
  if (cmd === "add") {
    const exists = db
      .prepare("SELECT 1 FROM sudo_users WHERE userId = ?")
      .get(targetId);
    if (exists)
      return client.sendMessage(message.chatId, {
        message: "✅ User is already a sudo user.",
      });
    const id = Math.random().toString(36).substring(2);
    db.prepare(
      "INSERT INTO sudo_users (id, userId, createdAt) VALUES (?, ?, ?)",
    ).run(id, targetId, Date.now());
    await client.sendMessage(message.chatId, {
      message: `✅ User \`${targetId}\` added to sudoers.`,
    });
  } else {
    const exists = db
      .prepare("SELECT 1 FROM sudo_users WHERE userId = ?")
      .get(targetId);
    if (!exists)
      return client.sendMessage(message.chatId, {
        message: "❌ User is not a sudo user.",
      });
    db.prepare("DELETE FROM sudo_users WHERE userId = ?").run(targetId);
    await client.sendMessage(message.chatId, {
      message: `✅ User \`${targetId}\` removed from sudoers.`,
    });
  }
}

class SmartStatus {
  private client: TelegramClient | null;
  private chatId: any;
  public messageId: number | null = null;
  private autoDelete: boolean;
  private replyTo: number | null = null;
  private resolvedChat: any = null;

  constructor(
    client: TelegramClient | null,
    chatId: any,
    autoDelete = true,
    replyTo: number | null = null,
  ) {
    this.client = client;
    this.chatId = chatId;
    this.autoDelete = autoDelete;
    this.replyTo = replyTo;
  }

  private async getChat() {
    if (this.resolvedChat) return this.resolvedChat;
    if (!this.client) return this.chatId;
    try {
      // 1. Try to get InputEntity (fastest, uses cache)
      this.resolvedChat = await this.client.getInputEntity(this.chatId);
      return this.resolvedChat;
    } catch (e) {
      try {
        // 2. Try to get full Entity (slower, may fetch from network)
        this.resolvedChat = await this.client.getEntity(this.chatId);
        return this.resolvedChat;
      } catch (e2) {
        // 3. Fallback to original
        return this.chatId;
      }
    }
  }

  async update(text: string, options: { parseMode?: any } = {}) {
    if (!this.client) {
      console.warn("SmartStatus: Client is null, cannot update status.");
      return;
    }
    if (!text || text.trim() === "") return;

    try {
      const chat = await this.getChat();
      const pMode = options.parseMode || "markdown";

      if (!this.messageId) {
        const msg = await this.client.sendMessage(chat, {
          message: text,
          parseMode: pMode,
          replyTo: this.replyTo || undefined,
        });
        this.messageId = msg.id;
      } else {
        try {
          await this.client.editMessage(chat, {
            message: this.messageId,
            text,
            parseMode: pMode,
          });
        } catch (err: any) {
          if (
            err.message?.includes("MESSAGE_ID_INVALID") ||
            err.message?.includes("MESSAGE_NOT_MODIFIED")
          ) {
            return;
          }
          console.error("SmartStatus Edit Error:", err.message);
        }
      }
    } catch (e) {
      console.error("SmartStatus Update Error:", e);
    }
  }

  async finish(text: string, options: { parseMode?: any; replyTo?: any } = {}) {
    if (!this.client || !text) return;
    try {
      const chat = await this.getChat();
      const pMode = options.parseMode || "markdown";

      if (!this.messageId) {
        const msg = await this.client.sendMessage(chat, {
          message: text,
          parseMode: pMode,
          replyTo: options.replyTo || this.replyTo || undefined,
        });
        this.messageId = msg.id;
      } else {
        try {
          await this.client.editMessage(chat, {
            message: this.messageId,
            text,
            parseMode: pMode,
          });
        } catch (e) {
          // Fallback to send new
          await this.client?.sendMessage(chat, {
            message: text,
            parseMode: pMode,
            replyTo: options.replyTo || this.replyTo || undefined,
          });
        }
      }
      this.autoDelete = false;
    } catch (e) {
      console.error("SmartStatus Finish Error:", e);
    }
  }

  async done(text: string | null = null, delay = 2000) {
    if (text) await this.update(text);
    if (this.autoDelete && this.messageId && this.client) {
      setTimeout(async () => {
        try {
          if (this.client && this.messageId) {
            await this.client.deleteMessages(this.chatId, [this.messageId], {
              revoke: true,
            });
          }
        } catch (e) {}
      }, delay);
    }
  }

  async fail(text: string) {
    await this.update(`❌ ${text}`);
    if (this.autoDelete) await this.done(null, 5000);
  }
}

const taskQueue = new TaskQueue(2);
const userCooldowns = new Map<string, number>();
const commandCooldowns = new Map<string, number>();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());

  // === API ROUTES FIRST (to avoid blocking routes by Telegram logic) ===
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      telegramConnected: client?.connected || false,
      timestamp: Date.now(),
    });
  });

  app.get("/api/state", (req, res) => {
    try {
      const messages = db
        .prepare("SELECT * FROM messages ORDER BY createdAt DESC LIMIT 50")
        .all();
      const targets = db.prepare("SELECT * FROM targets").all();
      const config = db
        .prepare("SELECT * FROM config WHERE id = 1")
        .get() as any;
      const logs = db
        .prepare("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100")
        .all();
      const sudoUsers = db.prepare("SELECT * FROM sudo_users").all();

      const payload = {
        messages,
        targets,
        config,
        logs,
        sudoUsers,
        isRunning: getIsRunning(),
        diagnostics: {
          isListenerActive,
          lastEventTimestamp,
          clientReady: !!client,
          aiConfigured: !!(
            config?.geminiKey ||
            config?.groqKey ||
            config?.openRouterKey ||
            config?.bluesmindsApiKey ||
            process.env.GEMINI_API_KEY
          ),
        },
      };
      res.json(payload);
    } catch (e) {
      console.error(`[ERR] /api/state:`, e);
      res.status(500).json({ status: "error", error: String(e) });
    }
  });

  app.post("/api/action", (req, res) => {
    const { action } = req.body;
    try {
      if (action === "start") startAutomationLoop();
      else if (action === "stop") setIsRunning(false);
      res.json({ success: true, isRunning: getIsRunning() });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/messages", (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Missing text" });
    const id = Math.random().toString(36).substring(2);
    db.prepare(
      "INSERT INTO messages (id, text, createdAt) VALUES (?, ?, ?)",
    ).run(id, text, Date.now());
    res.json({ success: true, id });
  });

  app.delete("/api/messages/:id", (req, res) => {
    db.prepare("DELETE FROM messages WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.post("/api/targets", (req, res) => {
    const { name, type } = req.body;
    if (!name) return res.status(400).json({ error: "Missing name" });
    const id = Math.random().toString(36).substring(2);
    db.prepare("INSERT INTO targets (id, name, type) VALUES (?, ?, ?)").run(
      id,
      name,
      type || "group",
    );
    res.json({ success: true, id });
  });

  app.delete("/api/targets/:id", (req, res) => {
    db.prepare("DELETE FROM targets WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.post("/api/config", async (req, res) => {
    const updates = req.body;
    const allowed = [
      "minDelaySeconds",
      "maxDelaySeconds",
      "adminUsers",
      "aiEnabled",
      "aiProvider",
      "geminiKey",
      "groqKey",
      "openRouterKey",
      "bluesmindsApiKey",
      "autoDeleteCommands",
      "autoDeleteDelay",
      "autoReplyDM",
      "autoReplyMention",
      "typingSimulation",
      "conversationMemory",
      "autoReplyDelayMin",
      "autoReplyDelayMax",
      "nsfwEnabled",
      "searchEnabled",
      "searchProvider",
      "searchApiKey",
      "aiMode",
      "formattingEnabled",
      "autoReplyPersonality",
      "nsfwPersonality",
      "activeModel",
      "deepThinking",
      "sudoUsers",
      "publicCommandsEnabled",
      "blacklistedUsers",
      "whitelistedUsers",
      "autoDeleteWhitelist",
      "autoReplyWhitelist",
      "autoReplyBlacklist",
      "youtube_cookies",
      "globalCooldown",
      "perUserCooldown",
      "maxConcurrentTasks",
      "cleanupEnabled",
      "telegramApiId",
      "telegramApiHash",
      "telegramStringSession",
    ];

    // Snapshot existing Telegram credentials BEFORE saving so we can detect changes
    const prevCreds = db.prepare(
      "SELECT telegramApiId, telegramApiHash, telegramStringSession FROM config WHERE id = 1"
    ).get() as { telegramApiId: string; telegramApiHash: string; telegramStringSession: string };

    try {
      for (const key of Object.keys(updates)) {
        if (allowed.includes(key)) {
          let value: any = updates[key];
          // SQLite only accepts primitive values — coerce arrays/objects to strings
          if (Array.isArray(value)) {
            value = value.join(",");
          } else if (value !== null && typeof value === "object") {
            value = JSON.stringify(value);
          }
          db.prepare(`UPDATE config SET ${key} = ? WHERE id = 1`).run(value);
        }
      }
    } catch (err) {
      console.error("[api/config] Failed to save config:", err);
      return res.status(500).json({ error: "Failed to save configuration" });
    }

    // If cookies were updated, write them to disk immediately
    if (updates.youtube_cookies !== undefined) {
      syncCookiesToDisk();
    }

    // Only reconnect Telegram if the credentials actually changed
    const credsChanged =
      (updates.telegramApiId !== undefined && updates.telegramApiId !== prevCreds?.telegramApiId) ||
      (updates.telegramApiHash !== undefined && updates.telegramApiHash !== prevCreds?.telegramApiHash) ||
      (updates.telegramStringSession !== undefined && updates.telegramStringSession !== prevCreds?.telegramStringSession);

    if (credsChanged) {
      const connected = await loadTelethon();
      return res.json({ success: true, telegramConnected: connected });
    }

    res.json({ success: true, telegramConnected: null });
  });

  app.get("/api/nsfw/data", (req, res) => {
    const users = db.prepare("SELECT * FROM user_nsfw_prefs").all();
    const logs = db
      .prepare("SELECT * FROM nsfw_logs ORDER BY timestamp DESC LIMIT 100")
      .all();
    res.json({ users, logs });
  });

  app.post("/api/nsfw/users/:userId/toggle", (req, res) => {
    const { userId } = req.params;
    const { enabled, nsfwEnabled } = req.body;
    const isEnabled = enabled ?? nsfwEnabled;
    db.prepare(
      "INSERT OR REPLACE INTO user_nsfw_prefs (userId, nsfwEnabled, ageConfirmed, updatedAt) VALUES (?, ?, 1, ?)",
    ).run(userId, isEnabled ? 1 : 0, Date.now());
    res.json({ success: true });
  });

  app.delete("/api/nsfw/logs", (req, res) => {
    db.prepare("DELETE FROM nsfw_logs").run();
    res.json({ success: true });
  });

  app.delete("/api/logs", (req, res) => {
    db.prepare("DELETE FROM logs").run();
    res.json({ success: true });
  });

  app.get("/api/exports", (req, res) => {
    const list = db
      .prepare("SELECT * FROM exports ORDER BY createdAt DESC")
      .all();
    res.json({ exports: list });
  });

  app.delete("/api/exports/:id", (req, res) => {
    const exp = db
      .prepare("SELECT filename FROM exports WHERE id = ?")
      .get(req.params.id) as any;
    if (exp) {
      const type = db
        .prepare("SELECT type FROM exports WHERE id = ?")
        .get(req.params.id) as any;
      const dir = type?.type === "music" ? musicDir : exportsDir;
      fs.remove(path.join(dir, exp.filename)).catch(() => {});
    }
    db.prepare("DELETE FROM exports WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/exports/download/:id", (req, res) => {
    const exp = db.prepare("SELECT * FROM exports WHERE id = ?").get(req.params.id) as any;
    if (!exp) return res.status(404).send("File not found");
    const dir = exp.type === "music" ? musicDir : exportsDir;
    res.download(path.join(dir, exp.filename));
  });

  app.post(
    "/api/exports/pdf-images",
    upload.array("images", 20),
    async (req, res) => {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0)
        return res.status(400).json({ error: "No images uploaded" });

      const id = Math.random().toString(36).substring(2);
      const filename = `images_converted_${id}.pdf`;
      const filepath = path.join(exportsDir, filename);

      await taskQueue.add(async () => {
        const doc = new PDFDocument({ autoFirstPage: false });
        const stream = fs.createWriteStream(filepath);
        doc.pipe(stream);

        for (const file of files) {
          try {
            const img = await sharp(file.path).toBuffer();
            const imgObj = await sharp(img).metadata();
            doc.addPage({ size: [imgObj.width || 595, imgObj.height || 842] });
            doc.image(img, 0, 0, {
              width: imgObj.width,
              height: imgObj.height,
            });
            await fs.remove(file.path);
          } catch (e) {
            console.error("PDF Image add error:", e);
          }
        }
        doc.end();
        await new Promise<void>((resolve, reject) => {
          stream.on("finish", resolve);
          stream.on("error", reject);
        });

        db.prepare(
          "INSERT INTO exports (id, filename, filepath, createdAt, type, status) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(id, filename, filepath, Date.now(), "image-to-pdf", "success");

        addLog(
          `Converted ${files.length} images to PDF: ${filename}`,
          "success",
        );
      });

      res.json({ success: true, id, filename });
    },
  );

  app.post("/api/music/download", async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "No query provided" });
    try {
      const searchString =
        query.toLowerCase().includes("audio") ||
        query.toLowerCase().includes("lyric")
          ? query
          : query + " audio";
      const r = await yts(searchString);
      const video =
        r.videos.find(
          (v) =>
            !v.title.toLowerCase().includes("music video") &&
            !v.title.toLowerCase().includes("official video"),
        ) || r.videos[0];
      if (!video) return res.status(404).json({ error: "No results found" });

      const id = Math.random().toString(36).substring(2);
      const filename = `music_${id}.mp3`;
      const filepath = path.join(musicDir, filename);

      taskQueue.add(async () => {
        try {
          await downloadYoutube(video.url, filepath);
          db.prepare(
            "INSERT INTO exports (id, filename, filepath, createdAt, type, status) VALUES (?, ?, ?, ?, ?, ?)",
          ).run(id, filename, filepath, Date.now(), "music", "success");
          addLog(`Downloaded music via dashboard: ${video.title}`, "success");

          if (client) {
            const defaultTarget = db
              .prepare("SELECT name FROM targets LIMIT 1")
              .get() as any;
            if (defaultTarget) {
              try {
                await client.sendMessage(defaultTarget.name, {
                  message: `🎵 **${video.title}**\n👤 ${video.author.name}`,
                  file: filepath,
                  attributes: [
                    new Api.DocumentAttributeAudio({
                      title: video.title,
                      performer: video.author.name,
                      duration: video.duration.seconds,
                      voice: false,
                    }),
                  ],
                });
              } catch (e) {}
            }
          }
        } catch (err) {
          console.error("Music download task error:", err);
        }
      });

      res.json({
        success: true,
        id,
        filename,
        title: video.title,
        author: video.author.name,
        thumbnail: video.image,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/sudo-users", (req, res) => {
    const { userId, id: bodyId, name } = req.body;
    const resolvedUserId = userId || bodyId;
    if (!resolvedUserId) return res.status(400).json({ error: "Missing userId" });
    const id = Math.random().toString(36).substring(2);
    db.prepare(
      "INSERT INTO sudo_users (id, userId, createdAt) VALUES (?, ?, ?)",
    ).run(id, resolvedUserId, Date.now());
    res.json({ success: true, id });
  });

  app.delete("/api/sudo-users/:id", (req, res) => {
    db.prepare("DELETE FROM sudo_users WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/youtubedl/check", async (req, res) => {
    try {
      const result = await youtubedl("--version");
      res.json({ version: result });
    } catch (e) {
      res
        .status(500)
        .json({ error: "yt-dlp binary not found or not working." });
    }
  });

  // API 404 handler - ensures API errors return JSON, not the SPA fallback HTML
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: `API route ${req.originalUrl} not found` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // === LISTEN EARLY (to prevent "Failed to fetch" connection errors) ===
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`AI Configuration Check:`);
    console.log(
      `- GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? "Present" : "MISSING"}`,
    );
  });

  // === TELEGRAM LOGIC (Run in background) ===
  let client: TelegramClient | null = null;
  let runningLoop = false;
  let isConnecting = false;

  const getIsRunning = () => {
    const row = db
      .prepare("SELECT isRunning FROM config WHERE id = 1")
      .get() as any;
    return row?.isRunning === 1;
  };

  const setIsRunning = (state: boolean) => {
    db.prepare("UPDATE config SET isRunning = ? WHERE id = 1").run(
      state ? 1 : 0,
    );
    runningLoop = state;
  };

  const addLog = (
    message: string,
    type: "info" | "success" | "warn" | "error" = "info",
  ) => {
    try {
      const id = Math.random().toString(36).substring(2);
      db.prepare(
        "INSERT INTO logs (id, timestamp, message, type) VALUES (?, ?, ?, ?)",
      ).run(id, Date.now(), message, type);
    } catch (e) {
      console.error("[Log Error]:", e);
    }
  };

  const downloadYoutube = async (url: string, output: string) => {
    const commonFlags: any = {
      extractAudio: true,
      audioFormat: "mp3",
      noPlaylist: true,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      geoBypass: true,
      retries: 10,
      socketTimeout: 30,
      jsRuntimes: "node",
      output: output,
    };

    if (fs.existsSync(youtubeCookiesPath)) {
      commonFlags.cookies = youtubeCookiesPath;
    }

    try {
      addLog(`Attempting download with primary flags...`, "info");
      await youtubedl(url, commonFlags);
    } catch (err: any) {
      addLog(
        `Primary download failed: ${err.message}. Retrying with alternate settings...`,
        "warn",
      );
      try {
        const fallbackFlags = { ...commonFlags, format: "bestaudio/best" };
        await youtubedl(url, fallbackFlags);
      } catch (err2: any) {
        addLog(
          `Fallback download failed: ${err2.message}. Trying play-dl as last resort...`,
          "error",
        );
        const play = (await import("play-dl")).default;
        const stream = await play.stream(url, { quality: 1 });
        const writer = fs.createWriteStream(output);
        stream.stream.pipe(writer);
        await new Promise<void>((resolve, reject) => {
          stream.stream.on("error", (e) => {
            writer.destroy();
            reject(e);
          });
          writer.on("finish", () => resolve());
          writer.on("error", reject);
        });
      }
    }
  };

  const statusUpdate = async (chatId: any, messageId: number, text: string) => {
    try {
      await client?.editMessage(chatId, { message: messageId, text });
    } catch (e) {
      console.error("Failed to edit message:", e);
    }
  };

  async function handleMusicCommand(
    message: any,
    text: string,
    status?: SmartStatus,
  ) {
    const query = text.split(" ").slice(1).join(" ").trim();
    if (!query) {
      if (status) {
        await status.fail("Usage: /music <song name>");
      } else {
        await client?.sendMessage(message.chatId, {
          message: "❌ Usage: /music <song name>",
        });
      }
      return;
    }

    const effectiveStatus = status || new SmartStatus(client, message.chatId);
    if (!status && client) await effectiveStatus.update(`🔍 Searching...`);

    try {
      const searchString =
        query.toLowerCase().includes("audio") ||
        query.toLowerCase().includes("lyric")
          ? query
          : query + " audio";
      const r = await yts(searchString);
      const video =
        r.videos.find(
          (v) =>
            !v.title.toLowerCase().includes("music video") &&
            !v.title.toLowerCase().includes("official video"),
        ) || r.videos[0];

      if (!video) {
        await effectiveStatus.fail("No results found.");
        return;
      }

      await effectiveStatus.update(`⏳ Waiting in queue...`);

      await taskQueue.add(async () => {
        await effectiveStatus.update(`⏳ Downloading...`);

        const id = Math.random().toString(36).substring(2);
        const filename = `music_${id}.mp3`;
        const filepath = path.join(musicDir, filename);

        try {
          await downloadYoutube(video.url, filepath);
          await effectiveStatus.update(`⚙️ Processing...`);

          await client?.sendMessage(message.chatId, {
            message: `🎶 **${video.title}**\n👤 ${video.author.name}\n⏱ ${video.timestamp}`,
            file: filepath,
            replyTo: message.id,
          });

          await effectiveStatus.done("Done", 0);
          addLog(`Downloaded music: ${video.title}`, "success");

          setTimeout(() => fs.remove(filepath).catch(() => {}), 10000);
        } catch (downloadErr) {
          await effectiveStatus.fail("Download failed.");
        }
      });
    } catch (e) {
      await effectiveStatus.fail("Search failed.");
    }
  }

  async function handleStickerCommand(
    client: TelegramClient,
    message: any,
    status: SmartStatus,
  ) {
    if (!message.replyToMsgId)
      return status.fail("Reply to a message with /stcr");
    await status.update(`⏳ Preparing Quotly sticker...`);

    try {
      const repl = await client.getMessages(message.chatId, {
        ids: [message.replyToMsgId],
      });
      if (!repl || repl.length === 0)
        return status.fail("Could not find reply message.");

      const target = repl[0];
      const sender = target.sender;
      const senderId = target.senderId?.toString() || "0";

      let senderName = "User";
      if (sender) {
        const s = sender as any;
        senderName = s.firstName
          ? `${s.firstName} ${s.lastName || ""}`.trim()
          : s.username || "User";
      }

      let avatarBase64 = "";
      try {
        const photo = await client.downloadProfilePhoto(target.senderId);
        if (photo && Buffer.isBuffer(photo)) {
          avatarBase64 = photo.toString("base64");
        }
      } catch (e) {}

      const cleanText = (target.message || "").replace(
        /[<>&"']/g,
        (c: string) => {
          switch (c) {
            case "<":
              return "&lt;";
            case ">":
              return "&gt;";
            case "&":
              return "&amp;";
            case '"':
              return "&quot;";
            case "'":
              return "&apos;";
            default:
              return c;
          }
        },
      );

      const colors = [
        "#ff7474",
        "#74ff74",
        "#7474ff",
        "#ffff74",
        "#ff74ff",
        "#74ffff",
      ];
      const nameColor =
        colors[Math.abs(parseInt(senderId) || 0) % colors.length];
      const fontSize =
        cleanText.length > 300 ? 16 : cleanText.length > 150 ? 20 : 26;
      const senderNameFixed =
        senderName.length > 20
          ? senderName.substring(0, 17) + "..."
          : senderName;

      const wrapText = (text: string, maxChars: number) => {
        const words = text.split(" ");
        const lines = [];
        let currentLine = "";
        words.forEach((word) => {
          if ((currentLine + word).length > maxChars) {
            lines.push(currentLine.trim());
            currentLine = word + " ";
          } else {
            currentLine += word + " ";
          }
        });
        lines.push(currentLine.trim());
        return lines.filter((l) => l.length > 0);
      };

      const wrapLimit =
        cleanText.length > 200 ? 45 : cleanText.length > 100 ? 35 : 28;
      const wrappedLines = wrapText(
        target.message || (target.media ? "[Media]" : ""),
        wrapLimit,
      ).slice(0, 15);

      const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <rect width="512" height="512" fill="transparent"/>
        ${
          avatarBase64
            ? `
        <defs><clipPath id="avatarClip"><circle cx="60" cy="452" r="40" /></clipPath></defs>
        <circle cx="60" cy="452" r="40" fill="#2c2c2e" />
        <image x="20" y="412" width="80" height="80" href="data:image/jpeg;base64,${avatarBase64}" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice" />
        `
            : `
        <circle cx="60" cy="452" r="40" fill="${nameColor}" />
        <text x="60" y="464" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="36" fill="white">${senderName.substring(0, 1).toUpperCase()}</text>
        `
        }
        <path d="M110 452 L130 432 L130 50 Q 130 30 150 30 L480 30 Q 500 30 500 50 L500 432 Q 500 452 480 452 Z" fill="#1c1c1e" />
        <text x="150" y="70" font-family="sans-serif" font-weight="bold" font-size="24" fill="${nameColor}">${senderNameFixed.replace(/[<>&"']/g, (s) => (s === "<" ? "&lt;" : s === ">" ? "&gt;" : s))}</text>
        <text x="150" y="110" font-family="sans-serif" font-size="${fontSize}" fill="white">
          ${wrappedLines.map((line, i) => `<tspan x="150" dy="${i === 0 ? 0 : fontSize * 1.3}">${line.replace(/[<>&"']/g, (s) => (s === "<" ? "&lt;" : s === ">" ? "&gt;" : s))}</tspan>`).join("")}
        </text>
      </svg>`;

      const stickerBuffer = await sharp(Buffer.from(svg))
        .webp({ quality: 100 })
        .toBuffer();
      const stcrId = Math.random().toString(36).substring(2);
      const filepath = path.join(exportsDir, `quotly_${stcrId}.webp`);
      await fs.writeFile(filepath, stickerBuffer);

      await status.update(`📤 Sending Quotly...`);
      await client.sendMessage(message.chatId, {
        file: filepath,
        replyTo: message.id,
      });
      await status.done(null, 0);
      addLog(`Created Quotly sticker for ${senderName}`, "success");
      setTimeout(() => fs.remove(filepath).catch(() => {}), 10000);
    } catch (e) {
      await status.fail(`Quotly failed: ${String(e)}`);
    }
  }

  async function handlePdfCommand(
    client: TelegramClient,
    message: any,
    status: SmartStatus,
  ) {
    if (!message.replyToMsgId)
      return status.fail("Reply to a message with /pdf");
    await status.update(`⏳ Processing content...`);

    try {
      const repl = await client.getMessages(message.chatId, {
        ids: [message.replyToMsgId],
      });
      if (!repl || repl.length === 0) return status.fail("Message not found.");

      const target = repl[0];
      const doc = new PDFDocument();
      const pdfId = Math.random().toString(36).substring(2);
      const filename = `export_${pdfId}.pdf`;
      const filepath = path.join(exportsDir, filename);
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      if (target.media && (target.media as any).photo) {
        await status.update(`🎞️ Converting image to PDF...`);
        const buf = await client.downloadMedia(target.media, {});
        if (buf) {
          const img = await sharp(buf).toBuffer();
          const meta = await sharp(img).metadata();
          doc.addPage({ size: [meta.width || 512, meta.height || 512] });
          doc.image(img, 0, 0);
        }
      } else if (target.message) {
        doc.fontSize(12).text(target.message);
      } else {
        return status.fail("No supported content found.");
      }

      doc.end();
      await new Promise<void>((resolve) =>
        stream.on("finish", () => resolve()),
      );

      await status.update(`📤 Uploading PDF...`);
      await client.sendMessage(message.chatId, {
        file: filepath,
        replyTo: message.id,
      });
      await status.done(null, 0);
      addLog(`Exported PDF: ${filename}`, "success");
      setTimeout(() => fs.remove(filepath).catch(() => {}), 10000);
    } catch (e) {
      await status.fail(`PDF conversion failed.`);
    }
  }

  async function maybeHandleAutoReply(
    client: TelegramClient,
    message: any,
    config: any,
    myId: string,
    myUsername: string,
  ) {
    if (config.aiEnabled !== 1) {
      // Silent fail if disabled, no spamming logs
      return;
    }

    const text = (message.message || "").trim();
    if (!text) return;

    // Anti-Spam: Ignore commands
    if (text.startsWith("/") || text.startsWith(".")) return;

    const senderId = message.senderId?.toString();
    const chatIdStr = message.chatId?.toString();
    const isPrivate = message.isPrivate;
    let isNSFWActive = false;

    // Anti-Spam: Don't reply to bots
    if (message.sender?.bot) return;

    // Check if it's a DM auto-reply
    let shouldReply = false;
    let reason = "";

    if (isPrivate) {
      if (config.autoReplyDM === 1) {
        console.log(`[AI-Auto] DM detected from ${senderId}`);
        shouldReply = true;
      } else {
        reason = "DM auto-reply disabled in config";
      }
    }

    // Check if it's a mention or reply in a group
    if (!isPrivate) {
      if (config.autoReplyMention === 1) {
        const lowerText = text.toLowerCase();
        const isMentioned =
          (myUsername && lowerText.includes(`@${myUsername.toLowerCase()}`)) ||
          (myId && lowerText.includes(myId));

        let isReplyToMe = false;
        const replyMsgId = message.replyTo?.replyToMsgId;
        if (replyMsgId) {
          try {
            // Use inputChat or message.chatId directly (not string)
            const target = message.inputChat || message.chatId;
            const repliedMsg = await client.getMessages(target, {
              ids: [replyMsgId],
            });
            if (
              repliedMsg &&
              repliedMsg.length > 0 &&
              (repliedMsg[0].out || repliedMsg[0].senderId?.toString() === myId)
            ) {
              isReplyToMe = true;
            }
          } catch (e) {
            console.error(
              `[AI-Auto] Error fetching replied message for chat ${chatIdStr}:`,
              e,
            );
          }
        }

        if (isMentioned || isReplyToMe) {
          console.log(
            `[AI-Auto] Triggered in group! Mentioned: ${isMentioned}, ReplyToMe: ${isReplyToMe}`,
          );
          shouldReply = true;
        } else {
          reason = "Not mentioned or replied to in group";
        }
      } else {
        reason = "Group mentions disabled in config";
      }
    }

    if (!shouldReply) {
      if (reason) console.log(`[AI-Auto] Skipping ${senderId}: ${reason}`);
      return;
    }

    // Blacklist check
    const blacklist = (config.autoReplyBlacklist || "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    if (blacklist.includes(senderId) || blacklist.includes(chatIdStr)) {
      console.log(
        `[AI-Auto] Blocked by blacklist: ${senderId} or ${chatIdStr}`,
      );
      return;
    }

    // Whitelist check (if not empty)
    const whitelist = (config.autoReplyWhitelist || "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    if (
      whitelist.length > 0 &&
      !whitelist.includes(senderId) &&
      !whitelist.includes(chatIdStr)
    ) {
      console.log(`[AI-Auto] Not in whitelist: ${senderId} or ${chatIdStr}`);
      return;
    }

    if (isPrivate && config.nsfwEnabled === 1) {
      const userPref = db
        .prepare(
          "SELECT nsfwEnabled, ageConfirmed FROM user_nsfw_prefs WHERE userId = ?",
        )
        .get(senderId) as any;
      if (userPref?.nsfwEnabled === 1 && userPref?.ageConfirmed === 1) {
        isNSFWActive = true;
      }
    }

    // Moderation filter
    const modResult = await moderateContent(text);
    if (!modResult.safe) {
      console.log(
        `[AI-Auto] NSFW Content Violation by ${senderId}: ${modResult.reason}`,
      );
      const nsfwLogId = Math.random().toString(36).substring(2);
      db.prepare(
        "INSERT INTO nsfw_logs (id, timestamp, userId, chatId, message, violation) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(nsfwLogId, Date.now(), senderId, chatIdStr, text, modResult.reason);

      if (isPrivate) {
        await client.sendMessage(message.chatId, {
          message:
            "⚠️ **Moderation:** Your message violates our safety guidelines. NSFW mode has been temporarily restricted for this conversation.",
          replyTo: message.id,
        });
      }
      return;
    }

    console.log(
      `[AI-Auto] Processing reply for ${chatIdStr} (NSFW: ${isNSFWActive})...`,
    );
    addLog(
      `Processing auto-reply for ${chatIdStr} (NSFW: ${isNSFWActive})`,
      "info",
    );

    // Anti-Spam Lock
    const lockKey = `auto:${chatIdStr}:${message.id}`;
    if (aiProcessingLock.has(lockKey)) return;
    aiProcessingLock.add(lockKey);

    // Cooldown check
    const now = Date.now();
    const lastReplyKey = `lastAuto:${chatIdStr}`;
    const lastReply = userCooldowns.get(lastReplyKey) || 0;
    const cooldownSec = config.perUserCooldown || 10;
    if (now - lastReply < cooldownSec * 1000) {
      console.log(`[AI-Auto] Cooldown active for ${chatIdStr}`);
      aiProcessingLock.delete(lockKey);
      return;
    }
    userCooldowns.set(lastReplyKey, now);

    // Random Delay
    const minDelay = (config.autoReplyDelayMin || 3) * 1000;
    const maxDelay = (config.autoReplyDelayMax || 15) * 1000;
    const actualDelay =
      Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    console.log(
      `[AI-Auto] AI reply triggered for ${chatIdStr}. Delay: ${actualDelay / 1000}s`,
    );

    setTimeout(async () => {
      try {
        if (!client) return;

        let targetPeer = message.inputChat || message.chatId;
        try {
          // Pre-resolve it to avoid errors in invoke or SmartStatus
          targetPeer = await client.getInputEntity(targetPeer);
        } catch (e) {
          try {
            targetPeer = await client.getEntity(targetPeer);
          } catch (e2) {}
        }

        const status = new SmartStatus(client, targetPeer, false, message.id);

        // Typing simulation
        if (config.typingSimulation === 1) {
          try {
            await client.invoke(
              new Api.messages.SetTyping({
                peer: targetPeer,
                action: new Api.SendMessageTypingAction(),
              }),
            );
          } catch (e) {}
        }

        await status.update("🔍 **Searching...**");
        const aiRes = await getAIResponse(
          text,
          config,
          chatIdStr,
          senderId,
          isNSFWActive,
        );

        if (aiRes && client) {
          // Post-generation moderation
          const responseMod = await moderateContent(aiRes);
          const formatted = formatAiMessage(
            responseMod.safe
              ? aiRes
              : "I cannot fulfill that request due to safety restrictions.",
          );

          await status.update(formatted.text, {
            parseMode: formatted.parseMode,
          });
          addLog(
            `Auto-replied to ${chatIdStr}: ${formatted.text.substring(0, 30)}...`,
            "success",
          );
        } else {
          await status.finish(
            "❌ **AI Error:** All AI providers failed. Please add a valid API key in **AI Settings** (Gemini key recommended — free at aistudio.google.com/apikey) or set `GEMINI_API_KEY` in your Railway environment variables.",
          );
        }
      } catch (e: any) {
        console.error(`[AI-Auto] Error:`, e.message || e);
      } finally {
        setTimeout(() => aiProcessingLock.delete(lockKey), 60000);
      }
    }, actualDelay);
  }

  const loadTelethon = async () => {
    const config = db.prepare("SELECT * FROM config WHERE id = 1").get() as any;

    // Prioritize DB config if set, otherwise fallback to env
    const apiId = config?.telegramApiId || process.env.TELEGRAM_API_ID;
    const apiHash = config?.telegramApiHash || process.env.TELEGRAM_API_HASH;
    const stringSessionStr =
      config?.telegramStringSession || process.env.TELEGRAM_STRING_SESSION;

    if (!apiId || !apiHash || !stringSessionStr) {
      addLog(
        "Telegram credentials missing. Please set API ID, Hash, and Session in Settings.",
        "warn",
      );
      console.warn(
        "[BOT] Telegram credentials missing. apiId:",
        !!apiId,
        "apiHash:",
        !!apiHash,
        "session:",
        !!stringSessionStr,
      );
      return false;
    }

    if (client) {
      try {
        await client.disconnect();
      } catch (e) {}
    }

    if (isConnecting) return false;
    isConnecting = true;

    try {
      addLog("Attempting to connect to Telegram...", "info");
      const stringSession = new StringSession(stringSessionStr);
      client = new TelegramClient(
        stringSession,
        parseInt(apiId.toString()),
        apiHash,
        {
          connectionRetries: 10,
          useWSS: false,
          autoReconnect: true,
        },
      );

      await client.connect();
      const me: any = await client.getMe();
      const myId = me.id.toString();
      const myUsername = me.username || "";
      addLog(`Connected as ${me.firstName} (ID: ${myId})`, "success");
      console.log(`[BOT] Connected successfully as ${myId}`);

      // Set up Userbot logic
      const messageHandler = async (event: any) => {
        try {
          if (!client) return;
          const message = event.message;
          if (!message || !message.message) return;

          const textRaw = (message.message || "").trim();
          const text = textRaw.toLowerCase();
          const senderId = message.senderId?.toString();
          const chatIdStr = message.chatId?.toString();
          const isMe = message.out || (myId && senderId === myId);

          let config = db
            .prepare("SELECT * FROM config WHERE id = 1")
            .get() as any;
          const admins = config?.adminUsers
            ? config.adminUsers.split(",").map((s: string) => s.trim())
            : [];

          const isCommand = textRaw.startsWith("/") || textRaw.startsWith(".");

          // Non-command messages (plain text, mentions, replies) go straight to AI — no permission gate
          if (!isMe && !isCommand) {
            await maybeHandleAutoReply(client, message, config, myId, myUsername);
            return;
          }

          // Permission check only applies to bot commands
          const auth = await PermissionManager.check(
            text,
            senderId || "",
            chatIdStr || "",
            myId,
          );

          console.log(
            `[BOT] Incoming: "${textRaw.substring(0, 30)}" from ${senderId}, Level: ${auth.level}, Allowed: ${auth.allowed}`,
          );

          if (!auth.allowed) {
            if (auth.reason && !isMe) {
              await client
                ?.sendMessage(message.chatId, {
                  message: auth.reason,
                  replyTo: message.id,
                })
                .catch(() => {});
            }
            return;
          }

          // 1. Universal / Diagnostics
          if (
            text === "/aitest" ||
            text === ".aitest" ||
            text === "/ping" ||
            text === ".ping" ||
            text === "/debug" ||
            text === ".debug"
          ) {
            if (isMe || auth.level >= PermissionLevel.SUDO) {
              console.log(
                `[BOT] Diagnostic command triggered: ${text} from ${senderId}`,
              );
              addLog(`Diagnostic: ${text} from ${senderId}`, "info");
            }
          }

          // 2. Auto-Reply Logic (for commands that also check auto-reply)
          if (!isMe) {
            await maybeHandleAutoReply(
              client,
              message,
              config,
              myId,
              myUsername,
            );
          }

          // 3. NSFW MODE
          if (config.nsfwEnabled === 1 && message.isPrivate && !isMe) {
            if (text === "/nsfw on" || text === ".nsfw on") {
              const userPref = db
                .prepare("SELECT * FROM user_nsfw_prefs WHERE userId = ?")
                .get(senderId) as any;
              if (userPref?.ageConfirmed === 1) {
                db.prepare(
                  "INSERT OR REPLACE INTO user_nsfw_prefs (userId, nsfwEnabled, ageConfirmed, updatedAt) VALUES (?, 1, 1, ?)",
                ).run(senderId, Date.now());
                await client.sendMessage(message.chatId, {
                  message:
                    "🔞 **Mature Mode Activated.** Your AI friend is now in mature chat mode. Rest assured, this is a private conversation between consenting adults only.",
                  replyTo: message.id,
                });
              } else {
                await client.sendMessage(message.chatId, {
                  message:
                    "⚠️ **Age Verification Required**\n\nThis mode is for adults only (18+). By clicking the button below or typing `/confirmage`, you confirm that you are at least 18 years old and consent to mature AI conversations.\n\n_This feature is private and disabled in groups._",
                  replyTo: message.id,
                });
              }
              return;
            }
            if (text === "/nsfw off" || text === ".nsfw off") {
              db.prepare(
                "INSERT OR REPLACE INTO user_nsfw_prefs (userId, nsfwEnabled, ageConfirmed, updatedAt) VALUES (?, 0, 1, ?)",
              ).run(senderId, Date.now());
              await client.sendMessage(message.chatId, {
                message:
                  "✅ **Mature Mode Deactivated.** Returning to standard conversational mode.",
                replyTo: message.id,
              });
              return;
            }
            if (text === "/nsfw status" || text === ".nsfw status") {
              const userPref = db
                .prepare(
                  "SELECT nsfwEnabled FROM user_nsfw_prefs WHERE userId = ?",
                )
                .get(senderId) as any;
              const status =
                userPref?.nsfwEnabled === 1 ? "Active 🔞" : "Inactive 👤";
              await client.sendMessage(message.chatId, {
                message: `🔞 **Mature Mode Status:** ${status}`,
                replyTo: message.id,
              });
              return;
            }
            if (text === "/confirmage" || text === ".confirmage") {
              db.prepare(
                "INSERT OR REPLACE INTO user_nsfw_prefs (userId, nsfwEnabled, ageConfirmed, updatedAt) VALUES (?, 1, 1, ?)",
              ).run(senderId, Date.now());
              await client.sendMessage(message.chatId, {
                message:
                  "✅ **Age Confirmed.** Mature Mode has been enabled for you. Type `/nsfw off` anytime to disable it.",
                replyTo: message.id,
              });
              return;
            }
          }

          // 4. Basic Diagnostic (Public)
          if (text === "/ping" || text === ".ping") {
            await client?.sendMessage(message.chatId, {
              message: "🏓 **Pong!** Bot is alive.",
              replyTo: message.id,
            });
            return;
          }

          if (text === "/debug" || text === ".debug") {
            const debugInfo = `🔍 **Bot Debug Info**
- **Listener:** ${isListenerActive ? "✅ Active" : "❌ Inactive"}
- **AI Enabled:** ${config.aiEnabled === 1 ? "✅ Yes" : "❌ No"}
- **Provider:** ${config.aiProvider}
- **My ID:** ${myId}
- **Your Level:** ${auth.level}
- **Uptime:** ${Math.floor(process.uptime() / 60)}m`;
            await client?.sendMessage(message.chatId, {
              message: debugInfo,
              replyTo: message.id,
            });
            return;
          }

          // 5. PUBLIC COMMANDS CHECK
          const cmdName = text.replace("/", "").replace(".", "").split(" ")[0];
          const isPublicCommand = [
            "ans",
            "music",
            "song",
            "gif",
            "sticker",
            "pdf",
            "summarize",
            "translate",
            "help",
            "commands",
          ].includes(cmdName);

          if (isPublicCommand) {
            if (!auth.allowed && !isMe) {
              if (auth.reason)
                await client.sendMessage(message.chatId, {
                  message: auth.reason,
                  replyTo: message.id,
                });
              return;
            }

            // Anti-Spam (Public Users only)
            if (!isMe && auth.level === PermissionLevel.PUBLIC && senderId) {
              const now = Date.now();
              const lastUsed = userCooldowns.get(senderId) || 0;
              const cooldown = (config.perUserCooldown || 10) * 1000;
              if (now - lastUsed < cooldown) {
                const remain = Math.ceil((cooldown - (now - lastUsed)) / 1000);
                await client.sendMessage(message.chatId, {
                  message: `⏳ **Cooldown:** Please wait ${remain}s.`,
                  replyTo: message.id,
                });
                return;
              }
              userCooldowns.set(senderId, now);
            }

            if (
              text === "/commands" ||
              text === ".commands" ||
              text === "/help" ||
              text === ".help"
            ) {
              await CommandProcessor.process(
                client,
                message,
                config,
                myId,
                "help",
                textRaw,
                async (status) => {
                  const helpMsg = `🤖 **Bot Commands**

**Public Commands** 👤
• \`/ans\` - Reply to get AI answer
• \`/music\` - Search & download song
• \`/gif <query>\` - Search & send GIF
• \`/sticker\` - Reply to photo for sticker
• \`/pdf\` - Reply to text for PDF
• \`/summarize\` - Reply to chat history
• \`/translate <lang>\` - Translate text

**Admin Commands** 🔐
• \`/startbot\` - Resume automation
• \`/stopbot\` - Pause automation
• \`/sudoadd <id>\` - Add sudo user
• \`/sudoremove <id>\` - Remove sudo user
• \`/model <name>\` - Change AI model
• \`/exportchat <n>\` - Export chat logs

_Visit the dashboard for advanced configuration._`;
                  await status.finish(helpMsg);
                },
              );
              return;
            }

            if (text.startsWith("/ans") || text.startsWith(".ans")) {
              await CommandProcessor.process(
                client,
                message,
                config,
                myId,
                "ans",
                textRaw,
                async (status) => {
                  if (!message.replyToMsgId)
                    return status.fail("Reply to a message with /ans");
                  const repl = await client.getMessages(message.chatId, {
                    ids: [message.replyToMsgId],
                  });
                  const promptText = (repl[0]?.message || "").trim();
                  if (!promptText)
                    return status.fail("No text content in replied message.");
                  await status.update(`🧠 Thinking...`);
                  await taskQueue.add(async () => {
                    const aiRes = await getAIResponse(
                      promptText,
                      config,
                      message.chatId?.toString(),
                      senderId,
                    );
                    if (aiRes) {
                      const formatted = formatAiMessage(aiRes);
                      await status.finish(formatted.text, {
                        parseMode: formatted.parseMode,
                        replyTo: repl[0].id,
                      });
                    } else {
                      await status.fail("AI failed to respond.");
                    }
                  });
                },
              );
              return;
            }

            if (
              text.startsWith("/music ") ||
              text.startsWith(".music ") ||
              text.startsWith("/song ") ||
              text.startsWith(".song ")
            ) {
              await CommandProcessor.process(
                client,
                message,
                config,
                myId,
                "music",
                textRaw,
                async (status) => {
                  await handleMusicCommand(message, textRaw, status);
                },
              );
              return;
            }

            if (text.startsWith("/gif ") || text.startsWith(".gif ")) {
              await CommandProcessor.process(
                client,
                message,
                config,
                myId,
                "gif",
                textRaw,
                async (status) => {
                  const queryString = textRaw.split(/\s+/).slice(1).join(" ");
                  await handleGif(client, message, config, status, queryString);
                },
              );
              return;
            }

            if (text === "/sticker" || text === ".sticker") {
              await CommandProcessor.process(
                client,
                message,
                config,
                myId,
                "sticker",
                textRaw,
                async (status) => {
                  await handleStickerCommand(client, message, status);
                },
              );
              return;
            }

            if (text === "/pdf" || text === ".pdf") {
              await CommandProcessor.process(
                client,
                message,
                config,
                myId,
                "pdf",
                textRaw,
                async (status) => {
                  await handlePdfCommand(client, message, status);
                },
              );
              return;
            }

            if (
              text.startsWith("/summarize") ||
              text.startsWith(".summarize")
            ) {
              await CommandProcessor.process(
                client,
                message,
                config,
                myId,
                "summarize",
                textRaw,
                async (status) => {
                  await handleSummarize(client, message, config, status);
                },
              );
              return;
            }

            if (
              text.startsWith("/translate") ||
              text.startsWith(".translate")
            ) {
              await CommandProcessor.process(
                client,
                message,
                config,
                myId,
                "translate",
                textRaw,
                async (status) => {
                  const args = textRaw.split(/\s+/).slice(1).join(" ");
                  await handleTranslate(client, message, config, status, args);
                },
              );
              return;
            }
          }

          // 6. PROTECTED / ADMIN COMMANDS
          if (!auth.allowed && !isMe) {
            if (text.startsWith("/") || text.startsWith(".")) {
              console.log(
                `[BOT] Blocked protected command "${cmdName}" from ${senderId}`,
              );
            }
            return;
          }

          if (text === "/reloadcookies" || text === ".reloadcookies") {
            await CommandProcessor.process(
              client,
              message,
              config,
              myId,
              "reloadcookies",
              textRaw,
              async (status) => {
                syncCookiesToDisk();
                const exists = fs.existsSync(youtubeCookiesPath);
                await status.finish(
                  exists
                    ? "✅ YouTube cookies reloaded from database and written to disk."
                    : "⚠️ No cookies found in database. Paste your cookies in Settings first.",
                );
              },
            );
            return;
          }

          if (text === "/startbot" || text === ".startbot") {
            await CommandProcessor.process(
              client,
              message,
              config,
              myId,
              "startbot",
              textRaw,
              async (status) => {
                setIsRunning(true);
                startAutomationLoop();
                await status.finish("✅ Bot automation started.");
              },
            );
            return;
          }

          if (text === "/stopbot" || text === ".stopbot") {
            await CommandProcessor.process(
              client,
              message,
              config,
              myId,
              "stopbot",
              textRaw,
              async (status) => {
                setIsRunning(false);
                await status.finish("🛑 Bot automation stopped.");
              },
            );
            return;
          }

          if (text.startsWith("/sudoadd ")) {
            const target = textRaw.split(/\s+/)[1]?.trim();
            if (target)
              await handleSudoManagement(client, message, myId, "add", target);
            return;
          }

          if (text.startsWith("/sudoremove ")) {
            const target = textRaw.split(/\s+/)[1]?.trim();
            if (target)
              await handleSudoManagement(
                client,
                message,
                myId,
                "remove",
                target,
              );
            return;
          }

          if (
            text.startsWith("/model ") ||
            text.startsWith(".model ") ||
            text.startsWith("/setmodel ") ||
            text.startsWith(".setmodel ")
          ) {
            const parts = textRaw.split(/\s+/);
            const modelName = parts[1]?.trim();
            if (!modelName) {
              await client.sendMessage(message.chatId, {
                message: "❌ **Usage:** `/model <model-name>`",
                replyTo: message.id,
              });
              return;
            }
            db.prepare("UPDATE config SET activeModel = ? WHERE id = 1").run(
              modelName,
            );
            await client.sendMessage(message.chatId, {
              message: `✅ **Model set to:** \`${modelName}\``,
              replyTo: message.id,
            });
            return;
          }

          if (text === "/models" || text === ".models") {
            await CommandProcessor.process(
              client,
              message,
              config,
              myId,
              "models",
              textRaw,
              async (status) => {
                await status.update("📡 **Fetching models...**");
                try {
                  const response = await fetch(
                    "https://api.bluesminds.com/v1/models",
                    {
                      headers: {
                        Authorization: `Bearer ${config.bluesmindsApiKey}`,
                      },
                    },
                  );
                  if (response.ok) {
                    const data = await response.json();
                    const mStr =
                      data.data?.map((m: any) => `• \`${m.id}\``).join("\n") ||
                      "No models.";
                    await status.finish(`🤖 **Models**\n\n${mStr}`);
                  } else {
                    await status.fail("API Error");
                  }
                } catch (e) {
                  await status.fail("Failed to fetch.");
                }
              },
            );
            return;
          }

          if (text.startsWith("/exportchat")) {
            await CommandProcessor.process(
              client,
              message,
              config,
              myId,
              "exportchat",
              textRaw,
              async (status) => {
                const parts = text.split(" ");
                const limit = parseInt(parts[1]) || 50;
                await status.update(`⏳ Exporting ${limit} messages...`);

                try {
                  const history = await client?.getMessages(message.chatId, {
                    limit,
                  });
                  if (history && history.length > 0) {
                    await status.update(`⏳ Waiting in queue...`);

                    await taskQueue.add(async () => {
                      await status.update(`⚙️ Generating PDF...`);
                      const doc = new PDFDocument();
                      const id = Math.random().toString(36).substring(2);
                      const filename = `chat_export_${id}.pdf`;
                      const filepath = path.join(exportsDir, filename);
                      const stream = fs.createWriteStream(filepath);
                      doc.pipe(stream);

                      doc
                        .fontSize(16)
                        .text(`Export for Chat ${message.chatId}`, {
                          underline: true,
                        });
                      doc.moveDown();

                      const sortedHistory = [...history].reverse();
                      for (const msg of sortedHistory) {
                        if (msg.message) {
                          const date = new Date(
                            msg.date * 1000,
                          ).toLocaleString();
                          const sender = msg.senderId
                            ? msg.senderId.toString()
                            : "Unknown";
                          doc
                            .fontSize(10)
                            .fillColor("gray")
                            .text(`[${date}] ${sender}:`);
                          doc.fontSize(12).fillColor("black").text(msg.message);
                          doc.moveDown(0.5);
                        }
                      }
                      doc.end();

                      await new Promise<void>((resolve, reject) => {
                        stream.on("finish", resolve);
                        stream.on("error", reject);
                      });

                      db.prepare(
                        "INSERT INTO exports (id, filename, filepath, createdAt, type, status) VALUES (?, ?, ?, ?, ?, ?)",
                      ).run(
                        id,
                        filename,
                        filepath,
                        Date.now(),
                        "chat-export",
                        "success",
                      );

                      await status.update(`📤 Uploading PDF...`);
                      await client?.sendMessage(message.chatId, {
                        message: "✅ Chat export complete!",
                        file: filepath,
                      });
                      await status.done(null, 0);
                      addLog(
                        `Exported ${sortedHistory.length} messages to ${filename}`,
                        "success",
                      );
                    });
                  } else {
                    await status.fail("No messages found to export.");
                  }
                } catch (err) {
                  await status.fail(`Export failed: ${String(err)}`);
                  addLog(`Chat export failed: ${String(err)}`, "error");
                }
              },
            );
            return;
          }

          // 7. BROADCAST COMMANDS
          if (text === "/startsend" || text === ".startsend") {
            setIsRunning(true);
            startAutomationLoop();
            await client?.sendMessage(message.chatId, {
              message: "🚀 Automation loop started. Check Logs for progress.",
            });
          } else if (text === "/stopsend" || text === ".stopsend") {
            setIsRunning(false);
            await client?.sendMessage(message.chatId, {
              message: "🛑 Automation loop stopped.",
            });
          } else if (
            text.startsWith("/addmsg ") ||
            text.startsWith(".addmsg ")
          ) {
            const newMsg = textRaw.substring(8).trim();
            if (newMsg) {
              const id = Math.random().toString(36).substring(2);
              db.prepare(
                "INSERT INTO messages (id, text, createdAt) VALUES (?, ?, ?)",
              ).run(id, newMsg, Date.now());
              await client?.sendMessage(message.chatId, {
                message: "✅ Message added to database.",
              });
            }
          } else if (
            text.startsWith("/addtarget ") ||
            text.startsWith(".addtarget ")
          ) {
            const targetName = textRaw.substring(11).trim();
            if (targetName) {
              const id = Math.random().toString(36).substring(2);
              db.prepare(
                "INSERT INTO targets (id, name, type) VALUES (?, ?, ?)",
              ).run(id, targetName, "group");
              await client?.sendMessage(message.chatId, {
                message: `✅ Target ${targetName} added.`,
              });
            }
          }
        } catch (err: any) {
          console.error("[BOT] Error in messageHandler:", err);
          addLog(`Handler Error: ${err.message || String(err)}`, "error");
        }
      };

      client.addEventHandler(
        messageHandler,
        new NewMessage({ incoming: true, outgoing: true }),
      );
      isListenerActive = true;
      addLog("Telegram listener attached successfully.", "success");

      // Maintenance Task: Cleanup old files and old DB records
      setInterval(async () => {
        try {
          const now = Date.now();
          const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

          // Cleanup conversation history older than 7 days
          db.prepare("DELETE FROM conversations WHERE timestamp < ?").run(
            oneWeekAgo,
          );

          // Cleanup files in exports and music directories
          for (const dir of [exportsDir, musicDir]) {
            const files = await fs.readdir(dir);
            for (const file of files) {
              const filePath = path.join(dir, file);
              const stats = await fs.stat(filePath);
              if (stats.mtimeMs < oneWeekAgo) {
                await fs.remove(filePath).catch(() => {});
              }
            }
          }

          // Memory Cleanup: clear cooldown maps if they get too large
          if (userCooldowns.size > 5000) userCooldowns.clear();
          if (commandCooldowns.size > 1000) commandCooldowns.clear();

          console.log("[Maintenance] Cleanup complete.");
        } catch (e) {
          console.error("[Maintenance] Error:", e);
        }
      }, 3600000); // Hourly

      // Connection Status Listeners
      client.addEventHandler((event: any) => {
        lastEventTimestamp = Date.now();
      });

      return true;
    } catch (e: any) {
      isListenerActive = false;
      addLog(
        `Failed to connect to Telegram: ${e?.message || "Unknown error"}`,
        "error",
      );
      client = null;
      return false;
    } finally {
      isConnecting = false;
    }
  };

  const startAutomationLoop = async () => {
    if (runningLoop) return;
    setIsRunning(true);
    addLog("Automation loop started.", "info");

    const isClientConnected = client !== null;
    if (!isClientConnected) {
      loadTelethon(); // Try loading in background
    }

    const loop = async () => {
      while (getIsRunning()) {
        const messages = db.prepare("SELECT * FROM messages").all() as any[];
        const targets = db.prepare("SELECT * FROM targets").all() as any[];
        const config = db
          .prepare("SELECT * FROM config WHERE id = 1")
          .get() as any;

        if (!messages.length || !targets.length) {
          addLog("Cannot send message: Missing targets or messages.", "error");
          setIsRunning(false);
          break;
        }

        const msg = messages[Math.floor(Math.random() * messages.length)];
        const target = targets[Math.floor(Math.random() * targets.length)];

        if (client) {
          try {
            await client.sendMessage(target.name, { message: msg.text });
            addLog(
              `Sent to ${target.name}: "${msg.text.substring(0, 20)}..."`,
              "success",
            );
          } catch (e: any) {
            addLog(`Failed sending to ${target.name}: ${e?.message}`, "error");
          }
        } else {
          // Mock
          addLog(
            `[MOCK] Sent to ${target.name}: "${msg.text.substring(0, 20)}..."`,
            "success",
          );
        }

        const delaySec = Math.floor(
          Math.random() *
            (config.maxDelaySeconds - config.minDelaySeconds + 1) +
            config.minDelaySeconds,
        );
        addLog(`Waiting ${delaySec} seconds before next message...`, "info");

        // Wait delaySec manually, but periodically check if stopped
        for (let i = 0; i < delaySec; i++) {
          if (!getIsRunning()) break;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      addLog("Automation loop stopped.", "warn");
      runningLoop = false;
    };

    loop(); // Kick off the background loop
  };

  // Restore cookies from DB to disk on every boot
  syncCookiesToDisk();

  // Recover state on boot
  loadTelethon().then(() => {
    if (getIsRunning()) {
      addLog("Resuming automation loop from previous state.", "info");
      startAutomationLoop();
    } else {
      // Initial logs setup at boot
      addLog("Backend server initialized.", "info");
    }
  });
}

startServer();
