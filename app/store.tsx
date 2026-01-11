'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';

export type Person = { id: string; name: string };
export type ItemSource = 'manual' | 'receipt';

export type Item = {
  id: string;
  name: string;
  price: number;
  source: ItemSource;

  assignedIds?: string[];

  // manual item은 item별 payer 선택
  paidById?: string;

  // ✅ receipt 묶음 구분용 (receipt 1, receipt 2…)
  receiptId?: string; // 예: 'r1', 'r2'
};

type Store = {
  people: Person[];
  setPeople: React.Dispatch<React.SetStateAction<Person[]>>;

  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;

  // ✅ receipt 묶음별 payer 저장 (예: { r1: personId, r2: personId })
  receiptPaidBy: Record<string, string | undefined>;
  setReceiptPaidBy: React.Dispatch<React.SetStateAction<Record<string, string | undefined>>>;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [receiptPaidBy, setReceiptPaidBy] = useState<Record<string, string | undefined>>({});

  const value = useMemo(
    () => ({ people, setPeople, items, setItems, receiptPaidBy, setReceiptPaidBy }),
    [people, items, receiptPaidBy]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
