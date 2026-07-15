# DUTCHIE Codex Instructions

## Project identity

DUTCHIE is a deployed group-expense settlement web application.

Current stack:
- Next.js App Router
- React
- TypeScript
- Custom client-side global store
- Next.js Route Handlers
- Google Cloud Vision API
- Docker
- Google Cloud Build
- Google Cloud Run

Current user flow:
1. Landing page
2. Add people
3. Add manual items or upload receipts
4. Assign receipt-derived items to participants
5. Select who paid each item or receipt
6. Calculate how much each person owes
7. Optimize who sends money to whom
8. Explain the raw and optimized calculations on the "How did it work?" page

## Primary objective

Upgrade DUTCHIE into a credible AI-assisted and AI-powered portfolio project while preserving its current identity, route flow, calculation logic, and visual style.

Do not redesign or rewrite the entire application.

## Required upgrade areas

1. Improve receipt extraction accuracy.
2. Make all pages responsive on phones, tablets, and desktop.
3. Redesign the "How did it work?" page so ordinary users can understand and trust the calculation.

## Architecture constraints

- Do not add a database.
- Do not add authentication.
- Do not persist receipt images.
- Keep receipt processing stateless.
- API credentials must remain server-side.
- Do not expose Google or NVIDIA credentials in client components.
- Do not log uploaded image bytes or full OCR output in production.
- Preserve existing URLs and page flow unless a change is strictly required.
- Preserve the existing settlement and transfer-optimization behavior.
- Preserve the overall dark visual identity.

## Receipt intelligence principles

- Do not rely on store-specific regex rules.
- Do not blindly replace the existing Google Vision implementation.
- First create a provider abstraction so OCR/document providers can be compared and swapped.
- Keep the current implementation as a baseline and fallback until a replacement is proven better.
- Prefer structured extraction over brittle raw-text parsing.
- Validate all AI output before it enters application state.
- Reject invalid, NaN, duplicated, or impossible values.
- Preserve human correction of item names and prices.
- Return confidence and warnings where supported.
- Never claim 100 percent OCR accuracy.

Evaluate at least:
- Existing Google Cloud Vision OCR
- Google Document AI Expense Parser
- NVIDIA NIM Nemotron OCR or document-parsing candidate

Choose the default provider using measured accuracy, latency, reliability, deployment complexity, and cost rather than novelty.

## Evaluation requirements

Create a reproducible receipt evaluation harness using synthetic, public, or fully redacted receipts only.

Measure:
- Item-price recall
- Item-price precision
- Total amount accuracy
- Duplicate extraction rate
- False-positive rate
- Average latency
- Provider failure rate

Do not commit private user receipts.

## Responsive design requirements

Test at minimum:
- 320px
- 375px
- 390px
- 430px
- 768px
- 1280px

Requirements:
- No horizontal page overflow.
- No clipped fixed buttons.
- No unreadable tables.
- No desktop layout regression.
- Wide tables must become scrollable, condensed, or card-based on mobile.
- Forms and action buttons must remain comfortably tappable.
- Use existing design language rather than introducing an unrelated UI kit.

## "How did it work?" UX requirements

The page should answer these questions in order:

1. How much did each person pay?
2. How much was each person actually responsible for?
3. Is each person owed money or do they owe money?
4. What transfers would happen without optimization?
5. What transfers remain after optimization?
6. How many transfers were removed?

Provide:
- A simple default explanation for normal users.
- A detailed optional view for users who want the matrices.
- Plain-language explanations such as:
  "Alex paid $120 but was responsible for $40, so Alex should receive $80."
- Clear arrows or transfer cards showing sender, receiver, and amount.
- A visible comparison of raw versus optimized transfer count.
- Mobile-friendly alternatives to large matrices.
- Accessible labels and sufficient contrast.

Avoid decorative charts that do not improve understanding.

## AI-assisted development documentation

Create or update:
- README.md
- docs/AI_DEVELOPMENT.md
- docs/RECEIPT_EVALUATION.md
- .env.example

README claims must be accurate.

Use wording similar to:
"AI-powered receipt understanding with an evaluated multi-provider document extraction pipeline."

Document how Codex was used for:
- Repository analysis
- Refactoring
- Test creation
- Evaluation harness development
- Responsive UI improvements
- Explainability UX

Do not claim that the application trains its own AI model unless it actually does.

## Engineering workflow

Before modifying code:
1. Inspect the repository structure.
2. Read package.json, README, store implementation, receipt API route, settlement logic, and all affected pages.
3. Run the existing lint and build commands.
4. Summarize the current architecture and identify risks.

During implementation:
- Work incrementally.
- Prefer small reusable modules over one large page file.
- Avoid `any` when practical.
- Avoid adding dependencies unless they have a clear benefit.
- Preserve unrelated code.
- Add tests for receipt normalization and settlement calculations.
- Keep secrets out of source control.

After changes:
- Run npm run lint.
- Run npm run build.
- Run all added tests.
- Report changed files, validation results, remaining limitations, and required environment variables.

Do not stop after producing a plan. Continue implementation unless blocked by missing credentials, an unavailable external service, or a decision that could substantially change product behavior.