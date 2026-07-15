import vision from '@google-cloud/vision';
import type { OcrProviderResult, OcrWord } from './types';

type GoogleVertex = { x?: number | null; y?: number | null };
type GoogleWord = {
  symbols?: Array<{ text?: string | null }> | null;
  boundingBox?: { vertices?: GoogleVertex[] | null } | null;
};
type GoogleAnnotation = {
  text?: string | null;
  pages?: Array<{
    blocks?: Array<{
      paragraphs?: Array<{ words?: GoogleWord[] | null }> | null;
    }> | null;
  }> | null;
};

export function normalizeGoogleVisionResponse(fullTextAnnotation?: GoogleAnnotation | null): OcrProviderResult {
  const words: OcrWord[] = [];

  for (const page of fullTextAnnotation?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          const text = (word.symbols ?? []).map((symbol) => symbol.text ?? '').join('');
          const vertices = word.boundingBox?.vertices ?? [];
          if (!text || vertices.length < 2) continue;

          const xs = vertices.map((vertex) => vertex.x ?? 0);
          const ys = vertices.map((vertex) => vertex.y ?? 0);
          words.push({
            text,
            x: (Math.min(...xs) + Math.max(...xs)) / 2,
            y: (Math.min(...ys) + Math.max(...ys)) / 2,
          });
        }
      }
    }
  }

  return { text: fullTextAnnotation?.text ?? '', words, provider: 'google' };
}

export async function scanWithGoogle(bytes: Buffer): Promise<OcrProviderResult> {
  // Intentionally uses implicit Application Default Credentials, as before.
  const client = new vision.ImageAnnotatorClient();
  const [result] = await client.documentTextDetection({
    image: { content: bytes },
  });

  return normalizeGoogleVisionResponse(result.fullTextAnnotation);
}
