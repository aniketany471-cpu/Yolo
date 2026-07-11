// ──────────────────────────────────────────────────────────────────────────
// Speech-to-text via stepaudio-2.5-asr (config/models.js: TASK.ASR).
// Call transcribeAudio(buffer, filename) with a raw audio buffer (ogg/mp3/wav)
// from a downloaded voice note; returns transcribed text or null on failure.
// Not yet wired to an inbound Telegram voice-message listener — server.js has
// no existing inbound-audio handling to hook into. Wire a call to this
// function wherever inbound voice notes are downloaded to enable ASR.
// ──────────────────────────────────────────────────────────────────────────
import { IAMHC_BASE_URL, getIamhcApiKey, MODELS, TASK } from "../config/models.js";
import { logProviderCall, logProviderError } from "../utils/logger.js";

export async function transcribeAudio(buffer, filename = "audio.ogg", { apiKey, model } = {}) {
  const cleanKey = getIamhcApiKey(apiKey);
  if (!cleanKey) {
    console.warn("[ASR] No valid iamhc API key configured.");
    return null;
  }
  const targetModel = model || MODELS[TASK.ASR];

  const form = new FormData();
  form.append("model", targetModel);
  form.append("file", new Blob([buffer]), filename);

  const started = Date.now();
  try {
    const response = await fetch(`${IAMHC_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cleanKey}` },
      body: form,
    });
    const latency = Date.now() - started;
    logProviderCall({ model: targetModel, status: response.status, latencyMs: latency });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      logProviderError({ model: targetModel, error: errText.slice(0, 300) });
      return null;
    }
    const data = await response.json();
    return (data?.text || "").trim() || null;
  } catch (e) {
    logProviderError({ model: targetModel, error: e.message });
    return null;
  }
}

export default { transcribeAudio };
