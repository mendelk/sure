import type { Nodes, Root, Text, InlineCode, Code } from "mdast";

const pathIdentifier = /^[A-Za-z_$][\w$]*$/u;

const blockedKeys: Record<"__proto__" | "prototype" | "constructor", true> = {
  ["__proto__"]: true,
  prototype: true,
  constructor: true,
};

const expressionBoundaries: Partial<Record<Nodes["type"], true>> = {
  paragraph: true,
  heading: true,
  tableCell: true,
  break: true,
  code: true,
  html: true,
};

export function parsePath(path: string, bareIdentifiersOnly = false): string[] | undefined {
  const token = /([^.[\]]+)|\[\s*(?:(\d+)|"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\s*\]/uy;
  const parts: string[] = [];
  let index = 0;
  while (index < path.length) {
    token.lastIndex = index;
    const match = token.exec(path);
    if (!match) return undefined;
    if (bareIdentifiersOnly && match[1] && !pathIdentifier.test(match[1])) return undefined;
    parts.push(
      match.at(1) ?? match.at(2) ?? (match.at(3) ?? match.at(4) ?? "").replaceAll(/\\(.)/gu, "$1"),
    );
    index = token.lastIndex;
    if (index === path.length) break;
    if (path[index] === ".") {
      index++;
      if (index === path.length || ".[]".includes(path[index])) return undefined;
    } else if (path[index] !== "[") return undefined;
  }
  return parts.length > 0 ? parts : undefined;
}

function isDataObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

/** Lodash-style dot/bracket lookup, restricted to own properties of source data. */
export function resolveSourcePath(data: unknown, path: string): unknown {
  if (isDataObject(data) && !Object.hasOwn(blockedKeys, path) && Object.hasOwn(data, path))
    return data[path];
  const parts = parsePath(path);
  if (!parts || parts.some((part) => Object.hasOwn(blockedKeys, part))) return undefined;
  let value = data;
  for (const part of parts) {
    if (typeof value === "string") {
      if (part === "length") value = value.length;
      else if (/^(?:0|[1-9]\d*)$/u.test(part) && Number(part) < value.length)
        value = value[Number(part)];
      else return undefined;
    } else {
      if (!isDataObject(value) || !Object.hasOwn(value, part)) return undefined;
      value = value[part];
    }
  }
  return value;
}

/** Resolve Markdown text nodes only, including paths split across inline formatting. */
export function transformSourceExpressions(
  tree: Root,
  replace: (path: string) => string | undefined,
): void {
  const groups: (Text | InlineCode | Code)[][] = [];
  let group: (Text | InlineCode | Code)[] = [];
  const flush = () => {
    if (group.length > 0) groups.push(group);
    group = [];
  };
  const visit = (node: Nodes) => {
    const boundary = Object.hasOwn(expressionBoundaries, node.type);
    if (boundary) flush();
    if (node.type === "text" || node.type === "inlineCode" || node.type === "code")
      group.push(node);
    if ("children" in node) for (const child of node.children) visit(child);
    if (boundary) flush();
  };
  visit(tree);
  flush();
  for (const nodes of groups) {
    const text = nodes.map((node) => node.value).join("");
    const matches = [...text.matchAll(/\{([^{}]+)\}/gu)];
    const offsets: number[] = [];
    let offset = 0;
    for (const node of nodes) {
      offsets.push(offset);
      offset += node.value.length;
    }
    for (let matchIndex = matches.length - 1; matchIndex >= 0; matchIndex--) {
      const match = matches[matchIndex];
      const replacement = replace(match[1].trim());
      if (replacement === undefined) continue;
      const start = match.index;
      const end = start + match[0].length;
      const first = offsets.findIndex(
        (position, index) => position <= start && (offsets[index + 1] ?? offset) > start,
      );
      const last = offsets.findIndex(
        (position, index) => position < end && (offsets[index + 1] ?? offset) >= end,
      );
      const suffix = nodes[last].value.slice(end - offsets[last]);
      nodes[first].value =
        nodes[first].value.slice(0, start - offsets[first]) +
        replacement +
        (first === last ? suffix : "");
      for (let index = first + 1; index < last; index++) nodes[index].value = "";
      if (first !== last) nodes[last].value = suffix;
    }
  }
}

/** Interpolate values using their field kind and fixed or per-row currency. */
export function interpolateSourceText(text: string, data: unknown): string {
  const formatters = new Map<string, Intl.NumberFormat>();
  return text.replaceAll(/\{([^{}]+)\}/gu, (expression: string, rawPath: string): string => {
    const path = rawPath.trim();
    const value = resolveSourcePath(data, path);
    if (value === undefined || typeof value === "function" || typeof value === "symbol")
      return expression;
    if (value === null) return "";
    const parts = parsePath(path);
    if (
      parts?.length === 3 &&
      parts[0] === "result" &&
      isDataObject(data) &&
      isDataObject(data.metadata) &&
      Array.isArray(data.metadata.fields) &&
      Array.isArray(data.metadata.rows) &&
      ((typeof value === "number" && Number.isFinite(value)) ||
        (typeof value === "string" && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/iu.test(value)))
    ) {
      const field: unknown = data.metadata.fields.find(
        (candidate: unknown) => isDataObject(candidate) && candidate.key === parts[2],
      );
      const row: unknown = data.metadata.rows[Number(parts[1])];
      if (isDataObject(field)) {
        const currency = field.currency ?? (isDataObject(row) ? row.currency : undefined);
        const key =
          field.kind === "currency" && typeof currency === "string" && /^[A-Z]{3}$/u.test(currency)
            ? currency
            : field.kind === "number"
              ? "number"
              : undefined;
        if (key !== undefined) {
          let formatter = formatters.get(key);
          if (!formatter) {
            formatter = new Intl.NumberFormat(
              document.documentElement.lang || undefined,
              key === "number"
                ? { maximumFractionDigits: 20 }
                : { style: "currency", currency: key },
            );
            formatters.set(key, formatter);
          }
          // eslint-disable-next-line typescript/no-unsafe-type-assertion -- ECMA-402 formats exact decimal strings without converting them to doubles.
          return (formatter.format as (amount: string | number) => string)(value);
        }
      }
    }
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint")
      return String(value);
    return JSON.stringify(value);
  });
}

/** Bound suggestions, not lookup: manually typed paths can address any result row. */
export function sourceVariablePaths(data: unknown): string[] {
  const paths: string[] = [];
  const visit = (value: unknown, path: string) => {
    if (paths.length >= 200) return;
    if (value === null || typeof value !== "object") {
      if (path) paths.push(path);
      return;
    }
    if (Array.isArray(value)) {
      paths.push(`${path}.length`);
      for (let index = 0; index < value.length && paths.length < 200; index++)
        visit(value[index], `${path}[${index}]`);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (paths.length >= 200) break;
      if (Object.hasOwn(blockedKeys, key)) continue;
      const next = pathIdentifier.test(key)
        ? `${path}${path ? "." : ""}${key}`
        : `${path}[${JSON.stringify(key)}]`;
      visit(child, next);
    }
  };
  visit(data, "");
  return paths;
}
