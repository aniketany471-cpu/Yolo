import fs from 'fs-extra';
import { GoogleGenAI } from '@google/genai';

const MIME_MAP = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

export async function visionTool(filePath, apiKey) {
  if (!apiKey || apiKey === 'undefined' || apiKey === 'null' || apiKey.length < 5) {
    return { ok: false, reason: 'no_api_key' };
  }
  const exists = await fs.pathExists(filePath);
  if (!exists) return { ok: false, reason: 'file_missing' };

  try {
    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
    const imageBuffer = await fs.readFile(filePath);
    const base64Data = imageBuffer.toString('base64');
    const ext = (filePath.split('.').pop() || 'jpg').toLowerCase();
    const mimeType = MIME_MAP[ext] || 'image/jpeg';

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { data: base64Data, mimeType } },
            {
              text: 'Describe this image thoroughly. If it contains text, transcribe it completely. Include all visible content, context, layout, colors, and any notable details. Be specific and factual.',
            },
          ],
        },
      ],
      config: { temperature: 0.2 },
    });

    const text = response.text?.trim();
    if (!text) return { ok: false, reason: 'empty_response' };
    return { ok: true, data: text };
  } catch (err) {
    const msg = err?.message || String(err);
    console.warn('[vision] Gemini vision error:', msg.slice(0, 120));
    return { ok: false, reason: msg.slice(0, 120) };
  }
}
