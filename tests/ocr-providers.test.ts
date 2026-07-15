import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGoogleVisionResponse } from '../lib/ocr/google';
import { normalizeNvidiaResponse, scanWithNvidia } from '../lib/ocr/nvidia';
import { resolveOcrProvider, selectOcrProvider, type ProviderDependencies } from '../lib/ocr/select-provider';
import { OcrProviderError, type OcrProviderResult } from '../lib/ocr/types';

const bytes = Buffer.from('not-a-real-image');
const nvidiaResult: OcrProviderResult = { text: 'ITEM\n7.41', words: [], provider: 'nvidia' };
const googleResult: OcrProviderResult = { text: 'ITEM\n7.41', words: [], provider: 'google' };

function providers(overrides: Partial<ProviderDependencies> = {}): ProviderDependencies {
  return {
    nvidia: async () => nvidiaResult,
    google: async () => googleResult,
    ...overrides,
  };
}

test('auto mode returns NVIDIA when NVIDIA succeeds', async () => {
  let googleCalls = 0;
  const result = await selectOcrProvider(bytes, 'image/png', 'auto', providers({
    google: async () => { googleCalls++; return googleResult; },
  }));
  assert.equal(result.provider, 'nvidia');
  assert.equal(result.fallbackUsed, false);
  assert.equal(googleCalls, 0);
});

test('auto mode calls Google when NVIDIA throws', async () => {
  const result = await selectOcrProvider(bytes, 'image/png', 'auto', providers({
    nvidia: async () => { throw new Error('secret provider detail'); },
  }));
  assert.equal(result.provider, 'google');
  assert.equal(result.fallbackUsed, true);
});

test('auto mode calls Google when NVIDIA returns empty text', async () => {
  const result = await selectOcrProvider(bytes, 'image/png', 'auto', providers({
    nvidia: async () => ({ ...nvidiaResult, text: '  ' }),
  }));
  assert.equal(result.provider, 'google');
  assert.equal(result.fallbackUsed, true);
});

test('nvidia mode does not call Google on failure', async () => {
  let googleCalls = 0;
  await assert.rejects(() => selectOcrProvider(bytes, 'image/jpeg', 'nvidia', providers({
    nvidia: async () => { throw new Error('failed'); },
    google: async () => { googleCalls++; return googleResult; },
  })));
  assert.equal(googleCalls, 0);
});

test('google mode does not call NVIDIA', async () => {
  let nvidiaCalls = 0;
  const result = await selectOcrProvider(bytes, 'image/jpeg', 'google', providers({
    nvidia: async () => { nvidiaCalls++; return nvidiaResult; },
  }));
  assert.equal(result.provider, 'google');
  assert.equal(nvidiaCalls, 0);
});

test('missing and invalid OCR_PROVIDER values default to auto', () => {
  assert.equal(resolveOcrProvider(undefined), 'auto');
  assert.equal(resolveOcrProvider('unexpected'), 'auto');
});

test('both providers failing returns only a sanitized error', async () => {
  const failure = selectOcrProvider(bytes, 'image/png', 'auto', providers({
    nvidia: async () => { throw new Error('nvidia-provider-detail'); },
    google: async () => { throw new Error('google-internal-stack'); },
  }));
  await assert.rejects(failure, (error: unknown) => {
    assert.ok(error instanceof OcrProviderError);
    assert.equal(error.publicMessage, 'Both NVIDIA OCR and Google Vision failed.');
    assert.doesNotMatch(error.message, /secret|internal-stack/);
    return true;
  });
});

test('NVIDIA response normalization produces text and center coordinates', () => {
  const result = normalizeNvidiaResponse({
    data: [{ text_detections: [{
      text_prediction: { text: '7.41', confidence: 0.99 },
      bounding_box: { points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.2 }, { x: 0.3, y: 0.4 }, { x: 0.1, y: 0.4 }] },
    }] }],
  });
  assert.equal(result.text, '7.41');
  assert.deepEqual(result.words, [{ text: '7.41', x: 0.2, y: 0.30000000000000004 }]);
});

test('hosted NVIDIA request uses the documented JSON data URL contract', async () => {
  const previousEndpoint = process.env.NVIDIA_OCR_ENDPOINT;
  const previousKey = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_OCR_ENDPOINT = 'https://example.invalid/nemotron-ocr-v1';
  process.env.NVIDIA_API_KEY = 'test-key';
  try {
    const fakeFetch: typeof fetch = async (input, init) => {
      assert.equal(input, process.env.NVIDIA_OCR_ENDPOINT);
      assert.equal(init?.method, 'POST');
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-key');
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.merge_levels, ['word']);
      assert.match(body.input[0].url, /^data:image\/png;base64,/);
      return new Response(JSON.stringify({
        data: [{ text_detections: [{ text_prediction: { text: '7.41' } }] }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const result = await scanWithNvidia(bytes, 'image/png', fakeFetch);
    assert.equal(result.text, '7.41');
  } finally {
    if (previousEndpoint === undefined) delete process.env.NVIDIA_OCR_ENDPOINT;
    else process.env.NVIDIA_OCR_ENDPOINT = previousEndpoint;
    if (previousKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = previousKey;
  }
});

test('Google response normalization remains compatible with original output', () => {
  const result = normalizeGoogleVisionResponse({
    text: 'MILK 7.41\n',
    pages: [{ blocks: [{ paragraphs: [{ words: [{
      symbols: [{ text: 'M' }, { text: 'I' }, { text: 'L' }, { text: 'K' }],
      boundingBox: { vertices: [{ x: 10, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 40 }, { x: 10, y: 40 }] },
    }] }] }] }],
  });
  assert.deepEqual(result, { text: 'MILK 7.41\n', words: [{ text: 'MILK', x: 20, y: 30 }], provider: 'google' });
});
