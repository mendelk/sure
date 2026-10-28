import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  applyGiftCardImportPlan,
  buildGiftCardImportPlan,
} from "../scripts/amazon-gift-card-import.ts";
import {
  account,
  activity,
  additionCapture,
  capture,
  createGiftCardFixture,
  fixtureKey,
  ORDER,
  type GiftCardFixture,
} from "./gift-card-import-fixture.ts";

async function fixture(t: TestContext): Promise<GiftCardFixture> {
  const previousKey = process.env.SURE_API_KEY;
  const previousUrl = process.env.SURE_URL;
  const api = await createGiftCardFixture();
  process.env.SURE_API_KEY = fixtureKey;
  process.env.SURE_URL = api.url;
  t.after(async () => {
    if (previousKey === undefined) delete process.env.SURE_API_KEY;
    else process.env.SURE_API_KEY = previousKey;
    if (previousUrl === undefined) delete process.env.SURE_URL;
    else process.env.SURE_URL = previousUrl;
    await api.close();
  });
  return api;
}
function journal(api: GiftCardFixture) {
  return join(api.root, "private", "journal.json");
}
function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
}
async function saved(path: string): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  assertRecord(value);
  assert.ok(Object.hasOwn(value, "pending"));
  if (value.pending !== null) assertRecord(value.pending);
  return value;
}
function posts(api: GiftCardFixture, resource: string) {
  return api
    .writes()
    .filter((request) => request.method === "POST" && request.path === `/api/v1/${resource}`);
}
function onlyCreationWrites(api: GiftCardFixture) {
  assert.ok(
    api
      .writes()
      .every(
        (request) =>
          request.method === "POST" &&
          ["/api/v1/accounts", "/api/v1/tags", "/api/v1/transactions"].includes(request.path),
      ),
  );
}
function mixedCapture() {
  return capture(
    [
      activity("[Unrecognized gift-card activity]", "$0.01", "$11.65", 6),
      activity(`Gift Card Balance added from Reload ${ORDER}`, "$2.00", "$11.64", 5),
      activity(`Refund from Amazon.com order ${ORDER}`, "$0.37", "$9.64", 4),
      activity(`Gift Card applied to Amazon.com order ${ORDER}`, "-$2.01", "$9.27", 3),
      activity("Gift Card added", "$1.23", "$11.28", 2),
    ],
    "$11.65",
  );
}
function extendedCapture() {
  const source = additionCapture();
  source.pages[0]!.rows.unshift(
    activity(`Gift Card applied to Amazon.com order ${ORDER}`, "-$0.23", "$2.00", 3),
  );
  source.pages[0]!.balance = "$2.00";
  return source;
}

void test("gift-card import creates a cash account and exact ledger rows with real review tags and no inferred categories", async (t) => {
  const api = await fixture(t);
  const plan = buildGiftCardImportPlan(mixedCapture(), api.url);
  const path = journal(api);
  const dry = await applyGiftCardImportPlan(plan, { url: api.url, journal: path });
  assert.equal(dry.mode, "dry-run");
  assert.equal(dry.remaining, 5);
  assert.deepEqual(api.writes(), []);
  const report = await applyGiftCardImportPlan(plan, { url: api.url, commit: true, journal: path });
  assert.equal(report.applied, 5);
  assert.equal(report.already_applied, 0);
  assert.equal(report.account_created, 1);
  assert.equal(report.tags_created, 0);
  assert.deepEqual(report.required_tag_counts, { "ai-follow-up": 1, "follow-up": 4 });
  assert.deepEqual(report.balance, {
    expected_minor: 1165,
    observed_minor: 1165,
    matches: true,
    asynchronous: true,
  });
  assert.equal(api.accounts.length, 1);
  const accountPayload = posts(api, "accounts")[0]!.body!.account;
  assertRecord(accountPayload);
  assert.equal(accountPayload.balance, "10.05");
  assert.equal(accountPayload.opening_balance_date, "2026-01-01");
  assert.equal(accountPayload.institution_name, "Amazon");
  assert.equal(accountPayload.institution_domain, "amazon.com");
  assert.equal(api.accounts[0]!.balance_cents, 1165);
  assert.deepEqual(
    api.rows.map((row) => [row.date, row.amount_cents, row.signed_amount_cents]),
    [
      ["2026-01-02", 123, 123],
      ["2026-01-03", 201, -201],
      ["2026-01-04", 37, 37],
      ["2026-01-05", 200, 200],
      ["2026-01-06", 1, 1],
    ],
  );
  assert.deepEqual(
    api.rows.map((row) => row.tags.map((tag) => tag.id)),
    [["real-ai-follow"], ["real-follow"], ["real-follow"], ["real-follow"], ["real-follow"]],
  );
  assert.ok(api.rows.every((row) => row.category === null && row.source === "amazon-gift-card"));
  assert.deepEqual(
    api.rows.map((row) => row.external_id),
    plan.rows.map((row) => row.import_id),
  );
  for (const row of api.rows) {
    assert.ok(
      api.requests.some(
        (request) => request.method === "GET" && request.path === `/api/v1/transactions/${row.id}`,
      ),
    );
  }
  assert.ok(
    api.requests.some(
      (request) =>
        request.method === "GET" && request.path === `/api/v1/accounts/${api.accounts[0]!.id}`,
    ),
  );
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.equal((await stat(join(api.root, "private"))).mode & 0o777, 0o700);
  onlyCreationWrites(api);
});

void test("idempotent replay preserves journal-verified user annotations instead of restoring importer notes, tags or categories", async (t) => {
  const api = await fixture(t);
  const plan = buildGiftCardImportPlan(additionCapture(), api.url);
  const options = { url: api.url, commit: true, journal: journal(api) };
  await applyGiftCardImportPlan(plan, options);
  const row = api.rows[0]!;
  row.notes = "My own research and funding explanation.";
  row.name = "Gift from family";
  row.category = { id: "user-category", name: "Gifts" };
  row.tags = [{ id: "user-tag", name: "Reviewed personally" }];
  const before = structuredClone(row);
  const writes = api.writes().length;
  const report = await applyGiftCardImportPlan(plan, options);
  assert.equal(report.applied, 0);
  assert.equal(report.already_applied, 1);
  assert.equal(report.account_created, 0);
  assert.equal(api.writes().length, writes);
  assert.deepEqual(row, before);
});

void test("replay conserves original wallet payments after native split children with unset source", async (t) => {
  const api = await fixture(t);
  const plan = buildGiftCardImportPlan(extendedCapture(), api.url);
  const options = { url: api.url, commit: true, journal: journal(api) };
  await applyGiftCardImportPlan(plan, options);
  const parent = api.rows.find((row) => row.classification === "expense")!;
  assert.equal(typeof parent.entry_id, "string");
  const parentEntryId = String(parent.entry_id);
  parent.excluded = true;
  parent.splittable = false;
  parent.notes = "Reviewed order, items, funding and category allocation.";
  parent.tags = [{ id: "ai", name: "ai-categorized" }];
  parent.split_children = [10, 13].map((amount, index) => {
    const id = `child-${index}`;
    const entryId = `child-entry-${index}`;
    api.rows.push({
      ...structuredClone(parent),
      id,
      entry_id: entryId,
      parent_entry_id: parentEntryId,
      split_parent: { transaction_id: parent.id, entry_id: parentEntryId },
      source: null,
      external_id: null,
      notes: "",
      excluded: false,
      split_children: [],
      amount_cents: amount,
      signed_amount_cents: -amount,
      category: { id: `category-${index}`, name: `Category ${index}` },
    });
    return { transaction_id: id, entry_id: entryId };
  });
  const before = structuredClone(api.rows);
  const writes = api.writes().length;
  const replay = await applyGiftCardImportPlan(plan, options);
  assert.equal(replay.already_applied, 2);
  assert.equal(replay.applied, 0);
  assert.deepEqual(replay.balance, {
    expected_minor: 200,
    observed_minor: 200,
    matches: true,
    asynchronous: true,
  });
  assert.equal(api.writes().length, writes);
  assert.deepEqual(api.rows, before);
  api.rows.find((row) => row.id === "child-0")!.parent_entry_id = "unlinked-entry";
  await assert.rejects(applyGiftCardImportPlan(plan, options), /Unlinked/u);
  assert.equal(api.writes().length, writes);
});

void test("identical hold and redemption cycles create distinct rows and remain idempotent", async (t) => {
  const api = await fixture(t);
  const source = capture(
    [
      activity(`Gift Card applied to Amazon.com order ${ORDER}`, "-$1.00", "$0.00"),
      activity(
        `Release of Gift Card Balance hold from Amazon.com order ${ORDER}`,
        "$1.00",
        "$1.00",
      ),
      activity(`Gift Card applied to Amazon.com order ${ORDER}`, "-$1.00", "$0.00"),
      activity("Gift Card added", "$1.00", "$1.00"),
    ],
    "$0.00",
  );
  const plan = buildGiftCardImportPlan(source, api.url);
  assert.equal(plan.rows[1]!.source_fingerprint, plan.rows[3]!.source_fingerprint);
  assert.notEqual(plan.rows[1]!.import_id, plan.rows[3]!.import_id);
  const options = { url: api.url, commit: true, journal: journal(api) };
  const first = await applyGiftCardImportPlan(plan, options);
  assert.equal(first.applied, 4);
  const replay = await applyGiftCardImportPlan(plan, options);
  assert.equal(replay.already_applied, 4);
  assert.equal(new Set(api.rows.map((row) => row.external_id)).size, 4);
  assert.equal(posts(api, "transactions").length, 4);
});

for (const kind of ["account", "transaction"] as const) {
  void test(`a lost ${kind} POST response recovers through same-journal dry-run without duplicate creation`, async (t) => {
    const api = await fixture(t);
    const plan = buildGiftCardImportPlan(additionCapture(), api.url);
    const path = journal(api);
    const options = { url: api.url, journal: path };
    if (kind === "account") api.faults.loseAccountResponse = true;
    else api.faults.loseTransactionResponse = true;
    await assert.rejects(
      applyGiftCardImportPlan(plan, { ...options, commit: true }),
      /unknown|connection|retry|reconcil/iu,
    );
    assert.equal(posts(api, "accounts").length, 1);
    assert.equal(posts(api, "transactions").length, kind === "transaction" ? 1 : 0);
    const pending = (await saved(path)).pending;
    assertRecord(pending);
    assert.ok(Object.hasOwn(pending, "kind"));
    assert.equal(pending.kind, kind);
    const writes = api.writes().length;
    await assert.rejects(
      applyGiftCardImportPlan(plan, { ...options, commit: true }),
      /dry.run|pending|unknown|reconcil/iu,
    );
    assert.equal(api.writes().length, writes);
    const recovery = await applyGiftCardImportPlan(plan, options);
    assert.equal(recovery.mode, "dry-run");
    assert.equal(api.writes().length, writes);
    assert.equal((await saved(path)).pending, null);
    const completed = await applyGiftCardImportPlan(plan, { ...options, commit: true });
    assert.equal(completed.applied, kind === "account" ? 1 : 0);
    assert.equal(completed.already_applied, kind === "transaction" ? 1 : 0);
    assert.equal(api.accounts.length, 1);
    assert.equal(api.rows.length, 1);
    assert.equal(posts(api, "accounts").length, 1);
    assert.equal(posts(api, "transactions").length, 1);
    onlyCreationWrites(api);
  });
}

void test("append-only source history imports only new rows and rejects rewritten or truncated history before writes", async (t) => {
  const api = await fixture(t);
  const first = buildGiftCardImportPlan(additionCapture(), api.url);
  const next = buildGiftCardImportPlan(extendedCapture(), api.url);
  assert.equal(first.rows[0]!.import_id, next.rows[0]!.import_id);
  const options = { url: api.url, commit: true, journal: journal(api) };
  await applyGiftCardImportPlan(first, options);
  const extension = await applyGiftCardImportPlan(next, options);
  assert.equal(extension.applied, 1);
  assert.equal(extension.already_applied, 1);
  assert.equal(api.rows.length, 2);
  assert.equal(api.accounts.length, 1);
  const writes = api.writes().length;
  const rewritten = extendedCapture();
  rewritten.pages[0]!.rows[1]!.description = "Allowance added";
  await assert.rejects(
    applyGiftCardImportPlan(buildGiftCardImportPlan(rewritten, api.url), options),
    /histor|source|prefix|changed/iu,
  );
  await assert.rejects(applyGiftCardImportPlan(first, options), /truncat|histor|prefix/iu);
  assert.equal(api.writes().length, writes);
});

void test("financial changes to a verified remote transaction stop append imports without any new writes", async (t) => {
  const api = await fixture(t);
  const options = { url: api.url, commit: true, journal: journal(api) };
  await applyGiftCardImportPlan(buildGiftCardImportPlan(additionCapture(), api.url), options);
  api.rows[0]!.amount_cents += 1;
  api.rows[0]!.signed_amount_cents += 1;
  const writes = api.writes().length;
  await assert.rejects(
    applyGiftCardImportPlan(buildGiftCardImportPlan(extendedCapture(), api.url), options),
    /financial|amount|changed|identity/iu,
  );
  assert.equal(api.writes().length, writes);
  assert.equal(api.rows.length, 1);
});

void test("edited plan financial operations and capture evidence are recomputed rather than trusted", async (t) => {
  const api = await fixture(t);
  const plan = buildGiftCardImportPlan(additionCapture(), api.url);
  const alteredOperation = structuredClone(plan);
  alteredOperation.rows[0]!.transaction.amount = "1000.00";
  await assert.rejects(
    applyGiftCardImportPlan(alteredOperation, {
      url: api.url,
      commit: true,
      journal: journal(api),
    }),
    /plan|recomput|changed|match/iu,
  );
  const alteredSource = structuredClone(plan);
  const captures = alteredSource.captures;
  assertRecord(captures);
  assert.ok(Array.isArray(captures.pages));
  const page: unknown = captures.pages[0];
  assertRecord(page);
  assert.ok(Array.isArray(page.rows));
  const row: unknown = page.rows[0];
  assertRecord(row);
  assert.ok(typeof row.description === "string");
  row.description = "Allowance added";
  await assert.rejects(
    applyGiftCardImportPlan(alteredSource, { url: api.url, commit: true, journal: journal(api) }),
    /plan|recomput|changed|match/iu,
  );
  assert.deepEqual(api.writes(), []);
});

void test("an existing unowned gift-card account on a later inventory page is rejected rather than reused or duplicated", async (t) => {
  const api = await fixture(t);
  api.accounts.push(
    account(),
    account({
      id: "manual-wallet",
      name: "Amazon Gift Card",
      notes: "Created by the user, not this importer",
    }),
  );
  await assert.rejects(
    applyGiftCardImportPlan(buildGiftCardImportPlan(additionCapture(), api.url), {
      url: api.url,
      commit: true,
      journal: journal(api),
    }),
    /existing|unowned|candidate|conflict|account/iu,
  );
  assert.ok(
    api.requests.some(
      (request) => request.path === "/api/v1/accounts" && request.query.get("page") === "2",
    ),
  );
  assert.deepEqual(api.writes(), []);
});

void test("only a required missing tag is created and its real API ID is used", async (t) => {
  const api = await fixture(t);
  api.tags.splice(1, 1);
  const plan = buildGiftCardImportPlan(additionCapture(), api.url);
  const options = { url: api.url, journal: journal(api) };
  await applyGiftCardImportPlan(plan, options);
  assert.equal(posts(api, "tags").length, 0);
  const report = await applyGiftCardImportPlan(plan, { ...options, commit: true });
  assert.equal(report.tags_created, 1);
  assert.equal(posts(api, "tags").length, 1);
  assert.deepEqual(api.rows[0]!.tags, [api.tags.find((tag) => tag.name === "ai-follow-up")]);
  assert.notEqual(api.rows[0]!.tags[0]!.id, "ai-follow-up");
});

void test("pending automatic transfer matches are reported without confirming, rejecting, patching or blocking them", async (t) => {
  const api = await fixture(t);
  const transfer = {
    id: "automatic-match",
    status: "pending",
    other_account: { id: "bank-account", name: "Existing bank" },
  };
  api.faults.afterTransaction = (row) => {
    row.transfer = structuredClone(transfer);
    row.kind = "funds_movement";
  };
  const plan = buildGiftCardImportPlan(additionCapture(), api.url);
  const options = { url: api.url, commit: true, journal: journal(api) };
  const report = await applyGiftCardImportPlan(plan, options);
  assert.equal(report.applied, 1);
  assert.deepEqual(report.transfers, [
    { transaction_id: api.rows[0]!.id, import_id: plan.rows[0]!.import_id, ...transfer },
  ]);
  const replay = await applyGiftCardImportPlan(plan, options);
  assert.equal(replay.already_applied, 1);
  assert.deepEqual(replay.transfers, report.transfers);
  assert.deepEqual(api.rows[0]!.transfer, transfer);
  onlyCreationWrites(api);
  assert.equal(api.writes().length, 2);
});

void test("success requires independent transaction GET read-back, not a successful POST response", async (t) => {
  const api = await fixture(t);
  api.faults.beforeTransactionRead = (row) => {
    row.notes = "Unexpected external annotation before verification";
  };
  const path = journal(api);
  await assert.rejects(
    applyGiftCardImportPlan(buildGiftCardImportPlan(additionCapture(), api.url), {
      url: api.url,
      commit: true,
      journal: path,
    }),
    /annotation|notes|changed|verif|match/iu,
  );
  assert.equal(posts(api, "transactions").length, 1);
  assert.ok(
    api.requests.some((request) => request.path === `/api/v1/transactions/${api.rows[0]!.id}`),
  );
  assert.deepEqual((await saved(path)).verified, {});
});

void test("an asynchronous final balance mismatch is disclosed and never repaired by setting the account balance", async (t) => {
  const api = await fixture(t);
  api.faults.accountBalanceOverride = 100;
  const report = await applyGiftCardImportPlan(
    buildGiftCardImportPlan(additionCapture(), api.url),
    { url: api.url, commit: true, journal: journal(api) },
  );
  assert.deepEqual(report.balance, {
    expected_minor: 223,
    observed_minor: 100,
    matches: false,
    asynchronous: true,
  });
  assert.equal(report.applied, 1);
  onlyCreationWrites(api);
  assert.equal(posts(api, "accounts").length, 1);
});

void test("the executable CLI plans privately, dry-runs without writes, commits and replays against a real loopback API", async (t) => {
  const api = await fixture(t);
  const captures = join(api.root, "captures.json");
  const plan = join(api.root, "output", "plan.json");
  const path = journal(api);
  await writeFile(captures, JSON.stringify(additionCapture()), { mode: 0o600 });
  await api.run(["plan", "--captures", captures, "--out", plan]);
  assert.equal((await stat(plan)).mode & 0o777, 0o600);
  assert.equal((await stat(join(api.root, "output"))).mode & 0o777, 0o700);
  const dry = await api.run(["apply", "--plan", plan, "--journal", path]);
  assert.equal(dry.mode, "dry-run");
  assert.equal(dry.remaining, 1);
  assert.deepEqual(api.writes(), []);
  const applied = await api.run(["apply", "--plan", plan, "--commit", "--journal", path]);
  assert.equal(applied.applied, 1);
  const replay = await api.run(["apply", "--plan", plan, "--commit", "--journal", path]);
  assert.equal(replay.applied, 0);
  assert.equal(replay.already_applied, 1);
  assert.equal(api.accounts.length, 1);
  assert.equal(api.rows.length, 1);
  assert.equal(api.rows[0]!.signed_amount_cents, 123);
  assert.deepEqual(
    api.rows[0]!.tags.map((tag) => tag.id),
    ["real-ai-follow"],
  );
  assert.equal(posts(api, "transactions").length, 1);
});
