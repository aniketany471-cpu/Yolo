import googleTTS from 'google-tts-api';
import fs from 'fs-extra';

export async function generateTTSBuffer(text, lang = 'en') {
  const chunks = googleTTS.getAllAudioUrls(text.trim(), {
    lang,
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

  return Buffer.concat(buffers);
}

export async function generateTTSFile(text, outputPath, lang = 'en') {
  const buf = await generateTTSBuffer(text, lang);
  await fs.writeFile(outputPath, buf);
  return outputPath;
}
