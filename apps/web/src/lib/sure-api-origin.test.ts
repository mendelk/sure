import { describe, expect, it } from "vitest";
import { assertSureApiOrigin } from "./sure-api-origin";

describe("assertSureApiOrigin", () => {
	it("accepts an http origin", () => {
		expect(assertSureApiOrigin("http://localhost:3000")).toEqual({
			ok: true,
			origin: "http://localhost:3000",
		});
	});

	it("accepts an https origin and normalizes it", () => {
		expect(assertSureApiOrigin("https://api.example.com/")).toEqual({
			ok: true,
			origin: "https://api.example.com",
		});
	});

	it("rejects missing and empty values", () => {
		for (const value of [undefined, "", "   "]) {
			const result = assertSureApiOrigin(value);
			expect(result.ok).toBe(false);
		}
	});

	it("rejects relative URLs and non-http(s) protocols", () => {
		for (const value of ["/api", "not-a-url", "ftp://example.com"]) {
			const result = assertSureApiOrigin(value);
			expect(result.ok).toBe(false);
		}
	});
});
