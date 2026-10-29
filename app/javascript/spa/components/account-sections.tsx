// eslint-disable import/max-dependencies -- Account sections compose the standard action, table, form, alert, and chart primitives.
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { AccountCard, AccountDataTable, AccountSearch, AccountSection } from "../api/accounts";
import type { AccountId } from "../ids";
import { AccountActionControl } from "./account-actions";
import { StatementUploadForm } from "./statement-upload-form";
import { FormField } from "./form-field";
import { Table, type ColumnStyle, type TableFeatures } from "./table";
import { Alert } from "./alert";
import { BrandLogo } from "./brand-logo";
import { DonutChart } from "./donut-chart";

export const ACCOUNT_TONES = {
  primary: "text-primary",
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-warning",
} as const;
export const ACCOUNT_COLORS = {
  primary: "var(--utility-text-primary)",
  success: "var(--color-success)",
  destructive: "var(--color-destructive)",
} as const;
export function AccountCards({ cards }: { cards: AccountCard[] }) {
  if (cards.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-primary bg-container p-4">
          <p className="text-sm text-secondary">{card.label}</p>
          <p
            className={`privacy-sensitive mt-1 text-xl font-medium tabular-nums ${ACCOUNT_TONES[card.tone]}`}
          >
            {card.value}
          </p>
          {card.description !== null && card.description !== "" ? (
            <p className="mt-1 text-xs text-secondary">{card.description}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
function AccountProgress({ progress }: { progress: NonNullable<AccountSection["progress"]> }) {
  const percent = Math.min(100, Math.max(0, progress.percent));
  const slices = useMemo(
    () => [
      { id: "paid", label: progress.label, value: percent, color: ACCOUNT_COLORS.success },
      {
        id: "remaining",
        label: progress.description,
        value: 100 - percent,
        color: "var(--color-container-inset)",
      },
    ],
    [percent, progress.label, progress.description],
  );
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative size-32">
        <DonutChart
          slices={slices}
          height={128}
          ariaLabel={progress.label}
          innerRadiusRatio={0.78}
          interactive={false}
        />
        <span className="privacy-sensitive pointer-events-none absolute inset-0 flex items-center justify-center text-xl font-medium text-primary">
          {new Intl.NumberFormat(document.documentElement.lang || undefined, {
            maximumFractionDigits: 1,
          }).format(percent)}
          %
        </span>
      </div>
      <div>
        <p className="font-medium text-primary">{progress.label}</p>
        <p className="text-sm text-secondary">{progress.description}</p>
        <progress className="sr-only" value={percent} max={100} aria-label={progress.label} />
      </div>
    </div>
  );
}
function AccountSectionTable({
  table,
  accountId,
  search,
  text,
  tableText,
}: {
  table: AccountDataTable;
  accountId: AccountId;
  search: AccountSearch;
  text: Record<string, string>;
  tableText: Record<string, string>;
}) {
  const columns = useMemo<ColumnDef<TableFeatures, AccountDataTable["rows"][number]>[]>(() => {
    const result: ColumnDef<TableFeatures, AccountDataTable["rows"][number]>[] = table.columns.map(
      (column) => ({
        id: column.key,
        header: column.label,
        // eslint-disable-next-line react/no-unstable-nested-components -- TanStack Table owns the memoized column cell-render callback.
        cell: ({ row }) => {
          if (!Object.hasOwn(row.original.cells, column.key)) return null;
          const cell = row.original.cells[column.key];
          return (
            <div
              className={`${cell.logo !== null && cell.logo !== undefined ? "flex items-center gap-3" : ""} ${ACCOUNT_TONES[cell.tone]} ${cell.privacy ? "privacy-sensitive" : ""}`}
            >
              {cell.logo !== null && cell.logo !== undefined ? (
                <BrandLogo
                  className="size-9 rounded-full bg-container-inset text-sm font-medium text-secondary"
                  src={cell.logo.url}
                >
                  {cell.logo.text.slice(0, 1).toUpperCase()}
                </BrandLogo>
              ) : null}
              <div>
                {cell.href !== null && cell.href !== "" ? (
                  <a href={cell.href} className="hover:underline">
                    {cell.text}
                  </a>
                ) : (
                  cell.text
                )}
                {cell.secondary !== null && cell.secondary !== "" ? (
                  <p className="mt-1 text-xs text-secondary">{cell.secondary}</p>
                ) : null}
              </div>
            </div>
          );
        },
      }),
    );
    if (table.rows.some((row) => row.actions.length > 0)) {
      result.push({
        id: "actions",
        header: "",
        // eslint-disable-next-line react/no-unstable-nested-components -- TanStack Table owns the memoized column cell-render callback.
        cell: ({ row }) => (
          <div className="flex flex-wrap justify-end gap-1">
            {row.original.actions.map((action) => (
              <AccountActionControl
                key={action.key}
                action={action}
                accountId={accountId}
                search={search}
                text={text}
              />
            ))}
          </div>
        ),
      });
    }
    return result;
  }, [table, accountId, search, text]);
  const styles = useMemo(
    () =>
      new Map<string, ColumnStyle>(
        table.columns.map((column) => [column.key, { numeric: column.numeric }]),
      ),
    [table.columns],
  );
  return (
    <Table
      data={table.rows}
      columns={columns}
      styles={styles}
      offset={0}
      label={table.label}
      text={{ ...tableText, no_results: table.empty_message }}
      rowClassName={(row) =>
        row.past ? "bg-container-inset text-secondary [&_td]:text-secondary" : ""
      }
    />
  );
}
export function AccountSectionView({
  section,
  accountId,
  search,
  text,
  tableText,
  onSearchChange,
}: {
  section: AccountSection;
  accountId: AccountId;
  search: AccountSearch;
  text: Record<string, string>;
  tableText: Record<string, string>;
  onSearchChange: (patch: Partial<AccountSearch>) => void;
}) {
  return (
    <section className="space-y-4 rounded-xl bg-container p-4 shadow-border-xs">
      {(section.title !== null && section.title !== "") || section.actions.length > 0 ? (
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {section.title !== null && section.title !== "" ? (
              <h2 className="text-lg font-medium text-primary">{section.title}</h2>
            ) : null}
            {section.description !== null && section.description !== "" ? (
              <p className="mt-1 text-sm text-secondary">{section.description}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {section.actions.map((action) => (
              <AccountActionControl
                key={action.key}
                action={action}
                accountId={accountId}
                search={search}
                text={text}
              />
            ))}
          </div>
        </header>
      ) : section.description !== null && section.description !== "" ? (
        <p className="text-sm text-secondary">{section.description}</p>
      ) : null}
      <AccountCards cards={section.cards} />
      {section.notices.map((notice) => (
        <Alert key={notice} variant="warning">
          {notice}
        </Alert>
      ))}
      {section.fields.length > 0 ? (
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {section.fields.map((field) => (
            <div key={field.label} title={field.tooltip ?? undefined}>
              <dt className="text-sm text-secondary">{field.label}</dt>
              <dd className="privacy-sensitive mt-1 font-medium text-primary">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {section.progress ? <AccountProgress progress={section.progress} /> : null}
      {section.coverage ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-secondary">{section.coverage.range}</p>
            <FormField
              as="select"
              id={`${section.key}-year`}
              label={text.year}
              value={section.coverage.selected_year}
              onChange={(event) => {
                onSearchChange({ statement_year: Number(event.target.value) });
              }}
            >
              {section.coverage.years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12">
            {section.coverage.months.map((month) => (
              <div
                key={month.key}
                title={month.status_label}
                className={`rounded-lg border border-primary p-2 text-center ${month.tone === "success" ? "bg-success/10" : month.tone === "destructive" ? "bg-destructive/10" : month.tone === "warning" ? "bg-warning/10" : "bg-container-inset"}`}
              >
                <p className="text-sm font-medium text-primary">{month.label}</p>
                <p className="mt-1 text-xs text-secondary">{month.status_label}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {section.upload ? (
        <div className="rounded-xl border border-primary p-4">
          <StatementUploadForm
            id={section.key}
            accountId={section.upload.account_id}
            accept={section.upload.accept}
            label={section.upload.label}
            hint={section.upload.hint}
            submitLabel={section.upload.submit_label}
          />
        </div>
      ) : null}
      {section.table ? (
        <AccountSectionTable
          table={section.table}
          accountId={accountId}
          search={search}
          text={text}
          tableText={tableText}
        />
      ) : null}
    </section>
  );
}
