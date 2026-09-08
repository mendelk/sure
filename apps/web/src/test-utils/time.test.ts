// Deterministic suite proving the shared clock helpers (apps/web).
import { describe, expect, it } from "vitest";
import { assertUtcTimezone, freezeTime, TIME_FIXTURE_ISO, TIME_FIXTURE_MS } from "./time";

describe("deterministic time", () => {
	it("pins the worker timezone to UTC", () => {
		assertUtcTimezone();
	});

	it("freezes the clock at the fixture instant", () => {
		freezeTime();
		expect(Date.now()).toBe(TIME_FIXTURE_MS);
		expect(new Date().toISOString()).toBe(TIME_FIXTURE_ISO);
	});

	it("honors an explicit instant", () => {
		freezeTime("2026-01-02T03:04:05.000Z");
		expect(new Date().toISOString()).toBe("2026-01-02T03:04:05.000Z");
	});
});
