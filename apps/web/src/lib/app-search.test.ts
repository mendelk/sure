/**
 * Typed search-state tests (t_alt_fnd_010): deep links, refreshes, and
 * browser back/forward always resolve to valid defaults — never to
 * undefined fields or invalid unions.
 */
import { describe, expect, it } from "vitest";
import { parseDashboardSearch, parseSettingsSearch, serializeDashboardSearch } from "./app-search";

describe("parseDashboardSearch", () => {
	it("defaults empty input", () => {
		expect(parseDashboardSearch({})).toEqual({ q: "", filter: "all" });
	});

	it("keeps valid typed values (deep-link preservation)", () => {
		expect(parseDashboardSearch({ q: "rent", filter: "active" })).toEqual({
			q: "rent",
			filter: "active",
		});
	});

	it("fails closed on invalid filter values", () => {
		expect(parseDashboardSearch({ q: "x", filter: "drop-table" })).toEqual({
			q: "x",
			filter: "all",
		});
	});

	it("caps free-text length and ignores non-strings", () => {
		expect(parseDashboardSearch({ q: 42, filter: "archived" }).q).toBe("");
		expect(parseDashboardSearch({ q: "a".repeat(500), filter: "all" }).q).toHaveLength(200);
	});
});

describe("parseSettingsSearch", () => {
	it("defaults to profile", () => {
		expect(parseSettingsSearch({})).toEqual({ section: "profile" });
	});

	it("keeps valid sections and rejects the rest", () => {
		expect(parseSettingsSearch({ section: "account" })).toEqual({ section: "account" });
		expect(parseSettingsSearch({ section: "billing" })).toEqual({ section: "profile" });
	});
});

describe("serializeDashboardSearch", () => {
	it("round-trips typed state through deep links", () => {
		expect(serializeDashboardSearch({ q: "", filter: "all" })).toBe("");
		expect(serializeDashboardSearch({ q: "rent", filter: "all" })).toBe("?q=rent");
		expect(serializeDashboardSearch({ q: "", filter: "active" })).toBe("?filter=active");
		const encoded = serializeDashboardSearch({ q: "rent", filter: "active" });
		const params = new URLSearchParams(encoded);
		expect(parseDashboardSearch({ q: params.get("q"), filter: params.get("filter") })).toEqual({
			q: "rent",
			filter: "active",
		});
	});
});
