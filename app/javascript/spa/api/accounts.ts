import { queryOptions } from "@tanstack/react-query";
import * as z from "zod/mini";
import { AccountIdSchema, EntryIdSchema, type AccountId } from "../ids";
import { GetApiV1Transactions200Response, GetApiV1TransactionsId200Response } from "./generated";

export type AccountSearch = {
  tab?: string;
  period?: string;
  start_date?: string;
  end_date?: string;
  chart_view?: string;
  search?: string;
  status?: ("pending" | "confirmed")[];
  uncategorized?: boolean;
  page?: number;
  per_page?: number;
  statement_year?: number;
};
const ToneSchema = z.enum(["primary", "success", "destructive", "warning"]);
const NullableStringSchema = z.nullable(z.string());
export const AccountActionSchema = z.object({
  key: z.string(),
  label: z.string(),
  href: z.string(),
  method: z.enum(["get", "post", "patch", "delete"]),
  icon: z.string(),
  confirm: NullableStringSchema,
  params: z.record(z.string(), z.string()),
});
export const AccountCardSchema = z.object({
  label: z.string(),
  value: z.string(),
  description: NullableStringSchema,
  tone: ToneSchema,
});
const CellSchema = z.object({
  text: z.string(),
  secondary: NullableStringSchema,
  href: NullableStringSchema,
  tone: ToneSchema,
  privacy: z.boolean(),
});
export const AccountTableSchema = z.object({
  label: z.string(),
  columns: z.array(z.object({ key: z.string(), label: z.string(), numeric: z.boolean() })),
  rows: z.array(
    z.object({
      id: z.string(),
      cells: z.record(z.string(), CellSchema),
      actions: z.array(AccountActionSchema),
      past: z.boolean(),
    }),
  ),
  empty_message: z.string(),
});
export const AccountSectionSchema = z.object({
  key: z.string(),
  title: NullableStringSchema,
  description: NullableStringSchema,
  cards: z.array(AccountCardSchema),
  notices: z.array(z.string()),
  fields: z.array(
    z.object({ label: z.string(), value: z.string(), tooltip: NullableStringSchema }),
  ),
  table: z.nullable(AccountTableSchema),
  actions: z.array(AccountActionSchema),
  progress: z.nullable(
    z.object({ label: z.string(), percent: z.number(), description: z.string() }),
  ),
  coverage: z.nullable(
    z.object({
      years: z.array(z.int()),
      selected_year: z.int(),
      range: z.string(),
      months: z.array(
        z.object({
          key: z.string(),
          label: z.string(),
          status: z.string(),
          status_label: z.string(),
          tone: z.string(),
        }),
      ),
    }),
  ),
  upload: z.nullable(
    z.object({
      href: z.string(),
      account_id: z.pipe(z.uuid(), AccountIdSchema),
      accept: z.string(),
      label: z.string(),
      hint: z.string(),
      submit_label: z.string(),
    }),
  ),
});
export const AccountChartSchema = z.object({
  title: z.string(),
  value: z.string(),
  converted_value: NullableStringSchema,
  currency: z.string(),
  view: z.string(),
  views: z.array(z.object({ key: z.string(), label: z.string() })),
  period: z.object({
    key: NullableStringSchema,
    label: z.string(),
    start_date: z.iso.date(),
    end_date: z.iso.date(),
  }),
  periods: z.array(z.object({ key: z.string(), label: z.string() })),
  trend: z.object({
    value: z.string(),
    percent: z.string(),
    direction: z.enum(["up", "down", "flat"]),
    favorable: z.boolean(),
    comparison_label: z.string(),
  }),
  series: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      tone: z.enum(["primary", "success", "destructive"]),
      dashed: z.boolean(),
      points: z.array(z.object({ date: z.iso.date(), value: z.number(), formatted: z.string() })),
    }),
  ),
  markers: z.array(z.object({ date: z.iso.date(), label: z.string() })),
  aria_description: NullableStringSchema,
  no_data_label: z.string(),
  cards: z.array(AccountCardSchema),
  breakdown: z.array(AccountCardSchema),
  notices: z.array(z.string()),
});
export const AccountActivitySchema = z.object({
  groups: z.array(
    z.object({
      date: z.iso.date(),
      label: z.string(),
      balance: NullableStringSchema,
      reconciliation: z.array(
        z.object({ label: z.string(), value: z.string(), tooltip: z.string(), style: z.string() }),
      ),
      entries: z.array(
        z.object({
          id: z.pipe(z.uuid(), EntryIdSchema),
          type: z.enum(["transaction", "trade", "valuation"]),
          name: z.string(),
          href: z.string(),
          amount: z.string(),
          positive: z.boolean(),
          excluded: z.boolean(),
          notes: NullableStringSchema,
          description: NullableStringSchema,
          selectable: z.boolean(),
          transaction: z.nullable(GetApiV1TransactionsId200Response),
          split_parent: z.nullable(
            z.object({ id: z.uuid(), name: z.string(), amount: z.string() }),
          ),
          badges: z.array(
            z.object({
              label: z.string(),
              tooltip: NullableStringSchema,
              icon: NullableStringSchema,
            }),
          ),
          actions: z.array(AccountActionSchema),
          logo_url: NullableStringSchema,
          activity_options: z.array(z.object({ label: z.string(), value: z.string() })),
          activity_edit: z.nullable(
            z.object({
              href: z.string(),
              method: z.literal("patch"),
              param: z.string(),
              value: z.string(),
            }),
          ),
        }),
      ),
    }),
  ),
  pagination: GetApiV1Transactions200Response.shape.pagination,
  new_actions: z.array(AccountActionSchema),
  bulk_actions: z.object({ edit: z.string(), delete: z.string(), duplicate: z.string() }),
});
export const AccountDetailSchema = z.object({
  id: z.pipe(z.uuid(), AccountIdSchema),
  name: z.string(),
  account_type: z.string(),
  currency: z.string(),
  subtitle: NullableStringSchema,
  logo_url: NullableStringSchema,
  color: z.string(),
  syncing: z.boolean(),
  shared: z.boolean(),
  owner_name: NullableStringSchema,
  tax_treatment: NullableStringSchema,
  draft: z.boolean(),
  actions: z.array(AccountActionSchema),
  sync_action: z.nullable(AccountActionSchema),
  tabs: z.array(
    z.object({
      id: z.enum(["activity", "overview", "holdings", "schedule", "statements"]),
      label: z.string(),
    }),
  ),
  active_tab: z.string(),
  chart: AccountChartSchema,
  fx_warning: NullableStringSchema,
  activity: z.nullable(AccountActivitySchema),
  sections: z.array(AccountSectionSchema),
  text: z.record(z.string(), z.string()),
});
export type AccountDetail = z.infer<typeof AccountDetailSchema>;
export type AccountAction = z.infer<typeof AccountActionSchema>;
export type AccountCard = z.infer<typeof AccountCardSchema>;
export type AccountSection = z.infer<typeof AccountSectionSchema>;
export type AccountDataTable = z.infer<typeof AccountTableSchema>;
export type AccountChart = z.infer<typeof AccountChartSchema>;
export type AccountActivity = z.infer<typeof AccountActivitySchema>;

export class AccountApiError extends Error {
  constructor(readonly status: number) {
    super(`Account request failed (${status})`);
    this.name = "AccountApiError";
  }
}
export function accountDetailQueryOptions(id: AccountId, input: AccountSearch) {
  return queryOptions({
    queryKey: ["spa", "account", id, input] as const,
    queryFn: async ({ signal }) => {
      const search = new URLSearchParams();
      const params: Record<string, unknown> = input;
      for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
          for (const item of value)
            if (typeof item === "string") search.append("q[status][]", item);
        } else if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        )
          search.set(key, String(value));
      }
      const response = await fetch(`/accounts/${encodeURIComponent(id)}.json?${search}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!response.ok) throw new AccountApiError(response.status);
      const payload: unknown = await response.json();
      return AccountDetailSchema.parse(payload);
    },
    retry: (count, error) => !(error instanceof AccountApiError && error.status < 500) && count < 2,
    refetchInterval: (query) => (query.state.data?.syncing === true ? 3000 : false),
  });
}
