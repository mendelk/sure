import type { SureqlResult } from "./api/transactions";

export interface ChartPoint {
  /** Raw cell text for the data table. */
  label: string;
  /** Parsed epoch ms for axis ticks. Falls back to index order when unparseable. */
  time: number;
  value: number;
}

export interface ChartMapping {
  xColumn: string;
  yColumn: string;
  points: ChartPoint[];
}

// Auto mapping: first date-like column becomes x, first numeric column
// becomes y. Returns undefined when no chartable pair exists so the card can
// fall back to the table without losing data.
export function mapRowsToChart(
  columns: string[],
  rows: Record<string, unknown>[],
): ChartMapping | undefined {
  const xColumn = columns.find((column) =>
    rows.some((row) => parseDateValue(row[column]) !== undefined),
  );
  if (xColumn === undefined) return undefined;
  const yColumn = columns
    .filter((column) => column !== xColumn)
    .find((column) => rows.some((row) => parseNumberValue(row[column]) !== undefined));
  if (yColumn === undefined) return undefined;

  const points: ChartPoint[] = [];
  for (const row of rows) {
    const cell: unknown = row[xColumn];
    let label: string;
    if (cell === null || cell === undefined) label = "";
    else if (typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean")
      label = String(cell);
    else label = JSON.stringify(cell);
    const y = parseNumberValue(row[yColumn]);
    if (y === undefined) continue;
    const time = parseDateValue(cell) ?? Number.NaN;
    points.push({ label, time, value: y });
  }
  if (points.length < 2) return undefined;
  points.sort((a, b) => {
    if (Number.isNaN(a.time) || Number.isNaN(b.time)) return 0;
    return a.time - b.time;
  });
  return { xColumn, yColumn, points };
}

function parseDateValue(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  // Accept ISO dates and datetimes; reject bare numbers/IDs.
  if (!/[-/T:]/u.test(trimmed)) return undefined;
  const time = Date.parse(trimmed);
  if (Number.isNaN(time)) return undefined;
  return time;
}

function parseNumberValue(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const trimmed = value.trim().replaceAll(",", "");
    if (trimmed.length === 0) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function chartMappingForResult(result: SureqlResult): ChartMapping | undefined {
  const columns =
    result.columns.length > 0
      ? result.columns
      : result.rows.length > 0
        ? Object.keys(result.rows[0])
        : [];
  return mapRowsToChart(columns, result.rows);
}
