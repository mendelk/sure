#!/usr/bin/env node
/** Explicit, notes-only repair of reviewed Amazon evidence. No discovery/classification writes. */
/* oxlint-disable eslint/no-await-in-loop -- Ledger preflight, write and independent read-back are sequential. */
import { parseArgs } from "node:util";
import {
  Sure,
  compactAnnotationNotes,
  digest,
  load,
  origin,
  save,
  userNotes,
  validateCharges,
} from "./amazon-categorize.ts";
import type { Charge, Tag, Transaction } from "./amazon-categorize.ts";
import { majorAmount, splitParentNotes, walletPaymentRoots } from "./amazon-splits.ts";

export interface EvidenceInventory {
  version: 1;
  base_url: string;
  captured_at: string;
  ai_transactions: Transaction[];
  wallet_transactions: Transaction[];
  tags: Tag[];
}
export interface EvidenceBinding {
  transaction_id: string;
  charge: Charge;
  funding?: {
    card_minor: number;
    wallet_minor: number;
    total_minor: number;
    evidence: string;
    source_url: string;
  };
}
export interface ReviewedEvidence {
  version: 1;
  wallet_transaction_ids: string[];
  bindings: EvidenceBinding[];
}
export interface Coverage {
  transaction_id: string;
  parent_id?: string;
  status: "repair" | "unchanged" | "parent" | "unresolved";
  reason: string;
}
export interface EvidenceOperation {
  transaction_id: string;
  before: Transaction;
  patch: { notes: string };
  children: Transaction[];
}
export interface EvidencePlan {
  version: 1;
  base_url: string;
  inventory: EvidenceInventory;
  evidence: ReviewedEvidence;
  operations: EvidenceOperation[];
  coverage: Coverage[];
  digest: string;
}
export interface EvidenceClient {
  transaction(id: string): Promise<Transaction>;
  request(method: string, path: string, payload?: unknown): Promise<unknown>;
}
interface Journal {
  version: 1;
  plan_digest: string;
  base_url: string;
  verified: string[];
  attempting: string | null;
}
export interface EvidenceReceipt {
  requested: number;
  operations: number;
  repaired: number;
  already_applied: number;
  pending: number;
  unresolved: Coverage[];
}
function requireValue(value: boolean, message: string): asserts value {
  if (!value) throw new Error(message);
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function day(value: string): number {
  requireValue(/^\d{4}-\d{2}-\d{2}$/u.test(value), "Invalid ISO date");
  const time = Date.parse(value + "T00:00:00Z");
  requireValue(
    Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value,
    "Invalid calendar date",
  );
  return time / 86400000;
}
function validTransaction(value: unknown): asserts value is Transaction {
  requireValue(
    object(value) &&
      typeof value.id === "string" &&
      value.id.length > 0 &&
      typeof value.date === "string" &&
      typeof value.currency === "string" &&
      typeof value.classification === "string" &&
      Number.isSafeInteger(value.amount_cents) &&
      Number(value.amount_cents) > 0,
    "Invalid inventory transaction",
  );
  day(value.date);
  requireValue(
    value.notes === undefined || value.notes === null || typeof value.notes === "string",
    "Invalid transaction notes",
  );
  requireValue(Array.isArray(value.tags), "Full transaction tags required");
}
function validInventory(value: unknown): asserts value is EvidenceInventory {
  requireValue(
    object(value) &&
      value.version === 1 &&
      typeof value.base_url === "string" &&
      typeof value.captured_at === "string" &&
      Array.isArray(value.ai_transactions) &&
      Array.isArray(value.wallet_transactions) &&
      Array.isArray(value.tags),
    "Invalid fresh inventory",
  );
  const aiRows: unknown[] = value.ai_transactions;
  const walletRows: unknown[] = value.wallet_transactions;
  for (const row of aiRows) validTransaction(row);
  for (const row of walletRows) validTransaction(row);
  for (const tag of value.tags) {
    requireValue(
      object(tag) && typeof tag.id === "string" && typeof tag.name === "string",
      "Invalid inventory tag",
    );
  }
}
function validEvidence(value: unknown): asserts value is ReviewedEvidence {
  requireValue(
    object(value) &&
      value.version === 1 &&
      Array.isArray(value.wallet_transaction_ids) &&
      value.wallet_transaction_ids.every((id: unknown) => typeof id === "string") &&
      Array.isArray(value.bindings),
    "Invalid reviewed evidence",
  );
  for (const binding of value.bindings) {
    requireValue(
      object(binding) && typeof binding.transaction_id === "string",
      "Invalid evidence binding",
    );
    validateCharges({ version: 1, charges: [binding.charge] });
    if (binding.funding !== undefined) {
      const funding = binding.funding;
      requireValue(
        object(funding) &&
          typeof funding.card_minor === "number" &&
          typeof funding.wallet_minor === "number" &&
          typeof funding.total_minor === "number" &&
          typeof funding.source_url === "string" &&
          typeof funding.evidence === "string",
        "Invalid funding evidence",
      );
    }
  }
}
function readJournal(value: unknown): Journal {
  requireValue(
    object(value) &&
      value.version === 1 &&
      typeof value.plan_digest === "string" &&
      typeof value.base_url === "string" &&
      Array.isArray(value.verified) &&
      (value.attempting === null || typeof value.attempting === "string"),
    "Invalid evidence journal",
  );
  const verified = value.verified.map((id: unknown) => {
    requireValue(typeof id === "string", "Invalid journal transaction identity");
    return id;
  });
  return {
    version: 1,
    plan_digest: value.plan_digest,
    base_url: value.base_url,
    verified,
    attempting: value.attempting,
  };
}
function readEvidencePlan(value: unknown): EvidencePlan {
  requireValue(object(value), "Invalid evidence plan");
  const plan = buildEvidencePlan(value.inventory, value.evidence);
  requireValue(digest(plan) === digest(value), "Stale/tampered plan; rebuild from reviewed inputs");
  return plan;
}
function identity(value: unknown): unknown {
  return object(value) ? (value.id ?? null) : null;
}
function tagIdentity(value: unknown): unknown {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag: unknown) => {
      requireValue(object(tag) && typeof tag.id === "string", "Invalid tag identity");
      return { id: tag.id, name: tag.name ?? null };
    })
    .toSorted((left, right) => left.id.localeCompare(right.id));
}
/** Index/detail common protected fields; incidental display helpers are not ledger state. */
function protectedState(transaction: Transaction): Record<string, unknown> {
  const transfer = object(transaction.transfer) ? transaction.transfer : null;
  const children = (transaction.split_children ?? [])
    .map((child) => {
      requireValue(
        object(child) && typeof child.transaction_id === "string",
        "Invalid split child summary",
      );
      return {
        transaction_id: child.transaction_id,
        entry_id: child.entry_id ?? null,
        parent_entry_id: child.parent_entry_id ?? null,
        amount_cents: child.amount_cents ?? null,
        amount: child.amount ?? null,
        date: child.date ?? null,
        currency: child.currency ?? null,
        category_id: child.category_id ?? null,
        merchant_id: child.merchant_id ?? identity(child.merchant),
        transfer_account_id: child.transfer_account_id ?? null,
        notes: child.notes ?? null,
        tags: tagIdentity(child.tags),
      };
    })
    .toSorted((left, right) => left.transaction_id.localeCompare(right.transaction_id));
  return {
    id: transaction.id,
    entry_id: transaction.entry_id ?? null,
    date: transaction.date,
    amount_cents: transaction.amount_cents,
    signed_amount_cents: transaction.signed_amount_cents ?? null,
    currency: transaction.currency,
    classification: transaction.classification,
    kind: transaction.kind ?? null,
    name: transaction.name ?? null,
    account_id: identity(transaction.account),
    merchant_id: identity(transaction.merchant),
    category_id: identity(transaction.category),
    tags: tagIdentity(transaction.tags),
    pending: transaction.pending ?? null,
    excluded: transaction.excluded ?? null,
    parent_entry_id: transaction.parent_entry_id ?? null,
    source: transaction.source ?? null,
    external_id: transaction.external_id ?? null,
    transfer: transfer
      ? {
          id: transfer.id ?? null,
          status: transfer.status ?? null,
          other_account_id: identity(transfer.other_account),
          other_transaction_id: transfer.other_transaction_id ?? null,
          currency: transfer.currency ?? null,
          can_edit: object(transfer.permissions) ? (transfer.permissions.can_edit ?? null) : null,
        }
      : null,
    permissions: {
      can_annotate: transaction.permissions?.can_annotate ?? null,
      can_edit: transaction.permissions?.can_edit ?? null,
    },
    split_children: children,
  };
}
function assertProtected(actual: Transaction, before: Transaction): void {
  requireValue(
    digest(protectedState(actual)) === digest(protectedState(before)),
    `${before.id}: protected fields changed`,
  );
}
function assertWritable(transaction: Transaction): void {
  requireValue(
    transaction.pending === false,
    `${transaction.id}: pending state must be explicitly false`,
  );
  requireValue(
    transaction.permissions?.can_annotate === true,
    `${transaction.id}: can_annotate required`,
  );
  requireValue(
    (transaction.parent_entry_id ?? "") === "",
    `${transaction.id}: direct child annotation prohibited`,
  );
}
function orderRefs(notes: string): string[] {
  return [...new Set(notes.match(/\b\d{3}-\d{7}-\d{7}\b/gu))].toSorted((left, right) =>
    left.localeCompare(right),
  );
}
function noteFor(
  transaction: Transaction,
  charge: Charge,
  wallet: boolean,
  children: Transaction[],
): string {
  let notes = transaction.notes ?? "";
  // Only this entire importer-owned string is legacy AI text. Similar personal prose is never removed.
  if (
    wallet &&
    transaction.source === "amazon-gift-card" &&
    /^\[AI Amazon\] Order number: (?:\d{3}-\d{7}-\d{7}|unknown)\. Items: unknown\.(?: Funding: unconfirmed\.)?$/u.test(
      notes,
    )
  )
    notes = "";
  // userNotes rejects unbalanced known opening markers; reject orphan closers as well.
  const personal = userNotes(notes, transaction.id);
  requireValue(
    !/(?:^|\n)\[\/?(?:AI Amazon|amazon-categorize(?::|-revisit:))[^\n]*\]/u.test(personal),
    `${transaction.id}: ambiguous AI markers`,
  );
  if (children.length > 0) {
    requireValue(
      children.every(
        (child) =>
          child.currency === transaction.currency &&
          child.classification === transaction.classification,
      ) &&
        children.reduce((sum, child) => sum + child.amount_cents, 0) === transaction.amount_cents,
      `${transaction.id}: split children do not conserve parent payment`,
    );
    const rows = children.map((child) => {
      requireValue(
        typeof child.category?.id === "string" && typeof child.category.name === "string",
        `${child.id}: existing split category required`,
      );
      return {
        amount_minor: child.amount_cents,
        category_id: child.category.id,
        name: child.category.name,
      };
    });
    const generated = splitParentNotes(personal, { charge, item_categories: [], rows });
    const suffix = generated.slice(generated.lastIndexOf("\nSplit allocation:"));
    const knownBlocks = [
      ...notes.matchAll(/(?:^|\n)\[AI Amazon\]\n[\s\S]*?\n\[\/AI Amazon\](?=\n|$)/gu),
    ];
    requireValue(
      knownBlocks.some((block) =>
        block[0]
          .replace(
            /\nFunding: card [A-Z]{3} \d+(?:\.\d+)? \+ gift card [A-Z]{3} \d+(?:\.\d+)?\.\n(?=\[\/AI Amazon\]$)/u,
            "\n",
          )
          .endsWith(suffix),
      ),
      `${transaction.id}: existing split allocation amounts/policy are not verified; manual review required`,
    );
    return generated;
  }
  return compactAnnotationNotes(
    { ...transaction, notes },
    {
      transaction_id: transaction.id,
      status: "unique",
      charge_id: charge.charge_id,
      candidates: [],
    },
    new Map([[charge.charge_id, charge]]),
    true,
  );
}
function bindingProblem(
  transaction: Transaction,
  binding: EvidenceBinding,
  wallet: boolean,
): string | null {
  const charge = binding.charge;
  if (
    charge.amount_minor !== transaction.amount_cents ||
    charge.currency !== transaction.currency ||
    (charge.kind === "charge" ? "expense" : "income") !== transaction.classification
  )
    return "Evidence does not match own funded amount/currency/direction";
  const lag = day(transaction.date) - day(charge.charged_on ?? charge.shipped_on!);
  if (lag < 0 || lag > (wallet ? 0 : 4))
    return "Evidence payment date outside permitted posting lag";
  if (
    charge.orders.some((order) =>
      order.items.some((item) => /^(?:unknown|unavailable|not known)$/iu.test(item.title.trim())),
    )
  )
    return "Actual purchased item titles required";
  if (wallet) {
    const existing = orderRefs(transaction.notes ?? "");
    const verified = new Set(charge.orders.map((order) => order.order_number));
    if (existing.some((reference) => !verified.has(reference)))
      return "Wallet order reference conflicts with evidence";
  }
  const funding = binding.funding;
  if (funding === undefined) {
    for (const block of (transaction.notes ?? "").matchAll(
      /(?:^|\n)\[AI Amazon\]\n[\s\S]*?\n\[\/AI Amazon\](?=\n|$)/gu,
    )) {
      if (block[0].includes("\nFunding: card "))
        return "Existing funding evidence requires its reviewed breakdown; refusing to discard it";
    }
  }
  if (funding) {
    if (
      ![funding.card_minor, funding.wallet_minor, funding.total_minor].every(
        (amount) => Number.isSafeInteger(amount) && amount >= 0,
      ) ||
      funding.total_minor <= 0 ||
      funding.card_minor + funding.wallet_minor !== funding.total_minor ||
      (wallet ? funding.wallet_minor : funding.card_minor) !== charge.amount_minor ||
      typeof funding.evidence !== "string" ||
      !funding.evidence.trim()
    )
      return "Invalid verified funding breakdown";
    try {
      const url = new URL(funding.source_url);
      if (url.protocol !== "https:" || url.username || url.password)
        return "Invalid funding source URL";
    } catch {
      return "Invalid funding source URL";
    }
  }
  return null;
}
export function buildEvidencePlan(inventory: unknown, evidence: unknown): EvidencePlan {
  validInventory(inventory);
  validEvidence(evidence);
  const base = origin(inventory.base_url);
  const all = new Map<string, Transaction>();
  for (const transaction of [...inventory.ai_transactions, ...inventory.wallet_transactions]) {
    validTransaction(transaction);
    const previous = all.get(transaction.id);
    requireValue(
      !previous || digest(previous) === digest(transaction),
      "Conflicting duplicate inventory row",
    );
    all.set(transaction.id, transaction);
  }
  const wallet = new Set(evidence.wallet_transaction_ids);
  requireValue(
    wallet.size === evidence.wallet_transaction_ids.length,
    "Duplicate wallet authorization",
  );
  const walletInventory = new Set(inventory.wallet_transactions.map((row) => row.id));
  for (const id of wallet)
    requireValue(walletInventory.has(id), `${id}: wallet authorization absent from inventory`);
  const requested = new Map(inventory.ai_transactions.map((row) => [row.id, row]));
  for (const id of wallet) requested.set(id, all.get(id)!);
  for (const row of inventory.ai_transactions) {
    requireValue(
      row.tags?.some((tag) => tag.name.toLowerCase() === "ai-categorized") === true,
      `${row.id}: ai inventory missing ai-categorized`,
    );
  }
  const bindings = new Map<string, EvidenceBinding>();
  for (const binding of evidence.bindings) {
    requireValue(
      object(binding) &&
        typeof binding.transaction_id === "string" &&
        requested.has(binding.transaction_id),
      "Binding outside requested inventory",
    );
    requireValue(!bindings.has(binding.transaction_id), "Duplicate binding is ambiguous");
    validateCharges({ version: 1, charges: [binding.charge] });
    bindings.set(binding.transaction_id, binding);
  }
  const operations: EvidenceOperation[] = [];
  const coverage: Coverage[] = [];
  const byEntry = new Map([...all.values()].map((row) => [row.entry_id, row]));
  const owned = new Map<string, string>();
  for (const transaction of requested.values()) {
    if ((transaction.parent_entry_id ?? "") !== "") continue;
    const binding = bindings.get(transaction.id);
    let reason: string | null = binding
      ? bindingProblem(transaction, binding, wallet.has(transaction.id))
      : "Missing reviewed order/item evidence";
    const children: Transaction[] = [];
    try {
      assertWritable(transaction);
      for (const summary of transaction.split_children ?? []) {
        requireValue(
          object(summary) && typeof summary.transaction_id === "string",
          "Split child detail identity missing",
        );
        const child = all.get(summary.transaction_id);
        requireValue(
          child !== undefined && child.parent_entry_id === transaction.entry_id,
          "Full linked child missing from inventory",
        );
        requireValue(
          (child.notes ?? "") === "",
          "Split child has nonblank notes; manual review required",
        );
        children.push(child);
      }
    } catch (error) {
      reason = error instanceof Error ? error.message : "Split annotation validation failed";
    }
    let notes: string | undefined;
    if (reason === null && binding !== undefined) {
      const ownerKey = `${wallet.has(transaction.id) ? "wallet" : "card"}:${binding.charge.charge_id}`;
      requireValue(
        !owned.has(ownerKey),
        `Payment evidence reused by ${owned.get(ownerKey)} and ${transaction.id}`,
      );
      owned.set(ownerKey, transaction.id);
      try {
        notes = noteFor(transaction, binding.charge, wallet.has(transaction.id), children);
        if (binding.funding !== undefined) {
          const { card_minor, wallet_minor } = binding.funding;
          notes = notes.replace(
            "\n[/AI Amazon]",
            `\nFunding: card ${transaction.currency} ${majorAmount(card_minor, transaction.currency)} + gift card ${transaction.currency} ${majorAmount(wallet_minor, transaction.currency)}.\n[/AI Amazon]`,
          );
        }
      } catch (error) {
        reason = error instanceof Error ? error.message : "Evidence note validation failed";
      }
    }
    if (reason !== null || notes === undefined) {
      coverage.push({
        transaction_id: transaction.id,
        status: "unresolved",
        reason: reason ?? "No evidence note",
      });
    } else {
      const unchanged = notes === (transaction.notes ?? "");
      coverage.push({
        transaction_id: transaction.id,
        status: unchanged ? "unchanged" : "repair",
        reason: "Reviewed own-payment order/item evidence",
      });
      // Include unchanged operations so apply/verify also audit their full state and children.
      operations.push({
        transaction_id: transaction.id,
        before: transaction,
        patch: { notes },
        children,
      });
    }
  }
  for (const child of requested.values()) {
    if ((child.parent_entry_id ?? "") === "") continue;
    requireValue(!bindings.has(child.id), `${child.id}: bind evidence to parent, never child`);
    const parent = byEntry.get(child.parent_entry_id);
    const operation = operations.find((row) => row.transaction_id === parent?.id);
    const linked = operation?.children.some((row) => row.id === child.id);
    coverage.push(
      linked === true
        ? {
            transaction_id: child.id,
            parent_id: parent!.id,
            status: "parent",
            reason: "Blank child notes; evidence audited on parent",
          }
        : {
            transaction_id: child.id,
            ...(parent ? { parent_id: parent.id } : {}),
            status: "unresolved",
            reason: "Parent evidence unresolved or child not linked/blank",
          },
    );
  }
  const body = { version: 1 as const, base_url: base, inventory, evidence, operations, coverage };
  return { ...body, digest: digest(body) };
}
function validatePlan(plan: EvidencePlan, url: string): void {
  requireValue(origin(url) === plan.base_url, "Plan origin mismatch");
  requireValue(
    digest(buildEvidencePlan(plan.inventory, plan.evidence)) === digest(plan),
    "Stale/tampered plan; rebuild from reviewed inputs",
  );
}
async function inspect(
  client: EvidenceClient,
  operation: EvidenceOperation,
): Promise<"before" | "desired"> {
  for (const child of operation.children) {
    const actual = await client.transaction(child.id);
    assertProtected(actual, child);
    requireValue((actual.notes ?? "") === "", `${child.id}: child notes no longer blank`);
  }
  const current = await client.transaction(operation.transaction_id);
  assertProtected(current, operation.before);
  assertWritable(current);
  const notes = current.notes ?? "";
  requireValue(
    notes === (operation.before.notes ?? "") || notes === operation.patch.notes,
    `${current.id}: notes changed since review`,
  );
  return notes === operation.patch.notes ? "desired" : "before";
}
export async function applyEvidencePlan(
  plan: EvidencePlan,
  options: { url: string; commit?: boolean; journal?: string; client?: EvidenceClient },
): Promise<EvidenceReceipt> {
  validatePlan(plan, options.url);
  requireValue(
    options.commit !== true || (options.journal ?? "") !== "",
    "Commit requires same-journal restart path",
  );
  const client = options.client ?? new Sure(options.url);
  let journal: Journal = {
    version: 1,
    plan_digest: plan.digest,
    base_url: plan.base_url,
    verified: [],
    attempting: null,
  };
  if (options.journal !== undefined) {
    try {
      journal = readJournal(await load(options.journal));
    } catch (error) {
      if (!object(error) || error.code !== "ENOENT") throw error;
    }
    requireValue(
      journal.plan_digest === plan.digest && journal.base_url === plan.base_url,
      "Journal belongs to another plan/origin",
    );
  }
  // Preflight entire batch before any PATCH, including previously verified rows.
  const preflight = new Map<string, "before" | "desired">();
  const covered = new Set<string>();
  const captured = new Map<string, Transaction>();
  for (const row of plan.inventory.ai_transactions) captured.set(row.id, row);
  for (const row of plan.inventory.wallet_transactions) captured.set(row.id, row);
  for (const operation of plan.operations) {
    const status = await inspect(client, operation);
    preflight.set(operation.transaction_id, status);
    covered.add(operation.transaction_id);
    for (const child of operation.children) covered.add(child.id);
    requireValue(
      !journal.verified.includes(operation.transaction_id) || status === "desired",
      "Previously verified notes changed",
    );
    requireValue(
      options.commit !== true ||
        journal.attempting !== operation.transaction_id ||
        status === "desired",
      "Unknown write outcome; run dry-run with same journal before commit",
    );
  }
  for (const row of plan.coverage) {
    if (covered.has(row.transaction_id)) continue;
    const before = captured.get(row.transaction_id)!;
    const current = await client.transaction(row.transaction_id);
    assertProtected(current, before);
    requireValue(
      (current.notes ?? "") === (before.notes ?? ""),
      `${row.transaction_id}: unresolved notes changed`,
    );
  }
  const receipt: EvidenceReceipt = {
    requested: plan.coverage.length,
    operations: plan.operations.length,
    repaired: 0,
    already_applied: 0,
    pending: 0,
    unresolved: plan.coverage.filter((row) => row.status === "unresolved"),
  };
  for (const operation of plan.operations) {
    const status = preflight.get(operation.transaction_id)!;
    if (status === "desired") receipt.already_applied++;
    else if (options.commit !== true) {
      receipt.pending++;
      if (journal.attempting === operation.transaction_id) {
        journal.attempting = null;
        if (options.journal !== undefined) await save(options.journal, journal);
      }
      continue;
    } else {
      journal.attempting = operation.transaction_id;
      await save(options.journal!, journal);
      // Re-read directly before PATCH after journal I/O. Local stale checks are not atomic CAS.
      if ((await inspect(client, operation)) !== "desired") {
        await client.request(
          "PATCH",
          "/api/v1/transactions/" + encodeURIComponent(operation.transaction_id),
          { transaction: operation.patch },
        );
      }
      requireValue((await inspect(client, operation)) === "desired", "Note read-back failed");
      receipt.repaired++;
    }
    if (!journal.verified.includes(operation.transaction_id))
      journal.verified.push(operation.transaction_id);
    journal.attempting = null;
    if (options.journal !== undefined) await save(options.journal, journal);
  }
  return receipt;
}
export async function verifyEvidencePlan(
  plan: EvidencePlan,
  options: { url: string; client?: EvidenceClient },
): Promise<EvidenceReceipt> {
  const receipt = await applyEvidencePlan(plan, options);
  requireValue(receipt.pending === 0, `${receipt.pending} notes have not been applied`);
  return receipt;
}

/** Complete explicit audit inventory; tagged split children retain their parent evidence unit. */
export async function snapshotEvidenceInventory(
  url: string,
  walletAccountId?: string,
): Promise<EvidenceInventory> {
  const api = new Sure(origin(url));
  const tags = await api.collection(
    "tags",
    (value): value is Tag =>
      object(value) && typeof value.id === "string" && typeof value.name === "string",
  );
  const aiTags = tags.filter((tag) => tag.name.toLowerCase() === "ai-categorized");
  requireValue(aiTags.length <= 1, "Ambiguous ai-categorized tags");
  const scan = async (filters: Record<string, string>): Promise<Transaction[]> => {
    const rows = new Map<string, Transaction>();
    const parents = new Set<string>();
    for (let page = 1; ; page++) {
      const response = await api.request("GET", "/api/v1/transactions", undefined, {
        ...filters,
        page,
        per_page: 100,
      });
      requireValue(
        object(response) && Array.isArray(response.transactions) && object(response.pagination),
        "Invalid audit transaction page",
      );
      const records: unknown[] = response.transactions;
      for (const row of records) {
        validTransaction(row);
        const previous = rows.get(row.id);
        requireValue(
          previous === undefined || digest(previous) === digest(row),
          "Conflicting duplicate audit record",
        );
        rows.set(row.id, row);
      }
      requireValue(Array.isArray(response.split_parents), "Missing audit split-parent headers");
      const headers: unknown[] = response.split_parents;
      for (const header of headers) {
        requireValue(
          object(header) && typeof header.transaction_id === "string",
          "Invalid split-parent header",
        );
        parents.add(header.transaction_id);
      }
      const pagination = response.pagination;
      requireValue(
        pagination.page === page &&
          typeof pagination.total_pages === "number" &&
          Number.isSafeInteger(pagination.total_pages) &&
          pagination.total_pages >= 0,
        "Incomplete audit pagination",
      );
      if (page >= pagination.total_pages) break;
      requireValue(records.length > 0, "Empty audit page before end");
    }
    for (const id of parents) rows.set(id, await api.transaction(id));
    // The index exposes parent_entry_id but only detail includes split_parent.
    for (const row of rows.values()) {
      if (typeof row.parent_entry_id === "string" && row.parent_entry_id.length > 0)
        rows.set(row.id, await api.transaction(row.id));
    }
    return [...rows.values()];
  };
  const tagged = aiTags[0] === undefined ? [] : await scan({ tags: aiTags[0].name });
  const ai = tagged.filter(
    (row) => row.tags?.some((tag) => tag.name.toLowerCase() === "ai-categorized") === true,
  );
  const walletRows =
    walletAccountId === undefined ? [] : await scan({ account_id: walletAccountId });
  const wallet =
    walletAccountId === undefined ? [] : walletPaymentRoots(walletRows, walletAccountId);
  return {
    version: 1,
    base_url: api.url,
    captured_at: new Date().toISOString(),
    ai_transactions: ai,
    wallet_transactions: wallet,
    tags,
  };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      inventory: { type: "string" },
      evidence: { type: "string" },
      plan: { type: "string" },
      out: { type: "string" },
      url: { type: "string" },
      journal: { type: "string" },
      "wallet-account-id": { type: "string" },
      commit: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help === true) {
    process.stdout.write(
      "amazon-evidence-audit.ts snapshot --out FILE --url ORIGIN [--wallet-account-id ID]\namazon-evidence-audit.ts plan --inventory FILE --evidence FILE --out FILE\namazon-evidence-audit.ts apply|verify --plan FILE --url ORIGIN [--commit --journal FILE]\n",
    );
    return;
  }
  const required = (name: "inventory" | "evidence" | "plan" | "out"): string => {
    const value = values[name];
    requireValue(typeof value === "string" && value.length > 0, `--${name} required`);
    return value;
  };
  requireValue(positionals.length === 1, "Specify snapshot, plan, apply, or verify");
  const command = positionals[0];
  if (command === "snapshot") {
    requireValue(values.commit !== true, "snapshot never permits --commit");
    const url = values.url ?? process.env.SURE_URL;
    requireValue(typeof url === "string" && url.length > 0, "Set SURE_URL or --url");
    const inventory = await snapshotEvidenceInventory(url, values["wallet-account-id"]);
    await save(required("out"), inventory);
    process.stdout.write(
      JSON.stringify({
        ai_categorized: inventory.ai_transactions.length,
        wallet: inventory.wallet_transactions.length,
      }) + "\n",
    );
  } else if (command === "plan") {
    const plan = buildEvidencePlan(
      await load(required("inventory")),
      await load(required("evidence")),
    );
    await save(required("out"), plan);
    process.stdout.write(
      JSON.stringify({
        requested: plan.coverage.length,
        operations: plan.operations.length,
        unresolved: plan.coverage.filter((row) => row.status === "unresolved"),
      }) + "\n",
    );
  } else {
    requireValue(command === "apply" || command === "verify", "Unknown command");
    requireValue(command !== "verify" || values.commit !== true, "verify is read-only");
    const url = values.url ?? process.env.SURE_URL;
    requireValue(typeof url === "string" && url.length > 0, "Set SURE_URL or --url");
    const plan = readEvidencePlan(await load(required("plan")));
    const result =
      command === "verify"
        ? await verifyEvidencePlan(plan, { url })
        : await applyEvidencePlan(plan, { url, commit: values.commit, journal: values.journal });
    process.stdout.write(JSON.stringify(result) + "\n");
  }
}
if (import.meta.main) {
  try {
    await main();
  } catch (error: unknown) {
    process.stderr.write((error instanceof Error ? error.message : "Evidence audit failed") + "\n");
    process.exitCode = 1;
  }
}
