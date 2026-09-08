// Containment tests for the harness static server path helper.
//
// @vitest-environment node
import { resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveStaticPath } from "./static-path.mjs";

const ROOT = resolve("/srv/storybook-static");

describe("resolveStaticPath", () => {
	it("resolves in-root files and the index fallback", () => {
		expect(resolveStaticPath(ROOT, "/iframe.html")).toBe(resolve(ROOT, "iframe.html"));
		expect(resolveStaticPath(ROOT, "/assets/iframe-abc.js")).toBe(
			resolve(ROOT, "assets/iframe-abc.js"),
		);
		expect(resolveStaticPath(ROOT, "/")).toBe(resolve(ROOT, "index.html"));
	});

	it("rejects plain and decoded traversal escapes", () => {
		expect(resolveStaticPath(ROOT, "/../secret.txt")).toBeNull();
		expect(resolveStaticPath(ROOT, "/assets/../../secret.txt")).toBeNull();
		expect(resolveStaticPath(ROOT, "/%2e%2e/secret.txt")).toBeNull();
		expect(resolveStaticPath(ROOT, "/assets/%2e%2e/%2e%2e/secret.txt")).toBeNull();
		expect(resolveStaticPath(ROOT, "/%252e%252e/secret.txt")).not.toBe(resolve("/srv/secret.txt"));
	});

	it("rejects sibling paths that share the directory prefix", () => {
		// resolve(ROOT, "./storybook-static-evil/x") starts with the ROOT
		// string but lives outside it — a startsWith(root) check passes it.
		expect(resolveStaticPath(ROOT, "/../storybook-static-evil/x.js")).toBeNull();
		expect(resolveStaticPath(ROOT, "/..%2fstorybook-static-evil%2fx.js")).toBeNull();
	});

	it("rejects undecodable and NUL-containing paths", () => {
		expect(resolveStaticPath(ROOT, "/%E0%A4%A")).toBeNull();
		expect(resolveStaticPath(ROOT, "/%00")).toBeNull();
	});

	it("allows dot segments that stay inside the root", () => {
		expect(resolveStaticPath(ROOT, "/assets/../iframe.html")).toBe(resolve(ROOT, "iframe.html"));
		expect(resolveStaticPath(ROOT, "/.../weird-but-inside.js")).toBe(
			resolve(ROOT, `...${sep}weird-but-inside.js`),
		);
	});
});
