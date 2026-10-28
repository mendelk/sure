#!/usr/bin/env node
/** Reviewed wallet-share classification. No discovery, taxonomy creation, or funding inference. */
/* oxlint-disable eslint/no-await-in-loop -- preflight, journal and independent read-backs are ordered. */
import { parseArgs } from "node:util";
import {
  Sure,
  blocked,
  digest,
  load,
  origin,
  save,
  state,
  userNotes,
  type Category,
  type Charge,
  type Operation,
  type Tag,
  type Transaction,
} from "./amazon-categorize.ts";
import {
  buildEvidencePlan,
  snapshotEvidenceInventory,
  type EvidenceBinding,
  type EvidenceInventory,
} from "./amazon-evidence-audit.ts";
import {
  activitiesInput,
  ordersInput,
  transactionsInput,
  reviewGiftCardOrders,
} from "./amazon-gift-card-orders.ts";
import { usdMinor } from "./amazon-gift-card-review.ts";
import {
  computeSplit,
  financialWeights,
  majorAmount,
  parentTagIds,
  reviewedItems,
  splitBlocked,
  splitParentNotes,
  verifyAppliedSplit,
  type Adjustment,
  type SplitData,
} from "./amazon-splits.ts";
import type { OrderCapture } from "./capture-order.ts";

function requireValue(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
export interface WalletCategoryInventory extends EvidenceInventory {
  categories: Category[];
}
export interface CategoryDecision {
  transaction_id: string;
  category_id?: string;
  item_categories?: unknown;
  reason: string;
}
interface CategoryOperation {
  transaction_id: string;
  before: Transaction;
  notes: string;
  tag_ids: string[];
  category_id?: string;
  split?: SplitData;
  reason: string;
}
interface CategoryCoverage {
  transaction_id: string;
  status: "category" | "split" | "already-applied" | "unresolved";
  reason: string;
}
export interface WalletCategoryPlan {
  version: 1;
  base_url: string;
  inventory: WalletCategoryInventory;
  activities: Parameters<typeof reviewGiftCardOrders>[0];
  orders: OrderCapture[];
  decisions: CategoryDecision[];
  operations: CategoryOperation[];
  coverage: CategoryCoverage[];
  digest: string;
}
interface CategoryClient {
  transaction(id: string): Promise<Transaction>;
  request(method: string, path: string, payload?: unknown): Promise<unknown>;
  collection<T extends { id: string }>(
    name: string,
    accepts: (value: unknown) => value is T,
  ): Promise<T[]>;
}
interface Journal {
  version: 1;
  plan_digest: string;
  base_url: string;
  attempting: string | null;
  verified: string[];
}
function category(value: unknown): value is Category {
  return object(value) && text(value.id) && text(value.name);
}
function tag(value: unknown): value is Tag {
  return object(value) && text(value.id) && text(value.name);
}
function uniqueTag(tags: Tag[], name: string, required = false): Tag | undefined {
  const found = tags.filter((row) => row.name.toLowerCase() === name);
  requireValue(
    found.length <= 1 && (!required || found.length === 1),
    `Missing or ambiguous existing ${name} tag`,
  );
  return found[0];
}
function snapshotIdentity(row: Transaction): unknown {
  const value = state(row);
  delete value.updated_at;
  return {
    ...value,
    source: row.source ?? null,
    external_id: row.external_id ?? null,
    signed_amount_cents: row.signed_amount_cents ?? null,
  };
}
function financialIdentity(row: Transaction): unknown {
  const value = snapshotIdentity(row);
  requireValue(object(value), "Invalid transaction identity");
  const { category: _category, tags: _tags, notes: _notes, ...identity } = value;
  return identity;
}
function sameTags(row: Transaction, ids: string[]): boolean {
  return digest((row.tags ?? []).map((item) => item.id).toSorted()) === digest(ids.toSorted());
}
function splitOperation(operation: CategoryOperation): Operation {
  return {
    transaction_id: operation.transaction_id,
    before: operation.before,
    patch: { notes: operation.notes },
    follow_up: false,
    match: {
      transaction_id: operation.transaction_id,
      status: "unique",
      charge_id: operation.split!.charge.charge_id,
      candidates: [],
    },
    reason: operation.reason,
    split: operation.split,
  };
}
/** Full invoice pricing is validated independently of the smaller wallet-funded amount. */
function pricedCharge(
  binding: EvidenceBinding,
  capture: OrderCapture,
  items: { title: string; quantity?: number; unit_minor?: number }[],
): Charge {
  const funding = binding.funding;
  requireValue(
    funding !== undefined &&
      funding.wallet_minor === binding.charge.amount_minor &&
      funding.card_minor >= 0 &&
      funding.wallet_minor + funding.card_minor === funding.total_minor,
    "Observed funding must conserve full invoice total",
  );
  const adjustments: Adjustment[] = [];
  const seen = new Set<string>();
  let subtotal: number | undefined;
  for (const row of capture.summary_rows) {
    const label = row.label.replace(/:$/u, "").trim();
    requireValue(!seen.has(label), "Duplicate invoice summary label");
    seen.add(label);
    const amount = usdMinor(row.value);
    if (/^Item\(s\) Subtotal$/iu.test(label)) {
      subtotal = amount;
      continue;
    }
    if (/^(?:Total before tax|Gift Card Amount|Grand Total)$/iu.test(label)) continue;
    let kind: Adjustment["kind"];
    if (/^Shipping & Handling$/iu.test(label)) kind = "shipping";
    else if (/^(?:Estimated tax to be collected|Tax)$/iu.test(label)) kind = "tax";
    else if (/^(?:Free Shipping|Promotion Applied|Your Coupon Savings|Discount)$/iu.test(label))
      kind = "discount";
    else throw new Error(`Unreviewed invoice adjustment: ${label}`);
    requireValue(
      kind === "discount" ? amount <= 0 : amount >= 0,
      "Invoice adjustment sign mismatch",
    );
    adjustments.push({ kind, amount_minor: amount, evidence: `${row.label} ${row.value}` });
  }
  const lines = items.map((item) => {
    requireValue(
      item.quantity !== undefined && item.unit_minor !== undefined,
      "Missing observed item pricing",
    );
    const amount = item.quantity * item.unit_minor;
    requireValue(Number.isSafeInteger(amount) && amount > 0, "Invalid item line pricing");
    return { title: item.title, quantity: item.quantity, amount_minor: amount };
  });
  requireValue(
    subtotal !== undefined && lines.reduce((sum, row) => sum + row.amount_minor, 0) === subtotal,
    "Observed item subtotal mismatch",
  );
  const charge: Charge = {
    ...binding.charge,
    orders: [{ order_number: capture.order_number, items: lines }],
    allocation: {
      policy: "proportional",
      source_url: capture.source_url,
      evidence: funding.evidence,
      adjustments,
    },
  };
  financialWeights(charge, true, funding.total_minor);
  return charge;
}
export function buildWalletCategoryPlan(
  inventoryValue: unknown,
  activityValue: unknown,
  orderValue: unknown,
  decisionValue: unknown,
): WalletCategoryPlan {
  activitiesInput(activityValue);
  ordersInput(orderValue);
  requireValue(
    object(inventoryValue) &&
      inventoryValue.version === 1 &&
      text(inventoryValue.base_url) &&
      text(inventoryValue.captured_at) &&
      Array.isArray(inventoryValue.tags) &&
      inventoryValue.tags.every(tag) &&
      Array.isArray(inventoryValue.categories) &&
      inventoryValue.categories.every(category) &&
      Array.isArray(inventoryValue.ai_transactions),
    "Invalid category inventory",
  );
  const { base_url, captured_at, tags, categories: taxonomy } = inventoryValue;
  transactionsInput(inventoryValue);
  const inventory: WalletCategoryInventory = {
    version: 1,
    base_url,
    captured_at,
    tags,
    categories: taxonomy,
    ai_transactions: [],
    wallet_transactions: inventoryValue.wallet_transactions,
  };
  for (const row of inventory.wallet_transactions) {
    requireValue(
      row.signed_amount_cents ===
        (row.classification === "expense" ? -row.amount_cents : row.amount_cents),
      `${row.id}: wallet signed amount/direction mismatch`,
    );
    requireValue(
      (row.parent_entry_id ?? "") === "",
      `${row.id}: allocation children cannot become source payments`,
    );
  }
  const review = reviewGiftCardOrders(
    activityValue.activities,
    inventory.wallet_transactions,
    orderValue.orders,
  );
  requireValue(
    review.errors.length === 0,
    `Wallet evidence integrity: ${review.errors.join("; ")}`,
  );
  requireValue(
    object(decisionValue) && Array.isArray(decisionValue.decisions),
    "Expected reviewed decisions array",
  );
  const decisions: CategoryDecision[] = [];
  const decisionMap = new Map<string, CategoryDecision>();
  const rows = new Map(inventory.wallet_transactions.map((row) => [row.id, row]));
  const categories = new Map(inventory.categories.map((row) => [row.id, row]));
  requireValue(categories.size === inventory.categories.length, "Duplicate taxonomy category");
  for (const value of decisionValue.decisions) {
    requireValue(
      object(value) &&
        text(value.transaction_id) &&
        text(value.reason) &&
        (value.category_id === undefined || text(value.category_id)),
      "Invalid reviewed category decision",
    );
    requireValue(
      rows.has(value.transaction_id) && !decisionMap.has(value.transaction_id),
      "Duplicate or out-of-scope category decision",
    );
    requireValue(
      value.category_id === undefined || value.item_categories === undefined,
      "Choose category or item categories, not both",
    );
    const decision: CategoryDecision = {
      transaction_id: value.transaction_id,
      reason: value.reason,
    };
    if (value.category_id !== undefined) decision.category_id = value.category_id;
    if (value.item_categories !== undefined) decision.item_categories = value.item_categories;
    decisions.push(decision);
    decisionMap.set(decision.transaction_id, decision);
  }
  const ai = uniqueTag(inventory.tags, "ai-categorized", true)!;
  const follow = uniqueTag(inventory.tags, "follow-up");
  const bindings = new Map(review.bindings.map((row) => [row.transaction_id, row]));
  const contexts = new Map(review.coverage.map((row) => [row.transaction_id, row]));
  const captures = new Map(orderValue.orders.map((row) => [row.order_number, row]));
  // Derive only owned AI note changes through the existing notes-only workflow.
  const evidence = buildEvidencePlan(inventory, {
    version: 1,
    wallet_transaction_ids: review.wallet_transaction_ids,
    bindings: review.bindings,
  });
  const annotations = new Map(
    evidence.operations.map((row) => [row.transaction_id, row.patch.notes]),
  );
  const problems = new Map(
    evidence.coverage
      .filter((row) => row.status === "unresolved")
      .map((row) => [row.transaction_id, row.reason]),
  );
  const operations: CategoryOperation[] = [];
  const coverage: CategoryCoverage[] = [];
  for (const before of inventory.wallet_transactions) {
    const decision = decisionMap.get(before.id);
    const binding = bindings.get(before.id);
    const covered: CategoryCoverage = {
      transaction_id: before.id,
      status: "unresolved",
      reason:
        decision?.reason ?? "No reviewed category decision; " + contexts.get(before.id)!.reason,
    };
    coverage.push(covered);
    if (
      decision === undefined ||
      (decision.category_id === undefined && decision.item_categories === undefined)
    )
      continue;
    requireValue(
      binding !== undefined,
      `${before.id}: reviewed category lacks independently verified wallet funding/items`,
    );
    let categoryId = decision.category_id;
    let split: SplitData | undefined;
    if (decision.item_categories !== undefined) {
      const assignments = reviewedItems(binding.charge, decision.item_categories, categories);
      if (new Set(assignments.map((row) => row.category_id)).size === 1)
        categoryId = assignments[0]!.category_id;
      else {
        const context = contexts.get(before.id)!;
        const capture = captures.get(context.order_number!);
        requireValue(
          capture !== undefined && context.items !== undefined,
          "Missing captured split scope",
        );
        split = computeSplit(
          pricedCharge(binding, capture, context.items),
          assignments,
          categories,
          binding.funding!.total_minor,
        );
      }
    }
    if (categoryId !== undefined)
      requireValue(categories.has(categoryId), `${before.id}: unknown category`);
    if (before.category !== undefined && before.category !== null) {
      covered.status =
        before.category.id === categoryId && sameTags(before, parentTagIds(before, ai, follow))
          ? "already-applied"
          : "unresolved";
      covered.reason =
        covered.status === "already-applied"
          ? "Reviewed category and provenance already present; existing notes preserved"
          : "Existing classification preserved";
      continue;
    }
    const problem =
      blocked(before) ??
      (before.excluded !== false ? "Excluded transaction" : null) ??
      (before.category_editable !== true ? "Category permission unavailable" : null) ??
      problems.get(before.id) ??
      (split === undefined ? null : splitBlocked(before));
    if (problem !== null) {
      covered.reason = problem;
      continue;
    }
    let notes = annotations.get(before.id) ?? before.notes ?? "";
    if (split !== undefined) {
      const funding = binding.funding!;
      notes = splitParentNotes(userNotes(notes, before.id), split).replace(
        "\n[/AI Amazon]",
        `\nFunding: card ${before.currency} ${majorAmount(funding.card_minor, before.currency)} + gift card ${before.currency} ${majorAmount(funding.wallet_minor, before.currency)}.\n[/AI Amazon]`,
      );
    }
    const operation: CategoryOperation = {
      transaction_id: before.id,
      before,
      notes,
      tag_ids: parentTagIds(before, ai, follow),
      reason: decision.reason,
    };
    if (split !== undefined) operation.split = split;
    else operation.category_id = categoryId;
    operations.push(operation);
    covered.status = split === undefined ? "category" : "split";
  }
  const body = {
    version: 1 as const,
    base_url: origin(inventory.base_url),
    inventory,
    activities: activityValue.activities,
    orders: orderValue.orders,
    decisions,
    operations,
    coverage,
  };
  return { ...body, digest: digest(body) };
}
function checkedPlan(value: unknown, url: string): WalletCategoryPlan {
  requireValue(
    object(value) && value.version === 1 && text(value.base_url) && value.base_url === origin(url),
    "Plan origin mismatch",
  );
  const rebuilt = buildWalletCategoryPlan(
    value.inventory,
    { activities: value.activities },
    { orders: value.orders },
    { decisions: value.decisions },
  );
  requireValue(
    digest(value) === digest(rebuilt),
    "Frozen plan changed; regenerate instead of editing operations",
  );
  return rebuilt;
}
async function inspect(
  api: CategoryClient,
  operation: CategoryOperation,
  ai: Tag,
  follow: Tag | undefined,
): Promise<"before" | "desired"> {
  const current = await api.transaction(operation.transaction_id);
  if (operation.split !== undefined && (current.split_children?.length ?? 0) > 0) {
    requireValue(
      current.source === operation.before.source &&
        current.external_id === operation.before.external_id &&
        current.signed_amount_cents === operation.before.signed_amount_cents,
      "Split source identity changed",
    );
    await verifyAppliedSplit(api, current, splitOperation(operation), ai, follow, digest);
    return "desired";
  }
  requireValue(
    digest(financialIdentity(current)) === digest(financialIdentity(operation.before)),
    `${current.id}: protected financial state changed`,
  );
  if (
    operation.split === undefined &&
    current.category?.id === operation.category_id &&
    current.notes === operation.notes &&
    sameTags(current, operation.tag_ids)
  )
    return "desired";
  requireValue(
    digest(snapshotIdentity(current)) === digest(snapshotIdentity(operation.before)),
    `${current.id}: stale annotations or state`,
  );
  requireValue(
    current.category === null || current.category === undefined,
    `${current.id}: existing classification`,
  );
  requireValue(
    blocked(current) === null && current.category_editable === true,
    `${current.id}: annotation/category permissions unavailable`,
  );
  if (operation.split !== undefined)
    requireValue(splitBlocked(current) === null, `${current.id}: split capability unavailable`);
  return "before";
}
export async function applyWalletCategoryPlan(
  value: unknown,
  options: {
    url: string;
    journal: string;
    commit?: boolean;
    verify?: boolean;
    client?: CategoryClient;
  },
): Promise<Record<string, unknown>> {
  const plan = checkedPlan(value, options.url);
  requireValue(text(options.journal), "Private --journal is required");
  const api = options.client ?? new Sure(plan.base_url);
  const tags = await api.collection("tags", tag);
  const categories = await api.collection("categories", category);
  requireValue(
    digest(tags.toSorted((a, b) => a.id.localeCompare(b.id))) ===
      digest(plan.inventory.tags.toSorted((a, b) => a.id.localeCompare(b.id))),
    "Tag taxonomy changed",
  );
  requireValue(
    digest(categories.toSorted((a, b) => a.id.localeCompare(b.id))) ===
      digest(plan.inventory.categories.toSorted((a, b) => a.id.localeCompare(b.id))),
    "Category taxonomy changed",
  );
  const ai = uniqueTag(tags, "ai-categorized", true)!;
  const follow = uniqueTag(tags, "follow-up");
  let journal: Journal = {
    version: 1,
    plan_digest: plan.digest,
    base_url: plan.base_url,
    attempting: null,
    verified: [],
  };
  try {
    const saved = await load(options.journal);
    requireValue(
      object(saved) &&
        saved.version === 1 &&
        saved.plan_digest === plan.digest &&
        saved.base_url === plan.base_url &&
        (saved.attempting === null || text(saved.attempting)) &&
        Array.isArray(saved.verified) &&
        saved.verified.every(text),
      "Journal identity mismatch",
    );
    journal = {
      version: 1,
      plan_digest: saved.plan_digest,
      base_url: saved.base_url,
      attempting: saved.attempting,
      verified: saved.verified,
    };
  } catch (error) {
    if (!(object(error) && error.code === "ENOENT")) throw error;
  }
  requireValue(
    options.commit !== true || journal.attempting === null,
    "Unknown write outcome: dry-run with the same journal before commit",
  );
  const operationIds = new Set(plan.operations.map((row) => row.transaction_id));
  requireValue(
    new Set(journal.verified).size === journal.verified.length &&
      journal.verified.every((id) => operationIds.has(id)) &&
      (journal.attempting === null || operationIds.has(journal.attempting)),
    "Journal contains unexpected operations",
  );
  const verified = new Set(journal.verified);
  const prepared: CategoryOperation[] = [];
  let already = 0;
  // Every write is preflighted before any write occurs.
  for (const operation of plan.operations) {
    const status = await inspect(api, operation, ai, follow);
    if (status === "desired") {
      verified.add(operation.transaction_id);
      already++;
    } else {
      requireValue(
        !verified.has(operation.transaction_id),
        "Previously verified classification changed",
      );
      prepared.push(operation);
    }
  }
  // Already-classified rows from a refreshed inventory must still be independently observed.
  const roots = new Map(plan.inventory.wallet_transactions.map((row) => [row.id, row]));
  for (const covered of plan.coverage) {
    if (covered.status !== "already-applied") continue;
    const current = await api.transaction(covered.transaction_id);
    requireValue(
      digest(snapshotIdentity(current)) ===
        digest(snapshotIdentity(roots.get(covered.transaction_id)!)),
      "Already-classified record changed",
    );
    already++;
  }
  if (options.verify === true)
    requireValue(prepared.length === 0, "Verification found unapplied category operations");
  journal.attempting = null;
  journal.verified = [...verified];
  await save(options.journal, journal);
  let applied = 0;
  if (options.commit === true) {
    for (const operation of prepared) {
      journal.attempting = operation.transaction_id;
      await save(options.journal, journal);
      requireValue(
        (await inspect(api, operation, ai, follow)) === "before",
        "Classification changed during apply; dry-run again",
      );
      const path = "/api/v1/transactions/" + encodeURIComponent(operation.transaction_id);
      if (operation.split !== undefined) {
        await api.request("POST", path + "/split", {
          split: {
            splits: operation.split.rows.map((row) => ({
              name: row.name,
              amount: "-" + majorAmount(row.amount_minor, operation.before.currency),
              category_id: row.category_id,
              tag_ids: [ai.id],
            })),
            parent: { notes: operation.notes, tag_ids: operation.tag_ids },
          },
        });
      } else {
        const patch: { category_id: string; tag_ids: string[]; notes?: string } = {
          category_id: operation.category_id!,
          tag_ids: operation.tag_ids,
        };
        if (operation.notes !== (operation.before.notes ?? "")) patch.notes = operation.notes;
        await api.request("PATCH", path, { transaction: patch });
      }
      requireValue(
        (await inspect(api, operation, ai, follow)) === "desired",
        "Independent read-back did not verify classification",
      );
      verified.add(operation.transaction_id);
      journal.verified = [...verified];
      journal.attempting = null;
      await save(options.journal, journal);
      applied++;
    }
  }
  return {
    mode: options.verify === true ? "verify" : options.commit === true ? "commit" : "dry-run",
    payments: plan.coverage.length,
    operations: plan.operations.length,
    ready: options.commit === true ? 0 : prepared.length,
    applied,
    already_applied: already,
    split_parents: plan.operations.filter((row) => row.split !== undefined).length,
    split_children: plan.operations.reduce((sum, row) => sum + (row.split?.rows.length ?? 0), 0),
    unresolved: plan.coverage.filter((row) => row.status === "unresolved"),
  };
}
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      inventory: { type: "string" },
      activities: { type: "string" },
      orders: { type: "string" },
      decisions: { type: "string" },
      out: { type: "string" },
      plan: { type: "string" },
      journal: { type: "string" },
      url: { type: "string" },
      "wallet-account-id": { type: "string" },
      commit: { type: "boolean", default: false },
    },
    strict: true,
  });
  if (command === "snapshot") {
    requireValue(
      text(values.decisions) &&
        text(values["wallet-account-id"]) &&
        text(values.out) &&
        !values.commit,
      "snapshot requires --decisions --wallet-account-id --out",
    );
    const url = values.url ?? process.env.SURE_URL;
    requireValue(text(url), "Explicit Sure origin required");
    const decisions: unknown = await load(values.decisions);
    requireValue(
      object(decisions) && Array.isArray(decisions.decisions),
      "Expected reviewed decisions",
    );
    const ids = decisions.decisions.map((decision: unknown) => {
      requireValue(
        object(decision) && text(decision.transaction_id),
        "Invalid reviewed transaction ID",
      );
      return decision.transaction_id;
    });
    requireValue(new Set(ids).size === ids.length, "Duplicate reviewed transaction IDs");
    const api = new Sure(origin(url));
    const inventory: WalletCategoryInventory = {
      ...(await snapshotEvidenceInventory(url, values["wallet-account-id"])),
      categories: await api.collection("categories", category),
    };
    const walletIds = new Set(inventory.wallet_transactions.map((row) => row.id));
    requireValue(
      ids.every((id) => walletIds.has(id)),
      "Reviewed ID outside original wallet payments",
    );
    const details = new Map<string, Transaction>();
    for (let start = 0; start < ids.length; start += 4) {
      const rows = await Promise.all(ids.slice(start, start + 4).map((id) => api.transaction(id)));
      for (const row of rows) details.set(row.id, row);
    }
    inventory.wallet_transactions = inventory.wallet_transactions.map(
      (row) => details.get(row.id) ?? row,
    );
    inventory.ai_transactions = inventory.ai_transactions.map((row) => details.get(row.id) ?? row);
    await save(values.out, inventory);
    process.stdout.write(
      JSON.stringify({
        wallet: walletIds.size,
        reviewed: details.size,
        categories: inventory.categories.length,
      }) + "\n",
    );
  } else if (command === "plan") {
    requireValue(
      text(values.inventory) &&
        text(values.activities) &&
        text(values.orders) &&
        text(values.decisions) &&
        text(values.out) &&
        !values.commit,
      "plan requires --inventory --activities --orders --decisions --out",
    );
    const plan = buildWalletCategoryPlan(
      await load(values.inventory),
      await load(values.activities),
      await load(values.orders),
      await load(values.decisions),
    );
    if (values.url !== undefined)
      requireValue(plan.base_url === origin(values.url), "Plan origin mismatch");
    await save(values.out, plan);
    process.stdout.write(
      JSON.stringify({
        payments: plan.coverage.length,
        operations: plan.operations.length,
        unresolved: plan.coverage.filter((row) => row.status === "unresolved").length,
      }) + "\n",
    );
  } else {
    requireValue(
      (command === "apply" || command === "verify") &&
        text(values.plan) &&
        text(values.journal) &&
        !(command === "verify" && values.commit),
      "Use apply|verify --plan --journal --url [--commit]",
    );
    const url = values.url ?? process.env.SURE_URL;
    requireValue(text(url), "Explicit Sure origin required");
    process.stdout.write(
      JSON.stringify(
        await applyWalletCategoryPlan(await load(values.plan), {
          url,
          journal: values.journal,
          commit: values.commit,
          verify: command === "verify",
        }),
      ) + "\n",
    );
  }
}
if (import.meta.main) {
  try {
    await main();
  } catch (error: unknown) {
    process.stderr.write(
      (error instanceof Error ? error.message : "Category operation failed") + "\n",
    );
    process.exitCode = 1;
  }
}
