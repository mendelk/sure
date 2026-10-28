#!/usr/bin/env node
/** Authorized Amazon gift-card cash-account import; never edits existing ledger records. */
/* oxlint-disable eslint/no-await-in-loop -- API pagination and financial create/journal/read-back sequences must remain ordered to preserve ownership checks and unknown-outcome recovery. */
import { homedir } from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { Sure, digest, load, origin, save, type Tag } from "./amazon-categorize.ts";
import { walletPaymentRoots } from "./amazon-splits.ts";
import {
  reviewGiftCardHistory,
  validateGiftCardHistoryPrefix,
  type GiftCardActivity,
  type GiftCardHistoryPrefix,
  type GiftCardIdentity,
} from "./amazon-gift-card-review.ts";

type AccountRequest = {
  account: {
    name: string;
    account_type: "depository";
    subtype: "cash";
    currency: "USD";
    balance: string;
    opening_balance_date: string;
    institution_name: string;
    institution_domain: string;
    enable_category_matcher: false;
    notes: string;
  };
};
export interface GiftCardImportRow {
  import_id: string;
  source_fingerprint: string;
  date: string;
  kind: GiftCardActivity["kind"];
  amount_minor: number;
  closing_balance_minor: number;
  transaction: {
    date: string;
    amount: string;
    nature: "inflow" | "outflow";
    currency: "USD";
    name: string;
    notes: string;
    category_id: null;
    tag_names: string[];
    source: "amazon-gift-card";
    external_id: string;
    user_modified: true;
  };
}
export interface GiftCardImportPlan {
  version: 1;
  kind: "amazon-gift-card-import";
  base_url: string;
  captures: unknown;
  identity: GiftCardIdentity;
  account_request: AccountRequest;
  expected_balance_minor: number;
  rows: GiftCardImportRow[];
}
interface Account {
  id: string;
  name: string;
  account_type: string;
  subtype: string | null;
  currency: string;
  notes: string | null;
  balance_cents: number;
  institution_name?: string | null;
  institution_domain?: string | null;
  enable_category_matcher?: boolean;
  permissions?: { can_edit?: boolean };
}
interface ImportedTransaction {
  id: string;
  date: string;
  name: string;
  notes: string | null;
  amount_cents: number;
  signed_amount_cents: number;
  currency: string;
  classification: string;
  source: string | null;
  external_id: string | null;
  account: { id: string };
  category: { id: string } | null;
  tags: Tag[];
  transfer: null | { id: string; status: string; other_account?: unknown };
  parent_entry_id?: string | null;
  entry_id?: string;
  split_parent?: unknown;
  split_children?: unknown[];
  pending?: boolean;
  excluded?: boolean;
}
interface Journal {
  version: 1;
  kind: "amazon-gift-card-import-journal";
  base_url: string;
  history: GiftCardHistoryPrefix;
  account_request_hash: string;
  account_id: string | null;
  account_identity: Record<string, unknown> | null;
  verified: Record<string, { transaction_id: string; source_fingerprint: string }>;
  pending: null | { kind: "account" | "tag" | "transaction"; key: string };
}
const NAMES: Record<GiftCardActivity["kind"], string> = {
  redemption: "Amazon Gift Card purchase",
  refund: "Amazon Gift Card refund",
  hold_release: "Amazon Gift Card hold release",
  gift_card_added: "Amazon Gift Card added",
  reload: "Amazon Gift Card reload",
  auto_reload: "Amazon Gift Card auto-reload",
  allowance: "Amazon Gift Card allowance",
  cash_load: "Amazon Cash load",
  unknown: "Amazon Gift Card activity",
};
function requireValue(value: boolean, message: string): asserts value {
  if (!value) throw new Error(message);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function minor(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}
function major(value: number): string {
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
function accountValue(value: unknown): value is Account {
  return (
    record(value) &&
    nonempty(value.id) &&
    nonempty(value.name) &&
    nonempty(value.account_type) &&
    (typeof value.subtype === "string" || value.subtype === null) &&
    nonempty(value.currency) &&
    (typeof value.notes === "string" || value.notes === null) &&
    minor(value.balance_cents)
  );
}
function tagValue(value: unknown): value is Tag {
  return record(value) && nonempty(value.id) && nonempty(value.name);
}
function transactionValue(value: unknown): value is ImportedTransaction {
  return (
    record(value) &&
    nonempty(value.id) &&
    nonempty(value.date) &&
    typeof value.name === "string" &&
    (typeof value.notes === "string" || value.notes === null) &&
    minor(value.amount_cents) &&
    value.amount_cents > 0 &&
    minor(value.signed_amount_cents) &&
    nonempty(value.currency) &&
    nonempty(value.classification) &&
    (value.source === null || typeof value.source === "string") &&
    (value.external_id === null || typeof value.external_id === "string") &&
    record(value.account) &&
    nonempty(value.account.id) &&
    (value.category === null || (record(value.category) && nonempty(value.category.id))) &&
    Array.isArray(value.tags) &&
    value.tags.every(tagValue) &&
    (value.transfer === null ||
      (record(value.transfer) && nonempty(value.transfer.id) && nonempty(value.transfer.status))) &&
    (value.parent_entry_id === undefined ||
      value.parent_entry_id === null ||
      typeof value.parent_entry_id === "string") &&
    (value.split_children === undefined || Array.isArray(value.split_children)) &&
    (value.pending === undefined || typeof value.pending === "boolean") &&
    (value.excluded === undefined || typeof value.excluded === "boolean")
  );
}

/** All annotations and financial requests are derived, not editable plan instructions. */
export function buildGiftCardImportPlan(captures: unknown, url: string): GiftCardImportPlan {
  const review = reviewGiftCardHistory(captures, { accounts: [] });
  const proposal = review.account_proposal;
  requireValue(proposal !== null, "Missing reconciled account proposal");
  return {
    version: 1,
    kind: "amazon-gift-card-import",
    base_url: origin(url),
    captures,
    identity: review.identity,
    account_request: {
      account: {
        ...proposal.account,
        account_type: "depository",
        subtype: "cash",
        currency: "USD",
        enable_category_matcher: false,
        notes: `[amazon-gift-card-import:v1:${review.identity.root_hash}]`,
      },
    },
    expected_balance_minor: review.current_balance_minor,
    rows: review.activities.map((row) => ({
      import_id: row.import_id,
      source_fingerprint: row.source_fingerprint,
      date: row.date,
      kind: row.kind,
      amount_minor: row.amount_minor,
      closing_balance_minor: row.closing_balance_minor,
      transaction: {
        date: row.date,
        amount: major(Math.abs(row.amount_minor)),
        nature: row.amount_minor > 0 ? "inflow" : "outflow",
        currency: "USD",
        name: NAMES[row.kind],
        notes: `[AI Amazon] Order number: ${row.order_number ?? "unknown"}. Items: unknown.${row.kind === "gift_card_added" ? " Funding: unconfirmed." : ""}`,
        category_id: null,
        tag_names: row.kind === "gift_card_added" ? ["ai-follow-up"] : ["follow-up"],
        source: "amazon-gift-card",
        external_id: row.import_id,
        user_modified: true,
      },
    })),
  };
}
function history(plan: GiftCardImportPlan): GiftCardHistoryPrefix {
  return {
    identity: plan.identity,
    activities: plan.rows.map((row) => ({ source_fingerprint: row.source_fingerprint })),
  };
}
function accountIdentity(account: Account): Record<string, unknown> {
  // Cached balances and timestamps are asynchronous, not account identity.
  return {
    id: account.id,
    name: account.name,
    account_type: account.account_type,
    subtype: account.subtype,
    currency: account.currency,
    institution_name: account.institution_name,
    institution_domain: account.institution_domain,
    enable_category_matcher: account.enable_category_matcher,
  };
}
function checkAccount(account: Account, plan: GiftCardImportPlan, journal: Journal): void {
  const wanted = plan.account_request.account;
  requireValue(
    account.name === wanted.name &&
      account.account_type === "depository" &&
      account.subtype === "cash" &&
      account.currency === "USD" &&
      account.institution_name === wanted.institution_name &&
      account.institution_domain === wanted.institution_domain &&
      account.enable_category_matcher === false,
    "Gift-card account financial identity or importer settings changed",
  );
  requireValue(
    account.notes === wanted.notes || journal.account_id === account.id,
    "Account is not marker-owned or journal-owned",
  );
  if (journal.account_identity !== null) {
    requireValue(
      digest(accountIdentity(account)) === digest(journal.account_identity),
      "Journal account identity changed",
    );
  }
}
function checkFinancial(
  transaction: ImportedTransaction,
  row: GiftCardImportRow,
  accountId: string,
): void {
  requireValue(
    transaction.account.id === accountId &&
      transaction.source === row.transaction.source &&
      transaction.external_id === row.import_id &&
      transaction.date === row.date &&
      transaction.currency === "USD" &&
      transaction.amount_cents === Math.abs(row.amount_minor) &&
      transaction.signed_amount_cents === row.amount_minor &&
      transaction.classification === (row.amount_minor > 0 ? "income" : "expense") &&
      (transaction.parent_entry_id === undefined ||
        transaction.parent_entry_id === null ||
        transaction.parent_entry_id === "") &&
      (transaction.split_parent === undefined ||
        transaction.split_parent === null ||
        transaction.split_parent === false) &&
      transaction.pending !== true &&
      (transaction.excluded !== true || (transaction.split_children?.length ?? 0) >= 2),
    `Imported transaction financial identity mismatch: ${row.import_id}`,
  );
  // Matching may change kind and attach a transfer; neither is a financial mismatch.
}
function checkAnnotations(
  transaction: ImportedTransaction,
  row: GiftCardImportRow,
  tags: Map<string, Tag>,
): void {
  const ids = row.transaction.tag_names
    .map((name) => {
      const tag = tags.get(name);
      requireValue(tag !== undefined, `Missing required actual tag: ${name}`);
      return tag.id;
    })
    .toSorted((left, right) => left.localeCompare(right));
  requireValue(
    transaction.name === row.transaction.name &&
      transaction.notes === row.transaction.notes &&
      transaction.category === null &&
      digest(
        transaction.tags.map((tag) => tag.id).toSorted((left, right) => left.localeCompare(right)),
      ) === digest(ids),
    `Imported transaction annotations mismatch before verification: ${row.import_id}`,
  );
}
function resolveTags(tags: Tag[], required: string[]): Map<string, Tag> {
  requireValue(new Set(tags.map((tag) => tag.id)).size === tags.length, "Duplicate tag IDs");
  const result = new Map<string, Tag>();
  for (const name of required) {
    const candidates = tags.filter((tag) => tag.name.toLowerCase() === name.toLowerCase());
    requireValue(candidates.length <= 1, `Ambiguous case-insensitive tag: ${name}`);
    if (candidates[0]) result.set(name, candidates[0]);
  }
  return result;
}
async function readAccount(api: Sure, id: string): Promise<Account> {
  const value = await api.request("GET", "/api/v1/accounts/" + encodeURIComponent(id));
  requireValue(accountValue(value) && value.id === id, "Unexpected account detail response");
  return value;
}
async function readTransaction(api: Sure, id: string): Promise<ImportedTransaction> {
  const value = await api.request("GET", "/api/v1/transactions/" + encodeURIComponent(id));
  requireValue(
    transactionValue(value) && value.id === id,
    "Unexpected imported transaction detail response",
  );
  return value;
}
async function accountRows(api: Sure, accountId: string): Promise<ImportedTransaction[]> {
  const result: ImportedTransaction[] = [];
  const ids = new Set<string>();
  const keys = new Set<string>();
  const parents = new Set<string>();
  for (let page = 1; ; page++) {
    const value = await api.request("GET", "/api/v1/transactions", undefined, {
      account_id: accountId,
      page,
      per_page: 100,
    });
    requireValue(
      record(value) && Array.isArray(value.transactions) && record(value.pagination),
      "Unexpected account transaction collection response",
    );
    requireValue(
      value.split_parents === undefined || Array.isArray(value.split_parents),
      "Invalid wallet split-parent headers",
    );
    for (const header of value.split_parents ?? []) {
      requireValue(
        record(header) && nonempty(header.transaction_id),
        "Invalid wallet split header",
      );
      parents.add(header.transaction_id);
    }
    for (const row of value.transactions) {
      requireValue(
        transactionValue(row),
        "Unexpected or foreign transaction data in gift-card account",
      );
      requireValue(
        row.account.id === accountId,
        "Foreign account transaction returned by account filter",
      );
      const key = `${row.source}\n${row.external_id}`;
      requireValue(!ids.has(row.id), "Duplicate imported transaction ID");
      if (!nonempty(row.parent_entry_id)) {
        requireValue(!keys.has(key), "Duplicate imported source/external_id key");
        keys.add(key);
      }
      ids.add(row.id);
      result.push(row);
    }
    const pagination = value.pagination;
    requireValue(
      pagination.page === page &&
        typeof pagination.total_pages === "number" &&
        Number.isSafeInteger(pagination.total_pages) &&
        pagination.total_pages >= 0,
      "Missing or unexpected account transaction pagination",
    );
    if (page >= pagination.total_pages) break;
    requireValue(value.transactions.length > 0, "Empty account transaction page before end");
  }
  for (const id of parents) {
    if (ids.has(id)) continue;
    result.push(await readTransaction(api, id));
  }
  // Collection rows omit split_parent; validate the authoritative child linkage from detail.
  for (let index = 0; index < result.length; index++) {
    const row = result[index]!;
    if (nonempty(row.parent_entry_id)) result[index] = await readTransaction(api, row.id);
  }
  return walletPaymentRoots(result, accountId);
}
function initialJournal(plan: GiftCardImportPlan): Journal {
  return {
    version: 1,
    kind: "amazon-gift-card-import-journal",
    base_url: plan.base_url,
    history: history(plan),
    account_request_hash: digest(plan.account_request),
    account_id: null,
    account_identity: null,
    verified: {},
    pending: null,
  };
}
function journalValue(value: unknown): value is Journal {
  return (
    record(value) &&
    value.version === 1 &&
    value.kind === "amazon-gift-card-import-journal" &&
    nonempty(value.base_url) &&
    nonempty(value.account_request_hash) &&
    record(value.history) &&
    record(value.history.identity) &&
    nonempty(value.history.identity.scheme) &&
    nonempty(value.history.identity.root_hash) &&
    nonempty(value.history.identity.head_hash) &&
    Array.isArray(value.history.activities) &&
    value.history.activities.every((row) => record(row) && nonempty(row.source_fingerprint)) &&
    (value.account_id === null || nonempty(value.account_id)) &&
    (value.account_identity === null || record(value.account_identity)) &&
    record(value.verified) &&
    Object.values(value.verified).every(
      (entry) =>
        record(entry) && nonempty(entry.transaction_id) && nonempty(entry.source_fingerprint),
    ) &&
    (value.pending === null ||
      (record(value.pending) &&
        (value.pending.kind === "account" ||
          value.pending.kind === "tag" ||
          value.pending.kind === "transaction") &&
        nonempty(value.pending.key)))
  );
}
function readJournal(value: unknown, plan: GiftCardImportPlan): Journal {
  requireValue(
    journalValue(value) &&
      value.base_url === plan.base_url &&
      value.account_request_hash === digest(plan.account_request),
    "Invalid or conflicting gift-card import journal",
  );
  const journal = value;
  validateGiftCardHistoryPrefix(journal.history, history(plan));
  requireValue(
    (journal.account_id === null) === (journal.account_identity === null),
    "Incomplete journal account identity",
  );
  const rows = new Map(plan.rows.map((row) => [row.import_id, row]));
  const ids = new Set<string>();
  for (const [key, verified] of Object.entries(journal.verified)) {
    requireValue(
      record(verified) &&
        nonempty(verified.transaction_id) &&
        verified.source_fingerprint === rows.get(key)?.source_fingerprint &&
        !ids.has(verified.transaction_id),
      "Invalid journal verified transaction identity",
    );
    ids.add(verified.transaction_id);
  }
  requireValue(
    journal.account_id !== null || ids.size === 0,
    "Verified rows without an owned account",
  );
  return journal;
}
function checkedPlan(value: unknown, url: string): GiftCardImportPlan {
  requireValue(record(value), "Invalid gift-card import plan");
  const rebuilt = buildGiftCardImportPlan(value.captures, url);
  requireValue(
    digest(value) === digest(rebuilt),
    "Gift-card import plan changed or target origin mismatch; rebuild from captures",
  );
  return rebuilt;
}

/** Dry-run performs fresh API reads only; private journal recovery may be persisted. */
export async function applyGiftCardImportPlan(
  plan: GiftCardImportPlan,
  options: {
    url: string;
    commit?: boolean;
    journal?: string;
    onProgress?: (verified: number, total: number) => void;
  },
): Promise<Record<string, unknown>> {
  const rebuilt = checkedPlan(plan, options.url);
  requireValue(
    options.commit !== true || nonempty(options.journal),
    "--journal is required with --commit",
  );
  let journal = initialJournal(rebuilt);
  if (nonempty(options.journal)) {
    try {
      journal = readJournal(await load(options.journal), rebuilt);
    } catch (error) {
      if (!(record(error) && error.code === "ENOENT")) throw error;
    }
  }
  requireValue(
    options.commit !== true || journal.pending === null,
    "Previous write outcome unknown; re-run dry-run with the same journal before committing",
  );
  const persist = async () => {
    if (nonempty(options.journal)) await save(options.journal, journal);
  };
  const api = new Sure(rebuilt.base_url);
  const accounts = await api.collection("accounts", accountValue);
  const needed = [...new Set(rebuilt.rows.flatMap((row) => row.transaction.tag_names))];
  let tags = resolveTags(await api.collection("tags", tagValue), needed);
  const marker = rebuilt.account_request.account.notes;
  const owned = accounts.filter(
    (account) => account.id === journal.account_id || account.notes === marker,
  );
  requireValue(owned.length <= 1, "Multiple marker-owned or journal-owned gift-card accounts");
  requireValue(
    journal.account_id === null || owned.some((account) => account.id === journal.account_id),
    "Journal-owned gift-card account missing from fresh inventory",
  );
  const conflicts = accounts.filter(
    (account) =>
      /amazon.*gift|gift.*amazon/iu.test(account.name) &&
      !owned.some((candidate) => candidate.id === account.id),
  );
  requireValue(
    conflicts.length === 0,
    "Conflicting unknown Amazon gift-card account; refusing duplicate account",
  );
  let account: Account | null = owned[0] ? await readAccount(api, owned[0].id) : null;
  if (account) checkAccount(account, rebuilt, journal);
  const byImportId = new Map(rebuilt.rows.map((row) => [row.import_id, row]));
  const existing = new Map<string, ImportedTransaction>();
  if (account) {
    for (const listed of await accountRows(api, account.id)) {
      requireValue(nonempty(listed.external_id), "Missing original wallet external identity");
      const row = byImportId.get(listed.external_id);
      requireValue(
        row !== undefined && listed.source === "amazon-gift-card",
        "Unexpected imported source or external_id in gift-card account",
      );
      checkFinancial(listed, row, account.id);
      // Index and show render the same complete transaction partial.
      const transaction = listed;
      const verified = journal.verified[row.import_id];
      requireValue(
        verified === undefined || verified.transaction_id === transaction.id,
        "Journal transaction ID changed",
      );
      if (!verified) checkAnnotations(transaction, row, tags);
      existing.set(row.import_id, transaction);
    }
  }
  for (const key of Object.keys(journal.verified))
    requireValue(existing.has(key), "Previously verified transaction missing; refusing recreation");
  // All remote ownership, rows, annotations and history are checked before the first API write.
  journal.history = history(rebuilt);
  if (account) {
    journal.account_id = account.id;
    journal.account_identity = accountIdentity(account);
  }
  for (const [key, transaction] of existing) {
    journal.verified[key] = {
      transaction_id: transaction.id,
      source_fingerprint: byImportId.get(key)!.source_fingerprint,
    };
  }
  journal.pending = null;
  if (options.commit === true || nonempty(options.journal)) await persist();
  let accountCreated = 0;
  let applied = 0;
  let tagsCreated = 0;
  const alreadyApplied = existing.size;
  const missingTags = [
    ...new Set(
      rebuilt.rows
        .filter((row) => !existing.has(row.import_id))
        .flatMap((row) => row.transaction.tag_names),
    ),
  ].filter((name) => !tags.has(name));
  if (options.commit === true) {
    requireValue(
      account === null || account.permissions?.can_edit === true,
      "Gift-card account is not writable",
    );
    if (!account) {
      journal.pending = { kind: "account", key: marker };
      await persist();
      const created = await api.request("POST", "/api/v1/accounts", rebuilt.account_request);
      requireValue(
        accountValue(created),
        "Unexpected account create response; outcome unknown, re-run dry-run",
      );
      account = await readAccount(api, created.id);
      checkAccount(account, rebuilt, journal);
      requireValue(
        account.notes === marker && account.permissions?.can_edit === true,
        "Created account ownership or permissions mismatch",
      );
      journal.account_id = account.id;
      journal.account_identity = accountIdentity(account);
      journal.pending = null;
      await persist();
      requireValue(
        (await accountRows(api, account.id)).length === 0,
        "Unexpected transaction data in newly created gift-card account",
      );
      accountCreated = 1;
    }
    for (const name of missingTags) {
      journal.pending = { kind: "tag", key: name };
      await persist();
      const created = await api.request("POST", "/api/v1/tags", {
        tag: { name, color: "#e99537" },
      });
      requireValue(
        tagValue(created),
        "Unexpected tag create response; outcome unknown, re-run dry-run",
      );
      tags = resolveTags(await api.collection("tags", tagValue), needed);
      requireValue(tags.get(name)?.id === created.id, "Created tag read-back mismatch");
      journal.pending = null;
      await persist();
      tagsCreated++;
    }
    for (const row of rebuilt.rows) {
      if (existing.has(row.import_id)) continue;
      const { tag_names: tagNames, ...transaction } = row.transaction;
      const tagIds = tagNames.map((name) => {
        const tag = tags.get(name);
        requireValue(tag !== undefined, `Missing required actual tag: ${name}`);
        return tag.id;
      });
      journal.pending = { kind: "transaction", key: row.import_id };
      await persist();
      const created = await api.request("POST", "/api/v1/transactions", {
        transaction: { ...transaction, account_id: account.id, tag_ids: tagIds },
      });
      requireValue(
        transactionValue(created),
        "Unexpected transaction create response; outcome unknown, re-run dry-run",
      );
      const observed = await readTransaction(api, created.id);
      checkFinancial(observed, row, account.id);
      checkAnnotations(observed, row, tags);
      existing.set(row.import_id, observed);
      journal.verified[row.import_id] = {
        transaction_id: observed.id,
        source_fingerprint: row.source_fingerprint,
      };
      journal.pending = null;
      await persist();
      applied++;
      if (applied % 25 === 0 || existing.size === rebuilt.rows.length)
        options.onProgress?.(existing.size, rebuilt.rows.length);
    }
  }
  // A fresh paginated scan detects unexpected/duplicate rows and late transfer matches.
  // Every new movement already received an independent detail GET after its POST.
  if (options.commit === true && account) {
    const finalRows = await accountRows(api, account.id);
    requireValue(finalRows.length === rebuilt.rows.length, "Final imported row count mismatch");
    for (const listed of finalRows) {
      requireValue(nonempty(listed.external_id), "Missing final original wallet external identity");
      const row = byImportId.get(listed.external_id);
      requireValue(row !== undefined, "Unexpected final imported transaction");
      checkFinancial(listed, row, account.id);
      requireValue(
        journal.verified[row.import_id]?.transaction_id === listed.id,
        "Final imported transaction ID mismatch",
      );
      existing.set(row.import_id, listed);
    }
  }
  if (account) {
    account = await readAccount(api, account.id);
    checkAccount(account, rebuilt, journal);
  }
  const transfers = [...existing.entries()].flatMap(([key, transaction]) =>
    transaction.transfer
      ? [
          {
            transaction_id: transaction.id,
            import_id: key,
            id: transaction.transfer.id,
            status: transaction.transfer.status,
            other_account: transaction.transfer.other_account ?? null,
          },
        ]
      : [],
  );
  const requiredTagCounts = Object.fromEntries(
    needed.map((name) => [
      name,
      rebuilt.rows.filter((row) => row.transaction.tag_names.includes(name)).length,
    ]),
  );
  const observedTagCounts = Object.fromEntries(
    needed.map((name) => [
      name,
      [...existing.values()].filter((transaction) =>
        transaction.tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase()),
      ).length,
    ]),
  );
  return {
    mode: options.commit === true ? "commit" : "dry-run",
    account_id: account?.id ?? null,
    account_created: accountCreated,
    applied,
    already_applied: alreadyApplied,
    remaining: rebuilt.rows.length - existing.size,
    tags_created: tagsCreated,
    required_tag_counts: requiredTagCounts,
    observed_tag_counts: observedTagCounts,
    missing_tags: needed.filter((name) => !tags.has(name)),
    transfers,
    balance: {
      expected_minor: rebuilt.expected_balance_minor,
      observed_minor: account?.balance_cents ?? null,
      matches: account ? account.balance_cents === rebuilt.expected_balance_minor : null,
      asynchronous: true,
    },
  };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      captures: { type: "string" },
      out: { type: "string" },
      plan: { type: "string" },
      url: { type: "string" },
      journal: { type: "string" },
      commit: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help === true) {
    process.stdout.write(
      "Usage: node amazon-gift-card-import.ts plan --captures FILE --out FILE --url ORIGIN\n       node amazon-gift-card-import.ts apply|verify --plan FILE [--commit --journal FILE] --url ORIGIN\nApply defaults to read-only dry-run. Use the same private journal to resume. Set SURE_API_KEY.\n",
    );
    return;
  }
  requireValue(positionals.length === 1, "Specify plan, apply, or verify");
  const url = values.url ?? process.env.SURE_URL;
  requireValue(nonempty(url), "Set SURE_URL or pass --url; no implicit server");
  const required = (key: "captures" | "out" | "plan"): string => {
    const value = values[key];
    requireValue(nonempty(value), `--${key} is required`);
    return value;
  };
  let report: unknown;
  if (positionals[0] === "plan") {
    requireValue(values.commit !== true, "--commit is only valid for apply");
    const plan = buildGiftCardImportPlan(await load(required("captures")), url);
    await save(required("out"), plan);
    report = {
      mode: "plan",
      activities: plan.rows.length,
      identity: plan.identity,
      expected_balance_minor: plan.expected_balance_minor,
      required_tag_counts: Object.fromEntries(
        ["follow-up", "ai-follow-up"].map((name) => [
          name,
          plan.rows.filter((row) => row.transaction.tag_names.includes(name)).length,
        ]),
      ),
    };
  } else if (positionals[0] === "apply" || positionals[0] === "verify") {
    requireValue(
      positionals[0] !== "verify" || values.commit !== true,
      "verify never permits --commit",
    );
    const planPath = required("plan");
    const journalPath =
      values.journal?.startsWith("~/") === true
        ? resolve(homedir(), values.journal.slice(2))
        : values.journal;
    const reviewedPath = planPath.startsWith("~/")
      ? resolve(homedir(), planPath.slice(2))
      : planPath;
    requireValue(
      !nonempty(journalPath) || resolve(journalPath) !== resolve(reviewedPath),
      "Journal must not overwrite the reviewed plan",
    );
    report = await applyGiftCardImportPlan(checkedPlan(await load(planPath), url), {
      url,
      commit: values.commit,
      journal: values.journal,
      onProgress: (verified, total) => {
        process.stderr.write(`Verified gift-card movements: ${verified}/${total}\n`);
      },
    });
  } else throw new Error("Unknown command: " + positionals[0]);
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
