'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useStore } from '../store';

export default function ResultPage() {
  const { people, items } = useStore();

  const manualItems = useMemo(() => items.filter((x) => x.source === 'manual'), [items]);
  const receiptItems = useMemo(() => items.filter((x) => x.source === 'receipt'), [items]);

  const {
    owed,
    manualTotal,
    receiptTotal,
    grandTotal,
    unassignedReceiptCount,
  } = useMemo(() => {
    const owedMap: Record<string, number> = {};
    for (const p of people) owedMap[p.id] = 0;

    // totals
    const mTotal = manualItems.reduce((s, it) => s + it.price, 0);
    const rTotal = receiptItems.reduce((s, it) => s + it.price, 0);

    // 1) manual: 전체 인원에게 균등 분배
    if (people.length > 0) {
      for (const it of manualItems) {
        const share = it.price / people.length;
        for (const p of people) owedMap[p.id] += share;
      }
    }

    // 2) receipt: assignedIds에 선택된 사람들끼리 균등 분배
    let missing = 0;
    for (const it of receiptItems) {
      const ids = it.assignedIds ?? [];
      if (ids.length === 0) {
        missing++;
        continue; // 선택 없으면 계산 제외(경고 표시)
      }
      const share = it.price / ids.length;
      for (const id of ids) {
        if (owedMap[id] !== undefined) owedMap[id] += share;
      }
    }

    return {
      owed: owedMap,
      manualTotal: mTotal,
      receiptTotal: rTotal,
      grandTotal: mTotal + rTotal,
      unassignedReceiptCount: missing,
    };
  }, [people, manualItems, receiptItems]);

  return (
    <main style={{ minHeight: '100vh', padding: 24, fontFamily: 'system-ui', position: 'relative' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10, color: '#ffffffff' }}>
        overview
      </h1>

      {people.length === 0 ? (
        <p style={{ opacity: 0.75, color: '#000' }}>
          No people found. Please add people first.
        </p>
      ) : (
        <p style={{ opacity: 0.75, color: '#ffffffff' }}>
          Manual items are split equally across the group. Receipt items are split by your selections.
        </p>
      )}

      {unassignedReceiptCount > 0 && (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            borderRadius: 12,
            border: '1px solid rgba(0,0,0,0.15)',
            background: 'rgba(255, 200, 0, 0.15)',
            color: '#ffffffff',
            maxWidth: 760,
          }}
        >
          ⚠️ {unassignedReceiptCount} receipt item(s) have no selected payer(s). They are excluded from the calculation.
        </div>
      )}

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginTop: 14 }}>
        {/* LEFT: per-person totals */}
        <section style={{ flex: 1, maxWidth: 760 }}>
          <div
            style={{
              borderRadius: 14,
              border: '1px solid rgba(0,0,0,0.15)',
              background: 'rgba(0,0,0,0.04)',
              padding: 16,
              color: '#ffffffff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                Each person pays
              </h2>
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                Total: ${grandTotal.toFixed(2)}
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {people.map((p) => (
                <div
                  key={p.id}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.75)',
                    border: '1px solid rgba(0,0,0,0.10)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    color: '#000000ff',
                  }}
                >
                  <div style={{ fontWeight: 800 }}>
                    {p.name?.trim() ? p.name : 'Unnamed'}
                  </div>
                  <div style={{ fontWeight: 900 }}>
                    ${((owed[p.id] ?? 0)).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* RIGHT: breakdown */}
        <section style={{ width: 360 }}>
          <div
            style={{
              borderRadius: 14,
              border: '1px solid rgba(0,0,0,0.15)',
              background: 'rgba(0,0,0,0.04)',
              padding: 16,
              color: '#ffffffff',
              
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              Breakdown
            </h2>

            <div style={{ marginTop: 10, fontSize: 14, opacity: 0.85 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>People</span>
                <span style={{ fontWeight: 800 }}>{people.length}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>Manual items</span>
                <span style={{ fontWeight: 800 }}>{manualItems.length}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>Receipt items</span>
                <span style={{ fontWeight: 800 }}>{receiptItems.length}</span>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,0.12)', margin: '12px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>Manual total</span>
                <span style={{ fontWeight: 900 }}>${manualTotal.toFixed(2)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>Receipt total</span>
                <span style={{ fontWeight: 900 }}>${receiptTotal.toFixed(2)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                <span style={{ fontWeight: 900 }}>Grand total</span>
                <span style={{ fontWeight: 900 }}>${grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href="/split">
                <button
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(0,0,0,0.25)',
                    background: '#fff',
                    color: '#000',
                    cursor: 'pointer',
                    fontWeight: 800,
                  }}
                >
                  Back to split
                </button>
              </Link>

              <Link href="/add_item">
                <button
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(0,0,0,0.25)',
                    background: '#fff',
                    color: '#000',
                    cursor: 'pointer',
                    fontWeight: 800,
                  }}
                >
                  Edit items
                </button>
              </Link>
            </div>
          </div>
        </section>
      </div>


      <Link href="/dutchie">
  <button
    style={{
  position: 'fixed',
  right: 30,
  bottom: 30,
  width: 100,
  height: 56,
  borderRadius: 12,
  border: '1px solid rgba(0,0,0,0.25)',
  background: '#fff',
  color: '#000',
  cursor: 'pointer',
  fontWeight: 800,

  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}}
  >
    DUTCHIE!
  </button>
</Link>

    </main>
  );
}
