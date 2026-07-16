// ─────────────────────────────────────────────────────────────────────────────
// Donna AI Moderation Service
//
// Two modes (set per-group via /modmode):
//   soft — delete + warn only for porn/explicit content
//   hard — delete + warn/mute/kick/ban for porn, harassment, hate,
//           threats, spam, scams, dangerous links
//
// Escalation per-user per-chat (violation count stored in DB):
//   Soft:  1→warn  2→mute 5min  3→mute 1hr  4+→kick
//   Hard:  1→warn  2→mute 15min 3→mute 6hr  4+→ban
// ─────────────────────────────────────────────────────────────────────────────

import { Api } from "telegram";
import { chatCompletion } from "../providers/iamhcProvider.js";
import { ROUTER_MODEL, getIamhcApiKey } from "../config/models.js";

// ── Regex pre-filter (catches obvious bypass attempts instantly, no AI cost) ──
const EXPLICIT_PATTERNS = [
  /\b(porn|p0rn|p\*rn|pr0n|p\.o\.r\.n|pørn|po rn)\b/i,
  /\b(sex(ual|ually)?ly?\s+explicit|nude(s)?|naked|hentai|xxx|onlyfans)\b/i,
  /\b(cum(shot)?|blowjob|handjob|deepthroat|gangbang|creampie|bdsm)\b/i,
  /\b(rape|molest|grope|non-?consensual)\b/i,
  /\b(child\s*(porn|sex|nude)|cp\b|loli|shota|minor.*sex)\b/i,
];

const HARD_PATTERNS = [
  /\b(kys|kill\s+your\s*self|go\s+die|hang\s+your\s*self|suicide)\b/i,
  /\b(terrorist|bomb|shoot\s+up|mass\s+shooting|massacre)\b/i,
  /\b(send\s+nudes?|show\s+nudes?|nudes?\s+for\s+free)\b/i,
];

const LINK_RE = /https?:\/\/[^\s]+/gi;
const ADULT_DOMAINS = [
  "pornhub", "xvideos", "xnxx", "redtube", "youporn", "xhamster",
  "onlyfans", "chaturbate", "livejasmin", "stripchat", "bongacams",
];

// ── AI classifiers ────────────────────────────────────────────────────────────

async function classifyExplicit(text, apiKey) {
  const prompt = [
    "You are a strict content moderation classifier for a Telegram group chat.",
    "Classify whether this message contains or promotes pornographic, sexually explicit, or adult sexual content.",
    "Also flag: obfuscated spellings (p*rn, pr0n, p.o.r.n etc), emojis used for sexual meaning, solicitation of nude images, sexual roleplay.",
    "Do NOT flag: medical discussions, romantic/emotional content, news, debates, dark humor, mild profanity not related to sex.",
    "Respond with ONLY one word: yes or no.",
    "",
    `Message: ${text}`,
  ].join("\n");
  try {
    const res = await chatCompletion({ model: ROUTER_MODEL, prompt, apiKey, extra: { temperature: 0 }, maxRetries: 0 });
    return res.ok && (res.content || "").trim().toLowerCase().startsWith("yes");
  } catch { return false; }
}

async function classifyHardViolation(text, apiKey) {
  const prompt = [
    "You are a strict content moderation classifier for a Telegram group chat.",
    "Classify whether this message contains ANY of the following:",
    "  - Harassment, personal abuse, targeted insults directed at a specific person",
    "  - Hate speech (race, religion, gender, sexuality, ethnicity)",
    "  - Direct threats or intimidation",
    "  - Spam or flooding (meaningless repetitive content)",
    "  - Scam or phishing attempts (fake giveaways, suspicious links, 'send money')",
    "Do NOT flag: debates, criticism, dark humor, strong opinions, political discussion, mild profanity.",
    "Respond with ONLY one word: yes or no, followed by a colon and the violation type (harassment/hate/threat/spam/scam).",
    "Example: yes:harassment  or  no",
    "",
    `Message: ${text}`,
  ].join("\n");
  try {
    const res = await chatCompletion({ model: ROUTER_MODEL, prompt, apiKey, extra: { temperature: 0 }, maxRetries: 0 });
    if (!res.ok) return { flagged: false };
    const answer = (res.content || "").trim().toLowerCase();
    if (!answer.startsWith("yes")) return { flagged: false };
    const type = answer.includes(":") ? answer.split(":")[1].trim() : "violation";
    return { flagged: true, type };
  } catch { return { flagged: false }; }
}

async function classifyImageExplicit(imageBase64, apiKey) {
  const prompt = [
    "You are a strict content moderation classifier.",
    "Does this image contain pornographic, sexually explicit, or nude content?",
    "Respond with ONLY one word: yes or no.",
  ].join("\n");
  try {
    const res = await chatCompletion({
      model: "meta/llama-3.2-11b-vision-instruct",
      prompt,
      apiKey,
      extra: {
        temperature: 0,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        }],
      },
      maxRetries: 0,
    });
    return res.ok && (res.content || "").trim().toLowerCase().startsWith("yes");
  } catch { return false; }
}

function checkAdultLink(text) {
  const links = text.match(LINK_RE) || [];
  for (const link of links) {
    const domain = link.replace(/https?:\/\/(www\.)?/, "").split(/[/?#]/)[0].toLowerCase();
    if (ADULT_DOMAINS.some(d => domain.includes(d))) return true;
  }
  return false;
}

// ── GramJS action helpers ─────────────────────────────────────────────────────

async function deleteMsg(client, chatPeer, msgId) {
  try {
    await client.deleteMessages(chatPeer, [msgId], { revoke: true });
    return true;
  } catch (e) {
    console.warn("[mod] delete failed:", e.message);
    return false;
  }
}

async function muteUser(client, chatPeer, userPeer, seconds) {
  const untilDate = Math.floor(Date.now() / 1000) + seconds;
  try {
    await client.invoke(new Api.channels.EditBanned({
      channel: chatPeer,
      participant: userPeer,
      bannedRights: new Api.ChatBannedRights({
        untilDate,
        sendMessages: true,
        sendMedia: true,
        sendStickers: true,
        sendGifs: true,
        sendGames: true,
        sendInline: true,
        embedLinks: true,
      }),
    }));
    return true;
  } catch (e) {
    console.warn("[mod] mute failed:", e.message);
    return false;
  }
}

async function kickUser(client, chatPeer, userPeer) {
  try {
    // Ban (viewMessages=true = cannot see group = effectively kicked)
    await client.invoke(new Api.channels.EditBanned({
      channel: chatPeer,
      participant: userPeer,
      bannedRights: new Api.ChatBannedRights({ untilDate: 0, viewMessages: true }),
    }));
    // Then immediately unban so they can rejoin via invite
    await client.invoke(new Api.channels.EditBanned({
      channel: chatPeer,
      participant: userPeer,
      bannedRights: new Api.ChatBannedRights({ untilDate: 0 }),
    }));
    return true;
  } catch (e) {
    console.warn("[mod] kick failed:", e.message);
    return false;
  }
}

async function banUser(client, chatPeer, userPeer) {
  try {
    await client.invoke(new Api.channels.EditBanned({
      channel: chatPeer,
      participant: userPeer,
      bannedRights: new Api.ChatBannedRights({ untilDate: 0, viewMessages: true }),
    }));
    return true;
  } catch (e) {
    console.warn("[mod] ban failed:", e.message);
    return false;
  }
}

// ── Warning messages ──────────────────────────────────────────────────────────

function warnText(mentionName, reason, count, mode) {
  const tag = mentionName ? `@${mentionName}` : "hey";
  if (mode === "soft") {
    const msgs = [
      `${tag} — that kind of content isn't allowed here. Keep it clean 🚫`,
      `${tag} porn/explicit content isn't allowed in this group. Don't do that again.`,
      `${tag} that message crossed the line. Explicit content isn't okay here.`,
    ];
    if (count === 2) return `${tag} second warning — posting explicit content again will get you muted ⚠️`;
    if (count === 3) return `${tag} third warning and you're muted for an hour. This is your last chance before a kick 🔇`;
    if (count >= 4) return `${tag} you've been kicked for repeated explicit content violations.`;
    return msgs[Math.floor(Math.random() * msgs.length)];
  } else {
    const reasonMap = {
      harassment: "harassment/personal abuse",
      hate: "hate speech",
      threat: "threats or intimidation",
      spam: "spam/flooding",
      scam: "scam/phishing attempt",
      explicit: "explicit/pornographic content",
      link: "posting adult/malicious links",
      violation: "rule violation",
    };
    const readableReason = reasonMap[reason] || reason || "rule violation";
    if (count === 1) return `${tag} — removed for ${readableReason}. This is your first warning ⚠️`;
    if (count === 2) return `${tag} second warning for ${readableReason}. You've been muted for 15 minutes 🔇`;
    if (count === 3) return `${tag} third warning — muted for 6 hours. One more and you're banned 🔇`;
    return `${tag} you've been banned for repeated violations (${readableReason}) 🚫`;
  }
}

// ── Main moderation entry point ───────────────────────────────────────────────

export async function moderateMessage({ client, message, db, config, myId }) {
  try {
    const chatIdStr = message.chatId?.toString();
    const senderId = message.senderId?.toString();
    if (!chatIdStr || !senderId) return;
    if (message.out || senderId === myId) return; // never moderate own messages

    // Load per-chat moderation mode
    const groupRow = db.prepare("SELECT moderationMode FROM group_settings WHERE chatId = ?").get(chatIdStr);
    const mode = groupRow?.moderationMode || "off";
    if (mode === "off") return;

    const apiKey = getIamhcApiKey(config.iamhcApiKey);
    const text = (message.message || "").trim();
    const hasPhoto = !!message?.media?.photo;
    const hasImageDoc = !!(message?.media?.document?.mimeType || "").startsWith("image/");
    const hasImage = hasPhoto || hasImageDoc;

    let flagged = false;
    let reason = null;

    // ── TEXT checks ───────────────────────────────────────────────────────────
    if (text) {
      // 1. Fast regex pre-filter (no API cost)
      if (EXPLICIT_PATTERNS.some(p => p.test(text))) { flagged = true; reason = "explicit"; }
      if (!flagged && mode === "hard" && HARD_PATTERNS.some(p => p.test(text))) { flagged = true; reason = "threat"; }

      // 2. Adult link check
      if (!flagged && checkAdultLink(text)) { flagged = true; reason = "link"; }

      // 3. AI classifier
      if (!flagged) {
        const isExplicit = await classifyExplicit(text, apiKey);
        if (isExplicit) { flagged = true; reason = "explicit"; }
      }
      if (!flagged && mode === "hard") {
        const hardResult = await classifyHardViolation(text, apiKey);
        if (hardResult.flagged) { flagged = true; reason = hardResult.type; }
      }
    }

    // ── IMAGE checks ──────────────────────────────────────────────────────────
    if (!flagged && hasImage) {
      try {
        const buf = await client.downloadMedia(message, { workers: 1 });
        if (buf) {
          const base64 = Buffer.from(buf).toString("base64");
          const isExplicit = await classifyImageExplicit(base64, apiKey);
          if (isExplicit) { flagged = true; reason = "explicit_image"; }
        }
      } catch (e) {
        console.warn("[mod] image download failed:", e.message);
      }
    }

    if (!flagged) return;

    // ── Violation tracking ────────────────────────────────────────────────────
    db.prepare(`
      INSERT INTO moderation_violations (userId, chatId, reason, count, lastAt)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(userId, chatId) DO UPDATE SET
        count = count + 1,
        reason = excluded.reason,
        lastAt = excluded.lastAt
    `).run(senderId, chatIdStr, reason, Date.now());

    const { count } = db.prepare(
      "SELECT count FROM moderation_violations WHERE userId = ? AND chatId = ?"
    ).get(senderId, chatIdStr) || { count: 1 };

    // ── Resolve peers ─────────────────────────────────────────────────────────
    let chatPeer, userPeer;
    try {
      chatPeer = await client.getInputEntity(message.chatId);
      userPeer = await client.getInputEntity(message.senderId);
    } catch (e) {
      console.warn("[mod] peer resolve failed:", e.message);
      return;
    }

    // ── Delete the message ────────────────────────────────────────────────────
    await deleteMsg(client, chatPeer, message.id);

    // ── Get sender mention name ───────────────────────────────────────────────
    const senderProfile = message.sender;
    const mentionName = senderProfile?.username
      || (senderProfile?.firstName ? senderProfile.firstName : null);

    // ── Escalating action ─────────────────────────────────────────────────────
    let actionTaken = "warned";
    if (mode === "soft") {
      if (count === 2) { await muteUser(client, chatPeer, userPeer, 5 * 60); actionTaken = "muted 5min"; }
      else if (count === 3) { await muteUser(client, chatPeer, userPeer, 60 * 60); actionTaken = "muted 1hr"; }
      else if (count >= 4) { await kickUser(client, chatPeer, userPeer); actionTaken = "kicked"; }
    } else if (mode === "hard") {
      if (count === 2) { await muteUser(client, chatPeer, userPeer, 15 * 60); actionTaken = "muted 15min"; }
      else if (count === 3) { await muteUser(client, chatPeer, userPeer, 6 * 60 * 60); actionTaken = "muted 6hr"; }
      else if (count >= 4) { await banUser(client, chatPeer, userPeer); actionTaken = "banned"; }
    }

    // ── Send warning message ──────────────────────────────────────────────────
    try {
      const warning = warnText(mentionName, reason, count, mode);
      await client.sendMessage(message.chatId, { message: warning });
    } catch (e) {
      console.warn("[mod] warning send failed:", e.message);
    }

    // ── Log to DB ─────────────────────────────────────────────────────────────
    db.prepare(`
      INSERT INTO moderation_logs (id, timestamp, userId, chatId, reason, action, messageText)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      Math.random().toString(36).slice(2),
      Date.now(),
      senderId,
      chatIdStr,
      reason,
      actionTaken,
      text.slice(0, 200)
    );

    console.log(`[mod] mode=${mode} user=${senderId} chat=${chatIdStr} reason=${reason} action=${actionTaken} violations=${count}`);
  } catch (e) {
    console.error("[mod] moderateMessage error:", e.message || e);
  }
}
