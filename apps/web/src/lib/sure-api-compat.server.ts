/**
 * Server-only Sure API compatibility check (`t_alt_fnd_015`).
 *
 * The BFF fetches the public `GET /api/v1/metadata` endpoint and reduces
 * the outcome to an `ApiCompatibility` decision via the client-safe policy
 * in `./sure-api-compat`. Called during readiness and before session
 * establishment so an incompatible deployment is rejected before users
 * encounter arbitrary request failures.
 *
 * Transport note: this deliberately does NOT go through `proxyToSureApi`.
 * The transport folds upstream statuses into redacted errors, but the
 * compatibility decision needs the raw status (a 404 means the server
 * predates version reporting, a 401/403 means rejected deployment
 * credentials). The request itself needs none of the transport's
 * request-side machinery — the path is a hardcoded constant (no SSRF
 * surface). The deployment API key (`SURE_API_KEY`) is attached as
 * `X-Api-Key` when configured so credential-gated deployments can
 * authenticate the probe, while the response still gets a timeout, a
 * body cap, and validation through the generated operation contract. The upstream origin always resolves from
 * the server-only `getSureApiOrigin()` (or an explicit test override).
 *
 * Origin hygiene: decisions and messages never include the upstream
 * origin, credentials, headers, or upstream bodies — only the state, the
 * truncated server-reported version, and missing capability tokens.
 */
import { getOperationContract, parseOperationResponse } from "./api/bff-contracts.server";
import type { OperationParseResult } from "./api/bff-contracts.server";
import { BFF_DEFAULT_TIMEOUT_MS, BFF_REQUEST_ID_HEADER, resolveBffRequestId } from "./bff-policy";
import { getSureApiKey } from "./sure-api-bff.server";
import { getSureApiOrigin } from "./sure-api.server";
import {
	evaluateApiCompatibility,
	type ApiCompatibility,
	type ApiMetadataReport,
} from "./sure-api-compat";

export type { ApiCompatibility };

export interface ApiCompatibilityCheckDeps {
	readonly fetchImpl?: typeof fetch | undefined;
	/** Fixed upstream origin override (tests); defaults to `getSureApiOrigin()`. */
	readonly upstreamOrigin?: string | undefined;
	/**
	 * Deployment BFF-to-Rails API key override (tests); defaults to the
	 * server-only `SURE_API_KEY`. Sent as `X-Api-Key` so gateways that
	 * require deployment credentials can authenticate the probe — a
	 * rejected key then reports `unauthenticated` instead of a misleading
	 * `ready` or `unreachable`.
	 */
	readonly apiKey?: string | undefined;
	readonly timeoutMs?: number | undefined;
}

/** Metadata bodies stay tiny; anything larger is not metadata. */
const METADATA_BODY_CAP = 64 * 1024;

function isStringRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Narrow a decoded metadata body without assertions. */
function narrowMetadataReport(body: unknown): ApiMetadataReport | undefined {
	if (!isStringRecord(body)) {
		return undefined;
	}
	const apiVersion: unknown = body["api_version"];
	const capabilities: unknown = body["capabilities"];
	if (typeof apiVersion !== "string" || !Array.isArray(capabilities)) {
		return undefined;
	}
	const tokens: string[] = [];
	for (const capability of capabilities) {
		if (typeof capability !== "string") {
			return undefined;
		}
		tokens.push(capability);
	}
	return { apiVersion, capabilities: tokens };
}

/** Bounded read: frees the connection and fails closed past the cap. */
async function readMetadataBody(response: Response): Promise<string | undefined> {
	const declared = response.headers.get("Content-Length");
	if (declared !== null && Number(declared) > METADATA_BODY_CAP) {
		void response.body?.cancel().catch(() => undefined);
		return undefined;
	}
	if (response.body === null) {
		return "";
	}
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			total += value.byteLength;
			if (total > METADATA_BODY_CAP) {
				chunks.length = 0;
				await reader.cancel().catch(() => undefined);
				return undefined;
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const merged = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(merged);
}

function isJsonContentType(contentType: string | null): boolean {
	if (contentType === null) {
		return false;
	}
	return contentType.split(";")[0]?.trim().toLowerCase() === "application/json";
}

/**
 * Check the deployment contract. Never throws for deployment states:
 * only unexpected programmer errors (e.g. a missing server origin
 * misconfiguration, which throws like every other server accessor)
 * propagate.
 *
 * Mapping (server-side decision, origin-free):
 * - network failure/timeout/abort/oversize → `unreachable`.
 * - 401/403 → `unauthenticated` (deployment credentials rejected).
 * - 404 → `too-old` (the server predates version reporting).
 * - other non-2xx → `unreachable`.
 * - 2xx that is not valid metadata JSON → `too-new` (unknown shape —
 *   never assumed compatible).
 * - valid metadata → `evaluateApiCompatibility` (`ready` / `too-old` /
 *   `too-new` / `missing-capability`).
 */
export async function checkApiCompatibility(
	deps?: ApiCompatibilityCheckDeps,
): Promise<ApiCompatibility> {
	const upstreamOrigin = deps?.upstreamOrigin ?? getSureApiOrigin();
	const timeoutMs = deps?.timeoutMs ?? BFF_DEFAULT_TIMEOUT_MS;
	const requestId = resolveBffRequestId(undefined);
	const apiKey = deps?.apiKey ?? getSureApiKey();
	const headers: Record<string, string> = { [BFF_REQUEST_ID_HEADER]: requestId };
	if (apiKey !== undefined) {
		headers["X-Api-Key"] = apiKey;
	}

	let upstream: Response;
	try {
		upstream = await (deps?.fetchImpl ?? fetch)(`${upstreamOrigin}/api/v1/metadata`, {
			method: "GET",
			headers,
			signal: AbortSignal.timeout(timeoutMs),
			redirect: "manual",
			credentials: "omit",
		});
	} catch {
		return { state: "unreachable" };
	}

	if (upstream.status === 401 || upstream.status === 403) {
		void upstream.body?.cancel().catch(() => undefined);
		return { state: "unauthenticated" };
	}
	if (upstream.status === 404) {
		void upstream.body?.cancel().catch(() => undefined);
		return { state: "too-old" };
	}
	if (!upstream.ok) {
		void upstream.body?.cancel().catch(() => undefined);
		return { state: "unreachable" };
	}

	const text = await readMetadataBody(upstream);
	if (text === undefined || !isJsonContentType(upstream.headers.get("Content-Type"))) {
		return { state: "too-new" };
	}
	let decoded: unknown;
	try {
		decoded = JSON.parse(text);
	} catch {
		return { state: "too-new" };
	}
	const contract = getOperationContract("GET", "/api/v1/metadata");
	const parsed: OperationParseResult =
		contract === undefined
			? {
					ok: false,
					part: "status",
					issues: [{ path: "$", expected: "metadata contract", received: "missing" }],
				}
			: parseOperationResponse(contract, upstream.status, decoded);
	if (!parsed.ok) {
		return { state: "too-new" };
	}
	const report = narrowMetadataReport(parsed.data);
	if (report === undefined) {
		return { state: "too-new" };
	}
	return evaluateApiCompatibility(report);
}
