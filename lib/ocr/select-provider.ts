import { scanWithGoogle } from './google';
import { scanWithNvidia } from './nvidia';
import { OcrProviderError, type OcrProviderMode, type OcrProviderResult, type OcrResponse } from './types';

export type ProviderDependencies = {
  nvidia: (bytes: Buffer, mimeType: 'image/jpeg' | 'image/png') => Promise<OcrProviderResult>;
  google: (bytes: Buffer) => Promise<OcrProviderResult>;
};

const defaultProviders: ProviderDependencies = { nvidia: scanWithNvidia, google: scanWithGoogle };

export function resolveOcrProvider(value = process.env.OCR_PROVIDER): OcrProviderMode {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'nvidia' || normalized === 'google' || normalized === 'auto' ? normalized : 'auto';
}

export async function selectOcrProvider(
  bytes: Buffer,
  mimeType: 'image/jpeg' | 'image/png',
  mode = resolveOcrProvider(),
  providers: ProviderDependencies = defaultProviders,
): Promise<OcrResponse> {
  if (mode === 'nvidia') {
    const result = await providers.nvidia(bytes, mimeType);
    if (!result.text.trim()) throw new OcrProviderError('NVIDIA_EMPTY_RESPONSE', 'NVIDIA OCR returned no usable text.', 502);
    return { ...result, fallbackUsed: false };
  }
  if (mode === 'google') return { ...(await providers.google(bytes)), fallbackUsed: false };

  try {
    const result = await providers.nvidia(bytes, mimeType);
    if (!result.text.trim()) throw new OcrProviderError('NVIDIA_EMPTY_RESPONSE', 'NVIDIA OCR returned no usable text.', 502);
    return { ...result, fallbackUsed: false };
  } catch {
    try {
      return {
        ...(await providers.google(bytes)),
        fallbackUsed: true,
        warning: 'NVIDIA OCR was unavailable; Google Vision fallback was used.',
      };
    } catch {
      throw new OcrProviderError('ALL_PROVIDERS_FAILED', 'Both NVIDIA OCR and Google Vision failed.', 500);
    }
  }
}
