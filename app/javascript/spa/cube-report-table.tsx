import { useMemo } from "react";
import type { CubeMeasure } from "./api/cube";

interface CubeTableRow {
  key: string;
  label: string;
  values: (string | number | null)[];
}

// Intl accepts decimal strings without losing precision; TypeScript's format
// signature only accepts number/bigint. Reflect.apply preserves the string.
function formatExact(format: Intl.NumberFormat["format"], value: string | number): string {
  const formatted: unknown = Reflect.apply(format, undefined, [value]);
  if (typeof formatted !== "string") throw new TypeError("Invalid number format result");
  return formatted;
}

export function CubeReportTable({
  rows,
  columns,
  currency,
  name,
  groupLabel,
  emptyText,
}: {
  rows: CubeTableRow[];
  columns: { id: CubeMeasure; label: string }[];
  currency: string;
  name: string;
  groupLabel: string;
  emptyText: string;
}) {
  const locale = document.documentElement.lang || "en";
  const moneyFormatter = useMemo(() => {
    const formatter = new Intl.NumberFormat(locale, { style: "currency", currency });
    return formatter.format.bind(formatter);
  }, [locale, currency]);
  const countFormatter = useMemo(() => {
    const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    return formatter.format.bind(formatter);
  }, [locale]);

  if (rows.length === 0) return <p className="p-6 text-center text-secondary">{emptyText}</p>;

  return (
    <section
      aria-label={name}
      className="max-h-96 overflow-auto rounded-xl border border-primary focus-ring"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll this named table region.
      tabIndex={0}
    >
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{name}</caption>
        <thead className="bg-surface text-secondary">
          <tr className="border-b border-primary">
            <th scope="col" className="sticky top-0 bg-surface px-4 py-3 text-left font-medium">
              {groupLabel}
            </th>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className="sticky top-0 whitespace-nowrap bg-surface px-4 py-3 text-right font-medium"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-primary last:border-b-0">
              <th scope="row" className="px-4 py-3 text-left font-medium text-primary">
                {row.label}
              </th>
              {columns.map((column, index) => {
                const value = row.values[index];
                return (
                  <td
                    key={column.id}
                    className="privacy-sensitive whitespace-nowrap px-4 py-3 text-right tabular-nums text-primary"
                  >
                    {value === null
                      ? "—"
                      : formatExact(
                          column.id === "cash_flow.count" ? countFormatter : moneyFormatter,
                          value,
                        )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
