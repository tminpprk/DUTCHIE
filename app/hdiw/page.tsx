'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useStore, type Item } from '../store';
import {
  buildOptimizationSummary,
  buildParticipantBalanceViews,
  buildTransferViews,
  checkSettlementConsistency,
  formatCurrency,
  transfersFromMatrix,
  type Transfer,
  type TransferView,
} from '../../lib/settlement-explainability';

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

// This is the existing settlement routine. Presentation code consumes its output unchanged.
function computeTransfersFromBalance(balance: Record<string, number>): Transfer[] {
  const creditors: { id: string; amt: number }[] = [];
  const debtors: { id: string; amt: number }[] = [];

  for (const [id, bal] of Object.entries(balance)) {
    const value = round2(bal);
    if (value > 0.009) creditors.push({ id, amt: value });
    else if (value < -0.009) debtors.push({ id, amt: -value });
  }

  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const transfers: Transfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amt, creditor.amt);
    const rounded = round2(amount);
    if (rounded > 0) transfers.push({ fromId: debtor.id, toId: creditor.id, amount: rounded });

    debtor.amt = round2(debtor.amt - amount);
    creditor.amt = round2(creditor.amt - amount);
    if (debtor.amt <= 0.009) debtorIndex++;
    if (creditor.amt <= 0.009) creditorIndex++;
  }

  return transfers;
}

type PaymentEvent = {
  eventId: string;
  label: string;
  payerId?: string;
  total: number;
  sharesByPerson: Record<string, number>;
};

function TransferCards({ transfers, compact = false }: { transfers: TransferView[]; compact?: boolean }) {
  if (transfers.length === 0) {
    return (
      <div className="settlement-empty" role="status">
        No transfers are needed. Everyone has already paid their fair share.
      </div>
    );
  }

  return (
    <ol className="transfer-card-list" aria-label="Transfer instructions">
      {transfers.map((transfer, index) => (
        <li className={compact ? 'transfer-card transfer-card-compact' : 'transfer-card'} key={`${transfer.fromId}-${transfer.toId}-${index}`}>
          <span className="transfer-sequence" aria-hidden="true">{index + 1}</span>
          <div className="transfer-route">
            <strong>{transfer.fromName}</strong>
            <span className="transfer-arrow" aria-label="sends money to">→</span>
            <strong>{transfer.toName}</strong>
          </div>
          <strong className="transfer-amount">{formatCurrency(transfer.amount)}</strong>
          {!compact && <span className="transfer-sentence">{transfer.sentence}</span>}
        </li>
      ))}
    </ol>
  );
}

export default function HowItWorksPage() {
  const { people, items, receiptPaidBy } = useStore();
  const manualItems = useMemo(() => items.filter((item) => item.source === 'manual'), [items]);
  const receiptItems = useMemo(() => items.filter((item) => item.source === 'receipt'), [items]);
  const peopleIds = useMemo(() => people.map((person) => person.id), [people]);
  const nameOf = (id: string) => people.find((person) => person.id === id)?.name.trim() || 'Unnamed';

  const receiptGroups = useMemo(() => {
    const groups = new Map<string, Item[]>();
    for (const item of receiptItems) {
      const receiptId = item.receiptId || 'r1';
      groups.set(receiptId, [...(groups.get(receiptId) ?? []), item]);
    }
    return Array.from(groups.entries())
      .map(([receiptId, groupItems]) => ({ receiptId, items: groupItems }))
      .sort((a, b) => a.receiptId.localeCompare(b.receiptId, undefined, { numeric: true }));
  }, [receiptItems]);

  const events = useMemo<PaymentEvent[]>(() => {
    const paymentEvents: PaymentEvent[] = [];
    receiptGroups.forEach((group, index) => {
      const sharesByPerson: Record<string, number> = Object.fromEntries(people.map((person) => [person.id, 0]));
      let total = 0;
      for (const item of group.items) {
        const price = Number(item.price) || 0;
        total += price;
        const assignedIds = item.assignedIds ?? [];
        if (!assignedIds.length) continue;
        const share = price / assignedIds.length;
        for (const id of assignedIds) if (sharesByPerson[id] !== undefined) sharesByPerson[id] += share;
      }
      for (const id of Object.keys(sharesByPerson)) sharesByPerson[id] = round2(sharesByPerson[id]);
      paymentEvents.push({
        eventId: `receipt:${group.receiptId}`,
        label: `Receipt #${index + 1} (${group.receiptId})`,
        payerId: receiptPaidBy[group.receiptId],
        total: round2(total),
        sharesByPerson,
      });
    });

    for (const item of manualItems) {
      const sharesByPerson: Record<string, number> = Object.fromEntries(people.map((person) => [person.id, 0]));
      const price = Number(item.price) || 0;
      if (people.length > 0) {
        const share = price / people.length;
        for (const person of people) sharesByPerson[person.id] = round2(share);
      }
      paymentEvents.push({
        eventId: `manual:${item.id}`,
        label: item.name,
        payerId: item.paidById,
        total: round2(price),
        sharesByPerson,
      });
    }
    return paymentEvents;
  }, [people, manualItems, receiptGroups, receiptPaidBy]);

  const rawMatrix = useMemo(() => {
    const indexById: Record<string, number> = {};
    people.forEach((person, index) => { indexById[person.id] = index; });
    const matrix = Array.from({ length: people.length }, () => Array(people.length).fill(0) as number[]);
    for (const event of events) {
      if (!event.payerId) continue;
      for (const person of people) {
        if (person.id === event.payerId) continue;
        const amount = event.sharesByPerson[person.id] ?? 0;
        if (amount > 0.009) {
          const row = indexById[person.id];
          const column = indexById[event.payerId];
          matrix[row][column] = round2(matrix[row][column] + amount);
        }
      }
    }
    return matrix;
  }, [people, events]);

  const settlement = useMemo(() => {
    const owed: Record<string, number> = {};
    const paid: Record<string, number> = {};
    for (const person of people) {
      owed[person.id] = 0;
      paid[person.id] = 0;
    }

    if (people.length > 0) {
      for (const item of manualItems) {
        const share = (Number(item.price) || 0) / people.length;
        for (const person of people) owed[person.id] += share;
      }
    }
    for (const item of receiptItems) {
      const assignedIds = item.assignedIds ?? [];
      if (!assignedIds.length) continue;
      const share = (Number(item.price) || 0) / assignedIds.length;
      for (const id of assignedIds) if (owed[id] !== undefined) owed[id] += share;
    }
    for (const item of manualItems) {
      if (item.paidById && paid[item.paidById] !== undefined) paid[item.paidById] += Number(item.price) || 0;
    }

    const receiptTotals = new Map<string, number>();
    for (const item of receiptItems) {
      const receiptId = item.receiptId || 'r1';
      receiptTotals.set(receiptId, (receiptTotals.get(receiptId) ?? 0) + (Number(item.price) || 0));
    }
    for (const [receiptId, total] of receiptTotals) {
      const payerId = receiptPaidBy[receiptId];
      if (payerId && paid[payerId] !== undefined) paid[payerId] += total;
    }
    for (const id of Object.keys(owed)) owed[id] = round2(owed[id]);
    for (const id of Object.keys(paid)) paid[id] = round2(paid[id]);

    const balance: Record<string, number> = {};
    for (const id of Object.keys(owed)) balance[id] = round2((paid[id] ?? 0) - (owed[id] ?? 0));
    const transfers = computeTransfersFromBalance(balance);
    const indexById: Record<string, number> = {};
    people.forEach((person, index) => { indexById[person.id] = index; });
    const matrix = Array.from({ length: people.length }, () => Array(people.length).fill(0) as number[]);
    for (const transfer of transfers) {
      const row = indexById[transfer.fromId];
      const column = indexById[transfer.toId];
      if (row !== undefined && column !== undefined) matrix[row][column] = round2(matrix[row][column] + transfer.amount);
    }
    return { owed, paid, balance, transfers, matrix };
  }, [people, manualItems, receiptItems, receiptPaidBy]);

  const rawTransfers = useMemo(() => transfersFromMatrix(rawMatrix, peopleIds), [rawMatrix, peopleIds]);
  const participantViews = useMemo(
    () => buildParticipantBalanceViews(people, settlement.paid, settlement.owed),
    [people, settlement.paid, settlement.owed]
  );
  const rawTransferViews = useMemo(() => buildTransferViews(rawTransfers, people), [rawTransfers, people]);
  const optimizedTransferViews = useMemo(
    () => buildTransferViews(settlement.transfers, people),
    [settlement.transfers, people]
  );
  const optimization = useMemo(
    () => buildOptimizationSummary(rawTransfers, settlement.transfers),
    [rawTransfers, settlement.transfers]
  );
  const consistency = useMemo(
    () => checkSettlementConsistency(settlement.balance, rawTransfers, settlement.transfers),
    [settlement.balance, rawTransfers, settlement.transfers]
  );
  const totalExpense = round2(Object.values(settlement.owed).reduce((sum, amount) => sum + amount, 0));
  const hasItems = items.length > 0;
  const incomplete = receiptItems.some((item) => !(item.assignedIds ?? []).length)
    || manualItems.some((item) => !item.paidById)
    || receiptGroups.some((group) => !receiptPaidBy[group.receiptId]);

  const renderMatrix = (matrix: number[][], title: string, caption: string) => (
    <div className="matrix-block">
      <h3>{title}</h3>
      <p>{caption} Read each row as the sender and each column as the receiver. A non-zero value means the row person sends that amount to the column person; zero means no direct transfer.</p>
      <div className="responsive-scroll">
        <table className="settlement-matrix">
          <caption>{title}. Rows are senders and columns are receivers.</caption>
          <thead>
            <tr>
              <th scope="col">Sender \ Receiver</th>
              {peopleIds.map((id) => <th scope="col" key={id}>{nameOf(id)}</th>)}
            </tr>
          </thead>
          <tbody>
            {peopleIds.map((fromId, row) => (
              <tr key={fromId}>
                <th scope="row">{nameOf(fromId)}</th>
                {peopleIds.map((toId, column) => (
                  <td key={toId}>{formatCurrency(matrix[row]?.[column] ?? 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (people.length === 0) {
    return (
      <main className="app-page settlement-page">
        <h1>How did it work?</h1>
        <div className="settlement-empty"><h2>Add participants first</h2><p>There is no settlement to explain yet.</p><Link href="/add_ppl">Go to add people</Link></div>
      </main>
    );
  }

  if (!hasItems) {
    return (
      <main className="app-page settlement-page">
        <h1>How did it work?</h1>
        <div className="settlement-empty"><h2>Add expenses first</h2><p>Participants are ready, but there are no items to calculate.</p><Link href="/add_item">Go to add items</Link></div>
      </main>
    );
  }

  return (
    <main className="app-page settlement-page">
      <header className="settlement-page-header">
        <div><p className="eyebrow">Settlement explanation</p><h1>How did it work?</h1><p>See what to pay now, why each balance exists, and what Dutchie simplified.</p></div>
        <div className="settlement-header-actions">
          <button
            className="settlement-share-button"
            type="button"
            onClick={() => window.print()}
            aria-label="Share or save this settlement as a PDF"
          >
            Share / Save PDF
          </button>
          <Link className="settlement-back-link" href="/dutchie">Back to DUTCHIE</Link>
        </div>
      </header>

      {incomplete && <div className="settlement-warning" role="alert"><strong>Some selections are incomplete.</strong> Unassigned items or missing payers remain excluded by the existing calculation. Review them before settling.</div>}
      {!incomplete && consistency.balanced ? (
        <div className="settlement-status" role="status"><strong>✓ Calculation balanced</strong><span>Ready to settle</span></div>
      ) : !incomplete && (
        <div className="settlement-warning" role="alert"><strong>Calculation needs review.</strong>{consistency.messages.map((message) => <span key={message}>{message}</span>)}</div>
      )}

      <section aria-labelledby="summary-heading" className="settlement-summary">
        <p className="eyebrow">What do we need to do now?</p>
        <h2 id="summary-heading">Everyone can settle with {optimization.optimizedTransferCount} {optimization.optimizedTransferCount === 1 ? 'payment' : 'payments'}.</h2>
        <p>Dutchie simplified the payment flow from {optimization.rawTransferCount} {optimization.rawTransferCount === 1 ? 'transfer' : 'transfers'} to {optimization.optimizedTransferCount}.</p>
        <div className="settlement-metrics">
          <div><span>Total group expense</span><strong>{formatCurrency(totalExpense)}</strong></div>
          <div><span>Participants</span><strong>{people.length}</strong></div>
          <div><span>Before</span><strong>{optimization.rawTransferCount}</strong></div>
          <div><span>Final transfers</span><strong>{optimization.optimizedTransferCount}</strong></div>
          <div><span>Transfers removed</span><strong>{optimization.removedTransferCount}</strong></div>
        </div>
      </section>

      <section aria-labelledby="final-transfers-heading" className="settlement-section settlement-primary-section">
        <p className="eyebrow">Final transfers</p><h2 id="final-transfers-heading">Who sends money to whom?</h2>
        <TransferCards transfers={optimizedTransferViews} />
      </section>

      <section aria-labelledby="people-heading" className="settlement-section settlement-surface">
        <p className="eyebrow">Per-person explanation</p><h2 id="people-heading">Why does each person owe or receive money?</h2>
        <p>Net balance = amount paid − fair share. A positive balance receives money, a negative balance owes money, and a zero balance is settled.</p>
        <div className="participant-balance-grid">
          {participantViews.map((participant) => (
            <article className={`participant-balance-card balance-${participant.status}`} key={participant.participantId}>
              <div className="participant-card-heading"><h3>{participant.name}</h3><span>{participant.status === 'receives' ? '↑ Receives' : participant.status === 'owes' ? '↓ Owes' : '✓ Settled'}</span></div>
              <dl><div><dt>Paid</dt><dd>{formatCurrency(participant.paid)}</dd></div><div><dt>Fair share</dt><dd>{formatCurrency(participant.fairShare)}</dd></div><div><dt>Net balance</dt><dd>{participant.net > 0 ? '+' : ''}{formatCurrency(participant.net)}</dd></div></dl>
              <p>{participant.explanation}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="optimization-heading" className="settlement-section settlement-surface">
        <p className="eyebrow">Before versus after</p><h2 id="optimization-heading">What did Dutchie optimize?</h2>
        <div className="optimization-count" aria-label={`${optimization.rawTransferCount} transfers before, ${optimization.optimizedTransferCount} transfers after`}>
          <strong>{optimization.rawTransferCount} transfers</strong><span aria-hidden="true">→</span><strong>{optimization.optimizedTransferCount} transfers</strong>
        </div>
        <p><strong>{optimization.removedTransferCount} {optimization.removedTransferCount === 1 ? 'transfer' : 'transfers'} removed.</strong> Dutchie does not change what each person owes. It only simplifies who pays whom.</p>
        <div className="optimization-grid">
          <article><h3>Before optimization</h3><p>{optimization.rawTransferCount} direct reimbursement relationships from individual payments.</p><TransferCards transfers={rawTransferViews} compact /></article>
          <article><h3>After Dutchie</h3><p>{optimization.optimizedTransferCount} final balance-based relationships.</p><TransferCards transfers={optimizedTransferViews} compact /></article>
        </div>
      </section>

      <section aria-labelledby="method-heading" className="settlement-section settlement-surface calculation-method">
        <p className="eyebrow">Calculation method</p><h2 id="method-heading">How was everything calculated?</h2>
        <ol><li><strong>Add what each person paid.</strong><span>Receipt and manual-item payers provide the paid totals.</span></li><li><strong>Calculate each fair share.</strong><span>Manual items are shared equally; receipt items use the selected participants.</span></li><li><strong>Compare paid amount and fair share.</strong><span>Amount paid − Fair share = Net balance.</span></li><li><strong>Create the required balances.</strong><span>Positive receives, negative owes, and zero is settled.</span></li><li><strong>Simplify transfer paths.</strong><span>The existing settlement routine changes the path, not each person’s final balance.</span></li></ol>
      </section>

      <details className="settlement-details">
        <summary>View detailed calculation</summary>
        <div className="details-content">
          <h2>Payment breakdown and matrices</h2>
          <p>These tables preserve the original calculation data for inspection. Dollar values are rounded exactly as in the current screen.</p>
          <details><summary>View payer-based breakdown</summary><div className="event-list">{events.map((event) => <article className="matrix-block" key={event.eventId}><h3>{event.payerId ? `${nameOf(event.payerId)} paid` : 'Payer not selected'} — {event.label}</h3><p>Total: {formatCurrency(event.total)}. Manual items use equal shares; receipt items use selected participants.</p><div className="responsive-scroll"><table className="settlement-matrix"><caption>{event.label} responsibility by participant</caption><thead><tr><th scope="col">Participant</th><th scope="col">Responsible amount</th></tr></thead><tbody>{peopleIds.map((id) => <tr key={id}><th scope="row">{nameOf(id)}</th><td>{formatCurrency(event.sharesByPerson[id] ?? 0)}</td></tr>)}</tbody></table></div></article>)}</div></details>
          {renderMatrix(rawMatrix, 'Raw transfer matrix', 'This follows each payment directly back to its payer before balances are combined.')}
          {renderMatrix(settlement.matrix, 'Optimized transfer matrix', 'This shows the existing final settlement transfers after balances are combined.')}
          <details><summary>Technical notes and checks</summary><p>The optimized view uses the existing debtor-to-creditor settlement routine and its current cent rounding. It does not claim a globally minimal solution.</p><ul><li>Participant balance sum: {formatCurrency(Object.values(settlement.balance).reduce((sum, value) => sum + value, 0))}</li><li>Raw transfer total: {formatCurrency(optimization.rawTotal)}</li><li>Optimized transfer total: {formatCurrency(optimization.optimizedTotal)}</li><li>Consistency status: {consistency.balanced ? 'Passed' : 'Needs review'}</li></ul></details>
        </div>
      </details>
    </main>
  );
}
