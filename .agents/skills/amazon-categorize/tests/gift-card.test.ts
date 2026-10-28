import assert from "node:assert/strict";
import test from "node:test";
import {
  linkGiftCardOrders,
  reviewGiftCardHistory,
  usdMinor,
  validateGiftCardHistoryPrefix,
} from "../scripts/amazon-gift-card-review.ts";
import type { GiftCardPage } from "../scripts/capture-gift-card.ts";
import { charge, transaction } from "./fixtures.ts";

const ORDER = "111-2222222-3333333";
const inventory = { accounts: [] };
function row(description: string, amount: string, closing_balance: string) {
  return { date: "January 2, 2026", description, amount, closing_balance };
}
function statement(): { version: 1; currency: string; pages: GiftCardPage[] } {
  return {
    version: 1,
    currency: "USD",
    pages: [
      {
        version: 1,
        source_url: "https://www.amazon.com/gc/balance",
        captured_at: "2026-10-25T00:00:00Z",
        balance: "$0.00",
        has_next: false,
        has_previous: false,
        rows: [
          row(`Gift Card applied to Amazon.com order ${ORDER}`, "-$35.00", "$0.00"),
          row(`Refund from Amazon.com order ${ORDER}`, "$10.00", "$35.00"),
          row(
            `Release of Gift Card Balance hold from Amazon.com order ${ORDER}`,
            "$5.00",
            "$25.00",
          ),
          row(`Gift Card applied to Amazon.com order ${ORDER}`, "-$30.00", "$20.00"),
          row("Gift Card added", "$50.00", "$50.00"),
        ],
      },
    ],
  };
}

void test("gift-card history reconciles holds separately from refunds and proposes transaction-driven cash", () => {
  const report = reviewGiftCardHistory(statement(), inventory);
  assert.equal(report.opening_balance_minor, 0);
  assert.equal(report.current_balance_minor, 0);
  assert.equal(report.totals.redemption.amount_minor, -6500);
  assert.equal(report.totals.refund.amount_minor, 1000);
  assert.equal(report.totals.hold_release.amount_minor, 500);
  assert.equal(report.totals.gift_card_added.amount_minor, 5000);
  assert.deepEqual(
    report.activities.map((activity) => activity.kind),
    ["gift_card_added", "redemption", "hold_release", "refund", "redemption"],
  );
  assert.equal(report.account_proposal?.account.account_type, "depository");
  assert.equal(report.account_proposal.account.subtype, "cash");
  assert.equal(report.account_proposal.account.opening_balance_date, "2026-01-01");
});
void test("a nonzero evidenced opening is retained rather than assuming a zero starting balance", () => {
  const document = statement();
  document.pages[0]!.rows.pop();
  const report = reviewGiftCardHistory(document, inventory);
  assert.equal(report.opening_balance_minor, 5000);
  assert.equal(report.account_proposal?.account.balance, "50.00");
});
void test("a running-balance gap prevents a reconciled report", () => {
  const document = statement();
  document.pages[0]!.rows[2]!.closing_balance = "$25.01";
  assert.throws(() => reviewGiftCardHistory(document, inventory), /Running balance gap/u);
});
void test("missing first or last history pages cannot masquerade as a complete statement", () => {
  for (const flag of ["has_next", "has_previous"] as const) {
    const document = statement();
    document.pages[0]![flag] = true;
    assert.throws(() => reviewGiftCardHistory(document, inventory), /Incomplete/u);
  }
});
void test("a changed current balance across history pages requires recapture", () => {
  const document = statement();
  document.pages[0]!.has_next = true;
  document.pages.push({
    ...document.pages[0]!,
    has_previous: true,
    has_next: false,
    balance: "$0.01",
  });
  assert.throws(() => reviewGiftCardHistory(document, inventory), /changed during capture/u);
});
void test("repeated charge and release cycles retain distinct deterministic local import identities", () => {
  const document = statement();
  document.pages[0]!.rows = [
    row(`Gift Card applied to Amazon.com order ${ORDER}`, "-$10.00", "$0.00"),
    row(`Release of Gift Card Balance hold from Amazon.com order ${ORDER}`, "$10.00", "$10.00"),
    row(`Gift Card applied to Amazon.com order ${ORDER}`, "-$10.00", "$0.00"),
    row("Gift Card added", "$10.00", "$10.00"),
  ];
  const report = reviewGiftCardHistory(document, inventory);
  assert.equal(report.activities.length, 4);
  assert.equal(report.totals.redemption.amount_minor, -2000);
  assert.equal(new Set(report.activities.map((activity) => activity.import_id)).size, 4);
  assert.equal(report.repeated_source_fingerprints.length, 1);
  assert.equal(report.repeated_source_fingerprints[0]!.occurrences, 2);
  assert.deepEqual(report, reviewGiftCardHistory(document, inventory));
  assert.deepEqual(report.repeated_source_fingerprints[0]!.import_ids, [
    report.activities[1]!.import_id,
    report.activities[3]!.import_id,
  ]);
});
void test("refunds without displayed order numbers remain refunds without an invented order", () => {
  const document = statement();
  document.pages[0]!.rows[1]!.description = "Refund from Amazon.com order";
  const report = reviewGiftCardHistory(document, inventory);
  const refund = report.activities.find((activity) => activity.kind === "refund")!;
  assert.equal(refund.amount_minor, 1000);
  assert.equal(refund.order_number, undefined);
  assert.match(
    report.review_required.find((review) => review.import_id === refund.import_id)!.reason,
    /refunded items/u,
  );
});
void test("unknown activity is retained for balance arithmetic but never inferred as a gift or refund", () => {
  const document = statement();
  document.pages[0]!.rows.at(-1)!.description = "[Unrecognized gift-card activity]";
  const report = reviewGiftCardHistory(document, inventory);
  assert.equal(report.totals.unknown.amount_minor, 5000);
  assert.equal(report.totals.gift_card_added.count, 0);
  assert.match(report.review_required[0]!.reason, /unrecognized/u);
});
void test("the account proposal cannot create a second Amazon gift-card account", () => {
  const report = reviewGiftCardHistory(statement(), {
    accounts: [{ id: "existing", name: "Amazon Gift Card Balance", account_type: "other_asset" }],
  });
  assert.equal(report.account_proposal, null);
  assert.deepEqual(report.existing_account_candidates, [
    { id: "existing", name: "Amazon Gift Card Balance" },
  ]);
});
void test("description and amount direction must agree", () => {
  const document = statement();
  document.pages[0]!.rows[1]!.amount = "-$10.00";
  assert.throws(() => reviewGiftCardHistory(document, inventory), /direction conflicts/u);
});
void test("impossible dates and noncanonical capture origins are rejected", () => {
  const invalid = statement();
  invalid.pages[0]!.rows[0]!.date = "February 30, 2026";
  assert.throws(() => reviewGiftCardHistory(invalid, inventory), /calendar date/u);
  const foreign = statement();
  foreign.pages[0]!.source_url = "https://not-amazon.example/gc/balance";
  assert.throws(() => reviewGiftCardHistory(foreign, inventory), /sanitized/u);
});
void test("USD parsing preserves cents and rejects malformed or unsafe amounts", () => {
  assert.equal(usdMinor("-$1,234.56"), -123456);
  assert.equal(usdMinor("$0.21"), 21);
  for (const value of ["$1,23.45", "$0.001", "EUR 1.00", "$900719925474099.99"])
    assert.throws(() => usdMinor(value));
});

void test("order evidence preserves multiple candidates and does not allocate gift-card funding by amount", () => {
  const report = reviewGiftCardHistory(statement(), inventory);
  const payments = [
    charge("first", {
      orders: [{ order_number: ORDER, items: [{ title: "Cable", quantity: 1 }] }],
    }),
    charge("second", {
      orders: [{ order_number: ORDER, items: [{ title: "Soap", quantity: 1 }] }],
    }),
  ];
  const linked = linkGiftCardOrders(report.activities, payments, {
    transactions: [
      transaction("first-bank", { notes: ORDER }),
      transaction("second-bank", { notes: ORDER }),
    ],
  });
  assert.deepEqual(linked, [
    {
      order_number: ORDER,
      payment_evidence_candidates: ["first", "second"],
      ledger_note_candidates: ["first-bank", "second-bank"],
    },
  ]);
});
void test("split allocations and transfers cannot become independent payment candidates from their notes", () => {
  const report = reviewGiftCardHistory(statement(), inventory);
  const linked = linkGiftCardOrders(report.activities, [], {
    transactions: [
      transaction("parent", { notes: ORDER, excluded: true }),
      transaction("child", { notes: ORDER, parent_entry_id: "parent-entry" }),
      transaction("transfer", { notes: ORDER, transfer: { id: "transfer" } }),
      transaction("unrelated", { notes: "No order reference" }),
    ],
  });
  assert.deepEqual(linked[0]!.ledger_note_candidates, ["parent"]);
});

for (const scenario of [
  { kind: "reload", description: `Gift Card Balance added from Reload ${ORDER}`, order: ORDER },
  {
    kind: "auto_reload",
    description: `Gift Card Balance added from Auto-Reload ${ORDER}`,
    order: ORDER,
  },
  { kind: "allowance", description: "Allowance added", order: undefined },
  { kind: "cash_load", description: "Amazon Cash load", order: undefined },
] as const) {
  void test(`${scenario.kind} preserves funding provenance and rejects an expense direction`, () => {
    const document = statement();
    document.pages[0]!.balance = "$10.00";
    document.pages[0]!.rows = [row(scenario.description, "$10.00", "$10.00")];
    const report = reviewGiftCardHistory(document, inventory);
    assert.equal(report.activities[0]!.kind, scenario.kind);
    assert.equal(report.activities[0]!.order_number, scenario.order);
    assert.equal(report.totals[scenario.kind].amount_minor, 1000);
    assert.equal(report.totals.unknown.count, 0);
    assert.match(report.review_required[0]!.reason, /source|payer/u);
    assert.deepEqual(report.review_required[0]!.tag_names, ["follow-up"]);
    assert.equal(report.review_required[0]!.funding_status, undefined);
    assert.equal(report.review_required[0]!.category_id, null);
    document.pages[0]!.rows[0]!.amount = "-$10.00";
    assert.throws(() => reviewGiftCardHistory(document, inventory), /direction conflicts/u);
  });
}

void test("funding-uncertain additions instruct only ai-follow-up with no inferred category", () => {
  const report = reviewGiftCardHistory(statement(), inventory);
  const addition = report.activities[0]!;
  assert.deepEqual(report.review_required[0], {
    import_id: addition.import_id,
    category_id: null,
    tag_names: ["ai-follow-up"],
    funding_status: "unconfirmed",
    reason:
      "Identify funding: own-account transfer, received gift, reward, or another source; do not infer income.",
  });
  for (const instruction of report.review_required.slice(1)) {
    assert.deepEqual(instruction.tag_names, ["follow-up"]);
    assert.equal(instruction.category_id, null);
    assert.equal(instruction.funding_status, undefined);
  }
});

void test("exact replay and same-day append preserve the complete historical identity prefix", () => {
  const document = statement();
  const previous = reviewGiftCardHistory(document, inventory);
  assert.doesNotThrow(() => {
    validateGiftCardHistoryPrefix(previous, previous);
  });
  document.pages[0]!.rows.unshift(row("Gift Card added", "$10.00", "$10.00"));
  document.pages[0]!.balance = "$10.00";
  const next = reviewGiftCardHistory(document, inventory);
  assert.doesNotThrow(() => {
    validateGiftCardHistoryPrefix(previous, next);
  });
  assert.deepEqual(next.activities.slice(0, previous.activities.length), previous.activities);
  assert.equal(next.identity.root_hash, previous.identity.root_hash);
  assert.notEqual(next.identity.head_hash, previous.identity.head_hash);
  // Capture pagination/provenance is not part of a local import identity.
  const repaged = structuredClone(document);
  const oldestRows = repaged.pages[0]!.rows.splice(3);
  repaged.pages[0]!.has_next = true;
  repaged.pages.push({
    ...repaged.pages[0]!,
    has_next: false,
    has_previous: true,
    rows: oldestRows,
  });
  const paginated = reviewGiftCardHistory(repaged, inventory);
  assert.deepEqual(
    paginated.activities.map((activity) => activity.import_id),
    next.activities.map((activity) => activity.import_id),
  );
  assert.doesNotThrow(() => {
    validateGiftCardHistoryPrefix(next, paginated);
  });
});

void test("history guards reject changed historical rows, removed suffixes, and changed roots", () => {
  const previous = reviewGiftCardHistory(statement(), inventory);
  const changed = statement();
  changed.pages[0]!.rows[1]!.description = "Refund from Amazon.com order";
  assert.throws(() => {
    validateGiftCardHistoryPrefix(previous, reviewGiftCardHistory(changed, inventory));
  }, /historical source changed/u);
  const truncated = statement();
  truncated.pages[0]!.rows.shift();
  truncated.pages[0]!.balance = "$35.00";
  assert.throws(() => {
    validateGiftCardHistoryPrefix(previous, reviewGiftCardHistory(truncated, inventory));
  }, /truncated/u);
  const crossRoot = statement();
  crossRoot.pages[0]!.rows.pop();
  assert.throws(() => {
    validateGiftCardHistoryPrefix(previous, reviewGiftCardHistory(crossRoot, inventory));
  }, /root or scheme changed/u);
  const changedOpening = statement();
  for (const activity of changedOpening.pages[0]!.rows) {
    const cents = usdMinor(activity.closing_balance) + 100;
    activity.closing_balance = `$${(cents / 100).toFixed(2)}`;
  }
  changedOpening.pages[0]!.balance = "$1.00";
  assert.throws(() => {
    validateGiftCardHistoryPrefix(previous, reviewGiftCardHistory(changedOpening, inventory));
  }, /root or scheme changed/u);
  const changedOldestDate = statement();
  changedOldestDate.pages[0]!.rows.at(-1)!.date = "January 1, 2026";
  assert.throws(() => {
    validateGiftCardHistoryPrefix(previous, reviewGiftCardHistory(changedOldestDate, inventory));
  }, /root or scheme changed/u);
});

void test("journal prefix validation rejects forged heads and reordered same-day history", () => {
  const report = reviewGiftCardHistory(statement(), inventory);
  assert.throws(() => {
    validateGiftCardHistoryPrefix(
      { ...report, identity: { ...report.identity, head_hash: "0".repeat(64) } },
      report,
    );
  }, /chain head mismatch/u);
  const rewritten = {
    ...report,
    activities: report.activities.toReversed(),
  };
  assert.throws(() => {
    validateGiftCardHistoryPrefix(report, rewritten);
  }, /historical source changed/u);
});
