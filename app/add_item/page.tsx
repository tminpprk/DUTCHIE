'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useStore, type Item } from '../store';

const uid = () => Math.random().toString(36).slice(2, 10);

function normalizeText(t: string) {
  return t.replace(/\r/g, '').trim();
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

// ✅ Price-only parser
// - Extracts money amounts in order: r1-1, r1-2, ...
// - Ignores header noise and stops at summary/payment section
// - Excludes SUBTOTAL/TAX/TOTAL lines from item prices
function parsePricesOnly(text: string) {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const normalizeMoney = (s: string) =>
    s
      .trim()
      .replace(/\s+/g, '')
      .replace(/^\$/, '')
      .replace(',', '.')
      .replace('−', '-')
      .replace(/[Oo]/g, '0')
      .replace(/[Il]/g, '1')
      .replace(/[.*]$/, '');

  const parseMoney = (raw: string): number | null => {
    let t = normalizeMoney(raw);

    let neg = false;
    if (t.endsWith('-')) {
      neg = true;
      t = t.slice(0, -1);
    }
    if (t.startsWith('(') && t.endsWith(')')) {
      neg = true;
      t = t.slice(1, -1);
    }

    // allow only X.XX format
    if (!/^\d+\.\d{2}$/.test(t)) return null;

    const num = Number(t);
    if (!Number.isFinite(num)) return null;
    return neg ? -num : num;
  };

  // money token inside a line
  const moneyTokenRegex = /(\$?\s*\d+[.,]\d{2}\s*[-−*\.]?)/g;

  const isSummaryLine = (l: string) =>
    /^(subtotal|sub total|tax|total|change|tend|tender|balance due|amount due)\b/i.test(l);

  const isPaymentNoise = (l: string) =>
    /(approved|verified|pin|debit|credit|visa|mastercard|amex|eft|account|network|ref|appr|resp|tran\s*id|aid:|seq#|app#|chip|total purchase|items sold)/i.test(l);

  // totals (optional)
  const findNear = (kw: RegExp) => {
    for (let i = 0; i < lines.length; i++) {
      if (!kw.test(lines[i])) continue;

      // same line
      const ms = [...lines[i].matchAll(moneyTokenRegex)];
      for (let j = ms.length - 1; j >= 0; j--) {
        const n = parseMoney(ms[j][1]);
        if (n !== null) return Math.round(n * 100) / 100;
      }

      // next line
      const v = parseMoney(lines[i + 1] ?? '');
      if (v !== null) return Math.round(v * 100) / 100;

      return null;
    }
    return null;
  };

  const subtotal = findNear(/^subtotal\b|^sub total\b/i);
  const tax = findNear(/^tax\b/i);
  const total = findNear(/^(\*+)?\s*total\b|\btotal\b/i);

  // Extract item prices in order, stopping when reaching summary/payment region
  const prices: number[] = [];
  let reachedSummary = false;

  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim();

    if (isPaymentNoise(line)) {
      reachedSummary = true;
    }
    if (isSummaryLine(line)) {
      reachedSummary = true;
      // ✅ exclude summary line amounts from "item prices"
      continue;
    }
    if (reachedSummary) continue;

    const ms = [...line.matchAll(moneyTokenRegex)];
    if (ms.length === 0) continue;

    // 일반적으로 한 줄에 가격이 1개(오른쪽)
    // 그래도 안전하게: 그 줄의 마지막 money token을 사용
    const last = ms[ms.length - 1][1];
    const n = parseMoney(last);
    if (n === null) continue;

    // 0.00 같은 건 제외(세금 0 같은 오염 방지)
    if (Math.abs(n) < 0.0001) continue;

    prices.push(Math.round(n * 100) / 100);
  }

  // (선택) totals가 존재하면 "items 합"과 비교해 디버그 가능
  return { prices, subtotal, tax, total };
}

type WordOut = { text: string; x: number; y: number };

type OcrScanResult = {
  text: string;
  words: WordOut[];
  provider?: 'nvidia' | 'google';
  fallbackUsed?: boolean;
  warning?: string;
};

async function scanWithVision(file: File): Promise<OcrScanResult> {
  const fd = new FormData();
  fd.append('file', file);

  const res = await fetch('/api/vision', { method: 'POST', body: fd });
  const data = await res.json();

  if (!res.ok) throw new Error(data?.error || 'Scan failed');
  return {
    text: data.text as string,
    words: (data.words ?? []) as WordOut[],
    provider: data.provider,
    fallbackUsed: data.fallbackUsed,
    warning: data.warning,
  };
}


function getNextReceiptId(items: Item[]) {
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

  const [editingId, setEditingId] = useState<string | null>(null);
const [draftName, setDraftName] = useState('');
const [originalName, setOriginalName] = useState('');
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [draftPrice, setDraftPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');


  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  
  const [ocrText, setOcrText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<{ provider?: 'nvidia' | 'google'; fallbackUsed?: boolean; warning?: string }>({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState('');
  const [activeReceiptId, setActiveReceiptId] = useState('');
  const [activeReceiptName, setActiveReceiptName] = useState<string | null>(null);
  const [activeReceiptItemIds, setActiveReceiptItemIds] = useState<string[]>([]);

  const receiptDraftId = activeReceiptId || getNextReceiptId(items);
  const receiptDraftName = activeReceiptName ?? receiptDraftId;


  const manualTotal = useMemo(
    () => items.filter((x: any) => x.source === 'manual').reduce((s: number, x: any) => s + x.price, 0),
    [items]
  );

  const receiptTotal = useMemo(
    () => items.filter((x: any) => x.source === 'receipt').reduce((s: number, x: any) => s + x.price, 0),
    [items]
  );

  const total = manualTotal + receiptTotal;

  const reviewItems = useMemo(
    () => items.filter((item) => item.source === 'manual' || activeReceiptItemIds.includes(item.id)),
    [items, activeReceiptItemIds]
  );

  const completedReceiptGroups = useMemo(() => {
    const groups = new Map<string, { name: string; total: number }>();
    for (const item of items) {
      if (item.source !== 'receipt' || activeReceiptItemIds.includes(item.id)) continue;
      const receiptId = item.receiptId || 'r1';
      const current = groups.get(receiptId);
      groups.set(receiptId, {
        name: item.receiptName?.trim() || current?.name || receiptId,
        total: (current?.total ?? 0) + item.price,
      });
    }
    return Array.from(groups.entries())
      .map(([receiptId, group]) => ({
        receiptId,
        name: group.name,
        total: Math.round(group.total * 100) / 100,
      }))
      .sort((a, b) => a.receiptId.localeCompare(b.receiptId, undefined, { numeric: true }));
  }, [items, activeReceiptItemIds]);

  const visibleItemCount = reviewItems.length + completedReceiptGroups.length;


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
    if (!activeReceiptId) {
      const nextReceiptId = getNextReceiptId(items);
      setActiveReceiptId(nextReceiptId);
      setActiveReceiptName(nextReceiptId);
    }
    const url = URL.createObjectURL(file);
    
    setReceiptPreviewUrl(url);

    setIsScanning(true);
    setOcrText('');
    try {
      const { text, provider, fallbackUsed, warning } = await scanWithVision(file);
      setOcrText(text || '(no text)');
      setOcrStatus({ provider, fallbackUsed, warning });

    } catch (error: unknown) {
      setOcrText(`ERROR: ${error instanceof Error ? error.message : 'scan failed'}`);
      setOcrStatus({});
    } finally {
      setIsScanning(false);
    }
  } else {
    setReceiptPreviewUrl('');
    setOcrText('');
    setOcrStatus({});
  }
  
};

const extractFromOcrText = () => {
  if (!ocrText.trim()) return;

  const parsed = parsePricesOnly(ocrText);

  console.log('PRICE COUNT:', parsed.prices.length);
  console.log('SUBTOTAL:', parsed.subtotal, 'TAX:', parsed.tax, 'TOTAL:', parsed.total);

  if (parsed.prices.length === 0) {
    alert('No prices parsed. (Check OCR text format)');
    return;
  }

  const receiptId = receiptDraftId;
  const receiptName = receiptDraftName.trim() || receiptId;
  const newItems: Item[] = parsed.prices.map((price, idx) => ({
      id: uid(),
      name: `${receiptId}-${idx + 1}`,   // ✅ r1-1, r1-2 ...
      price,
      source: 'receipt' as const,
      receiptId,
      receiptName,
      assignedIds: [],
  }));

  if (parsed.tax !== null && Math.abs(parsed.tax) >= 0.0001) {
    newItems.push({
      id: uid(),
      name: `${receiptId}-tax`,
      price: parsed.tax,
      source: 'receipt',
      receiptId,
      receiptName,
      assignedIds: [],
    });
  }

  setItems((prev) => [
    ...prev.filter((item) => !activeReceiptItemIds.includes(item.id)),
    ...newItems,
  ]);
  setActiveReceiptId(receiptId);
  setActiveReceiptName(receiptName);
  setActiveReceiptItemIds(newItems.map((item) => item.id));
};

const beginInlineEdit = (it: any) => {
  setEditingId(it.id);
  setDraftName(String(it.name ?? ''));
  setOriginalName(String(it.name ?? ''));
};

const commitInlineEdit = () => {
  if (!editingId) return;
  const next = draftName.trim();
  if (!next) return;

  setItems((prev: any[]) =>
    prev.map((x) => (x.id === editingId ? { ...x, name: next } : x))
  );

  setEditingId(null);
  setDraftName('');
  setOriginalName('');
};

const cancelInlineEdit = () => {
  setEditingId(null);
  setDraftName('');
  setOriginalName('');
};

const beginPriceEdit = (item: Item) => {
  setEditingPriceId(item.id);
  setDraftPrice(item.price.toFixed(2));
  setOriginalPrice(item.price.toFixed(2));
};

const commitPriceEdit = () => {
  if (!editingPriceId) return;
  const nextPrice = Number(draftPrice.trim());
  if (!Number.isFinite(nextPrice)) {
    setDraftPrice(originalPrice);
    setEditingPriceId(null);
    return;
  }

  setItems((prev) => prev.map((item) => (
    item.id === editingPriceId ? { ...item, price: Math.round(nextPrice * 100) / 100 } : item
  )));
  setEditingPriceId(null);
  setDraftPrice('');
  setOriginalPrice('');
};

const cancelPriceEdit = () => {
  setEditingPriceId(null);
  setDraftPrice('');
  setOriginalPrice('');
};

const updateReceiptDraftName = (nextValue: string) => {
  setActiveReceiptName(nextValue);
  if (activeReceiptItemIds.length === 0) return;
  setItems((prev) => prev.map((item) => (
    activeReceiptItemIds.includes(item.id) ? { ...item, receiptName: nextValue } : item
  )));
};

const finishReceipt = () => {
  const receiptId = receiptDraftId;
  const receiptName = receiptDraftName.trim();
  if (!receiptName || activeReceiptItemIds.length === 0) return;

  const duplicateExists = items.some((item) =>
    item.source === 'receipt' &&
    (item.receiptName || item.receiptId) === receiptName &&
    !activeReceiptItemIds.includes(item.id)
  );
  if (duplicateExists) {
    alert(`A receipt named "${receiptName}" already exists.`);
    return;
  }

  setItems((prev) => prev.map((item) => (
    activeReceiptItemIds.includes(item.id) ? { ...item, receiptId, receiptName } : item
  )));
  if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
  if (fileInputRef.current) fileInputRef.current.value = '';
  setReceiptPreviewUrl('');
  setOcrText('');
  setOcrStatus({});
  setActiveReceiptId('');
  setActiveReceiptName(null);
  setActiveReceiptItemIds([]);
  cancelInlineEdit();
  cancelPriceEdit();
};

const removeItem = (itemId: string) => {
  setItems((prev) => prev.filter((item) => item.id !== itemId));
  setActiveReceiptItemIds((prev) => prev.filter((id) => id !== itemId));
  if (editingId === itemId) cancelInlineEdit();
  if (editingPriceId === itemId) cancelPriceEdit();
};


  const clearReceiptItems = () => {
    setItems((prev: any[]) => prev.filter((x) => x.source !== 'receipt'));
    setActiveReceiptItemIds([]);
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

            {isScanning && <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>Preparing AI...</div>}
            {!isScanning && ocrStatus.provider && (
              <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>
                Analyzing with {ocrStatus.provider === 'nvidia' ? 'NVIDIA' : ocrStatus.fallbackUsed ? 'Google fallback' : 'Google'}
              </div>
            )}
            {!isScanning && ocrStatus.warning && (
              <div role="status" style={{ fontSize: 13, color: '#ffd27a', marginBottom: 8 }}>
                {ocrStatus.warning}
              </div>
            )}

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
            <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
              <label htmlFor="receipt-name" style={{ fontSize: 13, fontWeight: 800, opacity: 0.85 }}>
                Current receipt
              </label>
              <input
                id="receipt-name"
                value={receiptDraftName}
                onChange={(event) => updateReceiptDraftName(event.target.value)}
                aria-label="Receipt name"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 10px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.35)',
                  background: '#fff',
                  color: '#000',
                  fontWeight: 800,
                }}
              />
              <button
                type="button"
                onClick={finishReceipt}
                disabled={activeReceiptItemIds.length === 0}
                style={{
                  justifySelf: 'start',
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.35)',
                  background: activeReceiptItemIds.length > 0 ? '#fff' : 'rgba(255,255,255,0.18)',
                  color: activeReceiptItemIds.length > 0 ? '#000' : 'rgba(255,255,255,0.55)',
                  cursor: activeReceiptItemIds.length > 0 ? 'pointer' : 'not-allowed',
                  fontWeight: 800,
                }}
              >
                Done with this receipt
              </button>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Review prices before pressing "Done with this receipt"
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
                Items ({visibleItemCount})
              </h2>
              <div style={{ fontWeight: 800 }}>
                ${total.toFixed(2)}
              </div>
            </div>

            <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6 }}>
              Manual ${manualTotal.toFixed(2)} · Receipt ${receiptTotal.toFixed(2)}
            </div>

            <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6 }}>
              Tip: Change a item name for items you have to pay it separately. (e.g., "mj's drink" or "andrew's dessert")
            </div>

            <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
              {completedReceiptGroups.map((group) => (
                <div
                  key={`completed-${group.receiptId}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 12,
                    borderRadius: 12,
                    background: '#ffffffbe',
                    color: '#000',
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{group.name}</div>
                  <div style={{ fontWeight: 900 }}>${group.total.toFixed(2)}</div>
                </div>
              ))}

              {reviewItems.map((it: Item) => (
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
                    {/* name (click-to-edit) */}
{editingId !== it.id ? (
  <span
    onClick={() => beginInlineEdit(it)}
    title="Click to rename"
    style={{
      fontWeight: 800,
      cursor: 'text',
      borderBottom: '1px dashed rgba(0,0,0,0.35)',
      paddingBottom: 1,
    }}
  >
    {it.name}
  </span>
) : (
  <input
    autoFocus
    value={draftName}
    onChange={(e) => setDraftName(e.target.value)}
    onFocus={(e) => e.currentTarget.select()} 
    onKeyDown={(e) => {
      if (e.key === 'Enter') commitInlineEdit();
      if (e.key === 'Escape') cancelInlineEdit();
    }}
    onBlur={() => {
      // blur 시: 바뀐 게 있으면 저장, 아니면 취소
      if (draftName.trim() && draftName.trim() !== originalName.trim()) commitInlineEdit();
      else cancelInlineEdit();
    }}
    style={{
      width: 160,
      padding: '6px 8px',
      borderRadius: 10,
      border: '1px solid rgba(0,0,0,0.18)',
      fontWeight: 800,
      background: '#fff',
    }}
  />
)}

{' '}
{editingPriceId !== it.id ? (
  <span
    onClick={() => beginPriceEdit(it)}
    title="Click to edit price"
    style={{
      opacity: 0.75,
      fontWeight: 700,
      cursor: 'text',
      borderBottom: '1px dashed rgba(0,0,0,0.35)',
    }}
  >
    (${it.price.toFixed(2)})
  </span>
) : (
  <input
    autoFocus
    value={draftPrice}
    inputMode="decimal"
    aria-label={`Price for ${it.name}`}
    onChange={(event) => setDraftPrice(event.target.value)}
    onFocus={(event) => event.currentTarget.select()}
    onKeyDown={(event) => {
      if (event.key === 'Enter') commitPriceEdit();
      if (event.key === 'Escape') cancelPriceEdit();
    }}
    onBlur={() => {
      if (draftPrice.trim() && draftPrice.trim() !== originalPrice) commitPriceEdit();
      else cancelPriceEdit();
    }}
    style={{
      width: 86,
      padding: '6px 8px',
      borderRadius: 10,
      border: '1px solid rgba(0,0,0,0.18)',
      fontWeight: 800,
      background: '#fff',
    }}
  />
)}

                  </div>

                  <button
                    onClick={() => removeItem(it.id)}
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

