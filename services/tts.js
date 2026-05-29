import googleTTS from 'google-tts-api';
import fs from 'fs-extra';
import { franc } from 'franc';

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

export function detectLang(text) {
  if (!text || text.trim().length < 10) return 'en';
  const code = franc(text, { minLength: 5 });
  return FRANC_TO_GTTS[code] || 'en';
}

export async function generateTTSBuffer(text, lang = null) {
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
    if (!res.ok) throw new Error(`TTS fetch failed: HTTP ${res.status}`);
    buffers.push(Buffer.from(await res.arrayBuffer()));
  }

  return { buffer: Buffer.concat(buffers), lang: resolvedLang };
}

export async function generateTTSFile(text, outputPath, lang = null) {
  const { buffer, lang: resolvedLang } = await generateTTSBuffer(text, lang);
  await fs.writeFile(outputPath, buffer);
  return { outputPath, lang: resolvedLang };
}
