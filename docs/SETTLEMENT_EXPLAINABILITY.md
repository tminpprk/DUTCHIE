# Settlement explainability

## Previous problem

The previous **How did it work?** page led with payer tables and two large matrices. Those values were useful for auditing, but ordinary users had to infer the transfer direction, connect paid amounts to fair shares, and determine what optimization changed.

## New information hierarchy

The page now presents information in the order users need it:

1. settlement summary and readiness status;
2. final transfer instructions;
3. participant paid, fair-share, and net-balance explanations;
4. before/after transfer comparison;
5. plain-language calculation method;
6. optional payer details and matrices.

## Participant balances

Participant cards are deterministic views of the existing `paid` and `owed` outputs. They use the relationship `amount paid - fair share = net balance`. Positive values are labelled **Receives**, negative values **Owes**, and values within the existing cent tolerance **Settled**. Text labels accompany color so status does not depend on color alone.

## Transfer instructions

Final action cards consume the existing optimized transfers without changing direction or amount. Each card identifies the sender, receiver, amount, and a complete sentence suitable for assistive technology. Zero transfers produce an already-settled state.

## Before and after optimization

The comparison converts the existing raw and optimized matrices into readable transfer rows. It describes simplification accurately: Dutchie changes payment paths, not participant balances, and does not claim global mathematical minimality.

## Progressive matrix disclosure

Payer details, raw matrix, optimized matrix, formula notes, and checks are inside semantic `details` elements and collapsed by default. Matrix rows are senders and columns are receivers. A positive non-zero cell means the row participant sends that amount to the column participant. Tables retain the original values and scroll within their own containers on narrow screens.

## Consistency checks

Non-mutating presentation checks verify that balances sum to approximately zero, transfer amounts are positive, raw and optimized outcomes agree, and optimized transfer net effects match participant balances. A success label appears only when data is complete and checks pass. Failures show a warning and do not alter calculation data.

## Responsive behavior

Summary metrics, transfer cards, balance cards, and comparisons reflow at tablet and mobile widths. At 430px and below, transfer routes stack while preserving a visible directional arrow and amount. Matrices keep their minimum readable width and scroll inside the table container, preventing page-level overflow.

## Accessibility

The page uses ordered headings, semantic lists, `details`/`summary`, scoped table headers, captions, status and alert roles, labelled arrows, visible focus styles, and text-based balance states. Long participant names wrap rather than truncate.

## Remaining limitations

- Explanations are deterministic and calculation-based; no AI model generates settlement text.
- The existing greedy settlement routine is preserved and is not described as globally minimal.
- Currency remains the application's existing USD assumption.
- Incomplete payer or assignment data is not repaired automatically.
- Visual verification should still be performed in a real browser with representative long names and large groups.
