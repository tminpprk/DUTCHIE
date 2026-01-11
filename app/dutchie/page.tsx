'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useStore } from '../store';

type Transfer = { fromId: string; toId: string; amount: number };

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// greedy settlement: debtors -> creditors
function computeTransfers(balance: Record<string, number>): Transfer[] {
  const creditors: { id: string; amt: number }[] = [];
  const debtors: { id: string; amt: number }[] = [];

  for (const [id, bal] of Object.entries(balance)) {
    const v = round2(bal);
    if (v > 0.009) creditors.push({ id, amt: v });
    else if (v < -0.009) debtors.push({ id, amt: -v }); // store positive debt
  }

  // sort biggest first (optional but usually yields fewer lines visually)
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];

    const amt = Math.min(d.amt, c.amt);
    const rounded = round2(amt);

    if (rounded > 0) transfers.push({ fromId: d.id, toId: c.id, amount: rounded });

    d.amt = round2(d.amt - amt);
    c.amt = round2(c.amt - amt);

    if (d.amt <= 0.009) i++;
    if (c.amt <= 0.009) j++;
  }

  return transfers;
}

export default function DutchiePage() {
  const { people, items, receiptPaidBy } = useStore();

  const nameOf = (id: string) => {
    const p = people.find((x) => x.id === id);
    return p?.name?.trim() ? p.name.trim() : 'Unnamed';
  };

  const manualItems = useMemo(() => items.filter((x: any) => x.source === 'manual'), [items]);
  const receiptItems = useMemo(() => items.filter((x: any) => x.source === 'receipt'), [items]);

  // receipt groups total by receiptId (r1,r2...)
  const receiptGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of receiptItems as any[]) {
      const rid = (it.receiptId as string) || 'r1';
      map.set(rid, (map.get(rid) ?? 0) + Number(it.price));
    }
    return Array.from(map.entries())
      .map(([receiptId, total]) => ({ receiptId, total: round2(total) }))
      .sort((a, b) => a.receiptId.localeCompare(b.receiptId, undefined, { numeric: true }));
  }, [receiptItems]);

  const stats = useMemo(() => {
    // owed: 공평 부담액
    const owed: Record<string, number> = {};
    for (const p of people) owed[p.id] = 0;

    // paid: 실제 결제액 (manual item payer + receipt group payer)
    const paid: Record<string, number> = {};
    for (const p of people) paid[p.id] = 0;

    // warnings counters
    let missingAssignees = 0; // receipt item assignedIds empty
    let missingManualPayer = 0;
    let missingReceiptPayer = 0;

    const peopleCount = people.length;

    // 1) Owed from manual: split equally across all people
    if (peopleCount > 0) {
      for (const it of manualItems as any[]) {
        const share = Number(it.price) / peopleCount;
        for (const p of people) owed[p.id] += share;
      }
    }

    // 2) Owed from receipt: split among assignedIds
    for (const it of receiptItems as any[]) {
      const ids: string[] = it.assignedIds ?? [];
      if (!ids.length) {
        missingAssignees++;
        continue; // ignore from owed if nobody selected (or you can decide to split equally later)
      }
      const share = Number(it.price) / ids.length;
      for (const id of ids) {
        if (owed[id] !== undefined) owed[id] += share;
      }
    }

    // 3) Paid from manual: item paidById
    for (const it of manualItems as any[]) {
      const payer = it.paidById;
      if (!payer) {
        missingManualPayer++;
        continue;
      }
      if (paid[payer] !== undefined) paid[payer] += Number(it.price);
    }

    // 4) Paid from receipts: payer per receiptId (receiptPaidBy map)
    const rp = (receiptPaidBy ?? {}) as Record<string, string | undefined>;
    for (const g of receiptGroups) {
      const payer = rp[g.receiptId];
      if (!payer) {
        missingReceiptPayer++;
        continue;
      }
      if (paid[payer] !== undefined) paid[payer] += g.total;
    }

    // rounding
    for (const id of Object.keys(owed)) owed[id] = round2(owed[id]);
    for (const id of Object.keys(paid)) paid[id] = round2(paid[id]);

    // balance = paid - owed
    const balance: Record<string, number> = {};
    for (const id of Object.keys(owed)) {
      balance[id] = round2((paid[id] ?? 0) - (owed[id] ?? 0));
    }

    const transfers = computeTransfers(balance);

    const owedTotal = round2(Object.values(owed).reduce((s, v) => s + v, 0));
    const paidTotal = round2(Object.values(paid).reduce((s, v) => s + v, 0));

    return {
      owed,
      paid,
      balance,
      transfers,
      owedTotal,
      paidTotal,
      missingAssignees,
      missingManualPayer,
      missingReceiptPayer,
    };
  }, [people, manualItems, receiptItems, receiptGroups, receiptPaidBy]);

  // build matrix for display (optional but nice)
  const matrix = useMemo(() => {
    const idx: Record<string, number> = {};
    people.forEach((p, i) => (idx[p.id] = i));
    const n = people.length;
    const m = Array.from({ length: n }, () => Array(n).fill(0) as number[]);
    for (const t of stats.transfers) {
      const r = idx[t.fromId];
      const c = idx[t.toId];
      if (r !== undefined && c !== undefined) m[r][c] = round2(m[r][c] + t.amount);
    }
    return m;
  }, [people, stats.transfers]);

  return (
    <main style={{ minHeight: '100vh', padding: 24, fontFamily: 'system-ui', color: '#fff' }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>DUTCHIE!</h1>
      <p style={{ marginTop: 8, opacity: 0.85 }}>
        Optimized settlement — who sends money to whom.
      </p>

      {(stats.missingAssignees > 0 || stats.missingManualPayer > 0 || stats.missingReceiptPayer > 0) && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 14,
            background: 'rgba(255, 180, 0, 0.25)',
            color: '#000',
            fontWeight: 800,
            maxWidth: 980,
          }}
        >
          ⚠️ Missing selections:
          {' '}
          Receipt item assignees: {stats.missingAssignees}
          {' · '}
          Manual item payer: {stats.missingManualPayer}
          {' · '}
          Receipt payer: {stats.missingReceiptPayer}
        </div>
      )}

      {/* Summary */}
      <div
        style={{
          marginTop: 14,
          maxWidth: 980,
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.25)',
          background: 'rgba(255,255,255,0.10)',
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontWeight: 900 }}>Owed total: ${stats.owedTotal.toFixed(2)}</div>
          <div style={{ fontWeight: 900, opacity: 0.9 }}>Paid total: ${stats.paidTotal.toFixed(2)}</div>
          <div style={{ fontWeight: 900, opacity: 0.9 }}>Transfers: {stats.transfers.length}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginTop: 14, flexWrap: 'wrap' }}>
        {/* Transfers list */}
        <section style={{ flex: 1, minWidth: 360, maxWidth: 720 }}>
          <div
            style={{
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.10)',
              padding: 16,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Who sends money</h2>

            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {stats.transfers.length === 0 ? (
                <div style={{ opacity: 0.85 }}>No transfers needed (already settled).</div>
              ) : (
                stats.transfers.map((t, i) => (
                  <div
                    key={i}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: '#ffffffaa',
                      color: '#000',
                      border: '1px solid rgba(0,0,0,0.12)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>
                      {nameOf(t.fromId)} → {nameOf(t.toId)}
                    </div>
                    <div style={{ fontWeight: 900 }}>${t.amount.toFixed(2)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Matrix table */}
        <section style={{ flex: 1, minWidth: 360, maxWidth: 980 }}>
          <div
            style={{
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.10)',
              padding: 16,
              overflowX: 'auto',
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Transfer matrix</h2>
            <p style={{ marginTop: 6, marginBottom: 12, opacity: 0.8, fontSize: 13, }}>
              Rows send → Columns receive
            </p>

            <table style={{ borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={{ padding: 8, textAlign: 'left', opacity: 0.85 }}>From \ To</th>
                  {people.map((p) => (
                    <th key={p.id} style={{ padding: 8, textAlign: 'left', opacity: 0.85 }}>
                      {nameOf(p.id)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((rowP, r) => (
                  <tr key={rowP.id}>
                    <td style={{ padding: 8, fontWeight: 900, opacity: 0.9 }}>{nameOf(rowP.id)}</td>
                    {people.map((colP, c) => {
                      const v = matrix[r]?.[c] ?? 0;
                      return (
                        <td key={colP.id} style={{ padding: 8, color: '#ffffffff', opacity: v ? 1 : 0.35 }}>
                          {v ? `$${v.toFixed(2)}` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Nav */}
      <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/">
          <button
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.35)',
              background: 'transparent',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 900,
            }}
          >
            Back to home
          </button>
        </Link>

        <Link href="/result">
          <button
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.35)',
              background: 'transparent',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 900,
            }}
          >
            Back to overview
          </button>
        </Link>

        <Link href="/hdiw">
          <button
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.35)',
              background: '#fff',
              color: '#000',
              cursor: 'pointer',
              fontWeight: 900,
            }}
          >
            How did it work?
          </button>
        </Link>
      </div>
    </main>
  );
}
