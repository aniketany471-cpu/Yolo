import googleTTS from 'google-tts-api';
import fs from 'fs-extra';
import { franc } from 'franc';

export const DEFAULT_TTS_CONFIG = {
  primaryProvider: 'elevenlabs',
  model: 'eleven_multilingual_v2',
};

const DEFAULT_BACKUP_PROVIDERS = ['google'];

const FRANC_TO_GTTS = {
  eng: 'en', hin: 'hi', ara: 'ar', spa: 'es', fra: 'fr', deu: 'de',
  por: 'pt', rus: 'ru', jpn: 'ja', kor: 'ko', zho: 'zh-CN', cmn: 'zh-CN',
  ita: 'it', tur: 'tr', pol: 'pl', nld: 'nl', swe: 'sv', nor: 'no',
  dan: 'da', fin: 'fi', ces: 'cs', ron: 'ro', hun: 'hu', ukr: 'uk',
  vie: 'vi', tha: 'th', ind: 'id', msa: 'ms', fil: 'tl', ben: 'bn',
  tam: 'ta', tel: 'te', mar: 'mr', guj: 'gu', kan: 'kn', mal: 'ml',
  pan: 'pa', urd: 'ur', fas: 'fa', heb: 'iw', cat: 'ca', hrv: 'hr',
  slk: 'sk', bul: 'bg', srp: 'sr', lit: 'lt', lav: 'lv', est: 'et',
  slv: 'sl', ell: 'el', afr: 'af', swa: 'sw', lat: 'la', glg: 'gl',
  eus: 'eu', isl: 'is', mkd: 'mk', bel: 'be', alb: 'sq', arm: 'hy',
  geo: 'ka', aze: 'az', kaz: 'kk', uzb: 'uz', mon: 'mn', khm: 'km',
  mya: 'my', sin: 'si', nep: 'ne', amh: 'am', hau: 'ha', yor: 'yo',
  zul: 'zu', xho: 'xh', som: 'so', sun: 'su', jav: 'jv', ceb: 'ceb',
};

const normalizeProviderName = (provider) => String(provider || '').trim().toLowerCase();

const truncateForLog = (value, maxLength = 4000) => {
  const normalized = String(value ?? '');
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…[truncated]` : normalized;
};

const getResponseHeadersForLog = (response) => ({
  contentType: response.headers.get('content-type') || '',
  contentLength: response.headers.get('content-length') || '',
  requestId: response.headers.get('request-id') || response.headers.get('x-request-id') || '',
});

const describeError = (error) => ({
  name: error?.name || 'Error',
  message: error?.message || String(error),
  stack: error?.stack ? truncateForLog(error.stack, 1200) : '',
});

function logElevenLabsRequest(event, details = {}, level = 'info') {
  const logPayload = {
    event,
    provider: 'elevenlabs',
    ...details,
  };
  const message = `[tts][elevenlabs] ${JSON.stringify(logPayload)}`;
  if (level === 'error') console.error(message);
  else if (level === 'warn') console.warn(message);
  else console.log(message);
}

function pickFirstUsableElevenLabsVoice(voices = []) {
  return voices.find((voice) => voice?.voice_id || voice?.voiceId || voice?.id) || null;
}

async function fetchElevenLabsVoices(config) {
  logElevenLabsRequest('voices_request_start');

  let res;
  try {
    res = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: {
        'xi-api-key': config.elevenLabsApiKey,
      },
    });
  } catch (error) {
    logElevenLabsRequest('voices_request_error', {
      error: describeError(error),
    }, 'error');
    throw error;
  }

  const responseDetails = {
    status: res.status,
    statusText: res.statusText,
    headers: getResponseHeadersForLog(res),
  };

  let responseBody = '';
  try {
    responseBody = await res.text();
  } catch (error) {
    responseBody = `[failed to read response body: ${error.message || error}]`;
  }

  if (!res.ok) {
    logElevenLabsRequest('voices_response_error', {
      ...responseDetails,
      responseBody,
      error: `HTTP ${res.status}`,
    }, 'error');
    throw new Error(`ElevenLabs voices fetch failed: HTTP ${res.status}${responseBody ? ` - ${truncateForLog(responseBody, 500)}` : ''}`);
  }

  let payload;
  try {
    payload = JSON.parse(responseBody || '{}');
  } catch (error) {
    logElevenLabsRequest('voices_parse_error', {
      ...responseDetails,
      responseBody: truncateForLog(responseBody),
      error: describeError(error),
    }, 'error');
    throw error;
  }

  return {
    voices: Array.isArray(payload?.voices) ? payload.voices : [],
    responseDetails,
    responseBody,
  };
}

function normalizeElevenLabsVoice(voice) {
  const voiceId = voice?.voice_id || voice?.voiceId || voice?.id || '';
  return {
    voiceId,
    voiceName: voice?.name || 'Unnamed ElevenLabs voice',
  };
}

async function resolveElevenLabsVoice(config) {
  const configuredVoiceId = String(config.voiceId || '').trim();
  const { voices, responseDetails, responseBody } = await fetchElevenLabsVoices(config);
  const selectedVoice = configuredVoiceId
    ? voices.find((voice) => normalizeElevenLabsVoice(voice).voiceId === configuredVoiceId)
    : pickFirstUsableElevenLabsVoice(voices);

  if (!selectedVoice) {
    const reason = configuredVoiceId
      ? 'Configured ElevenLabs voice is not available to this account'
      : 'No usable ElevenLabs voices are available for this account';
    logElevenLabsRequest('voices_empty', {
      ...responseDetails,
      voiceCount: voices.length,
      configuredVoice: Boolean(configuredVoiceId),
      configuredVoiceId,
      responseBody: truncateForLog(responseBody),
      error: reason,
    }, 'warn');
    throw new Error(reason);
  }

  const selected = normalizeElevenLabsVoice(selectedVoice);
  logElevenLabsRequest('voice_selected', {
    ...responseDetails,
    selectedVoiceName: selected.voiceName,
    selectedVoiceId: selected.voiceId,
    voiceCount: voices.length,
    configuredVoice: Boolean(configuredVoiceId),
  });

  return selected;
}

function safeParseJSON(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function getDefaultTTSConfig() {
  return { ...DEFAULT_TTS_CONFIG };
}

export function resolveTTSConfig(config = {}) {
  const nestedConfig = typeof config.tts === 'string'
    ? safeParseJSON(config.tts)
    : config.tts;

  return {
    ...DEFAULT_TTS_CONFIG,
    ...(nestedConfig && typeof nestedConfig === 'object' ? nestedConfig : {}),
    primaryProvider: normalizeProviderName(
      nestedConfig?.primaryProvider
      || config.ttsPrimaryProvider
      || config.primaryProvider
      || DEFAULT_TTS_CONFIG.primaryProvider
    ),
    voiceId: nestedConfig?.voiceId || config.ttsVoiceId || config.voiceId || '',
    model: nestedConfig?.model || config.ttsModel || config.model || DEFAULT_TTS_CONFIG.model,
    elevenLabsApiKey: nestedConfig?.elevenLabsApiKey || config.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY || '',
    backupProviders: Array.isArray(nestedConfig?.backupProviders)
      ? nestedConfig.backupProviders.map(normalizeProviderName).filter(Boolean)
      : DEFAULT_BACKUP_PROVIDERS,
  };
}

export function detectLang(text) {
  if (!text || text.trim().length < 10) return 'en';
  const code = franc(text, { minLength: 5 });
  return FRANC_TO_GTTS[code] || 'en';
}

async function generateGoogleTTSBuffer(text, lang, config) {
  const resolvedLang = lang || detectLang(text);
  const chunks = googleTTS.getAllAudioUrls(text.trim(), {
    lang: resolvedLang,
    slow: false,
    host: 'https://translate.google.com',
    splitPunct: ',.!?;:',
  });

  const buffers = [];
  for (const { url } of chunks) {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) throw new Error(`Google TTS fetch failed: HTTP ${res.status}`);
    buffers.push(Buffer.from(await res.arrayBuffer()));
  }

  return { buffer: Buffer.concat(buffers), lang: resolvedLang, provider: 'google', config };
}

async function generateElevenLabsTTSBuffer(text, lang, config) {
  const textLength = text.trim().length;
  const requestDetails = {
    voiceId: config.voiceId || '',
    voiceName: '',
    model: config.model,
    textLength,
  };

  if (!config.elevenLabsApiKey) {
    logElevenLabsRequest('configuration_error', {
      ...requestDetails,
      error: 'ELEVENLABS_API_KEY is not configured',
    }, 'error');
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }

  const selectedVoice = await resolveElevenLabsVoice(config);
  requestDetails.voiceId = selectedVoice.voiceId;
  requestDetails.voiceName = selectedVoice.voiceName;

  logElevenLabsRequest('request_start', requestDetails);

  let res;
  try {
    res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(selectedVoice.voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': config.elevenLabsApiKey,
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: config.model,
        }),
      }
    );
  } catch (error) {
    logElevenLabsRequest('request_error', {
      ...requestDetails,
      error: describeError(error),
    }, 'error');
    throw error;
  }

  const responseDetails = {
    ...requestDetails,
    status: res.status,
    statusText: res.statusText,
    headers: getResponseHeadersForLog(res),
  };

  if (!res.ok) {
    let responseBody = '';
    try {
      responseBody = await res.text();
    } catch (error) {
      responseBody = `[failed to read response body: ${error.message || error}]`;
    }
    logElevenLabsRequest('response_error', {
      ...responseDetails,
      responseBody,
      error: `HTTP ${res.status}`,
    }, 'error');
    throw new Error(`ElevenLabs TTS failed: HTTP ${res.status}${responseBody ? ` - ${truncateForLog(responseBody, 500)}` : ''}`);
  }

  let audioBuffer;
  try {
    audioBuffer = Buffer.from(await res.arrayBuffer());
  } catch (error) {
    logElevenLabsRequest('response_body_error', {
      ...responseDetails,
      responseBody: '[binary audio body could not be read]',
      error: describeError(error),
    }, 'error');
    throw error;
  }

  logElevenLabsRequest('response_success', {
    ...responseDetails,
    responseBody: `[binary audio omitted; bytes=${audioBuffer.length}]`,
  });

  return {
    buffer: audioBuffer,
    lang: lang || detectLang(text),
    provider: 'elevenlabs',
    config,
  };
}

const TTS_PROVIDERS = {
  elevenlabs: generateElevenLabsTTSBuffer,
  google: generateGoogleTTSBuffer,
};

export function getTTSProviderOrder(config = {}) {
  const resolvedConfig = resolveTTSConfig(config);
  const primaryProvider = normalizeProviderName(resolvedConfig.primaryProvider);
  return [
    primaryProvider,
    ...resolvedConfig.backupProviders,
  ].filter((provider, index, providers) => provider && providers.indexOf(provider) === index);
}

export async function generateTTSBuffer(text, lang = null, config = {}) {
  const trimmedText = text?.trim();
  if (!trimmedText) throw new Error('TTS text is empty');

  const resolvedConfig = resolveTTSConfig(config);
  const providerOrder = getTTSProviderOrder(resolvedConfig);
  const errors = [];

  for (const providerName of providerOrder) {
    const provider = TTS_PROVIDERS[providerName];
    if (!provider) {
      console.warn(`[tts] provider unavailable: ${providerName}`);
      continue;
    }

    try {
      const result = await provider(trimmedText, lang, resolvedConfig);
      if (providerName !== resolvedConfig.primaryProvider) {
        console.warn(`[tts] fallback provider used: ${providerName}`);
      }
      return result;
    } catch (error) {
      errors.push(`${providerName}: ${error.message}`);
      console.error(`[tts] ${providerName} failed:`, error.message || error);
    }
  }

  throw new Error(`All TTS providers failed${errors.length ? ` (${errors.join('; ')})` : ''}`);
}

export async function generateTTSFile(text, outputPath, lang = null, config = {}) {
  const { buffer, lang: resolvedLang, provider } = await generateTTSBuffer(text, lang, config);
  await fs.writeFile(outputPath, buffer);
  return { outputPath, lang: resolvedLang, provider };
}
