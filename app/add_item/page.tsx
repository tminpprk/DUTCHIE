'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useStore } from '../store';

const uid = () => Math.random().toString(36).slice(2, 10);

function normalizeText(t: string) {
  return t.replace(/\r/g, '').trim();
}

function parseReceiptTotal(text: string): number | null {
  const lines = normalizeText(text).split('\n').map(l => l.trim()).filter(Boolean);

  // TOTAL / AMOUNT DUE / BALANCE DUE 등 우선순위 키워드
  const totalRegexes = [
    /^(total|amount due|balance due)\b.*?(\d+\.\d{2})$/i,
    /^(total|amount due|balance due)\b.*?(\d+)\s*$/i, // 혹시 소수점이 OCR에 안 잡히는 경우
  ];

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].replace(/\s+/g, ' ');
    for (const re of totalRegexes) {
      const m = line.match(re);
      if (m) {
        const raw = m[m.length - 1];
        const num = Number(String(raw).replace(/[^\d.]/g, ''));
        if (Number.isFinite(num) && num > 0) return num;
      }
    }
  }

  // fallback: 마지막에 가장 큰 금액(대충)
  let best: number | null = null;
  const money = /(\d+\.\d{2})/g;
  for (const line of lines) {
    const ms = line.match(money);
    if (!ms) continue;
    for (const s of ms) {
      const n = Number(s);
      if (Number.isFinite(n) && n > 0) best = best === null ? n : Math.max(best, n);
    }
  }
  return best;
}

function isMoneyLine(line: string) {
  // 12.89  / 2.00- 형태만 인정
  return /^\d+\.\d{2}-?$/.test(line.trim());
}

function moneyFromLine(line: string) {
  const t = line.trim();
  const neg = t.endsWith('-');
  const num = Number(neg ? t.slice(0, -1) : t);
  if (!Number.isFinite(num)) return null;
  return neg ? -num : num;
}

function cleanDesc(desc: string) {
  let s = desc.replace(/\s+/g, ' ').trim();

  // 앞에 단독 E 제거
  s = s.replace(/^E\s*/i, '').trim();

  // "E 761486 ORG SPAGHTTI" 형태면 코드 제거
  s = s.replace(/^\d{4,}\s+/, '').trim();

  // 너무 길게 남는 경우(슬래시 포함 코드할인)는 그대로 두거나 원하는 라벨로 바꿔도 됨
  // 예: "0000371710 / 370586" -> "DISCOUNT 370586"
  if (/^\d{6,}\s*\/\s*\d{3,}$/.test(s)) {
    s = 'DISCOUNT ' + s.split('/').pop()!.trim();
  }

  return s;
}

// ✅ 핵심: 줄 단위로 읽어서 “설명 버퍼 + 가격 줄”을 매칭
function parseCostcoLikeReceipt(text: string) {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // 1) 파싱 구간: SELF-CHECKOUT 이후 ~ SUBTOTAL 전까지
  const startIdx = lines.findIndex((l) => /self-?checkout/i.test(l));
  const endIdx = lines.findIndex((l) => /^subtotal\b/i.test(l));
  const body = lines.slice(startIdx >= 0 ? startIdx + 1 : 0, endIdx >= 0 ? endIdx : lines.length);

  // 2) subtotal/tax/total 따로 추출
  const subtotal = (() => {
    const i = lines.findIndex((l) => /^subtotal\b/i.test(l));
    if (i === -1) return null;
    // 다음 줄이 금액인 경우가 많음
    const next = lines[i + 1] ?? '';
    if (isMoneyLine(next)) return moneyFromLine(next);
    // 같은 줄에 숫자가 붙어있는 경우 fallback
    const m = lines[i].match(/(\d+\.\d{2})/);
    return m ? Number(m[1]) : null;
  })();

  const tax = (() => {
    const i = lines.findIndex((l) => /^tax\b/i.test(l));
    if (i === -1) return null;
    const next = lines[i + 1] ?? '';
    if (isMoneyLine(next)) return moneyFromLine(next);
    const m = lines[i].match(/(\d+\.\d{2})/);
    return m ? Number(m[1]) : null;
  })();

  const total = (() => {
    // "**** TOTAL" 같은 줄을 찾고, 그 이후 등장하는 첫 money line을 total로
    const i = lines.findIndex((l) => /\btotal\b/i.test(l));
    if (i === -1) return null;
    for (let k = i + 1; k < Math.min(lines.length, i + 12); k++) {
      if (isMoneyLine(lines[k])) return moneyFromLine(lines[k]);
    }
    // fallback: 전체에서 가장 마지막 money line
    for (let k = lines.length - 1; k >= 0; k--) {
      if (isMoneyLine(lines[k])) return moneyFromLine(lines[k]);
    }
    return null;
  })();

  // 3) item 추출: “설명(여러 줄)”을 모았다가 money line 만나면 하나의 item
  const items: { name: string; price: number }[] = [];
  let buffer: string[] = [];

  const stopWords = /^(subtotal|tax|total)\b/i;

  for (const l of body) {
    // subtotal/tax/total 같은 키워드 만나면 버퍼 비우고 skip
    if (stopWords.test(l)) {
      buffer = [];
      continue;
    }

    // 금액 줄이면 아이템 확정
    if (isMoneyLine(l)) {
      const price = moneyFromLine(l);
      if (price === null) continue;

      const desc = cleanDesc(buffer.join(' ').trim());
      buffer = [];

      // desc가 비었으면(예: 단독 E 다음에 가격만 있으면) 스킵
      if (!desc) continue;

      // "Park #377" 같은 건 body에 없을 가능성이 크지만 안전장치:
      if (/st\.?\s*louis|park\s*#|mn\b|costco/i.test(desc)) continue;

      items.push({ name: desc, price: Math.round(price * 100) / 100 });
      continue;
    }

    // 금액 줄이 아니면 설명 버퍼에 쌓기
    // 단독 "E"는 버퍼에 굳이 넣지 않아도 됨
    if (/^e$/i.test(l)) continue;

    buffer.push(l);
  }

  return {
    items,
    subtotal: subtotal !== null && Number.isFinite(subtotal) ? Math.round(subtotal * 100) / 100 : null,
    tax: tax !== null && Number.isFinite(tax) ? Math.round(tax * 100) / 100 : null,
    total: total !== null && Number.isFinite(total) ? Math.round(total * 100) / 100 : null,
  };
}




type WordOut = { text: string; x: number; y: number };

async function scanWithVision(file: File): Promise<{ text: string; words: WordOut[] }> {
  const fd = new FormData();
  fd.append('file', file);

  const res = await fetch('/api/vision', { method: 'POST', body: fd });
  const data = await res.json();

  if (!res.ok) throw new Error(data?.error || 'Scan failed');
  return { text: data.text as string, words: (data.words ?? []) as WordOut[] };
}



function wordsToLines(words: { text: string; x: number; y: number }[]) {
  // y 기준으로 정렬 후, 가까운 y끼리 같은 줄로 묶음
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);

  const lines: { y: number; words: typeof sorted }[] = [];
  const yThreshold = 8; // 영수증 글자 크기에 따라 8~14 정도

  for (const w of sorted) {
    const last = lines[lines.length - 1];
    if (!last || Math.abs(w.y - last.y) > yThreshold) {
      lines.push({ y: w.y, words: [w] });
    } else {
      last.words.push(w);
      // 평균 y 업데이트(조금 더 안정적)
      last.y = (last.y * (last.words.length - 1) + w.y) / last.words.length;
    }
  }

  // 각 줄 내부는 x로 정렬해서 문자열로 만들기
  return lines.map((ln) => ({
    y: ln.y,
    words: ln.words.sort((a, b) => a.x - b.x),
    text: ln.words.sort((a, b) => a.x - b.x).map((w) => w.text).join(' '),
  }));
}

function parseCostcoFromLines(lines: { text: string }[]) {
  const out: { name: string; price: number }[] = [];

  const startIdx = lines.findIndex((l) => /self-?checkout/i.test(l.text));
  const endIdx = lines.findIndex((l) => /^subtotal\b/i.test(l.text));

  const body = lines.slice(
    startIdx >= 0 ? startIdx + 1 : 0,
    endIdx >= 0 ? endIdx : lines.length
  );

  const skip = /(subtotal|total|tax|visa|mastercard|amex|chip|approved|resp|tran|aid|seq|appt)/i;

  for (const l of body) {
    let line = l.text.replace(/\s+/g, ' ').trim();
    if (!line || skip.test(line)) continue;

    // ✅ 줄이 합쳐진 경우 잘라내기
    line = line.replace(/\b(SUBTOTAL|TOTAL|TAX)\b.*$/i, '').trim();
    if (!line) continue;

    // 가격 패턴: 12.89 또는 2.00- (할인)
    const m = line.match(/(.+?)\s+(\d+\.\d{2})(-?)\s*$/);
    if (!m) continue;

    let name = m[1].trim();
    let price = Number(m[2]);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (m[3] === '-') price = -price;

    // 코스트코: 앞에 E/코드 제거
    name = name.replace(/^[A-Z]\s+/, '');
    name = name.replace(/^\d{4,}\s+/, '');
    name = name.replace(/[.\s]{2,}$/g, '').trim();

    // ✅ 이름이 숫자만 남으면 버림
    if (!name || name.length < 2) continue;
    if (!/[A-Za-z]/.test(name)) continue;

    out.push({ name, price: Math.round(price * 100) / 100 });
  }

  return out;
}


function getNextReceiptId(items: any[]) {
  let maxNum = 0;
  for (const it of items) {
    const rid = it?.receiptId;
    if (typeof rid === 'string' && rid.startsWith('r')) {
      const n = Number(rid.slice(1));
      if (Number.isFinite(n)) maxNum = Math.max(maxNum, n);
    }
  }
  return `r${maxNum + 1}`;
}

export default function AddItemPage() {
  const { items, setItems } = useStore();
  

  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  
  const [ocrText, setOcrText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [ocrWords, setOcrWords] = useState<WordOut[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState('');


  const manualTotal = useMemo(
    () => items.filter((x: any) => x.source === 'manual').reduce((s: number, x: any) => s + x.price, 0),
    [items]
  );

  const receiptTotal = useMemo(
    () => items.filter((x: any) => x.source === 'receipt').reduce((s: number, x: any) => s + x.price, 0),
    [items]
  );

  const total = manualTotal + receiptTotal;


  const addManualItem = () => {
    const name = itemName.trim();
    const priceNum = Number(itemPrice);
    if (!name || !Number.isFinite(priceNum) || priceNum <= 0) return;

    setItems((prev: any[]) => [...prev, { id: uid(), name, price: priceNum, source: 'manual' }]);
    setItemName('');
    setItemPrice('');
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const onPickReceipt = async (file: File | null) => {
  if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);

  if (file) {
    const url = URL.createObjectURL(file);
    setReceiptPreviewUrl(url);

    setIsScanning(true);
    setOcrText('');
    try {
      const { text, words } = await scanWithVision(file);
      setOcrText(text || '(no text)');
      setOcrWords(words || []);

    } catch (e: any) {
      setOcrText(`ERROR: ${e?.message ?? 'scan failed'}`);
    } finally {
      setIsScanning(false);
    }
  } else {
    setReceiptPreviewUrl('');
    setOcrText('');
  }
};

const extractFromOcrText = () => {
  if (!ocrText.trim()) return;

  const parsed = parseCostcoLikeReceipt(ocrText);

  console.log('ITEM COUNT:', parsed.items.length);
  console.log('SUBTOTAL:', parsed.subtotal, 'TAX:', parsed.tax, 'TOTAL:', parsed.total);

  if (parsed.items.length === 0) {
    alert('No items parsed. (Check OCR text format)');
    return;
  }

  setItems((prev: any[]) => {
    const receiptId = getNextReceiptId(prev);
    return [
      ...prev,
      ...parsed.items.map((d) => ({
        id: uid(),
        name: d.name,
        price: d.price,
        source: 'receipt',
        receiptId,
        assignedIds: [],
      })),
    ];
  });
};




  const clearReceiptItems = () => {
    setItems((prev: any[]) => prev.filter((x) => x.source !== 'receipt'));
  };

  return (
    <main style={{ minHeight: '100vh', padding: 24, fontFamily: 'system-ui', color: '#fff' }}>
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
        {/* ================= LEFT ================= */}
        <section style={{ width: 420 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 18 }}>
            what are you paying together?
          </h1>

          <button
            onClick={openFilePicker}
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.35)',
              background: '#fff',
              color: '#000',
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            Upload receipt picture
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => onPickReceipt(e.target.files?.[0] ?? null)}
          />

          {/* Receipt box */}
          <div
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 8 }}>
              Receipt (demo)
            </div>

            {receiptPreviewUrl ? (
              <img
                src={receiptPreviewUrl}
                alt="Receipt preview"
                style={{
                  width: '100%',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.25)',
                  marginBottom: 10,
                }}
              />
            ) : (
              <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>
                Upload a receipt image to preview here.
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
  onClick={extractFromOcrText}
  style={{
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid rgba(0,0,0,0.25)',
    background: '#fff',
    color: '#000',
    fontWeight: 800,
    cursor: 'pointer',
  }}
>
  Extract items (OCR)
</button>

        

              <button
                onClick={clearReceiptItems}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.35)',
                  background: 'transparent',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Clear receipt items
              </button>
            </div>
          </div>

          {/* Manual input */}
          <div
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 8 }}>
              Manual input
            </div>

            <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 12 }}>
              Manual items will be split equally across the group.
            </div>
            
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addManualItem();
              }}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr auto',
                gap: 10,
              }}
            >
              <input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="Item name"
                style={{
                  padding: 3,
                  borderRadius: 10,
                  border: '1px solid rgba(0,0,0,0.18)',
                }}
              />

              <input
                value={itemPrice}
                onChange={(e) => setItemPrice(e.target.value)}
                placeholder="Price"
                inputMode="decimal"
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid rgba(0,0,0,0.18)',
                }}
              />

              <button
                type="submit"
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(0,0,0,0.25)',
                  background: '#fff',
                  color: '#000',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}

                
              >
                
                Add
              </button>
            </form>
          </div>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 20 , marginBottom: 20}}>
              Tip: Upload your receipt if items payment varys individually
            </div>
        </section>

        {/* ================= RIGHT ================= */}
        <section
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
          }}
        >
          <div
            style={{
              width: 420,
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.08)',
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
                Items ({items.length})
              </h2>
              <div style={{ fontWeight: 800 }}>
                ${total.toFixed(2)}
              </div>
            </div>

            <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6 }}>
              Manual ${manualTotal.toFixed(2)} · Receipt ${receiptTotal.toFixed(2)}
            </div>

            <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
              {items.map((it: any) => (
                <div
                  key={it.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: 12,
                    borderRadius: 12,
                    background: '#ffffffbe',
                    color: '#000',
                  }}
                >
                  <div>
                    <b>[{it.source}{it.receiptId ? `:${it.receiptId}` : ''}]</b>{' '}
                    {it.name} (${it.price.toFixed(2)})
                  </div>

                  <button
                    onClick={() => setItems((prev: any[]) => prev.filter((x) => x.id !== it.id))}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#ff4d4d',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
         
            <Link href="/add_ppl">
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
      {/* 다음 페이지 화살표  */}
      <Link href="/split" aria-label="Next page">
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
