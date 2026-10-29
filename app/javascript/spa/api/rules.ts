import { queryOptions } from "@tanstack/react-query";
import * as z from "zod/mini";
import { apiFetch } from "./client";

const OptionPairSchema = z.tuple([z.string(), z.unknown()]);

const RegistryFilterSchema = z.object({
  type: z.string(),
  key: z.string(),
  label: z.string(),
  operators: z.array(OptionPairSchema),
  options: z.nullable(z.array(OptionPairSchema)),
  number_step: z.unknown(),
});

const RegistryExecutorSchema = z.object({
  type: z.string(),
  key: z.string(),
  label: z.string(),
  options: z.nullable(z.array(OptionPairSchema)),
});

const RegistrySchema = z.object({
  filters: z.array(RegistryFilterSchema),
  executors: z.array(RegistryExecutorSchema),
});

const RuleConditionSchema = z.object({
  id: z.nullable(z.string()),
  condition_type: z.string(),
  operator: z.string(),
  value: z.nullable(z.string()),
  sub_conditions: z.array(
    z.object({
      id: z.nullable(z.string()),
      condition_type: z.string(),
      operator: z.string(),
      value: z.nullable(z.string()),
    }),
  ),
});

const RuleActionSchema = z.object({
  id: z.nullable(z.string()),
  action_type: z.string(),
  value: z.nullable(z.string()),
  values: z.array(z.string()),
});

const RuleDetailSchema = z.object({
  id: z.nullable(z.string()),
  name: z.nullable(z.string()),
  resource_type: z.string(),
  active: z.boolean(),
  effective_date: z.nullable(z.string()),
  conditions: z.array(RuleConditionSchema),
  actions: z.array(RuleActionSchema),
});

const RuleSummarySchema = z.object({
  condition: z.string(),
  additional_conditions_count: z.number(),
  action: z.string(),
  additional_actions_count: z.number(),
  scope: z.string(),
});

const RuleRowSchema = z.object({
  id: z.string(),
  name: z.nullable(z.string()),
  resource_type: z.string(),
  active: z.boolean(),
  summary: RuleSummarySchema,
  updated_at: z.string(),
});

const RuleRunSchema = z.object({
  id: z.string(),
  executed_at: z.string(),
  execution_type: z.string(),
  status: z.string(),
  rule_name: z.string(),
  queued: z.number(),
  processed: z.number(),
  modified: z.number(),
  blocked: z.number(),
  error_message: z.nullable(z.string()),
});

export const RulesIndexSchema = z.object({
  rules: z.array(RuleRowSchema),
  count: z.number(),
  sort_by: z.string(),
  direction: z.string(),
  self_hosted: z.boolean(),
  ai_actions_present: z.boolean(),
  recent_runs: z.object({
    items: z.array(RuleRunSchema),
    page: z.number(),
    pages: z.number(),
    count: z.number(),
    per_page: z.number(),
  }),
});

export const RuleFormSchema = z.object({
  rule: RuleDetailSchema,
  registry: RegistrySchema,
  self_hosted: z.boolean(),
});

const ConfirmAiSchema = z.object({
  model: z.nullable(z.string()),
  estimated_cost: z.nullable(z.number()),
});

export const RuleConfirmSchema = z.object({
  affected_count: z.number(),
  ai: z.nullable(ConfirmAiSchema),
});

const RuleWithConfirmSchema = z.object({
  data: RuleDetailSchema,
  confirm: RuleConfirmSchema,
});

const ConfirmAllSchema = z.object({
  rule_count: z.number(),
  total_affected_count: z.number(),
  ai: z.nullable(ConfirmAiSchema),
});

export type RulesIndex = z.infer<typeof RulesIndexSchema>;
export type RuleRow = z.infer<typeof RuleRowSchema>;
export type RuleRunItem = z.infer<typeof RuleRunSchema>;
export type RuleForm = z.infer<typeof RuleFormSchema>;
export type RuleDetail = z.infer<typeof RuleDetailSchema>;
export type RuleCondition = z.infer<typeof RuleConditionSchema>;
export type RuleAction = z.infer<typeof RuleActionSchema>;
export type RegistryFilter = z.infer<typeof RegistryFilterSchema>;
export type RegistryExecutor = z.infer<typeof RegistryExecutorSchema>;
export type RuleConfirm = z.infer<typeof RuleConfirmSchema>;
export type ConfirmAll = z.infer<typeof ConfirmAllSchema>;

export type RuleSubConditionInput = {
  id?: string;
  condition_type: string;
  operator: string;
  value?: string | null;
  destroy?: boolean;
};

export type RuleConditionInput = {
  id?: string;
  condition_type: string;
  operator: string;
  value?: string | null;
  destroy?: boolean;
  sub_conditions_attributes?: Record<string, RuleSubConditionInput>;
};

export type RuleActionInput = {
  id?: string;
  action_type: string;
  value?: string | string[] | null;
  destroy?: boolean;
};

export type RuleFormInput = {
  name?: string | null;
  resource_type: string;
  active?: boolean;
  effective_date?: string | null;
  conditions_attributes?: Record<string, RuleConditionInput>;
  actions_attributes?: Record<string, RuleActionInput>;
};
const DESTROY_PARAM = "_destroy";

function serializeConditionInput(input: RuleConditionInput): Record<string, unknown> {
  const record: Record<string, unknown> = {
    condition_type: input.condition_type,
    operator: input.operator,
    value: input.value ?? null,
  };
  if (input.id !== undefined) record.id = input.id;
  if (input.destroy === true) record[DESTROY_PARAM] = true;
  if (input.sub_conditions_attributes !== undefined) {
    const subs: Record<string, unknown> = {};
    for (const [key, sub] of Object.entries(input.sub_conditions_attributes))
      subs[key] = serializeSubConditionInput(sub);
    record.sub_conditions_attributes = subs;
  }
  return record;
}

function serializeSubConditionInput(input: RuleSubConditionInput): Record<string, unknown> {
  const record: Record<string, unknown> = {
    condition_type: input.condition_type,
    operator: input.operator,
    value: input.value ?? null,
  };
  if (input.id !== undefined) record.id = input.id;
  if (input.destroy === true) record[DESTROY_PARAM] = true;
  return record;
}

function serializeActionInput(input: RuleActionInput): Record<string, unknown> {
  const record: Record<string, unknown> = {
    action_type: input.action_type,
    value: input.value ?? null,
  };
  if (input.id !== undefined) record.id = input.id;
  if (input.destroy === true) record[DESTROY_PARAM] = true;
  return record;
}

export function serializeRuleFormInput(input: RuleFormInput): Record<string, unknown> {
  const conditions: Record<string, unknown> = {};
  for (const [key, condition] of Object.entries(input.conditions_attributes ?? {}))
    conditions[key] = serializeConditionInput(condition);
  const actions: Record<string, unknown> = {};
  for (const [key, action] of Object.entries(input.actions_attributes ?? {}))
    actions[key] = serializeActionInput(action);
  return {
    name: input.name ?? null,
    resource_type: input.resource_type,
    active: input.active,
    effective_date: input.effective_date ?? null,
    conditions_attributes: conditions,
    actions_attributes: actions,
  };
}

export class RulesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: string[] = [],
  ) {
    super(message);
    this.name = "RulesApiError";
  }
}

function extractErrors(payload: unknown, fallback: string): string[] {
  if (typeof payload !== "object" || payload === null) return [fallback];
  if ("message" in payload && typeof payload.message === "string" && payload.message.length > 0)
    return [payload.message];
  if ("errors" in payload && Array.isArray(payload.errors) && payload.errors.length > 0)
    return payload.errors.filter((item): item is string => typeof item === "string");
  return [fallback];
}

async function requestJson(url: string, method: string, body?: unknown): Promise<unknown> {
  const response = await apiFetch(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    method,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) return payload;
  const errors = extractErrors(payload, `Request failed with status ${response.status}`);
  throw new RulesApiError(errors[0] ?? "Request failed", response.status, errors);
}

async function requestGet(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await apiFetch(url, { signal });
  if (!response.ok)
    throw new RulesApiError(`Request failed with status ${response.status}`, response.status);
  const payload: unknown = await response.json();
  return payload;
}

export function rulesIndexQueryOptions(path: string) {
  return queryOptions({
    queryKey: ["spa", "rules-index", path] as const,
    queryFn: async ({ signal }): Promise<RulesIndex> => {
      const separator = path.includes("?") ? "&" : "?";
      const payload = await requestGet(`${path}${separator}include=workspace`, signal);
      return z.object({ workspace: RulesIndexSchema }).parse(payload).workspace;
    },
    staleTime: 10_000,
  });
}

export function ruleFormQueryOptions(path: string) {
  return queryOptions({
    queryKey: ["spa", "rule-form", path] as const,
    queryFn: async ({ signal }): Promise<RuleForm> => {
      const payload = await requestGet(path, signal);
      return RuleFormSchema.parse(payload);
    },
    staleTime: 10_000,
  });
}

export async function fetchRuleForm(path: string, signal?: AbortSignal): Promise<RuleForm> {
  return RuleFormSchema.parse(await requestGet(path, signal));
}

export async function createRule(
  path: string,
  input: RuleFormInput,
): Promise<{ rule: RuleDetail; confirm: RuleConfirm }> {
  const payload = RuleWithConfirmSchema.parse(
    await requestJson(path, "POST", { rule: serializeRuleFormInput(input) }),
  );
  return { rule: payload.data, confirm: payload.confirm };
}

export async function updateRule(
  path: string,
  input: RuleFormInput,
): Promise<{ rule: RuleDetail }> {
  const payload = await requestJson(path, "PATCH", { rule: serializeRuleFormInput(input) });
  return { rule: z.object({ data: RuleDetailSchema }).parse(payload).data };
}

export async function fetchRuleConfirm(path: string): Promise<RuleConfirm> {
  const payload = await requestJson(path, "GET");
  return RuleWithConfirmSchema.parse(payload).confirm;
}

export async function fetchConfirmAll(path: string): Promise<ConfirmAll> {
  return ConfirmAllSchema.parse(await requestGet(path));
}

async function postOk(path: string): Promise<void> {
  await requestJson(path, "POST");
}

export async function applyRule(path: string): Promise<void> {
  await postOk(path);
}

export async function applyAllRules(path: string): Promise<void> {
  await postOk(path);
}

export async function clearAiCache(path: string): Promise<void> {
  await postOk(path);
}

export async function destroyRule(path: string): Promise<void> {
  await requestJson(path, "DELETE");
}

export async function destroyAllRules(path: string): Promise<void> {
  await requestJson(path, "DELETE");
}

export async function toggleRuleActive(path: string, active: boolean): Promise<void> {
  await requestJson(path, "PATCH", { rule: { active } });
}

export async function invalidateRulesQueries(queryClient: {
  invalidateQueries: (filters: { queryKey: string[] }) => Promise<void>;
}): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["spa", "rules-index"] });
  await queryClient.invalidateQueries({ queryKey: ["spa", "rule-form"] });
}
