import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  readPlan,
  readSnapshot,
  save,
  type Charge,
  type Operation,
  type Transaction,
} from "../scripts/amazon-categorize.ts";
import {
  CATEGORY,
  FOLLOW,
  OTHER,
  charge,
  createFixture,
  transaction,
  type Fixture,
} from "./fixtures.ts";

const HOME = { id: "household", name: "Household" };
const ORDER = "111-2222222-3333333";
const SECOND_ORDER = "222-3333333-4444444";
const PRIVATE = "Private audit detail must never be copied into ledger notes";
const AI = { id: "existing-ai", name: "AI-Categorized" };
type Adjustment = {
  kind: "discount" | "tax" | "shipping" | "gift_card";
  amount_minor: number;
  evidence: string;
};
type PricedCharge = Charge & {
  orders: {
    order_number: string;
    items: { title: string; quantity: number; amount_minor?: number; adjustments?: Adjustment[] }[];
  }[];
  allocation?: {
    policy: "proportional";
    source_url: string;
    evidence: string;
    adjustments: Adjustment[];
  };
};
type ItemCategory = { order_number: string; item_index: number; category_id: string };
type ReviewedDecision = {
  transaction_id: string;
  reason: string;
  category_id?: string;
  item_categories?: ItemCategory[];
};
const OPTIONS = { timeout: 30_000 };

function splitTransaction(changes: Partial<Transaction> = {}): Transaction {
  return transaction("mixed", {
    excluded: false,
    splittable: true,
    split_annotation_support: true,
    permissions: {
      can_annotate: true,
      can_edit: true,
    },
    amount_cents: 3000,
    ...changes,
  });
}
function payment(changes: Partial<PricedCharge> = {}): PricedCharge {
  return {
    ...charge("mixed-payment"),
    amount_minor: 3000,
    charged_on: "2026-10-21",
    evidence: PRIVATE,
    orders: [
      {
        order_number: ORDER,
        items: [
          { title: "USB-C cables", quantity: 2, amount_minor: 1000 },
          { title: "Tea bags", quantity: 1, amount_minor: 2000 },
        ],
      },
    ],
    ...changes,
  };
}
function decision(
  items: ItemCategory[] = [
    { order_number: ORDER, item_index: 0, category_id: CATEGORY.id },
    { order_number: ORDER, item_index: 1, category_id: HOME.id },
  ],
): ReviewedDecision {
  return { transaction_id: "mixed", reason: PRIVATE, item_categories: items };
}
async function setup(changes: Partial<Transaction> = {}): Promise<Fixture> {
  const fixture = await createFixture({ splits: true });
  for (const identifier of Object.keys(fixture.rows)) delete fixture.rows[identifier];
  fixture.rows.mixed = splitTransaction(changes);
  fixture.categories.push(HOME);
  return fixture;
}
async function plan(
  fixture: Fixture,
  payments = [payment()],
  decisions = [decision()],
  succeeds = true,
) {
  await save(join(fixture.root, "charges.json"), { version: 1, charges: payments });
  await save(join(fixture.root, "decisions.json"), { decisions });
  return fixture.run(
    [
      "plan",
      "--snapshot",
      join(fixture.root, "snapshot.json"),
      "--charges",
      join(fixture.root, "charges.json"),
      "--decisions",
      join(fixture.root, "decisions.json"),
      "--out",
      join(fixture.root, "plan.json"),
    ],
    succeeds,
  );
}
async function prepare(fixture: Fixture, payments = [payment()], decisions = [decision()]) {
  await fixture.snapshot();
  return plan(fixture, payments, decisions);
}
function apply(fixture: Fixture, commit = true, succeeds = true) {
  return fixture.run(
    [
      "apply",
      "--plan",
      join(fixture.root, "plan.json"),
      ...(commit ? ["--commit", "--journal", join(fixture.root, "journal.json")] : []),
    ],
    succeeds,
  );
}
function children(fixture: Fixture) {
  return Object.values(fixture.rows).filter((row) => row.parent_entry_id === "entry-mixed");
}
function assertNoWrites(fixture: Fixture) {
  assert.deepEqual(fixture.requests, []);
  assert.deepEqual(fixture.patches, []);
  assert.deepEqual(fixture.splits, []);
  assert.deepEqual(children(fixture), []);
}
function protectedFields(row: Transaction) {
  return Object.fromEntries(
    [
      "amount_cents",
      "date",
      "currency",
      "account",
      "merchant",
      "classification",
      "name",
      "entry_id",
      "kind",
      "pending",
      "transfer",
    ].map((field) => [field, row[field]]),
  );
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function records(value: unknown): Record<string, unknown>[] {
  assert.ok(Array.isArray(value));
  const rows: unknown[] = value;
  assert.ok(rows.every((row): row is Record<string, unknown> => record(row)));
  return rows;
}
function balances(fixture: Fixture) {
  return Object.fromEntries(children(fixture).map((row) => [row.category!.id, row.amount_cents]));
}
async function document(path: string): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  assert.ok(record(value));
  return value;
}

void test(
  "split applies explicit adjustments before shared tax, discount, shipping and gift funding, atomically",
  OPTIONS,
  async () => {
    const originalNotes = "Personal note: keep receipts.\n";
    const fixture = await setup({
      amount_cents: 5000,
      tags: [FOLLOW],
      notes:
        originalNotes +
        "[amazon-categorize:mixed]\nEarlier unresolved evidence.\n[/amazon-categorize:mixed]",
    });
    try {
      const paid = payment({
        amount_minor: 5000,
        orders: [
          {
            order_number: ORDER,
            items: [
              {
                title: "USB-C cables",
                quantity: 2,
                amount_minor: 3000,
                adjustments: [
                  { kind: "discount", amount_minor: -300, evidence: "Cable promotion" },
                ],
              },
              {
                title: "Tea bags",
                quantity: 1,
                amount_minor: 2000,
                adjustments: [{ kind: "tax", amount_minor: 200, evidence: "Item tax" }],
              },
            ],
          },
          {
            order_number: SECOND_ORDER,
            items: [{ title: "USB hub", quantity: 1, amount_minor: 1100 }],
          },
        ],
        allocation: {
          policy: "proportional",
          source_url: "https://www.amazon.com/payment-detail",
          evidence: PRIVATE,
          adjustments: [
            { kind: "discount", amount_minor: -600, evidence: "Shared promotion" },
            { kind: "tax", amount_minor: 540, evidence: "Shared sales tax" },
            { kind: "shipping", amount_minor: 60, evidence: "Shared shipping" },
            { kind: "gift_card", amount_minor: -1000, evidence: "Gift-card funding" },
          ],
        },
      });
      const reviewed = decision([
        { order_number: ORDER, item_index: 0, category_id: CATEGORY.id },
        { order_number: ORDER, item_index: 1, category_id: HOME.id },
        { order_number: SECOND_ORDER, item_index: 0, category_id: CATEGORY.id },
      ]);
      await fixture.snapshot(["mixed"]);
      await plan(fixture, [paid], [reviewed]);
      const proposed = await readPlan(join(fixture.root, "plan.json"));
      assert.equal(proposed.operations.length, 1);
      assert.deepEqual(Object.keys(proposed.operations[0]!.patch), ["notes"]);
      const original = structuredClone(fixture.rows.mixed!);
      const preview = await apply(fixture, false);
      assert.equal(preview.split_parents, 1);
      assert.equal(preview.split_children, 2);
      assertNoWrites(fixture);
      assert.deepEqual(fixture.rows.mixed, original);
      const result = await apply(fixture);
      assert.equal(result.split_parents, 1);
      assert.equal(result.split_children, 2);
      assert.deepEqual(balances(fixture), { electronics: 3167, household: 1833 });
      assert.equal(
        children(fixture).reduce((sum, child) => sum + child.amount_cents, 0),
        5000,
      );
      const parent = fixture.rows.mixed;
      assert.deepEqual(protectedFields(parent), protectedFields(original));
      assert.equal(parent.excluded, true);
      assert.equal(parent.category, null);
      assert.deepEqual(parent.tags, [AI]);
      assert.ok(parent.notes!.startsWith(originalNotes));
      assert.equal(parent.notes!.includes("Earlier unresolved evidence."), false);
      assert.equal(parent.notes!.includes(PRIVATE), false);
      assert.match(parent.notes!, /split/iu);
      assert.match(parent.notes!, /50\.00/u);
      for (const order of paid.orders) {
        assert.ok(parent.notes!.includes(order.order_number));
        for (const item of order.items)
          assert.ok(parent.notes!.includes(`${item.quantity} × ${item.title}`));
      }
      assert.equal(parent.notes!.match(/^\[AI Amazon\]$/gmu)?.length, 1);
      assert.match(parent.notes!, /Electronics[^\n]*31\.67/u);
      assert.match(parent.notes!, /Household[^\n]*18\.33/u);
      assert.match(parent.notes!, /proportional/iu);
      for (const child of children(fixture)) {
        assert.equal(child.classification, "expense");
        assert.equal(child.currency, "USD");
        assert.equal(child.date, original.date);
        assert.deepEqual(child.account, original.account);
        assert.deepEqual(child.merchant, original.merchant);
        assert.equal(child.excluded, false);
        assert.equal(child.transfer, null);
        assert.deepEqual(child.tags, [AI]);
        assert.match(child.name!, /Amazon/u);
        assert.ok(child.name!.includes(child.category!.name));
        assert.equal(child.notes ?? "", "");
        assert.ok(
          fixture.reads.includes(child.id),
          "readback must fetch transaction IDs, not entry IDs",
        );
      }
      assert.equal(fixture.requests.length, 1);
      assert.equal(fixture.requests[0]!.method, "POST");
      assert.equal(fixture.requests[0]!.path, "/api/v1/transactions/mixed/split");
      assert.deepEqual(fixture.patches, []);
      const payload = fixture.splits[0]!.split;
      assert.deepEqual(Object.keys(payload).toSorted(), ["parent", "splits"]);
      assert.ok(record(payload.parent));
      assert.deepEqual(Object.keys(payload.parent).toSorted(), ["notes", "tag_ids"]);
      for (const row of records(payload.splits)) {
        assert.deepEqual(row.tag_ids, [AI.id]);
        assert.equal(row.transfer_account_id ?? null, null);
        assert.notEqual(row.excluded, true);
      }
      const journal = await document(join(fixture.root, "journal.json"));
      const results = records(journal.results);
      assert.equal(results.length, 1);
      assert.deepEqual(
        results[0]!.split_child_ids,
        children(fixture).map((child) => child.id),
      );
      const repeated = await apply(fixture);
      assert.equal(repeated.applied, 0);
      assert.equal(repeated.already_applied, 1);
      assert.equal(fixture.splits.length, 1);
      assert.equal(children(fixture).length, 2);
    } finally {
      await fixture.close();
    }
  },
);

for (const currency of ["USD", "JPY", "KWD"]) {
  for (const kind of ["charge", "refund"] as const) {
    void test(
      `${currency} ${kind} preserves precision, cash-flow sign and deterministic largest remainder`,
      OPTIONS,
      async () => {
        const fixture = await setup({
          amount_cents: 1001,
          currency,
          classification: kind === "charge" ? "expense" : "income",
        });
        try {
          const paid = payment({
            amount_minor: 1001,
            currency,
            kind,
            orders: [
              {
                order_number: ORDER,
                items: [
                  { title: "Cable A", quantity: 1, amount_minor: 400 },
                  { title: "Tea", quantity: 1, amount_minor: 400 },
                  { title: "Cable B", quantity: 1, amount_minor: 400 },
                ],
              },
            ],
            allocation: {
              policy: "proportional",
              source_url: "https://www.amazon.com/payment",
              evidence: "Shared gift-card funding",
              adjustments: [
                { kind: "gift_card", amount_minor: -199, evidence: "Gift-card part of payment" },
              ],
            },
          });
          await prepare(
            fixture,
            [paid],
            [
              decision([
                { order_number: ORDER, item_index: 0, category_id: CATEGORY.id },
                { order_number: ORDER, item_index: 1, category_id: HOME.id },
                { order_number: ORDER, item_index: 2, category_id: CATEGORY.id },
              ]),
            ],
          );
          await apply(fixture);
          // 1001 / 3 gives 333 remainder 2: first two original lines receive the minor units.
          assert.deepEqual(balances(fixture), { electronics: 667, household: 334 });
          const sign = kind === "charge" ? "-" : "";
          const amounts =
            currency === "JPY"
              ? ["667", "334"]
              : currency === "KWD"
                ? ["0.667", "0.334"]
                : ["6.67", "3.34"];
          const submitted = records(fixture.splits[0]!.split.splits);
          assert.deepEqual(
            submitted.map((row) => row.amount),
            amounts.map((amount) => sign + amount),
          );
          for (const child of children(fixture)) {
            assert.equal(child.classification, kind === "charge" ? "expense" : "income");
            assert.equal(child.currency, currency);
            assert.equal(child.amount_cents > 0, true);
          }
          assert.equal(
            children(fixture).reduce((sum, child) => sum + child.amount_cents, 0),
            1001,
          );
        } finally {
          await fixture.close();
        }
      },
    );
  }
}

void test(
  "one reviewed category uses normal annotation without inventing a split or requiring prices",
  OPTIONS,
  async () => {
    const fixture = await setup();
    try {
      const paid = payment();
      for (const item of paid.orders[0]!.items) delete item.amount_minor;
      await prepare(
        fixture,
        [paid],
        [
          decision([
            { order_number: ORDER, item_index: 0, category_id: CATEGORY.id },
            { order_number: ORDER, item_index: 1, category_id: CATEGORY.id },
          ]),
        ],
      );
      await apply(fixture);
      assert.deepEqual(fixture.splits, []);
      assert.equal(fixture.patches.length, 1);
      assert.deepEqual(fixture.rows.mixed!.category, CATEGORY);
      assert.deepEqual(fixture.rows.mixed!.tags, [AI]);
      assert.equal(fixture.rows.mixed!.excluded, false);
    } finally {
      await fixture.close();
    }
  },
);

const invalidAssignments: { name: string; change: (reviewed: ReviewedDecision) => void }[] = [
  {
    name: "missing line",
    change: (reviewed) => {
      reviewed.item_categories!.pop();
    },
  },
  {
    name: "duplicate line",
    change: (reviewed) => {
      reviewed.item_categories!.push({ ...reviewed.item_categories![0]! });
    },
  },
  {
    name: "foreign order",
    change: (reviewed) => {
      reviewed.item_categories![0]!.order_number = SECOND_ORDER;
    },
  },
  {
    name: "out-of-range item",
    change: (reviewed) => {
      reviewed.item_categories![0]!.item_index = 2;
    },
  },
  {
    name: "unknown category",
    change: (reviewed) => {
      reviewed.item_categories![0]!.category_id = "does-not-exist";
    },
  },
  {
    name: "both category forms",
    change: (reviewed) => {
      reviewed.category_id = CATEGORY.id;
    },
  },
];
for (const scenario of invalidAssignments) {
  void test(`rejects item category coverage: ${scenario.name}`, OPTIONS, async () => {
    const fixture = await setup();
    try {
      await fixture.snapshot();
      const reviewed = decision();
      scenario.change(reviewed);
      const result = await plan(fixture, [payment()], [reviewed], false);
      assert.match(String(result.error), /category|categor|item|order|decision|coverage/iu);
      assertNoWrites(fixture);
    } finally {
      await fixture.close();
    }
  });
}

const invalidMoney: { name: string; change: (paid: PricedCharge) => void }[] = [
  {
    name: "missing line costs",
    change: (paid) => {
      delete paid.orders[0]!.items[0]!.amount_minor;
    },
  },
  {
    name: "unreconciled line subtotal",
    change: (paid) => {
      paid.orders[0]!.items[0]!.amount_minor = 999;
    },
  },
  {
    name: "quantity is not a unit-price multiplier",
    change: (paid) => {
      paid.orders[0]!.items[0]!.amount_minor = 500;
    },
  },
  {
    name: "unsafe integer line cost",
    change: (paid) => {
      paid.orders[0]!.items[0]!.amount_minor = Number.MAX_SAFE_INTEGER + 1;
    },
  },
  {
    name: "unsafe subtotal sum",
    change: (paid) => {
      for (const item of paid.orders[0]!.items) item.amount_minor = Number.MAX_SAFE_INTEGER;
    },
  },
  {
    name: "fractional minor units",
    change: (paid) => {
      paid.orders[0]!.items[0]!.amount_minor = 999.5;
    },
  },
  {
    name: "nonpositive item net",
    change: (paid) => {
      paid.orders[0]!.items[0]!.adjustments = [
        { kind: "discount", amount_minor: -1000, evidence: "Full discount" },
      ];
    },
  },
  {
    name: "wrong discount sign",
    change: (paid) => {
      paid.orders[0]!.items[0]!.adjustments = [
        { kind: "discount", amount_minor: 100, evidence: "Wrong sign" },
      ];
    },
  },
  {
    name: "wrong tax sign",
    change: (paid) => {
      paid.orders[0]!.items[0]!.adjustments = [
        { kind: "tax", amount_minor: -100, evidence: "Wrong tax sign" },
      ];
    },
  },
  {
    name: "wrong shipping sign",
    change: (paid) => {
      paid.orders[0]!.items[0]!.adjustments = [
        { kind: "shipping", amount_minor: -100, evidence: "Wrong shipping sign" },
      ];
    },
  },
  {
    name: "missing adjustment evidence",
    change: (paid) => {
      paid.orders[0]!.items[0]!.adjustments = [{ kind: "tax", amount_minor: 10, evidence: "" }];
    },
  },
  {
    name: "wrong gift funding sign",
    change: (paid) => {
      paid.allocation = {
        policy: "proportional",
        source_url: "https://www.amazon.com/payment",
        evidence: "Funding",
        adjustments: [{ kind: "gift_card", amount_minor: 100, evidence: "Gift funding" }],
      };
    },
  },
  {
    name: "insecure allocation provenance",
    change: (paid) => {
      paid.allocation = {
        policy: "proportional",
        source_url: "http://www.amazon.com/payment",
        evidence: "Allocation",
        adjustments: [],
      };
    },
  },
  {
    name: "rounding creates a zero category",
    change: (paid) => {
      paid.amount_minor = 1;
      paid.allocation = {
        policy: "proportional",
        source_url: "https://www.amazon.com/payment",
        evidence: "Gift funding",
        adjustments: [{ kind: "gift_card", amount_minor: -2999, evidence: "Gift funding" }],
      };
    },
  },
];
for (const scenario of invalidMoney) {
  void test(`rejects invalid monetary evidence: ${scenario.name}`, OPTIONS, async () => {
    const fixture = await setup();
    try {
      const paid = payment();
      scenario.change(paid);
      fixture.rows.mixed!.amount_cents = paid.amount_minor;
      await fixture.snapshot();
      await plan(fixture, [paid], [decision()], false);
      assertNoWrites(fixture);
    } finally {
      await fixture.close();
    }
  });
}

void test(
  "ambiguous payment ownership cannot produce a reviewed split, and uncertainty remains follow-up",
  OPTIONS,
  async () => {
    const fixture = await setup();
    try {
      await fixture.snapshot();
      await plan(
        fixture,
        [payment(), payment({ charge_id: "other-payment" })],
        [decision()],
        false,
      );
      assertNoWrites(fixture);
      await plan(fixture, [payment()], []);
      await apply(fixture);
      assert.deepEqual(fixture.splits, []);
      assert.equal(fixture.rows.mixed!.category, null);
      assert.deepEqual(fixture.rows.mixed!.tags, [FOLLOW]);
      assert.equal(children(fixture).length, 0);
    } finally {
      await fixture.close();
    }
  },
);

for (const flag of ["split_annotation_support", "splittable", "can_edit"] as const) {
  void test(
    `requires explicit ${flag} before any tag or transaction write in a mixed batch`,
    OPTIONS,
    async () => {
      const fixture = await setup();
      try {
        const mixed = fixture.rows.mixed!;
        if (flag === "can_edit") mixed.permissions = { can_annotate: true };
        else delete mixed[flag];
        delete fixture.rows.mixed;
        fixture.rows.normal = transaction("normal", { amount_cents: 9900 });
        fixture.rows.mixed = mixed;
        fixture.tags.splice(
          fixture.tags.findIndex((tag) => tag.id === AI.id),
          1,
        );
        await prepare(
          fixture,
          [payment(), charge("normal-payment", { amount_minor: 9900 })],
          [
            { transaction_id: "normal", category_id: CATEGORY.id, reason: "Electronics" },
            decision(),
          ],
        );
        await apply(fixture, true, false);
        assertNoWrites(fixture);
        assert.equal(fixture.rows.normal.category, null);
        assert.equal(
          fixture.tags.some((tag) => tag.id === AI.id),
          false,
        );
      } finally {
        await fixture.close();
      }
    },
  );
}

const staleFields: { name: string; change: (row: Transaction) => void }[] = [
  {
    name: "notes",
    change: (row) => {
      row.notes = "Concurrent personal note";
    },
  },
  {
    name: "tags",
    change: (row) => {
      row.tags = [OTHER];
    },
  },
  {
    name: "amount",
    change: (row) => {
      row.amount_cents++;
    },
  },
  {
    name: "date",
    change: (row) => {
      row.date = "2026-10-24";
    },
  },
  {
    name: "merchant",
    change: (row) => {
      row.merchant = { id: "other", name: "Other" };
    },
  },
  {
    name: "pending",
    change: (row) => {
      row.pending = true;
    },
  },
  {
    name: "excluded",
    change: (row) => {
      row.excluded = true;
    },
  },
  {
    name: "annotation permission",
    change: (row) => {
      row.permissions = {
        can_annotate: false,
        can_edit: true,
      };
    },
  },
  {
    name: "write permission",
    change: (row) => {
      row.permissions = {
        can_annotate: true,
        can_edit: false,
      };
    },
  },
  {
    name: "transfer",
    change: (row) => {
      row.transfer = { id: "transfer" };
    },
  },
];
for (const scenario of staleFields) {
  void test(`stale ${scenario.name} stops split application without writes`, OPTIONS, async () => {
    const fixture = await setup();
    try {
      await prepare(fixture);
      scenario.change(fixture.rows.mixed!);
      const changed = structuredClone(fixture.rows);
      await apply(fixture, true, false);
      assertNoWrites(fixture);
      assert.deepEqual(fixture.rows, changed);
    } finally {
      await fixture.close();
    }
  });
}

void test("parent is checked again immediately before the financial POST", OPTIONS, async () => {
  const fixture = await setup();
  try {
    await prepare(fixture);
    let reads = 0;
    fixture.faults.beforeRead = (identifier) => {
      if (identifier === "mixed" && ++reads === 2)
        fixture.rows.mixed!.notes = "Changed after batch preflight";
    };
    await apply(fixture, true, false);
    assert.equal(reads >= 2, true);
    assertNoWrites(fixture);
    assert.equal(fixture.rows.mixed!.notes, "Changed after batch preflight");
  } finally {
    await fixture.close();
  }
});

const tampering: { name: string; change: (operation: Operation) => void }[] = [
  {
    name: "allocated amount",
    change: (operation) => {
      operation.split!.rows[0]!.amount_minor++;
    },
  },
  {
    name: "row category",
    change: (operation) => {
      operation.split!.rows[0]!.category_id = HOME.id;
    },
  },
  {
    name: "legacy child notes",
    change: (operation) => {
      Object.assign(operation.split!.rows[0]!, { notes: "Legacy duplicate evidence" });
    },
  },
  {
    name: "transfer child",
    change: (operation) => {
      Object.assign(operation.split!.rows[0]!, { transfer_account_id: "other-account" });
    },
  },
  {
    name: "excluded child",
    change: (operation) => {
      Object.assign(operation.split!.rows[0]!, { excluded: true });
    },
  },
  {
    name: "financial parent patch",
    change: (operation) => {
      Object.assign(operation.patch, { amount: "-30.00" });
    },
  },
  {
    name: "parent category patch",
    change: (operation) => {
      Object.assign(operation.patch, { category_id: CATEGORY.id });
    },
  },
  {
    name: "missing embedded assignment",
    change: (operation) => {
      operation.split!.item_categories.pop();
    },
  },
];
for (const scenario of tampering) {
  void test(`tampered plan rejects ${scenario.name} before writes`, OPTIONS, async () => {
    const fixture = await setup();
    try {
      await prepare(fixture);
      const planned = await readPlan(join(fixture.root, "plan.json"));
      scenario.change(planned.operations[0]!);
      await save(join(fixture.root, "plan.json"), planned);
      await apply(fixture, true, false);
      assertNoWrites(fixture);
    } finally {
      await fixture.close();
    }
  });
}

void test(
  "server-rejected split does not apply parent or child annotations piecemeal",
  OPTIONS,
  async () => {
    const fixture = await setup();
    try {
      await prepare(fixture);
      const original = structuredClone(fixture.rows);
      fixture.faults.rejectSplit = true;
      await apply(fixture, true, false);
      assert.deepEqual(fixture.rows, original);
      assert.deepEqual(fixture.patches, []);
      assert.equal(fixture.splits.length, 1);
      assert.equal(fixture.requests.length, 1);
      assert.deepEqual(children(fixture), []);
    } finally {
      await fixture.close();
    }
  },
);

const readbackChanges: {
  name: string;
  change: (parent: Transaction, children: Transaction[]) => void;
}[] = [
  {
    name: "child amount",
    change: (_parent, rows) => {
      rows[0]!.amount_cents++;
    },
  },
  {
    name: "child currency",
    change: (_parent, rows) => {
      rows[0]!.currency = "JPY";
    },
  },
  {
    name: "child classification",
    change: (_parent, rows) => {
      rows[0]!.classification = "income";
    },
  },
  {
    name: "child account",
    change: (_parent, rows) => {
      rows[0]!.account = { id: "foreign" };
    },
  },
  {
    name: "child merchant",
    change: (_parent, rows) => {
      rows[0]!.merchant = { id: "foreign" };
    },
  },
  {
    name: "child date",
    change: (_parent, rows) => {
      rows[0]!.date = "2026-10-24";
    },
  },
  {
    name: "child parent linkage",
    change: (_parent, rows) => {
      rows[0]!.parent_entry_id = "foreign-entry";
    },
  },
  {
    name: "child parent detail",
    change: (_parent, rows) => {
      rows[0]!.split_parent = { entry_id: "foreign-entry", transaction_id: "foreign-parent" };
    },
  },
  {
    name: "child category",
    change: (_parent, rows) => {
      rows[0]!.category = HOME;
    },
  },
  {
    name: "unexpected child note",
    change: (_parent, rows) => {
      rows[0]!.notes = "Unexpected duplicate evidence";
    },
  },
  {
    name: "child provenance tag",
    change: (_parent, rows) => {
      rows[0]!.tags = [];
    },
  },
  {
    name: "excluded child",
    change: (_parent, rows) => {
      rows[0]!.excluded = true;
    },
  },
  {
    name: "transfer child",
    change: (_parent, rows) => {
      rows[0]!.transfer = { id: "foreign-transfer" };
    },
  },
  {
    name: "child name",
    change: (_parent, rows) => {
      rows[0]!.name = "Unexpected child";
    },
  },
  {
    name: "extra child",
    change: (parent, rows) => {
      parent.split_children!.push({ transaction_id: rows[0]!.id, entry_id: rows[0]!.entry_id });
    },
  },
  {
    name: "missing child transaction ID",
    change: (parent) => {
      const summary = parent.split_children![0];
      assert.ok(summary !== null && typeof summary === "object" && "transaction_id" in summary);
      Reflect.deleteProperty(summary, "transaction_id");
    },
  },
  {
    name: "parent amount",
    change: (parent) => {
      parent.amount_cents++;
    },
  },
  {
    name: "parent original user notes",
    change: (parent) => {
      parent.notes = parent.notes!.replace("User note.", "");
    },
  },
  {
    name: "parent provenance tag",
    change: (parent) => {
      parent.tags = [];
    },
  },
];
for (const scenario of readbackChanges) {
  void test(
    `readback rejects ${scenario.name} and never retries or replaces a committed split`,
    OPTIONS,
    async () => {
      const fixture = await setup();
      try {
        await prepare(fixture);
        fixture.faults.afterSplit = scenario.change;
        await apply(fixture, true, false);
        assert.equal(fixture.splits.length, 1);
        assert.deepEqual(fixture.patches, []);
        await apply(fixture, true, false);
        assert.equal(fixture.splits.length, 1);
        assert.equal(fixture.requests.length, 1);
        assert.equal(Object.keys(fixture.rows).length, 3);
      } finally {
        await fixture.close();
      }
    },
  );
}

for (const loseJournal of [false, true]) {
  void test(
    `lost POST response reconciles existing children ${loseJournal ? "without" : "with an interrupted"} journal and creates no duplicate`,
    OPTIONS,
    async () => {
      const fixture = await setup();
      try {
        await prepare(fixture);
        fixture.faults.loseSplitResponse = true;
        await apply(fixture, true, false);
        assert.equal(fixture.splits.length, 1);
        assert.deepEqual(balances(fixture), { electronics: 1000, household: 2000 });
        if (loseJournal) await rm(join(fixture.root, "journal.json"), { force: true });
        else assert.deepEqual((await document(join(fixture.root, "journal.json"))).results, []);
        const preview = await apply(fixture, false);
        assert.equal(preview.already_applied, 1);
        const recovered = await apply(fixture);
        assert.equal(recovered.applied, 0);
        assert.equal(recovered.already_applied, 1);
        assert.equal(fixture.splits.length, 1);
        assert.equal(children(fixture).length, 2);
        assert.deepEqual(fixture.patches, []);
        const journal = await document(join(fixture.root, "journal.json"));
        const results = records(journal.results);
        assert.equal(results.length, 1);
        assert.deepEqual(
          results[0]!.split_child_ids,
          children(fixture).map((child) => child.id),
        );
      } finally {
        await fixture.close();
      }
    },
  );
}

void test(
  "capability deployment requires a refreshed snapshot instead of reusing a stale proposal",
  OPTIONS,
  async () => {
    const fixture = await setup();
    try {
      delete fixture.rows.mixed!.split_annotation_support;
      await prepare(fixture);
      await apply(fixture, true, false);
      assertNoWrites(fixture);
      fixture.rows.mixed!.split_annotation_support = true;
      await apply(fixture, true, false);
      assertNoWrites(fixture);
      await prepare(fixture);
      await apply(fixture);
      assert.deepEqual(balances(fixture), { electronics: 1000, household: 2000 });
      assert.equal(fixture.splits.length, 1);
    } finally {
      await fixture.close();
    }
  },
);

void test(
  "split creates provenance tag once and sends every annotation in the same financial request",
  OPTIONS,
  async () => {
    const fixture = await setup();
    try {
      fixture.tags.splice(
        fixture.tags.findIndex((tag) => tag.id === AI.id),
        1,
      );
      await prepare(fixture);
      const preview = await apply(fixture, false);
      assert.equal(preview.ready, 1);
      assertNoWrites(fixture);
      await apply(fixture);
      const created = fixture.tags.filter((tag) => tag.name.toLowerCase() === "ai-categorized");
      assert.equal(created.length, 1);
      assert.deepEqual(fixture.rows.mixed!.tags, created);
      for (const child of children(fixture)) assert.deepEqual(child.tags, created);
      assert.deepEqual(
        fixture.requests.map((request) => [request.method, request.path]),
        [
          ["POST", "/api/v1/tags"],
          ["POST", "/api/v1/transactions/mixed/split"],
        ],
      );
      assert.deepEqual(fixture.patches, []);
      await apply(fixture);
      assert.equal(fixture.requests.length, 2);
      assert.equal(fixture.splits.length, 1);
    } finally {
      await fixture.close();
    }
  },
);

void test(
  "removed live category invalidates split before creating a tag or financial child",
  OPTIONS,
  async () => {
    const fixture = await setup();
    try {
      fixture.tags.splice(
        fixture.tags.findIndex((tag) => tag.id === AI.id),
        1,
      );
      await prepare(fixture);
      fixture.categories.splice(
        fixture.categories.findIndex((category) => category.id === HOME.id),
        1,
      );
      await apply(fixture, true, false);
      assertNoWrites(fixture);
      assert.equal(
        fixture.tags.some((tag) => tag.name.toLowerCase() === "ai-categorized"),
        false,
      );
    } finally {
      await fixture.close();
    }
  },
);

void test(
  "snapshot recovers split parent headers and reserves full payments without reserving child allocations",
  OPTIONS,
  async () => {
    const fixture = await setup();
    try {
      await prepare(fixture);
      await apply(fixture);
      const originalSplit = structuredClone(fixture.rows.mixed!);
      fixture.rows["new-full-payment"] = transaction("new-full-payment", {
        amount_cents: 3000,
        date: "2026-10-24",
      });
      fixture.reads.length = 0;
      await fixture.snapshot();
      const snapshot = await readSnapshot(join(fixture.root, "snapshot.json"));
      assert.deepEqual(snapshot.target_ids, ["new-full-payment"]);
      const recovered = snapshot.transactions.find((row) => row.id === "mixed");
      assert.ok(recovered, "full parent must be fetched from split_parents.transaction_id");
      assert.equal(recovered.amount_cents, 3000);
      assert.equal(recovered.currency, "USD");
      assert.equal(recovered.classification, "expense");
      assert.ok(fixture.reads.includes("mixed"));
      await plan(
        fixture,
        [payment()],
        [
          {
            transaction_id: "new-full-payment",
            category_id: CATEGORY.id,
            reason: "Reviewed new purchase",
          },
        ],
        false,
      );

      fixture.rows["new-child-sized-payment"] = transaction("new-child-sized-payment", {
        amount_cents: 1000,
        date: "2026-10-23",
      });
      await fixture.snapshot();
      const later = payment({ charge_id: "later-payment", charged_on: "2026-10-24" });
      const childSized = charge("independent-small-payment", {
        amount_minor: 1000,
        charged_on: "2026-10-21",
      });
      const payments = [payment(), later, childSized];
      await save(join(fixture.root, "charges.json"), { version: 1, charges: payments });
      await fixture.run([
        "match",
        "--snapshot",
        join(fixture.root, "snapshot.json"),
        "--charges",
        join(fixture.root, "charges.json"),
        "--out",
        join(fixture.root, "matches.json"),
      ]);
      const matched = await document(join(fixture.root, "matches.json"));
      assert.deepEqual(
        Object.fromEntries(
          records(matched.matches).map((row) => [
            row.transaction_id,
            { status: row.status, charge_id: row.charge_id },
          ]),
        ),
        {
          "new-full-payment": { status: "unique", charge_id: "later-payment" },
          "new-child-sized-payment": { status: "unique", charge_id: "independent-small-payment" },
        },
      );
      await plan(fixture, payments, [
        {
          transaction_id: "new-full-payment",
          category_id: CATEGORY.id,
          reason: "Reviewed later payment",
        },
        {
          transaction_id: "new-child-sized-payment",
          category_id: CATEGORY.id,
          reason: "Independent purchase",
        },
      ]);
      const planned = await readPlan(join(fixture.root, "plan.json"));
      assert.equal(planned.operations.length, 2);
      assert.ok(planned.operations.every((operation) => operation.split === undefined));
      assert.deepEqual(fixture.rows.mixed, originalSplit);
      assert.equal(fixture.splits.length, 1);
      assert.equal(fixture.requests.length, 1);
      assert.equal(children(fixture).length, 2);
    } finally {
      await fixture.close();
    }
  },
);
