import fs from 'fs-extra';
export async function visionTool(filePath) {
  const exists = await fs.pathExists(filePath);
  if (!exists) return { ok: false, reason: 'file_missing' };
  return { ok: true, data: 'Vision/OCR routing placeholder active. Integrate provider key to enable OCR.' };
}
