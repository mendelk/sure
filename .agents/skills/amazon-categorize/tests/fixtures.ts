import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  save,
  type Category,
  type Charge,
  type Tag,
  type Transaction,
} from "../scripts/amazon-categorize.ts";

export const FOLLOW: Tag = { id: "follow", name: "Follow-Up" };
export const OTHER: Tag = { id: "other", name: "Receipt" };
export const CATEGORY: Category = { id: "electronics", name: "Electronics" };
const SCRIPT = fileURLToPath(new URL("../scripts/amazon-categorize.ts", import.meta.url));

export interface Fixture {
  root: string;
  rows: Record<string, Transaction>;
  patches: { identifier: string; patch: Record<string, unknown> }[];
  splits: { identifier: string; split: Record<string, unknown> }[];
  requests: { method: string; path: string; body: Record<string, unknown> }[];
  reads: string[];
  categories: Category[];
  faults: {
    loseSplitResponse: boolean;
    rejectSplit: boolean;
    afterSplit?: (parent: Transaction, children: Transaction[]) => void;
    beforeRead?: (identifier: string) => void;
  };
  tags: Tag[];
  url: string;
  run(args: string[], succeeds?: boolean): Promise<Record<string, unknown>>;
  snapshot(identifiers?: string[]): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function transaction(id = "t1", changes: Partial<Transaction> = {}): Transaction {
  return {
    id,
    entry_id: "entry-" + id,
    name: "AMZN Mktp",
    date: "2026-10-23",
    amount_cents: 2749,
    currency: "USD",
    classification: "expense",
    kind: "standard",
    pending: false,
    parent_entry_id: null,
    split_children: [],
    transfer: null,
    category: null,
    category_editable: true,
    tags: [],
    permissions: { can_annotate: true },
    account: { id: "account" },
    merchant: { id: "amazon", name: "Amazon" },
    notes: "User note.",
    ...changes,
  };
}
export function charge(id = "shipment", changes: Partial<Charge> = {}): Charge {
  return {
    charge_id: id,
    kind: "charge",
    amount_minor: 2749,
    currency: "USD",
    shipped_on: "2026-10-19",
    ordered_on: "2025-01-01",
    source_url: "https://www.amazon.com/example?orderID=111-2222222-3333333",
    evidence: "Shipment dated October 19, USD 27.49 card-funded including tax.",
    orders: [
      { order_number: "111-2222222-3333333", items: [{ title: "USB-C cable", quantity: 2 }] },
    ],
    ...changes,
  };
}

export async function createFixture(options: { splits?: boolean } = {}): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "amazon-categorize-test-"));
  const previous = (id: string, changes: Partial<Transaction> = {}) =>
    transaction(id, {
      tags: structuredClone([FOLLOW]),
      notes: `[amazon-categorize:${id}]\nEarlier unresolved evidence.\n[/amazon-categorize:${id}]`,
      ...changes,
    });
  const rows: Record<string, Transaction> = {
    resolve: previous("resolve"),
    unresolved: previous("unresolved", { amount_cents: 9900 }),
    fresh: transaction("fresh", { amount_cents: 5500 }),
    classified: previous("classified", { category: CATEGORY, amount_cents: 6600 }),
    "extra-tag": previous("extra-tag", { tags: [FOLLOW, OTHER], amount_cents: 7700 }),
  };
  const patches: { identifier: string; patch: Record<string, unknown> }[] = [];
  const tags: Tag[] = structuredClone([
    FOLLOW,
    OTHER,
    { id: "existing-ai", name: "AI-Categorized" },
  ]);
  const categories = structuredClone([CATEGORY]);
  const splits: Fixture["splits"] = [];
  const requests: Fixture["requests"] = [];
  const reads: string[] = [];
  const faults: Fixture["faults"] = { loseSplitResponse: false, rejectSplit: false };
  if (options.splits === true) {
    for (const row of Object.values(rows)) {
      row.permissions = { ...row.permissions, can_edit: true };
      row.excluded = false;
      row.splittable = true;
      row.split_annotation_support = true;
    }
  }
  const server = createServer((request, response) => {
    const dispatch = async () => {
      const respond = (value: unknown, status = 200) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(value));
      };
      if (request.headers["x-api-key"] !== "loopback-fixture-only") {
        respond({ error: "unauthorized" }, 401);
        return;
      }
      const path = new URL(request.url!, "http://localhost").pathname;
      if (request.method === "GET") {
        if (path === "/api/v1/tags") respond(tags);
        else if (path === "/api/v1/transactions" || path === "/api/v1/categories") {
          const name = path.split("/").at(-1)!;
          const splitParents =
            options.splits === true && name === "transactions"
              ? Object.values(rows).filter((row) => (row.split_children?.length ?? 0) > 0)
              : [];
          respond({
            [name]:
              name === "transactions"
                ? Object.values(rows).filter((row) => !splitParents.includes(row))
                : categories,
            ...(options.splits === true && name === "transactions"
              ? {
                  split_parents: splitParents.map((row) => ({
                    entry_id: row.entry_id,
                    transaction_id: row.id,
                    name: row.name,
                    amount: "localized split parent display is not a numeric API field",
                    account_name: "Fixture account",
                  })),
                }
              : {}),
            pagination: { page: 1, total_pages: 1 },
          });
        } else if (path.startsWith("/api/v1/transactions/")) {
          const identifier = path.split("/").at(-1)!;
          reads.push(identifier);
          faults.beforeRead?.(identifier);
          const row = rows[path.split("/").at(-1)!];
          respond(row ?? { error: "not found" }, row ? 200 : 404);
        } else respond({ error: "not found" }, 404);
        return;
      }
      let body = "";
      for await (const chunk of request) body += String(chunk);
      const value: unknown = JSON.parse(body);
      if (!record(value)) throw new Error("Expected a fixture request object");
      requests.push({ method: request.method!, path, body: structuredClone(value) });
      if (request.method === "POST" && path === "/api/v1/tags") {
        if (!record(value.tag) || typeof value.tag.name !== "string")
          throw new Error("Invalid fixture tag");
        const tag = { id: "created-" + tags.length, name: value.tag.name };
        tags.push(tag);
        respond(tag);
        return;
      }
      if (options.splits === true && request.method === "POST" && path.endsWith("/split")) {
        const identifier = path.split("/").at(-2)!;
        const parent = rows[identifier];
        if (
          !parent ||
          typeof parent.entry_id !== "string" ||
          !record(value.split) ||
          !Array.isArray(value.split.splits)
        )
          throw new Error("Invalid fixture split request");
        const parentEntryId = parent.entry_id;
        const payload = value.split;
        splits.push({ identifier, split: structuredClone(payload) });
        if (faults.rejectSplit) {
          respond({ error: "split rejected atomically" }, 422);
          return;
        }
        if (
          (parent.split_children?.length ?? 0) > 0 ||
          (typeof parent.parent_entry_id === "string" && parent.parent_entry_id.length > 0)
        ) {
          respond({ error: "already split" }, 422);
          return;
        }
        if (
          !record(payload.parent) ||
          Object.keys(payload.parent).some((field) => !["notes", "tag_ids"].includes(field))
        )
          throw new Error("Invalid fixture split parent annotations");
        const annotations = (input: Record<string, unknown>) => {
          if (
            (input.notes !== undefined && typeof input.notes !== "string") ||
            !Array.isArray(input.tag_ids) ||
            !input.tag_ids.every(
              (id) => typeof id === "string" && tags.some((tag) => tag.id === id),
            )
          )
            throw new Error("Invalid fixture atomic annotations");
          const tagIds = input.tag_ids;
          return {
            notes: typeof input.notes === "string" ? input.notes : null,
            tags: structuredClone(tags.filter((tag) => tagIds.includes(tag.id))),
          };
        };
        const parentAnnotations = annotations(payload.parent);
        const precision = new Intl.NumberFormat("en", {
          style: "currency",
          currency: parent.currency,
        }).resolvedOptions().maximumFractionDigits!;
        const parseAmount = (input: unknown) => {
          if (typeof input !== "string" || !/^-?\d+(?:\.\d+)?$/u.test(input))
            throw new Error("Split amount must be an exact decimal string");
          const negative = input.startsWith("-");
          const [whole, fraction = ""] = input.replace(/^-/u, "").split(".");
          if (fraction.length > precision) throw new Error("Excess split currency precision");
          const minor = Number(
            BigInt(whole!) * 10n ** BigInt(precision) +
              BigInt(fraction.padEnd(precision, "0") || "0"),
          );
          if (
            !Number.isSafeInteger(minor) ||
            minor <= 0 ||
            negative !== (parent.classification === "expense")
          )
            throw new Error("Invalid split amount or cash-flow direction");
          return minor;
        };
        const children = value.split.splits.map((input: unknown, index: number) => {
          if (
            !record(input) ||
            typeof input.name !== "string" ||
            (input.excluded !== undefined && input.excluded !== false) ||
            (input.transfer_account_id !== undefined && input.transfer_account_id !== null)
          )
            throw new Error("Invalid fixture ordinary split child");
          const category = categories.find((candidate) => candidate.id === input.category_id);
          if (!category) throw new Error("Unknown fixture split category");
          const childId = `${identifier}-child-${index + 1}`;
          return transaction(childId, {
            entry_id: `entry-${childId}`,
            amount_cents: parseAmount(input.amount),
            classification: parent.classification,
            date: parent.date,
            currency: parent.currency,
            account: structuredClone(parent.account),
            merchant: structuredClone(parent.merchant),
            name: input.name,
            parent_entry_id: parentEntryId,
            split_parent: {
              entry_id: parentEntryId,
              transaction_id: parent.id,
              name: parent.name,
              date: parent.date,
              amount: "localized parent display",
            },
            excluded: false,
            splittable: false,
            split_annotation_support: true,
            category: structuredClone(category),
            ...annotations(input),
          });
        });
        if (
          children.length < 2 ||
          children.reduce((total: number, child: Transaction) => total + child.amount_cents, 0) !==
            parent.amount_cents
        )
          throw new Error("Fixture split does not conserve parent amount");
        Object.assign(parent, parentAnnotations, {
          excluded: true,
          splittable: false,
          split_parent: null,
          split_children: children.map((child: Transaction) => ({
            entry_id: child.entry_id,
            transaction_id: child.id,
            amount: "localized summary is not a numeric API field",
          })),
        });
        for (const child of children) rows[child.id] = child;
        faults.afterSplit?.(parent, children);
        if (faults.loseSplitResponse) {
          faults.loseSplitResponse = false;
          response.destroy();
        } else respond(parent, 201);
        return;
      }
      if (request.method === "PATCH" && path.startsWith("/api/v1/transactions/")) {
        const identifier = path.split("/").at(-1)!;
        const patch = value.transaction;
        if (!record(patch)) throw new Error("Invalid fixture annotations");
        const row = rows[identifier]!;
        if (typeof row.parent_entry_id === "string" && row.parent_entry_id.length > 0) {
          respond({ error: "split children cannot be annotated separately" }, 422);
          return;
        }
        patches.push({ identifier, patch });
        for (const [field, content] of Object.entries(patch)) {
          if (field === "category_id") {
            row.category = structuredClone(
              categories.find((category) => category.id === content) ?? null,
            );
          } else if (field === "tag_ids") {
            if (
              !Array.isArray(content) ||
              !content.every((id): id is string => typeof id === "string")
            )
              throw new Error("Invalid fixture tag IDs");
            row.tags = structuredClone(tags.filter((tag) => content.includes(tag.id)));
          } else row[field] = content;
        }
        respond(row);
        return;
      }
      respond({ error: "not found" }, 404);
    };
    void dispatch().catch((error) => {
      response.writeHead(500);
      response.end(String(error));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Loopback fixture failed to bind");
  const url = `http://127.0.0.1:${address.port}`;
  const run = async (args: string[], succeeds = true): Promise<Record<string, unknown>> => {
    const done = Promise.withResolvers<{ code: number | null; stdout: string; stderr: string }>();
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, SURE_API_KEY: "loopback-fixture-only", SURE_URL: url },
      timeout: 25_000,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      done.reject(error);
    });
    child.once("close", (code) => {
      done.resolve({ code, stdout, stderr });
    });
    const result = await done.promise;
    if (!succeeds) {
      if (result.code === null || result.code === 0)
        throw new Error("CLI unexpectedly succeeded or was interrupted");
      return { error: result.stderr };
    }
    if (result.code !== 0) throw new Error(result.stderr);
    const report: unknown = JSON.parse(result.stdout);
    if (!record(report)) throw new Error("CLI did not return a report object");
    return report;
  };
  const snapshot = async (identifiers?: string[]) => {
    const args = ["snapshot", "--out", join(root, "snapshot.json")];
    if (identifiers !== undefined) {
      await save(join(root, "ids.json"), { transaction_ids: identifiers });
      args.push("--revisit-follow-up-ids", join(root, "ids.json"));
    }
    return run(args);
  };
  const close = async () => {
    const closed = once(server, "close");
    server.close();
    server.closeAllConnections();
    await closed;
    await rm(root, { recursive: true, force: true });
  };
  return {
    root,
    rows,
    patches,
    splits,
    requests,
    reads,
    categories,
    faults,
    tags,
    url,
    run,
    snapshot,
    close,
  };
}
