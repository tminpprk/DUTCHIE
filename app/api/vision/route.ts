import { NextResponse } from 'next/server';
import vision from '@google-cloud/vision';

export const runtime = 'nodejs';

type WordOut = {
  text: string;
  x: number; // center x
  y: number; // center y
};

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const client = new vision.ImageAnnotatorClient();

    const [result] = await client.documentTextDetection({
      image: { content: bytes },
    });

    const text = result.fullTextAnnotation?.text ?? '';

    // ✅ word + 좌표 추출
    const words: WordOut[] = [];
    const pages = result.fullTextAnnotation?.pages ?? [];

    for (const page of pages) {
      for (const block of page.blocks ?? []) {
        for (const para of block.paragraphs ?? []) {
          for (const w of para.words ?? []) {
            const wordText = (w.symbols ?? []).map((s) => s.text ?? '').join('');
            const vs = w.boundingBox?.vertices ?? [];
            if (!wordText || vs.length < 2) continue;

            const xs = vs.map((v) => v.x ?? 0);
            const ys = vs.map((v) => v.y ?? 0);
            const x = (Math.min(...xs) + Math.max(...xs)) / 2;
            const y = (Math.min(...ys) + Math.max(...ys)) / 2;

            words.push({ text: wordText, x, y });
          }
        }
      }
    }

    return NextResponse.json({ text, words });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Vision request failed' },
      { status: 500 }
    );
  }
}
