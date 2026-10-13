// eslint-disable import/max-dependencies -- Rules index composes the rule list, recent-runs table, apply-all flow, and the registry-driven rule builder.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import * as z from "zod/mini";
import type { SpaBootstrap } from "./bootstrap";
import { referenceDataQueryOptions } from "./api/transactions";
import { Alert } from "./components/alert";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { TablePaginationBar } from "./components/table";
import { TagSelect } from "./components/tag-select";
import { Toggle } from "./components/toggle";
import { Icon } from "./icon";
import { Modal } from "./modal";
import { CategorySelect, MerchantSelect } from "./transaction-detail-page";
import {
  RulesApiError,
  applyAllRules,
  applyRule,
  clearAiCache,
  createRule,
  destroyAllRules,
  destroyRule,
  fetchConfirmAll,
  fetchRuleConfirm,
  invalidateRulesQueries,
  ruleFormQueryOptions,
  rulesIndexQueryOptions,
  toggleRuleActive,
  updateRule,
  type ConfirmAll,
  type RegistryExecutor,
  type RegistryFilter,
  type RuleAction,
  type RuleCondition,
  type RuleForm,
  type RuleConfirm,
  type RuleFormInput,
  type RuleRow,
  type RuleRunItem,
} from "./api/rules";
import { CategoryIdSchema, MerchantIdSchema, TagIdSchema } from "./ids";
import type { CategoryId, MerchantId, TagId } from "./ids";

type Bootstrap = Pick<SpaBootstrap, "apiPaths" | "railsPaths">;

// Inline English parity strings (rules/en.yml), mirroring the ERB copy.
const RULES_TEXT = {
  title: "Rules",
  rules_heading: "Rules",
  sort_by: "Sort by:",
  sort_name: "Name",
  sort_updated_at: "Updated At",
  toggle_sort_direction: "Toggle sort direction",
  new_rule: "New rule",
  apply_all: "Apply All",
  delete_all_rules: "Delete all rules",
  reset_ai_cache: "Reset AI cache",
  ai_cost_warning:
    "AI-enabled rule actions will cost money. Be sure to filter as narrowly as possible to avoid unnecessary costs.",
  no_rules_title: "No rules yet",
  no_rules_description:
    "Set up rules to perform actions to your transactions and other data on every account sync.",
  unavailable: "Rule list is unavailable.",
  try_again: "Try again",
  edit: "Edit",
  re_apply_rule: "Re-apply rule",
  delete: "Delete",
  then_label: "THEN",
  cancel: "Cancel",
  confirm_title: "Confirm changes",
  apply_notice: "affected transaction(s) meet the rule criteria.",
  ai_cost_title: "AI Cost Estimation",
  confirm_changes: "Confirm changes",
  apply_all_confirm_title: "Apply All Rules",
  apply_all_confirm_button: "Confirm and Apply All",
  clear_cache_title: "Reset AI cache?",
  clear_cache_body:
    "Are you sure you want to reset the AI cache? This will allow AI rules to re-process all transactions. This may incur additional API costs.",
  clear_cache_button: "Reset Cache",
  clear_cache_error: "Could not reset the AI cache.",
  delete_all_title: "Delete all rules?",
  delete_all_body: "This permanently deletes every rule. This cannot be undone.",
  delete_rule_title: "Delete this rule?",
  delete_rule_body: "This permanently deletes the rule. This cannot be undone.",
  apply_error: "Could not apply the rule.",
  delete_error: "Could not delete.",
  toggle_error: "Could not update the rule.",
  save_error: "Could not save the rule.",
  recent_runs_title: "Recent Runs",
  recent_runs_description:
    "View the execution history of your rules including success/failure status and transaction counts.",
  date_time: "Date/Time",
  execution_type: "Type",
  status: "Status",
  rule_name: "Rule Name",
  counts: "Queued / Processed / Modified / Blocked",
  no_runs: "No rule runs yet.",
  rule_name_label: "Rule name (optional)",
  rule_name_placeholder: "Enter a name for this rule",
  add_condition: "Add condition",
  add_condition_group: "Add condition group",
  add_action: "Add action",
  starting_from: "Starting from",
  all_past_and_future: "All past and future",
  save_rule: "Save rule",
  saving: "Saving…",
  add_sub_condition: "Add condition",
  match_label: "match",
  all_label: "all",
  any_label: "any",
  of_following: "of the following conditions",
  value_placeholder: "Enter a value",
  to_label: "to",
  form_unavailable: "Rule builder is unavailable.",
} as const;

const VALUELESS_OPERATORS: Record<string, true> = { is_null: true, is_not_null: true };

function formatRunDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function executionLabel(value: string): string {
  if (value === "manual") return "Manual";
  if (value === "scheduled") return "Scheduled";
  return value;
}

function statusLabel(value: string): string {
  if (value === "pending") return "Pending";
  if (value === "success") return "Success";
  if (value === "failed") return "Failed";
  return value;
}

/* ---------- index ---------- */

function ConfirmDialog({
  body,
  confirmText,
  onCancel,
  onConfirm,
  title,
  variant = "primary",
}: {
  body: string;
  confirmText: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  variant?: "primary" | "destructive";
}) {
  return (
    <Modal
      ariaLabelledby="rules-confirm-title"
      onClose={onCancel}
      open
      panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
    >
      <h2 className="text-lg font-medium text-primary" id="rules-confirm-title">
        {title}
      </h2>
      <p className="my-4 text-sm text-secondary">{body}</p>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} variant="secondary">
          {RULES_TEXT.cancel}
        </Button>
        <Button onClick={onConfirm} variant={variant === "destructive" ? "destructive" : "primary"}>
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}

function AiCostAlert({
  affectedCount,
  model,
  estimatedCost,
}: {
  affectedCount: number;
  model: string | null;
  estimatedCost: number | null;
}) {
  return (
    <Alert className="mb-4" title={RULES_TEXT.ai_cost_title} variant="info">
      {estimatedCost === null ? (
        <p>
          This will use AI to categorize {affectedCount} transaction(s).{" "}
          {model === null ? (
            <span className="font-semibold">
              Cost estimation unavailable (no LLM provider configured).
            </span>
          ) : (
            <span className="font-semibold">
              Cost estimation unavailable for model &ldquo;{model}&rdquo;.
            </span>
          )}
        </p>
      ) : (
        <p>
          This will use AI to categorize {affectedCount} transaction(s). Estimated cost:{" "}
          <span className="font-semibold">~${estimatedCost.toFixed(4)}</span>
        </p>
      )}
    </Alert>
  );
}

export function ApplyConfirmDialog({
  confirm,
  onApply,
  onCancel,
  title,
}: {
  confirm: RuleConfirm;
  onApply: () => void;
  onCancel: () => void;
  title: string;
}) {
  return (
    <Modal
      ariaLabelledby="rules-apply-title"
      onClose={onCancel}
      open
      panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
    >
      <h2 className="text-lg font-medium text-primary" id="rules-apply-title">
        {title}
      </h2>
      <p className="my-4 text-sm text-secondary">
        <span className="font-medium text-primary">{confirm.affected_count}</span>{" "}
        {RULES_TEXT.apply_notice}
      </p>
      {confirm.ai === null ? null : (
        <AiCostAlert
          affectedCount={confirm.affected_count}
          estimatedCost={confirm.ai.estimated_cost}
          model={confirm.ai.model}
        />
      )}
      <Button fullWidth onClick={onApply}>
        {RULES_TEXT.confirm_changes}
      </Button>
    </Modal>
  );
}

export function ApplyAllDialog({
  confirm,
  onApply,
  onCancel,
}: {
  confirm: ConfirmAll;
  onApply: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      ariaLabelledby="rules-apply-all-title"
      onClose={onCancel}
      open
      panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
    >
      <h2 className="text-lg font-medium text-primary" id="rules-apply-all-title">
        {RULES_TEXT.apply_all_confirm_title}
      </h2>
      <p className="my-4 text-sm text-secondary">
        You are about to apply {confirm.rule_count} rules affecting {confirm.total_affected_count}{" "}
        unique transactions. Please confirm if you wish to proceed.
      </p>
      {confirm.ai === null ? null : (
        <AiCostAlert
          affectedCount={confirm.total_affected_count}
          estimatedCost={confirm.ai.estimated_cost}
          model={confirm.ai.model}
        />
      )}
      <Button fullWidth onClick={onApply}>
        {RULES_TEXT.apply_all_confirm_button}
      </Button>
    </Modal>
  );
}

function RuleRowMenu({
  onAction,
  rule,
}: {
  onAction: (action: "edit" | "reapply" | "delete", rule: RuleRow) => void;
  rule: RuleRow;
}) {
  const [open, setOpen] = useState(false);
  const menuLabel = rule.name === null || rule.name === "" ? "Rule" : rule.name;
  return (
    <div className="relative">
      <IconButton
        icon="more-horizontal"
        label={`${menuLabel} menu`}
        onClick={() => {
          setOpen((value) => !value);
        }}
      />
      {open ? null : null}
      {open ? (
        <div
          className="shadow-border-lg absolute right-0 z-30 mt-2 min-w-52 rounded-lg bg-container py-1"
          role="menu"
        >
          <button
            className="block w-full px-4 py-2 text-left text-sm text-primary hover:bg-container-hover"
            onClick={() => {
              setOpen(false);
              onAction("edit", rule);
            }}
            role="menuitem"
            type="button"
          >
            {RULES_TEXT.edit}
          </button>
          <button
            className="block w-full px-4 py-2 text-left text-sm text-primary hover:bg-container-hover"
            onClick={() => {
              setOpen(false);
              onAction("reapply", rule);
            }}
            role="menuitem"
            type="button"
          >
            {RULES_TEXT.re_apply_rule}
          </button>
          <button
            className="block w-full px-4 py-2 text-left text-sm text-primary hover:bg-container-hover"
            onClick={() => {
              setOpen(false);
              onAction("delete", rule);
            }}
            role="menuitem"
            type="button"
          >
            {RULES_TEXT.delete}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function failMessage(caught: unknown, fallback: string): string {
  if (caught instanceof Error) return caught.message;
  return fallback;
}

function andMore(count: number, noun: string): string | null {
  if (count <= 0) return null;
  return `and ${count} more ${noun}${count === 1 ? "" : "s"}`;
}

function RuleRowView({
  onAction,
  onToggle,
  rule,
}: {
  onAction: (action: "edit" | "reapply" | "delete", rule: RuleRow) => void;
  onToggle: (rule: RuleRow, active: boolean) => void;
  rule: RuleRow;
}) {
  const summary = rule.summary;
  const conditionsMore = andMore(summary.additional_conditions_count, "condition");
  const actionsMore = andMore(summary.additional_actions_count, "action");
  const toggleLabel = rule.name === null || rule.name === "" ? "Rule" : rule.name;
  return (
    <div
      className={`flex items-center justify-between gap-4 p-4 ${rule.active ? "text-primary" : "text-secondary"}`}
      id={`rule_${rule.id}`}
    >
      <div className="space-y-1.5 text-sm">
        {rule.name === null || rule.name === "" ? null : (
          <h3 className="text-base font-medium">{rule.name}</h3>
        )}
        <div className="mt-1 flex items-center gap-2">
          <div className="w-16 shrink-0 text-secondary">
            <span className="font-mono text-xs">IF</span>
          </div>
          <p className="m-0 flex flex-wrap items-center gap-1.5">
            <span className="rounded-sm border border-secondary px-2 py-1">
              {summary.condition}
            </span>
            {conditionsMore === null ? null : <span>{conditionsMore}</span>}
          </p>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div className="w-16 shrink-0 text-secondary">
            <span className="font-mono text-xs">{RULES_TEXT.then_label}</span>
          </div>
          <p className="m-0 flex flex-wrap items-center gap-1.5">
            <span className="rounded-sm border border-secondary px-2 py-1">{summary.action}</span>
            {actionsMore === null ? null : <span>{actionsMore}</span>}
          </p>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div className="w-16 shrink-0 text-secondary">
            <span className="font-mono text-xs">FOR</span>
          </div>
          <p className="m-0 flex flex-wrap items-center gap-1.5">
            <span className="rounded-sm border border-secondary px-2 py-1">{summary.scope}</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Toggle
          checked={rule.active}
          label={`${toggleLabel} active`}
          onChange={(checked) => {
            onToggle(rule, checked);
          }}
        />
        <RuleRowMenu onAction={onAction} rule={rule} />
      </div>
    </div>
  );
}

function RecentRunsTable({ runs }: { runs: RuleRunItem[] }) {
  if (runs.length === 0) {
    return (
      <p className="py-8 text-center text-sm font-medium text-secondary">{RULES_TEXT.no_runs}</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table aria-label={RULES_TEXT.recent_runs_title} className="w-full">
        <thead className="bg-surface text-xs font-medium uppercase text-secondary">
          <tr className="border-b border-primary">
            <th className="px-4 py-3 text-left">{RULES_TEXT.date_time}</th>
            <th className="px-4 py-3 text-center">{RULES_TEXT.execution_type}</th>
            <th className="px-4 py-3 text-center">{RULES_TEXT.status}</th>
            <th className="px-4 py-3 text-left">{RULES_TEXT.rule_name}</th>
            <th className="px-4 py-3 text-center">{RULES_TEXT.counts}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-subdued bg-container">
          {runs.map((run) => (
            <tr className={run.status === "failed" ? "bg-red-50" : undefined} key={run.id}>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-primary">
                {formatRunDate(run.executed_at)}
              </td>
              <td className="px-4 py-3 text-center text-sm text-primary">
                <span
                  className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
                    run.execution_type === "manual"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-purple-50 text-purple-700"
                  }`}
                >
                  {executionLabel(run.execution_type)}
                </span>
              </td>
              <td className="px-4 py-3 text-center text-sm">
                <span className="inline-flex items-center justify-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      run.status === "pending"
                        ? "bg-yellow-50 text-yellow-700"
                        : run.status === "success"
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                    }`}
                  >
                    {statusLabel(run.status)}
                  </span>
                  {run.status === "failed" && run.error_message !== null ? (
                    <span title={run.error_message}>
                      <Icon className="text-destructive" name="circle-alert" size="sm" />
                    </span>
                  ) : null}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-primary">{run.rule_name}</td>
              <td className="whitespace-nowrap px-4 py-3 text-center text-sm tabular-nums text-primary">
                {run.queued} / {run.processed} / {run.modified} / {run.blocked}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RulesIndexPage({
  indexPath,
  newHref,
  onEdit,
  rulesPath,
}: {
  indexPath: string;
  newHref: string;
  onEdit: (ruleId: string) => void;
  rulesPath: string;
}) {
  const queryClient = useQueryClient();
  const [sortBy, setSortBy] = useState("name");
  const [direction, setDirection] = useState("asc");
  const [runsPage, setRunsPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [applyConfirm, setApplyConfirm] = useState<{ confirm: RuleConfirm; ruleId: string } | null>(
    null,
  );
  const [applyAllConfirm, setApplyAllConfirm] = useState<ConfirmAll | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RuleRow | null>(null);
  const [pendingDeleteAll, setPendingDeleteAll] = useState(false);
  const [pendingClearCache, setPendingClearCache] = useState(false);

  const path = useMemo(() => {
    const params = new URLSearchParams({
      sort_by: sortBy,
      direction,
      runs_page: String(runsPage),
      per_page: String(perPage),
    });
    return `${indexPath}?${params.toString()}`;
  }, [direction, indexPath, perPage, runsPage, sortBy]);

  const query = useQuery(rulesIndexQueryOptions(path));
  const data = query.data;

  function refresh(): void {
    void invalidateRulesQueries(queryClient);
  }

  if (query.isError) {
    return (
      <section aria-labelledby="rules-index-title" className="space-y-4">
        <h1 className="text-xl font-medium text-primary" id="rules-index-title">
          {RULES_TEXT.title}
        </h1>
        <Alert live="alert" variant="error">
          <p className="mb-3">{RULES_TEXT.unavailable}</p>
          <Button
            onClick={() => {
              void query.refetch();
            }}
            variant="secondary"
          >
            {RULES_TEXT.try_again}
          </Button>
        </Alert>
      </section>
    );
  }

  const runs = data?.recent_runs;
  const hasRules = (data?.count ?? 0) > 0;

  return (
    <section aria-labelledby="rules-index-title" className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-medium text-primary" id="rules-index-title">
          {RULES_TEXT.title}
        </h1>
        <div className="flex items-center gap-2">
          {data === undefined || !hasRules ? null : (
            <>
              <div className="relative">
                <IconButton
                  icon="more-horizontal"
                  label="Rules menu"
                  onClick={() => {
                    setMenuOpen((value) => !value);
                  }}
                />
                {menuOpen ? (
                  <div
                    className="shadow-border-lg absolute right-0 z-30 mt-2 min-w-52 rounded-lg bg-container py-1"
                    role="menu"
                  >
                    <button
                      className="block w-full px-4 py-2 text-left text-sm text-primary hover:bg-container-hover"
                      onClick={() => {
                        setMenuOpen(false);
                        setPendingClearCache(true);
                      }}
                      role="menuitem"
                      type="button"
                    >
                      {RULES_TEXT.reset_ai_cache}
                    </button>
                    <button
                      className="block w-full px-4 py-2 text-left text-sm text-primary hover:bg-container-hover"
                      onClick={() => {
                        setMenuOpen(false);
                        setPendingDeleteAll(true);
                      }}
                      role="menuitem"
                      type="button"
                    >
                      {RULES_TEXT.delete_all_rules}
                    </button>
                  </div>
                ) : null}
              </div>
              <Button
                onClick={() => {
                  setError(null);
                  fetchConfirmAll(`${rulesPath}/confirm_all.json`)
                    .then((confirm) => {
                      setApplyAllConfirm(confirm);
                    })
                    .catch((caught: unknown) => {
                      setError(failMessage(caught, RULES_TEXT.apply_error));
                    });
                }}
                variant="secondary"
              >
                {RULES_TEXT.apply_all}
              </Button>
            </>
          )}
          <a
            className="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-container px-3 text-xs font-medium text-primary shadow-border-xs hover:bg-surface-hover"
            href={newHref}
          >
            <Icon name="plus" size="sm" />
            {RULES_TEXT.new_rule}
          </a>
        </div>
      </div>

      {error === null ? null : (
        <Alert live="alert" variant="error">
          {error}
        </Alert>
      )}

      {data?.self_hosted === true ? (
        <Alert variant="warning">
          <p className="text-sm">{RULES_TEXT.ai_cost_warning}</p>
        </Alert>
      ) : null}

      {data === undefined ? (
        <output aria-busy="true" className="block h-40 animate-pulse rounded-xl bg-container" />
      ) : !hasRules ? (
        <div className="rounded-xl bg-container p-4 shadow-border-xs">
          <div className="flex items-center justify-center py-20">
            <div className="flex max-w-[500px] flex-col items-center text-center">
              <p className="mb-1 text-sm font-medium text-primary">{RULES_TEXT.no_rules_title}</p>
              <p className="mb-4 text-sm text-secondary">{RULES_TEXT.no_rules_description}</p>
              <a
                className="focus-ring inline-flex h-10 items-center rounded-lg bg-container px-4 text-sm font-medium text-primary shadow-border-xs hover:bg-surface-hover"
                href={newHref}
              >
                {RULES_TEXT.new_rule}
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-container p-4 shadow-border-xs">
          <div className="rounded-xl bg-container-inset">
            <div className="flex justify-between px-4 py-2 text-xs uppercase">
              <div className="flex items-center gap-1.5 font-medium text-secondary">
                <p>{RULES_TEXT.rules_heading}</p>
                <span className="text-subdued">&middot;</span>
                <p>{data.count}</p>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-secondary">{RULES_TEXT.sort_by}</span>
                <select
                  aria-label={RULES_TEXT.sort_by}
                  className="w-auto min-w-[120px] cursor-pointer rounded-sm border-none bg-transparent text-xs uppercase text-primary"
                  onChange={(event) => {
                    setSortBy(event.target.value);
                    setRunsPage(1);
                  }}
                  value={sortBy}
                >
                  <option value="name">{RULES_TEXT.sort_name}</option>
                  <option value="updated_at">{RULES_TEXT.sort_updated_at}</option>
                </select>
                <IconButton
                  icon={direction === "asc" ? "chevron-up" : "chevron-down"}
                  label={RULES_TEXT.toggle_sort_direction}
                  onClick={() => {
                    setDirection((value) => (value === "asc" ? "desc" : "asc"));
                    setRunsPage(1);
                  }}
                  size="sm"
                />
              </div>
            </div>
            <div className="p-1">
              <div className="flex flex-col rounded-lg bg-container shadow-border-xs">
                {data.rules.map((rule) => (
                  <RuleRowView
                    key={rule.id}
                    onAction={(action, target) => {
                      if (action === "edit") onEdit(target.id);
                      else if (action === "delete") setPendingDelete(target);
                      else {
                        setError(null);
                        fetchRuleConfirm(`${rulesPath}/${target.id}/confirm.json`)
                          .then((confirm) => {
                            setApplyConfirm({ confirm, ruleId: target.id });
                          })
                          .catch((caught: unknown) => {
                            setError(failMessage(caught, RULES_TEXT.apply_error));
                          });
                      }
                    }}
                    onToggle={(target, active) => {
                      setError(null);
                      toggleRuleActive(`${rulesPath}/${target.id}`, active)
                        .then(() => {
                          refresh();
                        })
                        .catch((caught: unknown) => {
                          setError(failMessage(caught, RULES_TEXT.toggle_error));
                        });
                    }}
                    rule={rule}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {runs === undefined || runs.items.length === 0 ? null : (
        <div className="mt-6 rounded-xl bg-container p-4 shadow-border-xs">
          <div className="mb-4">
            <h2 className="mb-1 text-lg font-medium text-primary">
              {RULES_TEXT.recent_runs_title}
            </h2>
            <p className="text-sm text-secondary">{RULES_TEXT.recent_runs_description}</p>
          </div>
          <RecentRunsTable runs={runs.items} />
          {runs.pages <= 1 ? null : (
            <div className="mt-4">
              <TablePaginationBar
                itemCount={runs.items.length}
                onPageChange={(page) => {
                  setRunsPage(page);
                }}
                onPerPageChange={(size) => {
                  setPerPage(size);
                  setRunsPage(1);
                }}
                page={runs.page}
                pageSizes={[10, 20, 30, 50, 100]}
                perPage={runs.per_page}
                totalCount={runs.count}
                totalPages={runs.pages}
              />
            </div>
          )}
        </div>
      )}

      {applyConfirm === null ? null : (
        <ApplyConfirmDialog
          confirm={applyConfirm.confirm}
          onApply={() => {
            const ruleId = applyConfirm.ruleId;
            setApplyConfirm(null);
            setError(null);
            applyRule(`${rulesPath}/${ruleId}/apply`)
              .then(() => {
                refresh();
              })
              .catch((caught: unknown) => {
                setError(failMessage(caught, RULES_TEXT.apply_error));
              });
          }}
          onCancel={() => {
            setApplyConfirm(null);
          }}
          title={RULES_TEXT.confirm_title}
        />
      )}

      {applyAllConfirm === null ? null : (
        <ApplyAllDialog
          confirm={applyAllConfirm}
          onApply={() => {
            setApplyAllConfirm(null);
            setError(null);
            applyAllRules(`${rulesPath}/apply_all`)
              .then(() => {
                refresh();
              })
              .catch((caught: unknown) => {
                setError(failMessage(caught, RULES_TEXT.apply_error));
              });
          }}
          onCancel={() => {
            setApplyAllConfirm(null);
          }}
        />
      )}

      {pendingDelete === null ? null : (
        <ConfirmDialog
          body={RULES_TEXT.delete_rule_body}
          confirmText={RULES_TEXT.delete}
          onCancel={() => {
            setPendingDelete(null);
          }}
          onConfirm={() => {
            const target = pendingDelete;
            setPendingDelete(null);
            setError(null);
            destroyRule(`${rulesPath}/${target.id}`)
              .then(() => {
                refresh();
              })
              .catch((caught: unknown) => {
                setError(failMessage(caught, RULES_TEXT.delete_error));
              });
          }}
          title={RULES_TEXT.delete_rule_title}
          variant="destructive"
        />
      )}

      {pendingDeleteAll ? (
        <ConfirmDialog
          body={RULES_TEXT.delete_all_body}
          confirmText={RULES_TEXT.delete}
          onCancel={() => {
            setPendingDeleteAll(false);
          }}
          onConfirm={() => {
            setPendingDeleteAll(false);
            setError(null);
            destroyAllRules(`${rulesPath}/destroy_all`)
              .then(() => {
                refresh();
              })
              .catch((caught: unknown) => {
                setError(failMessage(caught, RULES_TEXT.delete_error));
              });
          }}
          title={RULES_TEXT.delete_all_title}
          variant="destructive"
        />
      ) : null}

      {pendingClearCache ? (
        <ConfirmDialog
          body={RULES_TEXT.clear_cache_body}
          confirmText={RULES_TEXT.clear_cache_button}
          onCancel={() => {
            setPendingClearCache(false);
          }}
          onConfirm={() => {
            setPendingClearCache(false);
            setError(null);
            clearAiCache(`${rulesPath}/clear_ai_cache`)
              .then(() => {
                refresh();
              })
              .catch((caught: unknown) => {
                setError(failMessage(caught, RULES_TEXT.clear_cache_error));
              });
          }}
          title={RULES_TEXT.clear_cache_title}
        />
      ) : null}
    </section>
  );
}

/* ---------- registry-driven builder ---------- */

type BuilderSubCondition = {
  key: string;
  id: string | undefined;
  condition_type: string;
  operator: string;
  value: string;
  destroy: boolean;
};

type BuilderCondition =
  | {
      key: string;
      kind: "single";
      id: string | undefined;
      condition_type: string;
      operator: string;
      value: string;
      destroy: boolean;
    }
  | {
      key: string;
      kind: "group";
      id: string | undefined;
      operator: string;
      destroy: boolean;
      subs: BuilderSubCondition[];
    };

type BuilderAction = {
  key: string;
  id: string | undefined;
  action_type: string;
  value: string;
  destroy: boolean;
};

type OptionPair = { label: string; value: string };

type BuilderGroupCondition = Extract<BuilderCondition, { kind: "group" }>;

let builderKeySequence = 0;

function nextBuilderKey(): string {
  builderKeySequence += 1;
  return `client-${Date.now()}-${builderKeySequence}`;
}

function collectErrors(caught: unknown, fallback: string): string[] {
  if (caught instanceof RulesApiError) return caught.errors;
  if (caught instanceof Error) return [caught.message];
  return [fallback];
}

function blankGroupCondition(): BuilderGroupCondition {
  return {
    key: nextBuilderKey(),
    kind: "group",
    id: undefined,
    operator: "and",
    destroy: false,
    subs: [],
  };
}

function blankBuilderAction(executors: RegistryExecutor[]): BuilderAction {
  return {
    key: nextBuilderKey(),
    id: undefined,
    action_type: executors.length > 0 ? executors[0].key : "",
    value: "",
    destroy: false,
  };
}

function operatorOptions(filter: RegistryFilter | undefined): OptionPair[] {
  if (filter === undefined) return [];
  return filter.operators.map(([label, value]) => ({ label, value: String(value) }));
}

function optionPairs(options: unknown): OptionPair[] {
  if (!Array.isArray(options)) return [];
  return options
    .filter((entry): entry is [unknown, unknown] => Array.isArray(entry) && entry.length >= 2)
    .map(([label, value]) => ({ label: String(label), value: String(value) }));
}

function defaultOperator(filter: RegistryFilter | undefined): string {
  return operatorOptions(filter)[0]?.value ?? "=";
}

function blankSingleCondition(
  filters: RegistryFilter[],
): Extract<BuilderCondition, { kind: "single" }> {
  const fallback = filters.length > 0 ? filters[0] : undefined;
  const fallbackKey = fallback === undefined ? "" : fallback.key;
  return {
    key: nextBuilderKey(),
    kind: "single",
    id: undefined,
    condition_type: fallbackKey,
    operator: defaultOperator(fallback),
    value: "",
    destroy: false,
  };
}

function blankSubCondition(filters: RegistryFilter[]): BuilderSubCondition {
  const fallback = filters.length > 0 ? filters[0] : undefined;
  return {
    key: nextBuilderKey(),
    id: undefined,
    condition_type: fallback === undefined ? "" : fallback.key,
    operator: defaultOperator(fallback),
    value: "",
    destroy: false,
  };
}

function conditionFromRecord(
  condition: RuleCondition,
  filters: RegistryFilter[],
): BuilderCondition {
  if (condition.condition_type === "compound") {
    return {
      key: nextBuilderKey(),
      kind: "group",
      id: condition.id ?? undefined,
      operator: condition.operator === "or" ? "or" : "and",
      destroy: false,
      subs: condition.sub_conditions.map((sub) => ({
        key: nextBuilderKey(),
        id: sub.id ?? undefined,
        condition_type: sub.condition_type,
        operator: sub.operator,
        value: sub.value ?? "",
        destroy: false,
      })),
    };
  }
  const filter = filters.find((candidate) => candidate.key === condition.condition_type);
  const operator = condition.operator === "" ? defaultOperator(filter) : condition.operator;
  return {
    key: nextBuilderKey(),
    kind: "single",
    id: condition.id ?? undefined,
    condition_type: condition.condition_type,
    operator,
    value: condition.value ?? "",
    destroy: false,
  };
}

function actionFromRecord(action: RuleAction, executors: RegistryExecutor[]): BuilderAction {
  const fallback = executors[0]?.key ?? "";
  return {
    key: nextBuilderKey(),
    id: action.id ?? undefined,
    action_type: action.action_type === "" ? fallback : action.action_type,
    value: action.value ?? "",
    destroy: false,
  };
}

function ConditionValueInput({
  bootstrap,
  conditionType,
  filter,
  inputId,
  onChange,
  reference,
  value,
}: {
  bootstrap: Bootstrap;
  conditionType: string;
  filter: RegistryFilter | undefined;
  inputId: string;
  onChange: (value: string) => void;
  reference: {
    categories: Array<{ id: CategoryId; name: string }>;
    merchants: Array<{ id: MerchantId; name: string }>;
  };
  value: string;
}) {
  if (filter === undefined) {
    return (
      <FormField
        id={inputId}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        value={value}
      />
    );
  }
  if (filter.type === "select") {
    if (conditionType === "transaction_category") {
      return (
        <CategorySelect
          bootstrap={bootstrap}
          categories={reference.categories}
          onSelect={(categoryId) => {
            onChange(categoryId);
          }}
          selectedCategoryId={value === "" ? "" : CategoryIdSchema.parse(value)}
        />
      );
    }
    if (conditionType === "transaction_merchant") {
      return (
        <MerchantSelect
          bootstrap={bootstrap}
          merchants={reference.merchants}
          onSelect={(merchantId) => {
            onChange(merchantId);
          }}
          selectedMerchantId={value === "" ? "" : MerchantIdSchema.parse(value)}
        />
      );
    }
    const options = optionPairs(filter.options);
    return (
      <FormField
        as="select"
        id={inputId}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </FormField>
    );
  }
  if (filter.type === "number") {
    const step = typeof filter.number_step === "number" ? String(filter.number_step) : "0.01";
    return (
      <FormField
        id={inputId}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        placeholder="10"
        step={step}
        type="number"
        value={value}
      />
    );
  }
  return (
    <FormField
      id={inputId}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      placeholder={RULES_TEXT.value_placeholder}
      type="text"
      value={value}
    />
  );
}

function ActionValueInput({
  actionType,
  bootstrap,
  executor,
  inputId,
  onChange,
  reference,
  value,
}: {
  actionType: string;
  bootstrap: Bootstrap;
  executor: RegistryExecutor | undefined;
  inputId: string;
  onChange: (value: string) => void;
  reference: {
    categories: Array<{ id: CategoryId; name: string }>;
    merchants: Array<{ id: MerchantId; name: string }>;
    tags: Array<{ id: TagId; name: string }>;
  };
  value: string;
}) {
  if (executor === undefined) return null;
  if (executor.type === "function") return null;
  if (executor.type === "multi_select") {
    const selected: TagId[] = value === "" ? [] : z.array(TagIdSchema).parse(value.split(","));
    return (
      <TagSelect
        bootstrap={bootstrap}
        initialTags={reference.tags}
        onSelect={(tagIds) => {
          onChange(tagIds.join(","));
        }}
        selectedTagIds={selected}
        tags={reference.tags}
        triggerLabel={RULES_TEXT.to_label}
      />
    );
  }
  if (executor.type === "select") {
    if (actionType === "set_transaction_category") {
      return (
        <CategorySelect
          bootstrap={bootstrap}
          categories={reference.categories}
          onSelect={(categoryId) => {
            onChange(categoryId);
          }}
          selectedCategoryId={value === "" ? "" : CategoryIdSchema.parse(value)}
        />
      );
    }
    if (actionType === "set_transaction_merchant") {
      return (
        <MerchantSelect
          bootstrap={bootstrap}
          merchants={reference.merchants}
          onSelect={(merchantId) => {
            onChange(merchantId);
          }}
          selectedMerchantId={value === "" ? "" : MerchantIdSchema.parse(value)}
        />
      );
    }
    const options = optionPairs(executor.options);
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase text-primary">{RULES_TEXT.to_label}</span>
        <FormField
          as="select"
          id={inputId}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          value={value}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FormField>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium uppercase text-primary">{RULES_TEXT.to_label}</span>
      <FormField
        id={inputId}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        placeholder={RULES_TEXT.value_placeholder}
        type="text"
        value={value}
      />
    </div>
  );
}

type BuilderReference = {
  categories: Array<{ id: CategoryId; name: string }>;
  merchants: Array<{ id: MerchantId; name: string }>;
  tags: Array<{ id: TagId; name: string }>;
};

function BuilderConditionRow({
  bootstrap,
  condition,
  filters,
  index,
  onChange,
  onRemove,
  reference,
  showPrefix,
}: {
  bootstrap: Bootstrap;
  condition: Extract<BuilderCondition, { kind: "single" }>;
  filters: RegistryFilter[];
  index: number;
  onChange: (condition: Extract<BuilderCondition, { kind: "single" }>) => void;
  onRemove: () => void;
  reference: BuilderReference;
  showPrefix: boolean;
}) {
  const filter = filters.find((candidate) => candidate.key === condition.condition_type);
  const operators = operatorOptions(filter);
  return (
    <li className="flex items-center gap-3">
      {showPrefix ? (
        <div className="pl-2">
          <span className="text-xs font-medium uppercase">and</span>
        </div>
      ) : null}
      <div className="grid h-full w-full grid-cols-2 items-center gap-2">
        <FormField
          as="select"
          aria-label="Condition field"
          id={`condition-${condition.key}-type`}
          onChange={(event) => {
            const next = filters.find((candidate) => candidate.key === event.target.value);
            onChange({
              ...condition,
              condition_type: event.target.value,
              operator: defaultOperator(next),
              value: "",
            });
          }}
          value={condition.condition_type}
        >
          {filters.map((candidate) => (
            <option key={candidate.key} value={candidate.key}>
              {candidate.label}
            </option>
          ))}
        </FormField>
        <FormField
          as="select"
          aria-label="Condition operator"
          id={`condition-${condition.key}-operator`}
          onChange={(event) => {
            onChange({ ...condition, operator: event.target.value, value: "" });
          }}
          value={condition.operator}
        >
          {operators.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FormField>
        {condition.operator in VALUELESS_OPERATORS ? null : (
          <div className="col-span-2 w-full">
            <ConditionValueInput
              bootstrap={bootstrap}
              conditionType={condition.condition_type}
              filter={filter}
              inputId={`condition-${condition.key}-value`}
              onChange={(nextValue) => {
                onChange({ ...condition, value: nextValue });
              }}
              reference={reference}
              value={condition.value}
            />
          </div>
        )}
      </div>
      <IconButton
        icon="trash-2"
        label={`Remove condition ${index + 1}`}
        onClick={onRemove}
        size="sm"
      />
    </li>
  );
}

function BuilderConditionGroup({
  bootstrap,
  filters,
  group,
  onAddSub,
  onChange,
  onRemove,
  onRemoveSub,
  onUpdateSub,
  reference,
}: {
  bootstrap: Bootstrap;
  filters: RegistryFilter[];
  group: Extract<BuilderCondition, { kind: "group" }>;
  onAddSub: () => void;
  onChange: (group: Extract<BuilderCondition, { kind: "group" }>) => void;
  onRemove: () => void;
  onRemoveSub: (subKey: string) => void;
  onUpdateSub: (sub: BuilderSubCondition) => void;
  reference: BuilderReference;
}) {
  return (
    <li className="space-y-3 rounded-md border border-secondary p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm text-secondary">{RULES_TEXT.match_label}</p>
          <FormField
            as="select"
            aria-label="Match mode"
            id={`group-${group.key}-operator`}
            onChange={(event) => {
              onChange({ ...group, operator: event.target.value });
            }}
            value={group.operator}
          >
            <option value="and">{RULES_TEXT.all_label}</option>
            <option value="or">{RULES_TEXT.any_label}</option>
          </FormField>
          <p className="text-sm text-secondary">{RULES_TEXT.of_following}</p>
        </div>
        <IconButton icon="trash-2" label="Remove condition group" onClick={onRemove} size="sm" />
      </div>
      <ul className="space-y-3">
        {group.subs
          .filter((sub) => !sub.destroy)
          .map((sub) => {
            const filter = filters.find((candidate) => candidate.key === sub.condition_type);
            const operators = operatorOptions(filter);
            return (
              <li className="flex items-center gap-3" key={sub.key}>
                <div className="grid h-full w-full grid-cols-2 items-center gap-2">
                  <FormField
                    as="select"
                    aria-label="Condition field"
                    id={`sub-${sub.key}-type`}
                    onChange={(event) => {
                      const next = filters.find(
                        (candidate) => candidate.key === event.target.value,
                      );
                      onUpdateSub({
                        ...sub,
                        condition_type: event.target.value,
                        operator: defaultOperator(next),
                        value: "",
                      });
                    }}
                    value={sub.condition_type}
                  >
                    {filters.map((candidate) => (
                      <option key={candidate.key} value={candidate.key}>
                        {candidate.label}
                      </option>
                    ))}
                  </FormField>
                  <FormField
                    as="select"
                    aria-label="Condition operator"
                    id={`sub-${sub.key}-operator`}
                    onChange={(event) => {
                      onUpdateSub({ ...sub, operator: event.target.value, value: "" });
                    }}
                    value={sub.operator}
                  >
                    {operators.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </FormField>
                  {sub.operator in VALUELESS_OPERATORS ? null : (
                    <div className="col-span-2 w-full">
                      <ConditionValueInput
                        bootstrap={bootstrap}
                        conditionType={sub.condition_type}
                        filter={filter}
                        inputId={`sub-${sub.key}-value`}
                        onChange={(nextValue) => {
                          onUpdateSub({ ...sub, value: nextValue });
                        }}
                        reference={reference}
                        value={sub.value}
                      />
                    </div>
                  )}
                </div>
                <IconButton
                  icon="trash-2"
                  label="Remove sub condition"
                  onClick={() => {
                    onRemoveSub(sub.key);
                  }}
                  size="sm"
                />
              </li>
            );
          })}
      </ul>
      <Button onClick={onAddSub} variant="ghost">
        {RULES_TEXT.add_sub_condition}
      </Button>
    </li>
  );
}

function BuilderActionRow({
  action,
  bootstrap,
  executors,
  index,
  onChange,
  onRemove,
  reference,
}: {
  action: BuilderAction;
  bootstrap: Bootstrap;
  executors: RegistryExecutor[];
  index: number;
  onChange: (action: BuilderAction) => void;
  onRemove: () => void;
  reference: BuilderReference;
}) {
  const executor = executors.find((candidate) => candidate.key === action.action_type);
  return (
    <li className="flex items-center gap-3">
      <div className="grid h-full w-full grid-cols-1 items-center gap-2">
        <FormField
          as="select"
          aria-label="Action type"
          id={`action-${action.key}-type`}
          onChange={(event) => {
            onChange({ ...action, action_type: event.target.value, value: "" });
          }}
          value={action.action_type}
        >
          {executors.map((candidate) => (
            <option key={candidate.key} value={candidate.key}>
              {candidate.label}
            </option>
          ))}
        </FormField>
        <ActionValueInput
          actionType={action.action_type}
          bootstrap={bootstrap}
          executor={executor}
          inputId={`action-${action.key}-value`}
          onChange={(nextValue) => {
            onChange({ ...action, value: nextValue });
          }}
          reference={reference}
          value={action.value}
        />
      </div>
      <IconButton
        icon="trash-2"
        label={`Remove action ${index + 1}`}
        onClick={onRemove}
        size="sm"
      />
    </li>
  );
}

export function RuleFormPage({
  bootstrap,
  formPath,
  mode,
  onDone,
  rulesPath,
  submitPath,
}: {
  bootstrap: Bootstrap;
  formPath: string;
  mode: "new" | "edit";
  onDone: () => void;
  rulesPath: string;
  submitPath: string;
}) {
  const formQuery = useQuery(ruleFormQueryOptions(formPath));
  const payload = formQuery.data;

  if (formQuery.isError) {
    return (
      <section className="space-y-4">
        <Alert live="alert" variant="error">
          <p className="mb-3">{RULES_TEXT.form_unavailable}</p>
          <Button
            onClick={() => {
              void formQuery.refetch();
            }}
            variant="secondary"
          >
            {RULES_TEXT.try_again}
          </Button>
        </Alert>
      </section>
    );
  }

  if (payload === undefined)
    return <output aria-busy="true" className="block h-40 animate-pulse rounded-xl bg-container" />;

  return (
    <RuleFormEditor
      bootstrap={bootstrap}
      executors={payload.registry.executors}
      filters={payload.registry.filters}
      initial={payload.rule}
      key={`${formPath}:${payload.rule.id ?? "new"}`}
      mode={mode}
      onDone={onDone}
      rulesPath={rulesPath}
      submitPath={submitPath}
    />
  );
}

function RuleFormEditor({
  bootstrap,
  executors,
  filters,
  initial,
  mode,
  onDone,
  rulesPath,
  submitPath,
}: {
  bootstrap: Bootstrap;
  executors: RegistryExecutor[];
  filters: RegistryFilter[];
  initial: RuleForm["rule"];
  mode: "new" | "edit";
  onDone: () => void;
  rulesPath: string;
  submitPath: string;
}) {
  const queryClient = useQueryClient();
  const referenceQuery = useQuery(
    referenceDataQueryOptions(
      bootstrap.apiPaths.categories,
      bootstrap.apiPaths.merchants,
      bootstrap.apiPaths.tags,
    ),
  );
  const [name, setName] = useState(initial.name ?? "");
  const [conditions, setConditions] = useState<BuilderCondition[]>(() => {
    const seeded = initial.conditions.map((condition) => conditionFromRecord(condition, filters));
    if (seeded.length === 0) seeded.push(blankSingleCondition(filters));
    return seeded;
  });
  const [actions, setActions] = useState<BuilderAction[]>(() => {
    const seeded = initial.actions.map((action) => actionFromRecord(action, executors));
    if (seeded.length === 0 && executors.length > 0) {
      const first = executors[0];
      seeded.push({
        key: nextBuilderKey(),
        id: undefined,
        action_type: first.key,
        value: "",
        destroy: false,
      });
    }
    return seeded;
  });
  const [scopeAll, setScopeAll] = useState(initial.effective_date === null);
  const [effectiveDate, setEffectiveDate] = useState(initial.effective_date ?? "");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [created, setCreated] = useState<{ confirm: RuleConfirm; ruleId: string } | null>(null);
  const reference: BuilderReference = useMemo(
    () => ({
      categories: (referenceQuery.data?.categories ?? []).map((category) => ({
        id: category.id,
        name: category.name,
      })),
      merchants: (referenceQuery.data?.merchants ?? []).map((merchant) => ({
        id: merchant.id,
        name: merchant.name,
      })),
      tags: (referenceQuery.data?.tags ?? []).map((tag) => ({ id: tag.id, name: tag.name })),
    }),
    [referenceQuery.data],
  );

  function updateCondition(key: string, next: BuilderCondition): void {
    setConditions((current) => current.map((item) => (item.key === key ? next : item)));
  }

  function removeCondition(condition: BuilderCondition): void {
    if (condition.id === undefined)
      setConditions((current) => current.filter((item) => item.key !== condition.key));
    else updateCondition(condition.key, { ...condition, destroy: true });
  }

  function updateAction(key: string, next: BuilderAction): void {
    setActions((current) => current.map((item) => (item.key === key ? next : item)));
  }

  function removeAction(action: BuilderAction): void {
    if (action.id === undefined)
      setActions((current) => current.filter((item) => item.key !== action.key));
    else updateAction(action.key, { ...action, destroy: true });
  }

  function buildInput(): RuleFormInput {
    const conditionsAttributes: RuleFormInput["conditions_attributes"] = {};
    let conditionIndex = 0;
    for (const condition of conditions) {
      if (condition.kind === "group") {
        const subInputs: Record<
          string,
          {
            id?: string;
            condition_type: string;
            operator: string;
            value?: string | null;
            destroy?: boolean;
          }
        > = {};
        let subIndex = 0;
        for (const sub of condition.subs) {
          if (sub.id !== undefined) {
            subInputs[String(subIndex)] = {
              id: sub.id,
              condition_type: sub.condition_type,
              operator: sub.operator,
              value: sub.value,
              destroy: sub.destroy,
            };
            subIndex += 1;
          } else if (!sub.destroy) {
            subInputs[String(subIndex)] = {
              condition_type: sub.condition_type,
              operator: sub.operator,
              value: sub.value,
            };
            subIndex += 1;
          }
        }
        if (condition.id !== undefined) {
          conditionsAttributes[String(conditionIndex)] = {
            id: condition.id,
            condition_type: "compound",
            operator: condition.operator,
            destroy: condition.destroy,
            sub_conditions_attributes: subInputs,
          };
          conditionIndex += 1;
        } else if (!condition.destroy) {
          conditionsAttributes[String(conditionIndex)] = {
            condition_type: "compound",
            operator: condition.operator,
            sub_conditions_attributes: subInputs,
          };
          conditionIndex += 1;
        }
      } else if (condition.id !== undefined) {
        conditionsAttributes[String(conditionIndex)] = {
          id: condition.id,
          condition_type: condition.condition_type,
          operator: condition.operator,
          value: condition.value,
          destroy: condition.destroy,
        };
        conditionIndex += 1;
      } else if (!condition.destroy) {
        conditionsAttributes[String(conditionIndex)] = {
          condition_type: condition.condition_type,
          operator: condition.operator,
          value: condition.value,
        };
        conditionIndex += 1;
      }
    }
    const actionsAttributes: RuleFormInput["actions_attributes"] = {};
    let actionIndex = 0;
    for (const action of actions) {
      if (action.id !== undefined) {
        actionsAttributes[String(actionIndex)] = {
          id: action.id,
          action_type: action.action_type,
          value: action.value,
          destroy: action.destroy,
        };
        actionIndex += 1;
      } else if (!action.destroy) {
        actionsAttributes[String(actionIndex)] = {
          action_type: action.action_type,
          value: action.value,
        };
        actionIndex += 1;
      }
    }
    return {
      name: name === "" ? null : name,
      resource_type: initial.resource_type,
      effective_date: scopeAll ? null : effectiveDate === "" ? null : effectiveDate,
      conditions_attributes: conditionsAttributes,
      actions_attributes: actionsAttributes,
    };
  }

  function submitNew(input: RuleFormInput): void {
    createRule(submitPath, input)
      .then((result) => {
        void invalidateRulesQueries(queryClient);
        if (result.rule.id !== null)
          setCreated({ confirm: result.confirm, ruleId: result.rule.id });
        else onDone();
      })
      .catch((caught: unknown) => {
        setErrors(collectErrors(caught, RULES_TEXT.save_error));
      })
      .finally(() => {
        setSaving(false);
      });
  }

  function submitEdit(input: RuleFormInput): void {
    updateRule(submitPath, input)
      .then(() => {
        void invalidateRulesQueries(queryClient);
        onDone();
      })
      .catch((caught: unknown) => {
        setErrors(collectErrors(caught, RULES_TEXT.save_error));
      })
      .finally(() => {
        setSaving(false);
      });
  }

  function submit(): void {
    setSaving(true);
    setErrors([]);
    if (mode === "new") submitNew(buildInput());
    else submitEdit(buildInput());
  }

  const visibleConditions = conditions.filter((condition) => !condition.destroy);
  const visibleActions = actions.filter((action) => !action.destroy);
  const resourceLabel = `${initial.resource_type}s`;

  return (
    <section aria-labelledby="rule-form-title" className="space-y-6">
      <h1 className="text-xl font-medium text-primary" id="rule-form-title">
        {mode === "new" ? RULES_TEXT.new_rule : RULES_TEXT.edit}
      </h1>

      {errors.length === 0 ? null : (
        <Alert live="alert" variant="error">
          <ul className="list-disc pl-5">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="space-y-4">
        <div className="flex items-center gap-1 text-secondary">
          <Icon name="tag" size="sm" />
          <h3 className="text-sm font-medium text-primary">{RULES_TEXT.rule_name_label}</h3>
        </div>
        <div className="ml-6">
          <FormField
            id="rule-name"
            onChange={(event) => {
              setName(event.target.value);
            }}
            placeholder={RULES_TEXT.rule_name_placeholder}
            value={name}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-1 text-secondary">
          <h3 className="text-sm font-medium text-primary">IF</h3>
        </div>
        <div className="ml-6 space-y-4">
          <ul className="space-y-3">
            {visibleConditions.map((condition, position) => {
              if (condition.kind === "group") {
                return (
                  <BuilderConditionGroup
                    bootstrap={bootstrap}
                    filters={filters}
                    group={condition}
                    key={condition.key}
                    onAddSub={() => {
                      updateCondition(condition.key, {
                        ...condition,
                        subs: [...condition.subs, blankSubCondition(filters)],
                      });
                    }}
                    onChange={(next) => {
                      updateCondition(condition.key, next);
                    }}
                    onRemove={() => {
                      removeCondition(condition);
                    }}
                    onRemoveSub={(subKey) => {
                      const sub = condition.subs.find((item) => item.key === subKey);
                      if (sub === undefined) return;
                      if (sub.id === undefined) {
                        updateCondition(condition.key, {
                          ...condition,
                          subs: condition.subs.filter((item) => item.key !== subKey),
                        });
                      } else {
                        updateCondition(condition.key, {
                          ...condition,
                          subs: condition.subs.map((item) =>
                            item.key === subKey ? { ...item, destroy: true } : item,
                          ),
                        });
                      }
                    }}
                    onUpdateSub={(sub) => {
                      updateCondition(condition.key, {
                        ...condition,
                        subs: condition.subs.map((item) => (item.key === sub.key ? sub : item)),
                      });
                    }}
                    reference={reference}
                  />
                );
              }
              return (
                <BuilderConditionRow
                  bootstrap={bootstrap}
                  condition={condition}
                  filters={filters}
                  index={position}
                  key={condition.key}
                  onChange={(next) => {
                    updateCondition(condition.key, next);
                  }}
                  onRemove={() => {
                    removeCondition(condition);
                  }}
                  reference={reference}
                  showPrefix={position > 0}
                />
              );
            })}
          </ul>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setConditions((current) => [...current, blankSingleCondition(filters)]);
              }}
              variant="ghost"
            >
              {RULES_TEXT.add_condition}
            </Button>
            <Button
              onClick={() => {
                setConditions((current) => [...current, blankGroupCondition()]);
              }}
              variant="ghost"
            >
              {RULES_TEXT.add_condition_group}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-1 text-secondary">
          <h3 className="text-sm font-medium text-primary">{RULES_TEXT.then_label}</h3>
        </div>
        <div className="ml-6 space-y-4">
          <ul className="space-y-3">
            {visibleActions.map((action, position) => (
              <BuilderActionRow
                action={action}
                bootstrap={bootstrap}
                executors={executors}
                index={position}
                key={action.key}
                onChange={(next) => {
                  updateAction(action.key, next);
                }}
                onRemove={() => {
                  removeAction(action);
                }}
                reference={reference}
              />
            ))}
          </ul>
          <Button
            onClick={() => {
              setActions((current) => [...current, blankBuilderAction(executors)]);
            }}
            variant="ghost"
          >
            {RULES_TEXT.add_action}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-1 text-secondary">
          <h3 className="text-sm font-medium text-primary">FOR</h3>
        </div>
        <div className="ml-6 space-y-3">
          <label className="flex items-center gap-2 text-sm text-primary">
            <input
              checked={scopeAll}
              name="rule-scope"
              onChange={() => {
                setScopeAll(true);
                setEffectiveDate("");
              }}
              type="radio"
            />
            {RULES_TEXT.all_past_and_future} {resourceLabel}
          </label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-primary">
              <input
                checked={!scopeAll}
                name="rule-scope"
                onChange={() => {
                  setScopeAll(false);
                }}
                type="radio"
              />
              {RULES_TEXT.starting_from}
            </label>
            <FormField
              id="rule-effective-date"
              onChange={(event) => {
                setEffectiveDate(event.target.value);
              }}
              type="date"
              value={effectiveDate}
            />
          </div>
        </div>
      </div>

      <Button
        disabled={saving}
        onClick={() => {
          submit();
        }}
        type="button"
      >
        {saving ? RULES_TEXT.saving : RULES_TEXT.save_rule}
      </Button>

      {created === null ? null : (
        <ApplyConfirmDialog
          confirm={created.confirm}
          onApply={() => {
            const ruleId = created.ruleId;
            setErrors([]);
            applyRule(`${rulesPath}/${ruleId}/apply`)
              .then(() => {
                void invalidateRulesQueries(queryClient);
                onDone();
              })
              .catch((caught: unknown) => {
                setCreated(null);
                setErrors([failMessage(caught, RULES_TEXT.apply_error)]);
              });
          }}
          onCancel={() => {
            setCreated(null);
            onDone();
          }}
          title={RULES_TEXT.confirm_title}
        />
      )}
    </section>
  );
}
