export type OcrProviderName = 'nvidia' | 'google';
export type OcrProviderMode = 'auto' | OcrProviderName;

export type OcrWord = {
  text: string;
  x: number;
  y: number;
};

export type OcrProviderResult = {
  text: string;
  words: OcrWord[];
  provider: OcrProviderName;
};

export type OcrResponse = OcrProviderResult & {
  fallbackUsed: boolean;
  warning?: string;
};

export class OcrProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly publicMessage: string,
    public readonly status = 500,
  ) {
    super(publicMessage);
    this.name = 'OcrProviderError';
  }
}
