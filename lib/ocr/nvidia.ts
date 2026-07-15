import { OcrProviderError, type OcrProviderResult, type OcrWord } from './types';

type NvidiaPoint = { x?: unknown; y?: unknown };
type NvidiaDetection = {
  text_prediction?: { text?: unknown };
  bounding_box?: { points?: NvidiaPoint[] };
};

const NVIDIA_TIMEOUT_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asDetections(payload: unknown): NvidiaDetection[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return [];
  const first = payload.data[0];
  if (!isRecord(first) || !Array.isArray(first.text_detections)) return [];
  return first.text_detections.filter(isRecord) as NvidiaDetection[];
}

export function normalizeNvidiaResponse(payload: unknown): OcrProviderResult {
  const words: OcrWord[] = [];
  const textParts: string[] = [];

  for (const detection of asDetections(payload)) {
    const rawText = detection.text_prediction?.text;
    const text = typeof rawText === 'string' ? rawText.trim() : '';
    if (!text) continue;
    textParts.push(text);

    const points = detection.bounding_box?.points ?? [];
    const validPoints = points.flatMap((point) =>
      typeof point.x === 'number' && Number.isFinite(point.x) &&
      typeof point.y === 'number' && Number.isFinite(point.y)
        ? [{ x: point.x, y: point.y }]
        : [],
    );
    if (validPoints.length < 2) continue;

    const xs = validPoints.map((point) => point.x);
    const ys = validPoints.map((point) => point.y);
    words.push({
      text,
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    });
  }

  const text = textParts.join('\n').trim();
  if (!text) {
    throw new OcrProviderError('NVIDIA_EMPTY_RESPONSE', 'NVIDIA OCR returned no usable text.', 502);
  }
  return { text, words, provider: 'nvidia' };
}

function statusError(status: number): OcrProviderError {
  if (status === 401 || status === 403) {
    return new OcrProviderError('NVIDIA_AUTH', 'NVIDIA OCR authentication failed.', 502);
  }
  if (status === 413) return new OcrProviderError('NVIDIA_TOO_LARGE', 'NVIDIA OCR rejected the image as too large.', 413);
  if (status === 422) return new OcrProviderError('NVIDIA_REJECTED', 'NVIDIA OCR could not process this image.', 422);
  if (status === 429) return new OcrProviderError('NVIDIA_RATE_LIMIT', 'NVIDIA OCR is temporarily rate limited.', 503);
  if (status >= 500) return new OcrProviderError('NVIDIA_SERVER', 'NVIDIA OCR is temporarily unavailable.', 502);
  return new OcrProviderError('NVIDIA_REJECTED', 'NVIDIA OCR rejected the request.', 502);
}

export async function scanWithNvidia(
  bytes: Buffer,
  mimeType: 'image/jpeg' | 'image/png',
  fetchImpl: typeof fetch = fetch,
): Promise<OcrProviderResult> {
  const endpoint = process.env.NVIDIA_OCR_ENDPOINT?.trim();
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!endpoint) throw new OcrProviderError('NVIDIA_ENDPOINT_MISSING', 'NVIDIA_OCR_ENDPOINT is not configured.');
  if (!apiKey) throw new OcrProviderError('NVIDIA_KEY_MISSING', 'NVIDIA_API_KEY is not configured.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NVIDIA_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: [{ type: 'image_url', url: `data:${mimeType};base64,${bytes.toString('base64')}` }],
        merge_levels: ['word'],
      }),
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new OcrProviderError('NVIDIA_TIMEOUT', 'NVIDIA OCR timed out.', 504);
    }
    throw new OcrProviderError('NVIDIA_NETWORK', 'NVIDIA OCR could not be reached.', 502);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw statusError(response.status);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OcrProviderError('NVIDIA_MALFORMED_JSON', 'NVIDIA OCR returned an invalid response.', 502);
  }
  return normalizeNvidiaResponse(payload);
}
