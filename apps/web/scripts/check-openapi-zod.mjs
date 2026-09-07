#!/usr/bin/env node
/**
 * Drift check for Orval-generated Zod contracts.
 *
 * Regenerates the contracts into a fresh temporary directory (same
 * relative `endpoints/` + `models/` layout, so emitted import paths are
 * identical) and diffs the tree against the committed `src/lib/api/zod/`.
 * Exits non-zero on any difference. This script shells out to the pinned
 * Orval binary and compares bytes; it contains no OpenAPI schema
 * interpretation of its own.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WEB_DIR = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const EXPECTED = join(WEB_DIR, "src/lib/api/zod");
const workdir = mkdtempSync(join(tmpdir(), "sure-zod-check-"));

try {
	execFileSync(
		join(WEB_DIR, "node_modules/.bin/orval"),
		["--config", "./orval.config.ts", "--fail-on-warnings"],
		{
			cwd: WEB_DIR,
			env: { ...process.env, SURE_ZOD_OUT_DIR: join(workdir, "zod") },
			stdio: "inherit",
		},
	);
	execFileSync("diff", ["-r", "-u", EXPECTED, join(workdir, "zod")], { stdio: "inherit" });
	console.log("Zod contracts in sync (Orval output matches committed src/lib/api/zod/).");
} finally {
	rmSync(workdir, { recursive: true, force: true });
}
