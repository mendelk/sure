#!/usr/bin/env node
/** Private, read-only order context and independently funded wallet evidence. */
import { parseArgs } from "node:util";
import { load, save, type Transaction } from "./amazon-categorize.ts";
import { usdMinor, type GiftCardActivity } from "./amazon-gift-card-review.ts";
import type { EvidenceBinding } from "./amazon-evidence-audit.ts";
import type { OrderCapture } from "./capture-order.ts";

type Item = { title: string; quantity?: number; unit_minor?: number };
export interface OrderCoverage {
  transaction_id: string;
  import_id: string;
  kind: GiftCardActivity["kind"] | "missing-source";
  order_number?: string;
  status: "verified" | "order-context" | "unresolved" | "funding-review";
  reason: string;
  items?: Item[];
  source_url?: string;
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requireValue(value: boolean, message: string): asserts value {
  if (!value) throw new Error(message);
}
function accountId(transaction: Transaction): string | null {
  const account = transaction.account;
  return object(account) && typeof account.id === "string" && account.id.length > 0
    ? account.id
    : null;
}
function money(text: string): number | undefined {
  try {
    return usdMinor(text);
  } catch {
    return undefined;
  }
}
function summary(capture: OrderCapture, label: RegExp): number | undefined {
  const rows = capture.summary_rows.filter((row) => label.test(row.label.trim()));
  return rows.length === 1 ? money(rows[0]!.value) : undefined;
}
function orderItems(capture: OrderCapture): { items: Item[]; complete: boolean } {
  const items = capture.items.map((row): Item => {
    const quantity = /^(?:Qty\s*:?\s*|Quantity\s*:?\s*)?([1-9]\d*)$/iu.exec(
      row.quantity_text.trim(),
    );
    const parsed = quantity === null ? undefined : Number(quantity[1]);
    const price = money(row.price_text);
    return {
      title: row.title,
      ...(parsed !== undefined && Number.isSafeInteger(parsed) ? { quantity: parsed } : {}),
      ...(price !== undefined && price > 0 ? { unit_minor: price } : {}),
    };
  });
  const subtotal = summary(capture, /^(?:Item(?:\(s\)|s)? Subtotal|Subtotal):?$/iu);
  const unknown = items.filter((item) => item.quantity === undefined);
  if (
    unknown.length > 0 &&
    subtotal !== undefined &&
    subtotal > 0 &&
    items.every((item) => item.unit_minor !== undefined)
  ) {
    const known = items.reduce(
      (sum, item) => sum + BigInt(item.unit_minor!) * BigInt(item.quantity ?? 0),
      0n,
    );
    const minimum = unknown.reduce((sum, item) => sum + BigInt(item.unit_minor!), known);
    if (minimum === BigInt(subtotal)) for (const item of unknown) item.quantity = 1;
    else if (unknown.length === 1) {
      const item = unknown[0]!;
      const remaining = BigInt(subtotal) - known;
      const unit = BigInt(item.unit_minor!);
      const quantity = remaining / unit;
      if (remaining > 0n && remaining % unit === 0n && quantity <= BigInt(Number.MAX_SAFE_INTEGER))
        item.quantity = Number(quantity);
    }
  }
  const complete =
    items.length > 0 &&
    items.every((item) => item.title.trim().length > 0 && item.quantity !== undefined);
  // A contradictory observed subtotal invalidates even explicitly captured quantities.
  const priced = items.every(
    (item) => item.quantity !== undefined && item.unit_minor !== undefined,
  );
  const agrees =
    subtotal === undefined ||
    !priced ||
    items.reduce((sum, item) => sum + BigInt(item.unit_minor!) * BigInt(item.quantity!), 0n) ===
      BigInt(subtotal);
  return { items, complete: complete && agrees };
}

export function reviewGiftCardOrders(
  activities: GiftCardActivity[],
  walletTransactions: Transaction[],
  captures: OrderCapture[],
) {
  const errors: string[] = [];
  const sources = new Map<string, GiftCardActivity>();
  const duplicateSources = new Set<string>();
  const orders = new Map<string, OrderCapture>();
  const duplicateOrders = new Set<string>();
  const orderStats = new Map<string, { redemptions: number; hasHold: boolean }>();
  for (const activity of activities) {
    if (activity.order_number !== undefined) {
      const stats = orderStats.get(activity.order_number) ?? { redemptions: 0, hasHold: false };
      if (activity.kind === "redemption") stats.redemptions++;
      if (activity.kind === "hold_release") stats.hasHold = true;
      orderStats.set(activity.order_number, stats);
    }
    if (sources.has(activity.import_id)) {
      duplicateSources.add(activity.import_id);
      errors.push(`Duplicate source import_id: ${activity.import_id}`);
    }
    sources.set(activity.import_id, activity);
  }
  for (const capture of captures) {
    if (orders.has(capture.order_number)) {
      duplicateOrders.add(capture.order_number);
      errors.push(`Duplicate order capture: ${capture.order_number}`);
    }
    orders.set(capture.order_number, capture);
  }
  const accounts = new Set(walletTransactions.map((row) => accountId(row)));
  const accountScope = accounts.size === 1 && !accounts.has(null);
  if (!accountScope) errors.push("Wallet inventory must identify exactly one wallet account");
  const externalCounts = new Map<string, number>();
  const ids = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const row of walletTransactions) {
    if (ids.has(row.id)) {
      duplicateIds.add(row.id);
      errors.push(`Duplicate transaction id: ${row.id}`);
    }
    ids.add(row.id);
    if (typeof row.external_id === "string")
      externalCounts.set(row.external_id, (externalCounts.get(row.external_id) ?? 0) + 1);
  }
  const bindings: EvidenceBinding[] = [];
  const coverage: OrderCoverage[] = [];
  for (const row of walletTransactions) {
    const importId = typeof row.external_id === "string" ? row.external_id : "";
    const activity = sources.get(importId);
    const context: OrderCoverage = {
      transaction_id: row.id,
      import_id: importId,
      kind: activity?.kind ?? "missing-source",
      status: "unresolved",
      reason: "No exact source identity; amount matching is prohibited.",
    };
    coverage.push(context);
    if (activity === undefined) {
      errors.push(`Missing source record: ${row.id}`);
      continue;
    }
    if (activity.order_number !== undefined) context.order_number = activity.order_number;
    const valid =
      accountScope &&
      row.source === "amazon-gift-card" &&
      !duplicateSources.has(importId) &&
      externalCounts.get(importId) === 1 &&
      !duplicateIds.has(row.id) &&
      row.currency === "USD" &&
      row.date === activity.date &&
      Number.isSafeInteger(activity.amount_minor) &&
      activity.amount_minor !== 0 &&
      (activity.kind === "unknown" ||
        (activity.kind === "redemption" ? activity.amount_minor < 0 : activity.amount_minor > 0)) &&
      row.amount_cents === Math.abs(activity.amount_minor) &&
      row.classification === (activity.amount_minor < 0 ? "expense" : "income");
    if (!valid) {
      context.reason =
        "Source identity, amount, date, currency, direction, or wallet account scope mismatch.";
      errors.push(`Identity mismatch or duplicate wallet row: ${row.id}`);
      continue;
    }
    const capture =
      activity.order_number === undefined ? undefined : orders.get(activity.order_number);
    let complete = false;
    if (capture !== undefined && !duplicateOrders.has(capture.order_number)) {
      const parsed = orderItems(capture);
      context.items = parsed.items;
      context.source_url = capture.source_url;
      complete = parsed.complete;
      context.status = "order-context";
    }
    if (
      ["gift_card_added", "reload", "auto_reload", "cash_load", "allowance"].includes(activity.kind)
    ) {
      context.status = "funding-review";
      context.reason =
        "Funding activity excluded from retail purchase matching; preserve existing category and review tags, including ai-follow-up for unconfirmed gift-card additions. No income or transfer inferred.";
      continue;
    }
    if (activity.kind === "hold_release") {
      context.reason =
        "Hold release is not a purchase or purchase refund; related order context does not prove an item allocation.";
      continue;
    }
    if (activity.kind === "refund") {
      context.reason =
        "Order context does not establish actual refunded items or quantities; separate refund proof required.";
      continue;
    }
    if (activity.kind !== "redemption") {
      context.reason = "Unknown activity requires review; no purchase inferred.";
      continue;
    }
    if (capture === undefined || duplicateOrders.has(capture.order_number)) {
      context.reason = "No unique captured order for the observed source order reference.";
      continue;
    }
    const stats = orderStats.get(activity.order_number!);
    if (stats?.redemptions !== 1 || stats.hasHold) {
      context.reason =
        "Repeated debit or hold-release cycle: order context cannot establish this movement's actual item scope.";
      continue;
    }
    const gift = summary(capture, /^Gift Card Amount:?$/iu);
    const card = summary(capture, /^Grand Total:?$/iu);
    if (
      gift === undefined ||
      card === undefined ||
      card < 0 ||
      Math.abs(gift) !== row.amount_cents ||
      !Number.isSafeInteger(card + Math.abs(gift))
    ) {
      context.reason =
        "Observed invoice gift-card allocation and remaining Grand Total do not uniquely confirm this wallet debit.";
      continue;
    }
    if (!complete) {
      context.reason =
        "Item quantities/prices remain ambiguous or contradict the observed subtotal; no quantities guessed.";
      continue;
    }
    const evidence = `Gift-card ledger ${activity.date} debit USD ${(row.amount_cents / 100).toFixed(2)}; invoice Gift Card Amount ${gift}, remaining Grand Total ${card} minor units. Single redemption without hold-release cycles; order items are context for this wallet-funded share.`;
    bindings.push({
      transaction_id: row.id,
      charge: {
        charge_id: `wallet:${activity.import_id}`,
        kind: "charge",
        amount_minor: row.amount_cents,
        currency: "USD",
        charged_on: activity.date,
        source_url: capture.source_url,
        evidence,
        orders: [
          {
            order_number: capture.order_number,
            items: context.items!.map((item) => ({ title: item.title, quantity: item.quantity! })),
          },
        ],
      },
      funding: {
        card_minor: card,
        wallet_minor: row.amount_cents,
        total_minor: card + row.amount_cents,
        evidence,
        source_url: capture.source_url,
      },
    });
    context.status = "verified";
    context.reason =
      "Exact source-identity wallet debit and invoice funding allocation verified; notes-only evidence, no category/tag/financial writes.";
  }
  const imported = new Set(walletTransactions.map((row) => row.external_id));
  for (const activity of activities) {
    if (!imported.has(activity.import_id))
      errors.push(`Source activity missing wallet transaction: ${activity.import_id}`);
  }
  return {
    version: 1 as const,
    wallet_transaction_ids: walletTransactions.map((row) => row.id),
    bindings,
    coverage,
    errors,
    counts: {
      wallet: coverage.length,
      verified: bindings.length,
      order_context: coverage.filter((row) => row.status === "order-context").length,
      unresolved: coverage.filter((row) => row.status === "unresolved").length,
      funding_review: coverage.filter((row) => row.status === "funding-review").length,
      errors: errors.length,
    },
  };
}

export function activitiesInput(
  value: unknown,
): asserts value is { activities: GiftCardActivity[] } {
  requireValue(
    object(value) && Array.isArray(value.activities),
    "Expected review document activities",
  );
  for (const row of value.activities) {
    requireValue(
      object(row) &&
        typeof row.import_id === "string" &&
        typeof row.date === "string" &&
        typeof row.kind === "string" &&
        [
          "redemption",
          "refund",
          "hold_release",
          "gift_card_added",
          "reload",
          "auto_reload",
          "allowance",
          "cash_load",
          "unknown",
        ].includes(row.kind) &&
        Number.isSafeInteger(row.amount_minor) &&
        (row.order_number === undefined || typeof row.order_number === "string"),
      "Invalid source activity",
    );
  }
}
export function transactionsInput(
  value: unknown,
): asserts value is { wallet_transactions: Transaction[] } {
  requireValue(
    object(value) && Array.isArray(value.wallet_transactions),
    "Expected inventory wallet_transactions",
  );
  for (const row of value.wallet_transactions) {
    requireValue(
      object(row) &&
        typeof row.id === "string" &&
        typeof row.date === "string" &&
        typeof row.currency === "string" &&
        typeof row.classification === "string" &&
        Number.isSafeInteger(row.amount_cents),
      "Invalid wallet transaction",
    );
  }
}
export function ordersInput(value: unknown): asserts value is { orders: OrderCapture[] } {
  requireValue(object(value) && Array.isArray(value.orders), "Expected orders capture document");
  for (const row of value.orders) {
    requireValue(
      object(row) &&
        row.version === 1 &&
        typeof row.order_number === "string" &&
        typeof row.source_url === "string" &&
        typeof row.captured_at === "string" &&
        Array.isArray(row.items) &&
        Array.isArray(row.summary_rows),
      "Invalid order capture",
    );
    const url = new URL(row.source_url);
    requireValue(
      url.protocol === "https:" &&
        /(^|\.)amazon\.com$/u.test(url.hostname) &&
        url.username === "" &&
        url.password === "" &&
        url.hash === "" &&
        [...url.searchParams.keys()].every((key) => key === "orderID") &&
        url.searchParams.getAll("orderID").length === 1 &&
        url.searchParams.get("orderID") === row.order_number,
      "Invalid canonical order source URL",
    );
    for (const item of row.items) {
      requireValue(
        object(item) &&
          typeof item.title === "string" &&
          typeof item.quantity_text === "string" &&
          typeof item.price_text === "string",
        "Invalid captured item",
      );
    }
    for (const summaryRow of row.summary_rows) {
      requireValue(
        object(summaryRow) &&
          typeof summaryRow.label === "string" &&
          typeof summaryRow.value === "string",
        "Invalid captured summary row",
      );
    }
  }
}
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      activities: { type: "string" },
      transactions: { type: "string" },
      orders: { type: "string" },
      out: { type: "string" },
    },
    strict: true,
  });
  requireValue(
    values.activities !== undefined &&
      values.transactions !== undefined &&
      values.orders !== undefined &&
      values.out !== undefined,
    "Required: --activities --transactions --orders --out",
  );
  const activities: unknown = await load(values.activities);
  const transactions: unknown = await load(values.transactions);
  const orders: unknown = await load(values.orders);
  activitiesInput(activities);
  transactionsInput(transactions);
  ordersInput(orders);
  const report = reviewGiftCardOrders(
    activities.activities,
    transactions.wallet_transactions,
    orders.orders,
  );
  await save(values.out, report);
  process.stdout.write(JSON.stringify(report.counts) + "\n");
}
if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      "Error: " + (error instanceof Error ? error.message : String(error)) + "\n",
    );
    process.exitCode = 1;
  }
}
