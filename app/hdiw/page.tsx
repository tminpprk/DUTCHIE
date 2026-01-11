'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useStore } from '../store';

type Transfer = { fromId: string; toId: string; amount: number };

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function computeTransfersFromBalance(balance: Record<string, number>): Transfer[] {
  const creditors: { id: string; amt: number }[] = [];
  const debtors: { id: string; amt: number }[] = [];

  for (const [id, bal] of Object.entries(balance)) {
    const v = round2(bal);
    if (v > 0.009) creditors.push({ id, amt: v });
    else if (v < -0.009) debtors.push({ id, amt: -v });
  }

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

export default function HowItWorksPage() {
  const { people, items, receiptPaidBy } = useStore();

  const nameOf = (id: string) => {
    const p = people.find((x: any) => x.id === id);
    return p?.name?.trim() ? p.name.trim() : 'Unnamed';
  };

  const manualItems = useMemo(() => items.filter((x: any) => x.source === 'manual'), [items]);
  const receiptItems = useMemo(() => items.filter((x: any) => x.source === 'receipt'), [items]);

  // receiptId별 item 묶기
  const receiptGroups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const it of receiptItems as any[]) {
      const rid = (it.receiptId as string) || 'r1';
      const arr = map.get(rid) ?? [];
      arr.push(it);
      map.set(rid, arr);
    }
    return Array.from(map.entries())
      .map(([receiptId, groupItems]) => ({ receiptId, items: groupItems }))
      .sort((a, b) => a.receiptId.localeCompare(b.receiptId, undefined, { numeric: true }));
  }, [receiptItems]);

  /**
   * 1) "payer 기준 차트(왼쪽)"를 만들기 위한 payment events 생성
   * - receipt: receiptId 하나가 하나의 payment(카드결제 1번)
   * - manual: 각 manual item이 하나의 payment(그 item을 누가 결제했는지)
   *
   * 각 event는:
   * - label: "Receipt #1 (r1)" or "Pizza"
   * - payerId: 실제 결제자
   * - sharesByPerson: 이 event에서 각 사람이 부담한 금액(= payer에게 보내야 하는 근거)
   */
  const events = useMemo(() => {
    const evs: {
      eventId: string;
      label: string;
      payerId?: string;
      total: number;
      sharesByPerson: Record<string, number>;
      kind: 'receipt' | 'manual';
    }[] = [];

    // Receipt events (receiptId별)
    for (let idx = 0; idx < receiptGroups.length; idx++) {
      const g = receiptGroups[idx];
      const payerId = (receiptPaidBy ?? {})[g.receiptId];
      const shares: Record<string, number> = {};
      for (const p of people) shares[p.id] = 0;

      let groupTotal = 0;
      for (const it of g.items as any[]) {
        const price = Number(it.price) || 0;
        groupTotal += price;

        const ids: string[] = it.assignedIds ?? [];
        if (!ids.length) continue;

        const share = price / ids.length;
        for (const id of ids) {
          if (shares[id] !== undefined) shares[id] += share;
        }
      }

      // rounding
      for (const id of Object.keys(shares)) shares[id] = round2(shares[id]);

      evs.push({
        eventId: `receipt:${g.receiptId}`,
        label: `Receipt #${idx + 1} (${g.receiptId})`,
        payerId,
        total: round2(groupTotal),
        sharesByPerson: shares,
        kind: 'receipt',
      });
    }

    // Manual events (item별)
    const n = people.length;
    for (const it of manualItems as any[]) {
      const payerId = it.paidById as string | undefined;
      const price = Number(it.price) || 0;
      const shares: Record<string, number> = {};
      for (const p of people) shares[p.id] = 0;

      if (n > 0) {
        const share = price / n;
        for (const p of people) shares[p.id] = round2(share);
      }

      evs.push({
        eventId: `manual:${it.id}`,
        label: `${it.name}`,
        payerId,
        total: round2(price),
        sharesByPerson: shares,
        kind: 'manual',
      });
    }

    return evs;
  }, [people, manualItems, receiptGroups, receiptPaidBy]);

  /**
   * 2) Unoptimized matrix:
   * 각 event마다 "payer에게 바로 보내기" 방식으로
   * from(person) -> to(payer) 로 shares를 그대로 누적
   */
  const unoptimizedMatrix = useMemo(() => {
    const idx: Record<string, number> = {};
    people.forEach((p: any, i: number) => (idx[p.id] = i));
    const n = people.length;
    const mat = Array.from({ length: n }, () => Array(n).fill(0) as number[]);

    for (const ev of events) {
      if (!ev.payerId) continue;
      const payer = ev.payerId;

      for (const p of people as any[]) {
        if (p.id === payer) continue; // 본인은 자신에게 보낼 필요 없음
        const amt = ev.sharesByPerson[p.id] ?? 0;
        if (amt > 0.009) {
          const r = idx[p.id];
          const c = idx[payer];
          mat[r][c] = round2(mat[r][c] + amt);
        }
      }
    }

    return mat;
  }, [people, events]);

  /**
   * 3) Optimized matrix:
   * - owed: 전체 공평 부담액(= result에서 했던 것)
   * - paid: 실제 결제액(= receipt payer가 receipt total, manual payer가 item price)
   * - balance = paid - owed -> 최적 송금
   */
  const optimizedMatrix = useMemo(() => {
    const owed: Record<string, number> = {};
    const paid: Record<string, number> = {};
    for (const p of people as any[]) {
      owed[p.id] = 0;
      paid[p.id] = 0;
    }

    // owed: manual = 균등분배
    const n = people.length;
    if (n > 0) {
      for (const it of manualItems as any[]) {
        const price = Number(it.price) || 0;
        const share = price / n;
        for (const p of people as any[]) owed[p.id] += share;
      }
    }

    // owed: receipt = assignedIds 기반
    for (const it of receiptItems as any[]) {
      const price = Number(it.price) || 0;
      const ids: string[] = it.assignedIds ?? [];
      if (!ids.length) continue;
      const share = price / ids.length;
      for (const id of ids) {
        if (owed[id] !== undefined) owed[id] += share;
      }
    }

    // paid: manual = paidById
    for (const it of manualItems as any[]) {
      const payer = it.paidById as string | undefined;
      if (!payer) continue;
      if (paid[payer] !== undefined) paid[payer] += Number(it.price) || 0;
    }

    // paid: receipt = receiptId별 total을 receiptPaidBy[payer]에게
    // receiptId별 total 계산
    const receiptTotals = new Map<string, number>();
    for (const it of receiptItems as any[]) {
      const rid = (it.receiptId as string) || 'r1';
      receiptTotals.set(rid, (receiptTotals.get(rid) ?? 0) + (Number(it.price) || 0));
    }

    for (const [rid, t] of receiptTotals.entries()) {
      const payer = (receiptPaidBy ?? {})[rid];
      if (!payer) continue;
      if (paid[payer] !== undefined) paid[payer] += t;
    }

    // rounding
    for (const id of Object.keys(owed)) owed[id] = round2(owed[id]);
    for (const id of Object.keys(paid)) paid[id] = round2(paid[id]);

    const balance: Record<string, number> = {};
    for (const id of Object.keys(owed)) balance[id] = round2((paid[id] ?? 0) - (owed[id] ?? 0));

    const transfers = computeTransfersFromBalance(balance);

    // matrix build
    const idx: Record<string, number> = {};
    people.forEach((p: any, i: number) => (idx[p.id] = i));
    const mat = Array.from({ length: people.length }, () => Array(people.length).fill(0) as number[]);

    for (const t of transfers) {
      const r = idx[t.fromId];
      const c = idx[t.toId];
      if (r !== undefined && c !== undefined) mat[r][c] = round2(mat[r][c] + t.amount);
    }
    return mat;
  }, [people, manualItems, receiptItems, receiptPaidBy]);

  const peopleIds = people.map((p: any) => p.id);

  const tableCell = (txt: string, bold = false, dim = false) => (
    <td
      style={{
        padding: 8,
        border: '1px solid rgba(0,0,0,0.12)',
        background: '#fff',
        color: '#000',
        fontWeight: bold ? 900 : 700,
        opacity: dim ? 0.55 : 1,
        textAlign: 'right',
        whiteSpace: 'nowrap',
      }}
    >
      {txt}
    </td>
  );

  const headerCell = (txt: string) => (
    <th
      style={{
        padding: 8,
        border: '1px solid rgba(0,0,0,0.12)',
        background: '#fff',
        color: '#000',
        fontWeight: 900,
        textAlign: 'left',
        whiteSpace: 'nowrap',
      }}
    >
      {txt}
    </th>
  );

  const renderMatrix = (mat: number[][], title: string) => (
    <div
      style={{
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.25)',
        background: 'rgba(255,255,255,0.10)',
        padding: 16,
        marginBottom: 14,
        overflowX: 'auto',
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8, color: '#fff' }}>{title}</div>
      <div style={{ fontSize: 13, opacity: 0.85, color: '#fff', marginBottom: 10 }}>
        Rows send → Columns receive
      </div>

      <table style={{ borderCollapse: 'collapse', minWidth: 520 }}>
        <thead>
          <tr>
            {headerCell('send/receive')}
            {peopleIds.map((id) => headerCell(nameOf(id)))}
          </tr>
        </thead>
        <tbody>
          {peopleIds.map((fromId, r) => (
            <tr key={fromId}>
              {headerCell(nameOf(fromId))}
              {peopleIds.map((toId, c) => {
                const v = mat[r]?.[c] ?? 0;
                return tableCell(v ? v.toFixed(2) : '0', false, !v);
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <main style={{ minHeight: '100vh', padding: 24, fontFamily: 'system-ui', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>How did it work?</h1>
          <p style={{ marginTop: 8, opacity: 0.85 }}>
            Left: payer-based breakdown (who should reimburse per payment). Right: matrices (raw vs optimized).
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/dutchie">
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
              Back to DUTCHIE
            </button>
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginTop: 14, flexWrap: 'wrap' }}>
        {/* LEFT: payer-based charts */}
        <section style={{ flex: 1, minWidth: 360, maxWidth: 520 }}>
          <div
            style={{
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.10)',
              padding: 16,
              marginBottom: 14,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>1) Payer breakdown</div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>
              For each payment (Receipt or Manual), this shows how much each person owes for that payment.
            </div>
          </div>

          {events.length === 0 ? (
            <div style={{ opacity: 0.85 }}>No events. Add items and selections first.</div>
          ) : (
            events.map((ev) => (
              <div
                key={ev.eventId}
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.25)',
                  background: 'rgba(255,255,255,0.10)',
                  padding: 16,
                  marginBottom: 14,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 900 }}>
                    {ev.payerId ? `${nameOf(ev.payerId)} payment` : '(payer not selected)'} — {ev.label}
                  </div>
                  <div style={{ fontWeight: 900, opacity: 0.9 }}>total: ${ev.total.toFixed(2)}</div>
                </div>

                <div style={{ marginTop: 10, overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', minWidth: 420 }}>
                    <thead>
                      <tr>
                        {headerCell('name')}
                        {headerCell('owe')}
                      </tr>
                    </thead>
                    <tbody>
                      {peopleIds.map((pid) => (
                        <tr key={pid}>
                          {headerCell(nameOf(pid))}
                          {tableCell((ev.sharesByPerson[pid] ?? 0).toFixed(2))}
                        </tr>
                      ))}
                      <tr>
                        {headerCell('total')}
                        {tableCell(
                          round2(Object.values(ev.sharesByPerson).reduce((s, v) => s + v, 0)).toFixed(2),
                          true
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                  * For manual items, “owe” is equal split. For receipt items, “owe” comes from your split selections.
                </div>
              </div>
            ))
          )}
        </section>

        {/* RIGHT: matrices */}
        <section style={{ flex: 1, minWidth: 360, maxWidth: 980 }}>
          {renderMatrix(unoptimizedMatrix, '2) Raw (not optimized) transfer matrix')}
          {renderMatrix(optimizedMatrix, '3) Optimized transfer matrix')}
        </section>
      </div>
    </main>
  );
}
