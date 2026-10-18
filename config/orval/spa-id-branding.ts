import { readFile, writeFile } from "node:fs/promises";
import { parse } from "@babel/parser";
import { VISITOR_KEYS, type Node } from "@babel/types";

const FIELD_ID_SCHEMAS: Readonly<Record<string, string>> = {
  account_id: "AccountIdSchema",
  account_ids: "AccountIdSchema",
  excluded_account_ids: "AccountIdSchema",
  target_account_id: "AccountIdSchema",
  transfer_account_id: "AccountIdSchema",
  category_id: "CategoryIdSchema",
  category_ids: "CategoryIdSchema",
  merchant_id: "MerchantIdSchema",
  merchant_ids: "MerchantIdSchema",
  tag_id: "TagIdSchema",
  tag_ids: "TagIdSchema",
  entry_id: "EntryIdSchema",
  matched_entry_id: "EntryIdSchema",
  transaction_id: "TransactionIdSchema",
  inflow_transaction_id: "TransactionIdSchema",
  outflow_transaction_id: "TransactionIdSchema",
  external_id: "ExternalIdSchema",
};

const OBJECT_ID_SCHEMAS: Readonly<Record<string, string>> = {
  account: "AccountIdSchema",
  other_account: "AccountIdSchema",
  category: "CategoryIdSchema",
  merchant: "MerchantIdSchema",
  tags: "TagIdSchema",
  transfer: "TransferIdSchema",
  transactions: "TransactionIdSchema",
  inflow_transaction: "TransactionIdSchema",
  outflow_transaction: "TransactionIdSchema",
};

const ROOT_ID_SCHEMAS: Readonly<Record<string, string>> = {
  GetApiV1TransactionsIdParams: "TransactionIdSchema",
  PatchApiV1TransactionsIdParams: "TransactionIdSchema",
  PostApiV1Transactions200Response: "TransactionIdSchema",
  PostApiV1Transactions201Response: "TransactionIdSchema",
  GetApiV1TransactionsId200Response: "TransactionIdSchema",
  PatchApiV1TransactionsId200Response: "TransactionIdSchema",
  PostApiV1TransactionsTransactionIdTransferMatch200Response: "TransferIdSchema",
  PatchApiV1TransfersIdParams: "TransferIdSchema",
};

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "type" in value
    && typeof value.type === "string" && value.type in VISITOR_KEYS;
}

// Orval brands entire DTOs, not nested IDs. Transform its generated schema AST,
// keeping every original validator and applying the shared nominal schema only
// to the scalar ID (inside optional/nullable/array wrappers).
function brandEntityIds(implementation: string): string {
  const source = parse(implementation, { sourceType: "module", plugins: ["typescript"] });
  const edits: Array<{ start: number; end: number; replacement: string }> = [];
  const zodImport = source.program.body.find((node) =>
    node.type === "ImportDeclaration" && node.source.value === "zod/mini");
  if (zodImport?.end === null || zodImport?.end === undefined)
    throw new Error("Generated SPA API is missing its Zod Mini import");
  edits.push({
    start: zodImport.end,
    end: zodImport.end,
    replacement: '\nimport { AccountIdSchema, CategoryIdSchema, EntryIdSchema, ExternalIdSchema, MerchantIdSchema, TagIdSchema, TransactionIdSchema, TransferIdSchema } from "../ids";',
  });

  function visit(node: Node, exportName: string, fields: string[], idSchema?: string): void {
    const currentExportName =
      node.type === "VariableDeclarator" && node.id.type === "Identifier" ? node.id.name : exportName;

    if (node.type === "ObjectProperty") {
      const field = node.key.type === "StringLiteral" ? node.key.value
        : node.key.type === "Identifier" ? node.key.name : undefined;
      if (field === undefined) return;
      const parent = fields.at(-1);
      const schema = FIELD_ID_SCHEMAS[field] ?? (field === "id"
        ? (parent === undefined
          ? ROOT_ID_SCHEMAS[currentExportName]
          : OBJECT_ID_SCHEMAS[parent])
        : undefined);
      visit(node.value, currentExportName, [...fields, field], schema);
      return;
    }

    if (idSchema !== undefined && node.type === "CallExpression" && node.callee.type === "MemberExpression"
      && node.callee.object.type === "Identifier" && node.callee.object.name === "zod"
      && node.callee.property.type === "Identifier"
      && (node.callee.property.name === "uuid" || node.callee.property.name === "string")) {
      if (node.start === null || node.start === undefined || node.end === null || node.end === undefined)
        throw new Error("Generated ID schema has no source range");
      edits.push({
        start: node.start,
        end: node.end,
        replacement: `zod.pipe(${implementation.slice(node.start, node.end)}, ${idSchema})`,
      });
      return;
    }

    for (const key of VISITOR_KEYS[node.type] ?? []) {
      const value: unknown = Reflect.get(node, key);
      if (Array.isArray(value)) {
        for (const child of value) if (isNode(child)) visit(child, currentExportName, fields, idSchema);
      } else if (isNode(value)) visit(value, currentExportName, fields, idSchema);
    }
  }

  visit(source, "", []);
  let result = implementation;
  for (const edit of edits.toSorted((left, right) => right.start - left.start))
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  return result;
}

export default async function brandSpaApiIds(...args: unknown[]): Promise<void> {
  try {
    const paths = args[0];
    if (!Array.isArray(paths) || !paths.every((entry): entry is string => typeof entry === "string"))
      throw new Error("Generated SPA API paths are missing");
    const path = paths.find((entry) => entry.endsWith("app/javascript/spa/api/generated.ts"));
    if (path === undefined) throw new Error("Generated SPA API file is missing");
    const implementation = await readFile(path, "utf8");
    await writeFile(path, brandEntityIds(implementation));
  } catch (error) {
    // Orval logs hook failures without rejecting generation. Keep the command's
    // exit status unsuccessful rather than silently publishing unbranded IDs.
    process.exitCode = 1;
    throw error;
  }
}
