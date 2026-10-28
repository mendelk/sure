/** Evidence-backed allocation and read-back invariants for Amazon category splits. */
/* oxlint-disable eslint/no-await-in-loop -- split children must be fetched and verified sequentially. */
import type { Category, Charge, Operation, Tag, Transaction } from "./amazon-categorize.ts";

export interface Adjustment {
  kind: "discount" | "tax" | "shipping" | "gift_card";
  amount_minor: number;
  evidence: string;
}
export interface Allocation {
  policy: "proportional";
  source_url: string;
  evidence: string;
  adjustments: Adjustment[];
}
export interface ItemCategory {
  order_number: string;
  item_index: number;
  category_id: string;
}
export interface SplitRow {
  amount_minor: number;
  category_id: string;
  name: string;
}
export interface SplitData {
  charge: Charge;
  item_categories: ItemCategory[];
  rows: SplitRow[];
}
function requireValue(condition: unknown, message: string): asserts condition {
  const accepted = Boolean(condition);
  if (!accepted) throw new Error(message);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function safe(value: bigint, label: string): number {
  requireValue(
    value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER),
    `${label}: money sum exceeds safe integer minor units`,
  );
  return Number(value);
}
export function adjustments(value: unknown, label: string): Adjustment[] {
  requireValue(Array.isArray(value), `${label}: adjustments must be an array`);
  let total = 0n;
  return value.map((adjustment) => {
    requireValue(
      record(adjustment) &&
        (adjustment.kind === "discount" ||
          adjustment.kind === "tax" ||
          adjustment.kind === "shipping" ||
          adjustment.kind === "gift_card") &&
        typeof adjustment.amount_minor === "number" &&
        Number.isSafeInteger(adjustment.amount_minor) &&
        nonempty(adjustment.evidence),
      `${label}: adjustment needs kind, signed integer amount_minor and evidence`,
    );
    const kind = adjustment.kind;
    requireValue(
      kind === "discount" || kind === "gift_card"
        ? adjustment.amount_minor <= 0
        : adjustment.amount_minor >= 0,
      `${label}: discount/gift_card must be nonpositive; tax/shipping must be nonnegative`,
    );
    total += BigInt(adjustment.amount_minor);
    safe(total, label);
    return { kind, amount_minor: adjustment.amount_minor, evidence: adjustment.evidence };
  });
}
export function allocation(value: unknown, label: string): Allocation {
  requireValue(
    record(value) &&
      value.policy === "proportional" &&
      nonempty(value.source_url) &&
      nonempty(value.evidence),
    `${label}: allocation requires proportional policy, HTTPS source_url and evidence`,
  );
  let source: URL;
  try {
    source = new URL(value.source_url);
  } catch {
    throw new Error(`${label}: allocation requires HTTPS source_url`);
  }
  requireValue(
    source.protocol === "https:" && source.hostname && !source.username && !source.password,
    `${label}: allocation requires HTTPS source_url`,
  );
  return {
    policy: "proportional",
    source_url: value.source_url,
    evidence: value.evidence,
    adjustments: adjustments(value.adjustments, label),
  };
}
/** Prices are full-line subtotals: quantity is never multiplied into this evidence. */
export function itemFinancials(
  value: Record<string, unknown>,
  label: string,
): {
  amount_minor?: number;
  adjustments?: Adjustment[];
} {
  const result: { amount_minor?: number; adjustments?: Adjustment[] } = {};
  if (value.amount_minor !== undefined) {
    requireValue(
      typeof value.amount_minor === "number" &&
        Number.isSafeInteger(value.amount_minor) &&
        value.amount_minor > 0,
      `${label}: line amount_minor must be positive safe integer minor units`,
    );
    result.amount_minor = value.amount_minor;
  }
  if (value.adjustments !== undefined) {
    requireValue(
      result.amount_minor !== undefined,
      `${label}: item adjustments require its line subtotal`,
    );
    result.adjustments = adjustments(value.adjustments, label);
  }
  if (result.amount_minor !== undefined) {
    let net = BigInt(result.amount_minor);
    for (const adjustment of result.adjustments ?? []) {
      net += BigInt(adjustment.amount_minor);
      safe(net, label);
    }
    requireValue(net > 0n, `${label}: item net after explicit adjustments must be positive`);
  }
  return result;
}
export function financialWeights(
  charge: Charge,
  required = false,
  pricingTotalMinor = charge.amount_minor,
): bigint[] {
  requireValue(
    Number.isSafeInteger(pricingTotalMinor) && pricingTotalMinor > 0,
    "Invalid observed pricing total",
  );
  const items = charge.orders.flatMap((order) => order.items);
  const complete = items.every((item) => item.amount_minor !== undefined);
  requireValue(
    complete || (!required && charge.allocation === undefined),
    `${charge.charge_id}: every purchased line needs an evidenced amount_minor for proportional allocation`,
  );
  const weights = items.map((item) => {
    if (item.amount_minor === undefined) return 0n;
    let net = BigInt(item.amount_minor);
    for (const adjustment of item.adjustments ?? []) {
      net += BigInt(adjustment.amount_minor);
      safe(net, charge.charge_id);
    }
    requireValue(net > 0n, `${charge.charge_id}: item net must be positive`);
    return net;
  });
  let total = 0n;
  for (const weight of weights) {
    total += weight;
    safe(total, charge.charge_id);
  }
  if (!complete) return [];
  for (const adjustment of charge.allocation?.adjustments ?? []) {
    total += BigInt(adjustment.amount_minor);
    safe(total, charge.charge_id);
  }
  requireValue(
    total === BigInt(pricingTotalMinor),
    `${charge.charge_id}: item nets plus shared adjustments must reconcile exactly to the observed pricing total`,
  );
  return weights;
}
export function reviewedItems(
  charge: Charge,
  value: unknown,
  categories: ReadonlyMap<string, Category>,
): ItemCategory[] {
  requireValue(
    Array.isArray(value) && value.length > 0,
    "item_categories must cover every purchased line",
  );
  const assignments = new Map<string, ItemCategory>();
  for (const row of value) {
    requireValue(
      record(row) &&
        nonempty(row.order_number) &&
        typeof row.item_index === "number" &&
        Number.isSafeInteger(row.item_index) &&
        row.item_index >= 0 &&
        nonempty(row.category_id) &&
        categories.has(row.category_id) &&
        Object.keys(row).every((key) =>
          ["order_number", "item_index", "category_id"].includes(key),
        ),
      "Every item_categories assignment needs an existing category and valid order/item index",
    );
    const key = `${row.order_number}:${row.item_index}`;
    requireValue(!assignments.has(key), "Duplicate item_categories assignment");
    assignments.set(key, {
      order_number: row.order_number,
      item_index: row.item_index,
      category_id: row.category_id,
    });
  }
  const normalized: ItemCategory[] = [];
  for (const order of charge.orders) {
    for (let index = 0; index < order.items.length; index++) {
      const key = `${order.order_number}:${index}`;
      const assignment = assignments.get(key);
      requireValue(assignment, "item_categories must cover every purchased line without omissions");
      normalized.push(assignment);
      assignments.delete(key);
    }
  }
  requireValue(assignments.size === 0, "item_categories includes foreign order/items");
  return normalized;
}
function digits(currency: string): number {
  return (
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}
export function majorAmount(amount: number, currency: string): string {
  const fraction = digits(currency);
  const minor = amount.toString().padStart(fraction + 1, "0");
  return fraction === 0 ? minor : minor.slice(0, -fraction) + "." + minor.slice(-fraction);
}
function conciseTitle(title: string): string {
  const text = title.replaceAll(/\s+/gu, " ").trim();
  return text.length <= 96
    ? text
    : text.slice(0, 64).trimEnd() + " … " + text.slice(-28).trimStart();
}
function paymentNote(charge: Charge, amount: number): string {
  const label =
    charge.kind === "refund"
      ? "Refunded"
      : typeof charge.charged_on === "string"
        ? "Paid"
        : "Shipped";
  return `${label} ${charge.charged_on ?? charge.shipped_on} · ${charge.currency} ${majorAmount(amount, charge.currency)}`;
}
export function splitParentNotes(prefix: string, split: SplitData): string {
  const lines = ["[AI Amazon]"];
  for (const order of split.charge.orders) {
    lines.push(`Amazon order ${order.order_number}`);
    for (const item of order.items) lines.push(`${item.quantity} × ${conciseTitle(item.title)}`);
  }
  lines.push(paymentNote(split.charge, split.charge.amount_minor), "Split allocation:");
  for (const row of split.rows) {
    lines.push(
      `${row.name.replace(/^Amazon · /u, "")}: ${split.charge.currency} ${majorAmount(row.amount_minor, split.charge.currency)}`,
    );
  }
  lines.push("Shared adjustments allocated proportionally after item adjustments.", "[/AI Amazon]");
  return prefix + (prefix.length > 0 ? "\n\n" : "") + lines.join("\n");
}
export function computeSplit(
  charge: Charge,
  assignments: ItemCategory[],
  categories: ReadonlyMap<string, Category>,
  pricingTotalMinor = charge.amount_minor,
): SplitData {
  const itemCategories = reviewedItems(charge, assignments, categories);
  const weights = financialWeights(charge, true, pricingTotalMinor);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0n);
  const total = BigInt(charge.amount_minor);
  const allocated = weights.map((weight, index) => ({
    index,
    amount: (total * weight) / totalWeight,
    remainder: (total * weight) % totalWeight,
  }));
  let remaining = total - allocated.reduce((sum, row) => sum + row.amount, 0n);
  const ranked = allocated.toSorted((left, right) =>
    left.remainder === right.remainder
      ? left.index - right.index
      : left.remainder > right.remainder
        ? -1
        : 1,
  );
  for (const row of ranked) {
    if (remaining === 0n) break;
    row.amount += 1n;
    remaining -= 1n;
  }
  requireValue(remaining === 0n, "Proportional rounding did not conserve the charge");
  const groups = new Map<string, bigint>();
  for (let index = 0; index < itemCategories.length; index++) {
    const category = itemCategories[index]!.category_id;
    groups.set(category, (groups.get(category) ?? 0n) + allocated[index]!.amount);
  }
  requireValue(groups.size >= 2, "A category split needs at least two distinct categories");
  const rows: SplitRow[] = [];
  for (const [categoryId, group] of groups) {
    const amount = safe(group, charge.charge_id);
    requireValue(amount > 0, "Every split category must receive positive minor units");
    rows.push({
      amount_minor: amount,
      category_id: categoryId,
      name: `Amazon · ${categories.get(categoryId)!.name}`,
    });
  }
  requireValue(
    rows.reduce((sum, row) => sum + BigInt(row.amount_minor), 0n) === total,
    "Split rows must conserve the charge",
  );
  return { charge, item_categories: itemCategories, rows };
}
export function splitBlocked(transaction: Transaction): string | null {
  const isSplitParent = Boolean(transaction.split_parent);
  const hasTransfer = Boolean(transaction.transfer);
  if (transaction.pending !== false || transaction.excluded !== false)
    return "split requires pending:false and excluded:false";
  if (
    nonempty(transaction.parent_entry_id) ||
    isSplitParent ||
    (transaction.split_children?.length ?? 0) > 0 ||
    hasTransfer
  )
    return "existing split/transfer cannot be split again";
  if (
    transaction.category_editable !== true ||
    transaction.permissions?.can_annotate !== true ||
    transaction.permissions.can_edit !== true
  )
    return "split requires category, annotation and can_edit permissions";
  if (transaction.split_annotation_support !== true)
    return "split_annotation_support capability unavailable; deploy API and refresh snapshot/plan";
  if (transaction.splittable !== true) return "transaction is not splittable";
  if (!nonempty(transaction.entry_id)) return "split parent entry_id unavailable";
  return null;
}
export function parentProtected(transaction: Transaction): unknown {
  return Object.fromEntries(
    [
      "id",
      "entry_id",
      "parent_entry_id",
      "date",
      "amount_cents",
      "currency",
      "name",
      "classification",
      "kind",
      "pending",
      "category",
      "merchant",
      "account",
      "transfer",
    ].map((key) => [key, transaction[key] ?? null]),
  );
}
export function parentTagIds(before: Transaction, aiTag: Tag, followTag?: Tag): string[] {
  return [
    ...new Set(
      (before.tags ?? [])
        .map((tag) => tag.id)
        .filter((id) => id !== followTag?.id)
        .concat(aiTag.id),
    ),
  ];
}
export async function verifyAppliedSplit(
  api: { transaction(identifier: string): Promise<Transaction> },
  parent: Transaction,
  operation: Operation,
  aiTag: Tag | undefined,
  followTag: Tag | undefined,
  digest: (value: unknown) => string,
): Promise<string[]> {
  const split = operation.split!;
  const identifier = operation.transaction_id;
  const fail = `${identifier}: split read-back does not match; stop and inspect`;
  const parentHasTransfer = Boolean(parent.transfer);
  requireValue(
    aiTag !== undefined &&
      nonempty(parent.entry_id) &&
      parent.excluded === true &&
      !nonempty(parent.parent_entry_id) &&
      !parentHasTransfer &&
      parent.pending === false &&
      parent.splittable === false &&
      parent.split_annotation_support === true &&
      parent.notes === operation.patch.notes &&
      digest(parentProtected(parent)) === digest(parentProtected(operation.before)) &&
      digest((parent.tags ?? []).map((tag) => tag.id).toSorted()) ===
        digest(parentTagIds(operation.before, aiTag, followTag).toSorted()),
    fail,
  );
  requireValue(
    Array.isArray(parent.split_children) && parent.split_children.length === split.rows.length,
    fail,
  );
  const childIds: string[] = [];
  const entryIds = new Set<string>([parent.entry_id]);
  const remaining = [...split.rows];
  let total = 0n;
  for (const summary of parent.split_children) {
    requireValue(
      record(summary) && nonempty(summary.transaction_id) && nonempty(summary.entry_id),
      fail,
    );
    requireValue(
      !childIds.includes(summary.transaction_id) &&
        !entryIds.has(summary.entry_id) &&
        summary.transaction_id !== parent.id,
      fail,
    );
    childIds.push(summary.transaction_id);
    entryIds.add(summary.entry_id);
    const child = await api.transaction(summary.transaction_id);
    const childHasTransfer = Boolean(child.transfer);
    const rowIndex = remaining.findIndex(
      (row) =>
        row.category_id === child.category?.id &&
        row.amount_minor === child.amount_cents &&
        row.name === child.name,
    );
    requireValue(rowIndex >= 0, fail);
    remaining.splice(rowIndex, 1);
    requireValue(
      child.entry_id === summary.entry_id &&
        child.parent_entry_id === operation.before.entry_id &&
        child.amount_cents > 0 &&
        Number.isSafeInteger(child.amount_cents) &&
        child.currency === operation.before.currency &&
        child.classification === operation.before.classification &&
        child.date === operation.before.date &&
        child.pending === false &&
        child.excluded === false &&
        (child.notes ?? "") === "" &&
        !childHasTransfer &&
        record(child.split_parent) &&
        child.split_parent.entry_id === parent.entry_id &&
        child.split_parent.transaction_id === parent.id &&
        (child.split_children?.length ?? 0) === 0 &&
        digest(child.account ?? null) === digest(operation.before.account ?? null) &&
        digest(child.merchant ?? null) === digest(operation.before.merchant ?? null) &&
        digest((child.tags ?? []).map((tag) => tag.id).toSorted()) === digest([aiTag.id]),
      fail,
    );
    total += BigInt(child.amount_cents);
  }
  requireValue(remaining.length === 0 && total === BigInt(operation.before.amount_cents), fail);
  return childIds;
}

/** Original source payments plus exactly linked, conserved API split allocations. */
export function walletPaymentRoots<T>(rows: T[], accountId: string): T[] {
  const originals: T[] = [];
  const byEntry = new Map<string, Record<string, unknown>>();
  const byId = new Map<string, Record<string, unknown>>();
  const children = new Map<string, Record<string, unknown>[]>();
  const external = new Set<string>();
  for (const value of rows) {
    requireValue(record(value) && typeof value.id === "string", "Invalid wallet row");
    requireValue(record(value.account) && value.account.id === accountId, "Foreign wallet account");
    requireValue(!byId.has(value.id), "Duplicate wallet transaction");
    byId.set(value.id, value);
    if (typeof value.entry_id === "string") {
      requireValue(!byEntry.has(value.entry_id), "Duplicate wallet entry");
      byEntry.set(value.entry_id, value);
    }
    if (nonempty(value.parent_entry_id)) {
      const group = children.get(value.parent_entry_id) ?? [];
      group.push(value);
      children.set(value.parent_entry_id, group);
    } else {
      requireValue(
        value.source === "amazon-gift-card" && nonempty(value.external_id),
        "Unexpected wallet source",
      );
      requireValue(!external.has(value.external_id), "Duplicate wallet external identity");
      external.add(value.external_id);
      originals.push(value);
    }
  }
  for (const [entryId, allocations] of children) {
    const parent = byEntry.get(entryId);
    requireValue(
      parent !== undefined &&
        !nonempty(parent.parent_entry_id) &&
        parent.source === "amazon-gift-card",
      "Unlinked wallet split child",
    );
    requireValue(
      parent.excluded === true &&
        parent.pending === false &&
        (parent.transfer === null || parent.transfer === undefined) &&
        Array.isArray(parent.split_children),
      "Invalid wallet split parent",
    );
    requireValue(
      allocations.length >= 2 && allocations.length === parent.split_children.length,
      "Incomplete wallet split allocations",
    );
    const summaries = new Map<string, Record<string, unknown>>();
    for (const summary of parent.split_children) {
      requireValue(
        record(summary) &&
          nonempty(summary.transaction_id) &&
          !summaries.has(summary.transaction_id),
        "Duplicate or invalid wallet child summary",
      );
      summaries.set(summary.transaction_id, summary);
    }
    let total = 0n;
    for (const child of allocations) {
      const summary = typeof child.id === "string" ? summaries.get(child.id) : undefined;
      requireValue(
        summary !== undefined &&
          summary.entry_id === child.entry_id &&
          (child.source === null || child.source === "api") &&
          !nonempty(child.external_id),
        "Unexpected wallet child source or identity",
      );
      requireValue(
        record(child.split_parent) &&
          child.split_parent.entry_id === entryId &&
          child.split_parent.transaction_id === parent.id,
        "Wallet child parent mismatch",
      );
      requireValue(
        child.date === parent.date &&
          child.currency === parent.currency &&
          child.classification === parent.classification &&
          child.pending === false &&
          child.excluded === false &&
          (child.transfer === null || child.transfer === undefined) &&
          (Array.isArray(child.split_children)
            ? child.split_children.length === 0
            : child.split_children === null || child.split_children === undefined),
        "Wallet child financial identity mismatch",
      );
      requireValue(
        typeof child.amount_cents === "number" &&
          Number.isSafeInteger(child.amount_cents) &&
          child.amount_cents > 0,
        "Invalid wallet allocation amount",
      );
      requireValue(
        child.signed_amount_cents ===
          (parent.classification === "expense" ? -child.amount_cents : child.amount_cents),
        "Wallet child signed financial identity mismatch",
      );
      const parentMerchant = record(parent.merchant) ? parent.merchant.id : null;
      const childMerchant = record(child.merchant) ? child.merchant.id : null;
      requireValue(parentMerchant === childMerchant, "Wallet child merchant changed");
      total += BigInt(child.amount_cents);
    }
    requireValue(
      typeof parent.amount_cents === "number" &&
        Number.isSafeInteger(parent.amount_cents) &&
        total === BigInt(parent.amount_cents),
      "Wallet split does not conserve payment",
    );
  }
  for (const parent of byId.values()) {
    if (nonempty(parent.parent_entry_id)) continue;
    const count = Array.isArray(parent.split_children) ? parent.split_children.length : 0;
    requireValue(
      count === 0 || (typeof parent.entry_id === "string" && children.has(parent.entry_id)),
      "Missing wallet split children",
    );
  }
  return originals;
}
