// Deliberate boundary-violation fixture (NOT shipped, NOT typechecked).
//
// This file must FAIL `pnpm lint:web` when linted directly: a client-safe
// module reaching for Node.js APIs (`node:fs` import + `process` global).
// It is excluded from normal checks (tsconfig excludes + lint:web
// --ignore-pattern) and is only exercised by
// src/lib/boundary-enforcement.test.ts, which asserts oxlint reports
// `no-restricted-imports` and `no-restricted-globals` for it.
import { readFileSync } from "node:fs";

export function fixtureNodeUsage(path: string): string {
	const prefix = process.env["SURE_FIXTURE_PREFIX"] ?? "fixture";
	return `${prefix}:${readFileSync(path, "utf8").length}`;
}
