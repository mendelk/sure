// Home-route origin-hygiene regression test (`t_alt_fnd_015` +
// `t_alt_fnd_011`). The configured Sure API origin is server-only: the
// server-function result exposes only renderedAt + the compatibility
// decision, and the page renders the parent compatibility status UI.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(resolve(HERE, "../routes/index.tsx"), "utf8");
const messageSource = readFileSync(resolve(HERE, "i18n/messages.ts"), "utf8");

describe("home route origin hygiene", () => {
	it("keeps the parent compatibility UI without serializing or describing the API origin", () => {
		expect(routeSource).toContain("compatibility: ApiCompatibility");
		expect(routeSource).toContain('data-testid="api-compatibility"');
		expect(routeSource).toContain("checkApiCompatibility()");
		expect(routeSource).not.toContain("apiOrigin");
		expect(messageSource).not.toContain("against Sure API origin");
	});
});
