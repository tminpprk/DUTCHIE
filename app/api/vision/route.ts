import { NextResponse } from 'next/server';
import { selectOcrProvider } from '../../../lib/ocr/select-provider';
import { OcrProviderError } from '../../../lib/ocr/types';

export const runtime = 'nodejs';

const supportedMimeTypes = new Set(['image/jpeg', 'image/png']);

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Could not read uploaded form data.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }
  if (!supportedMimeTypes.has(file.type)) {
    return NextResponse.json({ error: 'Only JPEG and PNG receipt images are supported.' }, { status: 415 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await selectOcrProvider(bytes, file.type as 'image/jpeg' | 'image/png');
    return NextResponse.json(result);
  } catch (error: unknown) {
    const known = error instanceof OcrProviderError ? error : null;
    return NextResponse.json(
      { error: known?.publicMessage ?? 'OCR request failed.' },
      { status: known?.status ?? 500 },
    );
  }
}
