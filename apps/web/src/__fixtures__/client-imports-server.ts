// Deliberate boundary-violation fixture (NOT shipped, NOT typechecked).
//
// This file must FAIL `pnpm lint:web` when linted directly: a client-safe
// module importing a server-only (*.server.*) module. It is excluded from
// normal checks (tsconfig excludes + lint:web --ignore-pattern) and is only
// exercised by src/lib/boundary-enforcement.test.ts, which asserts oxlint
// reports `no-restricted-imports` for it.
import { getSureApiOrigin } from "../sure-api.server";

export function fixtureServerImport(): string {
	return getSureApiOrigin();
}
