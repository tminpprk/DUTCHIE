import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOptimizationSummary,
  buildParticipantBalanceViews,
  buildTransferViews,
  checkSettlementConsistency,
  formatCurrency,
  transfersFromMatrix,
} from '../lib/settlement-explainability';

const people = [
  { id: 'alex', name: 'Alex' },
  { id: 'jordan', name: 'Jordan' },
  { id: 'sam', name: 'Sam' },
];

test('participant who paid more receives money with a deterministic explanation', () => {
  const [view] = buildParticipantBalanceViews([people[0]], { alex: 120 }, { alex: 40 });
  assert.equal(view.status, 'receives');
  assert.equal(view.amount, 80);
  assert.equal(view.explanation, 'Alex paid $120.00 and was responsible for $40.00, so Alex should receive $80.00.');
});

test('participant who paid less owes money', () => {
  const [view] = buildParticipantBalanceViews([people[1]], { jordan: 10 }, { jordan: 35 });
  assert.equal(view.status, 'owes');
  assert.equal(view.amount, 25);
  assert.match(view.explanation, /Jordan owes \$25\.00/);
});

test('participant within currency tolerance is settled', () => {
  const [view] = buildParticipantBalanceViews([people[2]], { sam: 20 }, { sam: 20.009 });
  assert.equal(view.status, 'settled');
  assert.equal(view.amount, 0);
});

test('transfer sentence names sender, receiver, and exact amount', () => {
  const [view] = buildTransferViews([{ fromId: 'jordan', toId: 'alex', amount: 18.4 }], people);
  assert.equal(view.sentence, 'Jordan sends Alex $18.40.');
});

test('optimization summary supports singular wording inputs', () => {
  const summary = buildOptimizationSummary([{ fromId: 'jordan', toId: 'alex', amount: 5 }], []);
  assert.equal(summary.rawTransferCount, 1);
  assert.equal(summary.removedTransferCount, 1);
});

test('optimization summary counts multiple raw and optimized transfers', () => {
  const raw = [{ fromId: 'a', toId: 'b', amount: 5 }, { fromId: 'c', toId: 'b', amount: 2 }];
  const optimized = [{ fromId: 'a', toId: 'b', amount: 7 }];
  assert.deepEqual(buildOptimizationSummary(raw, optimized), {
    rawTransferCount: 2,
    optimizedTransferCount: 1,
    removedTransferCount: 1,
    rawTotal: 7,
    optimizedTotal: 7,
  });
});

test('zero-transfer settlement reports zero counts', () => {
  assert.deepEqual(buildOptimizationSummary([], []), {
    rawTransferCount: 0,
    optimizedTransferCount: 0,
    removedTransferCount: 0,
    rawTotal: 0,
    optimizedTotal: 0,
  });
});

test('long participant names are preserved without truncation', () => {
  const longName = 'Alexandria Very Long Participant Name';
  const [view] = buildParticipantBalanceViews([{ id: 'long', name: longName }], { long: 0 }, { long: 12 });
  assert.equal(view.name, longName);
  assert.match(view.explanation, new RegExp(longName));
});

test('currency formatting rounds to cents', () => {
  assert.equal(formatCurrency(10.005), '$10.01');
  assert.equal(formatCurrency(1.004), '$1.00');
  assert.equal(formatCurrency(-2.5), '-$2.50');
});

test('participant balances summing to zero pass consistency checks', () => {
  const transfers = [{ fromId: 'jordan', toId: 'alex', amount: 25 }];
  assert.equal(checkSettlementConsistency({ alex: 25, jordan: -25 }, transfers, transfers).balanced, true);
});

test('non-zero participant balance sum fails consistency checks', () => {
  const result = checkSettlementConsistency({ alex: 25, jordan: -24 }, [], []);
  assert.equal(result.balanced, false);
  assert.ok(result.messages.some((message) => message.includes('sum to zero')));
});

test('raw and optimized transfers can represent equivalent participant outcomes', () => {
  const raw = [
    { fromId: 'a', toId: 'b', amount: 10 },
    { fromId: 'b', toId: 'c', amount: 10 },
  ];
  const optimized = [{ fromId: 'a', toId: 'c', amount: 10 }];
  assert.equal(checkSettlementConsistency({ a: -10, b: 0, c: 10 }, raw, optimized).balanced, true);
});

test('matrix conversion retains original non-zero values and orientation', () => {
  const matrix = [[0, 12.34], [0, 0]];
  assert.deepEqual(transfersFromMatrix(matrix, ['sender', 'receiver']), [
    { fromId: 'sender', toId: 'receiver', amount: 12.34 },
  ]);
});

test('view-model construction does not mutate source data', () => {
  const sourcePeople = [{ id: 'a', name: '  Alex  ' }];
  const sourcePaid = { a: 20 };
  const sourceOwed = { a: 10 };
  const snapshot = JSON.stringify({ sourcePeople, sourcePaid, sourceOwed });
  buildParticipantBalanceViews(sourcePeople, sourcePaid, sourceOwed);
  assert.equal(JSON.stringify({ sourcePeople, sourcePaid, sourceOwed }), snapshot);
});

test('invalid zero or negative transfers fail trust checks', () => {
  const result = checkSettlementConsistency({ alex: 0 }, [{ fromId: 'alex', toId: 'alex', amount: 0 }], []);
  assert.equal(result.balanced, false);
  assert.ok(result.messages.some((message) => message.includes('invalid amount')));
});
