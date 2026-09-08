/**
 * Client-safe Sure API compatibility policy (`t_alt_fnd_015`).
 *
 * Pure (no Node imports, no `process.env`): unit tests, route components,
 * and the server-only compatibility check (`sure-api-compat.server.ts`)
 * all import from here. Compatibility decisions are made server-side; this
 * module only defines the supported contract range, the state vocabulary,
 * and the safe, actionable messages rendered for each state.
 *
 * The Rails contract reports its version and capability tokens at the
 * public `GET /api/v1/metadata` endpoint (mirroring
 * `Api::V1::MetadataController::CONTRACT_VERSION` /
 * `::CAPABILITIES`). The BFF supports contract major version 1: an older
 * major (or anything below the minimum) is `too-old`, a newer major is
 * `too-new`, and a supported version missing a required capability is
 * `missing-capability`. Nothing here carries origins, credentials, or
 * upstream detail — messages are safe for browser delivery.
 */
import { formatMessage } from "./i18n/messages";

/** Contract major version this frontend release supports. */
export const SURE_API_SUPPORTED_MAJOR = 1;

/** Minimum contract version this frontend release supports. */
export const SURE_API_SUPPORTED_MIN = "1.0.0";

/**
 * Capability tokens the BFF requires for session establishment. Mirrors
 * `Api::V1::MetadataController::CAPABILITIES` — removing or renaming one
 * Rails-side is a breaking change that surfaces as `missing-capability`.
 */
export const REQUIRED_API_CAPABILITIES = ["auth.login", "auth.refresh", "auth.logout"] as const;

export type RequiredApiCapability = (typeof REQUIRED_API_CAPABILITIES)[number];

/**
 * Compatibility outcome vocabulary. `ready` means the deployment contract
 * is supported; every other state blocks session establishment and is
 * reported by readiness with an actionable message:
 * - `unreachable` — the API could not be reached (network/timeout/5xx).
 * - `unauthenticated` — the API rejected the app's deployment credentials.
 * - `too-old` — the server contract predates the supported range (or does
 *   not report metadata at all).
 * - `too-new` — the server contract is newer than this app supports (or
 *   speaks an unrecognised shape).
 * - `missing-capability` — the version is supported but a required
 *   capability token is absent.
 */
export type ApiCompatibilityState =
	| "ready"
	| "unreachable"
	| "unauthenticated"
	| "too-old"
	| "too-new"
	| "missing-capability";

/** Narrowed metadata report evaluated by `evaluateApiCompatibility`. */
export interface ApiMetadataReport {
	readonly apiVersion: string;
	readonly capabilities: readonly string[];
}

/** Server-side compatibility decision (safe to serialise to the browser). */
export interface ApiCompatibility {
	readonly state: ApiCompatibilityState;
	/** Server-reported version, when one was observed (truncated, display only). */
	readonly serverVersion?: string | undefined;
	/** Required capability tokens absent from the server report. */
	readonly missingCapabilities?: readonly string[] | undefined;
}

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const MAX_VERSION_DISPLAY_CHARS = 32;

/** Parse a strict `major.minor.patch` version; `undefined` when unrecognised. */
export function parseApiVersion(raw: string): readonly [number, number, number] | undefined {
	const match = SEMVER_PATTERN.exec(raw.trim());
	if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
		return undefined;
	}
	const parts = [match[1], match[2], match[3]].map(Number);
	if (!parts.every((part) => Number.isSafeInteger(part) && part >= 0)) {
		return undefined;
	}
	return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/** Compare two parsed versions: negative when `left` is older. */
function compareVersions(
	left: readonly [number, number, number],
	right: readonly [number, number, number],
): number {
	for (const index of [0, 1, 2] as const) {
		const diff = (left[index] ?? 0) - (right[index] ?? 0);
		if (diff !== 0) {
			return diff;
		}
	}
	return 0;
}

const SUPPORTED_MIN_PARTS: readonly [number, number, number] = [1, 0, 0];

/**
 * Decide compatibility for a server metadata report. Pure and total:
 * unrecognised versions fail closed as `too-new` (unknown contract —
 * never assumed compatible), older majors (or anything below the
 * supported minimum) are `too-old`, newer majors are `too-new`, and a
 * supported version missing a required token is `missing-capability`.
 */
export function evaluateApiCompatibility(report: ApiMetadataReport): ApiCompatibility {
	const serverVersion = report.apiVersion.slice(0, MAX_VERSION_DISPLAY_CHARS);
	const parsed = parseApiVersion(report.apiVersion);
	if (parsed === undefined) {
		return { state: "too-new", serverVersion };
	}
	if (parsed[0] !== SURE_API_SUPPORTED_MAJOR || compareVersions(parsed, SUPPORTED_MIN_PARTS) < 0) {
		return {
			state: parsed[0] > SURE_API_SUPPORTED_MAJOR ? "too-new" : "too-old",
			serverVersion,
		};
	}
	const missing = REQUIRED_API_CAPABILITIES.filter(
		(capability) => !report.capabilities.includes(capability),
	);
	if (missing.length > 0) {
		return { state: "missing-capability", serverVersion, missingCapabilities: missing };
	}
	return { state: "ready", serverVersion };
}

export interface ApiCompatibilityMessage {
	readonly title: string;
	readonly detail: string;
}

/**
 * Actionable, origin-free message for a compatibility decision. Safe for
 * browser delivery: carries only the state, the (truncated)
 * server-reported version, and missing capability tokens — never origins,
 * credentials, headers, or upstream bodies.
 */
export function describeApiCompatibility(compatibility: ApiCompatibility): ApiCompatibilityMessage {
	switch (compatibility.state) {
		case "ready":
			return {
				title: formatMessage("compat.readyTitle"),
				detail: formatMessage("compat.readyDetail"),
			};
		case "unreachable":
			return {
				title: formatMessage("compat.unreachableTitle"),
				detail: formatMessage("compat.unreachableDetail"),
			};
		case "unauthenticated":
			return {
				title: formatMessage("compat.unauthenticatedTitle"),
				detail: formatMessage("compat.unauthenticatedDetail"),
			};
		case "too-old": {
			return {
				title: formatMessage("compat.tooOldTitle"),
				detail:
					compatibility.serverVersion === undefined
						? formatMessage("compat.tooOldDetail")
						: formatMessage("compat.tooOldVersionDetail", {
								version: compatibility.serverVersion,
							}),
			};
		}
		case "too-new": {
			return {
				title: formatMessage("compat.tooNewTitle"),
				detail:
					compatibility.serverVersion === undefined
						? formatMessage("compat.tooNewDetail")
						: formatMessage("compat.tooNewVersionDetail", {
								version: compatibility.serverVersion,
							}),
			};
		}
		case "missing-capability": {
			const missing = (compatibility.missingCapabilities ?? []).join(", ");
			return {
				title: formatMessage("compat.missingTitle"),
				detail: formatMessage("compat.missingDetail", { capabilities: missing }),
			};
		}
		default: {
			const exhaustive: never = compatibility.state;
			throw new Error(`Unhandled compatibility state: ${String(exhaustive)}`);
		}
	}
}
