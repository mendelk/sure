import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Proves the browser/server import boundaries enforced by the root
// .oxlintrc.json actually report violations, without leaving failing
// fixtures in the normal checks:
//
// - The deliberate fixtures in src/__fixtures__/ are excluded from
//   typecheck (tsconfig excludes) and from `pnpm lint:web`
//   (--ignore-pattern), so the normal suite stays green.
// - This test lints those fixtures directly with the same root oxlint
//   config the normal checks use and asserts the expected boundary rules
//   fire (negative proof), plus asserts representative real sources pass
//   (positive control).

const webRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const repoRoot = path.resolve(webRoot, "..", "..");
const oxlintBin = path.join(
	repoRoot,
	"node_modules",
	".bin",
	`oxlint${process.platform === "win32" ? ".cmd" : ""}`,
);

interface LintResult {
	status: number | null;
	output: string;
}

function runOxlint(relativePaths: string[]): LintResult {
	const result = spawnSync(oxlintBin, relativePaths, {
		cwd: repoRoot,
		encoding: "utf8",
		timeout: 120_000,
	});
	return {
		status: result.status,
		output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
	};
}

describe("browser/server import boundaries", () => {
	it("reports a client-safe module importing a server-only module", () => {
		const lint = runOxlint(["apps/web/src/__fixtures__/client-imports-server.ts"]);

		expect(lint.status).not.toBe(0);
		expect(lint.output).toContain("no-restricted-imports");
	}, 60_000);

	it("reports Node.js built-ins and globals in a client-safe module", () => {
		const lint = runOxlint(["apps/web/src/__fixtures__/browser-uses-node.ts"]);

		expect(lint.status).not.toBe(0);
		expect(lint.output).toContain("no-restricted-imports");
		expect(lint.output).toContain("no-restricted-globals");
	}, 60_000);

	it("passes representative real sources with the same config", () => {
		const lint = runOxlint([
			"apps/web/src/lib/sure-api-origin.ts",
			"apps/web/src/lib/sure-api.server.ts",
			"apps/web/src/routes/index.tsx",
		]);

		// Warnings (e.g. type-aware no-unsafe-*) are reported but do
		// not fail: only errors must be absent here.
		expect(lint.status).toBe(0);
	}, 60_000);
}, 60_000);
