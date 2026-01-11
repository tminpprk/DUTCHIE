'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useStore } from '../store';

export default function SplitPage() {
  const { people, items, setItems } = useStore();

  const receiptItems = useMemo(() => items.filter((x) => x.source === 'receipt'), [items]);
  const manualItems = useMemo(() => items.filter((x) => x.source === 'manual'), [items]);

  const unnamedCount = useMemo(
    () => people.filter((p) => !p.name || !p.name.trim()).length,
    [people]
  );

  // ✅ receipt 아이템에 대해 "누가 낼지" 토글
  const toggleAssignee = (itemId: string, personId: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        if (it.source !== 'receipt') return it;

        const current = it.assignedIds ?? [];
        const next = current.includes(personId)
          ? current.filter((x) => x !== personId)
          : [...current, personId];

        return { ...it, assignedIds: next };
      })
    );
  };
  // ✅ 이 receipt item에 대해 모두 선택
const selectAllForItem = (itemId: string) => {
  setItems((prev) =>
    prev.map((it) => {
      if (it.id !== itemId) return it;
      if (it.source !== 'receipt') return it;
      return { ...it, assignedIds: people.map((p) => p.id) };
    })
  );
};

// ✅ 이 receipt item에 대해 모두 해제
const clearAllForItem = (itemId: string) => {
  setItems((prev) =>
    prev.map((it) => {
      if (it.id !== itemId) return it;
      if (it.source !== 'receipt') return it;
      return { ...it, assignedIds: [] };
    })
  );
};


  // receipt 아이템별 선택 요약
  const receiptSelectionSummary = useMemo(() => {
    let missing = 0;
    for (const it of receiptItems) {
      const count = (it.assignedIds ?? []).length;
      if (count === 0) missing++;
    }
    return { missing, total: receiptItems.length };
  }, [receiptItems]);

  return (
    <main style={{ minHeight: '100vh', padding: 24, fontFamily: 'system-ui', position: 'relative' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>
        who&apos;s paying for...
      </h1>

      {/* 안내/경고 */}
      {people.length === 0 ? (
        <p style={{ opacity: 0.75 }}>
          No people found. Go back and add people first.
        </p>
      ) : unnamedCount > 0 ? (
        <p style={{ opacity: 0.75 }}>
          ⚠️ {unnamedCount} person(s) have no name. You can still proceed, but it may be confusing.
        </p>
      ) : (
        <p style={{ opacity: 0.7 }}>
          Select who should pay for each <b>receipt-scanned</b> item. Manual items will be split equally.
        </p>
      )}

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginTop: 14 }}>
        {/* ================= LEFT: receipt items ================= */}
        <section style={{ flex: 1, maxWidth: 760 }}>
          <div
            style={{
              borderRadius: 14,
              border: '1px solid rgba(0,0,0,0.15)',
              background: 'rgba(0,0,0,0.04)',
              padding: 16,
              color: '#000',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#ffffffff', }}>
                Receipt items ({receiptItems.length})
              </h2>
              <div style={{ fontSize: 13, opacity: 0.75, color: '#ffffffff', }}>
                Missing selection: {receiptSelectionSummary.missing}/{receiptSelectionSummary.total}
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
              {receiptItems.length === 0 ? (
                <p style={{ opacity: 0.7, margin: 0,color: '#ffffffff', }}>
                  No receipt items found. You can go back and “Extract items” on the add_item page.
                </p>
              ) : (
                receiptItems.map((it) => (
                  <div
                    key={it.id}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.75)',
                      border: '1px solid rgba(0,0,0,0.10)',
                    }}
                  >
                    {/* item row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontWeight: 800 }}>
                        {it.name}{' '}
                        <span style={{ opacity: 0.75, fontWeight: 700 }}>
                          ${it.price.toFixed(2)}
                        </span>
                      </div>

                      <div style={{ fontSize: 13, opacity: 0.75 }}>
                        Selected: {(it.assignedIds ?? []).length}
                      </div>
                    </div>
                    {/* ✅ quick actions */}
<div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
  <button
    onClick={() => selectAllForItem(it.id)}
    style={{
      padding: '8px 10px',
      borderRadius: 999,
      border: '1px solid rgba(0,0,0,0.20)',
      background: '#fff',
      color: '#000',
      cursor: 'pointer',
      fontWeight: 800,
      fontSize: 13,
    }}
  >
    Select all
  </button>

  <button
    onClick={() => clearAllForItem(it.id)}
    style={{
      padding: '8px 10px',
      borderRadius: 999,
      border: '1px solid rgba(0,0,0,0.20)',
      background: '#fff',
      color: '#000',
      cursor: 'pointer',
      fontWeight: 800,
      fontSize: 13,
      opacity: 0.85,
    }}
  >
    Clear
  </button>
</div>


                    {/* people buttons */}
                    <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {people.map((p) => {
                        const selected = (it.assignedIds ?? []).includes(p.id);
                        return (
                          <button
                            key={p.id}
                            onClick={() => toggleAssignee(it.id, p.id)}
                            style={{
                              padding: '10px 12px',
                              borderRadius: 999,
                              border: '1px solid rgba(0,0,0,0.20)',
                              background: selected ? 'rgba(0,0,0,0.10)' : '#fff',
                              color: '#000',
                              cursor: 'pointer',
                              fontWeight: 800,
                            }}
                          >
                            {p.name?.trim() ? p.name : 'Unnamed'}
                          </button>
                        );
                      })}
                    </div>

                    {/* hint when none selected */}
                    {(it.assignedIds ?? []).length === 0 && (
                      <div style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>
                        Choose at least one person for this item.
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* ================= RIGHT: manual summary ================= */}
        <section style={{ width: 360 }}>
          <div
            style={{
              borderRadius: 14,
              border: '1px solid rgba(0,0,0,0.15)',
              background: 'rgba(0,0,0,0.04)',
              padding: 16,
              
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              Manual items (auto-split)
            </h2>

            <p style={{ marginTop: 8, marginBottom: 12, opacity: 0.75, fontSize: 13 }}>
              Manual items will be split equally across the group.
            </p>

            {manualItems.length === 0 ? (
              <p style={{ opacity: 0.7, margin: 0 }}>No manual items.</p>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {manualItems.map((it) => (
                  <div
                    key={it.id}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.75)',
                      border: '1px solid rgba(0,0,0,0.10)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <div style={{ fontWeight: 800, color: '#000', }}>{it.name}</div>
                    <div style={{ opacity: 0.75, fontWeight: 700 , color: '#000',}}>${it.price.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            )}

            {/* 작은 요약 */}
            <div style={{ marginTop: 12, fontSize: 13, opacity: 0.75, }}>
              People: {people.length} · Manual items: {manualItems.length} · Receipt items: {receiptItems.length}
            </div>
          </div>
        </section>
      </div>
            <Link href="/add_item">
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
      <Link href="/payment" aria-label="Next page">
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
    </main>
  );
}
