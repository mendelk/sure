import assert from "node:assert/strict";
import test from "node:test";
import {
  eligible,
  matches,
  validateCharges,
  type Charge,
  type Transaction,
} from "../scripts/amazon-categorize.ts";
import { charge, transaction } from "./fixtures.ts";

function reconcile(
  transactions: Transaction[],
  charges: Charge[],
  targetIds = [transactions[0]!.id],
) {
  return matches({ transactions, target_ids: targetIds }, charges);
}

void test("shipment date, not an old order date, matches; actual payment date takes precedence", () => {
  const oldOrder = charge();
  assert.equal(reconcile([transaction()], [oldOrder])[0]!.charge_id, "shipment");
  oldOrder.charged_on = "2026-10-24";
  assert.equal(reconcile([transaction()], [oldOrder])[0]!.status, "unmatched");
});
void test("posting window includes four days, not five days or negative lag", () => {
  assert.equal(reconcile([transaction()], [charge()])[0]!.status, "unique");
  for (const posting of ["2026-10-24", "2026-10-18"]) {
    assert.equal(
      reconcile([transaction("t1", { date: posting })], [charge()])[0]!.status,
      "unmatched",
    );
  }
});
void test("equal payment candidates remain ambiguous instead of choosing the nearest date", () => {
  const row = reconcile(
    [transaction()],
    [charge(), charge("second", { shipped_on: "2026-10-23" })],
  )[0]!;
  assert.equal(row.status, "ambiguous");
  assert.equal(row.charge_id, null);
  assert.deepEqual(
    new Set(row.candidates.map((candidate) => candidate.charge_id)),
    new Set(["shipment", "second"]),
  );
});
void test("an annotated ledger transaction reserves its shared charge", () => {
  const row = reconcile(
    [transaction(), transaction("already", { category: { id: "cat", name: "Other" } })],
    [charge()],
  )[0]!;
  assert.equal(row.status, "ambiguous");
  assert.deepEqual(row.candidates[0]!.transaction_ids, ["t1", "already"]);
});
void test("gift-card wallet movements cannot consume card-funded payment or refund evidence", () => {
  for (const kind of ["charge", "refund"] as const) {
    const classification = kind === "refund" ? "income" : "expense";
    const rows = [
      transaction("bank", { classification }),
      transaction("wallet", {
        classification,
        source: "amazon-gift-card",
        tags: [{ id: "review", name: "follow-up" }],
      }),
    ];
    const payment = charge("payment", {
      kind,
      ...(kind === "refund" ? { charged_on: "2026-10-23" } : {}),
    });
    assert.deepEqual(
      reconcile(rows, [payment], ["bank", "wallet"]).map((match) => [
        match.transaction_id,
        match.status,
        match.charge_id,
      ]),
      [
        ["bank", "unique", "payment"],
        ["wallet", "unmatched", null],
      ],
    );
  }
});
void test("refunds use their actual refund date and never match expenses", () => {
  const refund = charge("refund", {
    kind: "refund",
    charged_on: "2026-10-23",
    shipped_on: "2026-01-01",
  });
  assert.equal(reconcile([transaction()], [refund])[0]!.status, "unmatched");
  const row = reconcile([transaction("t1", { classification: "income" })], [refund])[0]!;
  assert.equal(row.status, "unique");
  assert.equal(row.candidates[0]!.date_basis, "charged_on");
});
void test("currency and minor-unit amounts are exact, independent of localized display amounts", () => {
  for (const changes of [
    { currency: "EUR" },
    { amount_cents: 2748 },
    { amount_cents: Number.NaN, amount: "$27.49" },
  ])
    assert.equal(reconcile([transaction("t1", changes)], [charge()])[0]!.status, "unmatched");

  assert.equal(
    reconcile([transaction("t1", { currency: "JPY" })], [charge("c1", { currency: "JPY" })])[0]!
      .status,
    "unique",
  );
});
void test("pending records, transfers, and split children never match", () => {
  for (const changes of [
    { pending: true },
    { transfer: { id: "transfer" } },
    { parent_entry_id: "parent" },
  ])
    assert.equal(reconcile([transaction("t1", changes)], [charge()])[0]!.status, "unmatched");
});
void test("an order date alone cannot become payment or shipment evidence", () => {
  assert.throws(
    () => validateCharges({ version: 1, charges: [charge("c1", { shipped_on: null })] }),
    /order date is not a fallback/u,
  );
});
void test("discovery requires no category AND no tags; notes cannot invent an Amazon merchant", () => {
  assert.equal(
    eligible(transaction("t1", { name: "Purchase", merchant: { name: "Amazon" } })),
    true,
  );
  for (const changes of [
    { category: { id: "cat", name: "Other" } },
    { tags: [{ id: "tag", name: "Reviewed" }] },
    { name: "Unrelated store", merchant: null, notes: "Amazon comparison" },
  ])
    assert.equal(eligible(transaction("t1", changes)), false);
});
void test("unsafe numeric minor units are rejected rather than rounded into a different charge", () => {
  assert.throws(
    () => validateCharges({ version: 1, charges: [charge("c1", { amount_minor: 2 ** 53 })] }),
    /integer minor units/u,
  );
});
void test("invalid calendar dates cannot roll over into a plausible match", () => {
  assert.throws(
    () => validateCharges({ version: 1, charges: [charge("c1", { shipped_on: "2026-02-31" })] }),
    /Invalid payment\/shipment date/u,
  );
});

void test("retail and marketplace descriptors distinguish equal overlapping payments without date ranking", () => {
  const payments = validateCharges({
    version: 1,
    charges: [
      charge("retail", { charged_on: "2026-10-19", merchant_descriptor: "Amazon.com" }),
      charge("marketplace", { charged_on: "2026-10-20", merchant_descriptor: "AMZN Mktp US" }),
    ],
  });
  const rows = [
    transaction("marketplace", { name: "Amazon Mktpl*EXAMPLE", date: "2026-10-20" }),
    transaction("retail", { name: "Amazon.com*EXAMPLE", date: "2026-10-21" }),
  ];
  assert.deepEqual(
    reconcile(
      rows,
      payments,
      rows.map((row) => row.id),
    ).map((match) => [match.status, match.charge_id]),
    [
      ["unique", "marketplace"],
      ["unique", "retail"],
    ],
  );
});

void test("unknown or conflicting payment descriptors cannot discard another ledger owner", () => {
  for (const descriptor of [undefined, "Amazon", "Amazon.com / AMZN Mktp US"]) {
    const row = reconcile(
      [
        transaction("retail", { name: "Amazon.com*EXAMPLE" }),
        transaction("marketplace", {
          name: "AMZN Mktp US*EXAMPLE",
          category: { id: "other", name: "Other" },
        }),
      ],
      [charge("payment", { merchant_descriptor: descriptor })],
    )[0]!;
    assert.equal(row.status, "ambiguous");
    assert.deepEqual(row.candidates[0]!.transaction_ids, ["retail", "marketplace"]);
  }
});

void test("generic or missing bank descriptions retain annotated reservations instead of using merchant labels", () => {
  for (const name of [undefined, "Amazon", "Amazon.com / AMZN Mktp US"]) {
    const row = reconcile(
      [
        transaction("retail", { name: "Amazon.com*EXAMPLE" }),
        transaction("annotated", {
          name,
          merchant: { name: "Amazon Marketplace" },
          category: { id: "other", name: "Other" },
        }),
      ],
      [charge("payment", { merchant_descriptor: "Amazon.com" })],
    )[0]!;
    assert.equal(row.status, "ambiguous");
    assert.deepEqual(row.candidates[0]!.transaction_ids, ["retail", "annotated"]);
  }
});

void test("matching merchant descriptors cannot bypass amount, currency, direction, or posting bounds", () => {
  for (const changes of [
    { amount_cents: 2748 },
    { currency: "EUR" },
    { classification: "income" },
    { date: "2026-10-18" },
    { date: "2026-10-24" },
  ]) {
    assert.equal(
      reconcile(
        [transaction("retail", { name: "Amazon.com*EXAMPLE", ...changes })],
        [charge("retail", { merchant_descriptor: "Amazon.com" })],
      )[0]!.status,
      "unmatched",
    );
  }
});

void test("one-to-one date constraints reserve the earlier payment and force the later pairing", () => {
  const payments = [
    charge("earlier", { charged_on: "2026-10-19" }),
    charge("later", { charged_on: "2026-10-21" }),
  ];
  const rows = [
    transaction("earlier", { date: "2026-10-20", category: { id: "other", name: "Other" } }),
    transaction("later", { date: "2026-10-22" }),
  ];
  const match = reconcile(rows, payments, ["later"])[0]!;
  assert.equal(match.status, "unique");
  assert.equal(match.charge_id, "later");
  assert.deepEqual(match.candidates[0]!.transaction_ids, ["later"]);
});

void test("balanced but interchangeable equal payments stay ambiguous rather than using FIFO", () => {
  const rows = [
    transaction("first", { date: "2026-10-21" }),
    transaction("second", { date: "2026-10-22" }),
  ];
  const payments = [
    charge("earlier", { charged_on: "2026-10-19", merchant_descriptor: "AMZN Mktp US" }),
    charge("later", { charged_on: "2026-10-20", merchant_descriptor: "AMZN Mktp US" }),
  ];
  assert.deepEqual(
    reconcile(
      rows,
      payments,
      rows.map((row) => row.id),
    ).map((match) => match.status),
    ["ambiguous", "ambiguous"],
  );
});

void test("one-to-one elimination never crosses bank accounts or publishes a contradictory partial assignment", () => {
  const differentAccounts = [
    transaction("earlier", { date: "2026-10-20" }),
    transaction("later", { date: "2026-10-22", account: { id: "other-account" } }),
  ];
  assert.equal(
    reconcile(differentAccounts, [
      charge("earlier", { charged_on: "2026-10-19" }),
      charge("later", { charged_on: "2026-10-21" }),
    ])[0]!.status,
    "ambiguous",
  );
  const contradictory = [
    transaction("first", { date: "2026-10-19" }),
    transaction("second", { date: "2026-10-20" }),
    transaction("third", { date: "2026-10-23" }),
  ];
  assert.deepEqual(
    reconcile(
      contradictory,
      [
        charge("shared"),
        charge("later-one", { charged_on: "2026-10-23" }),
        charge("later-two", { charged_on: "2026-10-23" }),
      ],
      contradictory.map((row) => row.id),
    ).map((match) => match.status),
    ["ambiguous", "ambiguous", "ambiguous"],
  );
});

void test("Woot cannot consume or reserve an Amazon-account payment", () => {
  const rows = [
    transaction("amazon"),
    transaction("woot", { name: "Amazon - AMZ*WOOT LLC EXAMPLEPAY.AMAZON.CO WA" }),
  ];
  assert.deepEqual(
    reconcile(
      rows,
      [charge()],
      rows.map((row) => row.id),
    ).map((match) => [match.status, match.charge_id]),
    [
      ["unique", "shipment"],
      ["unmatched", null],
    ],
  );
});
