import assert from "node:assert/strict";
import test from "node:test";
import { compactAnnotationNotes, userNotes, type Match } from "../scripts/amazon-categorize.ts";
import { charge, transaction } from "./fixtures.ts";

const unique: Match = {
  transaction_id: "t1",
  status: "unique",
  charge_id: "payment",
  candidates: [],
};

void test("compaction removes only this transaction's AI sections and preserves personal text", () => {
  const personal = "My note with an inline [amazon-categorize:t1] reference.";
  const foreign =
    "[amazon-categorize:other]\nKeep this unrelated section.\n[/amazon-categorize:other]";
  const old = "[amazon-categorize:t1]\nOld failed-match diagnostics.\n[/amazon-categorize:t1]";
  const correction =
    "[amazon-categorize-revisit:t1]\nVerbose correction.\n[/amazon-categorize-revisit:t1]";
  const after = "\n\nMy later addition.\n\n" + foreign;
  assert.equal(
    userNotes(personal + "\n\n" + old + "\n\n" + correction + after, "t1"),
    personal + after,
  );
});

void test("an incomplete AI section stops cleanup instead of deleting original text", () => {
  assert.throws(() =>
    userNotes("Personal note.\n\n[amazon-categorize:t1]\nUnclosed section", "t1"),
  );
});

void test("compact notes retain item quantities and distinguishing variants without copying the audit trail", () => {
  const payment = charge("payment", {
    charged_on: "2026-10-20",
    evidence: "Detailed private payment audit that does not belong in the ledger.",
    orders: [
      {
        order_number: "111-2222222-3333333",
        items: [
          {
            title: "Everyday product " + "extended marketing description ".repeat(12) + "size XS",
            quantity: 2,
          },
        ],
      },
    ],
  });
  const notes = compactAnnotationNotes(
    transaction(),
    unique,
    new Map([[payment.charge_id, payment]]),
    true,
  );
  assert.match(notes, /2\s*[x×]\s*Everyday product/u);
  assert.ok(notes.includes("size XS"));
  assert.ok(notes.includes("111-2222222-3333333"));
  assert.equal(notes.includes(payment.evidence), false);
});

void test("note amounts respect currency minor units rather than assuming cents", () => {
  for (const [currency, amount] of [
    ["USD", "27.49"],
    ["JPY", "2749"],
    ["KWD", "2.749"],
  ]) {
    const payment = charge("payment", { currency, charged_on: "2026-10-20" });
    const notes = compactAnnotationNotes(
      transaction(),
      unique,
      new Map([[payment.charge_id, payment]]),
      true,
    );
    assert.ok(notes.includes(currency + " " + amount));
  }
});
