#!/usr/bin/env node
/**
 * Generate deterministic, typed Zod runtime parsers for every operation in
 * the canonical Sure OpenAPI document.
 *
 * Tooling choice (documented decision): instead of an off-the-shelf
 * OpenAPI-to-Zod code generator, this workspace ships a small deterministic
 * generator built on two maintained libraries —
 * [`yaml`](https://github.com/eemeli/yaml) (spec parsing) and
 * [`zod`](https://github.com/colinhacks/zod) (runtime) — with static types
 * from the same source via [`openapi-typescript`](https://github.com/openapi-ts/openapi-typescript).
 * Exact versions are pinned in `apps/web/package.json` (`zod`, `yaml`,
 * `openapi-typescript`). Rationale:
 *
 * - Operation-scoped output: one module per `METHOD /path` plus a shared
 *   component-schema module, so a route imports only the parsers it calls
 *   instead of the whole contract in its browser bundle.
 * - Fail-closed coverage: unsupported OpenAPI constructs (unknown types,
 *   discriminators, unexpected media types, multi-node `$ref` cycles, file
 *   collisions) abort generation with an operation-scoped error rather than
 *   silently emitting `z.unknown()`/`z.any()`.
 * - Redacted diagnostics: runtime integration reports schema paths and type
 *   tokens only (see `src/lib/api/contract.ts`), never raw payloads.
 *
 * Layout of `src/lib/api/generated/` (all files committed):
 *
 * - `zod-schemas.ts` — one Zod parser (+ inferred type) per component
 *   schema, emitted in dependency order.
 * - `operations/<method>-<path>.ts` — per-operation parsers
 *   (`pathParams`/`queryParams`/`headerParams`/`requestBody`/success + error
 *   response maps), a `*Contract` value, and a typed fetch wrapper that
 *   validates through `src/lib/api/client.ts`.
 * - `operation-contracts.ts` — `"METHOD /path"` registry, `getOperationContract`
 *   lookup for the server-only BFF transport, and strict request/response
 *   parse helpers.
 * - `manifest.json` — generator version, source sha256, and the sorted
 *   operation list consumed by drift and coverage checks.
 *
 * Determinism rules: inputs are parsed in document order, every map the
 * generator iterates is sorted by key, output uses LF + tabs + trailing
 * newline, and no timestamps are emitted. Regenerating must be
 * byte-identical (`--check` verifies this in CI).
 *
 * Usage (from `apps/web/`):
 *
 * ```sh
 * pnpm contracts:generate   # write files
 * pnpm contracts:check      # fail on any drift (CI)
 * ```
 *
 * [`yaml`]: https://github.com/eemeli/yaml
 * [`zod`]: https://github.com/colinhacks/zod
 * [`openapi-typescript`]: https://github.com/openapi-ts/openapi-typescript
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const GENERATOR_VERSION = 1;
const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = dirname(HERE);
const REPO_ROOT = dirname(dirname(WEB_DIR));
const OPENAPI_PATH = join(REPO_ROOT, "docs/api/openapi.yaml");
const OUT_DIR = join(WEB_DIR, "src/lib/api/generated");
const OPS_DIR = join(OUT_DIR, "operations");
const CHECK_FLAG = "--check";

/**
 * Deterministic codepoint comparator for generated-output ordering.
 * (Default `Array#sort` order, spelled out for the lint rule.)
 */
function compareStrings(a, b) {
	return a < b ? -1 : a > b ? 1 : 0;
}

const METHODS = ["get", "post", "put", "patch", "delete"];
const JSON_MEDIA = "application/json";
const MULTIPART_MEDIA = "multipart/form-data";
const SUPPORTED_REQUEST_MEDIA = new Set([JSON_MEDIA, MULTIPART_MEDIA]);
const BINARY_MEDIA_RE =
	/^(application\/octet-stream|application\/zip|application\/pdf|text\/csv|application\/csv|image\/.*|audio\/.*|video\/.*)$/;

class UnsupportedConstructError extends Error {
	constructor(operation, message) {
		super(`[${operation}] ${message}`);
		this.name = "UnsupportedConstructError";
	}
}

function fail(operation, message) {
	throw new UnsupportedConstructError(operation, message);
}

function sha256(text) {
	return createHash("sha256").update(text, "utf8").digest("hex");
}

function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function quoteString(value) {
	return JSON.stringify(value);
}

function isSafeKey(key) {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

function objectKey(key) {
	return isSafeKey(key) ? key : quoteString(key);
}

function refName(ref, operation) {
	const match = /^#\/components\/schemas\/([A-Za-z][A-Za-z0-9]*)$/.exec(ref);
	if (!match) {
		fail(
			operation,
			`unsupported $ref target ${quoteString(ref)} (only #/components/schemas/<Name> is supported)`,
		);
	}
	return match[1];
}

function collectRefs(node, into) {
	if (Array.isArray(node)) {
		for (const item of node) collectRefs(item, into);
		return into;
	}
	if (isRecord(node)) {
		if (typeof node.$ref === "string") {
			const match = /^#\/components\/schemas\/([A-Za-z][A-Za-z0-9]*)$/.exec(node.$ref);
			if (match) into.add(match[1]);
		}
		for (const value of Object.values(node)) collectRefs(value, into);
	}
	return into;
}

/**
 * Emit a Zod expression for an OpenAPI 3.0 schema node. `ctx` carries the
 * operation key (for fail-closed errors), the set of component refs used by
 * the current file, and the schema currently being defined (self refs emit
 * `z.lazy`).
 */
function emitSchema(node, ctx) {
	if (!isRecord(node)) {
		fail(ctx.operation, `schema must be an object, saw ${JSON.stringify(node)?.slice(0, 120)}`);
	}
	if (node.discriminator !== undefined) {
		fail(
			ctx.operation,
			"discriminator mapping is not supported; add explicit oneOf/anyOf or extend the generator",
		);
	}
	for (const key of [
		"not",
		"if",
		"then",
		"else",
		"additionalItems",
		"uniqueItems",
		"patternProperties",
	]) {
		if (node[key] !== undefined) {
			fail(
				ctx.operation,
				`unsupported schema keyword ${quoteString(key)}; extend the generator instead of silently accepting unknown data`,
			);
		}
	}
	let code;
	// Schemas with `properties`/`additionalProperties` but no explicit
	// `type` are implicit objects (common OpenAPI shorthand).
	const isObjectish =
		node.type === "object" ||
		(node.type === undefined &&
			(node.properties !== undefined || node.additionalProperties !== undefined));
	const hasBase =
		node.$ref !== undefined || node.enum !== undefined || node.type !== undefined || isObjectish;
	const hasCombo = node.oneOf !== undefined || node.anyOf !== undefined || node.allOf !== undefined;
	if (hasBase && hasCombo) {
		code = `(${emitBaseSchema(node, ctx)}).and(${emitComboSchema(node, ctx)})`;
	} else if (hasCombo) {
		code = emitComboSchema(node, ctx);
	} else if (hasBase) {
		code = emitBaseSchema(node, ctx);
	} else {
		fail(ctx.operation, "schema has no `type`, `$ref`, `enum`, or combinator (oneOf/anyOf/allOf)");
		code = "";
	}
	return applyNullable(code, node);
}

/**
 * Emit a union branch that only constrains presence (`{required: [...]}`,
 * no type/properties/$ref): an object requiring those keys with unknown
 * values. The sibling base schema governs value shapes; intersecting the
 * two enforces "at least one variant's keys are present".
 */
function emitConstraintBranch(branch, ctx) {
	const required = branch.required ?? [];
	if (!Array.isArray(required)) {
		fail(ctx.operation, "union branch `required` must be an array");
	}
	for (const key of required) {
		if (typeof key !== "string") {
			fail(ctx.operation, "union branch `required` entries must be strings");
		}
	}
	return `z.object({${required.map((key) => `${objectKey(key)}: z.unknown()`).join(", ")}})`;
}

function isConstraintOnlyBranch(branch) {
	if (!isRecord(branch)) return false;
	return (
		branch.$ref === undefined &&
		branch.enum === undefined &&
		branch.type === undefined &&
		branch.properties === undefined &&
		branch.oneOf === undefined &&
		branch.anyOf === undefined &&
		branch.allOf === undefined
	);
}

function emitComboSchema(node, ctx) {
	if (node.oneOf !== undefined || node.anyOf !== undefined) {
		const branches = node.oneOf ?? node.anyOf;
		if (!Array.isArray(branches) || branches.length === 0) {
			fail(ctx.operation, "oneOf/anyOf must be a non-empty array");
		}
		return `z.union([${branches
			.map((branch) =>
				isConstraintOnlyBranch(branch)
					? emitConstraintBranch(branch, ctx)
					: emitSchema(branch, ctx),
			)
			.join(", ")}])`;
	}
	if (node.allOf !== undefined) {
		if (!Array.isArray(node.allOf) || node.allOf.length === 0) {
			fail(ctx.operation, "allOf must be a non-empty array");
		}
		const parts = node.allOf.map((branch) => {
			if (isRecord(branch) && typeof branch.$ref === "string") {
				return emitSchema(branch, ctx);
			}
			if (
				isRecord(branch) &&
				(branch.type === "object" ||
					branch.properties !== undefined ||
					branch.additionalProperties !== undefined)
			) {
				return emitSchema({ ...branch, type: "object" }, ctx);
			}
			fail(ctx.operation, "allOf members must be $refs or object schemas");
			return "";
		});
		if (parts.length === 1) {
			return parts[0];
		}
		return parts
			.map((part) => `(${part})`)
			.slice(1)
			.reduce((acc, part) => `${acc}.and${part}`, `(${parts[0]})`);
	}
	fail(ctx.operation, "combinator missing oneOf/anyOf/allOf");
	return "";
}

function emitBaseSchema(node, ctx) {
	if (typeof node.$ref === "string") {
		const name = refName(node.$ref, ctx.operation);
		if (name === ctx.defining) {
			ctx.recursive = true;
			return `z.lazy((): z.ZodType => ${name})`;
		}
		ctx.refs.add(name);
		return name;
	}
	if (node.enum !== undefined) {
		if (!Array.isArray(node.enum) || node.enum.length === 0) {
			fail(ctx.operation, "enum must be a non-empty array");
		}
		for (const value of node.enum) {
			if (typeof value !== "string") {
				fail(
					ctx.operation,
					`non-string enum values are not supported (saw ${JSON.stringify(value)})`,
				);
			}
		}
		return `z.enum([${node.enum.map((value) => quoteString(value)).join(", ")}])`;
	}
	if (node.type === undefined) {
		return emitObjectSchema(node, ctx);
	}
	return emitTypedSchema(node, ctx);
}

function applyNullable(code, node) {
	if (node.nullable === true) {
		return `${code}.nullable()`;
	}
	return code;
}

function applyNumberConstraints(code, node, ctx) {
	let out = code;
	if (node.minimum !== undefined) {
		if (typeof node.minimum !== "number") fail(ctx.operation, "minimum must be a number");
		out += `.min(${node.minimum})`;
	}
	if (node.maximum !== undefined) {
		if (typeof node.maximum !== "number") fail(ctx.operation, "maximum must be a number");
		out += `.max(${node.maximum})`;
	}
	if (node.exclusiveMinimum !== undefined || node.exclusiveMaximum !== undefined) {
		fail(
			ctx.operation,
			"exclusiveMinimum/exclusiveMaximum are not supported; extend the generator",
		);
	}
	return out;
}

function emitTypedSchema(node, ctx) {
	const type = node.type;
	switch (type) {
		case "string": {
			return emitStringSchema(node, ctx);
		}
		case "integer": {
			return applyNumberConstraints("z.number().int()", node, ctx);
		}
		case "number": {
			return applyNumberConstraints("z.number()", node, ctx);
		}
		case "boolean": {
			return "z.boolean()";
		}
		case "array": {
			if (!isRecord(node.items)) {
				fail(ctx.operation, "array schemas require an `items` schema");
			}
			let out = `z.array(${emitSchema(node.items, ctx)})`;
			if (node.minItems !== undefined) {
				if (typeof node.minItems !== "number") fail(ctx.operation, "minItems must be a number");
				out += `.min(${node.minItems})`;
			}
			if (node.maxItems !== undefined) {
				if (typeof node.maxItems !== "number") fail(ctx.operation, "maxItems must be a number");
				out += `.max(${node.maxItems})`;
			}
			return out;
		}
		case "object": {
			return emitObjectSchema(node, ctx);
		}
		case undefined: {
			fail(
				ctx.operation,
				"schema has no `type`, `$ref`, `enum`, or combinator (oneOf/anyOf/allOf)",
			);
			return "";
		}
		default: {
			fail(ctx.operation, `unsupported schema type ${quoteString(String(type))}`);
			return "";
		}
	}
}

function emitStringSchema(node, ctx) {
	const format = node.format;
	if (
		format === undefined ||
		format === "uuid" ||
		format === "date" ||
		format === "uri" ||
		format === "email"
	) {
		// Identifier/date/URI/email strings stay plain strings at the runtime
		// boundary on purpose: shape (not identifier syntax) is what the
		// boundary enforces. date-time below is the strict exception.
		return "z.string()";
	}
	if (format === "date-time") {
		return "z.iso.datetime()";
	}
	if (format === "binary") {
		// Multipart file parts arrive as File (a Blob); JSON transports must
		// use multipart for binary fields.
		return "z.instanceof(Blob)";
	}
	fail(ctx.operation, `unsupported string format ${quoteString(String(format))}`);
	return "";
}

function emitObjectSchema(node, ctx) {
	const properties = node.properties ?? {};
	if (!isRecord(properties)) {
		fail(ctx.operation, "`properties` must be an object");
	}
	const required = node.required ?? [];
	if (!Array.isArray(required)) {
		fail(ctx.operation, "`required` must be an array");
	}
	const requiredSet = new Set(required);
	const entries = Object.entries(properties).map(([key, prop]) => {
		if (!isRecord(prop)) {
			fail(ctx.operation, `property ${quoteString(key)} must be a schema object`);
		}
		let expr = emitSchema(prop, ctx);
		if (!requiredSet.has(key)) {
			expr += ".optional()";
		}
		return `${objectKey(key)}: ${expr}`;
	});
	let base =
		entries.length === 0
			? `z.object({})`
			: `z.object({\n${entries.map((entry) => `\t\t${entry},`).join("\n")}\n\t})`;
	const additional = node.additionalProperties;
	if (additional === undefined) {
		return base;
	}
	if (additional === false) {
		return `${base}.strict()`;
	}
	if (additional === true) {
		const catcher = "z.unknown()";
		return entries.length > 0 ? `${base}.catchall(${catcher})` : `z.record(z.string(), ${catcher})`;
	}
	if (isRecord(additional)) {
		const value = emitSchema(additional, ctx);
		return entries.length > 0 ? `${base}.catchall(${value})` : `z.record(z.string(), ${value})`;
	}
	fail(ctx.operation, "`additionalProperties` must be a boolean or a schema");
	return "";
}

function emitParamsObject(params, ctx) {
	if (params.length === 0) return undefined;
	const entries = params.map((param) => {
		const schema = param.schema;
		if (!isRecord(schema)) {
			fail(ctx.operation, `parameter ${quoteString(param.name)} requires a schema`);
		}
		let expr = emitSchema(schema, ctx);
		if (param.required !== true) {
			expr += ".optional()";
		}
		return `${objectKey(param.name)}: ${expr}`;
	});
	return `z.object({\n${entries.map((entry) => `\t${entry},`).join("\n")}\n})`;
}

function sanitizeFileSegment(segment) {
	return (
		segment
			.replace(/[^A-Za-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.toLowerCase() || "root"
	);
}

function operationFileName(method, path) {
	const segments = path.split("/").filter((segment) => segment.length > 0);
	const parts = segments.map((segment) => {
		const param = /^\{(.+)\}$/.exec(segment);
		if (param) {
			return `by-${sanitizeFileSegment(param[1])}`;
		}
		return sanitizeFileSegment(segment);
	});
	return `${method}-${parts.join("-")}`;
}

function toCamelCase(value) {
	return value
		.split("-")
		.filter((part) => part.length > 0)
		.map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
		.join("");
}

function toPascalCase(value) {
	const camel = toCamelCase(value);
	return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function fileHeader(lines) {
	return ["/**", ...lines.map((line) => ` * ${line}`.trimEnd()), " */", ""].join("\n");
}

function loadDocument() {
	const text = readFileSync(OPENAPI_PATH, "utf8");
	const digest = sha256(text);
	const document = parseYaml(text);
	if (!isRecord(document) || !isRecord(document.paths)) {
		throw new Error(`canonical OpenAPI document at ${OPENAPI_PATH} has no \`paths\` map`);
	}
	if (!isRecord(document.components) || !isRecord(document.components.schemas)) {
		throw new Error(
			`canonical OpenAPI document at ${OPENAPI_PATH} has no \`components.schemas\` map`,
		);
	}
	return { text, digest, document };
}

function listOperations(document) {
	const operations = [];
	for (const [path, item] of Object.entries(document.paths)) {
		if (!isRecord(item)) {
			throw new Error(`path item ${quoteString(path)} must be an object`);
		}
		const pathParams = item.parameters ?? [];
		for (const method of METHODS) {
			const operation = item[method];
			if (operation === undefined) continue;
			if (!isRecord(operation)) {
				throw new Error(`operation ${method.toUpperCase()} ${path} must be an object`);
			}
			operations.push({ method, path, item, operation, pathParams });
		}
		for (const key of Object.keys(item)) {
			if (key !== "parameters" && !METHODS.includes(key) && !key.startsWith("x-")) {
				throw new Error(`unsupported path-item key ${quoteString(key)} for ${quoteString(path)}`);
			}
		}
	}
	return operations.toSorted((a, b) =>
		`${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`),
	);
}

function collectParameters(entry) {
	const byName = new Map();
	for (const param of [...(entry.pathParams ?? []), ...(entry.operation.parameters ?? [])]) {
		if (!isRecord(param) || typeof param.name !== "string" || typeof param.in !== "string") {
			fail(
				`${entry.method.toUpperCase()} ${entry.path}`,
				"every parameter needs a string `name` and `in`",
			);
		}
		if (!["path", "query", "header"].includes(param.in)) {
			fail(
				`${entry.method.toUpperCase()} ${entry.path}`,
				`unsupported parameter location ${quoteString(param.in)}`,
			);
		}
		byName.set(`${param.in}:${param.name}`, param);
	}
	const groups = { path: [], query: [], header: [] };
	for (const param of [...byName.values()].toSorted((a, b) =>
		String(a.name).localeCompare(String(b.name)),
	)) {
		groups[param.in].push({ name: param.name, required: param.required, schema: param.schema });
	}
	return groups;
}

function mediaSchema(content, media, operation) {
	const mediaType = content[media];
	if (mediaType === undefined) return undefined;
	if (!isRecord(mediaType)) {
		fail(operation, `media type ${quoteString(media)} must be an object`);
	}
	return mediaType.schema;
}

function responseParser(responses, status, operation, ctx) {
	const response = responses[String(status)];
	if (!isRecord(response)) return undefined;
	const content = response.content ?? {};
	if (!isRecord(content)) {
		fail(operation, `response ${status} content must be an object`);
	}
	const entries = Object.entries(content);
	if (entries.length === 0) return { kind: "empty" };
	if (entries.length > 1) {
		fail(operation, `response ${status} documents multiple media types; extend the generator`);
	}
	const [media, mediaType] = entries[0];
	if (media === JSON_MEDIA) {
		if (!isRecord(mediaType) || !isRecord(mediaType.schema)) {
			fail(operation, `response ${status} JSON media needs a schema`);
		}
		return { kind: "json", code: emitSchema(mediaType.schema, ctx) };
	}
	if (BINARY_MEDIA_RE.test(media)) {
		return { kind: "binary" };
	}
	fail(operation, `unsupported response media type ${quoteString(media)} for status ${status}`);
	return undefined;
}

function buildOperation(entry) {
	const operationKey = `${entry.method.toUpperCase()} ${entry.path}`;
	const ctx = {
		operation: operationKey,
		refs: new Set(),
		defining: undefined,
		needsOpenapiTypes: false,
	};
	const groups = collectParameters(entry);
	const responses = entry.operation.responses ?? {};
	if (!isRecord(responses)) {
		fail(operationKey, "`responses` must be an object");
	}

	const successResponses = {};
	const emptyResponseStatuses = [];
	let binaryDownload = false;
	for (const status of Object.keys(responses).toSorted(compareStrings)) {
		if (status.startsWith("2")) {
			const parsed = responseParser(responses, status, operationKey, ctx);
			if (parsed === undefined || parsed.kind === "empty") {
				emptyResponseStatuses.push(Number(status));
				successResponses[status] = "z.void()";
			} else if (parsed.kind === "binary") {
				binaryDownload = true;
			} else {
				successResponses[status] = parsed.code;
			}
		}
	}
	// Redirect-to-binary downloads (302 with no content): fetch follows the
	// redirect and surfaces bytes, so the contract validates a Blob.
	if (responses["302"] !== undefined && entry.path.includes("/download")) {
		binaryDownload = true;
		if (!emptyResponseStatuses.includes(302)) {
			emptyResponseStatuses.push(302);
		}
		// Insertion stays ordered: statuses iterate in sorted order above.
	}

	const errorResponses = {};
	const emptyErrorStatuses = [];
	for (const status of Object.keys(responses).toSorted(compareStrings)) {
		if (/^[45]/.test(status)) {
			const parsed = responseParser(responses, status, operationKey, ctx);
			if (parsed === undefined || parsed.kind === "empty") {
				emptyErrorStatuses.push(Number(status));
			} else if (parsed.kind === "binary") {
				fail(operationKey, `binary error responses are not supported (status ${status})`);
			} else {
				errorResponses[status] = parsed.code;
			}
		}
	}

	const requestBody = entry.operation.requestBody;
	let requestBodyCode;
	let multipartBodyCode;
	let requestBodyRequired = false;
	let isMultipart = false;
	if (requestBody !== undefined) {
		if (!isRecord(requestBody)) {
			fail(operationKey, "`requestBody` must be an object");
		}
		requestBodyRequired = requestBody.required === true;
		const content = requestBody.content ?? {};
		if (!isRecord(content)) {
			fail(operationKey, "`requestBody.content` must be an object");
		}
		for (const media of Object.keys(content)) {
			if (!SUPPORTED_REQUEST_MEDIA.has(media)) {
				fail(operationKey, `unsupported request media type ${quoteString(media)}`);
			}
		}
		const jsonSchema = mediaSchema(content, JSON_MEDIA, operationKey);
		if (jsonSchema !== undefined) {
			if (!isRecord(jsonSchema)) fail(operationKey, "JSON request body needs a schema object");
			requestBodyCode = emitSchema(jsonSchema, ctx);
		}
		const multipartSchema = mediaSchema(content, MULTIPART_MEDIA, operationKey);
		if (multipartSchema !== undefined) {
			if (!isRecord(multipartSchema))
				fail(operationKey, "multipart request body needs a schema object");
			isMultipart = true;
			multipartBodyCode = emitSchema(multipartSchema, ctx);
		}
		if (requestBodyCode === undefined && multipartBodyCode === undefined) {
			fail(operationKey, "request body documents no supported media type");
		}
	}

	const pathParamsCode = emitParamsObject(groups.path, ctx);
	const queryParamsCode = emitParamsObject(groups.query, ctx);
	const headerParamsCode = emitParamsObject(groups.header, ctx);

	return {
		entry,
		operationKey,
		pathParamsCode,
		queryParamsCode,
		headerParamsCode,
		requestBodyCode,
		multipartBodyCode,
		requestBodyRequired,
		isMultipart,
		successResponses,
		errorResponses,
		emptyResponseStatuses,
		emptyErrorStatuses,
		isBinaryResponse: binaryDownload,
		refs: ctx.refs,
	};
}

function topoOrderSchemas(schemas) {
	const names = Object.keys(schemas).toSorted(compareStrings);
	const graph = new Map(
		names.map((name) => [
			name,
			[...collectRefs(schemas[name], new Set())]
				.filter((ref) => ref !== name && names.includes(ref))
				.toSorted(compareStrings),
		]),
	);
	const selfRecursive = new Set();
	for (const name of names) {
		if (collectRefs(schemas[name], new Set()).has(name)) {
			selfRecursive.add(name);
		}
	}
	const visited = new Set();
	const visiting = new Set();
	const order = [];
	function visit(name, stack) {
		if (visited.has(name)) return;
		if (visiting.has(name)) {
			throw new Error(
				`cyclic $ref chain is not supported: ${[...stack, name].join(" -> ")} (extend the generator with lazy schemas)`,
			);
		}
		visiting.add(name);
		for (const dep of graph.get(name) ?? []) visit(dep, [...stack, name]);
		visiting.delete(name);
		visited.add(name);
		order.push(name);
	}
	for (const name of names) visit(name, []);
	return { order, selfRecursive };
}

function buildSchemasFile(schemas, digest) {
	const { order, selfRecursive } = topoOrderSchemas(schemas);
	const chunks = [];
	const needsOpenapiTypes = selfRecursive.size > 0;
	chunks.push(
		fileHeader([
			"GENERATED — do not edit by hand.",
			"",
			`Source: docs/api/openapi.yaml (sha256: ${digest})`,
			`Generator: apps/web/scripts/generate-zod-contracts.mjs (version ${GENERATOR_VERSION})`,
			"Static types for the same source live in ../openapi.d.ts (openapi-typescript).",
			"Regenerate with: pnpm --filter @sure/web contracts:generate",
		]),
	);
	chunks.push(`import { z } from "zod";`);
	if (needsOpenapiTypes) {
		chunks.push(`import type { components } from "../openapi";`);
	}
	for (const name of order) {
		const ctx = { operation: `schema ${name}`, refs: new Set(), defining: name, recursive: false };
		const code = emitSchema(schemas[name], ctx);
		if (ctx.refs.size > 0) {
			const missing = [...ctx.refs].filter((ref) => schemas[ref] === undefined);
			if (missing.length > 0) {
				throw new Error(`schema ${name} references unknown component(s): ${missing.join(", ")}`);
			}
		}
		if (selfRecursive.has(name)) {
			// Self-recursive schemas cannot carry an inferred annotation
			// (circular inference) nor a precise `ZodType<Static>` one
			// (`exactOptionalPropertyTypes` rejects the `| undefined` that
			// `.optional()` contributes). The intentionally loose `ZodType`
			// breaks the cycle; the named type aliases the static type from
			// the same OpenAPI source, and parser tests pin the runtime
			// shape (including recursion).
			chunks.push(`export const ${name}: z.ZodType = ${code};`);
			chunks.push(`export type ${name} = components["schemas"][${quoteString(name)}];`);
		} else {
			chunks.push(`export const ${name} = ${code};`);
			chunks.push(`export type ${name} = z.infer<typeof ${name}>;`);
		}
	}
	return chunks.join("\n") + "\n";
}

const VERB_IMPORT = {
	get: "apiGet",
	post: "apiPost",
	put: "apiPut",
	patch: "apiPatch",
	delete: "apiDelete",
};

function buildOperationFile(built, digest) {
	const { entry, operationKey } = built;
	const baseName = operationFileName(entry.method, entry.path);
	const constName = `${toPascalCase(baseName)}Contract`;
	const fnName = toCamelCase(baseName);
	const methodUpper = entry.method.toUpperCase();
	const verb = VERB_IMPORT[entry.method];
	const lines = [];
	lines.push(
		fileHeader([
			`GENERATED — do not edit by hand. Operation contract for ${operationKey}.`,
			"",
			`Source: docs/api/openapi.yaml (sha256: ${digest})`,
			`Generator: apps/web/scripts/generate-zod-contracts.mjs (version ${GENERATOR_VERSION})`,
			"Regenerate with: pnpm --filter @sure/web contracts:generate",
		]),
	);
	const usesZod =
		built.isBinaryResponse ||
		[
			built.pathParamsCode,
			built.queryParamsCode,
			built.headerParamsCode,
			built.requestBodyCode,
			built.multipartBodyCode,
			...Object.values(built.successResponses),
			...Object.values(built.errorResponses),
		].some((code) => code !== undefined && code.includes("z."));
	const sortedRefs = [...built.refs].toSorted(compareStrings);
	if (usesZod) {
		lines.push(`import { z } from "zod";`);
	}
	if (built.isBinaryResponse) {
		lines.push(`import { apiDownload } from "../../client";`);
		lines.push(`import type { ApiInit, DownloadedFile, SureClient } from "../../client";`);
	} else {
		lines.push(`import { ${verb} } from "../../client";`);
		lines.push(`import type { ApiData, ApiInit, ApiSuccess, SureClient } from "../../client";`);
	}
	lines.push(`import type { OperationContract } from "../../contract";`);
	lines.push(`import type { paths } from "../../openapi";`);
	if (sortedRefs.length > 0) {
		lines.push(`import { ${sortedRefs.join(", ")} } from "../zod-schemas";`);
	}
	if (built.pathParamsCode !== undefined) {
		lines.push(`export const pathParams = ${built.pathParamsCode};`);
	}
	if (built.queryParamsCode !== undefined) {
		lines.push(`export const queryParams = ${built.queryParamsCode};`);
	}
	if (built.headerParamsCode !== undefined) {
		lines.push(`export const headerParams = ${built.headerParamsCode};`);
	}
	if (built.requestBodyCode !== undefined) {
		lines.push(`export const requestBody = ${built.requestBodyCode};`);
	}
	if (built.multipartBodyCode !== undefined) {
		lines.push(`export const requestMultipartBody = ${built.multipartBodyCode};`);
	}
	for (const [status, code] of Object.entries(built.successResponses)) {
		lines.push(`const success${status} = ${code};`);
	}
	for (const [status, code] of Object.entries(built.errorResponses)) {
		lines.push(`const error${status} = ${code};`);
	}
	if (built.isBinaryResponse) {
		lines.push(`export const binaryResponse = z.instanceof(Blob);`);
	}
	const successEntries = Object.keys(built.successResponses)
		.toSorted(compareStrings)
		.map((status) => `${status}: success${status}`)
		.join(", ");
	const errorEntries = Object.keys(built.errorResponses)
		.toSorted(compareStrings)
		.map((status) => `${status}: error${status}`)
		.join(", ");
	lines.push(
		[
			`export const ${constName}: OperationContract = {`,
			`\toperation: ${quoteString(operationKey)},`,
			`\tmethod: ${quoteString(methodUpper)},`,
			`\tpath: ${quoteString(entry.path)},`,
			`\tpathParams: ${built.pathParamsCode !== undefined ? "pathParams" : "undefined"},`,
			`\tqueryParams: ${built.queryParamsCode !== undefined ? "queryParams" : "undefined"},`,
			`\theaderParams: ${built.headerParamsCode !== undefined ? "headerParams" : "undefined"},`,
			`\trequestBody: ${built.requestBodyCode !== undefined ? "requestBody" : "undefined"},`,
			`\trequestMultipartBody: ${built.multipartBodyCode !== undefined ? "requestMultipartBody" : "undefined"},`,
			`\trequestBodyRequired: ${built.requestBodyRequired ? "true" : "false"},`,
			`\tisMultipart: ${built.isMultipart ? "true" : "false"},`,
			`\tsuccessResponses: { ${successEntries} },`,
			`\terrorResponses: { ${errorEntries} },`,
			`\temptyResponseStatuses: [${built.emptyResponseStatuses.join(", ")}],`,
			`\temptyErrorStatuses: [${built.emptyErrorStatuses.join(", ")}],`,
			`\tisBinaryResponse: ${built.isBinaryResponse ? "true" : "false"},`,
			`\tbinaryResponse: ${built.isBinaryResponse ? "binaryResponse" : "undefined"},`,
			`};`,
		].join("\n"),
	);
	const pathType = `paths[${quoteString(entry.path)}][${quoteString(entry.method)}]`;
	if (built.isBinaryResponse) {
		lines.push(
			[
				`/** Validated binary download for ${operationKey}: parses the Blob through the operation contract. */`,
				`export function ${fnName}(`,
				`\tclient: SureClient,`,
				`\t...args: ApiInit<${pathType}>`,
				`): Promise<DownloadedFile> {`,
				`\tconst [init] = args;`,
				`\treturn apiDownload(client, ${quoteString(entry.path)}, { ...init, contract: ${constName} });`,
				`}`,
			].join("\n"),
		);
	} else {
		lines.push(
			[
				`/** Validated ${methodUpper} ${entry.path}: success payloads are parsed through the operation contract before they reach callers. */`,
				`export function ${fnName}(`,
				`\tclient: SureClient,`,
				`\t...args: ApiInit<${pathType}>`,
				`): Promise<ApiSuccess<ApiData<${quoteString(entry.method)}, ${quoteString(entry.path)}>>> {`,
				`\tconst [init] = args;`,
				`\treturn ${verb}(client, ${quoteString(entry.path)}, { ...init, contract: ${constName} });`,
				`}`,
			].join("\n"),
		);
	}
	return { baseName, constName, fnName, operationKey, content: lines.join("\n") + "\n" };
}

function buildRegistryFile(files, digest) {
	const lines = [];
	lines.push(
		fileHeader([
			"GENERATED — do not edit by hand. Registry of every OpenAPI operation contract.",
			"",
			`Source: docs/api/openapi.yaml (sha256: ${digest})`,
			`Generator: apps/web/scripts/generate-zod-contracts.mjs (version ${GENERATOR_VERSION})`,
			"Browser routes should import their operation module directly (tree-shakeable);",
			"the server-only BFF transport uses getOperationContract for full-surface lookup.",
			"Regenerate with: pnpm --filter @sure/web contracts:generate",
		]),
	);
	lines.push(`import { redactZodIssues } from "../contract";`);
	lines.push(
		`import type { OperationContract, OperationParsePart, OperationParseResult, RedactedIssue } from "../contract";`,
	);
	for (const file of files) {
		lines.push(`import { ${file.constName} } from "./operations/${file.baseName}";`);
	}
	lines.push(`/** Every operation contract, keyed by "METHOD /path". */`);
	lines.push(
		[
			`export const OPERATION_CONTRACTS: Record<string, OperationContract> = {`,
			...files.map((file) => `\t${quoteString(file.operationKey)}: ${file.constName},`),
			`};`,
		].join("\n"),
	);
	lines.push(`/** Sorted operation keys ("METHOD /path") covered by this registry. */`);
	lines.push(
		[
			`export const OPERATION_KEYS: readonly string[] = [`,
			...files.map((file) => `\t${quoteString(file.operationKey)},`),
			`];`,
		].join("\n"),
	);
	lines.push(
		[
			`/** Look up the contract for a "METHOD /path" pair (BFF request + upstream-response validation). Returns undefined for undocumented operations. */`,
			`export function getOperationContract(method: string, path: string): OperationContract | undefined {`,
			"\treturn OPERATION_CONTRACTS[`${method.toUpperCase()} ${path}`];",
			`}`,
		].join("\n"),
	);
	lines.push(
		[
			`function failure(part: OperationParsePart, issues: readonly RedactedIssue[]): OperationParseResult {`,
			`\treturn { ok: false, part, issues };`,
			`}`,
		].join("\n"),
	);
	lines.push(
		[
			`/** Strictly validate an upstream response body against the operation's documented response for its status. Unknown statuses fail closed. */`,
			`export function parseOperationResponse(contract: OperationContract, status: number, data: unknown): OperationParseResult {`,
			`\tif (contract.isBinaryResponse && data instanceof Blob) {`,
			`\t\treturn { ok: true, data };`,
			`\t}`,
			`\tconst parser = contract.successResponses[String(status)];`,
			`\tif (parser === undefined) {`,
			`\t\treturn failure("status", [{ path: "$", expected: "documented success status", received: "undocumented" }]);`,
			`\t}`,
			`\tconst parsed = parser.safeParse(data);`,
			`\tif (!parsed.success) {`,
			`\t\treturn failure("response", redactZodIssues(parsed.error));`,
			`\t}`,
			`\treturn { ok: true, data: parsed.data };`,
			`}`,
		].join("\n"),
	);
	lines.push(
		[
			`/** Strictly validate an outgoing request (params + body) against the operation contract. */`,
			`export function parseOperationRequest(`,
			`\tcontract: OperationContract,`,
			`\tinput: { readonly pathParams?: unknown; readonly query?: unknown; readonly headers?: unknown; readonly body?: unknown },`,
			`\tcontentType?: string,`,
			`): OperationParseResult {`,
			`\tconst validated: { pathParams?: unknown; query?: unknown; headers?: unknown; body?: unknown } = {};`,
			`\tconst groups: ReadonlyArray<{ readonly part: OperationParsePart; readonly parser: OperationContract["pathParams"]; readonly value: unknown; readonly key: "pathParams" | "query" | "headers" }> = [`,
			`\t\t{ part: "pathParams", parser: contract.pathParams, value: input.pathParams, key: "pathParams" },`,
			`\t\t{ part: "query", parser: contract.queryParams, value: input.query, key: "query" },`,
			`\t\t{ part: "headers", parser: contract.headerParams, value: input.headers, key: "headers" },`,
			`\t];`,
			`\tfor (const group of groups) {`,
			`\t\tif (group.parser === undefined) continue;`,
			`\t\tconst parsed = group.parser.safeParse(group.value);`,
			`\t\tif (!parsed.success) {`,
			`\t\t\treturn failure(group.part, redactZodIssues(parsed.error));`,
			`\t\t}`,
			`\t\tvalidated[group.key] = parsed.data;`,
			`\t}`,
			`\tconst bodyParser = contentType !== undefined && contentType.includes("multipart") && contract.requestMultipartBody !== undefined ? contract.requestMultipartBody : contract.requestBody;`,
			`\tif (bodyParser === undefined) {`,
			`\t\tif (input.body !== undefined) {`,
			`\t\t\treturn failure("body", [{ path: "$", expected: "no body", received: "object" }]);`,
			`\t\t}`,
			`\t\treturn { ok: true, data: validated };`,
			`\t}`,
			`\tconst parsed = bodyParser.safeParse(input.body);`,
			`\tif (!parsed.success) {`,
			`\t\treturn failure("body", redactZodIssues(parsed.error));`,
			`\t}`,
			`\treturn { ok: true, data: { ...validated, body: parsed.data } };`,
			`}`,
		].join("\n"),
	);
	return lines.join("\n") + "\n";
}

function buildManifest(digest, operationKeys, schemaCount) {
	return (
		JSON.stringify(
			{
				generator: "apps/web/scripts/generate-zod-contracts.mjs",
				generatorVersion: GENERATOR_VERSION,
				openapiSource: "docs/api/openapi.yaml",
				openapiSha256: digest,
				operationCount: operationKeys.length,
				schemaCount,
				operations: operationKeys,
			},
			null,
			"\t",
		) + "\n"
	);
}

function generateAll() {
	const { digest, document } = loadDocument();
	const schemas = document.components.schemas;
	for (const name of Object.keys(schemas)) {
		if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
			throw new Error(`unsupported component schema name ${quoteString(name)}`);
		}
	}
	const operations = listOperations(document);
	const built = operations.map((entry) => buildOperation(entry));
	const opFiles = built.map((item) => buildOperationFile(item, digest));
	const seenFiles = new Set();
	const seenConsts = new Set();
	const seenFns = new Set();
	for (const file of opFiles) {
		for (const [set, value, kind] of [
			[seenFiles, file.baseName, "file"],
			[seenConsts, file.constName, "export"],
			[seenFns, file.fnName, "export"],
		]) {
			if (set.has(value)) {
				throw new Error(
					`naming collision: two operations map to the same ${kind} ${quoteString(value)} (extend the sanitizer)`,
				);
			}
			set.add(value);
		}
	}
	const files = new Map();
	files.set("zod-schemas.ts", buildSchemasFile(schemas, digest));
	for (const file of opFiles) {
		files.set(`operations/${file.baseName}.ts`, file.content);
	}
	files.set(
		"operation-contracts.ts",
		buildRegistryFile(
			[...opFiles].toSorted((a, b) => a.baseName.localeCompare(b.baseName)),
			digest,
		),
	);
	const manifestKeys = [...opFiles]
		.map((file) => file.operationKey)
		.toSorted((a, b) => a.localeCompare(b));
	files.set("manifest.json", buildManifest(digest, manifestKeys, Object.keys(schemas).length));
	return files;
}

function readExisting() {
	const existing = new Map();
	if (!existsSync(OUT_DIR)) return existing;
	for (const entry of readdirSync(OUT_DIR, { withFileTypes: true })) {
		if (entry.isFile()) {
			existing.set(entry.name, readFileSync(join(OUT_DIR, entry.name), "utf8"));
		}
	}
	if (existsSync(OPS_DIR)) {
		for (const entry of readdirSync(OPS_DIR, { withFileTypes: true })) {
			if (entry.isFile()) {
				existing.set(`operations/${entry.name}`, readFileSync(join(OPS_DIR, entry.name), "utf8"));
			}
		}
	}
	return existing;
}

function main() {
	const check = process.argv.includes(CHECK_FLAG);
	const wanted = generateAll();
	if (check) {
		const existing = readExisting();
		const problems = [];
		for (const [name, content] of wanted) {
			if (existing.get(name) !== content) {
				problems.push(existsSync(join(OUT_DIR, name)) ? `modified: ${name}` : `missing: ${name}`);
			}
		}
		for (const name of existing.keys()) {
			if (!wanted.has(name)) {
				problems.push(`stale: ${name}`);
			}
		}
		if (problems.length > 0) {
			console.error(`Zod contract drift detected (${problems.length} file(s)):`);
			for (const problem of problems.toSorted(compareStrings)) console.error(`  ${problem}`);
			console.error("Run `pnpm --filter @sure/web contracts:generate` and commit the result.");
			process.exit(1);
		}
		console.log(`Zod contracts in sync (${wanted.size} files).`);
		return;
	}
	mkdirSync(OPS_DIR, { recursive: true });
	for (const entry of readdirSync(OPS_DIR, { withFileTypes: true })) {
		if (entry.isFile() && !wanted.has(`operations/${entry.name}`)) {
			rmSync(join(OPS_DIR, entry.name));
		}
	}
	for (const [name, content] of wanted) {
		writeFileSync(join(OUT_DIR, name), content);
	}
	console.log(`Generated ${wanted.size} Zod contract file(s) in src/lib/api/generated/.`);
}

main();
