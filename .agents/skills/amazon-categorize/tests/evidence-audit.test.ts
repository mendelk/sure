import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  applyEvidencePlan,
  buildEvidencePlan,
  verifyEvidencePlan,
} from "../scripts/amazon-evidence-audit.ts";
import type {
  EvidenceBinding,
  EvidenceClient,
  EvidenceInventory,
  ReviewedEvidence,
} from "../scripts/amazon-evidence-audit.ts";
import type { Charge, Transaction } from "../scripts/amazon-categorize.ts";

const URL = "https://sure.example.test";
const ORDER = "111-2222222-3333333";
function transaction(id = "bank"): Transaction {
  return {
    id,
    entry_id: `entry-${id}`,
    date: "2026-10-02",
    amount_cents: 845,
    currency: "USD",
    classification: "expense",
    name: "Amazon",
    category: { id: "hobbies", name: "Hobbies" },
    tags: [
      { id: "ai", name: "ai-categorized" },
      { id: "other", name: "keep-me" },
    ],
    notes: "Payee: Amazon",
    pending: false,
    permissions: { can_annotate: true },
    account: { id: "card" },
    transfer: null,
  };
}
function charge(amount = 845): Charge {
  return {
    charge_id: "payment",
    kind: "charge",
    amount_minor: amount,
    currency: "USD",
    charged_on: "2026-10-01",
    source_url: `https://www.amazon.com/order?orderID=${ORDER}`,
    evidence: "Visible payment confirms own funded share and purchased items.",
    orders: [
      { order_number: ORDER, items: [{ title: "Model railway rail joiners", quantity: 2 }] },
    ],
  };
}
function inventory(rows: Transaction[], wallet: Transaction[] = []): EvidenceInventory {
  return {
    version: 1,
    base_url: URL,
    captured_at: "2026-10-26T00:00:00Z",
    ai_transactions: rows,
    wallet_transactions: wallet,
    tags: [],
  };
}
function evidence(
  bindings: EvidenceBinding[],
  wallet_transaction_ids: string[] = [],
): ReviewedEvidence {
  return { version: 1, bindings, wallet_transaction_ids };
}
class Ledger implements EvidenceClient {
  rows: Map<string, Transaction>;
  writes: { id: string; payload: unknown }[] = [];
  lostResponse = false;
  corruptReadBack = false;
  constructor(rows: Transaction[]) {
    this.rows = new Map(rows.map((row) => [row.id, structuredClone(row)]));
  }
  transaction(id: string): Promise<Transaction> {
    const row = this.rows.get(id);
    assert.ok(row, `Unexpected GET ${id}`);
    return Promise.resolve(structuredClone(row));
  }
  request(method: string, path: string, payload?: unknown): Promise<unknown> {
    assert.equal(method, "PATCH");
    const id = decodeURIComponent(path.slice("/api/v1/transactions/".length));
    assert.ok(typeof payload === "object" && payload !== null && "transaction" in payload);
    const body = payload;
    assert.ok(
      typeof body.transaction === "object" &&
        body.transaction !== null &&
        "notes" in body.transaction,
    );
    assert.ok(typeof body.transaction.notes === "string");
    assert.deepEqual(Object.keys(body), ["transaction"]);
    assert.deepEqual(Object.keys(body.transaction), ["notes"]);
    const row = this.rows.get(id)!;
    assert.equal(row.parent_entry_id ?? "", "", "Child PATCH forbidden");
    this.writes.push({ id, payload: structuredClone(payload) });
    row.notes = body.transaction.notes;
    row.updated_at = "2026-10-26T12:00:00Z";
    row.user_modified = true;
    if (this.corruptReadBack) row.category = null;
    if (this.lostResponse) {
      this.lostResponse = false;
      return Promise.reject(new Error("Unknown write outcome"));
    }
    // Not a transaction: independent detail GET must verify it.
    return Promise.resolve({ accepted: true });
  }
}
async function journalRun(fn: (journal: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "sure-evidence-test-"));
  try {
    await fn(join(directory, "journal.json"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

void test("categorized missing evidence repaired notes-only with all category/tags and personal bytes preserved", async () => {
  const row = transaction();
  row.notes = "  Personal\r\nPayee: Amazon  ";
  const plan = buildEvidencePlan(
    inventory([row]),
    evidence([{ transaction_id: row.id, charge: charge() }]),
  );
  assert.equal(plan.coverage[0]!.status, "repair");
  assert.ok(plan.operations[0]!.patch.notes.startsWith(row.notes + "\n\n[AI Amazon]\n"));
  assert.match(plan.operations[0]!.patch.notes, /2 × Model railway rail joiners/u);
  const ledger = new Ledger([row]);
  await journalRun(async (journal) => {
    const result = await applyEvidencePlan(plan, {
      url: URL,
      client: ledger,
      journal,
      commit: true,
    });
    assert.equal(result.repaired, 1);
    assert.deepEqual(ledger.rows.get(row.id)!.category, row.category);
    assert.deepEqual(ledger.rows.get(row.id)!.tags, row.tags);
    assert.equal((await verifyEvidencePlan(plan, { url: URL, client: ledger })).already_applied, 1);
    assert.equal(
      (await applyEvidencePlan(plan, { url: URL, client: ledger, journal, commit: true }))
        .already_applied,
      1,
    );
    assert.equal(ledger.writes.length, 1);
  });
});

void test("known balanced blocks replace without deleting similarly worded personal text", () => {
  const row = transaction();
  row.notes =
    "My AI Amazon order notes stay.\n\n[AI Amazon]\nOrder number: unknown. Items: unknown.\n[/AI Amazon]";
  const plan = buildEvidencePlan(
    inventory([row]),
    evidence([{ transaction_id: row.id, charge: charge() }]),
  );
  assert.ok(
    plan.operations[0]!.patch.notes.startsWith("My AI Amazon order notes stay.\n\n[AI Amazon]"),
  );
  assert.equal(plan.operations[0]!.patch.notes.match(/\[AI Amazon\]/gu)?.length, 1);
  row.notes = "[AI Amazon]\nnot closed";
  assert.equal(
    buildEvidencePlan(inventory([row]), evidence([{ transaction_id: row.id, charge: charge() }]))
      .coverage[0]!.status,
    "unresolved",
  );
});

void test("tampered operations, wrong origin and stale protected fields stop before every write", async () => {
  const a = transaction("a");
  const b = transaction("b");
  const plan = buildEvidencePlan(
    inventory([a, b]),
    evidence([
      { transaction_id: "a", charge: charge() },
      { transaction_id: "b", charge: { ...charge(), charge_id: "other-payment" } },
    ]),
  );
  const ledger = new Ledger([a, b]);
  const tampered = structuredClone(plan);
  tampered.operations[0]!.patch.notes += "tampered";
  await assert.rejects(applyEvidencePlan(tampered, { url: URL, client: ledger }), /tampered/u);
  await assert.rejects(
    applyEvidencePlan(plan, { url: "https://wrong.example", client: ledger }),
    /origin/u,
  );
  ledger.rows.get("b")!.tags = [];
  await journalRun(async (journal) => {
    await assert.rejects(
      applyEvidencePlan(plan, { url: URL, client: ledger, journal, commit: true }),
      /protected/u,
    );
    assert.equal(ledger.writes.length, 0);
  });
});

void test("lost PATCH response recovered by same journal without another PATCH", async () => {
  const row = transaction();
  const plan = buildEvidencePlan(
    inventory([row]),
    evidence([{ transaction_id: row.id, charge: charge() }]),
  );
  const ledger = new Ledger([row]);
  ledger.lostResponse = true;
  await journalRun(async (journal) => {
    await assert.rejects(
      applyEvidencePlan(plan, { url: URL, client: ledger, journal, commit: true }),
      /Unknown/u,
    );
    assert.equal(
      (await applyEvidencePlan(plan, { url: URL, client: ledger, journal })).already_applied,
      1,
    );
    assert.equal(
      (await applyEvidencePlan(plan, { url: URL, client: ledger, journal, commit: true }))
        .already_applied,
      1,
    );
    assert.equal(ledger.writes.length, 1);
  });
});

void test("read-back protects category even when PATCH reports success", async () => {
  const row = transaction();
  const ledger = new Ledger([row]);
  ledger.corruptReadBack = true;
  const plan = buildEvidencePlan(
    inventory([row]),
    evidence([{ transaction_id: row.id, charge: charge() }]),
  );
  await journalRun(async (journal) => {
    await assert.rejects(
      applyEvidencePlan(plan, { url: URL, client: ledger, journal, commit: true }),
      /protected/u,
    );
  });
});

void test("split children covered through full parent only; child fields and blank notes verified", async () => {
  const parent = transaction("parent");
  parent.category = null;
  assert.ok(typeof parent.entry_id === "string");
  const child = transaction("child");
  child.parent_entry_id = parent.entry_id;
  child.amount_cents = 845;
  child.notes = null;
  parent.split_children = [
    { transaction_id: child.id, entry_id: child.entry_id, category_id: child.category!.id },
  ];
  parent.notes =
    "Personal parent text\n\n[AI Amazon]\nOrder number: unknown. Items: unknown.\nSplit allocation:\nHobbies: USD 8.45\nShared adjustments allocated proportionally after item adjustments.\n[/AI Amazon]";
  const plan = buildEvidencePlan(
    inventory([child, parent]),
    evidence([{ transaction_id: parent.id, charge: charge() }]),
  );
  assert.equal(plan.coverage.find((row) => row.transaction_id === child.id)!.status, "parent");
  assert.deepEqual(
    plan.operations.map((row) => row.transaction_id),
    [parent.id],
  );
  assert.match(
    plan.operations[0]!.patch.notes,
    /Split allocation:\nHobbies: USD 8\.45\nShared adjustments allocated proportionally after item adjustments\./u,
  );
  assert.ok(plan.operations[0]!.patch.notes.startsWith("Personal parent text\n\n"));
  const ledger = new Ledger([child, parent]);
  await journalRun(async (journal) => {
    await applyEvidencePlan(plan, { url: URL, client: ledger, journal, commit: true });
    assert.deepEqual(
      ledger.writes.map((write) => write.id),
      [parent.id],
    );
    assert.equal(ledger.rows.get(child.id)!.notes, null);
    ledger.rows.get(child.id)!.amount_cents++;
    await assert.rejects(verifyEvidencePlan(plan, { url: URL, client: ledger }), /protected/u);
  });
  child.notes = "unexpected child prose";
  assert.ok(
    buildEvidencePlan(
      inventory([child, parent]),
      evidence([{ transaction_id: parent.id, charge: charge() }]),
    ).coverage.every((row) => row.status === "unresolved"),
  );
});

void test("wallet exact order/date and own share distinct from card share, legacy inline migration only", async () => {
  const bank = transaction();
  const wallet = transaction("wallet");
  wallet.tags = [{ id: "follow", name: "follow-up" }];
  wallet.category = null;
  wallet.date = "2026-10-01";
  wallet.amount_cents = 21;
  wallet.source = "amazon-gift-card";
  wallet.notes = `[AI Amazon] Order number: ${ORDER}. Items: unknown.`;
  const funding = {
    card_minor: 845,
    wallet_minor: 21,
    total_minor: 866,
    evidence: "Invoice explicitly separates both funding shares.",
    source_url: charge().source_url,
  };
  const reviewed = evidence(
    [
      { transaction_id: bank.id, charge: charge(), funding },
      { transaction_id: wallet.id, charge: charge(21), funding },
    ],
    [wallet.id],
  );
  const plan = buildEvidencePlan(inventory([bank], [wallet]), reviewed);
  assert.equal(plan.operations.length, 2);
  assert.match(plan.operations[1]!.patch.notes, /USD 0\.21/u);
  const ledger = new Ledger([bank, wallet]);
  await journalRun(async (journal) => {
    await applyEvidencePlan(plan, { url: URL, client: ledger, journal, commit: true });
  });
  assert.deepEqual(ledger.rows.get(wallet.id)!.tags, wallet.tags);
  reviewed.bindings[1]!.charge.amount_minor = 866;
  assert.equal(
    buildEvidencePlan(inventory([bank], [wallet]), reviewed).coverage.find(
      (row) => row.transaction_id === wallet.id,
    )!.status,
    "unresolved",
  );
  reviewed.bindings[1]!.charge.amount_minor = 21;
  wallet.notes = "[AI Amazon] Order number: 222-2222222-2222222. Items: unknown.";
  assert.equal(
    buildEvidencePlan(inventory([bank], [wallet]), reviewed).coverage.find(
      (row) => row.transaction_id === wallet.id,
    )!.status,
    "unresolved",
  );
});

void test("missing or ambiguous evidence never fabricates items or silently drops requested rows", () => {
  const a = transaction("a");
  const b = transaction("b");
  const noEvidence = buildEvidencePlan(inventory([a, b]), evidence([]));
  assert.equal(noEvidence.coverage.length, 2);
  assert.equal(noEvidence.operations.length, 0);
  assert.ok(noEvidence.coverage.every((row) => row.status === "unresolved"));
  assert.throws(
    () =>
      buildEvidencePlan(
        inventory([a]),
        evidence([
          { transaction_id: "a", charge: charge() },
          { transaction_id: "a", charge: charge() },
        ]),
      ),
    /ambiguous/u,
  );
  const invalid = charge();
  invalid.orders[0]!.items[0]!.title = "unknown";
  assert.equal(
    buildEvidencePlan(inventory([a]), evidence([{ transaction_id: "a", charge: invalid }]))
      .coverage[0]!.status,
    "unresolved",
  );
});

void test("pending/permission gaps unresolved; annotatable transfer identity preserved without match endpoints", async () => {
  const row = transaction();
  row.transfer = { id: "transfer", status: "pending", other_transaction_id: "counterpart" };
  const reviewed = evidence([{ transaction_id: row.id, charge: charge() }]);
  row.permissions = { can_annotate: false };
  assert.equal(buildEvidencePlan(inventory([row]), reviewed).operations.length, 0);
  row.permissions.can_annotate = true;
  row.pending = true;
  assert.equal(buildEvidencePlan(inventory([row]), reviewed).operations.length, 0);
  row.pending = false;
  const plan = buildEvidencePlan(inventory([row]), reviewed);
  const ledger = new Ledger([row]);
  await journalRun(async (journal) => {
    await applyEvidencePlan(plan, { url: URL, client: ledger, journal, commit: true });
  });
  assert.deepEqual(ledger.rows.get(row.id)!.transfer, row.transfer);
});

void test("unresolved records remain fully audited and wallet posting date cannot use bank lag", async () => {
  const unresolved = transaction("unresolved");
  const ledger = new Ledger([unresolved]);
  const plan = buildEvidencePlan(inventory([unresolved]), evidence([]));
  assert.equal((await applyEvidencePlan(plan, { url: URL, client: ledger })).unresolved.length, 1);
  ledger.rows.get(unresolved.id)!.category = null;
  await assert.rejects(applyEvidencePlan(plan, { url: URL, client: ledger }), /protected/u);
  assert.equal(ledger.writes.length, 0);
  const wallet = transaction("wallet");
  wallet.source = "amazon-gift-card";
  wallet.notes = `[AI Amazon] Order number: ${ORDER}. Items: unknown.`;
  const walletPlan = buildEvidencePlan(
    inventory([], [wallet]),
    evidence([{ transaction_id: wallet.id, charge: charge() }], [wallet.id]),
  );
  assert.equal(walletPlan.coverage[0]!.status, "unresolved");
  assert.match(walletPlan.coverage[0]!.reason, /date/u);
});

void test("detail-only display metadata is ignored but common financial and transfer identity is protected", async () => {
  const row = transaction();
  row.transfer = {
    id: "transfer",
    status: "pending",
    other_account: { id: "counterpart-account", name: "Old display name" },
  };
  const plan = buildEvidencePlan(
    inventory([row]),
    evidence([{ transaction_id: row.id, charge: charge() }]),
  );
  const ledger = new Ledger([row]);
  const detail = ledger.rows.get(row.id)!;
  detail.attachments = [];
  detail.split_children = [];
  detail.split_parent = null;
  detail.splittable = true;
  detail.split_annotation_support = true;
  detail.recurring_exists = false;
  detail.display_category = { name: "Hobbies", color: "#ffffff" };
  detail.updated_at = "2026-10-26T00:00:00Z";
  detail.transfer = {
    id: "transfer",
    status: "pending",
    other_account: { id: "counterpart-account", name: "New display name" },
  };
  assert.equal((await applyEvidencePlan(plan, { url: URL, client: ledger })).pending, 1);
  detail.transfer = {
    id: "transfer",
    status: "confirmed",
    other_account: { id: "counterpart-account" },
  };
  await assert.rejects(applyEvidencePlan(plan, { url: URL, client: ledger }), /protected/u);
});

void test("split allocation policy is never fabricated when original allocation evidence disagrees", () => {
  const parent = transaction("parent");
  parent.category = null;
  assert.ok(typeof parent.entry_id === "string");
  const child = transaction("child");
  child.parent_entry_id = parent.entry_id;
  child.notes = null;
  parent.split_children = [{ transaction_id: child.id, entry_id: child.entry_id }];
  parent.notes =
    "[AI Amazon]\nOld evidence\nSplit allocation:\nHobbies: USD 9.99\nShared adjustments allocated proportionally after item adjustments.\n[/AI Amazon]";
  const plan = buildEvidencePlan(
    inventory([parent, child]),
    evidence([{ transaction_id: parent.id, charge: charge() }]),
  );
  assert.equal(plan.operations.length, 0);
  assert.ok(plan.coverage.every((row) => row.status === "unresolved"));
  assert.match(plan.coverage[0]!.reason, /allocation amounts\/policy/u);
});

void test("a fresh audit cannot discard previously recorded funding evidence", () => {
  const row = transaction();
  const funding = {
    card_minor: 845,
    wallet_minor: 21,
    total_minor: 866,
    evidence: "Invoice separately confirms both funded shares.",
    source_url: charge().source_url,
  };
  const reviewed = evidence([{ transaction_id: row.id, charge: charge(), funding }]);
  const first = buildEvidencePlan(inventory([row]), reviewed);
  row.notes = first.operations[0]!.patch.notes;
  const incomplete = buildEvidencePlan(
    inventory([row]),
    evidence([{ transaction_id: row.id, charge: charge() }]),
  );
  assert.equal(incomplete.operations.length, 0);
  assert.equal(incomplete.coverage[0]!.status, "unresolved");
  assert.equal(buildEvidencePlan(inventory([row]), reviewed).coverage[0]!.status, "unchanged");
});

void test("funding context and conserved split allocations survive a repeated evidence audit", () => {
  const parent = transaction("funded-parent");
  parent.category = null;
  const first = transaction("first-child");
  const second = transaction("second-child");
  assert.ok(typeof parent.entry_id === "string");
  first.parent_entry_id = parent.entry_id;
  second.parent_entry_id = parent.entry_id;
  first.amount_cents = 400;
  second.amount_cents = 445;
  first.notes = null;
  second.notes = null;
  second.category = { id: "books", name: "Books" };
  parent.split_children = [
    { transaction_id: first.id, entry_id: first.entry_id },
    { transaction_id: second.id, entry_id: second.entry_id },
  ];
  parent.notes =
    "[AI Amazon]\nOld evidence\nSplit allocation:\nHobbies: USD 4.00\nBooks: USD 4.45\nShared adjustments allocated proportionally after item adjustments.\n[/AI Amazon]";
  const reviewed = evidence([
    {
      transaction_id: parent.id,
      charge: charge(),
      funding: {
        card_minor: 845,
        wallet_minor: 21,
        total_minor: 866,
        evidence: "Invoice funding shares.",
        source_url: charge().source_url,
      },
    },
  ]);
  const rows = inventory([parent, first, second]);
  const initial = buildEvidencePlan(rows, reviewed);
  assert.equal(initial.coverage[0]!.status, "repair");
  parent.notes = initial.operations[0]!.patch.notes;
  const replay = buildEvidencePlan(rows, reviewed);
  assert.equal(replay.coverage[0]!.status, "unchanged");
  assert.ok(replay.coverage.slice(1).every((row) => row.status === "parent"));
});
