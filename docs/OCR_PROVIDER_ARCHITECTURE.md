# OCR provider architecture

## 1. Original Google Vision flow

The browser posts a receipt image as multipart form data to `POST /api/vision`. The original route used `@google-cloud/vision`, called `documentTextDetection`, and returned `fullTextAnnotation.text` plus word bounding-box center coordinates. That operation and normalized `{ text, words }` response remain available through the Google provider.

## 2. NVIDIA Nemotron OCR v1 integration

The NVIDIA provider sends `POST NVIDIA_OCR_ENDPOINT` with `Accept: application/json`, `Content-Type: application/json`, and `Authorization: Bearer <NVIDIA_API_KEY>`. JPEG and PNG bytes are base64-encoded into this documented NIM body:

```json
{
  "input": [{ "type": "image_url", "url": "data:image/png;base64,..." }],
  "merge_levels": ["word"]
}
```

NVIDIA's current Build page labels Nemotron OCR v1 as downloadable and links to an API reference that demonstrates a self-hosted `/v1/infer` URL. NVIDIA's current NeMo Retriever hosted quickstart separately uses `https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v1` as the full invocation URL. DUTCHIE therefore reads the full endpoint from the environment and sends the documented NIM JSON contract directly to it; it does not append the local `/v1/infer` path.

The response is normalized from `data[0].text_detections`. Detection text is preserved in returned order. Polygon points are converted to center `x`/`y` coordinates. If detections contain text without usable points, the full text is returned with an empty `words` array.

## 3. Provider selection behavior

- `OCR_PROVIDER=auto`: NVIDIA first, then Google on any NVIDIA provider failure.
- `OCR_PROVIDER=nvidia`: NVIDIA only; no Google fallback.
- `OCR_PROVIDER=google`: Google only; NVIDIA settings are not required.
- Missing or invalid values default to `auto`.

## 4. Auto fallback behavior

Missing NVIDIA configuration, authentication errors, timeouts, network failures, rate limits, provider rejections, server errors, malformed JSON, and empty OCR output trigger Google fallback in auto mode. The compatible response adds `provider`, `fallbackUsed`, and an optional sanitized `warning`. Input errors such as a missing file or unsupported MIME type happen before provider selection and do not trigger fallback. If both providers fail, the browser receives only a concise sanitized error.

## 5. Google ADC authentication

The Google provider intentionally constructs `new vision.ImageAnnotatorClient()` without credentials and calls:

```ts
client.documentTextDetection({ image: { content: bytes } });
```

Google's client library uses locally configured Application Default Credentials during development and the attached Cloud Run service account in production. DUTCHIE does not accept, load, or store a Google service-account JSON file or Google API key.

## 6. Existing price-only parsing

Provider output still enters the existing client-side `parsePricesOnly()` function. No semantic, LLM-based, layout-aware, merchant-specific, subtotal-reconciliation, or description-extraction logic was added.

## 7. Generated item names

Each extraction receives the next receipt ID (`r1`, `r2`, and so on). Extracted prices become `r1-1`, `r1-2`, etc. Items remain `source: "receipt"`, retain `receiptId`, initialize `assignedIds: []`, and can be renamed inline.

## 8. Privacy behavior

Receipt bytes and base64 data are used only for the current stateless OCR request. They are not intentionally stored or logged. Provider keys remain server-side, and route errors do not expose raw provider responses or stack traces.

## 9. Environment setup

```dotenv
OCR_PROVIDER=auto
NVIDIA_OCR_ENDPOINT=https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v1
NVIDIA_API_KEY=
```

For Cloud Run, add the same variables to the service configuration and grant its attached service account the Google Vision permissions needed for fallback. Do not add `GOOGLE_APPLICATION_CREDENTIALS`; ADC is implicit.

## 10. Current limitations

OCR accuracy varies with blur, lighting, perspective, typography, language, and receipt layout. Nemotron OCR does not guarantee correct semantic item descriptions, and DUTCHIE intentionally extracts prices only. Provider latency, availability, quotas, and cost can change. A real NVIDIA key and representative redacted receipts are required to verify live hosted behavior and measure accuracy.
