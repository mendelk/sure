import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GiftCardPage } from "../scripts/capture-gift-card.ts";

const KEY = "gift-card-loopback-only";
const SCRIPT = fileURLToPath(new URL("../scripts/amazon-gift-card-import.ts", import.meta.url));
export const ORDER = "111-2222222-3333333";
type Json = Record<string, unknown>;
export interface GiftCardCaptures {
  version: 1;
  currency: "USD";
  pages: GiftCardPage[];
}
export interface FixtureAccount extends Json {
  id: string;
  name: string;
  notes: string;
  balance_cents: number;
}
export interface FixtureRow extends Json {
  id: string;
  date: string;
  name: string;
  notes: string;
  amount_cents: number;
  signed_amount_cents: number;
  source: string | null;
  external_id: string | null;
  account: { id: string };
  category: { id: string; name: string } | null;
  tags: { id: string; name: string }[];
  transfer: Json | null;
}
export interface GiftCardFixture {
  root: string;
  url: string;
  accounts: FixtureAccount[];
  rows: FixtureRow[];
  tags: { id: string; name: string }[];
  requests: { method: string; path: string; query: URLSearchParams; body?: Json }[];
  faults: {
    loseAccountResponse: boolean;
    loseTransactionResponse: boolean;
    accountBalanceOverride?: number;
    afterTransaction?: (row: FixtureRow) => void;
    beforeTransactionRead?: (row: FixtureRow) => void;
  };
  writes(): { method: string; path: string; body?: Json }[];
  run(args: string[]): Promise<Json>;
  close(): Promise<void>;
}

export function capture(rows: GiftCardPage["rows"], balance: string): GiftCardCaptures {
  return {
    version: 1,
    currency: "USD",
    pages: [
      {
        version: 1 as const,
        source_url: "https://www.amazon.com/gc/balance",
        captured_at: "2026-10-25T00:00:00Z",
        balance,
        has_previous: false,
        has_next: false,
        rows,
      },
    ],
  };
}
export function activity(description: string, amount: string, closing_balance: string, day = 2) {
  return { date: `January ${day}, 2026`, description, amount, closing_balance };
}
export function additionCapture() {
  return capture([activity("Gift Card added", "$1.23", "$2.23")], "$2.23");
}
export function account(changes: Partial<FixtureAccount> = {}): FixtureAccount {
  return {
    id: "unrelated-account",
    name: "Household checking",
    notes: "User-owned account",
    account_type: "depository",
    subtype: "cash",
    currency: "USD",
    balance_cents: 100,
    balance: "1.00",
    opening_balance_date: "2026-01-01",
    institution_name: "Amazon",
    institution_domain: "amazon.com",
    enable_category_matcher: false,
    permissions: { can_edit: true, can_annotate: true },
    ...changes,
  };
}
function record(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function minor(value: unknown): number {
  assert.ok(typeof value === "string");
  assert.match(value, /^\d+\.\d{2}$/u);
  const [whole, fractional] = value.split(".");
  return Number(BigInt(whole!) * 100n + BigInt(fractional!));
}

export async function createGiftCardFixture(): Promise<GiftCardFixture> {
  const root = await mkdtemp(join(tmpdir(), "gift-card-import-test-"));
  const accounts: FixtureAccount[] = [];
  const rows: FixtureRow[] = [];
  const tags = [
    { id: "real-follow", name: "Follow-Up" },
    { id: "real-ai-follow", name: "AI-FOLLOW-UP" },
  ];
  const requests: GiftCardFixture["requests"] = [];
  const faults: GiftCardFixture["faults"] = {
    loseAccountResponse: false,
    loseTransactionResponse: false,
  };
  const openings = new Map<string, number>();
  const refresh = (entry: FixtureAccount) => {
    if (!openings.has(entry.id)) return;
    const movements = rows
      .filter((row) => row.account.id === entry.id && row.excluded !== true)
      .reduce((sum, row) => sum + row.signed_amount_cents, 0);
    entry.balance_cents = faults.accountBalanceOverride ?? openings.get(entry.id)! + movements;
    entry.balance = (entry.balance_cents / 100).toFixed(2);
  };
  const server = createServer((request, response) => {
    const dispatch = async () => {
      const respond = (value: unknown, status = 200) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(value));
      };
      if (request.headers["x-api-key"] !== KEY) {
        respond({ error: "unauthorized" }, 401);
        return;
      }
      const url = new URL(request.url!, "http://localhost");
      const path = url.pathname;
      let body: Json | undefined;
      if (request.method !== "GET") {
        let text = "";
        for await (const chunk of request) text += String(chunk);
        const parsed: unknown = JSON.parse(text || "{}");
        assert.ok(record(parsed));
        body = parsed;
      }
      requests.push({
        method: request.method!,
        path,
        query: url.searchParams,
        ...(body ? { body: structuredClone(body) } : {}),
      });
      const collection = (name: string, values: unknown[]) => {
        const page = Number(url.searchParams.get("page") ?? "1");
        // One account per page makes duplicate-account detection exercise pagination.
        const size = name === "accounts" ? 1 : 100;
        respond({
          [name]: values.slice((page - 1) * size, page * size),
          pagination: { page, total_pages: Math.max(1, Math.ceil(values.length / size)) },
          ...(name === "transactions"
            ? {
                split_parents: rows
                  .filter(
                    (row) =>
                      row.excluded === true &&
                      Array.isArray(row.split_children) &&
                      row.split_children.length > 0 &&
                      (url.searchParams.get("account_id") === null ||
                        row.account.id === url.searchParams.get("account_id")),
                  )
                  .map((row) => ({ transaction_id: row.id })),
              }
            : {}),
        });
      };
      if (request.method === "GET") {
        if (path === "/api/v1/tags") respond(tags);
        else if (path === "/api/v1/accounts") {
          accounts.forEach((entry) => {
            refresh(entry);
          });
          collection("accounts", accounts);
        } else if (path.startsWith("/api/v1/accounts/")) {
          const entry = accounts.find((item) => item.id === path.split("/").at(-1));
          if (!entry) respond({ error: "missing account" }, 404);
          else {
            refresh(entry);
            respond(entry);
          }
        } else if (path === "/api/v1/transactions") {
          const id = url.searchParams.get("account_id") ?? url.searchParams.get("account_ids[]");
          collection(
            "transactions",
            rows
              .filter((row) => row.excluded !== true && (id === null || row.account.id === id))
              .map((row) => {
                const listed = structuredClone(row);
                delete listed.split_parent;
                delete listed.split_children;
                return listed;
              }),
          );
        } else if (path.startsWith("/api/v1/transactions/")) {
          const row = rows.find((item) => item.id === path.split("/").at(-1));
          if (!row) respond({ error: "missing transaction" }, 404);
          else {
            faults.beforeTransactionRead?.(row);
            respond(row);
          }
        } else respond({ error: "unexpected GET" }, 404);
        return;
      }
      if (request.method === "POST" && path === "/api/v1/tags") {
        assert.ok(record(body?.tag));
        assert.ok(typeof body.tag.name === "string");
        const tag = { id: `new-real-tag-${tags.length}`, name: body.tag.name };
        tags.push(tag);
        respond(tag, 201);
      } else if (request.method === "POST" && path === "/api/v1/accounts") {
        assert.ok(record(body?.account));
        const input = body.account;
        assert.equal(input.account_type, "depository");
        assert.equal(input.subtype, "cash");
        assert.equal(input.currency, "USD");
        assert.equal(input.enable_category_matcher, false);
        assert.ok(typeof input.name === "string");
        assert.ok(typeof input.notes === "string");
        assert.ok(typeof input.opening_balance_date === "string");
        assert.match(input.opening_balance_date, /^\d{4}-\d{2}-\d{2}$/u);
        const entry = account({
          ...input,
          id: `gift-account-${accounts.length}`,
          name: input.name,
          notes: input.notes,
          balance_cents: minor(input.balance),
        });
        accounts.push(entry);
        openings.set(entry.id, entry.balance_cents);
        if (faults.loseAccountResponse) {
          faults.loseAccountResponse = false;
          response.destroy();
        } else respond(entry, 201);
      } else if (request.method === "POST" && path === "/api/v1/transactions") {
        assert.ok(record(body?.transaction));
        const input = body.transaction;
        assert.equal(input.currency, "USD");
        assert.equal(input.source, "amazon-gift-card");
        assert.equal(input.user_modified, true);
        assert.equal(input.category_id, null);
        assert.ok(typeof input.date === "string");
        assert.match(input.date, /^\d{4}-\d{2}-\d{2}$/u);
        assert.ok(typeof input.name === "string");
        assert.ok(typeof input.notes === "string");
        assert.ok(typeof input.external_id === "string");
        assert.ok(typeof input.account_id === "string");
        assert.ok(Array.isArray(input.tag_ids));
        assert.ok(input.tag_ids.length > 0);
        const actualTags = input.tag_ids.map((id) => {
          assert.ok(typeof id === "string");
          const tag = tags.find((candidate) => candidate.id === id);
          assert.ok(tag, `Unknown real tag ID ${id}`);
          return structuredClone(tag);
        });
        const amount = minor(input.amount);
        assert.ok(amount > 0);
        assert.ok(input.nature === "inflow" || input.nature === "outflow");
        const existing = rows.find(
          (row) =>
            row.account.id === input.account_id &&
            row.source === input.source &&
            row.external_id === input.external_id,
        );
        if (existing) {
          respond(existing);
          return;
        }
        assert.ok(accounts.some((entry) => entry.id === input.account_id));
        const row: FixtureRow = {
          id: `gift-row-${rows.length}`,
          entry_id: `gift-entry-${rows.length}`,
          date: input.date,
          name: input.name,
          notes: input.notes,
          amount_cents: amount,
          signed_amount_cents: input.nature === "inflow" ? amount : -amount,
          currency: "USD",
          classification: input.nature === "inflow" ? "income" : "expense",
          kind: "standard",
          source: input.source,
          external_id: input.external_id,
          account: { id: input.account_id },
          category: null,
          tags: actualTags,
          transfer: null,
          pending: false,
          user_modified: true,
          permissions: { can_edit: true, can_annotate: true },
        };
        rows.push(row);
        faults.afterTransaction?.(row);
        if (faults.loseTransactionResponse) {
          faults.loseTransactionResponse = false;
          response.destroy();
        } else respond(row, 201);
      } else {
        respond(
          { error: "Forbidden fixture write: only account/tag/transaction creation is authorized" },
          405,
        );
      }
    };
    void dispatch().catch((error: unknown) => {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      );
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const run = async (args: string[]): Promise<Json> => {
    const child = spawn(process.execPath, [SCRIPT, ...args, "--url", url], {
      env: { ...process.env, SURE_API_KEY: KEY, SURE_URL: url },
      timeout: 30_000,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const closed: unknown = await once(child, "close");
    assert.ok(Array.isArray(closed));
    const code: unknown = closed[0];
    const signal: unknown = closed[1];
    assert.ok(code === null || (typeof code === "number" && Number.isInteger(code)));
    assert.ok(signal === null || typeof signal === "string");
    assert.equal(signal, null, stderr);
    assert.equal(code, 0, stderr);
    const parsed: unknown = JSON.parse(stdout);
    assert.ok(record(parsed));
    return parsed;
  };
  return {
    root,
    url,
    accounts,
    rows,
    tags,
    requests,
    faults,
    run,
    writes: () => requests.filter((request) => request.method !== "GET"),
    close: async () => {
      const closed = once(server, "close");
      server.close();
      server.closeAllConnections();
      await closed;
      await rm(root, { recursive: true, force: true });
    },
  };
}

export const fixtureKey = KEY;
