# DUTCHIE

DUTCHIE is a Next.js and TypeScript web application that helps groups split expenses fairly and minimize the number of repayment transfers.

Live demo: https://dutchie-505375468841.asia-northeast3.run.app/

Prototype: https://docs.google.com/presentation/d/1lBoc5AYGI8r5uN91CG3Umajn36QXNOVDilZIWVDKwnA/edit?usp=sharing

## Features

- Add people and manual or receipt-derived expense items.
- Upload JPEG or PNG receipts for price extraction. In `auto` mode, DUTCHIE uses hosted NVIDIA Nemotron OCR v1 first and Google Cloud Vision as a fallback.
- Keep OCR output in the existing price-only parser. Receipt item names are intentionally generated as `r1-1`, `r1-2`, and so on; users can rename them inline.
- Assign receipt items to participants and select who paid each receipt or manual item.
- Calculate balances and optimize the transfers needed to settle the group.

## OCR configuration

Copy `.env.example` to `.env.local` for local development and set:

- `OCR_PROVIDER`: `auto`, `nvidia`, or `google`. Missing and invalid values safely default to `auto`.
- `NVIDIA_OCR_ENDPOINT`: the full hosted Nemotron OCR v1 inference URL.
- `NVIDIA_API_KEY`: a server-side NVIDIA API key.

Google Vision continues to use Application Default Credentials (ADC). DUTCHIE does not load or store a Google JSON credential key. Local development can use locally configured ADC; Cloud Run uses the service account attached to the service. `OCR_PROVIDER=google` does not require either NVIDIA variable.

Receipt images are processed transiently and are not intentionally stored. OCR quality depends on the image and receipt format, and NVIDIA endpoint availability, quotas, and pricing depend on NVIDIA's current service terms. Nemotron provides OCR text and coordinates—not guaranteed semantic receipt descriptions—and DUTCHIE intentionally continues extracting prices only.

See [docs/OCR_PROVIDER_ARCHITECTURE.md](docs/OCR_PROVIDER_ARCHITECTURE.md) for the provider contract and fallback behavior.

## Development

```bash
npm ci
npm run dev
npm run test
npm run lint
npm run build
```
