import googleTTS from 'google-tts-api';
import fs from 'fs-extra';
import { franc } from 'franc';

export const DEFAULT_TTS_CONFIG = {
  primaryProvider: 'elevenlabs',
  voiceId: 'ibbx9zDYGvLgtYzRbqqG',
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
    voiceId: nestedConfig?.voiceId || config.ttsVoiceId || config.voiceId || DEFAULT_TTS_CONFIG.voiceId,
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
  if (!config.elevenLabsApiKey) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.voiceId)}?output_format=mp3_44100_128`,
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

  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {}
    throw new Error(`ElevenLabs TTS failed: HTTP ${res.status}${detail ? ` - ${detail.slice(0, 200)}` : ''}`);
  }

  return {
    buffer: Buffer.from(await res.arrayBuffer()),
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
