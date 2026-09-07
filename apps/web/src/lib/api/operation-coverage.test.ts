import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
	OPERATION_CONTRACTS,
	OPERATION_KEYS,
	getOperationContract,
} from "./generated/operation-contracts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..", "..", "..");
const openapiPath = path.join(repoRoot, "docs/api/openapi.yaml");
const manifestPath = path.join(here, "generated", "manifest.json");

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

interface YamlOperation {
	method: string;
	path: string;
	params: { path: string[]; query: string[]; header: string[] };
	requestBody: { json: boolean; multipart: boolean; required: boolean };
	responses: { status: string; hasJsonContent: boolean }[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}
	const record: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(value)) {
		record[key] = entry;
	}
	return record;
}

function asStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const strings: string[] = [];
	for (const entry of value) {
		if (typeof entry !== "string") {
			return undefined;
		}
		strings.push(entry);
	}
	return strings;
}

function readParams(value: unknown): { name: string; in: string }[] {
	if (value === undefined) {
		return [];
	}
	if (!Array.isArray(value)) {
		throw new Error("OpenAPI parameters must be an array");
	}
	return value.map((entry) => {
		const record = asRecord(entry);
		const name = record?.["name"];
		const location = record?.["in"];
		if (typeof name !== "string" || typeof location !== "string") {
			throw new Error("OpenAPI parameters must have string `name` and `in`");
		}
		return { name, in: location };
	});
}

function loadYamlOperations(): YamlOperation[] {
	const text = readFileSync(openapiPath, "utf8");
	const parsed: unknown = parseYaml(text);
	const document = asRecord(parsed);
	const paths = asRecord(document?.["paths"]);
	if (paths === undefined) {
		throw new Error("OpenAPI document must have a `paths` map");
	}
	const operations: YamlOperation[] = [];
	for (const [operationPath, rawItem] of Object.entries(paths)) {
		const item = asRecord(rawItem) ?? {};
		const pathLevelParams = readParams(item["parameters"]);
		for (const method of METHODS) {
			const operation = asRecord(item[method]);
			if (operation === undefined) {
				continue;
			}
			const seen = new Map<string, { name: string; in: string }>();
			for (const param of [...pathLevelParams, ...readParams(operation["parameters"])]) {
				seen.set(`${param.in}:${param.name}`, param);
			}
			const params: { path: string[]; query: string[]; header: string[] } = {
				path: [],
				query: [],
				header: [],
			};
			for (const param of seen.values()) {
				if (param.in === "path" || param.in === "query" || param.in === "header") {
					params[param.in].push(param.name);
				}
			}
			const body = asRecord(operation["requestBody"]);
			const bodyContent = asRecord(body?.["content"]) ?? {};
			const responses = asRecord(operation["responses"]) ?? {};
			operations.push({
				method,
				path: operationPath,
				params,
				requestBody: {
					json: "application/json" in bodyContent,
					multipart: "multipart/form-data" in bodyContent,
					required: body?.["required"] === true,
				},
				responses: Object.keys(responses).map((status) => {
					const response = asRecord(responses[status]);
					const responseContent = asRecord(response?.["content"]) ?? {};
					return { status, hasJsonContent: "application/json" in responseContent };
				}),
			});
		}
	}
	return operations;
}

/** Field names of a generated `z.object(...)` parser, via its public shape. */
function objectFieldNames(parser: unknown): string[] | undefined {
	// `in` narrows `unknown` without an assertion; the shape itself is a
	// plain object, so copying its entries is safe (unlike copying the
	// schema, whose accessors live on the prototype).
	if (typeof parser !== "object" || parser === null || !("shape" in parser)) {
		return undefined;
	}
	const shape = asRecord(parser.shape);
	if (shape === undefined) {
		return undefined;
	}
	return Object.keys(shape);
}

function sameMembers(actual: readonly string[], expected: readonly string[]): boolean {
	return actual.length === expected.length && actual.every((member) => expected.includes(member));
}

function fieldProblems(group: string, parser: unknown, expected: string[]): string[] {
	if (expected.length === 0) {
		return parser === undefined
			? []
			: [`${group} parser should be absent when the spec documents no ${group} params`];
	}
	if (parser === undefined) {
		return [`${group} parser should exist`];
	}
	const fields = objectFieldNames(parser);
	if (fields === undefined) {
		return [`${group} parser should expose an object shape`];
	}
	return sameMembers(fields, expected)
		? []
		: [`${group} fields [${fields.join(", ")}] should equal spec params [${expected.join(", ")}]`];
}

function contractProblems(operation: YamlOperation): string[] {
	const key = `${operation.method.toUpperCase()} ${operation.path}`;
	const contract = getOperationContract(operation.method, operation.path);
	if (contract === undefined) {
		return [`missing contract for ${key}`];
	}
	const problems: string[] = [];
	const prefix = (message: string): string => `${key}: ${message}`;
	if (contract.operation !== key) {
		problems.push(prefix(`operation field ${contract.operation} should equal ${key}`));
	}
	for (const [group, parser, expected] of [
		["pathParams", contract.pathParams, operation.params.path],
		["queryParams", contract.queryParams, operation.params.query],
		["headerParams", contract.headerParams, operation.params.header],
	] as const) {
		for (const problem of fieldProblems(group, parser, expected)) {
			problems.push(prefix(problem));
		}
	}
	if ((contract.requestBody !== undefined) !== operation.requestBody.json) {
		problems.push(prefix("requestBody presence should match the documented JSON body"));
	}
	if ((contract.requestMultipartBody !== undefined) !== operation.requestBody.multipart) {
		problems.push(
			prefix("requestMultipartBody presence should match the documented multipart body"),
		);
	}
	if (contract.isMultipart !== operation.requestBody.multipart) {
		problems.push(prefix("isMultipart should match the documented multipart body"));
	}
	if (contract.requestBodyRequired !== operation.requestBody.required) {
		problems.push(prefix("requestBodyRequired should match the spec"));
	}
	for (const response of operation.responses) {
		if (response.status.startsWith("2")) {
			if (operation.path.includes("/download") && response.status === "302") {
				if (!contract.isBinaryResponse) {
					problems.push(prefix("download endpoint should flag isBinaryResponse"));
				}
				if (!contract.emptyResponseStatuses.includes(302)) {
					problems.push(prefix("should record empty status 302"));
				}
				continue;
			}
			if (response.hasJsonContent) {
				if (contract.successResponses[response.status] === undefined) {
					problems.push(prefix(`should parse documented success status ${response.status}`));
				}
			} else if (!contract.emptyResponseStatuses.includes(Number(response.status))) {
				problems.push(prefix(`should record empty status ${response.status}`));
			}
		} else if (/^[45]/.test(response.status)) {
			if (response.hasJsonContent) {
				if (contract.errorResponses[response.status] === undefined) {
					problems.push(prefix(`should parse documented error status ${response.status}`));
				}
			} else if (!contract.emptyErrorStatuses.includes(Number(response.status))) {
				problems.push(prefix(`should record empty error status ${response.status}`));
			}
		}
	}
	return problems;
}

function readManifestJson(): unknown {
	const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
	return parsed;
}

function readManifestOperations(): string[] {
	const operations = asStringArray(asRecord(readManifestJson())?.["operations"]);
	if (operations === undefined) {
		throw new Error("manifest must list string operations");
	}
	return operations;
}

describe("operation coverage", () => {
	it("covers every OpenAPI method/path with no undocumented exceptions", () => {
		const yamlOperations = loadYamlOperations();
		const expectedKeys = yamlOperations.map(
			(operation) => `${operation.method.toUpperCase()} ${operation.path}`,
		);
		const problems: string[] = [];
		if (yamlOperations.length === 0) {
			problems.push("no operations found in docs/api/openapi.yaml");
		}
		for (const [label, raw] of [
			["registry keys", [...OPERATION_KEYS]],
			["manifest operations", readManifestOperations()],
			["registry map keys", Object.keys(OPERATION_CONTRACTS)],
		] as const) {
			if (!sameMembers(raw, expectedKeys)) {
				problems.push(`${label} should equal the OpenAPI operation list`);
			}
		}
		const manifest = asRecord(readManifestJson());
		const manifestSha = manifest?.["openapiSha256"];
		const manifestCount = manifest?.["operationCount"];
		const yamlText = readFileSync(openapiPath, "utf8");
		if (manifestSha !== createHash("sha256").update(yamlText, "utf8").digest("hex")) {
			problems.push("manifest sha256 should match docs/api/openapi.yaml");
		}
		if (manifestCount !== expectedKeys.length) {
			problems.push("manifest operationCount should match the OpenAPI operation list");
		}
		for (const operation of yamlOperations) {
			problems.push(...contractProblems(operation));
		}
		expect(problems).toEqual([]);
	});

	it("returns undefined for undocumented operations", () => {
		expect(getOperationContract("GET", "/api/v1/nope")).toBeUndefined();
		expect(getOperationContract("get", "/api/v1/accounts")).toBeDefined();
	});
});
