import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewGiftCardOrders } from "../scripts/amazon-gift-card-orders.ts";
import type { Transaction } from "../scripts/amazon-categorize.ts";
import type { GiftCardActivity } from "../scripts/amazon-gift-card-review.ts";
import type { OrderCapture } from "../scripts/capture-order.ts";

const ORDER = "111-2222222-3333333";
function activity(overrides: Partial<GiftCardActivity> = {}): GiftCardActivity {
  return {
    import_id: "source-1",
    source_fingerprint: "fingerprint",
    date: "2026-10-02",
    kind: "redemption",
    order_number: ORDER,
    amount_minor: -21,
    closing_balance_minor: 1000,
    capture_page: 1,
    ...overrides,
  };
}
function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "wallet-1",
    external_id: "source-1",
    source: "amazon-gift-card",
    date: "2026-10-02",
    currency: "USD",
    amount_cents: 21,
    classification: "expense",
    account: { id: "wallet" },
    category: { id: "old", name: "Keep" },
    tags: [{ id: "ai", name: "ai-categorized" }],
    ...overrides,
  };
}
function order(overrides: Partial<OrderCapture> = {}): OrderCapture {
  return {
    version: 1,
    order_number: ORDER,
    source_url: `https://www.amazon.com/order?orderID=${ORDER}`,
    captured_at: "2026-10-26T00:00:00Z",
    items: [{ title: "Rail joiners", quantity_text: "2", price_text: "$4.00" }],
    summary_rows: [
      { label: "Item(s) Subtotal:", value: "$8.00" },
      { label: "Gift Card Amount:", value: "-$0.21" },
      { label: "Grand Total:", value: "$8.45" },
    ],
    ...overrides,
  };
}
void test("source identity and invoice allocation create own 21-cent evidence, not the 845-cent card charge", () => {
  const source = activity();
  const wallet = transaction();
  const captured = order();
  const before = structuredClone({ source, wallet, captured });
  const report = reviewGiftCardOrders([source], [wallet], [captured]);
  assert.deepEqual(report.errors, []);
  assert.equal(report.coverage.length, 1);
  assert.equal(report.coverage[0]!.status, "verified");
  assert.equal(report.bindings[0]!.charge.amount_minor, 21);
  assert.equal(report.bindings[0]!.charge.charged_on, source.date);
  assert.equal(report.bindings[0]!.funding?.card_minor, 845);
  assert.equal(report.bindings[0]!.funding.wallet_minor, 21);
  assert.equal(report.bindings[0]!.funding.total_minor, 866);
  assert.deepEqual(report.bindings[0]!.charge.orders[0]!.items, [
    { title: "Rail joiners", quantity: 2 },
  ]);
  assert.deepEqual({ source, wallet, captured }, before);
});
void test("unknown quantities require unique subtotal arithmetic; empty badge is not one", () => {
  const inferred = order({
    items: [{ title: "Rail joiners", quantity_text: "", price_text: "$4.00" }],
  });
  assert.equal(
    reviewGiftCardOrders([activity()], [transaction()], [inferred]).bindings[0]!.charge.orders[0]!
      .items[0]!.quantity,
    2,
  );
  const noSubtotal = order({ items: inferred.items, summary_rows: order().summary_rows.slice(1) });
  assert.equal(
    reviewGiftCardOrders([activity()], [transaction()], [noSubtotal]).bindings.length,
    0,
  );
  const unknowns = [
    { title: "First", quantity_text: "", price_text: "$2.00" },
    { title: "Second", quantity_text: "", price_text: "$2.00" },
  ];
  const ambiguous = reviewGiftCardOrders(
    [activity()],
    [transaction()],
    [order({ items: unknowns })],
  );
  assert.equal(ambiguous.bindings.length, 0);
  assert.equal(ambiguous.coverage[0]!.status, "order-context");
  assert.ok(ambiguous.coverage[0]!.items!.every((item) => item.quantity === undefined));
  const minimum = order({
    items: unknowns,
    summary_rows: order().summary_rows.map((row) =>
      row.label === "Item(s) Subtotal:" ? Object.assign(row, { value: "$4.00" }) : row,
    ),
  });
  assert.deepEqual(
    reviewGiftCardOrders([activity()], [transaction()], [minimum]).coverage[0]!.items!.map(
      (item) => item.quantity,
    ),
    [1, 1],
  );
});
void test("ambiguous visible prices and contradictory subtotal do not fabricate quantities", () => {
  const ambiguous = order({
    items: [{ title: "Rail joiners", quantity_text: "", price_text: "$4.00 $8.00" }],
  });
  assert.equal(reviewGiftCardOrders([activity()], [transaction()], [ambiguous]).bindings.length, 0);
  const contradiction = order({
    items: [{ title: "Rail joiners", quantity_text: "1", price_text: "$4.00" }],
  });
  assert.equal(
    reviewGiftCardOrders([activity()], [transaction()], [contradiction]).bindings.length,
    0,
  );
});
void test("single unknown quantity subtracts known lines before exact division", () => {
  const captured = order({
    items: [
      { title: "Known", quantity_text: "Qty: 2", price_text: "$1.00" },
      { title: "Unknown", quantity_text: "", price_text: "$3.00" },
    ],
  });
  const report = reviewGiftCardOrders([activity()], [transaction()], [captured]);
  assert.deepEqual(
    report.bindings[0]!.charge.orders[0]!.items.map((item) => item.quantity),
    [2, 2],
  );
});
void test("duplicate debit and hold release cycles retain every movement as context", () => {
  const sources = [
    activity(),
    activity({ import_id: "source-2", kind: "hold_release", amount_minor: 21 }),
    activity({ import_id: "source-3" }),
  ];
  const wallets = [
    transaction(),
    transaction({ id: "wallet-2", external_id: "source-2", classification: "income" }),
    transaction({ id: "wallet-3", external_id: "source-3" }),
  ];
  const report = reviewGiftCardOrders(sources, wallets, [order()]);
  assert.deepEqual(report.errors, []);
  assert.equal(report.bindings.length, 0);
  assert.equal(report.coverage.length, 3);
  assert.ok(report.coverage.every((row) => row.status === "order-context"));
  assert.match(report.coverage[1]!.reason, /not a purchase or purchase refund/u);
});
void test("refund keeps order context without inventing refunded items or dates", () => {
  const report = reviewGiftCardOrders(
    [activity({ kind: "refund", amount_minor: 21 })],
    [transaction({ classification: "income" })],
    [order()],
  );
  assert.equal(report.bindings.length, 0);
  assert.equal(report.coverage[0]!.status, "order-context");
  assert.equal(report.coverage[0]!.items![0]!.title, "Rail joiners");
  assert.match(report.coverage[0]!.reason, /separate refund proof/u);
});
void test("unknown order and funding activity receive explicit complete coverage", () => {
  for (const kind of [
    "gift_card_added",
    "reload",
    "auto_reload",
    "cash_load",
    "allowance",
  ] as const) {
    const report = reviewGiftCardOrders(
      [activity({ kind, amount_minor: 21 })],
      [transaction({ classification: "income" })],
      [order()],
    );
    assert.equal(report.coverage[0]!.status, "funding-review");
    assert.equal(report.bindings.length, 0);
    assert.equal(report.coverage[0]!.order_number, ORDER);
  }
  const report = reviewGiftCardOrders(
    [activity({ order_number: undefined })],
    [transaction()],
    [order()],
  );
  assert.equal(report.coverage[0]!.status, "unresolved");
  assert.equal(report.bindings.length, 0);
});
void test("same amount never substitutes for identity; financial identity and account mismatches are errors", () => {
  for (const overrides of [
    { external_id: "wrong" },
    { source: "bank" },
    { amount_cents: 22 },
    { date: "2026-10-03" },
    { currency: "EUR" },
    { classification: "income" },
    { account: null },
  ]) {
    const report = reviewGiftCardOrders([activity()], [transaction(overrides)], [order()]);
    assert.equal(report.coverage.length, 1);
    assert.equal(report.coverage[0]!.status, "unresolved");
    assert.equal(report.bindings.length, 0);
    assert.ok(report.errors.length > 0);
  }
});
void test("duplicate source records, duplicate imports, cross-account scope, and missing inventory events are reported", () => {
  const duplicateSource = reviewGiftCardOrders(
    [activity(), activity()],
    [transaction()],
    [order()],
  );
  assert.equal(duplicateSource.bindings.length, 0);
  assert.ok(duplicateSource.errors.length > 0);
  const duplicateWallet = reviewGiftCardOrders(
    [activity()],
    [transaction(), transaction({ id: "wallet-2" })],
    [order()],
  );
  assert.equal(duplicateWallet.coverage.length, 2);
  assert.equal(duplicateWallet.bindings.length, 0);
  assert.ok(duplicateWallet.errors.length > 0);
  const missing = reviewGiftCardOrders([activity()], [], [order()]);
  assert.match(missing.errors.join(" "), /missing wallet transaction/u);
  const cross = reviewGiftCardOrders(
    [activity(), activity({ import_id: "source-2" })],
    [
      transaction(),
      transaction({ id: "wallet-2", external_id: "source-2", account: { id: "other" } }),
    ],
    [order()],
  );
  assert.equal(cross.bindings.length, 0);
});
void test("missing or mismatched invoice gift allocation cannot verify a debit", () => {
  for (const value of ["-$0.22", "not an amount"]) {
    const captured = order({
      summary_rows: order().summary_rows.map((row) =>
        row.label === "Gift Card Amount:" ? Object.assign(row, { value }) : row,
      ),
    });
    const report = reviewGiftCardOrders([activity()], [transaction()], [captured]);
    assert.equal(report.bindings.length, 0);
    assert.equal(report.coverage[0]!.status, "order-context");
  }
});
