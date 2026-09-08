// Contract-derived mock fetch handlers for focused vitest suites (apps/web).
//
// Focused suites stub `fetch` here instead of reaching the network, but the
// stubs are never the only integration evidence (see the live BFF suite in
// `../lib/api/bff-live.test.ts`, which runs browser → BFF → Rails → DB
// against seeded services). Every stub is derived from the generated
// operation contracts:
//
// - the handler key (`"METHOD /path-template"`) must exist in the generated
//   registry (`getOperationContract`), so renamed operations fail fast;
// - outgoing request bodies validate through `parseOperationRequest`;
// - stubbed response payloads validate through `parseOperationResponse`
//   before they reach the code under test, so a handler can never serve a
//   shape Rails could not have sent.
//
// Violation messages are redacted (schema paths only, never payload
// values). Unhandled requests throw instead of hitting the network, keeping
// suites hermetic.
import { describeContractViolation } from "~/lib/api/contract";
import {
	getOperationContract,
	parseOperationRequest,
	parseOperationResponse,
	type OperationContract,
} from "~/lib/api/operation-contracts";

/** One stubbed operation: `operation` is `"METHOD /path-template"`. */
export interface MockHandler {
	readonly operation: string;
	/** Response status the stub serves (must be documented for the op). */
	readonly status?: number | undefined;
	/** Response payload, validated against the contract before serving. */
	readonly body: unknown;
	/** Optional assertion on the parsed request body. */
	readonly assertRequestBody?: ((body: unknown) => void) | undefined;
}

/** A fetch call the mock observed. */
export interface ObservedRequest {
	readonly method: string;
	readonly url: string;
	readonly body: unknown;
}

export interface MockFetchController {
	/** Requests observed since install, in order. */
	readonly requests: readonly ObservedRequest[];
	/** Restore the previous `fetch` implementation. */
	restore(): void;
}

function failContract(
	contract: OperationContract,
	status: number,
	result: {
		readonly issues: readonly {
			readonly path: string;
			readonly expected: string;
			readonly received: string;
		}[];
		readonly part: string;
	},
): never {
	throw new Error(
		`[mock-handlers] ${describeContractViolation(contract.operation, status, result.issues, result.issues.length)}`,
	);
}

function matchTemplate(template: string, pathname: string): boolean {
	const templateSegments = template.split("/");
	const pathSegments = pathname.split("/");
	if (templateSegments.length !== pathSegments.length) {
		return false;
	}
	return templateSegments.every((segment, index) => {
		const actual = pathSegments[index];
		if (actual === undefined) {
			return false;
		}
		return segment.startsWith("{") && segment.endsWith("}") ? actual !== "" : segment === actual;
	});
}

function findHandler(
	handlers: readonly (MockHandler & { contract: OperationContract })[],
	method: string,
	pathname: string,
): (MockHandler & { contract: OperationContract }) | undefined {
	return handlers.find(
		(candidate) =>
			candidate.contract.method === method &&
			(candidate.contract.path === pathname || matchTemplate(candidate.contract.path, pathname)),
	);
}

async function readJsonBody(request: Request): Promise<unknown> {
	const text = await request.text();
	if (text === "") {
		return undefined;
	}
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

/**
 * Replace `globalThis.fetch` with contract-validated stubs. Returns a
 * controller to inspect observed requests and restore `fetch`.
 */
export function installMockFetch(handlers: readonly MockHandler[]): MockFetchController {
	const previousFetch = globalThis.fetch;
	const prepared = handlers.map((handler) => {
		const [method, ...rest] = handler.operation.split(" ");
		const template = rest.join(" ");
		const contract =
			method === undefined || template === "" ? undefined : getOperationContract(method, template);
		if (method === undefined || contract === undefined) {
			throw new Error(
				`[mock-handlers] unknown operation "${handler.operation}" — regenerate contracts and fix the handler key.`,
			);
		}
		return { ...handler, contract };
	});

	const observed: ObservedRequest[] = [];

	globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const request = new Request(input, init);
		const url = new URL(request.url, "http://localhost");
		const method = request.method.toUpperCase();
		const handler = findHandler(prepared, method, url.pathname);
		if (handler === undefined) {
			throw new Error(
				`[mock-handlers] unhandled ${method} ${url.pathname} — add a handler or fix the URL. No network in unit tests.`,
			);
		}

		const requestBody = await readJsonBody(request);
		const parsedRequest = parseOperationRequest(handler.contract, { body: requestBody });
		if (!parsedRequest.ok) {
			failContract(handler.contract, handler.status ?? 200, parsedRequest);
		}
		handler.assertRequestBody?.(requestBody);
		observed.push({ method, url: request.url, body: requestBody });

		const status = handler.status ?? 200;
		const parsedResponse = parseOperationResponse(handler.contract, status, handler.body);
		if (!parsedResponse.ok) {
			failContract(handler.contract, status, parsedResponse);
		}
		return new Response(JSON.stringify(handler.body), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	};

	return {
		requests: observed,
		restore(): void {
			globalThis.fetch = previousFetch;
		},
	};
}
