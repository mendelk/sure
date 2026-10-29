import assert from "node:assert/strict";
import test from "node:test";

import { collapseTransferPairs } from "../../app/javascript/spa/transfer-pairs.ts";
/** @param {string} id @param {Record<string, unknown>} [overrides] */
function leg(id, overrides = {}) {
  return {
    id,
    entry_id: `entry-${id}`,
    parent_entry_id: null,
    date: "2026-10-28",
    amount: "$60.00",
    currency: "USD",
    name: "Transfer",
    classification: "income",
    kind: "funds_movement",
    permissions: { can_annotate: true },
    tags: [],
    ...overrides,
  };
}

test("paired transfer legs collapse to the outflow leg", () => {
  const outflow = leg("outflow", {
    classification: "expense",
    name: "Transfer to Checking (9003)",
    transfer: { id: "t1", status: "confirmed" },
  });
  const inflow = leg("inflow", {
    classification: "income",
    name: "Transfer from Devorale",
    transfer: { id: "t1", status: "confirmed" },
  });

  assert.deepEqual(
    collapseTransferPairs([outflow, inflow]).map((t) => t.id),
    ["outflow"],
  );
  // Order-independent: inflow first still keeps the outflow.
  assert.deepEqual(
    collapseTransferPairs([inflow, outflow]).map((t) => t.id),
    ["outflow"],
  );
});

test("non-transfer rows and lone legs pass through untouched", () => {
  const plain = leg("plain", { classification: "expense", transfer: null });
  const lone = leg("lone-outflow", {
    classification: "expense",
    transfer: { id: "t2", status: "confirmed" },
  });

  const result = collapseTransferPairs([plain, lone]);
  assert.deepEqual(
    result.map((t) => t.id),
    ["plain", "lone-outflow"],
  );
  // No transfers at all returns the same array contents.
  assert.deepEqual(
    collapseTransferPairs([plain]).map((t) => t.id),
    ["plain"],
  );
});
