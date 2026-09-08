// Deterministic time and timezone helpers for vitest suites (apps/web).
//
// Suites that assert on rendered dates, `dateTime` attributes, or expiry
// math must call `freezeTime()` so results do not depend on the wall clock.
// Fake timers auto-restore after each test (registered below), so suites
// never leak a frozen clock into neighboring tests.
//
// Timezone determinism comes from `vite.config.ts` (`test.env.TZ = "UTC"`);
// `assertUtcTimezone()` lets suites fail fast with a clear message when
// that pin is lost instead of producing confusing off-by-hours diffs.
import { afterEach, expect, vi } from "vitest";

/** Fixed instant every deterministic suite anchors to (UTC, mid-month). */
export const TIME_FIXTURE_ISO = "2026-03-15T12:00:00.000Z";

/** Millis for `TIME_FIXTURE_ISO`, for arithmetic without re-parsing. */
export const TIME_FIXTURE_MS = Date.parse(TIME_FIXTURE_ISO);

/** Freeze `Date`/`performance` timers at `iso` (defaults to the fixture). */
export function freezeTime(iso: string = TIME_FIXTURE_ISO): void {
	vi.useFakeTimers();
	vi.setSystemTime(new Date(iso));
}

/** Restore real timers. Runs automatically after each test; call manually
 * only when a suite needs real time back mid-test. */
export function restoreTime(): void {
	vi.useRealTimers();
}

/** Fail fast unless the worker timezone is UTC (pinned by vite config). */
export function assertUtcTimezone(): void {
	expect(new Date(TIME_FIXTURE_ISO).getTimezoneOffset()).toBe(0);
}

afterEach(() => {
	restoreTime();
});
