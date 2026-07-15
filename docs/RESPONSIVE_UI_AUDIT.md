# Responsive UI audit

## Scope

This phase inspected every user-facing route in the current flow:

1. `/` — landing
2. `/add_ppl` — participants
3. `/add_item` — manual items and receipt review
4. `/split` — receipt-item assignment
5. `/payment` — payer selection
6. `/result` — responsibility summary
7. `/dutchie` — optimized transfers
8. `/hdiw` — existing calculation explanation and matrices

The global layout, global store, transition template, OCR route/provider modules, Docker configuration, and current tests were also reviewed. OCR, receipt parsing, settlement calculations, and transfer optimization were not changed.

## Problems found

- The Add Item page depended on two fixed 420px columns.
- Split, Payment, and Result used fixed 360px secondary panels without a narrow-screen layout change.
- Dutchie and How Did It Work sections used 360px minimum widths that could exceed a 320px viewport after page padding.
- Several pages used fixed Next controls without shared safe-area positioning or consistent bottom content clearance.
- The Add Item manual form retained three columns at phone widths.
- Wide calculation matrices required explicit, controlled horizontal scrolling.
- Long item/participant names could compete with amounts and remove controls in flex rows.
- Click-to-edit item text was mouse-only even though the edit input itself supported keyboard save/cancel.
- Global styles did not establish border-box sizing, zero body margin, inherited form fonts, responsive images, or visible focus rings.

## Responsive strategy

The existing inline styles and dark visual identity remain in place. A small set of semantic classes in `app/globals.css` supplies only responsive behavior:

- `.app-page` — centered desktop width, fluid padding, safe bottom clearance
- `.responsive-columns` — existing desktop rows become stacked below 900px
- `.responsive-fixed-panel`, `.responsive-panel`, `.responsive-card` — fixed panels become full width without overflow
- `.responsive-form-grid` — compact tablet form and single-column phone form
- `.responsive-header-row`, `.responsive-item-row` — safe wrapping and `min-width: 0`
- `.responsive-scroll` — contained horizontal table scrolling
- `.responsive-receipt-image` — bounded, aspect-preserving receipt preview
- `.fixed-next-control`, `.fixed-wide-control` — safe-area-aware fixed actions
- `.keyboard-editable` — visible keyboard focus for existing inline editing

No UI framework or responsive JavaScript was added.

## Viewport checklist

The following widths were checked systematically against CSS rules and remaining inline fixed widths:

| Width | Expected layout | Code audit |
| --- | --- | --- |
| 320px | Single column, 14px page gutters, stacked forms, contained tables | Passed static review |
| 375px | Single column with wrapped item and participant rows | Passed static review |
| 390px | Single column with safe fixed controls | Passed static review |
| 430px | Single column, full-width cards and receipt preview | Passed static review |
| 768px | Tablet single column for major page sections | Passed static review |
| 1024px | Existing desktop/tablet rows where space permits | Passed static review |
| 1280px | Recognizable existing desktop layout within a centered max width | Passed static review |

All remaining 360px/420px panel widths have responsive class overrides. All remaining 420px/520px table minimum widths are inside `.responsive-scroll` containers. Fixed controls have safe positioning and every `.app-page` reserves bottom space.

## Accessibility and interaction checks

- Global visible `:focus-visible` styling was added.
- Icon-only Next buttons now have explicit accessible labels.
- Participant and manual-item inputs have accessible names.
- Click-to-edit item names and prices can be activated with mouse, Enter, or Space.
- Existing auto-select, Enter-save, Escape-cancel, and blur behavior remains unchanged.
- Buttons and mobile form controls retain practical touch/input sizing.

## Manual verification still required

No browser backend was available in the development session, so real rendered viewport checks could not be performed. Manually verify in a browser at 320px, 390px, 768px, and 1280px:

- empty and populated states on every route;
- very long participant, item, and receipt names;
- multiple completed receipts plus an active receipt;
- a tall receipt preview;
- fixed Next/DUTCHIE controls while scrolled to the bottom;
- horizontal scrolling inside Dutchie and How Did It Work matrices without page-level scrolling;
- keyboard focus and editing behavior in Add Item;
- safe-area positioning on an iPhone simulator or physical device.

## Known limitations

- The existing matrices remain wide by design and scroll inside their cards on small screens.
- The repository still has pre-existing ESLint failures, primarily `no-explicit-any`, unrelated to responsive behavior.
- Visual regression screenshots were not produced because no browser instance was available.
