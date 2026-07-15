export const CURRENCY_TOLERANCE = 0.01;

export type NamedParticipant = { id: string; name: string };
export type Transfer = { fromId: string; toId: string; amount: number };

export type ParticipantBalanceView = {
  participantId: string;
  name: string;
  paid: number;
  fairShare: number;
  net: number;
  status: 'owes' | 'receives' | 'settled';
  amount: number;
  explanation: string;
};

export type TransferView = Transfer & {
  fromName: string;
  toName: string;
  sentence: string;
};

export type OptimizationSummary = {
  rawTransferCount: number;
  optimizedTransferCount: number;
  removedTransferCount: number;
  rawTotal: number;
  optimizedTotal: number;
};

export type ConsistencyResult = {
  balanced: boolean;
  messages: string[];
};

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(value: number) {
  const rounded = roundCurrency(value);
  return `${rounded < 0 ? '-' : ''}$${Math.abs(rounded).toFixed(2)}`;
}

function displayName(name: string) {
  return name.trim() || 'Unnamed';
}

export function buildParticipantBalanceViews(
  people: readonly NamedParticipant[],
  paid: Readonly<Record<string, number>>,
  fairShare: Readonly<Record<string, number>>,
  tolerance = CURRENCY_TOLERANCE
): ParticipantBalanceView[] {
  return people.map((person) => {
    const name = displayName(person.name);
    const paidAmount = roundCurrency(paid[person.id] ?? 0);
    const fairAmount = roundCurrency(fairShare[person.id] ?? 0);
    const net = roundCurrency(paidAmount - fairAmount);
    const status = net > tolerance ? 'receives' : net < -tolerance ? 'owes' : 'settled';
    const amount = status === 'settled' ? 0 : Math.abs(net);
    const explanation = status === 'receives'
      ? `${name} paid ${formatCurrency(paidAmount)} and was responsible for ${formatCurrency(fairAmount)}, so ${name} should receive ${formatCurrency(amount)}.`
      : status === 'owes'
        ? `${name} paid ${formatCurrency(paidAmount)} and was responsible for ${formatCurrency(fairAmount)}, so ${name} owes ${formatCurrency(amount)}.`
        : `${name} paid exactly their fair share, so ${name} is already settled.`;

    return {
      participantId: person.id,
      name,
      paid: paidAmount,
      fairShare: fairAmount,
      net,
      status,
      amount,
      explanation,
    };
  });
}

export function buildTransferViews(
  transfers: readonly Transfer[],
  people: readonly NamedParticipant[]
): TransferView[] {
  const names = new Map(people.map((person) => [person.id, displayName(person.name)]));
  return transfers.map((transfer) => {
    const fromName = names.get(transfer.fromId) ?? 'Unnamed';
    const toName = names.get(transfer.toId) ?? 'Unnamed';
    return {
      ...transfer,
      fromName,
      toName,
      sentence: `${fromName} sends ${toName} ${formatCurrency(transfer.amount)}.`,
    };
  });
}

export function transfersFromMatrix(matrix: readonly (readonly number[])[], peopleIds: readonly string[]) {
  const transfers: Transfer[] = [];
  matrix.forEach((row, rowIndex) => {
    row.forEach((amount, columnIndex) => {
      if (amount > CURRENCY_TOLERANCE && peopleIds[rowIndex] && peopleIds[columnIndex]) {
        transfers.push({
          fromId: peopleIds[rowIndex],
          toId: peopleIds[columnIndex],
          amount: roundCurrency(amount),
        });
      }
    });
  });
  return transfers;
}

export function buildOptimizationSummary(
  rawTransfers: readonly Transfer[],
  optimizedTransfers: readonly Transfer[]
): OptimizationSummary {
  return {
    rawTransferCount: rawTransfers.length,
    optimizedTransferCount: optimizedTransfers.length,
    removedTransferCount: Math.max(0, rawTransfers.length - optimizedTransfers.length),
    rawTotal: roundCurrency(rawTransfers.reduce((sum, transfer) => sum + transfer.amount, 0)),
    optimizedTotal: roundCurrency(optimizedTransfers.reduce((sum, transfer) => sum + transfer.amount, 0)),
  };
}

function transferNet(transfers: readonly Transfer[], peopleIds: readonly string[]) {
  const net: Record<string, number> = Object.fromEntries(peopleIds.map((id) => [id, 0]));
  for (const transfer of transfers) {
    if (net[transfer.fromId] !== undefined) net[transfer.fromId] -= transfer.amount;
    if (net[transfer.toId] !== undefined) net[transfer.toId] += transfer.amount;
  }
  return net;
}

export function checkSettlementConsistency(
  balances: Readonly<Record<string, number>>,
  rawTransfers: readonly Transfer[],
  optimizedTransfers: readonly Transfer[],
  tolerance = CURRENCY_TOLERANCE
): ConsistencyResult {
  const peopleIds = Object.keys(balances);
  const messages: string[] = [];
  const balanceTotal = Object.values(balances).reduce((sum, value) => sum + value, 0);
  if (Math.abs(balanceTotal) > tolerance) messages.push('Participant net balances do not sum to zero.');

  const invalidTransfer = [...rawTransfers, ...optimizedTransfers].some(
    (transfer) => !Number.isFinite(transfer.amount) || transfer.amount <= 0
  );
  if (invalidTransfer) messages.push('A transfer has an invalid amount.');

  const rawNet = transferNet(rawTransfers, peopleIds);
  const optimizedNet = transferNet(optimizedTransfers, peopleIds);
  const outcomesDiffer = peopleIds.some(
    (id) => Math.abs((rawNet[id] ?? 0) - (optimizedNet[id] ?? 0)) > tolerance
  );
  if (outcomesDiffer) messages.push('Raw and optimized transfers do not produce the same participant outcomes.');

  const optimizedMismatch = peopleIds.some(
    (id) => Math.abs((optimizedNet[id] ?? 0) - (balances[id] ?? 0)) > tolerance
  );
  if (optimizedMismatch) messages.push('Optimized transfers do not match participant net balances.');

  return { balanced: messages.length === 0, messages };
}
