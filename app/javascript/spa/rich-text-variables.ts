const blockedKeys: Record<"__proto__" | "prototype" | "constructor", true> = {
  ["__proto__"]: true,
  prototype: true,
  constructor: true,
};

export function parsePath(path: string): string[] | undefined {
  const token = /([^.[\]]+)|\[\s*(?:(\d+)|"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\s*\]/uy;
  const parts: string[] = [];
  let index = 0;
  while (index < path.length) {
    token.lastIndex = index;
    const match = token.exec(path);
    if (!match) return undefined;
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

const blockTags: Record<string, true> = {
  P: true,
  DIV: true,
  H1: true,
  H2: true,
  H3: true,
  H4: true,
  H5: true,
  H6: true,
  LI: true,
  PRE: true,
  BLOCKQUOTE: true,
  TD: true,
  TH: true,
  UL: true,
  OL: true,
};

/** Resolve text only: never interpolate markup, URLs, or HTML attributes. */
export function transformSourceExpressions(
  html: string,
  replace: (path: string) => string | undefined,
): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  const groups: Text[][] = [];
  let group: Text[] = [];
  const flush = () => {
    if (group.length > 0) groups.push(group);
    group = [];
  };
  const visit = (node: Node) => {
    if (node instanceof Text) {
      group.push(node);
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.tagName === "SCRIPT" || node.tagName === "STYLE") {
      flush();
      return;
    }
    const boundary = Object.hasOwn(blockTags, node.tagName) || node.tagName === "BR";
    if (boundary) flush();
    for (const child of node.childNodes) visit(child);
    if (boundary) flush();
  };
  visit(document.body);
  flush();
  for (const nodes of groups) {
    const text = nodes.map((node) => node.data).join("");
    const matches = [...text.matchAll(/\{([^{}]+)\}/gu)];
    const offsets: number[] = [];
    let offset = 0;
    for (const node of nodes) {
      offsets.push(offset);
      offset += node.data.length;
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
      const suffix = nodes[last].data.slice(end - offsets[last]);
      nodes[first].data =
        nodes[first].data.slice(0, start - offsets[first]) +
        replacement +
        (first === last ? suffix : "");
      for (let index = first + 1; index < last; index++) nodes[index].data = "";
      if (first !== last) nodes[last].data = suffix;
    }
  }
  return document.body.innerHTML;
}

/** Interpolate values using their field kind and fixed or per-row currency. */
export function interpolateSourceHtml(html: string, data: unknown): string {
  const formatters = new Map<string, Intl.NumberFormat>();
  return transformSourceExpressions(html, (path): string | undefined => {
    const value = resolveSourcePath(data, path);
    if (value === undefined || typeof value === "function" || typeof value === "symbol")
      return undefined;
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
      const next = /^[A-Za-z_$][\w$]*$/u.test(key)
        ? `${path}${path ? "." : ""}${key}`
        : `${path}[${JSON.stringify(key)}]`;
      visit(child, next);
    }
  };
  visit(data, "");
  return paths;
}
