import { defineConfig } from "orval";

/**
 * Orval configuration for Sure OpenAPI Zod runtime parsers.
 *
 * Tooling choice: Orval 8.30.0 (pinned in package.json) generates the
 * typed Zod contracts from the canonical `docs/api/openapi.yaml`. Zod
 * output is pinned to v4 (`override.zod.version: 4`, never `"auto"`) so
 * generation never depends on the installed `zod` version; the runtime
 * dependency is pinned to the same major (`zod` 4.5.4).
 * Native `exactOptional` output keeps recursive schemas compatible with
 * strict TypeScript without a project-owned patch or compiler fork, and
 * Orval delegates generated-file formatting to oxfmt.
 *
 * Output shape (all files committed):
 * - `src/lib/api/zod/endpoints/<tag>/<tag>.zod.ts` — one module per API
 *   tag with operation-keyed parsers (`<Method><Path>QueryParams`,
 *   `<Method><Path>Body`, `<Method><Path><Status>Response` for every
 *   documented status via `generateEachHttpStatus`).
 * - `src/lib/api/zod/models/*.zod.ts` — one reusable schema per
 *   `#/components/schemas/*` `$ref` (`generateReusableSchemas`);
 *   recursive schemas (Rule → RuleCondition) close their cycles with
 *   `zod.lazy`, never `zod.unknown()`.
 *
 * Determinism: pinned Orval + pinned Zod target + `SURE_ZOD_OUT_DIR`
 * overriding only the destination directory (relative layout preserved,
 * so emitted import paths are identical). Regenerating must be
 * byte-identical; `scripts/check-openapi-zod.mjs` verifies this in CI.
 */
const outDir = process.env["SURE_ZOD_OUT_DIR"]?.trim() || "./src/lib/api/zod";

export default defineConfig({
	sure: {
		input: {
			target: "../../docs/api/openapi.yaml",
		},
		output: {
			mode: "tags-split",
			client: "zod",
			formatter: "oxfmt",
			target: `${outDir}/endpoints`,
			schemas: {
				path: `${outDir}/models`,
				type: "zod",
			},
			fileExtension: ".zod.ts",
			schemaFileExtension: ".zod.ts",
			override: {
				zod: {
					version: 4,
					exactOptional: true,
					generateEachHttpStatus: true,
					generateReusableSchemas: true,
					strict: {
						param: true,
						query: true,
						header: true,
						body: true,
						response: true,
					},
					generate: {
						param: true,
						query: true,
						header: true,
						body: true,
						response: true,
					},
				},
			},
		},
	},
});
