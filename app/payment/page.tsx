'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useStore } from '../store';

export default function PaymentPage() {
  const { people, items, setItems, receiptPaidBy, setReceiptPaidBy } = useStore();

  const manualItems = useMemo(() => items.filter((x: any) => x.source === 'manual'), [items]);
  const receiptItems = useMemo(() => items.filter((x: any) => x.source === 'receipt'), [items]);

  // receiptId별 합계 만들기 (r1, r2...)
  const receiptGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of receiptItems) {
      const rid = (it.receiptId as string) || 'r1';
      map.set(rid, (map.get(rid) ?? 0) + Number(it.price));
    }
    // 정렬: r1, r2, r10...
    const arr = Array.from(map.entries())
      .map(([receiptId, total]) => ({ receiptId, total }))
      .sort((a, b) => a.receiptId.localeCompare(b.receiptId, undefined, { numeric: true }));
    return arr;
  }, [receiptItems]);

  const manualSum = useMemo(() => manualItems.reduce((s: number, it: any) => s + Number(it.price), 0), [manualItems]);
  const receiptSum = useMemo(() => receiptGroups.reduce((s, g) => s + g.total, 0), [receiptGroups]);
  const allSum = manualSum + receiptSum;

  // manual item payer 선택
  const setManualPaidBy = (itemId: string, personId: string) => {
    setItems((prev: any[]) => prev.map((it) => (it.id === itemId ? { ...it, paidById: personId } : it)));
  };

  // receipt 그룹 payer 선택
  const setReceiptPayer = (receiptId: string, personId: string) => {
    setReceiptPaidBy((prev: Record<string, string | undefined>) => ({ ...prev, [receiptId]: personId }));
  };

  // paid summary 계산
  const paidByPerson = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of people) map[p.id] = 0;

    // manual: item별
    for (const it of manualItems) {
      const payer = it.paidById;
      if (!payer) continue;
      if (map[payer] === undefined) continue;
      map[payer] += Number(it.price);
    }

    // receipt: receiptId별
    for (const g of receiptGroups) {
      const payer = receiptPaidBy[g.receiptId];
      if (!payer) continue;
      if (map[payer] === undefined) continue;
      map[payer] += g.total;
    }

    // cents 정리
    for (const id of Object.keys(map)) {
      map[id] = Math.round(map[id] * 100) / 100;
    }

    return map;
  }, [people, manualItems, receiptGroups, receiptPaidBy]);

  const paidTotal = useMemo(() => Object.values(paidByPerson).reduce((s, v) => s + v, 0), [paidByPerson]);

  const missingManual = useMemo(() => manualItems.filter((it: any) => !it.paidById).length, [manualItems]);
  const missingReceipt = useMemo(() => {
    let cnt = 0;
    for (const g of receiptGroups) {
      if (!receiptPaidBy[g.receiptId]) cnt++;
    }
    return cnt;
  }, [receiptGroups, receiptPaidBy]);

  const clearSelections = () => {
    // manual paidById 초기화
    setItems((prev: any[]) => prev.map((it) => (it.source === 'manual' ? { ...it, paidById: undefined } : it)));
    // receiptPaidBy 초기화
    setReceiptPaidBy({});
  };

  const setAllReceiptsPaidBy = (personId: string) => {
    setReceiptPaidBy((prev: Record<string, string | undefined>) => {
      const next: Record<string, string | undefined> = { ...prev };
      for (const g of receiptGroups) next[g.receiptId] = personId;
      return next;
    });
  };

  return (
    <main style={{ minHeight: '100vh', padding: 24, fontFamily: 'system-ui', color: '#fff' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>
        who paid for...
      </h1>

      <p style={{ opacity: 0.85, marginBottom: 14 }}>
        Manual items: choose payer per item.<br />
        Receipts: grouped as Receipt #1, #2... choose one payer per receipt.
      </p>

      {/* Summary card */}
      <div
        style={{
          maxWidth: 980,
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.25)',
          background: 'rgba(255,255,255,0.10)',
          padding: 16,
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 900 }}>
            Manual: ${manualSum.toFixed(2)} · Receipts: ${receiptSum.toFixed(2)} · Total: ${allSum.toFixed(2)}
          </div>
          <div style={{ fontWeight: 900, opacity: 0.9 }}>
            Selected paid: ${paidTotal.toFixed(2)}
          </div>
        </div>

        {(missingManual > 0 || missingReceipt > 0) && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 12,
              background: 'rgba(255, 180, 0, 0.25)',
              color: '#000',
              fontWeight: 900,
            }}
          >
            ⚠️ Missing selections — Manual: {missingManual} · Receipts: {missingReceipt}
          </div>
        )}

        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={clearSelections}
            style={{
              padding: '10px 12px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.35)',
              background: 'transparent',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 900,
              opacity: 0.9,
            }}
          >
            Clear selections
          </button>

          {/* 편의: receipts 전부 한 사람이 냈다고 */}
          {people.map((p: any) => (
            <button
              key={p.id}
              onClick={() => setAllReceiptsPaidBy(p.id)}
              style={{
                padding: '10px 12px',
                borderRadius: 999,
                border: '1px solid rgba(196, 196, 196, 0.35)',
                background: 'transparent',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 900,
                opacity: 0.9,
              }}
            >
              {p.name?.trim() ? p.name : 'Unnamed'} paid all receipts
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* LEFT */}
        <section style={{ flex: 1, maxWidth: 900 }}>
          {/* Receipts */}
          <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
            {receiptGroups.length === 0 ? (
              <div style={{ opacity: 0.85 }}>No receipts found.</div>
            ) : (
              receiptGroups.map((g, idx) => (
                <div
                  key={g.receiptId}
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    background: '#ffffffbc',
                    
                    color: '#000',
                    border: '1px solid rgba(0,0,0,0.12)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                    <div style={{ fontWeight: 900 }}>
                      Receipt #{idx + 1}{' '}
                      <span style={{ opacity: 0.75, fontWeight: 800 }}>
                        ${g.total.toFixed(2)}
                      </span>
                      <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.6 }}>
                        ({g.receiptId})
                      </span>
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.7 }}>
                      {receiptPaidBy[g.receiptId] ? 'Selected' : 'Not selected'}
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {people.map((p: any) => {
                      const selected = receiptPaidBy[g.receiptId] === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setReceiptPayer(g.receiptId, p.id)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 999,
                            border: '1px solid rgba(0,0,0,0.25)',
                            background: selected ? 'rgba(0,0,0,0.12)' : '#fff',
                            color: '#000',
                            cursor: 'pointer',
                            fontWeight: 900,
                          }}
                        >
                          {p.name?.trim() ? p.name : 'Unnamed'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Manual items */}
          <div style={{ display: 'grid', gap: 12 }}>
            {manualItems.length === 0 ? (
              <div style={{ opacity: 0.85 }}>No manual items.</div>
            ) : (
              manualItems.map((it: any) => (
                <div
                  key={it.id}
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    background: '#ffffffbc',
                    color: '#000',
                    border: '1px solid rgba(0,0,0,0.12)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                    <div style={{ fontWeight: 900 }}>
                      {it.name}{' '}
                      <span style={{ opacity: 0.75, fontWeight: 800 }}>
                        ${Number(it.price).toFixed(2)}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.7 }}>
                      {it.paidById ? 'Selected' : 'Not selected'}
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {people.map((p: any) => {
                      const selected = it.paidById === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setManualPaidBy(it.id, p.id)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 999,
                            border: '1px solid rgba(0,0,0,0.25)',
                            background: selected ? 'rgba(0,0,0,0.12)' : '#fff',
                            color: '#000',
                            cursor: 'pointer',
                            fontWeight: 900,
                          }}
                        >
                          {p.name?.trim() ? p.name : 'Unnamed'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* RIGHT: paid summary */}
        <section style={{ width: 360 }}>
          <div
            style={{
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.10)',
              padding: 16,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>
              Paid summary
            </h2>

            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {people.map((p: any) => (
                <div
                  key={p.id}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: '#ffffffb0',
                    color: '#000',
                    border: '1px solid rgba(0,0,0,0.12)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ fontWeight: 900 }}>
                    {p.name?.trim() ? p.name : 'Unnamed'}
                  </div>
                  <div style={{ fontWeight: 900 }}>
                    ${(paidByPerson[p.id] ?? 0).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, fontSize: 13, opacity: 0.9 }}>
              Selected paid sum: ${paidTotal.toFixed(2)} <br />
              Total (manual + receipts): ${allSum.toFixed(2)}
            </div>
          </div>
        </section>
      </div>

      {/* Navigation */}
      <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/split">
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
            Back
          </button>
        </Link>

      {/* 다음 페이지 화살표 (일단 /result로) */}
      <Link href="/result" aria-label="Next page">
        <button
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            width: 56,
            height: 56,
            borderRadius: 999,
            color: '#000000dd',
            border: '1px solid rgba(0,0,0,0.25)',
            background: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 18px rgba(0,0,0,0.10)',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M9 18l6-6-6-6"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </Link>
      </div>
    </main>
  );
}
