/**
 * GENERATED — do not edit by hand. Registry of every OpenAPI operation contract.
 *
 * Source: docs/api/openapi.yaml (sha256: fb4401a6f8bec7280f908403d66dfa23cf2d8d9fa9fe287771d97e859b32657f)
 * Generator: apps/web/scripts/generate-zod-contracts.mjs (version 1)
 * Browser routes should import their operation module directly (tree-shakeable);
 * the server-only BFF transport uses getOperationContract for full-surface lookup.
 * Regenerate with: pnpm --filter @sure/web contracts:generate
 */

import { redactZodIssues } from "../contract";
import type { OperationContract, OperationParsePart, OperationParseResult, RedactedIssue } from "../contract";
import { DeleteApiV1ChatsByIdContract } from "./operations/delete-api-v1-chats-by-id";
import { DeleteApiV1MerchantsByIdContract } from "./operations/delete-api-v1-merchants-by-id";
import { DeleteApiV1PushSubscriptionsByIdContract } from "./operations/delete-api-v1-push-subscriptions-by-id";
import { DeleteApiV1RecurringTransactionsByIdContract } from "./operations/delete-api-v1-recurring-transactions-by-id";
import { DeleteApiV1TagsByIdContract } from "./operations/delete-api-v1-tags-by-id";
import { DeleteApiV1TradesByIdContract } from "./operations/delete-api-v1-trades-by-id";
import { DeleteApiV1TransactionsByIdContract } from "./operations/delete-api-v1-transactions-by-id";
import { DeleteApiV1UsersMeContract } from "./operations/delete-api-v1-users-me";
import { DeleteApiV1UsersResetContract } from "./operations/delete-api-v1-users-reset";
import { GetApiV1AccountsContract } from "./operations/get-api-v1-accounts";
import { GetApiV1AccountsByIdContract } from "./operations/get-api-v1-accounts-by-id";
import { GetApiV1BalanceSheetContract } from "./operations/get-api-v1-balance-sheet";
import { GetApiV1BalancesContract } from "./operations/get-api-v1-balances";
import { GetApiV1BalancesByIdContract } from "./operations/get-api-v1-balances-by-id";
import { GetApiV1BudgetCategoriesContract } from "./operations/get-api-v1-budget-categories";
import { GetApiV1BudgetCategoriesByIdContract } from "./operations/get-api-v1-budget-categories-by-id";
import { GetApiV1BudgetsContract } from "./operations/get-api-v1-budgets";
import { GetApiV1BudgetsByIdContract } from "./operations/get-api-v1-budgets-by-id";
import { GetApiV1CategoriesContract } from "./operations/get-api-v1-categories";
import { GetApiV1CategoriesByIdContract } from "./operations/get-api-v1-categories-by-id";
import { GetApiV1ChatsContract } from "./operations/get-api-v1-chats";
import { GetApiV1ChatsByIdContract } from "./operations/get-api-v1-chats-by-id";
import { GetApiV1FamilyExportsContract } from "./operations/get-api-v1-family-exports";
import { GetApiV1FamilyExportsByIdContract } from "./operations/get-api-v1-family-exports-by-id";
import { GetApiV1FamilyExportsByIdDownloadContract } from "./operations/get-api-v1-family-exports-by-id-download";
import { GetApiV1FamilySettingsContract } from "./operations/get-api-v1-family-settings";
import { GetApiV1HoldingsContract } from "./operations/get-api-v1-holdings";
import { GetApiV1HoldingsByIdContract } from "./operations/get-api-v1-holdings-by-id";
import { GetApiV1ImportSessionsByIdContract } from "./operations/get-api-v1-import-sessions-by-id";
import { GetApiV1ImportsContract } from "./operations/get-api-v1-imports";
import { GetApiV1ImportsByIdContract } from "./operations/get-api-v1-imports-by-id";
import { GetApiV1ImportsByIdRowsContract } from "./operations/get-api-v1-imports-by-id-rows";
import { GetApiV1InsightsContract } from "./operations/get-api-v1-insights";
import { GetApiV1MerchantsContract } from "./operations/get-api-v1-merchants";
import { GetApiV1MerchantsByIdContract } from "./operations/get-api-v1-merchants-by-id";
import { GetApiV1ProviderConnectionsContract } from "./operations/get-api-v1-provider-connections";
import { GetApiV1RecurringTransactionsContract } from "./operations/get-api-v1-recurring-transactions";
import { GetApiV1RecurringTransactionsByIdContract } from "./operations/get-api-v1-recurring-transactions-by-id";
import { GetApiV1RejectedTransfersContract } from "./operations/get-api-v1-rejected-transfers";
import { GetApiV1RejectedTransfersByIdContract } from "./operations/get-api-v1-rejected-transfers-by-id";
import { GetApiV1RuleRunsContract } from "./operations/get-api-v1-rule-runs";
import { GetApiV1RuleRunsByIdContract } from "./operations/get-api-v1-rule-runs-by-id";
import { GetApiV1RulesContract } from "./operations/get-api-v1-rules";
import { GetApiV1RulesByIdContract } from "./operations/get-api-v1-rules-by-id";
import { GetApiV1SecuritiesContract } from "./operations/get-api-v1-securities";
import { GetApiV1SecuritiesByIdContract } from "./operations/get-api-v1-securities-by-id";
import { GetApiV1SecurityPricesContract } from "./operations/get-api-v1-security-prices";
import { GetApiV1SecurityPricesByIdContract } from "./operations/get-api-v1-security-prices-by-id";
import { GetApiV1SyncsContract } from "./operations/get-api-v1-syncs";
import { GetApiV1SyncsByIdContract } from "./operations/get-api-v1-syncs-by-id";
import { GetApiV1SyncsLatestContract } from "./operations/get-api-v1-syncs-latest";
import { GetApiV1TagsContract } from "./operations/get-api-v1-tags";
import { GetApiV1TagsByIdContract } from "./operations/get-api-v1-tags-by-id";
import { GetApiV1TradesContract } from "./operations/get-api-v1-trades";
import { GetApiV1TradesByIdContract } from "./operations/get-api-v1-trades-by-id";
import { GetApiV1TransactionsContract } from "./operations/get-api-v1-transactions";
import { GetApiV1TransactionsByIdContract } from "./operations/get-api-v1-transactions-by-id";
import { GetApiV1TransfersContract } from "./operations/get-api-v1-transfers";
import { GetApiV1TransfersByIdContract } from "./operations/get-api-v1-transfers-by-id";
import { GetApiV1UsersResetStatusContract } from "./operations/get-api-v1-users-reset-status";
import { GetApiV1ValuationsContract } from "./operations/get-api-v1-valuations";
import { GetApiV1ValuationsByIdContract } from "./operations/get-api-v1-valuations-by-id";
import { PatchApiV1AuthEnableAiContract } from "./operations/patch-api-v1-auth-enable-ai";
import { PatchApiV1ChatsByIdContract } from "./operations/patch-api-v1-chats-by-id";
import { PatchApiV1MerchantsByIdContract } from "./operations/patch-api-v1-merchants-by-id";
import { PatchApiV1RecurringTransactionsByIdContract } from "./operations/patch-api-v1-recurring-transactions-by-id";
import { PatchApiV1TagsByIdContract } from "./operations/patch-api-v1-tags-by-id";
import { PatchApiV1TradesByIdContract } from "./operations/patch-api-v1-trades-by-id";
import { PatchApiV1TransactionsByIdContract } from "./operations/patch-api-v1-transactions-by-id";
import { PatchApiV1ValuationsByIdContract } from "./operations/patch-api-v1-valuations-by-id";
import { PostApiV1AccountsContract } from "./operations/post-api-v1-accounts";
import { PostApiV1AuthLoginContract } from "./operations/post-api-v1-auth-login";
import { PostApiV1AuthRefreshContract } from "./operations/post-api-v1-auth-refresh";
import { PostApiV1AuthSignupContract } from "./operations/post-api-v1-auth-signup";
import { PostApiV1AuthSsoCreateAccountContract } from "./operations/post-api-v1-auth-sso-create-account";
import { PostApiV1AuthSsoExchangeContract } from "./operations/post-api-v1-auth-sso-exchange";
import { PostApiV1AuthSsoLinkContract } from "./operations/post-api-v1-auth-sso-link";
import { PostApiV1CategoriesContract } from "./operations/post-api-v1-categories";
import { PostApiV1ChatsContract } from "./operations/post-api-v1-chats";
import { PostApiV1ChatsByChatIdMessagesContract } from "./operations/post-api-v1-chats-by-chat-id-messages";
import { PostApiV1ChatsByChatIdMessagesRetryContract } from "./operations/post-api-v1-chats-by-chat-id-messages-retry";
import { PostApiV1FamilyExportsContract } from "./operations/post-api-v1-family-exports";
import { PostApiV1ImportSessionsContract } from "./operations/post-api-v1-import-sessions";
import { PostApiV1ImportSessionsByIdChunksContract } from "./operations/post-api-v1-import-sessions-by-id-chunks";
import { PostApiV1ImportSessionsByIdPublishContract } from "./operations/post-api-v1-import-sessions-by-id-publish";
import { PostApiV1ImportsContract } from "./operations/post-api-v1-imports";
import { PostApiV1ImportsPreflightContract } from "./operations/post-api-v1-imports-preflight";
import { PostApiV1MerchantsContract } from "./operations/post-api-v1-merchants";
import { PostApiV1MerchantsImportContract } from "./operations/post-api-v1-merchants-import";
import { PostApiV1PushSubscriptionsContract } from "./operations/post-api-v1-push-subscriptions";
import { PostApiV1RecurringTransactionsContract } from "./operations/post-api-v1-recurring-transactions";
import { PostApiV1TagsContract } from "./operations/post-api-v1-tags";
import { PostApiV1TradesContract } from "./operations/post-api-v1-trades";
import { PostApiV1TransactionsContract } from "./operations/post-api-v1-transactions";
import { PostApiV1TransactionsByTransactionIdSplitContract } from "./operations/post-api-v1-transactions-by-transaction-id-split";
import { PostApiV1ValuationsContract } from "./operations/post-api-v1-valuations";
/** Every operation contract, keyed by "METHOD /path". */
export const OPERATION_CONTRACTS: Record<string, OperationContract> = {
	"DELETE /api/v1/chats/{id}": DeleteApiV1ChatsByIdContract,
	"DELETE /api/v1/merchants/{id}": DeleteApiV1MerchantsByIdContract,
	"DELETE /api/v1/push_subscriptions/{id}": DeleteApiV1PushSubscriptionsByIdContract,
	"DELETE /api/v1/recurring_transactions/{id}": DeleteApiV1RecurringTransactionsByIdContract,
	"DELETE /api/v1/tags/{id}": DeleteApiV1TagsByIdContract,
	"DELETE /api/v1/trades/{id}": DeleteApiV1TradesByIdContract,
	"DELETE /api/v1/transactions/{id}": DeleteApiV1TransactionsByIdContract,
	"DELETE /api/v1/users/me": DeleteApiV1UsersMeContract,
	"DELETE /api/v1/users/reset": DeleteApiV1UsersResetContract,
	"GET /api/v1/accounts": GetApiV1AccountsContract,
	"GET /api/v1/accounts/{id}": GetApiV1AccountsByIdContract,
	"GET /api/v1/balance_sheet": GetApiV1BalanceSheetContract,
	"GET /api/v1/balances": GetApiV1BalancesContract,
	"GET /api/v1/balances/{id}": GetApiV1BalancesByIdContract,
	"GET /api/v1/budget_categories": GetApiV1BudgetCategoriesContract,
	"GET /api/v1/budget_categories/{id}": GetApiV1BudgetCategoriesByIdContract,
	"GET /api/v1/budgets": GetApiV1BudgetsContract,
	"GET /api/v1/budgets/{id}": GetApiV1BudgetsByIdContract,
	"GET /api/v1/categories": GetApiV1CategoriesContract,
	"GET /api/v1/categories/{id}": GetApiV1CategoriesByIdContract,
	"GET /api/v1/chats": GetApiV1ChatsContract,
	"GET /api/v1/chats/{id}": GetApiV1ChatsByIdContract,
	"GET /api/v1/family_exports": GetApiV1FamilyExportsContract,
	"GET /api/v1/family_exports/{id}": GetApiV1FamilyExportsByIdContract,
	"GET /api/v1/family_exports/{id}/download": GetApiV1FamilyExportsByIdDownloadContract,
	"GET /api/v1/family_settings": GetApiV1FamilySettingsContract,
	"GET /api/v1/holdings": GetApiV1HoldingsContract,
	"GET /api/v1/holdings/{id}": GetApiV1HoldingsByIdContract,
	"GET /api/v1/import_sessions/{id}": GetApiV1ImportSessionsByIdContract,
	"GET /api/v1/imports": GetApiV1ImportsContract,
	"GET /api/v1/imports/{id}": GetApiV1ImportsByIdContract,
	"GET /api/v1/imports/{id}/rows": GetApiV1ImportsByIdRowsContract,
	"GET /api/v1/insights": GetApiV1InsightsContract,
	"GET /api/v1/merchants": GetApiV1MerchantsContract,
	"GET /api/v1/merchants/{id}": GetApiV1MerchantsByIdContract,
	"GET /api/v1/provider_connections": GetApiV1ProviderConnectionsContract,
	"GET /api/v1/recurring_transactions": GetApiV1RecurringTransactionsContract,
	"GET /api/v1/recurring_transactions/{id}": GetApiV1RecurringTransactionsByIdContract,
	"GET /api/v1/rejected_transfers": GetApiV1RejectedTransfersContract,
	"GET /api/v1/rejected_transfers/{id}": GetApiV1RejectedTransfersByIdContract,
	"GET /api/v1/rule_runs": GetApiV1RuleRunsContract,
	"GET /api/v1/rule_runs/{id}": GetApiV1RuleRunsByIdContract,
	"GET /api/v1/rules": GetApiV1RulesContract,
	"GET /api/v1/rules/{id}": GetApiV1RulesByIdContract,
	"GET /api/v1/securities": GetApiV1SecuritiesContract,
	"GET /api/v1/securities/{id}": GetApiV1SecuritiesByIdContract,
	"GET /api/v1/security_prices": GetApiV1SecurityPricesContract,
	"GET /api/v1/security_prices/{id}": GetApiV1SecurityPricesByIdContract,
	"GET /api/v1/syncs": GetApiV1SyncsContract,
	"GET /api/v1/syncs/{id}": GetApiV1SyncsByIdContract,
	"GET /api/v1/syncs/latest": GetApiV1SyncsLatestContract,
	"GET /api/v1/tags": GetApiV1TagsContract,
	"GET /api/v1/tags/{id}": GetApiV1TagsByIdContract,
	"GET /api/v1/trades": GetApiV1TradesContract,
	"GET /api/v1/trades/{id}": GetApiV1TradesByIdContract,
	"GET /api/v1/transactions": GetApiV1TransactionsContract,
	"GET /api/v1/transactions/{id}": GetApiV1TransactionsByIdContract,
	"GET /api/v1/transfers": GetApiV1TransfersContract,
	"GET /api/v1/transfers/{id}": GetApiV1TransfersByIdContract,
	"GET /api/v1/users/reset/status": GetApiV1UsersResetStatusContract,
	"GET /api/v1/valuations": GetApiV1ValuationsContract,
	"GET /api/v1/valuations/{id}": GetApiV1ValuationsByIdContract,
	"PATCH /api/v1/auth/enable_ai": PatchApiV1AuthEnableAiContract,
	"PATCH /api/v1/chats/{id}": PatchApiV1ChatsByIdContract,
	"PATCH /api/v1/merchants/{id}": PatchApiV1MerchantsByIdContract,
	"PATCH /api/v1/recurring_transactions/{id}": PatchApiV1RecurringTransactionsByIdContract,
	"PATCH /api/v1/tags/{id}": PatchApiV1TagsByIdContract,
	"PATCH /api/v1/trades/{id}": PatchApiV1TradesByIdContract,
	"PATCH /api/v1/transactions/{id}": PatchApiV1TransactionsByIdContract,
	"PATCH /api/v1/valuations/{id}": PatchApiV1ValuationsByIdContract,
	"POST /api/v1/accounts": PostApiV1AccountsContract,
	"POST /api/v1/auth/login": PostApiV1AuthLoginContract,
	"POST /api/v1/auth/refresh": PostApiV1AuthRefreshContract,
	"POST /api/v1/auth/signup": PostApiV1AuthSignupContract,
	"POST /api/v1/auth/sso_create_account": PostApiV1AuthSsoCreateAccountContract,
	"POST /api/v1/auth/sso_exchange": PostApiV1AuthSsoExchangeContract,
	"POST /api/v1/auth/sso_link": PostApiV1AuthSsoLinkContract,
	"POST /api/v1/categories": PostApiV1CategoriesContract,
	"POST /api/v1/chats": PostApiV1ChatsContract,
	"POST /api/v1/chats/{chat_id}/messages": PostApiV1ChatsByChatIdMessagesContract,
	"POST /api/v1/chats/{chat_id}/messages/retry": PostApiV1ChatsByChatIdMessagesRetryContract,
	"POST /api/v1/family_exports": PostApiV1FamilyExportsContract,
	"POST /api/v1/import_sessions": PostApiV1ImportSessionsContract,
	"POST /api/v1/import_sessions/{id}/chunks": PostApiV1ImportSessionsByIdChunksContract,
	"POST /api/v1/import_sessions/{id}/publish": PostApiV1ImportSessionsByIdPublishContract,
	"POST /api/v1/imports": PostApiV1ImportsContract,
	"POST /api/v1/imports/preflight": PostApiV1ImportsPreflightContract,
	"POST /api/v1/merchants": PostApiV1MerchantsContract,
	"POST /api/v1/merchants/import": PostApiV1MerchantsImportContract,
	"POST /api/v1/push_subscriptions": PostApiV1PushSubscriptionsContract,
	"POST /api/v1/recurring_transactions": PostApiV1RecurringTransactionsContract,
	"POST /api/v1/tags": PostApiV1TagsContract,
	"POST /api/v1/trades": PostApiV1TradesContract,
	"POST /api/v1/transactions": PostApiV1TransactionsContract,
	"POST /api/v1/transactions/{transaction_id}/split": PostApiV1TransactionsByTransactionIdSplitContract,
	"POST /api/v1/valuations": PostApiV1ValuationsContract,
};
/** Sorted operation keys ("METHOD /path") covered by this registry. */
export const OPERATION_KEYS: readonly string[] = [
	"DELETE /api/v1/chats/{id}",
	"DELETE /api/v1/merchants/{id}",
	"DELETE /api/v1/push_subscriptions/{id}",
	"DELETE /api/v1/recurring_transactions/{id}",
	"DELETE /api/v1/tags/{id}",
	"DELETE /api/v1/trades/{id}",
	"DELETE /api/v1/transactions/{id}",
	"DELETE /api/v1/users/me",
	"DELETE /api/v1/users/reset",
	"GET /api/v1/accounts",
	"GET /api/v1/accounts/{id}",
	"GET /api/v1/balance_sheet",
	"GET /api/v1/balances",
	"GET /api/v1/balances/{id}",
	"GET /api/v1/budget_categories",
	"GET /api/v1/budget_categories/{id}",
	"GET /api/v1/budgets",
	"GET /api/v1/budgets/{id}",
	"GET /api/v1/categories",
	"GET /api/v1/categories/{id}",
	"GET /api/v1/chats",
	"GET /api/v1/chats/{id}",
	"GET /api/v1/family_exports",
	"GET /api/v1/family_exports/{id}",
	"GET /api/v1/family_exports/{id}/download",
	"GET /api/v1/family_settings",
	"GET /api/v1/holdings",
	"GET /api/v1/holdings/{id}",
	"GET /api/v1/import_sessions/{id}",
	"GET /api/v1/imports",
	"GET /api/v1/imports/{id}",
	"GET /api/v1/imports/{id}/rows",
	"GET /api/v1/insights",
	"GET /api/v1/merchants",
	"GET /api/v1/merchants/{id}",
	"GET /api/v1/provider_connections",
	"GET /api/v1/recurring_transactions",
	"GET /api/v1/recurring_transactions/{id}",
	"GET /api/v1/rejected_transfers",
	"GET /api/v1/rejected_transfers/{id}",
	"GET /api/v1/rule_runs",
	"GET /api/v1/rule_runs/{id}",
	"GET /api/v1/rules",
	"GET /api/v1/rules/{id}",
	"GET /api/v1/securities",
	"GET /api/v1/securities/{id}",
	"GET /api/v1/security_prices",
	"GET /api/v1/security_prices/{id}",
	"GET /api/v1/syncs",
	"GET /api/v1/syncs/{id}",
	"GET /api/v1/syncs/latest",
	"GET /api/v1/tags",
	"GET /api/v1/tags/{id}",
	"GET /api/v1/trades",
	"GET /api/v1/trades/{id}",
	"GET /api/v1/transactions",
	"GET /api/v1/transactions/{id}",
	"GET /api/v1/transfers",
	"GET /api/v1/transfers/{id}",
	"GET /api/v1/users/reset/status",
	"GET /api/v1/valuations",
	"GET /api/v1/valuations/{id}",
	"PATCH /api/v1/auth/enable_ai",
	"PATCH /api/v1/chats/{id}",
	"PATCH /api/v1/merchants/{id}",
	"PATCH /api/v1/recurring_transactions/{id}",
	"PATCH /api/v1/tags/{id}",
	"PATCH /api/v1/trades/{id}",
	"PATCH /api/v1/transactions/{id}",
	"PATCH /api/v1/valuations/{id}",
	"POST /api/v1/accounts",
	"POST /api/v1/auth/login",
	"POST /api/v1/auth/refresh",
	"POST /api/v1/auth/signup",
	"POST /api/v1/auth/sso_create_account",
	"POST /api/v1/auth/sso_exchange",
	"POST /api/v1/auth/sso_link",
	"POST /api/v1/categories",
	"POST /api/v1/chats",
	"POST /api/v1/chats/{chat_id}/messages",
	"POST /api/v1/chats/{chat_id}/messages/retry",
	"POST /api/v1/family_exports",
	"POST /api/v1/import_sessions",
	"POST /api/v1/import_sessions/{id}/chunks",
	"POST /api/v1/import_sessions/{id}/publish",
	"POST /api/v1/imports",
	"POST /api/v1/imports/preflight",
	"POST /api/v1/merchants",
	"POST /api/v1/merchants/import",
	"POST /api/v1/push_subscriptions",
	"POST /api/v1/recurring_transactions",
	"POST /api/v1/tags",
	"POST /api/v1/trades",
	"POST /api/v1/transactions",
	"POST /api/v1/transactions/{transaction_id}/split",
	"POST /api/v1/valuations",
];
/** Look up the contract for a "METHOD /path" pair (BFF request + upstream-response validation). Returns undefined for undocumented operations. */
export function getOperationContract(method: string, path: string): OperationContract | undefined {
	return OPERATION_CONTRACTS[`${method.toUpperCase()} ${path}`];
}
function failure(part: OperationParsePart, issues: readonly RedactedIssue[]): OperationParseResult {
	return { ok: false, part, issues };
}
/** Strictly validate an upstream response body against the operation's documented response for its status. Unknown statuses fail closed. */
export function parseOperationResponse(contract: OperationContract, status: number, data: unknown): OperationParseResult {
	if (contract.isBinaryResponse && data instanceof Blob) {
		return { ok: true, data };
	}
	const parser = contract.successResponses[String(status)];
	if (parser === undefined) {
		return failure("status", [{ path: "$", expected: "documented success status", received: "undocumented" }]);
	}
	const parsed = parser.safeParse(data);
	if (!parsed.success) {
		return failure("response", redactZodIssues(parsed.error));
	}
	return { ok: true, data: parsed.data };
}
/** Strictly validate an outgoing request (params + body) against the operation contract. */
export function parseOperationRequest(
	contract: OperationContract,
	input: { readonly pathParams?: unknown; readonly query?: unknown; readonly headers?: unknown; readonly body?: unknown },
	contentType?: string,
): OperationParseResult {
	const validated: { pathParams?: unknown; query?: unknown; headers?: unknown; body?: unknown } = {};
	const groups: ReadonlyArray<{ readonly part: OperationParsePart; readonly parser: OperationContract["pathParams"]; readonly value: unknown; readonly key: "pathParams" | "query" | "headers" }> = [
		{ part: "pathParams", parser: contract.pathParams, value: input.pathParams, key: "pathParams" },
		{ part: "query", parser: contract.queryParams, value: input.query, key: "query" },
		{ part: "headers", parser: contract.headerParams, value: input.headers, key: "headers" },
	];
	for (const group of groups) {
		if (group.parser === undefined) continue;
		const parsed = group.parser.safeParse(group.value);
		if (!parsed.success) {
			return failure(group.part, redactZodIssues(parsed.error));
		}
		validated[group.key] = parsed.data;
	}
	const bodyParser = contentType !== undefined && contentType.includes("multipart") && contract.requestMultipartBody !== undefined ? contract.requestMultipartBody : contract.requestBody;
	if (bodyParser === undefined) {
		if (input.body !== undefined) {
			return failure("body", [{ path: "$", expected: "no body", received: "object" }]);
		}
		return { ok: true, data: validated };
	}
	const parsed = bodyParser.safeParse(input.body);
	if (!parsed.success) {
		return failure("body", redactZodIssues(parsed.error));
	}
	return { ok: true, data: { ...validated, body: parsed.data } };
}
