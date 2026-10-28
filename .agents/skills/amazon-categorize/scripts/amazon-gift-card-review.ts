#!/usr/bin/env node
/** Read-only reconciliation of sanitized, visibly captured Amazon US gift-card history. */
import { parseArgs } from "node:util";
import {
  chargesFrom,
  digest,
  load,
  readSnapshot,
  save,
  type Charge,
  type Snapshot,
} from "./amazon-categorize.ts";
import type { GiftCardPage } from "./capture-gift-card.ts";

type ActivityKind =
  | "redemption"
  | "refund"
  | "hold_release"
  | "gift_card_added"
  | "reload"
  | "auto_reload"
  | "allowance"
  | "cash_load"
  | "unknown";

const REVIEW_REASONS: Record<ActivityKind, string> = {
  redemption:
    "Identify purchased items and gift-card funding; do not duplicate the card-funded expense.",
  refund: "Identify refunded items and original expense categories; verify the refund destination.",
  hold_release:
    "Reverse the related order allocation; a hold release is not a new refund or income.",
  gift_card_added:
    "Identify funding: own-account transfer, received gift, reward, or another source; do not infer income.",
  reload:
    "Verify the reload order/payment and source-account transfer; a reload is not another expense or income.",
  auto_reload:
    "Verify the automatic reload order/payment and source-account transfer; do not infer income.",
  allowance:
    "Identify the allowance payer and funding source; do not assume an internal transfer or earned income.",
  cash_load:
    "Establish the physical-cash source and any tracked cash-account transfer; do not infer income.",
  unknown: "Inspect the unrecognized activity in Amazon; do not infer its type or category.",
};
export interface GiftCardActivity {
  source_fingerprint: string;
  import_id: string;
  date: string;
  kind: ActivityKind;
  order_number?: string;
  amount_minor: number;
  closing_balance_minor: number;
  capture_page: number;
}

const IDENTITY_SCHEME = "amazon-gift-card-chain-v1";
export interface GiftCardIdentity {
  scheme: string;
  root_hash: string;
  head_hash: string;
}
export interface GiftCardHistoryPrefix {
  identity: GiftCardIdentity;
  activities: readonly { source_fingerprint: string }[];
}
function chainHash(previous: string, fingerprint: string): string {
  return digest({ previous_hash: previous, source_fingerprint: fingerprint });
}
/** Local source identities, not Amazon payment IDs. Never accept a rewritten history. */
export function validateGiftCardHistoryPrefix(
  previous: GiftCardHistoryPrefix,
  next: GiftCardHistoryPrefix,
): void {
  requireValue(
    previous.identity.scheme === IDENTITY_SCHEME &&
      next.identity.scheme === IDENTITY_SCHEME &&
      previous.identity.root_hash === next.identity.root_hash &&
      /^[a-f0-9]{64}$/u.test(next.identity.root_hash),
    "Gift-card identity root or scheme changed",
  );
  requireValue(next.activities.length >= previous.activities.length, "Gift-card history truncated");
  for (const [index, row] of previous.activities.entries()) {
    requireValue(
      row.source_fingerprint === next.activities[index]!.source_fingerprint,
      `Gift-card historical source changed at activity ${index + 1}`,
    );
  }
  for (const history of [previous, next]) {
    let head = history.identity.root_hash;
    for (const row of history.activities) {
      requireValue(/^[a-f0-9]{64}$/u.test(row.source_fingerprint), "Invalid source fingerprint");
      head = chainHash(head, row.source_fingerprint);
    }
    requireValue(head === history.identity.head_hash, "Gift-card history chain head mismatch");
  }
}

function requireValue(value: boolean, message: string): asserts value {
  if (!value) throw new Error(message);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function accountValue(value: unknown): value is { id: string; name: string } {
  return record(value) && typeof value.id === "string" && typeof value.name === "string";
}
function safe(value: bigint): number {
  requireValue(
    value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER),
    "Unsafe gift-card minor-unit amount",
  );
  return Number(value);
}
export function usdMinor(value: unknown): number {
  requireValue(typeof value === "string", "A visible USD amount is required");
  const match = /^(-?)\$(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})$/u.exec(value.trim());
  requireValue(match !== null, "Invalid visible USD amount");
  return safe(
    (match[1] === "-" ? -1n : 1n) *
      (BigInt(match[2]!.replaceAll(",", "")) * 100n + BigInt(match[3]!)),
  );
}
function day(value: unknown): string {
  requireValue(typeof value === "string", "An activity date is required");
  const match =
    /^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})$/u.exec(
      value,
    );
  requireValue(match !== null, "Unrecognized Amazon activity date");
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const month = months.indexOf(match[1]!) + 1;
  const result = `${match[3]}-${String(month).padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
  const date = new Date(result + "T00:00:00Z");
  requireValue(
    Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === result,
    "Invalid calendar date",
  );
  return result;
}
function pageValue(value: unknown): value is GiftCardPage {
  return (
    record(value) &&
    value.version === 1 &&
    value.source_url === "https://www.amazon.com/gc/balance" &&
    typeof value.captured_at === "string" &&
    Number.isFinite(Date.parse(value.captured_at)) &&
    typeof value.balance === "string" &&
    typeof value.has_next === "boolean" &&
    typeof value.has_previous === "boolean" &&
    Array.isArray(value.rows) &&
    value.rows.length > 0 &&
    value.rows.every(
      (row) =>
        record(row) &&
        ["date", "description", "amount", "closing_balance"].every(
          (key) => typeof row[key] === "string",
        ),
    )
  );
}
function activity(
  row: GiftCardPage["rows"][number],
  page: number,
): Omit<GiftCardActivity, "import_id"> {
  const definitions: [ActivityKind, RegExp][] = [
    ["redemption", /^Gift Card applied to Amazon\.com order(?: (\d{3}-\d{7}-\d{7}))?$/u],
    ["refund", /^Refund from Amazon\.com order(?: (\d{3}-\d{7}-\d{7}))?$/u],
    [
      "hold_release",
      /^Release of Gift Card Balance hold from Amazon\.com order(?: (\d{3}-\d{7}-\d{7}))?$/u,
    ],
    ["reload", /^Gift Card Balance added from Reload(?: (\d{3}-\d{7}-\d{7}))?$/u],
    ["auto_reload", /^Gift Card Balance added from Auto-Reload(?: (\d{3}-\d{7}-\d{7}))?$/u],
    ["gift_card_added", /^Gift Card added$/u],
    ["allowance", /^Allowance added$/u],
    ["cash_load", /^Amazon Cash load$/u],
  ];
  let kind: ActivityKind = "unknown";
  let order: string | undefined;
  for (const [candidate, expression] of definitions) {
    const match = expression.exec(row.description);
    if (match) {
      kind = candidate;
      order = match[1];
      break;
    }
  }
  const amount = usdMinor(row.amount);
  requireValue(amount !== 0, "Zero-valued activity needs manual review");
  requireValue(
    kind === "unknown" || (kind === "redemption" ? amount < 0 : amount > 0),
    "Activity direction conflicts with its description",
  );
  const closing = usdMinor(row.closing_balance);
  requireValue(closing >= 0, "Gift-card closing balance cannot be negative");
  const identity = {
    date: day(row.date),
    kind,
    order_number: order ?? null,
    amount_minor: amount,
    closing_balance_minor: closing,
  };
  return {
    source_fingerprint: digest(identity),
    date: identity.date,
    kind,
    ...(order !== undefined ? { order_number: order } : {}),
    amount_minor: amount,
    closing_balance_minor: closing,
    capture_page: page,
  };
}
function major(amount: number): string {
  const value = BigInt(amount);
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

/** Balancing a statement does not establish item categories or the source of added gift cards. */
export function reviewGiftCardHistory(document: unknown, inventory: unknown) {
  requireValue(
    record(document) &&
      document.version === 1 &&
      document.currency === "USD" &&
      Array.isArray(document.pages) &&
      document.pages.length > 0 &&
      document.pages.every(pageValue),
    "Expected sanitized Amazon US capture pages with explicit currency USD",
  );
  requireValue(
    record(inventory) &&
      Array.isArray(inventory.accounts) &&
      inventory.accounts.every(accountValue),
    "Expected Sure API account inventory",
  );
  const pages = document.pages;
  const current = usdMinor(pages[0]!.balance);
  requireValue(current >= 0, "Current gift-card balance cannot be negative");
  const activities: Omit<GiftCardActivity, "import_id">[] = [];
  for (const [index, page] of pages.entries()) {
    requireValue(
      page.has_previous === index > 0 && page.has_next === index < pages.length - 1,
      "Incomplete, repeated, or unordered history pages",
    );
    requireValue(
      usdMinor(page.balance) === current,
      "Current balance changed during capture; recapture history",
    );
    activities.push(...page.rows.map((row) => activity(row, index + 1)));
  }
  let expected = BigInt(current);
  for (const [index, row] of activities.entries()) {
    requireValue(
      BigInt(row.closing_balance_minor) === expected,
      `Running balance gap at activity ${index + 1}`,
    );
    requireValue(
      index === 0 || activities[index - 1]!.date >= row.date,
      "Activity dates are not newest-first",
    );
    expected -= BigInt(row.amount_minor);
    requireValue(expected >= 0n, "Activity implies a negative gift-card balance");
  }
  const totals = {
    redemption: { count: 0, amount_minor: 0 },
    refund: { count: 0, amount_minor: 0 },
    hold_release: { count: 0, amount_minor: 0 },
    gift_card_added: { count: 0, amount_minor: 0 },
    reload: { count: 0, amount_minor: 0 },
    auto_reload: { count: 0, amount_minor: 0 },
    allowance: { count: 0, amount_minor: 0 },
    cash_load: { count: 0, amount_minor: 0 },
    unknown: { count: 0, amount_minor: 0 },
  };
  for (const row of activities) {
    const total = totals[row.kind];
    total.count++;
    total.amount_minor = safe(BigInt(total.amount_minor) + BigInt(row.amount_minor));
  }
  const opening = safe(expected);
  const oldest = activities.at(-1)!;
  const rootHash = digest({
    scheme: IDENTITY_SCHEME,
    currency: "USD",
    opening_balance_minor: opening,
    oldest_date: oldest.date,
  });
  let headHash = rootHash;
  // Reverse source order only: sorting same-day activity would rewrite real hold cycles.
  const chronological: GiftCardActivity[] = activities.toReversed().map((row) => {
    headHash = chainHash(headHash, row.source_fingerprint);
    return Object.assign(row, { import_id: "amazon-gift-card:" + headHash });
  });
  const fingerprints = new Map<string, GiftCardActivity[]>();
  for (const row of chronological) {
    const group = fingerprints.get(row.source_fingerprint) ?? [];
    group.push(row);
    fingerprints.set(row.source_fingerprint, group);
  }
  const repeatedSourceFingerprints = [...fingerprints.values()]
    .filter((rows) => rows.length > 1)
    .map((rows) => ({
      source_fingerprint: rows[0]!.source_fingerprint,
      occurrences: rows.length,
      import_ids: rows.map((row) => row.import_id),
      capture_pages: rows.map((row) => row.capture_page),
    }));
  const openingDate = new Date(oldest.date + "T00:00:00Z");
  openingDate.setUTCDate(openingDate.getUTCDate() - 1);
  const existing = inventory.accounts.filter((account) =>
    /amazon.*gift|gift.*amazon/iu.test(account.name),
  );
  const accountProposal =
    existing.length === 0
      ? {
          account: {
            name: "Amazon Gift Card",
            account_type: "depository",
            subtype: "cash",
            currency: "USD",
            balance: major(opening),
            opening_balance_date: openingDate.toISOString().slice(0, 10),
            institution_name: "Amazon",
            institution_domain: "amazon.com",
            enable_category_matcher: false,
          },
        }
      : null;
  return {
    version: 1,
    mode: "read-only-review",
    currency: "USD",
    identity: { scheme: IDENTITY_SCHEME, root_hash: rootHash, head_hash: headHash },
    reconciled: true,
    current_balance_minor: current,
    opening_balance_minor: opening,
    opening_balance_date: openingDate.toISOString().slice(0, 10),
    coverage: {
      scope: "all available visible history",
      pages: pages.length,
      activities: activities.length,
      oldest_date: oldest.date,
      newest_date: activities[0]!.date,
    },
    totals,
    account_proposal: accountProposal,
    existing_account_candidates: existing.map((account) => ({
      id: account.id,
      name: account.name,
    })),
    repeated_source_fingerprints: repeatedSourceFingerprints,
    review_required: chronological.map((row) => ({
      import_id: row.import_id,
      category_id: null,
      tag_names: row.kind === "gift_card_added" ? ["ai-follow-up"] : ["follow-up"],
      ...(row.kind === "gift_card_added" ? { funding_status: "unconfirmed" as const } : {}),
      reason: REVIEW_REASONS[row.kind],
    })),
    // Chronological source order retains same-day ordering and excludes private identifiers.
    activities: chronological,
  };
}

/** Order-number references are candidate evidence, never proof of item/funding allocation. */
export function linkGiftCardOrders(
  activities: GiftCardActivity[],
  charges: Charge[],
  snapshot: Pick<Snapshot, "transactions">,
) {
  const orders = new Set(
    activities.flatMap((row) => (row.order_number !== undefined ? [row.order_number] : [])),
  );
  const payments = new Map<string, Set<string>>();
  for (const charge of charges) {
    for (const order of charge.orders) {
      if (!orders.has(order.order_number)) continue;
      const candidates = payments.get(order.order_number) ?? new Set<string>();
      candidates.add(charge.charge_id);
      payments.set(order.order_number, candidates);
    }
  }
  const ledger = new Map<string, Set<string>>();
  for (const transaction of snapshot.transactions) {
    const hasTransfer = Boolean(transaction.transfer);
    if ((transaction.parent_entry_id ?? "") !== "" || hasTransfer) continue;
    for (const order of transaction.notes?.match(/\b\d{3}-\d{7}-\d{7}\b/gu) ?? []) {
      if (!orders.has(order)) continue;
      const candidates = ledger.get(order) ?? new Set<string>();
      candidates.add(transaction.id);
      ledger.set(order, candidates);
    }
  }
  return [...orders].toSorted().map((order) => ({
    order_number: order,
    payment_evidence_candidates: [...(payments.get(order) ?? [])].toSorted(),
    ledger_note_candidates: [...(ledger.get(order) ?? [])].toSorted(),
  }));
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      captures: { type: "string" },
      accounts: { type: "string" },
      out: { type: "string" },
      charges: { type: "string" },
      snapshot: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help === true) {
    process.stdout.write(
      "Usage: node amazon-gift-card-review.ts --captures FILE --accounts FILE --out FILE [--charges FILE --snapshot FILE]\nRead-only USD gift-card reconciliation; no API calls or ledger writes.\n",
    );
    return;
  }
  requireValue(
    nonempty(values.captures) && nonempty(values.accounts) && nonempty(values.out),
    "--captures, --accounts and --out are required",
  );
  const report = reviewGiftCardHistory(await load(values.captures), await load(values.accounts));
  requireValue(
    Boolean(values.charges) === Boolean(values.snapshot),
    "--charges and --snapshot must be supplied together",
  );
  const orderEvidence =
    nonempty(values.charges) && nonempty(values.snapshot)
      ? linkGiftCardOrders(
          report.activities,
          await chargesFrom(values.charges),
          await readSnapshot(values.snapshot),
        )
      : null;
  await save(values.out, { ...report, order_evidence_candidates: orderEvidence });
  process.stdout.write(
    JSON.stringify({
      mode: report.mode,
      reconciled: report.reconciled,
      coverage: report.coverage,
      current_balance_minor: report.current_balance_minor,
      opening_balance_minor: report.opening_balance_minor,
      totals: report.totals,
      existing_account_candidates: report.existing_account_candidates,
      review_required: report.review_required.length,
      repeated_source_fingerprints: report.repeated_source_fingerprints.length,
    }) + "\n",
  );
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
