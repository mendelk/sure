#!/usr/bin/env node
/** Read-only discovery by default; reviewed Sure annotations/splits require --commit. */
/* oxlint-disable eslint/no-await-in-loop -- API pagination, throttling, and ledger read/check/PATCH/read-back must remain sequential. */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { parseArgs } from "node:util";
import {
  allocation,
  computeSplit,
  financialWeights,
  itemFinancials,
  majorAmount,
  parentTagIds,
  reviewedItems,
  splitBlocked,
  splitParentNotes,
  verifyAppliedSplit,
} from "./amazon-splits.ts";
import type { Adjustment, Allocation, ItemCategory, SplitData } from "./amazon-splits.ts";

const VERSION = 1;
const FOLLOW_UP = "follow-up";
const AI_CATEGORIZED = "ai-categorized";
const AMAZON = /\b(?:amazon|amzn|amz)(?:\b|[.*]|prime\b|digital\b|mktp\b)/iu;
const WOOT = /\bwoot\b/iu;
const ORDER = /^\d{3}-\d{7}-\d{7}$/u;

export interface Tag {
  id: string;
  name: string;
}
export interface Category {
  id: string;
  name: string;
  parent?: { id: string; name: string } | null;
}
export interface Transaction {
  id: string;
  name?: string | null;
  date: string;
  amount_cents: number;
  currency: string;
  classification: string;
  category?: Category | null;
  category_editable?: boolean | null;
  tags?: Tag[] | null;
  notes?: string | null;
  pending?: boolean | null;
  parent_entry_id?: string | null;
  split_parent?: unknown;
  split_children?: unknown[] | null;
  transfer?: unknown;
  merchant?: { id?: string; name?: string } | null;
  excluded?: boolean | null;
  splittable?: boolean | null;
  split_annotation_support?: boolean | null;
  permissions?: { can_annotate?: boolean; can_edit?: boolean } | null;
  [key: string]: unknown;
}
export interface Charge {
  charge_id: string;
  kind: "charge" | "refund";
  amount_minor: number;
  currency: string;
  charged_on?: string | null;
  shipped_on?: string | null;
  ordered_on?: string;
  source_url: string;
  evidence: string;
  merchant_descriptor?: string;
  orders: {
    order_number: string;
    items: { title: string; quantity: number; amount_minor?: number; adjustments?: Adjustment[] }[];
  }[];
  allocation?: Allocation;
}
export interface Snapshot {
  version: number;
  base_url: string;
  transactions: Transaction[];
  target_ids: string[];
  categories: Category[];
  tags: Tag[];
  skipped: { transaction_id: string; reason: string }[];
  revisit_follow_up_ids?: string[];
}
export interface Decision {
  transaction_id: string;
  category_id?: string | null;
  item_categories?: ItemCategory[];
  reason: string;
}
interface Candidate {
  charge_id: string;
  lag_days: number;
  date_basis: "charged_on" | "shipped_on";
  transaction_ids: string[];
}
export interface Match {
  transaction_id: string;
  status: "unique" | "ambiguous" | "unmatched";
  charge_id: string | null;
  candidates: Candidate[];
}
interface Patch {
  notes: string;
  category_id?: string;
}
export interface Operation {
  transaction_id: string;
  before: Transaction;
  patch: Patch;
  follow_up: boolean;
  match: Match;
  reason: string;
  split?: SplitData;
}
export interface Plan {
  version: number;
  base_url: string;
  operations: Operation[];
  revisit_follow_up_ids?: string[];
  unchanged: { transaction_id: string; match: Match; reason: string }[];
  snapshot_sha256: string;
  charges_sha256: string;
  window_days: number;
}
interface JournalRow {
  transaction_id: string;
  status: "applied" | "already_applied";
  follow_up?: boolean;
  split_child_ids?: string[];
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
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item): item is string => typeof item === "string");
}
function tagValue(value: unknown): value is Tag {
  return record(value) && nonempty(value.id) && typeof value.name === "string";
}
function categoryValue(value: unknown): value is Category {
  return (
    record(value) &&
    tagValue(value) &&
    (value.parent === undefined || value.parent === null || tagValue(value.parent))
  );
}
function transactionValue(value: unknown): value is Transaction {
  if (
    !record(value) ||
    !nonempty(value.id) ||
    typeof value.date !== "string" ||
    typeof value.amount_cents !== "number" ||
    typeof value.currency !== "string" ||
    typeof value.classification !== "string"
  )
    return false;
  if (
    !["name", "notes", "parent_entry_id"].every(
      (key) => value[key] === undefined || value[key] === null || typeof value[key] === "string",
    )
  )
    return false;
  if (
    !["pending", "category_editable", "excluded", "splittable", "split_annotation_support"].every(
      (key) => value[key] === undefined || value[key] === null || typeof value[key] === "boolean",
    )
  )
    return false;
  if (value.category !== undefined && value.category !== null && !categoryValue(value.category))
    return false;
  if (
    value.tags !== undefined &&
    value.tags !== null &&
    !(Array.isArray(value.tags) && value.tags.every((tag): tag is Tag => tagValue(tag)))
  )
    return false;
  if (
    value.split_children !== undefined &&
    value.split_children !== null &&
    !Array.isArray(value.split_children)
  )
    return false;
  if (
    value.permissions !== undefined &&
    value.permissions !== null &&
    !(
      record(value.permissions) &&
      (value.permissions.can_annotate === undefined ||
        typeof value.permissions.can_annotate === "boolean") &&
      (value.permissions.can_edit === undefined || typeof value.permissions.can_edit === "boolean")
    )
  )
    return false;
  return (
    value.merchant === undefined ||
    value.merchant === null ||
    (record(value.merchant) &&
      (value.merchant.id === undefined || typeof value.merchant.id === "string") &&
      (value.merchant.name === undefined || typeof value.merchant.name === "string"))
  );
}
function snapshotValue(value: unknown): value is Snapshot {
  return (
    record(value) &&
    value.version === VERSION &&
    nonempty(value.base_url) &&
    Array.isArray(value.transactions) &&
    value.transactions.every((transaction) => transactionValue(transaction)) &&
    strings(value.target_ids) &&
    Array.isArray(value.categories) &&
    value.categories.every((category) => categoryValue(category)) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => tagValue(tag)) &&
    Array.isArray(value.skipped) &&
    value.skipped.every(
      (row) => record(row) && nonempty(row.transaction_id) && typeof row.reason === "string",
    ) &&
    (value.revisit_follow_up_ids === undefined || strings(value.revisit_follow_up_ids))
  );
}
function matchValue(value: unknown): value is Match {
  return (
    record(value) &&
    nonempty(value.transaction_id) &&
    typeof value.status === "string" &&
    ["unique", "ambiguous", "unmatched"].includes(value.status) &&
    (value.charge_id === null || nonempty(value.charge_id)) &&
    Array.isArray(value.candidates) &&
    value.candidates.every(
      (candidate) =>
        record(candidate) &&
        nonempty(candidate.charge_id) &&
        typeof candidate.lag_days === "number" &&
        (candidate.date_basis === "charged_on" || candidate.date_basis === "shipped_on") &&
        strings(candidate.transaction_ids),
    )
  );
}
function planValue(value: unknown): value is Plan {
  return (
    record(value) &&
    value.version === VERSION &&
    nonempty(value.base_url) &&
    Array.isArray(value.operations) &&
    value.operations.every(
      (operation) =>
        record(operation) &&
        nonempty(operation.transaction_id) &&
        transactionValue(operation.before) &&
        record(operation.patch) &&
        typeof operation.patch.notes === "string" &&
        (operation.patch.category_id === undefined || nonempty(operation.patch.category_id)) &&
        typeof operation.follow_up === "boolean" &&
        matchValue(operation.match) &&
        (operation.split === undefined || record(operation.split)) &&
        typeof operation.reason === "string",
    ) &&
    (value.revisit_follow_up_ids === undefined || strings(value.revisit_follow_up_ids)) &&
    Array.isArray(value.unchanged) &&
    value.unchanged.every(
      (row) =>
        record(row) &&
        nonempty(row.transaction_id) &&
        matchValue(row.match) &&
        typeof row.reason === "string",
    ) &&
    nonempty(value.snapshot_sha256) &&
    nonempty(value.charges_sha256) &&
    typeof value.window_days === "number"
  );
}
function decisionValue(value: unknown): value is Decision {
  return (
    record(value) &&
    nonempty(value.transaction_id) &&
    nonempty(value.reason) &&
    (value.category_id === undefined ||
      value.category_id === null ||
      nonempty(value.category_id)) &&
    (value.item_categories === undefined ||
      (value.category_id === undefined &&
        Array.isArray(value.item_categories) &&
        value.item_categories.length > 0 &&
        value.item_categories.every(
          (item) =>
            record(item) &&
            nonempty(item.order_number) &&
            typeof item.item_index === "number" &&
            Number.isSafeInteger(item.item_index) &&
            item.item_index >= 0 &&
            nonempty(item.category_id),
        )))
  );
}
function privatePath(path: string): string {
  return path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : resolve(path);
}
export async function load(path: string): Promise<unknown> {
  return JSON.parse(await readFile(privatePath(path), "utf8"));
}
export async function save(path: string, data: unknown): Promise<void> {
  const destination = privatePath(path);
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const file = await open(
    destination,
    constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.chmod(0o600);
    await file.writeFile(JSON.stringify(data, null, 2) + "\n", "utf8");
  } finally {
    await file.close();
  }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonical(item));
  if (record(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .toSorted()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}
export function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
export function origin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Sure URL must be an origin, not /api/v1");
  }
  requireValue(
    ["https:", "http:"].includes(url.protocol) &&
      url.hostname &&
      !url.username &&
      !url.password &&
      ["", "/"].includes(url.pathname) &&
      !url.search &&
      !url.hash,
    "Sure URL must be an origin, e.g. https://sure.example.com (not /api/v1)",
  );
  requireValue(
    url.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Non-local Sure connections require HTTPS",
  );
  return url.origin;
}

export class Sure {
  readonly url: string;
  private readonly key: string;
  private lastRequest = 0;
  constructor(url: string) {
    this.url = origin(url);
    const key = process.env.SURE_API_KEY;
    requireValue(nonempty(key), "Set SURE_API_KEY to a Sure read_write API key");
    this.key = key;
  }
  async request(
    method: string,
    path: string,
    payload?: unknown,
    params?: Record<string, string | number>,
  ): Promise<unknown> {
    requireValue(path.startsWith("/api/v1/"), "Invalid API path");
    await pause(Math.max(0, 250 - (Date.now() - this.lastRequest)));
    const url = new URL(this.url + path);
    for (const [key, value] of Object.entries(params ?? {}))
      url.searchParams.set(key, String(value));
    this.lastRequest = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
        headers: {
          "X-Api-Key": this.key,
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "amazon-categorize/1.0",
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
    } catch {
      throw new Error(
        "Sure connection failed; write outcome may be unknown. No automatic retry; re-run dry-run before committing.",
      );
    }
    requireValue(
      response.status < 300 || response.status >= 400,
      "Refusing API redirect; check SURE_URL (credential not forwarded)",
    );
    requireValue(
      response.ok,
      `Sure ${method} ${path}: HTTP ${response.status}; check key/scope/URL. No automatic retry; re-run dry-run to reconcile state.`,
    );
    return response.json();
  }
  async collection<T extends { id: string }>(
    name: string,
    accepts: (value: unknown) => value is T,
  ): Promise<T[]> {
    const rows: T[] = [];
    const seen = new Set<string>();
    for (let page = 1; ; page++) {
      const response = await this.request("GET", "/api/v1/" + name, undefined, {
        page,
        per_page: 100,
      });
      if (Array.isArray(response)) {
        requireValue(name === "tags", `Missing pagination for ${name}`);
        const items: unknown[] = response;
        for (const item of items) {
          requireValue(accepts(item), `Unexpected ${name} record`);
          rows.push(item);
        }
        return rows;
      }
      requireValue(
        record(response) && Array.isArray(response[name]),
        `Unexpected ${name} collection response`,
      );
      const items: unknown[] = response[name];
      for (const item of items) {
        requireValue(accepts(item), `Unexpected ${name} record`);
        if (!seen.has(item.id)) {
          rows.push(item);
          seen.add(item.id);
        }
      }
      if (name === "transactions" && response.split_parents !== undefined) {
        requireValue(Array.isArray(response.split_parents), "Unexpected split parent headers");
        for (const header of response.split_parents) {
          requireValue(
            record(header) && nonempty(header.transaction_id),
            "Split parent header must expose transaction_id for full payment ownership",
          );
          if (seen.has(header.transaction_id)) continue;
          // Header amounts are localized displays; only full detail carries exact minor units.
          const parent = await this.transaction(header.transaction_id);
          requireValue(accepts(parent), "Unexpected split parent transaction detail");
          rows.push(parent);
          seen.add(parent.id);
        }
      }
      const pagination = response.pagination;
      requireValue(
        record(pagination) &&
          typeof pagination.total_pages === "number" &&
          Number.isInteger(pagination.total_pages),
        `Missing ${name} pagination`,
      );
      requireValue(pagination.page === page, `Unexpected ${name} page; refusing incomplete scan`);
      if (page >= pagination.total_pages) return rows;
      requireValue(items.length > 0, `Empty ${name} page before end of collection`);
    }
  }
  async transaction(identifier: string): Promise<Transaction> {
    const value = await this.request(
      "GET",
      "/api/v1/transactions/" + encodeURIComponent(identifier),
    );
    requireValue(
      transactionValue(value) && value.id === identifier,
      "Unexpected transaction detail response",
    );
    return value;
  }
}
export function isAmazon(transaction: Transaction): boolean {
  return AMAZON.test([transaction.name ?? "", transaction.merchant?.name ?? ""].join(" "));
}
function isWoot(transaction: Transaction): boolean {
  return WOOT.test(transaction.name ?? "") || WOOT.test(transaction.merchant?.name ?? "");
}
export function eligible(transaction: Transaction): boolean {
  return isAmazon(transaction) && !transaction.category && (transaction.tags?.length ?? 0) === 0;
}
export function followUpOnly(transaction: Transaction): boolean {
  const tags = transaction.tags ?? [];
  return (
    isAmazon(transaction) &&
    !transaction.category &&
    tags.length === 1 &&
    tags[0]?.name.toLowerCase() === FOLLOW_UP
  );
}
export function requestedRevisits(document: unknown): Set<string> {
  requireValue(
    record(document) &&
      strings(document.transaction_ids) &&
      document.transaction_ids.length > 0 &&
      document.transaction_ids.every((id) => nonempty(id)),
    "Revisit scope must contain a nonempty transaction_ids array",
  );
  const ids = document.transaction_ids;
  requireValue(new Set(ids).size === ids.length, "Duplicate revisit transaction IDs");
  return new Set(ids);
}
export function blocked(transaction: Transaction): string | null {
  if (transaction.pending !== false) return "pending or missing pending status";
  const splitParent = Boolean(transaction.split_parent);
  const hasTransfer = Boolean(transaction.transfer);
  if (
    nonempty(transaction.parent_entry_id) ||
    splitParent ||
    (transaction.split_children?.length ?? 0) > 0
  )
    return "split transaction; requires split editor review";
  if (hasTransfer || !["expense", "income"].includes(transaction.classification))
    return "transfer or unsupported classification";
  if (isWoot(transaction))
    return "Woot purchase; use Woot order/payment history, not Amazon history";
  if (transaction.permissions?.can_annotate !== true) return "annotation permission unavailable";
  if (!Number.isSafeInteger(transaction.amount_cents))
    return "API must expose integer amount_cents; never parse localized display amounts";
  return null;
}
export function state(transaction: Transaction): Transaction {
  return {
    id: transaction.id,
    entry_id: transaction.entry_id ?? null,
    parent_entry_id: transaction.parent_entry_id ?? null,
    date: transaction.date,
    amount_cents: transaction.amount_cents,
    currency: transaction.currency,
    name: transaction.name ?? null,
    notes: transaction.notes ?? null,
    classification: transaction.classification,
    kind: transaction.kind ?? null,
    pending: transaction.pending ?? null,
    excluded: transaction.excluded ?? null,
    splittable: transaction.splittable ?? null,
    split_annotation_support: transaction.split_annotation_support ?? null,
    split_parent: transaction.split_parent ?? null,
    split_children: transaction.split_children ?? null,
    category: transaction.category ?? null,
    category_editable: transaction.category_editable ?? null,
    tags: transaction.tags ?? null,
    merchant: transaction.merchant ?? null,
    account: transaction.account ?? null,
    transfer: transaction.transfer ?? null,
    permissions: transaction.permissions ?? null,
    updated_at: transaction.updated_at ?? null,
  };
}
export async function readSnapshot(path: string): Promise<Snapshot> {
  const snapshot = await load(path);
  requireValue(
    snapshotValue(snapshot),
    "Unsupported snapshot or invalid transaction/taxonomy records",
  );
  return snapshot;
}

export async function readPlan(path: string): Promise<Plan> {
  const plan = await load(path);
  requireValue(planValue(plan), "Invalid plan");
  return plan;
}
export async function takeSnapshot(url: string, revisitPath?: string): Promise<Snapshot> {
  const api = new Sure(url);
  const transactions = (await api.collection("transactions", transactionValue)).filter(
    (transaction) => isAmazon(transaction),
  );
  const requested = nonempty(revisitPath)
    ? requestedRevisits(await load(revisitPath))
    : new Set<string>();
  const known = new Set(transactions.map((row) => row.id));
  requireValue(
    [...requested].every((id) => known.has(id)),
    "Revisit IDs include missing/non-Amazon transactions",
  );
  const targets: string[] = [];
  const skipped: Snapshot["skipped"] = [];
  const detailed: Transaction[] = [];
  for (let transaction of transactions) {
    const identifier = transaction.id;
    if (requested.size > 0 ? requested.has(identifier) : eligible(transaction)) {
      // Recovered split parents already have full details and remain ownership-only records.
      if ((transaction.split_children?.length ?? 0) === 0)
        transaction = await api.transaction(identifier);
      const allowed = requested.size > 0 ? followUpOnly(transaction) : eligible(transaction);
      if (allowed) {
        const reason = blocked(transaction);
        if (reason !== null) skipped.push({ transaction_id: identifier, reason });
        else targets.push(identifier);
      } else
        skipped.push({ transaction_id: identifier, reason: "category/tags no longer eligible" });
    }
    detailed.push(transaction);
  }
  return {
    version: VERSION,
    base_url: api.url,
    transactions: detailed,
    target_ids: targets.toSorted(),
    skipped,
    revisit_follow_up_ids: [...requested].toSorted(),
    categories: await api.collection("categories", categoryValue),
    tags: await api.collection("tags", tagValue),
  };
}
function isoDay(value: string): number {
  requireValue(/^\d{4}-\d{2}-\d{2}$/u.test(value), "Expected an ISO payment/shipment date");
  const time = Date.parse(value + "T00:00:00Z");
  requireValue(
    Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value,
    "Invalid payment/shipment date",
  );
  return time / 86_400_000;
}
export function validateCharges(document: unknown): Charge[] {
  requireValue(
    record(document) && document.version === VERSION && Array.isArray(document.charges),
    "Expected charges document with version: 1 and charges: []",
  );
  const charges: Charge[] = [];
  const identifiers = new Set<string>();
  const optionalDate = (value: unknown): string | undefined => {
    if (value === undefined || value === null) return undefined;
    requireValue(nonempty(value), "ISO payment/shipment date required");
    isoDay(value);
    return value;
  };
  for (const charge of document.charges) {
    requireValue(record(charge), "Expected a charge record");
    const id = charge.charge_id;
    requireValue(
      nonempty(id) && !identifiers.has(id),
      "Every actual payment needs a unique nonempty charge_id (deduplicate evidence)",
    );
    identifiers.add(id);
    requireValue(
      typeof charge.amount_minor === "number" &&
        Number.isSafeInteger(charge.amount_minor) &&
        charge.amount_minor > 0,
      `${id}: amount_minor must be positive integer minor units including tax/shipping/discounts`,
    );
    requireValue(
      typeof charge.currency === "string" && /^[A-Z]{3}$/u.test(charge.currency),
      `${id}: ISO currency required`,
    );
    requireValue(
      charge.kind === "charge" || charge.kind === "refund",
      `${id}: kind must be charge or refund`,
    );
    const chargedOn = optionalDate(charge.charged_on);
    const shippedOn = optionalDate(charge.shipped_on);
    requireValue(
      chargedOn !== undefined || shippedOn !== undefined,
      `${id}: payment or shipment date required; order date is not a fallback`,
    );
    if (charge.kind === "refund")
      requireValue(chargedOn !== undefined, `${id}: use actual refund date, not shipment date`);
    requireValue(nonempty(charge.source_url), `${id}: HTTPS evidence source_url required`);
    let source: URL;
    try {
      source = new URL(charge.source_url);
    } catch {
      throw new Error(`${id}: HTTPS evidence source_url required`);
    }
    requireValue(
      source.protocol === "https:" &&
        source.hostname.length > 0 &&
        !source.username &&
        !source.password,
      `${id}: HTTPS evidence source_url required`,
    );
    requireValue(nonempty(charge.evidence), `${id}: visible payment/shipment evidence required`);
    requireValue(
      Array.isArray(charge.orders) && charge.orders.length > 0,
      `${id}: orders required`,
    );
    const orders: Charge["orders"] = [];
    const orderNumbers = new Set<string>();
    for (const order of charge.orders) {
      requireValue(
        record(order) && typeof order.order_number === "string" && ORDER.test(order.order_number),
        `${id}: invalid Amazon order number`,
      );
      requireValue(!orderNumbers.has(order.order_number), `${id}: duplicate order number`);
      orderNumbers.add(order.order_number);
      requireValue(
        Array.isArray(order.items) && order.items.length > 0,
        `${id}: item list required`,
      );
      const items: Charge["orders"][number]["items"] = [];
      for (const item of order.items) {
        requireValue(
          record(item) &&
            nonempty(item.title) &&
            typeof item.quantity === "number" &&
            Number.isSafeInteger(item.quantity) &&
            item.quantity > 0,
          `${id}: each item needs title and positive integer quantity`,
        );
        items.push({
          title: item.title,
          quantity: item.quantity,
          ...itemFinancials(item, `${id}: ${order.order_number}`),
        });
      }
      orders.push({ order_number: order.order_number, items });
    }
    const normalized: Charge = {
      charge_id: id,
      kind: charge.kind,
      amount_minor: charge.amount_minor,
      currency: charge.currency,
      charged_on: chargedOn,
      shipped_on: shippedOn,
      source_url: charge.source_url,
      evidence: charge.evidence,
      orders,
    };
    if (charge.allocation !== undefined) normalized.allocation = allocation(charge.allocation, id);
    if (typeof charge.ordered_on === "string") normalized.ordered_on = charge.ordered_on;
    if (charge.merchant_descriptor !== undefined) {
      requireValue(
        nonempty(charge.merchant_descriptor),
        `${id}: merchant_descriptor must be nonempty visible payment merchant text`,
      );
      normalized.merchant_descriptor = charge.merchant_descriptor;
    }
    financialWeights(normalized);
    charges.push(normalized);
  }
  return charges;
}
export async function chargesFrom(path: string): Promise<Charge[]> {
  return validateCharges(await load(path));
}
function merchantFamily(descriptor: string | null | undefined): "retail" | "marketplace" | null {
  if (!nonempty(descriptor)) return null;
  const retail = /\bamazon\.com\b/iu.test(descriptor);
  const marketplace = /\b(?:amazon|amzn)[\s*-]*(?:mktp(?:l)?(?:\s*us)?|marketplace)\b/iu.test(
    descriptor,
  );
  return retail === marketplace ? null : retail ? "retail" : "marketplace";
}

function resolvePaymentComponent(
  identifier: string,
  candidates: Map<string, Omit<Candidate, "transaction_ids">[]>,
  owners: Map<string, string[]>,
  accounts: Map<string, string>,
  visited: Set<string>,
): void {
  if ((candidates.get(identifier)?.length ?? 0) === 0 || visited.has(identifier)) return;
  const ledgerIds = [identifier];
  const paymentIds = new Set<string>();
  visited.add(identifier);
  // Follow every owner, including annotated records, so a payment cannot escape its component.
  for (const ledgerId of ledgerIds) {
    for (const edge of candidates.get(ledgerId) ?? []) {
      if (paymentIds.has(edge.charge_id)) continue;
      paymentIds.add(edge.charge_id);
      for (const owner of owners.get(edge.charge_id) ?? []) {
        if (visited.has(owner)) continue;
        visited.add(owner);
        ledgerIds.push(owner);
      }
    }
  }
  if (ledgerIds.length < 2 || ledgerIds.length !== paymentIds.size) return;
  const account = accounts.get(identifier);
  if (!nonempty(account) || ledgerIds.some((id) => accounts.get(id) !== account)) return;
  const pending = new Set(ledgerIds);
  const remaining = new Set(paymentIds);
  const assigned = new Map<string, string>();
  // Publish only a complete forced pairing. No nearest-date choice, FIFO, or partial guesses.
  while (pending.size > 0) {
    let progressed = false;
    for (const ledgerId of pending) {
      let sole: string | undefined;
      let count = 0;
      for (const edge of candidates.get(ledgerId) ?? []) {
        if (!remaining.has(edge.charge_id)) continue;
        sole = edge.charge_id;
        if (++count > 1) break;
      }
      if (count === 0) return;
      if (count !== 1 || sole === undefined) continue;
      assigned.set(ledgerId, sole);
      pending.delete(ledgerId);
      remaining.delete(sole);
      progressed = true;
    }
    if (!progressed) return;
  }
  for (const [ledgerId, paymentId] of assigned) {
    const selected = candidates.get(ledgerId)?.find((edge) => edge.charge_id === paymentId);
    requireValue(selected, "Missing forced payment candidate");
    candidates.set(ledgerId, [selected]);
    owners.set(paymentId, [ledgerId]);
  }
}

function resolveOneToOne(
  transactions: Transaction[],
  candidates: Map<string, Omit<Candidate, "transaction_ids">[]>,
  owners: Map<string, string[]>,
): void {
  const accounts = new Map<string, string>();
  for (const transaction of transactions) {
    if (record(transaction.account) && nonempty(transaction.account.id))
      accounts.set(transaction.id, transaction.account.id);
  }
  const visited = new Set<string>();
  for (const identifier of candidates.keys())
    resolvePaymentComponent(identifier, candidates, owners, accounts, visited);
}

export function matches(
  snapshot: Pick<Snapshot, "transactions" | "target_ids">,
  charges: Charge[],
  windowDays = 4,
): Match[] {
  requireValue(
    Number.isInteger(windowDays) && windowDays >= 0 && windowDays <= 31,
    "Posting window must be 0..31 days",
  );
  const candidates = new Map<string, Omit<Candidate, "transaction_ids">[]>(),
    owners = new Map<string, string[]>();
  // Annotated records participate: another transaction must not reuse their payment.
  for (const transaction of snapshot.transactions) {
    const found: Omit<Candidate, "transaction_ids">[] = [];
    const hasTransfer = Boolean(transaction.transfer);
    if (
      !nonempty(transaction.parent_entry_id) &&
      transaction.pending === false &&
      !hasTransfer &&
      transaction.source !== "amazon-gift-card" &&
      !isWoot(transaction)
    ) {
      for (const charge of charges) {
        if (
          transaction.classification !== (charge.kind === "refund" ? "income" : "expense") ||
          transaction.amount_cents !== charge.amount_minor ||
          transaction.currency !== charge.currency
        )
          continue;
        const paymentMerchant = merchantFamily(charge.merchant_descriptor);
        const bankMerchant = merchantFamily(transaction.name);
        if (paymentMerchant !== null && bankMerchant !== null && paymentMerchant !== bankMerchant)
          continue;
        const basis = nonempty(charge.charged_on) ? "charged_on" : "shipped_on";
        const effective = charge.charged_on ?? charge.shipped_on;
        requireValue(nonempty(effective), "Payment or shipment date required");
        const days = isoDay(transaction.date) - isoDay(effective);
        if (days >= 0 && days <= windowDays) {
          found.push({ charge_id: charge.charge_id, lag_days: days, date_basis: basis });
          const ids = owners.get(charge.charge_id) ?? [];
          ids.push(transaction.id);
          owners.set(charge.charge_id, ids);
        }
      }
    }
    candidates.set(transaction.id, found);
  }
  resolveOneToOne(snapshot.transactions, candidates, owners);
  return snapshot.target_ids.map((id) => {
    const found = candidates.get(id) ?? [];
    const first = found[0];
    const unique =
      found.length === 1 && first !== undefined && owners.get(first.charge_id)?.length === 1;
    return {
      transaction_id: id,
      status: unique ? "unique" : found.length > 0 ? "ambiguous" : "unmatched",
      charge_id: unique ? first.charge_id : null,
      candidates: found.map((candidate) => ({
        charge_id: candidate.charge_id,
        lag_days: candidate.lag_days,
        date_basis: candidate.date_basis,
        transaction_ids: owners.get(candidate.charge_id) ?? [],
      })),
    };
  });
}
export function userNotes(original: string, identifier: string): string {
  let notes = original;
  for (const marker of [
    `amazon-categorize:${identifier}`,
    `amazon-categorize-revisit:${identifier}`,
    "AI Amazon",
  ]) {
    const opening = `[${marker}]\n`;
    const closing = `\n[/${marker}]`;
    for (;;) {
      const found = notes.startsWith(opening) ? 0 : notes.indexOf("\n" + opening);
      if (found < 0) break;
      const start = found === 0 && notes.startsWith(opening) ? 0 : found + 1;
      const end = notes.indexOf(closing, start + opening.length);
      requireValue(
        end >= 0 && (end + closing.length === notes.length || notes[end + closing.length] === "\n"),
        `${identifier}: incomplete AI note block; review instead of deleting text`,
      );
      const from = start >= 2 && notes.slice(start - 2, start) === "\n\n" ? start - 2 : start;
      notes = notes.slice(0, from) + notes.slice(end + closing.length);
    }
  }
  return notes;
}

function orderNote(charge: Charge): string {
  const rows: string[] = [];
  for (const order of charge.orders) {
    rows.push(`Amazon order ${order.order_number}`);
    for (const item of order.items) {
      const title = item.title.replaceAll(/\s+/gu, " ").trim();
      const concise =
        title.length <= 96
          ? title
          : title.slice(0, 64).trimEnd() + " … " + title.slice(-28).trimStart();
      rows.push(`${item.quantity} × ${concise}`);
    }
  }
  const digits =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: charge.currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const minor = charge.amount_minor.toString().padStart(digits + 1, "0");
  const amount = digits === 0 ? minor : minor.slice(0, -digits) + "." + minor.slice(-digits);
  const label =
    charge.kind === "refund" ? "Refunded" : nonempty(charge.charged_on) ? "Paid" : "Shipped";
  rows.push(`${label} ${charge.charged_on ?? charge.shipped_on} · ${charge.currency} ${amount}`);
  return rows.join("\n");
}

export function compactAnnotationNotes(
  transaction: Transaction,
  match: Match,
  charges: ReadonlyMap<string, Charge>,
  categorized: boolean,
): string {
  const lines = ["[AI Amazon]"];
  if (nonempty(match.charge_id)) {
    const charge = charges.get(match.charge_id);
    requireValue(charge, "Missing matched charge for evidence note");
    lines.push(orderNote(charge));
    if (!categorized) lines.push("Category needs review.");
  } else if (match.candidates.length > 0) {
    lines.push("UNCONFIRMED candidates:");
    for (const candidate of match.candidates) {
      const charge = charges.get(candidate.charge_id);
      requireValue(charge, "Missing candidate charge for evidence note");
      lines.push(orderNote(charge));
    }
  } else lines.push("Order number: unknown. Items: unknown.", "Payment match not confirmed.");
  lines.push("[/AI Amazon]");
  const prefix = userNotes(transaction.notes ?? "", transaction.id);
  return prefix + (prefix.length > 0 ? "\n\n" : "") + lines.join("\n");
}

export function buildPlan(
  snapshot: Snapshot,
  charges: Charge[],
  decisions: Decision[] = [],
  windowDays = 4,
): Plan {
  const chargeById = new Map(charges.map((charge) => [charge.charge_id, charge]));
  const categories = new Map(snapshot.categories.map((category) => [category.id, category]));
  const transactions = new Map(
    snapshot.transactions.map((transaction) => [transaction.id, transaction]),
  );
  const byId = new Map<string, Decision>();
  for (const decision of decisions) {
    requireValue(
      snapshot.target_ids.includes(decision.transaction_id) && !byId.has(decision.transaction_id),
      "Unknown or duplicate decision transaction",
    );
    requireValue(
      decisionValue(decision),
      "Reviewed decision reason/category/item_categories required",
    );
    if (nonempty(decision.category_id)) {
      requireValue(
        categories.has(decision.category_id),
        "Use an existing category ID, not a new category",
      );
    }
    byId.set(decision.transaction_id, decision);
  }
  const operations: Operation[] = [],
    unchanged: Plan["unchanged"] = [];
  const revisits = new Set(snapshot.revisit_follow_up_ids);
  for (const match of matches(snapshot, charges, windowDays)) {
    const identifier = match.transaction_id,
      transaction = transactions.get(identifier);
    requireValue(transaction, "Missing target transaction");
    const revisiting = revisits.has(identifier);
    requireValue(
      (revisiting ? followUpOnly(transaction) : eligible(transaction)) &&
        blocked(transaction) === null,
      `${identifier}: snapshot no longer eligible`,
    );
    const decision = byId.get(identifier);
    let categoryId = decision?.category_id;
    let split: SplitData | undefined;
    if (nonempty(categoryId) || decision?.item_categories !== undefined) {
      requireValue(
        match.status === "unique",
        `${identifier}: uncertain match must receive follow-up, not a category or split`,
      );
      requireValue(
        transaction.category_editable === true,
        `${identifier}: category is not editable`,
      );
    }
    if (decision?.item_categories !== undefined) {
      const charge = chargeById.get(match.charge_id!);
      requireValue(charge, "Missing uniquely matched charge");
      const assignments = reviewedItems(charge, decision.item_categories, categories);
      const categoryIds = new Set(assignments.map((item) => item.category_id));
      if (categoryIds.size === 1) categoryId = assignments[0]!.category_id;
      else split = computeSplit(charge, assignments, categories);
    }
    const reason = decision?.reason ?? `${match.status} match; category requires review`;
    if (revisiting && !nonempty(categoryId) && split === undefined) {
      unchanged.push({ transaction_id: identifier, match, reason });
      continue;
    }
    const patch: Patch = {
      notes: split
        ? splitParentNotes(userNotes(transaction.notes ?? "", identifier), split)
        : compactAnnotationNotes(transaction, match, chargeById, nonempty(categoryId)),
    };
    if (nonempty(categoryId)) patch.category_id = categoryId;
    operations.push({
      transaction_id: identifier,
      before: state(transaction),
      patch,
      follow_up: !nonempty(categoryId) && split === undefined,
      match,
      reason,
      ...(split ? { split } : {}),
    });
  }
  return {
    version: VERSION,
    base_url: snapshot.base_url,
    operations,
    revisit_follow_up_ids: [...revisits].toSorted(),
    unchanged,
    snapshot_sha256: digest(snapshot),
    charges_sha256: digest(charges),
    window_days: windowDays,
  };
}
export function desired(
  transaction: Transaction,
  operation: Operation,
  followTag: Tag | undefined,
  aiTag: Tag | undefined,
): boolean {
  const patch = operation.patch;
  if (transaction.notes !== patch.notes) return false;
  const tags = new Set(transaction.tags?.map((tag) => tag.id));
  if (nonempty(patch.category_id)) {
    return (
      transaction.category?.id === patch.category_id &&
      aiTag !== undefined &&
      tags.has(aiTag.id) &&
      (followTag === undefined || !tags.has(followTag.id))
    );
  }
  return (
    !transaction.category && followTag !== undefined && tags.size === 1 && tags.has(followTag.id)
  );
}

function previouslyCategorized(transaction: Transaction, operation: Operation): boolean {
  if (
    !nonempty(operation.patch.category_id) ||
    transaction.category?.id !== operation.patch.category_id ||
    transaction.notes !== operation.patch.notes ||
    transaction.tags?.some((tag) => tag.name.toLowerCase() === FOLLOW_UP) === true ||
    blocked(transaction) !== null
  )
    return false;
  // Exact managed annotations establish provenance; protected fields must still match the plan.
  return (
    digest({
      ...state(transaction),
      category: operation.before.category,
      notes: operation.before.notes,
      tags: operation.before.tags,
      updated_at: operation.before.updated_at,
    }) === digest(operation.before)
  );
}

function validatePlannedSplit(
  operation: Operation,
  categories: ReadonlyMap<string, Category>,
  windowDays: number,
): void {
  requireValue(
    operation.split &&
      !operation.follow_up &&
      operation.patch.category_id === undefined &&
      Object.keys(operation.split).every((key) =>
        ["charge", "item_categories", "rows"].includes(key),
      ),
    "Split plans accept only evidenced charge, reviewed item_categories and computed rows; no parent category",
  );
  const charge = validateCharges({ version: VERSION, charges: [operation.split.charge] })[0]!;
  const computed = computeSplit(charge, operation.split.item_categories, categories);
  requireValue(
    digest(operation.split) === digest(computed),
    "Split rows/evidence changed; regenerate the reviewed plan instead of hand-editing financial operations",
  );
  const match = matches(
    { transactions: [operation.before], target_ids: [operation.transaction_id] },
    [charge],
    windowDays,
  )[0]!;
  requireValue(
    match.status === "unique" && digest(match) === digest(operation.match),
    "Split requires an exact unique payment match",
  );
  requireValue(
    operation.patch.notes ===
      splitParentNotes(userNotes(operation.before.notes ?? "", operation.transaction_id), computed),
    "Split parent notes changed; regenerate the reviewed plan",
  );
}
export async function applyPlan(
  plan: Plan,
  options: { url: string; commit?: boolean; journal?: string },
): Promise<Record<string, unknown>> {
  requireValue(plan.version === VERSION && Array.isArray(plan.operations), "Invalid plan");
  requireValue(
    origin(plan.base_url) === origin(options.url),
    "Plan origin differs from SURE_URL; refusing writes",
  );
  if (options.commit === true)
    requireValue(nonempty(options.journal), "--journal is required with --commit");
  const api = new Sure(options.url);
  const categories = new Map(
    (await api.collection("categories", categoryValue)).map((category) => [category.id, category]),
  );
  const tags = await api.collection("tags", tagValue);
  const followTags = tags.filter((tag) => tag.name.toLowerCase() === FOLLOW_UP);
  requireValue(followTags.length <= 1, "Ambiguous follow-up tag names; resolve manually");
  let followTag = followTags[0];
  const aiTags = tags.filter((tag) => tag.name.toLowerCase() === AI_CATEGORIZED);
  requireValue(aiTags.length <= 1, "Ambiguous ai-categorized tag names; resolve manually");
  let aiTag = aiTags[0];
  const revisits = new Set(plan.revisit_follow_up_ids);
  const identifiers = new Set<string>();
  const splitPayments = new Set<string>();
  const prepared: { operation: Operation; before: Transaction; tagOnly: boolean }[] = [];
  const reports: JournalRow[] = [];
  // Preflight the entire mixed plan before tag creation, annotation or split writes.
  for (const operation of plan.operations) {
    const identifier = operation.transaction_id,
      patch = operation.patch;
    requireValue(
      typeof identifier === "string" &&
        !identifiers.has(identifier) &&
        Object.keys(operation).every((key) =>
          ["transaction_id", "before", "patch", "follow_up", "match", "reason", "split"].includes(
            key,
          ),
        ),
      "Duplicate/invalid operation",
    );
    identifiers.add(identifier);
    requireValue(
      Object.keys(patch).every((key) => ["notes", "category_id"].includes(key)) &&
        typeof patch.notes === "string",
      "Only notes/category_id annotations are accepted",
    );
    requireValue(
      typeof operation.follow_up === "boolean" &&
        operation.follow_up === (!nonempty(patch.category_id) && operation.split === undefined),
      "Plan must assign a category, create a reviewed split, or follow-up",
    );
    if (nonempty(patch.category_id)) {
      requireValue(categories.has(patch.category_id), "Category no longer exists");
      requireValue(
        operation.match.status === "unique",
        "Category requires a unique shipment match",
      );
    }
    const before = operation.before,
      revisiting = revisits.has(identifier);
    requireValue(
      before.id === identifier &&
        (revisiting ? followUpOnly(before) : eligible(before)) &&
        blocked(before) === null,
      "Invalid original target",
    );
    if (revisiting) {
      requireValue(
        !operation.follow_up && followTag !== undefined && before.tags?.[0]?.id === followTag.id,
        "Revisit may only resolve the existing follow-up tag with a category",
      );
    }
    const prefix = userNotes(before.notes ?? "", identifier);
    requireValue(
      patch.notes.startsWith(prefix + (prefix.length > 0 ? "\n\n" : "") + "[AI Amazon]\n") &&
        patch.notes.endsWith("[/AI Amazon]") &&
        userNotes(patch.notes, identifier) === prefix,
      "Plan must preserve original notes and include compact AI evidence; rebuild verbose plans",
    );
    if (operation.split !== undefined) {
      validatePlannedSplit(operation, categories, plan.window_days);
      requireValue(
        !splitPayments.has(operation.split.charge.charge_id),
        "An actual payment cannot fund more than one split parent",
      );
      splitPayments.add(operation.split.charge.charge_id);
    }
    const current = await api.transaction(identifier);
    if (operation.split !== undefined) {
      requireValue(
        current.split_annotation_support === true,
        `${identifier}: split_annotation_support capability unavailable; deploy API and refresh snapshot/plan`,
      );
      requireValue(
        current.permissions?.can_edit === true && current.permissions.can_annotate === true,
        `${identifier}: split requires can_edit and annotation permissions`,
      );
      const originalReason = splitBlocked(before);
      requireValue(
        originalReason === null,
        `${identifier}: captured split capability/permission/state unavailable; refresh snapshot and plan (${originalReason})`,
      );
      const isSplitParent = Boolean(current.split_parent);
      if (isSplitParent || (current.split_children?.length ?? 0) > 0 || current.excluded === true) {
        const childIds = await verifyAppliedSplit(
          api,
          current,
          operation,
          aiTag,
          followTag,
          digest,
        );
        reports.push({
          transaction_id: identifier,
          status: "already_applied",
          follow_up: false,
          split_child_ids: childIds,
        });
        continue;
      }
      const reason = splitBlocked(current);
      requireValue(reason === null, `${identifier}: ${reason}`);
      requireValue(
        digest(state(current)) === digest(before),
        `${identifier}: changed since discovery; regenerate the snapshot and plan`,
      );
      prepared.push({ operation, before: state(current), tagOnly: false });
      continue;
    }
    if (desired(current, operation, followTag, aiTag)) {
      reports.push({ transaction_id: identifier, status: "already_applied" });
      continue;
    }
    const tagOnly = previouslyCategorized(current, operation);
    requireValue(
      tagOnly || (digest(state(current)) === digest(before) && blocked(current) === null),
      `${identifier}: changed since discovery; regenerate the snapshot and plan`,
    );
    if (nonempty(patch.category_id) && !tagOnly) {
      requireValue(
        current.category_editable === true,
        `${identifier}: category editing unavailable`,
      );
    }
    prepared.push({ operation, before: state(current), tagOnly });
  }
  if (options.commit !== true) {
    return {
      mode: "dry-run",
      ready: prepared.length,
      tag_only: prepared.filter((entry) => entry.tagOnly).length,
      already_applied: reports.length,
      split_parents:
        prepared.filter((entry) => entry.operation.split !== undefined).length +
        reports.filter((entry) => entry.split_child_ids !== undefined).length,
      split_children:
        prepared.reduce((sum, entry) => sum + (entry.operation.split?.rows.length ?? 0), 0) +
        reports.reduce((sum, entry) => sum + (entry.split_child_ids?.length ?? 0), 0),
      would_create_follow_up_tag: !followTag && prepared.some((entry) => entry.operation.follow_up),
      would_create_ai_categorized_tag:
        !aiTag && prepared.some((entry) => !entry.operation.follow_up),
    };
  }
  const journal = { version: VERSION, plan_sha256: digest(plan), results: reports };
  requireValue(nonempty(options.journal), "--journal is required with --commit");
  await save(options.journal, journal);
  if (!followTag && prepared.some((entry) => entry.operation.follow_up)) {
    const tag = await api.request("POST", "/api/v1/tags", {
      tag: { name: FOLLOW_UP, color: "#e99537" },
    });
    requireValue(tagValue(tag) && tag.name === FOLLOW_UP, "Unexpected created tag response");
    followTag = tag;
  }
  if (!aiTag && prepared.some((entry) => !entry.operation.follow_up)) {
    const tag = await api.request("POST", "/api/v1/tags", {
      tag: { name: AI_CATEGORIZED, color: "#6172f3" },
    });
    requireValue(
      tagValue(tag) && tag.name.toLowerCase() === AI_CATEGORIZED,
      "Unexpected created ai-categorized tag response",
    );
    aiTag = tag;
  }
  for (const { operation, before, tagOnly } of prepared) {
    const identifier = operation.transaction_id;
    const current = await api.transaction(identifier);
    requireValue(
      digest(state(current)) === digest(before) && blocked(current) === null,
      `${identifier}: changed during apply; stopping without overwriting`,
    );
    if (operation.split !== undefined) {
      const reason = splitBlocked(current);
      requireValue(reason === null, `${identifier}: ${reason}`);
      await api.request(
        "POST",
        "/api/v1/transactions/" + encodeURIComponent(identifier) + "/split",
        {
          split: {
            splits: operation.split.rows.map((row) => ({
              name: row.name,
              amount:
                (operation.split!.charge.kind === "charge" ? "-" : "") +
                majorAmount(row.amount_minor, current.currency),
              category_id: row.category_id,
              tag_ids: [aiTag!.id],
            })),
            parent: {
              notes: operation.patch.notes,
              tag_ids: parentTagIds(
                before,
                aiTag!,
                revisits.has(identifier) ? followTag : undefined,
              ),
            },
          },
        },
      );
      const childIds = await verifyAppliedSplit(
        api,
        await api.transaction(identifier),
        operation,
        aiTag,
        followTag,
        digest,
      );
      reports.push({
        transaction_id: identifier,
        status: "applied",
        follow_up: false,
        split_child_ids: childIds,
      });
      await save(options.journal, journal);
      continue;
    }
    const patch: Partial<Patch> & { tag_ids?: string[] } = tagOnly ? {} : { ...operation.patch };
    if (operation.follow_up) patch.tag_ids = [followTag!.id];
    else {
      const tagIds = new Set(current.tags?.map((tag) => tag.id));
      if (revisits.has(identifier) && followTag !== undefined) tagIds.delete(followTag.id);
      tagIds.add(aiTag!.id);
      patch.tag_ids = [...tagIds];
    }
    await api.request("PATCH", "/api/v1/transactions/" + encodeURIComponent(identifier), {
      transaction: patch,
    });
    requireValue(
      desired(await api.transaction(identifier), operation, followTag, aiTag),
      `${identifier}: read-back does not match; stop and inspect`,
    );
    reports.push({ transaction_id: identifier, status: "applied", follow_up: operation.follow_up });
    await save(options.journal, journal);
  }
  return {
    mode: "committed",
    applied: prepared.length,
    categorized: prepared.filter(
      (entry) =>
        !entry.operation.follow_up && !entry.tagOnly && entry.operation.split === undefined,
    ).length,
    follow_up: prepared.filter((entry) => entry.operation.follow_up).length,
    tag_only: prepared.filter((entry) => entry.tagOnly).length,
    already_applied: reports.length - prepared.length,
    split_parents: reports.filter((entry) => entry.split_child_ids !== undefined).length,
    split_children: reports.reduce((sum, entry) => sum + (entry.split_child_ids?.length ?? 0), 0),
    journal: options.journal,
  };
}
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      url: { type: "string" },
      out: { type: "string" },
      snapshot: { type: "string" },
      charges: { type: "string" },
      decisions: { type: "string" },
      plan: { type: "string" },
      journal: { type: "string" },
      "window-days": { type: "string", default: "4" },
      "revisit-follow-up-ids": { type: "string" },
      commit: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help === true) {
    process.stdout.write(
      "Usage: node amazon-categorize.ts snapshot --out FILE [--revisit-follow-up-ids FILE]\n       node amazon-categorize.ts match|plan --snapshot FILE --charges FILE --out FILE [--decisions FILE] [--window-days 4]\n       node amazon-categorize.ts apply --plan FILE [--commit --journal FILE]\nSet SURE_URL (origin) and SURE_API_KEY (read_write) in the environment.\n",
    );
    return;
  }
  requireValue(positionals.length === 1, "Specify snapshot, match, plan, or apply");
  const command = positionals[0];
  const required = (key: "out" | "snapshot" | "charges" | "plan"): string => {
    const value = values[key];
    requireValue(nonempty(value), `--${key} is required`);
    return value;
  };
  const url = () => {
    const value = values.url ?? process.env.SURE_URL;
    requireValue(nonempty(value), "Set SURE_URL or pass --url; no implicit server");
    return value;
  };
  let report: unknown;
  if (command === "snapshot") {
    const snapshot = await takeSnapshot(url(), values["revisit-follow-up-ids"]);
    await save(required("out"), snapshot);
    report = {
      amazon_transactions: snapshot.transactions.length,
      targets: snapshot.target_ids.length,
      skipped: snapshot.skipped,
    };
  } else if (command === "match" || command === "plan") {
    const snapshot = await readSnapshot(required("snapshot"));
    const charges = await chargesFrom(required("charges"));
    const windowDays = Number(values["window-days"]);
    if (command === "match") {
      const rows = matches(snapshot, charges, windowDays);
      await save(required("out"), { version: VERSION, matches: rows });
      report = Object.fromEntries(
        ["unique", "ambiguous", "unmatched"].map((status) => [
          status,
          rows.filter((row) => row.status === status).length,
        ]),
      );
    } else {
      const document = nonempty(values.decisions)
        ? await load(values.decisions)
        : { decisions: [] };
      requireValue(
        record(document) &&
          Array.isArray(document.decisions) &&
          document.decisions.every((decision): decision is Decision => decisionValue(decision)),
        "Expected reviewed decisions: []",
      );
      const plan = buildPlan(snapshot, charges, document.decisions, windowDays);
      await save(required("out"), plan);
      report = {
        operations: plan.operations.length,
        categorized: plan.operations.filter((op) => !op.follow_up && op.split === undefined).length,
        follow_up: plan.operations.filter((op) => op.follow_up).length,
        unchanged: plan.unchanged.length,
        split_parents: plan.operations.filter((op) => op.split !== undefined).length,
        split_children: plan.operations.reduce((sum, op) => sum + (op.split?.rows.length ?? 0), 0),
      };
    }
  } else if (command === "apply") {
    const path = required("plan");
    requireValue(
      values.commit !== true || nonempty(values.journal),
      "--journal is required with --commit",
    );
    requireValue(
      values.journal === undefined || privatePath(values.journal) !== privatePath(path),
      "Journal must not overwrite the reviewed plan",
    );
    report = await applyPlan(await readPlan(path), {
      url: url(),
      commit: values.commit,
      journal: values.journal,
    });
  } else throw new Error("Unknown command: " + command);
  process.stdout.write(JSON.stringify(report) + "\n");
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
