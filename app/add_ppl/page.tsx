'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useStore } from '../store';

// (L7) 간단 id 생성기
const uid = () => Math.random().toString(36).slice(2, 10);

export default function AddPeoplePage() {
  // ✅ (L12) 전역 store의 people을 사용 (페이지 넘어가도 유지됨)
  const { people, setPeople } = useStore();

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: 24,
        fontFamily: 'system-ui',
        position: 'relative',
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 14 }}>
        who are you paying with?
      </h1>

      {/* Add 버튼 */}
      <button
        onClick={() => {
          setPeople((prev) => [...prev, { id: uid(), name: '' }]);
        }}
        style={{
          padding: '10px 14px',
          borderRadius: 10,
          border: '1px solid #333',
          color: '#000000ff',
          background: '#fff',
          cursor: 'pointer',
          marginBottom: 16,
          fontWeight: 700,
        }}
      >
        Add
      </button>

      {/* 반투명 박스: layout으로 자연스럽게 확장 */}
      <motion.div
        layout
        transition={{ duration: 0.25, ease: 'easeOut' }}
        style={{
          width: '100%',
          maxWidth: 520,
          borderRadius: 14,
          color: '#000000dd',
          border: '1px solid rgba(0,0,0,0.15)',
          background: 'rgba(0,0,0,0.04)',
          overflow: 'hidden',
          padding: 16,
        }}
      >

        {people.length === 0 ? (
          <div style={{ opacity: 0.6, lineHeight: 1.5 }}>
            Add 버튼을 눌러서 항목을 추가해봐.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {people.map((m, idx) => (
              <motion.div
                layout
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 12px',
                  borderRadius: 12,
                  gap: 10,
                  background: 'rgba(255,255,255,0.75)',
                  border: '1px solid rgba(0,0,0,0.10)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                  <span style={{ fontWeight: 700, opacity: 0.7, minWidth: 22 }}>
                    {idx + 1}.
                  </span>

                  <input
                    value={m.name}
                    onChange={(e) => {
                      const nextName = e.target.value;
                      setPeople((prev) =>
                        prev.map((x) => (x.id === m.id ? { ...x, name: nextName } : x))
                      );
                    }}
                    placeholder="Enter name"
                    style={{
                      flex: 1,
                      padding: '10px 10px',
                      borderRadius: 10,
                      border: '1px solid rgba(0,0,0,0.18)',
                      background: 'rgba(255,255,255,0.95)',
                    }}
                  />
                </div>

                <button
                  onClick={() => setPeople((prev) => prev.filter((x) => x.id !== m.id))}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#b00',
                    cursor: 'pointer',
                    fontWeight: 650,
                  }}
                >
                  remove
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* 다음 페이지 화살표 */}
      <Link href="/add_item" aria-label="Next page">
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
