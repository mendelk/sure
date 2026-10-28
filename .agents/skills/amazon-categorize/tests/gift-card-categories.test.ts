/* oxlint-disable import/max-dependencies -- Actual CLI integration needs HTTP, process, private-file and evidence fixtures. */
/* oxlint-disable eslint/no-await-in-loop -- Each recovery scenario verifies ordered journal transitions. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  buildWalletCategoryPlan,
  applyWalletCategoryPlan,
  type WalletCategoryInventory,
} from "../scripts/amazon-gift-card-categories.ts";
import { digest, load, save, type Transaction } from "../scripts/amazon-categorize.ts";
import { financialWeights, walletPaymentRoots } from "../scripts/amazon-splits.ts";
import type { GiftCardActivity } from "../scripts/amazon-gift-card-review.ts";
import type { OrderCapture } from "../scripts/capture-order.ts";

interface SourceFixture {
  inventory: WalletCategoryInventory;
  transaction: Transaction;
  activity: GiftCardActivity;
  order: OrderCapture;
  decisions: { decisions: { transaction_id: string; category_id: string; reason: string }[] };
  mixed: {
    decisions: {
      transaction_id: string;
      item_categories: { order_number: string; item_index: number; category_id: string }[];
      reason: string;
    }[];
  };
}
interface HttpFixture {
  source: SourceFixture;
  rows: Map<string, Transaction>;
  requests: { method: string; path: string; body: unknown }[];
  directory: string;
  url: string;
  journal: string;
  setLost(): void;
  setCorrupt(): void;
  setMismatch(): void;
  close(): Promise<void>;
}

const orderNumber = "123-4567890-1234567";
function fixtures(base = "http://127.0.0.1:43210"): SourceFixture {
  const tags = [
    { id: "ai", name: "AI-Categorized" },
    { id: "follow", name: "follow-up" },
    { id: "personal", name: "personal" },
  ];
  const categories = [
    { id: "craft", name: "Craft supplies" },
    { id: "home", name: "Home supplies" },
  ];
  const transaction: Transaction = {
    id: "wallet-payment",
    entry_id: "root-entry",
    account: { id: "wallet-account" },
    source: "amazon-gift-card",
    external_id: "source-event",
    date: "2026-01-03",
    currency: "USD",
    amount_cents: 7,
    signed_amount_cents: -7,
    classification: "expense",
    name: "Gift Card applied",
    notes: "My personal note",
    tags: [tags[1]!, tags[2]!],
    category: null,
    pending: false,
    excluded: false,
    category_editable: true,
    splittable: true,
    split_annotation_support: true,
    permissions: { can_edit: true, can_annotate: true },
    parent_entry_id: null,
    split_parent: null,
    split_children: [],
    transfer: null,
    merchant: null,
  };
  const activity: GiftCardActivity = {
    import_id: "source-event",
    source_fingerprint: "fingerprint",
    date: transaction.date,
    kind: "redemption",
    order_number: orderNumber,
    amount_minor: -7,
    closing_balance_minor: 100,
    capture_page: 1,
  };
  const order: OrderCapture = {
    version: 1,
    order_number: orderNumber,
    source_url: `https://www.amazon.com/order?orderID=${orderNumber}`,
    captured_at: "2026-01-04T00:00:00Z",
    items: [
      { title: "Colored paper", quantity_text: "2", price_text: "$3.00" },
      { title: "Cleaning cloth", quantity_text: "1", price_text: "$4.00" },
    ],
    summary_rows: [
      { label: "Item(s) Subtotal:", value: "$10.00" },
      { label: "Shipping & Handling:", value: "$1.00" },
      { label: "Free Shipping:", value: "-$1.00" },
      { label: "Total before tax:", value: "$10.00" },
      { label: "Estimated tax to be collected:", value: "$1.00" },
      { label: "Gift Card Amount:", value: "-$0.07" },
      { label: "Grand Total:", value: "$10.93" },
    ],
  };
  const inventory: WalletCategoryInventory = {
    version: 1,
    base_url: base,
    captured_at: "2026-01-04T00:00:00Z",
    ai_transactions: [],
    wallet_transactions: [transaction],
    tags,
    categories,
  };
  const decisions = {
    decisions: [
      { transaction_id: transaction.id, category_id: "craft", reason: "Reviewed actual supplies" },
    ],
  };
  const mixed = {
    decisions: [
      {
        transaction_id: transaction.id,
        item_categories: [
          { order_number: orderNumber, item_index: 0, category_id: "craft" },
          { order_number: orderNumber, item_index: 1, category_id: "home" },
        ],
        reason: "Distinct actual item purposes",
      },
    ],
  };
  return { inventory, transaction, activity, order, decisions, mixed };
}
function plan(input = fixtures(), mixed = false) {
  return buildWalletCategoryPlan(
    input.inventory,
    { activities: [input.activity] },
    { orders: [input.order] },
    mixed ? input.mixed : input.decisions,
  );
}

void test("reviewed own wallet share derives annotations and removes only resolved follow-up", () => {
  const source = fixtures();
  const before = structuredClone(source);
  const result = plan(source);
  assert.deepEqual(source, before);
  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0]!.category_id, "craft");
  assert.deepEqual(result.operations[0]!.tag_ids, ["personal", "ai"]);
  assert.match(result.operations[0]!.notes, /^My personal note\n/u);
  assert.match(result.operations[0]!.notes, /Funding: card USD 10\.93 \+ gift card USD 0\.07/u);
  assert.equal(result.operations[0]!.before.amount_cents, 7);
});
void test("missing decisions retain complete unresolved coverage; existing categories are never overwritten", () => {
  const source = fixtures();
  const missing = buildWalletCategoryPlan(
    source.inventory,
    { activities: [source.activity] },
    { orders: [source.order] },
    { decisions: [] },
  );
  assert.equal(missing.coverage.length, 1);
  assert.equal(missing.operations.length, 0);
  assert.equal(missing.coverage[0]!.status, "unresolved");
  source.transaction.category = source.inventory.categories[1]!;
  assert.equal(plan(source).operations.length, 0);
  assert.match(plan(source).coverage[0]!.reason, /Existing classification/u);
  source.transaction.category = source.inventory.categories[0]!;
  source.transaction.tags = [source.inventory.tags[0]!, source.inventory.tags[2]!];
  assert.equal(plan(source).coverage[0]!.status, "already-applied");
  assert.equal(plan(source).operations.length, 0);
});
void test("funding, source/date/currency, duplicate categories and ambiguous item scope cannot authorize writes", () => {
  for (const mutate of [
    (f: SourceFixture) => {
      f.transaction.date = "2026-01-05";
    },
    (f: SourceFixture) => {
      f.transaction.source = "api";
    },
    (f: SourceFixture) => {
      f.transaction.currency = "EUR";
    },
    (f: SourceFixture) => {
      f.transaction.external_id = "wrong-event";
    },
    (f: SourceFixture) => {
      f.order.summary_rows[5]!.value = "-$0.08";
    },
    (f: SourceFixture) => {
      f.order.items[0]!.quantity_text = "";
      f.order.items[0]!.price_text = "$3.00 $6.00";
    },
    (f: SourceFixture) => {
      f.inventory.categories.push(f.inventory.categories[0]!);
    },
    (f: SourceFixture) => {
      f.inventory.tags.push({ id: "other-ai", name: "ai-categorized" });
    },
  ]) {
    const source = fixtures();
    mutate(source);
    assert.throws(() => plan(source));
  }
});
void test("pending, transfer and unavailable permissions remain explicit unresolved records", () => {
  for (const patch of [
    { pending: true },
    { transfer: { id: "pending-transfer" } },
    { category_editable: false },
    { excluded: true },
    { permissions: { can_annotate: false, can_edit: true } },
  ]) {
    const source = fixtures();
    Object.assign(source.transaction, patch);
    const result = plan(source);
    assert.equal(result.operations.length, 0);
    assert.equal(result.coverage[0]!.status, "unresolved");
  }
});
void test("mixed invoice pricing conserves full invoice but allocates only seven wallet cents", () => {
  const result = plan(fixtures(), true);
  const operation = result.operations[0]!;
  assert.deepEqual(
    operation.split!.rows.map((row) => row.amount_minor),
    [4, 3],
  );
  assert.equal(
    operation.split!.rows.reduce((sum, row) => sum + row.amount_minor, 0),
    7,
  );
  assert.equal(operation.split!.charge.amount_minor, 7);
  assert.throws(() => financialWeights(operation.split!.charge, true), /reconcile/u);
  assert.deepEqual(financialWeights(operation.split!.charge, true, 1100), [600n, 400n]);
  assert.ok(
    operation.split!.charge.allocation!.adjustments.every((row) => row.kind !== "gift_card"),
  );
  assert.match(operation.notes, /Split allocation:/u);
  assert.match(operation.notes, /Funding: card USD 10\.93 \+ gift card USD 0\.07/u);
  const broken = fixtures();
  broken.order.summary_rows[4]!.value = "$1.01";
  assert.throws(() => plan(broken, true), /reconcile/u);
  const incomplete = fixtures();
  incomplete.mixed.decisions[0]!.item_categories.pop();
  assert.throws(() => plan(incomplete, true), /item/u);
});

async function httpFixture(): Promise<HttpFixture> {
  const source = fixtures();
  const rows = new Map<string, Transaction>([
    [source.transaction.id, structuredClone(source.transaction)],
  ]);
  const requests: { method: string; path: string; body: unknown }[] = [];
  let loseWriteResponse = false;
  let corruptChild = false;
  let mismatchReadback = false;
  const server = createServer((request, response) => {
    const dispatch = async () => {
      let rawBody = "";
      for await (const chunk of request) rawBody += String(chunk);
      const payload: unknown = rawBody.length > 0 ? JSON.parse(rawBody) : null;
      const path = new URL(request.url!, "http://localhost").pathname;
      requests.push({ method: request.method!, path, body: payload });
      const send = (body: unknown) => {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(body));
      };
      if (path === "/api/v1/tags") {
        send(source.inventory.tags);
        return;
      }
      if (path === "/api/v1/categories") {
        send({ categories: source.inventory.categories, pagination: { page: 1, total_pages: 1 } });
        return;
      }
      if (path === "/api/v1/transactions") {
        const listed = [...rows.values()]
          .filter((item) => item.excluded !== true)
          .map((item) => {
            const summary = structuredClone(item);
            delete summary.splittable;
            delete summary.split_annotation_support;
            delete summary.split_parent;
            return summary;
          });
        send({
          transactions: listed,
          split_parents: [...rows.values()]
            .filter((item) => (item.split_children?.length ?? 0) > 0)
            .map((item) => ({ transaction_id: item.id })),
          pagination: { page: 1, total_pages: 1 },
        });
        return;
      }
      const id = path.split("/")[4]!;
      const row = rows.get(id);
      if (row === undefined) {
        response.statusCode = 404;
        send({ error: "missing" });
        return;
      }
      if (request.method === "GET") {
        send(row);
        return;
      }
      assert.ok(payload !== null && typeof payload === "object");
      if (request.method === "PATCH") {
        assert.ok("transaction" in payload);
        const patch = payload.transaction;
        assert.ok(patch !== null && typeof patch === "object");
        assert.deepEqual(
          Object.keys(patch).toSorted(),
          ("notes" in patch
            ? ["category_id", "notes", "tag_ids"]
            : ["category_id", "tag_ids"]
          ).toSorted(),
        );
        assert.ok("category_id" in patch && "tag_ids" in patch && Array.isArray(patch.tag_ids));
        row.category = source.inventory.categories.find((item) => item.id === patch.category_id)!;
        const tagIds = patch.tag_ids;
        row.tags = source.inventory.tags.filter((item) => tagIds.includes(item.id));
        if ("notes" in patch) {
          assert.equal(typeof patch.notes, "string");
          row.notes = String(patch.notes);
        }
        if (mismatchReadback) row.notes = "server mismatch";
      } else {
        assert.equal(request.method, "POST");
        assert.ok("split" in payload);
        const split = payload.split;
        assert.ok(
          split !== null &&
            typeof split === "object" &&
            "splits" in split &&
            Array.isArray(split.splits) &&
            "parent" in split,
        );
        const parent = split.parent;
        assert.ok(
          parent !== null &&
            typeof parent === "object" &&
            "notes" in parent &&
            "tag_ids" in parent &&
            Array.isArray(parent.tag_ids),
        );
        const tagIds = parent.tag_ids;
        row.notes = String(parent.notes);
        row.tags = source.inventory.tags.filter((item) => tagIds.includes(item.id));
        row.excluded = true;
        row.splittable = false;
        row.split_children = split.splits.map((child: unknown, index: number) => {
          assert.ok(
            child !== null &&
              typeof child === "object" &&
              "category_id" in child &&
              "amount" in child &&
              "name" in child &&
              "tag_ids" in child,
          );
          assert.deepEqual(child.tag_ids, ["ai"]);
          assert.ok(!("notes" in child));
          const childId = `allocation-${index}`;
          const entryId = `allocation-entry-${index}`;
          const amount = Math.round(Math.abs(Number(child.amount)) * 100);
          const allocation: Transaction = {
            ...structuredClone(source.transaction),
            id: childId,
            entry_id: entryId,
            source: null,
            external_id: null,
            parent_entry_id: "root-entry",
            split_parent: { entry_id: "root-entry", transaction_id: row.id },
            split_children: [],
            amount_cents: amount,
            signed_amount_cents: -amount,
            category: source.inventory.categories.find((item) => item.id === child.category_id)!,
            tags: [source.inventory.tags[0]!],
            notes: "",
            name: String(child.name),
            splittable: false,
          };
          if (corruptChild && index === 0) {
            allocation.amount_cents++;
            allocation.signed_amount_cents = -allocation.amount_cents;
          }
          rows.set(childId, allocation);
          return { transaction_id: childId, entry_id: entryId };
        });
      }
      if (loseWriteResponse) {
        loseWriteResponse = false;
        response.destroy();
        return;
      }
      send(row);
    };
    void dispatch().catch((error: unknown) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : "Fixture failure");
    });
  });
  const listening = Promise.withResolvers<null>();
  server.listen(0, "127.0.0.1", () => {
    listening.resolve(null);
  });
  await listening.promise;
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  source.inventory.base_url = `http://127.0.0.1:${address.port}`;
  const directory = await mkdtemp(join(tmpdir(), "wallet-category-test-"));
  return {
    source,
    rows,
    requests,
    directory,
    url: source.inventory.base_url,
    journal: join(directory, "journal.json"),
    setLost: () => {
      loseWriteResponse = true;
    },
    setCorrupt: () => {
      corruptChild = true;
    },
    setMismatch: () => {
      mismatchReadback = true;
    },
    close: async () => {
      const closed = Promise.withResolvers<null>();
      server.close(() => {
        closed.resolve(null);
      });
      await closed.promise;
      await rm(directory, { recursive: true, force: true });
    },
  };
}
async function cli(args: string[]): Promise<{ code: number | null; output: string }> {
  const child = spawn(
    process.execPath,
    [new URL("../scripts/amazon-gift-card-categories.ts", import.meta.url).pathname, ...args],
    { env: { ...process.env, SURE_API_KEY: "fixture-key" }, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  const closed = Promise.withResolvers<number | null>();
  child.once("error", closed.reject);
  child.once("close", closed.resolve);
  const code = await closed.promise;
  return { code, output };
}
async function savedPlan(fixture: HttpFixture, mixed = false): Promise<string> {
  const path = join(fixture.directory, "plan.json");
  await save(path, plan(fixture.source, mixed));
  return path;
}
void test("actual CLI plans, preflights, patches, independently reads, verifies and replays without writes", async () => {
  const fixture = await httpFixture();
  try {
    const inputs = {
      inventory: fixture.source.inventory,
      activities: { activities: [fixture.source.activity] },
      orders: { orders: [fixture.source.order] },
      decisions: fixture.source.decisions,
    };
    for (const [name, value] of Object.entries(inputs))
      await save(join(fixture.directory, `${name}.json`), value);
    const path = join(fixture.directory, "plan.json");
    const planned = await cli([
      "plan",
      ...Object.keys(inputs).flatMap((name) => [
        `--${name}`,
        join(fixture.directory, `${name}.json`),
      ]),
      "--out",
      path,
    ]);
    assert.equal(planned.code, 0, planned.output);
    const args = ["--plan", path, "--journal", fixture.journal, "--url", fixture.url];
    const dry = await cli(["apply", ...args]);
    assert.equal(dry.code, 0, dry.output);
    assert.equal(fixture.requests.filter((row) => row.method !== "GET").length, 0);
    const committed = await cli(["apply", ...args, "--commit"]);
    assert.equal(committed.code, 0, committed.output);
    assert.equal(fixture.requests.filter((row) => row.method === "PATCH").length, 1);
    assert.equal(fixture.requests.at(-1)!.method, "GET");
    const replay = await cli(["apply", ...args, "--commit"]);
    assert.equal(replay.code, 0, replay.output);
    assert.match(replay.output, /"already_applied":1/u);
    const verified = await cli(["verify", ...args]);
    assert.equal(verified.code, 0, verified.output);
    assert.equal(fixture.requests.filter((row) => row.method !== "GET").length, 1);
  } finally {
    await fixture.close();
  }
});
void test("origin, frozen annotations and stale ledger state fail before financial writes", async () => {
  const fixture = await httpFixture();
  try {
    const frozen = plan(fixture.source);
    const original = digest(frozen);
    await assert.rejects(
      applyWalletCategoryPlan(frozen, { url: "http://127.0.0.1:1", journal: fixture.journal }),
      /origin/u,
    );
    frozen.operations[0]!.notes += "tampered";
    await assert.rejects(
      applyWalletCategoryPlan(frozen, { url: fixture.url, journal: fixture.journal }),
      /Frozen/u,
    );
    assert.notEqual(digest(frozen), original);
    const path = await savedPlan(fixture);
    fixture.rows.get("wallet-payment")!.notes = "Concurrent personal note";
    const result = await cli([
      "apply",
      "--plan",
      path,
      "--journal",
      fixture.journal,
      "--url",
      fixture.url,
      "--commit",
    ]);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /stale/u);
    assert.equal(fixture.requests.filter((row) => row.method !== "GET").length, 0);
  } finally {
    await fixture.close();
  }
});
void test("lost write outcome requires dry-run on same journal and never duplicates successful PATCH", async () => {
  const fixture = await httpFixture();
  try {
    const path = await savedPlan(fixture);
    const args = ["--plan", path, "--journal", fixture.journal, "--url", fixture.url];
    fixture.setLost();
    assert.notEqual((await cli(["apply", ...args, "--commit"])).code, 0);
    const blocked = await cli(["apply", ...args, "--commit"]);
    assert.notEqual(blocked.code, 0);
    assert.match(blocked.output, /Unknown write outcome/u);
    const recovered = await cli(["apply", ...args]);
    assert.equal(recovered.code, 0, recovered.output);
    assert.equal((await cli(["apply", ...args, "--commit"])).code, 0);
    assert.equal(fixture.requests.filter((row) => row.method === "PATCH").length, 1);
  } finally {
    await fixture.close();
  }
});
void test("atomic split verifies every child, retains parent-only funding and accepts conserved original roots", async () => {
  const fixture = await httpFixture();
  try {
    const decisionsPath = join(fixture.directory, "decisions.json");
    const inventoryPath = join(fixture.directory, "snapshot.json");
    await save(decisionsPath, fixture.source.mixed);
    const snapshot = await cli([
      "snapshot",
      "--decisions",
      decisionsPath,
      "--wallet-account-id",
      "wallet-account",
      "--out",
      inventoryPath,
      "--url",
      fixture.url,
    ]);
    assert.equal(snapshot.code, 0, snapshot.output);
    const path = join(fixture.directory, "plan.json");
    const inventory: unknown = await load(inventoryPath);
    const reviewed = buildWalletCategoryPlan(
      inventory,
      { activities: [fixture.source.activity] },
      { orders: [fixture.source.order] },
      fixture.source.mixed,
    );
    assert.equal(reviewed.coverage[0]!.status, "split");
    await save(path, reviewed);
    const args = ["--plan", path, "--journal", fixture.journal, "--url", fixture.url];
    const applied = await cli(["apply", ...args, "--commit"]);
    assert.equal(applied.code, 0, applied.output);
    assert.match(applied.output, /"split_children":2/u);
    assert.equal(fixture.requests.filter((row) => row.method === "POST").length, 1);
    assert.equal(walletPaymentRoots([...fixture.rows.values()], "wallet-account").length, 1);
    const valid = [...fixture.rows.values()];
    assert.throws(
      () =>
        walletPaymentRoots(
          valid.filter((row) => row.id !== "wallet-payment"),
          "wallet-account",
        ),
      /Unlinked/u,
    );
    assert.throws(
      () =>
        walletPaymentRoots(
          valid.filter((row) => row.id !== "allocation-1"),
          "wallet-account",
        ),
      /Incomplete/u,
    );
    assert.throws(() => walletPaymentRoots([...valid, valid[1]!], "wallet-account"), /Duplicate/u);
    assert.throws(() => walletPaymentRoots(valid, "foreign-account"), /Foreign/u);
    const foreign = structuredClone(valid);
    foreign.find((row) => row.id === "allocation-0")!.source = "bank";
    assert.throws(() => walletPaymentRoots(foreign, "wallet-account"), /source/u);
    for (const row of fixture.rows.values()) {
      if (row.parent_entry_id !== null && row.parent_entry_id !== undefined)
        assert.equal(row.notes, "");
    }
    assert.match(fixture.rows.get("wallet-payment")!.notes!, /Funding: card USD 10\.93/u);
    const replay = await cli(["apply", ...args, "--commit"]);
    assert.equal(replay.code, 0, replay.output);
    assert.equal(fixture.requests.filter((row) => row.method === "POST").length, 1);
    const resnapshot = await cli([
      "snapshot",
      "--decisions",
      decisionsPath,
      "--wallet-account-id",
      "wallet-account",
      "--out",
      inventoryPath,
      "--url",
      fixture.url,
    ]);
    assert.equal(resnapshot.code, 0, resnapshot.output);
    const captured: unknown = await load(inventoryPath);
    assert.ok(
      captured !== null && typeof captured === "object" && "wallet_transactions" in captured,
    );
    assert.ok(Array.isArray(captured.wallet_transactions));
    assert.deepEqual(
      captured.wallet_transactions.map((row: unknown) => {
        assert.ok(row !== null && typeof row === "object" && "id" in row);
        return row.id;
      }),
      ["wallet-payment"],
    );
    fixture.rows.get("allocation-0")!.amount_cents++;
    fixture.rows.get("allocation-0")!.signed_amount_cents =
      -fixture.rows.get("allocation-0")!.amount_cents;
    assert.throws(
      () => walletPaymentRoots([...fixture.rows.values()], "wallet-account"),
      /conserve/u,
    );
    const mismatch = await cli(["verify", ...args]);
    assert.notEqual(mismatch.code, 0);
    assert.match(mismatch.output, /read-back/u);
  } finally {
    await fixture.close();
  }
});
void test("unknown split response reconciles existing children; invalid child and annotation readbacks stay unverified", async () => {
  for (const scenario of ["lost", "child", "notes"]) {
    const fixture = await httpFixture();
    try {
      const path = await savedPlan(fixture, scenario !== "notes");
      const args = ["--plan", path, "--journal", fixture.journal, "--url", fixture.url];
      if (scenario === "lost") fixture.setLost();
      else if (scenario === "child") fixture.setCorrupt();
      else fixture.setMismatch();
      const applied = await cli(["apply", ...args, "--commit"]);
      assert.notEqual(applied.code, 0);
      const recovery = await cli(["apply", ...args]);
      if (scenario === "lost") {
        assert.equal(recovery.code, 0, recovery.output);
        assert.equal((await cli(["apply", ...args, "--commit"])).code, 0);
      } else assert.notEqual(recovery.code, 0);
      assert.equal(fixture.requests.filter((row) => row.method !== "GET").length, 1);
    } finally {
      await fixture.close();
    }
  }
});
