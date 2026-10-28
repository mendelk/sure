import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { readPlan, readSnapshot, save, type Decision } from "../scripts/amazon-categorize.ts";
import {
  CATEGORY,
  FOLLOW,
  OTHER,
  charge,
  createFixture,
  transaction,
  type Fixture,
} from "./fixtures.ts";

async function plan(
  fixture: Fixture,
  decisions: Decision[] = [],
  charges = [charge()],
  succeeds = true,
) {
  await save(join(fixture.root, "charges.json"), { version: 1, charges });
  await save(join(fixture.root, "decisions.json"), { decisions });
  return fixture.run(
    [
      "plan",
      "--snapshot",
      join(fixture.root, "snapshot.json"),
      "--charges",
      join(fixture.root, "charges.json"),
      "--decisions",
      join(fixture.root, "decisions.json"),
      "--out",
      join(fixture.root, "plan.json"),
    ],
    succeeds,
  );
}
const categoryDecision: Decision[] = [
  {
    transaction_id: "resolve",
    category_id: CATEGORY.id,
    reason: "Only USB-C cables; Electronics fits.",
  },
];

void test(
  "normal discovery does not reopen prior classification",
  { timeout: 30_000 },
  async () => {
    const fixture = await createFixture();
    try {
      await fixture.snapshot();
      assert.deepEqual((await readSnapshot(join(fixture.root, "snapshot.json"))).target_ids, [
        "fresh",
      ]);
      assert.deepEqual(fixture.patches, []);
    } finally {
      await fixture.close();
    }
  },
);
void test(
  "explicit resolution preserves financial fields and earlier notes, and is idempotent",
  { timeout: 30_000 },
  async () => {
    const fixture = await createFixture();
    try {
      await fixture.snapshot(["resolve", "unresolved", "classified", "extra-tag"]);
      const snapshot = await readSnapshot(join(fixture.root, "snapshot.json"));
      assert.deepEqual(snapshot.target_ids, ["resolve", "unresolved"]);
      assert.deepEqual(
        new Set(snapshot.skipped.map((row) => row.transaction_id)),
        new Set(["classified", "extra-tag"]),
      );
      const original = structuredClone(fixture.rows);
      const planned = await plan(fixture, categoryDecision);
      assert.equal(planned.operations, 1);
      assert.equal(planned.unchanged, 1);
      const args = ["apply", "--plan", join(fixture.root, "plan.json")];
      const dryRun = await fixture.run(args);
      assert.equal(dryRun.ready, 1);
      assert.equal(dryRun.already_applied, 0);
      assert.deepEqual(fixture.rows, original);
      args.push("--commit", "--journal", join(fixture.root, "journal.json"));
      assert.equal((await fixture.run(args)).applied, 1);
      const resolved = fixture.rows.resolve!;
      assert.deepEqual(resolved.category, CATEGORY);
      assert.deepEqual(resolved.tags, [{ id: "existing-ai", name: "AI-Categorized" }]);
      assert.equal(resolved.notes!.includes("Earlier unresolved evidence."), false);
      assert.ok(resolved.notes!.includes("111-2222222-3333333"));
      assert.match(resolved.notes!, /2\s*[x×]\s*USB-C cable/u);
      for (const field of Object.keys(original.resolve!)) {
        if (!["category", "tags", "notes"].includes(field))
          assert.deepEqual(resolved[field], original.resolve![field]);
      }
      for (const identifier of ["unresolved", "classified", "extra-tag", "fresh"])
        assert.deepEqual(fixture.rows[identifier], original[identifier]);
      const repeated = await fixture.run(args);
      assert.equal(repeated.applied, 0);
      assert.equal(repeated.already_applied, 1);
      assert.equal(fixture.patches.length, 1);
      assert.deepEqual(
        new Set(Object.keys(fixture.patches[0]!.patch)),
        new Set(["category_id", "notes", "tag_ids"]),
      );
    } finally {
      await fixture.close();
    }
  },
);
void test(
  "ambiguous payments or another ledger owner prevent follow-up resolution",
  { timeout: 30_000 },
  async () => {
    const fixture = await createFixture();
    try {
      await fixture.snapshot(["resolve"]);
      await plan(fixture, [], [charge(), charge("second-payment")]);
      let result = await readPlan(join(fixture.root, "plan.json"));
      assert.deepEqual(result.operations, []);
      assert.equal(result.unchanged[0]!.match.status, "ambiguous");
      await plan(fixture, categoryDecision, [charge(), charge("second-payment")], false);
      fixture.rows.classified = transaction("classified", { category: CATEGORY });
      await fixture.snapshot(["resolve"]);
      await plan(fixture);
      result = await readPlan(join(fixture.root, "plan.json"));
      assert.deepEqual(result.operations, []);
      assert.equal(result.unchanged[0]!.match.status, "ambiguous");
      assert.deepEqual(fixture.patches, []);
    } finally {
      await fixture.close();
    }
  },
);
void test(
  "a tag added after planning stops the batch without being erased",
  { timeout: 30_000 },
  async () => {
    const fixture = await createFixture();
    try {
      await fixture.snapshot(["resolve"]);
      await plan(fixture, categoryDecision);
      fixture.rows.resolve!.tags!.push(structuredClone(OTHER));
      await fixture.run(
        [
          "apply",
          "--plan",
          join(fixture.root, "plan.json"),
          "--commit",
          "--journal",
          join(fixture.root, "journal.json"),
        ],
        false,
      );
      assert.deepEqual(fixture.rows.resolve!.tags, [FOLLOW, OTHER]);
      assert.equal(fixture.rows.resolve!.category, null);
      assert.deepEqual(fixture.patches, []);
    } finally {
      await fixture.close();
    }
  },
);
void test(
  "an empty revisit allowlist cannot fall back to unrelated fresh targets",
  { timeout: 30_000 },
  async () => {
    const fixture = await createFixture();
    try {
      await save(join(fixture.root, "ids.json"), { transaction_ids: [] });
      await fixture.run(
        [
          "snapshot",
          "--out",
          join(fixture.root, "snapshot.json"),
          "--revisit-follow-up-ids",
          join(fixture.root, "ids.json"),
        ],
        false,
      );
      await assert.rejects(access(join(fixture.root, "snapshot.json")));
      assert.deepEqual(fixture.patches, []);
    } finally {
      await fixture.close();
    }
  },
);
void test(
  "normal unresolved records still receive evidence and a follow-up tag",
  { timeout: 30_000 },
  async () => {
    const fixture = await createFixture();
    try {
      fixture.tags.splice(
        fixture.tags.findIndex((tag) => tag.name.toLowerCase() === "ai-categorized"),
        1,
      );
      await fixture.snapshot();
      await plan(fixture, [], [charge("fresh-payment", { amount_minor: 5500 })]);
      await fixture.run([
        "apply",
        "--plan",
        join(fixture.root, "plan.json"),
        "--commit",
        "--journal",
        join(fixture.root, "journal.json"),
      ]);
      assert.deepEqual(fixture.rows.fresh!.tags, [FOLLOW]);
      assert.equal(fixture.rows.fresh!.category, null);
      assert.ok(fixture.rows.fresh!.notes!.startsWith("User note.\n\n"));
      assert.ok(fixture.rows.fresh!.notes!.includes("111-2222222-3333333"));
      assert.equal(
        fixture.tags.some((tag) => tag.name.toLowerCase() === "ai-categorized"),
        false,
      );
    } finally {
      await fixture.close();
    }
  },
);

void test(
  "Woot is reported but never targeted or patched by Amazon discovery or revisiting",
  { timeout: 30_000 },
  async () => {
    const fixture = await createFixture();
    try {
      fixture.rows.woot = transaction("woot", { name: "AMZ*WOOT LLC EXAMPLE" });
      const original = structuredClone(fixture.rows.woot);
      await fixture.snapshot();
      const normal = await readSnapshot(join(fixture.root, "snapshot.json"));
      assert.deepEqual(normal.target_ids, ["fresh"]);
      assert.deepEqual(
        normal.skipped.map((row) => row.transaction_id),
        ["woot"],
      );
      fixture.rows.woot.tags = [FOLLOW];
      await fixture.snapshot(["resolve", "woot"]);
      const revisited = await readSnapshot(join(fixture.root, "snapshot.json"));
      assert.deepEqual(revisited.target_ids, ["resolve"]);
      assert.deepEqual(
        revisited.skipped.map((row) => row.transaction_id),
        ["woot"],
      );
      await plan(fixture, categoryDecision);
      await fixture.run([
        "apply",
        "--plan",
        join(fixture.root, "plan.json"),
        "--commit",
        "--journal",
        join(fixture.root, "journal.json"),
      ]);
      assert.deepEqual(fixture.rows.woot, { ...original, tags: [FOLLOW] });
      assert.deepEqual(
        fixture.patches.map((patch) => patch.identifier),
        ["resolve"],
      );
    } finally {
      await fixture.close();
    }
  },
);

void test(
  "normal category assignments create ai-categorized only when needed",
  { timeout: 30_000 },
  async () => {
    const fixture = await createFixture();
    try {
      fixture.tags.splice(
        fixture.tags.findIndex((tag) => tag.name.toLowerCase() === "ai-categorized"),
        1,
      );
      await fixture.snapshot();
      await plan(
        fixture,
        [
          {
            transaction_id: "fresh",
            category_id: CATEGORY.id,
            reason: "Only cables; Electronics fits.",
          },
        ],
        [charge("fresh-payment", { amount_minor: 5500 })],
      );
      const args = ["apply", "--plan", join(fixture.root, "plan.json")];
      assert.equal((await fixture.run(args)).would_create_ai_categorized_tag, true);
      assert.equal(
        fixture.tags.some((tag) => tag.name.toLowerCase() === "ai-categorized"),
        false,
      );
      args.push("--commit", "--journal", join(fixture.root, "journal.json"));
      await fixture.run(args);
      assert.equal(fixture.rows.fresh!.category?.id, CATEGORY.id);
      assert.deepEqual(
        fixture.rows.fresh!.tags?.map((tag) => tag.name),
        ["ai-categorized"],
      );
      assert.equal((await fixture.run(args)).already_applied, 1);
      assert.deepEqual(
        fixture.tags.filter((tag) => tag.name.toLowerCase() === "ai-categorized"),
        fixture.rows.fresh!.tags,
      );
    } finally {
      await fixture.close();
    }
  },
);

void test(
  "tag-only resumption preserves additional tags and refuses changed financial state",
  { timeout: 30_000 },
  async () => {
    const fixture = await createFixture();
    try {
      await fixture.snapshot(["resolve"]);
      await plan(fixture, categoryDecision);
      const args = [
        "apply",
        "--plan",
        join(fixture.root, "plan.json"),
        "--commit",
        "--journal",
        join(fixture.root, "journal.json"),
      ];
      await fixture.run(args);
      fixture.rows.resolve!.tags = [OTHER];
      const previous = structuredClone(fixture.rows.resolve!);
      const result = await fixture.run(args);
      assert.equal(result.categorized, 0);
      assert.equal(result.tag_only, 1);
      assert.deepEqual(
        new Set(fixture.rows.resolve!.tags.map((tag) => tag.id)),
        new Set([OTHER.id, "existing-ai"]),
      );
      assert.equal(fixture.rows.resolve!.notes, previous.notes);
      assert.deepEqual(fixture.rows.resolve!.category, previous.category);
      assert.deepEqual(Object.keys(fixture.patches.at(-1)!.patch), ["tag_ids"]);
      assert.equal((await fixture.run(args)).already_applied, 1);
      fixture.rows.resolve!.tags = [OTHER];
      fixture.rows.resolve!.amount_cents++;
      const writes = fixture.patches.length;
      await fixture.run(args, false);
      assert.equal(fixture.patches.length, writes);
      assert.deepEqual(fixture.rows.resolve!.tags, [OTHER]);
    } finally {
      await fixture.close();
    }
  },
);
