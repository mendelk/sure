/**
 * GENERATED — do not edit by hand.
 *
 * Source: docs/api/openapi.yaml (sha256: d9a13d3511d7165bf6b97a776e4e0e6f520b014e54bf49e2bd14387f42140f7b)
 * Generator: apps/web/scripts/generate-zod-contracts.mjs (version 1)
 * Static types for the same source live in ../openapi.d.ts (openapi-typescript).
 * Regenerate with: pnpm --filter @sure/web contracts:generate
 */

import { z } from "zod";
import type { components } from "../openapi";
export const Account = z.object({
		id: z.string(),
		name: z.string(),
		account_type: z.string().nullable(),
		status: z.string().optional(),
	});
export type Account = z.infer<typeof Account>;
export const AccountDetail = z.object({
		id: z.string(),
		name: z.string(),
		balance: z.string(),
		balance_cents: z.number().int(),
		cash_balance: z.string(),
		cash_balance_cents: z.number().int(),
		currency: z.string(),
		classification: z.string(),
		account_type: z.string().nullable(),
		subtype: z.string().nullable().optional(),
		status: z.enum(["active", "draft", "disabled", "pending_deletion"]),
		institution_name: z.string().nullable().optional(),
		institution_domain: z.string().nullable().optional(),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type AccountDetail = z.infer<typeof AccountDetail>;
export const Pagination = z.object({
		page: z.number().int().min(1),
		per_page: z.number().int().min(1),
		total_count: z.number().int().min(0),
		total_pages: z.number().int().min(0),
	});
export type Pagination = z.infer<typeof Pagination>;
export const AccountCollection = z.object({
		accounts: z.array(AccountDetail),
		pagination: Pagination,
	});
export type AccountCollection = z.infer<typeof AccountCollection>;
export const AccountableCreateDetails = z.object({
		tax_treatment: z.enum(["taxable", "tax_deferred", "tax_exempt"]).optional(),
		year_built: z.number().int().optional(),
		area_unit: z.string().optional(),
		area_value: z.number().int().optional(),
		make: z.string().optional(),
		model: z.string().optional(),
		year: z.number().int().optional(),
		mileage_value: z.number().int().optional(),
		mileage_unit: z.string().optional(),
		available_credit: z.number().optional(),
		minimum_payment: z.number().optional(),
		apr: z.number().optional(),
		annual_fee: z.number().optional(),
		expiration_date: z.string().optional(),
		rate_type: z.string().optional(),
		interest_rate: z.number().optional(),
		term_months: z.number().int().optional(),
		initial_balance: z.number().optional(),
		address: z.object({
		line1: z.string().optional(),
		line2: z.string().optional(),
		locality: z.string().optional(),
		region: z.string().optional(),
		country: z.string().optional(),
		postal_code: z.string().optional(),
		county: z.string().optional(),
	}).optional(),
	});
export type AccountableCreateDetails = z.infer<typeof AccountableCreateDetails>;
export const AccountCreateRequest = z.object({
		account: z.object({
		name: z.string(),
		balance: z.number(),
		currency: z.string().optional(),
		account_type: z.enum(["depository", "investment", "crypto", "property", "vehicle", "other_asset", "credit_card", "loan", "other_liability"]),
		subtype: z.string().nullable().optional(),
		opening_balance_date: z.string().nullable().optional(),
		institution_name: z.string().nullable().optional(),
		institution_domain: z.string().nullable().optional(),
		notes: z.string().nullable().optional(),
		exclude_from_reports: z.boolean().optional(),
		enable_category_matcher: z.boolean().optional(),
		accountable: AccountableCreateDetails.optional(),
	}),
	});
export type AccountCreateRequest = z.infer<typeof AccountCreateRequest>;
export const BalanceAccount = z.object({
		id: z.string(),
		name: z.string(),
		account_type: z.string().nullable(),
	});
export type BalanceAccount = z.infer<typeof BalanceAccount>;
export const Balance = z.object({
		id: z.string(),
		date: z.string(),
		currency: z.string(),
		flows_factor: z.number(),
		balance: z.string(),
		balance_cents: z.number().int(),
		cash_balance: z.string().nullable().optional(),
		cash_balance_cents: z.number().int().nullable().optional(),
		start_cash_balance: z.string().optional(),
		start_cash_balance_cents: z.number().int().optional(),
		start_non_cash_balance: z.string().optional(),
		start_non_cash_balance_cents: z.number().int().optional(),
		start_balance: z.string(),
		start_balance_cents: z.number().int(),
		cash_inflows: z.string().optional(),
		cash_inflows_cents: z.number().int().optional(),
		cash_outflows: z.string().optional(),
		cash_outflows_cents: z.number().int().optional(),
		non_cash_inflows: z.string().optional(),
		non_cash_inflows_cents: z.number().int().optional(),
		non_cash_outflows: z.string().optional(),
		non_cash_outflows_cents: z.number().int().optional(),
		net_market_flows: z.string().optional(),
		net_market_flows_cents: z.number().int().optional(),
		cash_adjustments: z.string().optional(),
		cash_adjustments_cents: z.number().int().optional(),
		non_cash_adjustments: z.string().optional(),
		non_cash_adjustments_cents: z.number().int().optional(),
		end_cash_balance: z.string().optional(),
		end_cash_balance_cents: z.number().int().optional(),
		end_non_cash_balance: z.string().optional(),
		end_non_cash_balance_cents: z.number().int().optional(),
		end_balance: z.string(),
		end_balance_cents: z.number().int(),
		account: BalanceAccount,
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type Balance = z.infer<typeof Balance>;
export const BalanceCollection = z.object({
		balances: z.array(Balance),
		pagination: Pagination,
	});
export type BalanceCollection = z.infer<typeof BalanceCollection>;
export const Money = z.object({
		amount: z.string(),
		currency: z.string(),
		formatted: z.string(),
	});
export type Money = z.infer<typeof Money>;
export const BalanceSheet = z.object({
		currency: z.string(),
		net_worth: Money,
		assets: Money,
		liabilities: Money,
	});
export type BalanceSheet = z.infer<typeof BalanceSheet>;
export const Budget = z.object({
		id: z.string(),
		start_date: z.string(),
		end_date: z.string(),
		name: z.string(),
		currency: z.string(),
		initialized: z.boolean(),
		current: z.boolean(),
		budgeted_spending: z.string().nullable().optional(),
		budgeted_spending_cents: z.number().int().nullable().optional(),
		expected_income: z.string().nullable().optional(),
		expected_income_cents: z.number().int().nullable().optional(),
		allocated_spending: z.string().optional(),
		allocated_spending_cents: z.number().int().optional(),
		actual_spending: z.string().optional(),
		actual_spending_cents: z.number().int().optional(),
		actual_income: z.string().optional(),
		actual_income_cents: z.number().int().optional(),
		available_to_spend: z.string().optional(),
		available_to_spend_cents: z.number().int().optional(),
		available_to_allocate: z.string().optional(),
		available_to_allocate_cents: z.number().int().optional(),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type Budget = z.infer<typeof Budget>;
export const BudgetCategory = z.object({
		id: z.string(),
		budget_id: z.string(),
		currency: z.string(),
		subcategory: z.boolean(),
		inherits_parent_budget: z.boolean(),
		rollover_enabled: z.boolean(),
		budgeted_spending: z.string().optional(),
		budgeted_spending_cents: z.number().int().optional(),
		display_budgeted_spending: z.string().optional(),
		display_budgeted_spending_cents: z.number().int().optional(),
		actual_spending: z.string().optional(),
		actual_spending_cents: z.number().int().optional(),
		rolled_over_amount: z.string().optional(),
		rolled_over_amount_cents: z.number().int().optional(),
		available_to_spend: z.string().optional(),
		available_to_spend_cents: z.number().int().optional(),
		category: z.object({
		id: z.string(),
		name: z.string(),
		color: z.string(),
		lucide_icon: z.string(),
		parent_id: z.string().nullable().optional(),
	}),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type BudgetCategory = z.infer<typeof BudgetCategory>;
export const BudgetCategorySummary = z.object({
		id: z.string(),
		budget_id: z.string(),
		currency: z.string(),
		subcategory: z.boolean(),
		inherits_parent_budget: z.boolean(),
		rollover_enabled: z.boolean(),
		budgeted_spending: z.string().optional(),
		budgeted_spending_cents: z.number().int().optional(),
		display_budgeted_spending: z.string().optional(),
		display_budgeted_spending_cents: z.number().int().optional(),
		category: z.object({
		id: z.string(),
		name: z.string(),
		color: z.string(),
		lucide_icon: z.string(),
		parent_id: z.string().nullable().optional(),
	}),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type BudgetCategorySummary = z.infer<typeof BudgetCategorySummary>;
export const BudgetCategoryCollection = z.object({
		budget_categories: z.array(BudgetCategorySummary),
		pagination: Pagination,
	});
export type BudgetCategoryCollection = z.infer<typeof BudgetCategoryCollection>;
export const BudgetSummary = z.object({
		id: z.string(),
		start_date: z.string(),
		end_date: z.string(),
		name: z.string(),
		currency: z.string(),
		initialized: z.boolean(),
		current: z.boolean(),
		budgeted_spending: z.string().nullable().optional(),
		budgeted_spending_cents: z.number().int().nullable().optional(),
		expected_income: z.string().nullable().optional(),
		expected_income_cents: z.number().int().nullable().optional(),
		allocated_spending: z.string().optional(),
		allocated_spending_cents: z.number().int().optional(),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type BudgetSummary = z.infer<typeof BudgetSummary>;
export const BudgetCollection = z.object({
		budgets: z.array(BudgetSummary),
		pagination: Pagination,
	});
export type BudgetCollection = z.infer<typeof BudgetCollection>;
export const Category = z.object({
		id: z.string(),
		name: z.string(),
		color: z.string(),
		icon: z.string(),
	});
export type Category = z.infer<typeof Category>;
export const CategoryParent = z.object({
		id: z.string(),
		name: z.string(),
	});
export type CategoryParent = z.infer<typeof CategoryParent>;
export const CategoryDetail = z.object({
		id: z.string(),
		name: z.string(),
		color: z.string(),
		icon: z.string(),
		parent: CategoryParent.nullable().optional(),
		subcategories_count: z.number().int().min(0),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type CategoryDetail = z.infer<typeof CategoryDetail>;
export const CategoryCollection = z.object({
		categories: z.array(CategoryDetail),
		pagination: Pagination,
	});
export type CategoryCollection = z.infer<typeof CategoryCollection>;
export const CategoryCreateRequest = z.object({
		category: z.object({
		name: z.string(),
		color: z.string().optional(),
		icon: z.string().optional(),
		parent_id: z.string().nullable().optional(),
	}),
	});
export type CategoryCreateRequest = z.infer<typeof CategoryCreateRequest>;
export const ChatResource = z.object({
		id: z.string(),
		title: z.string(),
		error: z.string().nullable().optional(),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type ChatResource = z.infer<typeof ChatResource>;
export const ChatSummary = (ChatResource).and(z.object({
		message_count: z.number().int().min(0),
		last_message_at: z.iso.datetime().nullable().optional(),
	}));
export type ChatSummary = z.infer<typeof ChatSummary>;
export const ChatCollection = z.object({
		chats: z.array(ChatSummary),
		pagination: Pagination,
	});
export type ChatCollection = z.infer<typeof ChatCollection>;
export const ToolCall = z.object({
		id: z.string(),
		function_name: z.string(),
		function_arguments: z.record(z.string(), z.unknown()),
		function_result: z.record(z.string(), z.unknown()).nullable().optional(),
		created_at: z.iso.datetime(),
	});
export type ToolCall = z.infer<typeof ToolCall>;
export const Message = z.object({
		id: z.string(),
		type: z.enum(["user_message", "assistant_message"]),
		role: z.enum(["user", "assistant"]),
		content: z.string(),
		model: z.string().nullable().optional(),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
		tool_calls: z.array(ToolCall).nullable().optional(),
	});
export type Message = z.infer<typeof Message>;
export const ChatDetail = (ChatResource).and(z.object({
		messages: z.array(Message),
		pagination: Pagination.nullable().optional(),
	}));
export type ChatDetail = z.infer<typeof ChatDetail>;
export const DeleteResponse = z.object({
		message: z.string(),
	});
export type DeleteResponse = z.infer<typeof DeleteResponse>;
export const ErrorResponse = z.object({
		error: z.string(),
		message: z.string().nullable().optional(),
		details: z.union([z.array(z.string()), z.object({})]).nullable().optional(),
		errors: z.array(z.string()).nullable().optional(),
	});
export type ErrorResponse = z.infer<typeof ErrorResponse>;
export const ErrorResponseWithImportId = z.object({
		error: z.string(),
		message: z.string().nullable().optional(),
		import_id: z.string(),
	});
export type ErrorResponseWithImportId = z.infer<typeof ErrorResponseWithImportId>;
export const FamilyExportFile = z.object({
		attached: z.boolean(),
		byte_size: z.number().int().min(0).nullable().optional(),
		content_type: z.string().nullable().optional(),
	});
export type FamilyExportFile = z.infer<typeof FamilyExportFile>;
export const FamilyExport = z.object({
		id: z.string(),
		status: z.enum(["pending", "processing", "completed", "failed"]),
		filename: z.string(),
		downloadable: z.boolean(),
		download_path: z.string().nullable().optional(),
		file: FamilyExportFile,
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type FamilyExport = z.infer<typeof FamilyExport>;
export const FamilyExportCollection = z.object({
		data: z.array(FamilyExport).max(100),
		meta: Pagination,
	});
export type FamilyExportCollection = z.infer<typeof FamilyExportCollection>;
export const FamilyExportResponse = z.object({
		data: FamilyExport,
	});
export type FamilyExportResponse = z.infer<typeof FamilyExportResponse>;
export const FamilySettings = z.object({
		id: z.string(),
		name: z.string().nullable().optional(),
		currency: z.string(),
		locale: z.string(),
		date_format: z.string(),
		country: z.string().nullable().optional(),
		timezone: z.string().nullable().optional(),
		month_start_day: z.number().int().min(1).max(28),
		moniker: z.enum(["Family", "Group"]),
		default_account_sharing: z.enum(["shared", "private"]),
		custom_enabled_currencies: z.boolean(),
		enabled_currencies: z.array(z.string()),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type FamilySettings = z.infer<typeof FamilySettings>;
export const Holding = z.object({
		id: z.string(),
		date: z.string(),
		qty: z.string(),
		price: z.string(),
		amount: z.string(),
		currency: z.string(),
		cost_basis_source: z.string().nullable().optional(),
		account: Account,
		security: z.object({
		id: z.string(),
		ticker: z.string(),
		name: z.string().nullable(),
	}),
		avg_cost: z.string().nullable().optional(),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type Holding = z.infer<typeof Holding>;
export const HoldingCollection = z.object({
		holdings: z.array(Holding),
		pagination: Pagination,
	});
export type HoldingCollection = z.infer<typeof HoldingCollection>;
export const ImportStatusSummary = z.object({
		uploaded: z.boolean(),
		configured: z.boolean(),
		terminal: z.boolean(),
	});
export type ImportStatusSummary = z.infer<typeof ImportStatusSummary>;
export const ImportSummary = z.object({
		id: z.string(),
		type: z.enum(["TransactionImport", "TradeImport", "AccountImport", "MintImport", "ActualImport", "YnabImport", "CategoryImport", "RuleImport", "MerchantImport", "PdfImport", "QifImport", "SureImport"]),
		status: z.enum(["pending", "complete", "importing", "reverting", "revert_failed", "failed"]),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
		account_id: z.string().nullable().optional(),
		rows_count: z.number().int().min(0).optional(),
		error: z.string().nullable().optional(),
		status_detail: ImportStatusSummary,
	});
export type ImportSummary = z.infer<typeof ImportSummary>;
export const ImportCollection = z.object({
		data: z.array(ImportSummary),
		meta: z.object({
		current_page: z.number().int().min(1),
		next_page: z.number().int().nullable().optional(),
		prev_page: z.number().int().nullable().optional(),
		total_pages: z.number().int().min(0),
		total_count: z.number().int().min(0),
		per_page: z.number().int().min(1),
	}),
	});
export type ImportCollection = z.infer<typeof ImportCollection>;
export const ImportConfiguration = z.object({
		date_col_label: z.string().nullable().optional(),
		amount_col_label: z.string().nullable().optional(),
		name_col_label: z.string().nullable().optional(),
		category_col_label: z.string().nullable().optional(),
		tags_col_label: z.string().nullable().optional(),
		notes_col_label: z.string().nullable().optional(),
		account_col_label: z.string().nullable().optional(),
		date_format: z.string().nullable().optional(),
		number_format: z.string().nullable().optional(),
		signage_convention: z.string().nullable().optional(),
	});
export type ImportConfiguration = z.infer<typeof ImportConfiguration>;
export const ImportStats = z.object({
		rows_count: z.number().int().min(0),
		valid_rows_count: z.number().int().min(0),
		invalid_rows_count: z.number().int().min(0),
		mappings_count: z.number().int().min(0),
		unassigned_mappings_count: z.number().int().min(0),
	});
export type ImportStats = z.infer<typeof ImportStats>;
export const ImportStatusDetail = (ImportStatusSummary).and(z.object({
		cleaned: z.boolean(),
		publishable: z.boolean(),
		revertable: z.boolean(),
	}));
export type ImportStatusDetail = z.infer<typeof ImportStatusDetail>;
export const ImportVerificationReadback = z.object({
		status: z.enum(["not_verified", "matched", "mismatch", "failed", "reverted"]).optional(),
		checked_at: z.iso.datetime().nullable().optional(),
		expected_record_counts: z.record(z.string(), z.number().int()).optional(),
		before_counts: z.record(z.string(), z.number().int()).optional(),
		after_counts: z.record(z.string(), z.number().int()).optional(),
		actual_delta_counts: z.record(z.string(), z.number().int()).optional(),
		checked_counts: z.record(z.string(), z.number().int()).optional(),
		mismatches: z.record(z.string(), z.object({
		expected: z.number().int(),
		actual: z.number().int(),
	})).optional(),
		error: z.string().nullable().optional(),
	});
export type ImportVerificationReadback = z.infer<typeof ImportVerificationReadback>;
export const ImportVerification = z.object({
		expected_record_counts: z.record(z.string(), z.number().int()),
		readback: ImportVerificationReadback,
	});
export type ImportVerification = z.infer<typeof ImportVerification>;
export const ImportDetail = z.object({
		id: z.string(),
		type: z.enum(["TransactionImport", "TradeImport", "AccountImport", "MintImport", "ActualImport", "YnabImport", "CategoryImport", "RuleImport", "MerchantImport", "PdfImport", "QifImport", "SureImport"]),
		status: z.enum(["pending", "complete", "importing", "reverting", "revert_failed", "failed"]),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
		account_id: z.string().nullable().optional(),
		error: z.string().nullable().optional(),
		status_detail: ImportStatusDetail,
		configuration: ImportConfiguration,
		stats: ImportStats,
		verification: ImportVerification.optional(),
	});
export type ImportDetail = z.infer<typeof ImportDetail>;
export const ImportPreflightContent = z.object({
		filename: z.string(),
		content_type: z.string(),
		byte_size: z.number().int().min(0),
	});
export type ImportPreflightContent = z.infer<typeof ImportPreflightContent>;
export const ImportPreflightError = z.object({
		code: z.string(),
		message: z.string(),
	});
export type ImportPreflightError = z.infer<typeof ImportPreflightError>;
export const ImportPreflightStats = z.object({
		rows_count: z.number().int().min(0),
		valid_rows_count: z.number().int().min(0).optional(),
		invalid_rows_count: z.number().int().min(0).optional(),
		entity_counts: z.record(z.string(), z.number().int()).nullable().optional(),
		record_type_counts: z.record(z.string(), z.number().int()).nullable().optional(),
	});
export type ImportPreflightStats = z.infer<typeof ImportPreflightStats>;
export const ImportPreflight = z.object({
		type: z.enum(["TransactionImport", "TradeImport", "AccountImport", "MintImport", "ActualImport", "YnabImport", "CategoryImport", "RuleImport", "MerchantImport", "PdfImport", "QifImport", "SureImport"]),
		valid: z.boolean(),
		content: ImportPreflightContent,
		stats: ImportPreflightStats,
		headers: z.array(z.string()).nullable().optional(),
		required_headers: z.array(z.string()).nullable().optional(),
		missing_required_headers: z.array(z.string()).nullable().optional(),
		errors: z.array(ImportPreflightError),
		warnings: z.array(z.string()),
	});
export type ImportPreflight = z.infer<typeof ImportPreflight>;
export const ImportPreflightResponse = z.object({
		data: ImportPreflight,
	});
export type ImportPreflightResponse = z.infer<typeof ImportPreflightResponse>;
export const ImportResponse = z.object({
		data: ImportDetail,
	});
export type ImportResponse = z.infer<typeof ImportResponse>;
export const ImportRowMapping = z.object({
		key: z.string().nullable(),
		type: z.string(),
		value: z.string().nullable(),
		create_when_empty: z.boolean(),
		creatable: z.boolean(),
		mappable: z.object({
		id: z.string().optional(),
		type: z.string().optional(),
		name: z.string().nullable().optional(),
	}).nullable(),
	});
export type ImportRowMapping = z.infer<typeof ImportRowMapping>;
export const ImportRowDiagnostic = z.object({
		id: z.string(),
		row_number: z.number().int().min(1),
		valid: z.boolean(),
		errors: z.array(z.string()),
		fields: z.object({
		account: z.string().nullable().optional(),
		date: z.string().nullable().optional(),
		qty: z.string().nullable().optional(),
		ticker: z.string().nullable().optional(),
		exchange_operating_mic: z.string().nullable().optional(),
		price: z.string().nullable().optional(),
		amount: z.string().nullable().optional(),
		currency: z.string().nullable().optional(),
		name: z.string().nullable().optional(),
		category: z.string().nullable().optional(),
		tags: z.string().nullable().optional(),
		entity_type: z.string().nullable().optional(),
		notes: z.string().nullable().optional(),
		active: z.boolean().nullable().optional(),
		effective_date: z.string().nullable().optional(),
		conditions: z.string().nullable().optional(),
		actions: z.string().nullable().optional(),
	}),
		mappings: z.object({
		account: ImportRowMapping.optional(),
		category: ImportRowMapping.optional(),
		account_type: ImportRowMapping.optional(),
		tags: z.array(ImportRowMapping).optional(),
	}),
	});
export type ImportRowDiagnostic = z.infer<typeof ImportRowDiagnostic>;
export const ImportRowDiagnosticCollection = z.object({
		data: z.array(ImportRowDiagnostic),
		meta: z.object({
		current_page: z.number().int().min(1),
		next_page: z.number().int().nullable().optional(),
		prev_page: z.number().int().nullable().optional(),
		total_pages: z.number().int().min(0),
		total_count: z.number().int().min(0),
		per_page: z.number().int().min(1),
	}),
	});
export type ImportRowDiagnosticCollection = z.infer<typeof ImportRowDiagnosticCollection>;
export const ImportSessionChunk = z.object({
		id: z.string(),
		sequence: z.number().int().min(1),
		client_chunk_id: z.string().nullable().optional(),
		status: z.enum(["pending", "importing", "complete", "failed"]),
		rows_count: z.number().int().min(0),
		summary: z.record(z.string(), z.record(z.string(), z.number().int())),
		error: z.record(z.string(), z.unknown()).nullable().optional(),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type ImportSessionChunk = z.infer<typeof ImportSessionChunk>;
export const ImportSession = z.object({
		id: z.string(),
		type: z.enum(["SureImport"]),
		status: z.enum(["pending", "importing", "complete", "failed"]),
		client_session_id: z.string().nullable().optional(),
		expected_chunks: z.number().int().min(1).nullable().optional(),
		chunks_count: z.number().int().min(0),
		summary: z.record(z.string(), z.record(z.string(), z.number().int())),
		error: z.record(z.string(), z.unknown()).nullable().optional(),
		chunks: z.array(ImportSessionChunk),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type ImportSession = z.infer<typeof ImportSession>;
export const ImportSessionResponse = z.object({
		data: ImportSession,
	});
export type ImportSessionResponse = z.infer<typeof ImportSessionResponse>;
export const Insight = z.object({
		id: z.string(),
		type: z.string(),
		title: z.string(),
		body: z.string(),
		priority: z.enum(["high", "medium", "low"]),
		status: z.enum(["active", "read"]),
		generated_at: z.iso.datetime().nullable().optional(),
	});
export type Insight = z.infer<typeof Insight>;
export const InsightCollection = z.object({
		insights: z.array(Insight),
	});
export type InsightCollection = z.infer<typeof InsightCollection>;
export const Merchant = z.object({
		id: z.string(),
		name: z.string(),
		website_url: z.string().nullable().optional(),
		logo_url: z.string().nullable().optional(),
	});
export type Merchant = z.infer<typeof Merchant>;
export const MerchantDetail = z.object({
		id: z.string(),
		name: z.string(),
		type: z.enum(["FamilyMerchant", "ProviderMerchant"]),
		color: z.string().nullable().optional(),
		website_url: z.string().nullable().optional(),
		logo_url: z.string().nullable().optional(),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type MerchantDetail = z.infer<typeof MerchantDetail>;
export const MerchantImportResult = z.object({
		imported: z.number().int(),
		skipped: z.number().int(),
		merchants: z.array(MerchantDetail),
	});
export type MerchantImportResult = z.infer<typeof MerchantImportResult>;
export const MerchantRequest = z.object({
		merchant: z.object({
		name: z.string().optional(),
		color: z.string().optional(),
		website_url: z.string().nullable().optional(),
		logo_url: z.string().nullable().optional(),
	}),
	});
export type MerchantRequest = z.infer<typeof MerchantRequest>;
export const MessageResponse = (Message).and(z.object({
		chat_id: z.string(),
		ai_response_status: z.enum(["pending", "complete", "failed"]).nullable().optional(),
		ai_response_message: z.string().nullable().optional(),
	}));
export type MessageResponse = z.infer<typeof MessageResponse>;
export const MfaRequiredResponse = z.object({
		error: z.string(),
		mfa_required: z.boolean(),
	});
export type MfaRequiredResponse = z.infer<typeof MfaRequiredResponse>;
export const ProviderConnectionAccounts = z.object({
		total_count: z.number().int().min(0),
		linked_count: z.number().int().min(0),
		unlinked_count: z.number().int().min(0),
	});
export type ProviderConnectionAccounts = z.infer<typeof ProviderConnectionAccounts>;
export const ProviderConnectionInstitution = z.object({
		name: z.string().nullable(),
		domain: z.string().nullable().optional(),
		url: z.string().nullable().optional(),
	});
export type ProviderConnectionInstitution = z.infer<typeof ProviderConnectionInstitution>;
export const ProviderConnectionSyncLatest = z.object({
		id: z.string(),
		status: z.string(),
		created_at: z.iso.datetime(),
		syncing_at: z.iso.datetime().nullable().optional(),
		completed_at: z.iso.datetime().nullable().optional(),
		failed_at: z.iso.datetime().nullable().optional(),
		error: z.object({
		present: z.boolean(),
		message: z.string().nullable().optional(),
	}).nullable().optional(),
	});
export type ProviderConnectionSyncLatest = z.infer<typeof ProviderConnectionSyncLatest>;
export const ProviderConnectionSync = z.object({
		syncing: z.boolean(),
		status_summary: z.string().nullable().optional(),
		last_synced_at: z.iso.datetime().nullable().optional(),
		latest: ProviderConnectionSyncLatest.nullable().optional(),
	});
export type ProviderConnectionSync = z.infer<typeof ProviderConnectionSync>;
export const ProviderConnection = z.object({
		id: z.string(),
		provider: z.string(),
		provider_type: z.string(),
		name: z.string(),
		status: z.string().nullable(),
		requires_update: z.boolean().nullable(),
		credentials_configured: z.boolean().nullable(),
		scheduled_for_deletion: z.boolean().nullable(),
		pending_account_setup: z.boolean().nullable(),
		institution: ProviderConnectionInstitution,
		accounts: ProviderConnectionAccounts,
		sync: ProviderConnectionSync,
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type ProviderConnection = z.infer<typeof ProviderConnection>;
export const ProviderConnectionCollection = z.object({
		data: z.array(ProviderConnection),
	});
export type ProviderConnectionCollection = z.infer<typeof ProviderConnectionCollection>;
export const PushSubscription = z.object({
		id: z.string(),
		environment: z.enum(["sandbox", "production"]),
		platform: z.enum(["ios"]),
		last_registered_at: z.iso.datetime(),
	});
export type PushSubscription = z.infer<typeof PushSubscription>;
export const RecurringTransaction = z.object({
		id: z.string(),
		amount: z.string(),
		amount_cents: z.number().int(),
		currency: z.string(),
		expected_day_of_month: z.number().int().min(1).max(31),
		last_occurrence_date: z.string(),
		next_expected_date: z.string(),
		status: z.enum(["active", "inactive"]),
		occurrence_count: z.number().int().min(0),
		name: z.string().nullable().optional(),
		manual: z.boolean(),
		expected_amount_min: z.string().nullable().optional(),
		expected_amount_min_cents: z.number().int().nullable().optional(),
		expected_amount_max: z.string().nullable().optional(),
		expected_amount_max_cents: z.number().int().nullable().optional(),
		expected_amount_avg: z.string().nullable().optional(),
		expected_amount_avg_cents: z.number().int().nullable().optional(),
		account: Account.nullable().optional(),
		merchant: Merchant.nullable().optional(),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type RecurringTransaction = z.infer<typeof RecurringTransaction>;
export const RecurringTransactionCollection = z.object({
		recurring_transactions: z.array(RecurringTransaction),
		pagination: Pagination,
	});
export type RecurringTransactionCollection = z.infer<typeof RecurringTransactionCollection>;
export const TransferTransactionSide = z.object({
		id: z.string(),
		entry_id: z.string(),
		date: z.string(),
		amount: z.string(),
		amount_cents: z.number().int(),
		currency: z.string(),
		name: z.string(),
		kind: z.string(),
		account: z.object({
		id: z.string(),
		name: z.string(),
		account_type: z.string().nullable(),
	}),
	});
export type TransferTransactionSide = z.infer<typeof TransferTransactionSide>;
export const RejectedTransfer = z.object({
		id: z.string(),
		inflow_transaction: TransferTransactionSide,
		outflow_transaction: TransferTransactionSide,
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type RejectedTransfer = z.infer<typeof RejectedTransfer>;
export const RejectedTransferCollection = z.object({
		rejected_transfers: z.array(RejectedTransfer),
		pagination: Pagination,
	});
export type RejectedTransferCollection = z.infer<typeof RejectedTransferCollection>;
export const ResetInitiatedResponse = z.object({
		message: z.string(),
		status: z.enum(["queued"]),
		job_id: z.string(),
		family_id: z.string(),
		status_url: z.string(),
	});
export type ResetInitiatedResponse = z.infer<typeof ResetInitiatedResponse>;
export const ResetStatusResponse = z.object({
		status: z.enum(["complete", "data_remaining"]),
		family_id: z.string(),
		reset_complete: z.boolean(),
		counts: z.object({
		account_statements: z.number().int().min(0),
		family_exports: z.number().int().min(0),
		imports: z.number().int().min(0),
		import_sessions: z.number().int().min(0),
		import_source_mappings: z.number().int().min(0),
		import_rows: z.number().int().min(0),
		import_mappings: z.number().int().min(0),
		accounts: z.number().int().min(0),
		account_shares: z.number().int().min(0),
		account_providers: z.number().int().min(0),
		entries: z.number().int().min(0),
		transactions: z.number().int().min(0),
		transfers: z.number().int().min(0),
		rejected_transfers: z.number().int().min(0),
		valuations: z.number().int().min(0),
		trades: z.number().int().min(0),
		holdings: z.number().int().min(0),
		balances: z.number().int().min(0),
		recurring_transactions: z.number().int().min(0),
		rules: z.number().int().min(0),
		rule_actions: z.number().int().min(0),
		rule_conditions: z.number().int().min(0),
		rule_runs: z.number().int().min(0),
		budgets: z.number().int().min(0),
		budget_categories: z.number().int().min(0),
		categories: z.number().int().min(0),
		tags: z.number().int().min(0),
		taggings: z.number().int().min(0),
		merchants: z.number().int().min(0),
		family_merchant_associations: z.number().int().min(0),
		provider_items: z.number().int().min(0),
		active_storage_attachments: z.number().int().min(0),
		plaid_items: z.number().int().min(0),
	}).catchall(z.number().int().min(0)),
	});
export type ResetStatusResponse = z.infer<typeof ResetStatusResponse>;
export const RetryResponse = z.object({
		message: z.string(),
		message_id: z.string(),
	});
export type RetryResponse = z.infer<typeof RetryResponse>;
export const RuleAction = z.object({
		id: z.string(),
		action_type: z.string(),
		value: z.string().nullable().optional(),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type RuleAction = z.infer<typeof RuleAction>;
export const RuleCondition: z.ZodType = z.object({
		id: z.string(),
		condition_type: z.string(),
		operator: z.string(),
		value: z.string().nullable().optional(),
		sub_conditions: z.array(z.lazy((): z.ZodType => RuleCondition)),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type RuleCondition = components["schemas"]["RuleCondition"];
export const Rule = z.object({
		id: z.string(),
		name: z.string().nullable().optional(),
		resource_type: z.enum(["transaction"]),
		active: z.boolean(),
		effective_date: z.string().nullable().optional(),
		conditions: z.array(RuleCondition),
		actions: z.array(RuleAction),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type Rule = z.infer<typeof Rule>;
export const RuleCollection = z.object({
		data: z.array(Rule),
		meta: z.object({
		current_page: z.number().int(),
		next_page: z.number().int().nullable().optional(),
		prev_page: z.number().int().nullable().optional(),
		total_pages: z.number().int(),
		total_count: z.number().int(),
		per_page: z.number().int(),
	}),
	});
export type RuleCollection = z.infer<typeof RuleCollection>;
export const RuleResponse = z.object({
		data: Rule,
	});
export type RuleResponse = z.infer<typeof RuleResponse>;
export const RuleRun = z.object({
		id: z.string(),
		rule_id: z.string(),
		rule_name: z.string().nullable(),
		execution_type: z.enum(["manual", "scheduled"]),
		status: z.enum(["pending", "success", "failed"]),
		transactions_queued: z.number().int().min(0),
		transactions_processed: z.number().int().min(0),
		transactions_modified: z.number().int().min(0),
		pending_jobs_count: z.number().int().min(0),
		executed_at: z.iso.datetime(),
		error_message: z.string().nullable().optional(),
		rule: z.object({
		id: z.string(),
		name: z.string().nullable().optional(),
		resource_type: z.string(),
		active: z.boolean(),
	}).nullable(),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type RuleRun = z.infer<typeof RuleRun>;
export const RuleRunCollection = z.object({
		data: z.array(RuleRun),
		meta: z.object({
		current_page: z.number().int(),
		next_page: z.number().int().nullable().optional(),
		prev_page: z.number().int().nullable().optional(),
		total_pages: z.number().int(),
		total_count: z.number().int(),
		per_page: z.number().int(),
	}),
	});
export type RuleRunCollection = z.infer<typeof RuleRunCollection>;
export const RuleRunResponse = z.object({
		data: RuleRun,
	});
export type RuleRunResponse = z.infer<typeof RuleRunResponse>;
export const Security = z.object({
		id: z.string(),
		ticker: z.string(),
		name: z.string().nullable().optional(),
		kind: z.enum(["standard", "cash"]),
		country_code: z.string().nullable().optional(),
		exchange_mic: z.string().nullable().optional(),
		exchange_acronym: z.string().nullable().optional(),
		exchange_operating_mic: z.string().nullable().optional(),
		exchange_name: z.string().nullable().optional(),
		offline: z.boolean(),
		offline_reason: z.string().nullable().optional(),
		website_url: z.string().nullable().optional(),
		logo_url: z.string().nullable().optional(),
		first_provider_price_on: z.string().nullable().optional(),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type Security = z.infer<typeof Security>;
export const SecurityCollection = z.object({
		securities: z.array(Security),
		pagination: Pagination,
	});
export type SecurityCollection = z.infer<typeof SecurityCollection>;
export const SecurityPrice = z.object({
		id: z.string(),
		date: z.string(),
		price: z.string(),
		price_amount: z.string(),
		currency: z.string(),
		provisional: z.boolean(),
		security: z.object({
		id: z.string(),
		ticker: z.string(),
		name: z.string().nullable().optional(),
		exchange_operating_mic: z.string().nullable().optional(),
	}),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type SecurityPrice = z.infer<typeof SecurityPrice>;
export const SecurityPriceCollection = z.object({
		security_prices: z.array(SecurityPrice),
		pagination: Pagination,
	});
export type SecurityPriceCollection = z.infer<typeof SecurityPriceCollection>;
export const SuccessMessage = z.object({
		message: z.string(),
	});
export type SuccessMessage = z.infer<typeof SuccessMessage>;
export const SyncErrorSummary = z.object({
		message: z.string(),
	});
export type SyncErrorSummary = z.infer<typeof SyncErrorSummary>;
export const SyncableSummary = z.object({
		type: z.string(),
		id: z.string(),
		name: z.string().nullable().optional(),
	});
export type SyncableSummary = z.infer<typeof SyncableSummary>;
export const SyncResource = z.object({
		id: z.string(),
		status: z.enum(["pending", "syncing", "completed", "failed", "stale"]),
		in_progress: z.boolean(),
		terminal: z.boolean(),
		syncable: SyncableSummary,
		parent_id: z.string().nullable().optional(),
		children_count: z.number().int().min(0),
		window_start_date: z.string().nullable().optional(),
		window_end_date: z.string().nullable().optional(),
		pending_at: z.iso.datetime().nullable().optional(),
		syncing_at: z.iso.datetime().nullable().optional(),
		completed_at: z.iso.datetime().nullable().optional(),
		failed_at: z.iso.datetime().nullable().optional(),
		error: SyncErrorSummary.nullable().optional(),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type SyncResource = z.infer<typeof SyncResource>;
export const SyncCollection = z.object({
		data: z.array(SyncResource).max(100),
		meta: Pagination,
	});
export type SyncCollection = z.infer<typeof SyncCollection>;
export const SyncResponse = z.object({
		data: SyncResource.nullable(),
	});
export type SyncResponse = z.infer<typeof SyncResponse>;
export const Tag = z.object({
		id: z.string(),
		name: z.string(),
		color: z.string(),
	});
export type Tag = z.infer<typeof Tag>;
export const TagDetail = z.object({
		id: z.string(),
		name: z.string(),
		color: z.string(),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type TagDetail = z.infer<typeof TagDetail>;
export const TagCollection = z.array(TagDetail);
export type TagCollection = z.infer<typeof TagCollection>;
export const Trade = z.object({
		id: z.string(),
		date: z.string(),
		amount: z.string(),
		currency: z.string(),
		name: z.string(),
		notes: z.string().nullable().optional(),
		qty: z.string(),
		price: z.string(),
		investment_activity_label: z.string().nullable().optional(),
		account: Account,
		security: z.object({
		id: z.string().optional(),
		ticker: z.string().optional(),
		name: z.string().nullable().optional(),
	}).nullable().optional(),
		category: z.object({
		id: z.string().optional(),
		name: z.string().optional(),
	}).nullable().optional(),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type Trade = z.infer<typeof Trade>;
export const TradeCollection = z.object({
		trades: z.array(Trade),
		pagination: Pagination,
	});
export type TradeCollection = z.infer<typeof TradeCollection>;
export const Transfer = z.object({
		id: z.string(),
		amount: z.string(),
		currency: z.string(),
		other_account: Account.nullable().optional(),
	});
export type Transfer = z.infer<typeof Transfer>;
export const Transaction = z.object({
		id: z.string(),
		date: z.string(),
		amount: z.string(),
		currency: z.string(),
		name: z.string(),
		notes: z.string().nullable().optional(),
		external_id: z.string().nullable().optional(),
		source: z.string().nullable().optional(),
		user_modified: z.boolean().optional(),
		classification: z.string(),
		account: Account,
		category: Category.nullable().optional(),
		merchant: Merchant.nullable().optional(),
		tags: z.array(Tag),
		transfer: Transfer.nullable().optional(),
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type Transaction = z.infer<typeof Transaction>;
export const TransactionCollection = z.object({
		transactions: z.array(Transaction),
		pagination: Pagination,
	});
export type TransactionCollection = z.infer<typeof TransactionCollection>;
export const TransactionResponse = z.object({
		id: z.string(),
		date: z.string(),
		amount: z.string(),
		currency: z.string(),
		name: z.string(),
		entryable_type: z.string(),
		account: z.object({
		id: z.string(),
		name: z.string(),
		account_type: z.string().nullable(),
	}),
	});
export type TransactionResponse = z.infer<typeof TransactionResponse>;
export const TransactionSplit = z.object({
		parent_transaction_id: z.string(),
		splits: z.array(Transaction),
	});
export type TransactionSplit = z.infer<typeof TransactionSplit>;
export const TransactionSplitRequest = z.object({
		split: z.object({
		splits: z.array(z.object({
		name: z.string(),
		amount: z.number(),
		category_id: z.string().nullable().optional(),
		excluded: z.boolean().optional(),
		transfer_account_id: z.string().nullable().optional(),
	})).min(1),
	}),
	});
export type TransactionSplitRequest = z.infer<typeof TransactionSplitRequest>;
export const TransferDecision = z.object({
		id: z.string(),
		status: z.enum(["pending", "confirmed"]),
		date: z.string(),
		amount: z.string(),
		amount_cents: z.number().int(),
		currency: z.string(),
		transfer_type: z.enum(["transfer", "liability_payment", "loan_payment"]),
		notes: z.string().nullable().optional(),
		source_fee_amount: z.string().nullable().optional(),
		source_fee_currency: z.string().nullable().optional(),
		destination_fee_amount: z.string().nullable().optional(),
		destination_fee_currency: z.string().nullable().optional(),
		inflow_transaction: TransferTransactionSide,
		outflow_transaction: TransferTransactionSide,
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type TransferDecision = z.infer<typeof TransferDecision>;
export const TransferDecisionCollection = z.object({
		transfers: z.array(TransferDecision),
		pagination: Pagination,
	});
export type TransferDecisionCollection = z.infer<typeof TransferDecisionCollection>;
export const Valuation = z.object({
		id: z.string(),
		date: z.string(),
		amount: z.string(),
		currency: z.string(),
		notes: z.string().nullable().optional(),
		kind: z.string(),
		account: Account,
		created_at: z.iso.datetime(),
		updated_at: z.iso.datetime(),
	});
export type Valuation = z.infer<typeof Valuation>;
export const ValuationCollection = z.object({
		valuations: z.array(Valuation),
		pagination: Pagination,
	});
export type ValuationCollection = z.infer<typeof ValuationCollection>;
