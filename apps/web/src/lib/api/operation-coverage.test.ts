import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { getOperationContract } from "./operation-contracts";

/**
 * Operation coverage: every `METHOD /path` in the canonical
 * `docs/api/openapi.yaml` must resolve to a registry entry whose parsers
 * are the Orval-generated exports — no undocumented exceptions, no silent
 * `any`/`unknown` degradation.
 *
 * Path helpers resolve from this file (`apps/web/src/lib/api/`).
 */
const apiDir = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const repoRoot = resolve(apiDir, "..", "..", "..", "..", "..");
const webDir = join(repoRoot, "apps", "web");
const openapiPath = join(repoRoot, "docs", "api", "openapi.yaml");
const zodDir = join(apiDir, "zod");
const orvalBin = join(webDir, "node_modules", ".bin", "orval");
const orvalConfig = join(webDir, "orval.config.ts");

interface OpenapiOperation {
	readonly method: string;
	readonly path: string;
	readonly node: Record<string, unknown>;
}

interface OpenapiSpec {
	readonly operations: OpenapiOperation[];
	readonly raw: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
	if (!isRecord(value)) {
		throw new Error(`Expected ${what} to be an object.`);
	}
	return value;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value) || !value.every(isRecord)) {
		throw new Error("Expected an array of objects.");
	}
	return value;
}

function asStringArray(value: unknown): string[] {
	if (
		!Array.isArray(value) ||
		!value.every((entry): entry is string => typeof entry === "string")
	) {
		throw new Error("Expected an array of strings.");
	}
	return value;
}

function loadSpec(): OpenapiSpec {
	const raw = asRecord(parseYaml(readFileSync(openapiPath, "utf8")), "OpenAPI document");
	const paths = asRecord(raw["paths"], "OpenAPI paths");
	const operations: OpenapiOperation[] = [];
	for (const [path, item] of Object.entries(paths)) {
		const pathItem = asRecord(item, `path item ${path}`);
		for (const [method, node] of Object.entries(pathItem)) {
			if (method === "parameters") {
				continue;
			}
			operations.push({ method: method.toUpperCase(), path, node: asRecord(node, "operation") });
		}
	}
	// Document order is deterministic; no sorting needed for assertions.
	return { operations, raw };
}

function pascalSegment(segment: string): string {
	return segment
		.split(/[^A-Za-z0-9]+/)
		.filter((part) => part !== "")
		.map((part) => part[0]?.toUpperCase() + part.slice(1))
		.join("");
}

/** Mirror of Orval's operation naming: method + path, `{param}` → Pascal(param). */
function orvalBase(method: string, path: string): string {
	const parts = [method[0]?.toUpperCase() + method.slice(1).toLowerCase(), "Api", "V1"];
	for (const segment of path.split("/")) {
		if (segment === "" || segment === "api" || segment === "v1") {
			continue;
		}
		const param = /^\{([^}]+)\}$/.exec(segment);
		parts.push(pascalSegment(param?.[1] ?? segment));
	}
	return parts.join("");
}

function tagDir(tag: string): string {
	return tag
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function parametersOf(op: OpenapiOperation, spec: OpenapiSpec): Record<string, unknown>[] {
	const paths = asRecord(spec.raw["paths"], "OpenAPI paths");
	const item = asRecord(paths[op.path] ?? {}, `path item ${op.path}`);
	const inherited = Array.isArray(item["parameters"]) ? asRecordArray(item["parameters"]) : [];
	const own = Array.isArray(op.node["parameters"]) ? asRecordArray(op.node["parameters"]) : [];
	return [...inherited, ...own];
}

function responsesOf(op: OpenapiOperation): Record<string, Record<string, unknown>> {
	const responses = op.node["responses"] ?? {};
	const out: Record<string, Record<string, unknown>> = {};
	for (const [status, response] of Object.entries(asRecord(responses, "responses"))) {
		out[status] = asRecord(response, "response");
	}
	return out;
}

function responsesOfStatus(op: OpenapiOperation, status: string): Record<string, unknown> {
	return responsesOf(op)[status] ?? {};
}

function hasContent(response: Record<string, unknown>): boolean {
	return isRecord(response["content"]) && Object.keys(response["content"]).length > 0;
}

/** All `.zod.ts` files under the generated tree. */
function zodFiles(): string[] {
	const files: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir)) {
			const full = join(dir, entry);
			if (statSync(full).isDirectory()) {
				walk(full);
			} else if (entry.endsWith(".zod.ts")) {
				files.push(full);
			}
		}
	};
	walk(zodDir);
	return files;
}

const spec = loadSpec();

describe("operation coverage", () => {
	it("covers every OpenAPI method/path with no undocumented exceptions", () => {
		expect(spec.operations.length).toBeGreaterThan(0);
		const missing: string[] = [];
		for (const op of spec.operations) {
			const contract = getOperationContract(op.method, op.path);
			if (contract === undefined) {
				missing.push(`${op.method} ${op.path}`);
				continue;
			}
			expect(contract.operation).toBe(`${op.method} ${op.path}`);
			expect(contract.method).toBe(op.method);
			expect(contract.path).toBe(op.path);
		}
		expect(missing).toEqual([]);
	});

	it("exposes request and response parsers matching the documented layers", () => {
		for (const op of spec.operations) {
			const contract = getOperationContract(op.method, op.path);
			expect(contract, `${op.method} ${op.path}`).toBeDefined();
			if (contract === undefined) {
				continue;
			}
			const params = parametersOf(op, spec);
			const hasPath = params.some((param) => param["in"] === "path");
			const hasQuery = params.some((param) => param["in"] === "query");
			expect(contract.pathParams !== undefined, `${contract.operation} path params`).toBe(hasPath);
			expect(contract.queryParams !== undefined, `${contract.operation} query params`).toBe(
				hasQuery,
			);
			expect(contract.body !== undefined, `${contract.operation} request body`).toBe(
				"requestBody" in op.node,
			);
			const statuses = Object.keys(responsesOf(op));
			expect(new Set(Object.keys(contract.responses))).toEqual(new Set(statuses));
		}
	});

	it("returns undefined for undocumented operations", () => {
		expect(getOperationContract("GET", "/api/v1/nope")).toBeUndefined();
		expect(getOperationContract("get", "/api/v1/accounts")).toBeDefined();
	});

	it("derives every registry entry from an Orval-generated export", () => {
		for (const op of spec.operations) {
			const tags = Array.isArray(op.node["tags"]) ? asStringArray(op.node["tags"]) : ["default"];
			const file = join(
				zodDir,
				"endpoints",
				tagDir(tags[0] ?? "default"),
				`${tagDir(tags[0] ?? "default")}.zod.ts`,
			);
			expect(existsSync(file), `tag file for ${op.method} ${op.path}`).toBe(true);
			const content = readFileSync(file, "utf8");
			expect(content.includes(`export const ${orvalBase(op.method, op.path)}`)).toBe(true);
		}
	});

	it("emits no zod.any() anywhere in the generated tree", () => {
		const offenders: string[] = [];
		for (const file of zodFiles()) {
			if (readFileSync(file, "utf8").includes("zod.any()")) {
				offenders.push(file);
			}
		}
		expect(offenders).toEqual([]);
	});

	it("uses zod.unknown() only for the modeled binary redirect", () => {
		const offenders: string[] = [];
		for (const file of zodFiles()) {
			for (const line of readFileSync(file, "utf8").split("\n")) {
				if (
					line.includes("Response = zod.unknown()") &&
					!line.includes("GetApiV1FamilyExportsIdDownload302Response")
				) {
					offenders.push(`${file.split("/zod/")[1]}:${line.trim()}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	it("never degrades recursion to zod.array(zod.unknown())", () => {
		const offenders = zodFiles().filter((file) =>
			readFileSync(file, "utf8").includes("zod.array(zod.unknown())"),
		);
		expect(offenders).toEqual([]);
	});

	it("uses empty parsers only for responses documented without content", () => {
		const emptyConst = /^export const (\w+?)(\d+)Response = zod\.(unknown|void)\(\);?$/;
		const found = new Map<string, string>();
		for (const file of zodFiles()) {
			for (const line of readFileSync(file, "utf8").split("\n")) {
				const match = emptyConst.exec(line.trim());
				if (match?.[1] && match[2]) {
					found.set(`${match[1]}|${match[2]}`, file);
				}
			}
		}
		const expected = new Map<string, string>();
		for (const op of spec.operations) {
			for (const [status, response] of Object.entries(responsesOf(op))) {
				if (!hasContent(response)) {
					expected.set(`${orvalBase(op.method, op.path)}|${status}`, `${op.method} ${op.path}`);
				}
			}
		}
		expect(new Set(found.keys())).toEqual(new Set(expected.keys()));
	});

	it("uses record(string, unknown) only where the spec declares free-form objects", () => {
		const opBaseToOp = new Map(spec.operations.map((op) => [orvalBase(op.method, op.path), op]));
		const components = asRecord(
			asRecord(spec.raw["components"], "components")["schemas"],
			"schemas",
		);
		const subtreeHasFreeForm = (node: unknown): boolean => {
			if (Array.isArray(node)) {
				return node.some(subtreeHasFreeForm);
			}
			if (!isRecord(node)) {
				return false;
			}
			if (node["additionalProperties"] === true) {
				return true;
			}
			return Object.values(node).some(subtreeHasFreeForm);
		};
		const specSubtreeForConst = (name: string): unknown => {
			const bodyMatch = /^(.*)Body$/.exec(name);
			if (bodyMatch?.[1]) {
				const op = opBaseToOp.get(bodyMatch[1]);
				return op?.node["requestBody"];
			}
			const responseMatch = /^(.*?)(\d+)Response$/.exec(name);
			if (responseMatch?.[1] && responseMatch[2]) {
				const op = opBaseToOp.get(responseMatch[1]);
				return op ? responsesOfStatus(op, responseMatch[2]) : undefined;
			}
			return components[name];
		};
		const violations: string[] = [];
		for (const file of zodFiles()) {
			let current: string | undefined;
			for (const line of readFileSync(file, "utf8").split("\n")) {
				const declared = /^export const (\w+)/.exec(line.trim())?.[1];
				if (declared) {
					current = declared;
				}
				if (line.includes("zod.record(zod.string(), zod.unknown())")) {
					const subtree = current === undefined ? undefined : specSubtreeForConst(current);
					if (subtree === undefined || !subtreeHasFreeForm(subtree)) {
						violations.push(`${file.split("/zod/")[1]}:${current ?? "?"}`);
					}
				}
			}
		}
		expect(violations).toEqual([]);
	});
});

describe("generation determinism and drift", () => {
	it("generates byte-identical output across two runs", () => {
		const first = mkdtempSync(join(tmpdir(), "sure-zod-det-a-"));
		const second = mkdtempSync(join(tmpdir(), "sure-zod-det-b-"));
		try {
			for (const dir of [first, second]) {
				execFileSync(orvalBin, ["--config", orvalConfig, "--fail-on-warnings"], {
					cwd: webDir,
					env: { ...process.env, SURE_ZOD_OUT_DIR: join(dir, "zod") },
					stdio: "pipe",
				});
			}
			expect(() => {
				execFileSync("diff", ["-r", first, second], { stdio: "pipe" });
			}).not.toThrow();
		} finally {
			rmSync(first, { recursive: true, force: true });
			rmSync(second, { recursive: true, force: true });
		}
	}, 120_000);

	it("matches the committed tree exactly (drift fails loudly)", () => {
		const dir = mkdtempSync(join(tmpdir(), "sure-zod-drift-"));
		try {
			execFileSync(orvalBin, ["--config", orvalConfig, "--fail-on-warnings"], {
				cwd: webDir,
				env: { ...process.env, SURE_ZOD_OUT_DIR: join(dir, "zod") },
				stdio: "pipe",
			});
			expect(() => {
				execFileSync("diff", ["-r", "-u", zodDir, join(dir, "zod")], { stdio: "pipe" });
			}).not.toThrow();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}, 120_000);

	it("detects intentional tampering of the generated tree", () => {
		const dir = mkdtempSync(join(tmpdir(), "sure-zod-tamper-"));
		try {
			execFileSync("cp", ["-r", zodDir, join(dir, "zod")], { stdio: "pipe" });
			const victim = join(dir, "zod", "models", "errorResponse.zod.ts");
			const original = readFileSync(victim, "utf8");
			expect(original.includes("ErrorResponse")).toBe(true);
			writeFileSync(victim, `${original}\n// tampered\n`);
			let diffed = false;
			try {
				execFileSync("diff", ["-r", zodDir, join(dir, "zod")], { stdio: "pipe" });
			} catch {
				diffed = true;
			}
			expect(diffed).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}, 60_000);
});
