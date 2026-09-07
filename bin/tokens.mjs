#!/usr/bin/env node
// Sure design tokens build.
// Reads design/tokens/sure.tokens.json (W3C DTCG-flavored) and emits:
//   1. one Tailwind v4 CSS file for the Rails consumer, and
//   2. typed StyleX variables + light/dark themes for the apps/web consumer.
//
// The JSON file is the single source of truth. Both consumers resolve the
// same DTCG references (`{path.to.token}`) and `sure.dark` extensions; there
// is no second hand-maintained palette. Run `npm run tokens:build` after any
// token edit and commit every generated file together.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOKENS = resolve(ROOT, "design/tokens/sure.tokens.json");
const OUT = resolve(ROOT, "app/assets/tailwind/sure-design-system/_generated.css");
// StyleX consumer outputs (apps/web). sure-tokens.stylex.ts carries the
// compiled theme; sure-token-values.ts carries the same values as plain data
// for tests and canvas/SVG chart code; sure-theme.css carries the static
// color-scheme / reduced-motion / forced-colors shell.
const STYLEX_TS = resolve(ROOT, "apps/web/src/styles/sure-tokens.stylex.ts");
const VALUES_TS = resolve(ROOT, "apps/web/src/styles/sure-token-values.ts");
const THEME_CSS = resolve(ROOT, "apps/web/src/styles/sure-theme.css");

const HEADER = `/*
 * GENERATED — do not edit by hand.
 * Source: design/tokens/sure.tokens.json
 * Build:  npm run tokens:build
 */
`;

// Single inline keyframe; not worth its own JSON token.
const KEYFRAMES = `  @keyframes stroke-fill {
    0% { stroke-dashoffset: 43.9822971503; }
    100% { stroke-dashoffset: 0; }
  }`;

// Yield [path, node] for every token leaf (object with $value or $type === "utility").
function* walk(node, path = []) {
  if (!node || typeof node !== "object") return;
  if ("$value" in node || node.$type === "utility") {
    yield [path, node];
    if (!node.$value || typeof node.$value !== "object") return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith("$")) continue;
    yield* walk(v, [...path, k]);
  }
}

// Path → CSS variable name. Trailing `DEFAULT` segment is dropped (Tailwind convention).
function varName(path) {
  const cleaned = path[path.length - 1] === "DEFAULT" ? path.slice(0, -1) : path;
  return "--" + cleaned.join("-");
}

// Set of valid token paths (e.g. "color.gray.50", "utility.border-tertiary").
// Populated once at the start of build(); referenced by resolveTemplate() and
// refToClass() so a typo'd `{ref}` fails the build instead of emitting broken
// CSS or a dangling utility class.
let VALID_PATHS = null;

function assertKnownRef(ref, source) {
  if (VALID_PATHS && !VALID_PATHS.has(ref)) {
    throw new Error(
      `[tokens] Unknown token reference \`${source}\` (resolved path: \`${ref}\`). ` +
      `Add it to design/tokens/sure.tokens.json or fix the typo.`
    );
  }
}

// Resolve template strings:
//   {a.b}     → var(--a-b)
//   {a.b|N%}  → --alpha(var(--a-b) / N%)
function resolveTemplate(s) {
  if (typeof s !== "string") return s;
  return s.replace(/\{([^|}]+)(?:\|([^}]+))?\}/g, (whole, ref, alpha) => {
    assertKnownRef(ref, whole);
    const cssVar = "--" + ref.split(".").join("-");
    return alpha ? `--alpha(var(${cssVar}) / ${alpha})` : `var(${cssVar})`;
  });
}

// {color.gray.50} or {utility.border-tertiary} → Tailwind utility class name with the given prefix.
// Drops a leading `color.` segment (since Tailwind colors are referenced as `bg-gray-50`, not `bg-color-gray-50`).
function refToClass(refStr, prefix) {
  const inner = refStr.replace(/^\{|\}$/g, "");
  assertKnownRef(inner, refStr);
  if (inner.startsWith("utility.")) return inner.slice("utility.".length);
  const parts = inner.split(".");
  if (parts[0] === "color") parts.shift();
  return prefix + "-" + parts.join("-");
}

// Utility @apply argument. If value is a raw class string (no `{}`), pass through.
// If value is a `{ref}`, resolve to a Tailwind class via the given prefix.
function utilityClasses(value, prefix) {
  if (typeof value !== "string") return "";
  if (!value.includes("{")) return value;
  return refToClass(value, prefix);
}

// ---------------------------------------------------------------------------
// StyleX consumer (apps/web).
//
// Unlike the Rails output — which emits `var(--x)` chains for Tailwind to
// resolve — the StyleX theme carries fully-resolved concrete values (hex,
// color-mix(), dimensions, font stacks) so the web app is self-contained and
// the generated file can be type-checked and unit-tested without a browser.
// Palette ladders (color.gray.*, color.red.*, …) are intentionally NOT emitted
// as variables: they are inlined during resolution, which makes it
// structurally impossible for product components to consume raw palette
// tokens. Only semantic tokens become StyleX variables. See
// apps/web/src/styles/README.md for the usage rules.
// ---------------------------------------------------------------------------

// Dotted-path → token leaf node, for concrete StyleX resolution.
let RAW_BY_PATH = null;

function rawFor(node, mode) {
  if (mode === "dark" && node.$extensions && node.$extensions["sure.dark"] !== undefined) {
    return node.$extensions["sure.dark"];
  }
  return node.$value;
}

// A Tailwind utility-class reference (single or space-separated multi-class
// dark override) as found in `utility.*` raw values.
const CLASS_RE = /^(bg|text|border)-[a-z0-9-]+( (bg|text|border)-[a-z0-9-]+)*$/;

// Resolve a raw value to a concrete CSS value for the given mode.
// `{ref}` inlines the referenced token's concrete value; `{ref|N%}` becomes
// standard-CSS `color-mix()` (the Rails build instead emits Tailwind v4
// `--alpha()` for the same intent).
function resolveConcrete(raw, mode, stack) {
  if (typeof raw === "number") return String(raw);
  if (typeof raw !== "string") {
    throw new Error(
      `[tokens] Cannot resolve non-string token value \`${JSON.stringify(raw)}\` for StyleX. ` +
      `Use a string $value, a {ref}, or sure.compose.`
    );
  }
  if (!raw.includes("{")) {
    if (CLASS_RE.test(raw)) return resolveClassString(raw, mode, stack);
    return raw;
  }
  return raw.replace(/\{([^|}]+)(?:\|([^}]+))?\}/g, (whole, ref, alpha) => {
    assertKnownRef(ref, whole);
    if (stack.includes(ref)) {
      throw new Error(
        `[tokens] Circular token reference \`${[...stack, ref].join(" → ")}\` while building StyleX values.`
      );
    }
    const node = RAW_BY_PATH.get(ref);
    const base = resolveConcrete(rawFor(node, mode), mode, [...stack, ref]);
    return alpha ? `color-mix(in srgb, ${base} ${alpha}, transparent)` : base;
  });
}

// Map one Tailwind class (e.g. "border-tertiary", "bg-gray-800",
// "text-inverse") to its concrete token value. Returns undefined when the
// class is a framework default with no design token (e.g. "animate-pulse").
function tryResolveClass(cls, mode, stack) {
  if (RAW_BY_PATH.has(`utility.${cls}`)) {
    const node = RAW_BY_PATH.get(`utility.${cls}`);
    return resolveConcrete(rawFor(node, mode), mode, [...stack, `utility.${cls}`]);
  }
  const m = cls.match(/^(bg|text|border)-(.+)$/);
  if (!m) return undefined;
  const rest = m[2];
  // Literal key match first: "surface-inset", "tertiary", "white", …
  if (RAW_BY_PATH.has(`color.${rest}`)) {
    const node = RAW_BY_PATH.get(`color.${rest}`);
    return resolveConcrete(rawFor(node, mode), mode, [...stack, `color.${rest}`]);
  }
  // Ladder match: "gray-800" → color.gray.800, "gray-tint-5" → color.gray.tint-5.
  const parts = rest.split("-");
  for (let i = 1; i < parts.length; i++) {
    const cand = `color.${parts.slice(0, i).join("-")}.${parts.slice(i).join("-")}`;
    if (RAW_BY_PATH.has(cand)) {
      return resolveConcrete(rawFor(RAW_BY_PATH.get(cand), mode), mode, [...stack, cand]);
    }
  }
  return undefined;
}

function resolveSingleClass(cls, mode, stack) {
  const hit = tryResolveClass(cls, mode, stack);
  if (hit === undefined) {
    throw new Error(
      `[tokens] Cannot map class \`${cls}\` to a design token for StyleX. ` +
      `Add the token to design/tokens/sure.tokens.json or fix the reference.`
    );
  }
  return hit;
}

// Multi-class dark overrides (e.g. button-bg-ghost-hover's dark
// "bg-gray-800 text-inverse") describe two CSS properties in one Tailwind
// string. A StyleX variable holds a single value, so keep the background —
// the value this variable documents — and warn so the mapping stays visible.
function resolveClassString(raw, mode, stack) {
  const classes = raw.trim().split(/\s+/);
  if (classes.length === 1) return resolveSingleClass(classes[0], mode, stack);
  const preferred = classes.find((c) => c.startsWith("bg-")) ?? classes[0];
  console.warn(`[tokens] Multi-class value \`${raw}\` → StyleX keeps \`${preferred}\` (single-value variable).`);
  return resolveSingleClass(preferred, mode, stack);
}

// sure.compose entries name utility classes ("bg-surface-inset") mixed with
// framework defaults ("animate-pulse"). The StyleX variable takes the first
// entry that resolves to a design token.
function resolveCompose(list, mode, stack) {
  for (const cls of list) {
    const hit = tryResolveClass(cls, mode, stack);
    if (hit !== undefined) return hit;
  }
  throw new Error(
    `[tokens] Cannot resolve sure.compose [${list.join(", ")}] to a design token for StyleX.`
  );
}

function toCamel(s) {
  return s.split("-").map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join("");
}

function cap(s) {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// StyleX variable name + documentation group for a token path, or null when
// the leaf is an internal building block (palette ladders, base white/black)
// that must be inlined rather than exposed to product code.
function styleXName(path) {
  const [group, ...rest] = path;
  if (group === "color") {
    if (rest.length !== 1 || rest[0] === "white" || rest[0] === "black") return null;
    return { name: toCamel(rest.join("-")), group: "color" };
  }
  if (group === "utility") return { name: toCamel(rest.join("-")), group: "utility" };
  if (group === "budget") return { name: `chart${cap(toCamel(rest.join("-")))}`, group: "chart" };
  if (group === "font") return { name: `font${cap(toCamel(rest.join("-")))}`, group: "typography" };
  if (group === "border") {
    if (rest[0] !== "radius") return null;
    return { name: `radius${cap(toCamel(rest.slice(1).join("-")))}`, group: "radius" };
  }
  if (group === "shadow") return { name: `shadow${cap(toCamel(rest.join("-")))}`, group: "shadow" };
  if (group === "animate") return { name: `motion${cap(toCamel(rest.join("-")))}`, group: "motion" };
  return null;
}

function styleXValueFor(path, node, mode) {
  const dotted = path.join(".");
  if (node.$value !== undefined) return resolveConcrete(rawFor(node, mode), mode, [dotted]);
  const compose = node.$extensions?.["sure.compose"];
  if (compose) return resolveCompose(compose, mode, [dotted]);
  throw new Error(
    `[tokens] Token \`${dotted}\` has neither $value nor sure.compose; cannot build a StyleX value.`
  );
}

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// Sorted, de-duplicated semantic model: [{ name, light, dark, source, group }].
function buildStyleXModel(tokens) {
  const entries = [];
  const seen = new Set();
  for (const [path, node] of walk(tokens)) {
    const named = styleXName(path);
    if (!named) continue;
    if (!IDENT_RE.test(named.name)) {
      throw new Error(
        `[tokens] Token \`${path.join(".")}\` maps to \`${named.name}\`, which is not a valid JS identifier.`
      );
    }
    if (seen.has(named.name)) {
      throw new Error(
        `[tokens] Duplicate StyleX variable \`${named.name}\` (from \`${path.join(".")}\`). Rename one side.`
      );
    }
    seen.add(named.name);
    const light = styleXValueFor(path, node, "light");
    const dark = styleXValueFor(path, node, "dark");
    if (light.includes("{") || light.includes("}") || dark.includes("{") || dark.includes("}")) {
      throw new Error(
        `[tokens] Unresolved reference in StyleX value for \`${path.join(".")}\`: \`${light}\` / \`${dark}\`.`
      );
    }
    entries.push({ name: named.name, light, dark, source: path.join("."), group: named.group });
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return entries;
}

function tsRecord(entries, pick) {
  return entries.map((e) => `\t${e.name}: ${JSON.stringify(e[pick])},`).join("\n");
}

const STYLEX_TS_PREAMBLE = `// GENERATED — do not edit by hand.
// Source: design/tokens/sure.tokens.json
// Build:  npm run tokens:build
//
// Semantic Sure theme for apps/web. Every value is resolved from the
// canonical token JSON (DTCG refs inlined, sure.dark applied per theme), so
// this file MUST stay in sync via the generator — never hand-edit.
//
// PRODUCT CODE RULE: consume only the semantic \`vars\` below (plus the
// theme classes). Raw palette ladders (gray/red/green/…) are intentionally
// NOT exported; import those and the drift test fails. Details:
// apps/web/src/styles/README.md
import * as stylex from "@stylexjs/stylex";
`;

function buildStyleXFiles(tokens) {
  const entries = buildStyleXModel(tokens);

  // Explicit string union (NOT `keyof typeof vars`: StyleX's Theme<> type
  // carries symbol members that would leak into Record<SureTokenName, …>).
  // This union IS the semantic contract; the drift test pins it to the
  // defineVars/createTheme keys.
  const nameUnion = entries.map((e) => JSON.stringify(e.name)).join(" | ");

  const stylexTs = `${STYLEX_TS_PREAMBLE}
// The semantic contract: color, typography, radius, shadow, motion, and
// chart tokens. Raw palette ladders are intentionally absent.
export type SureTokenName = ${nameUnion};

// Light defaults.
export const vars = stylex.defineVars({
${tsRecord(entries, "light")}
});

// Explicit light theme (for [data-theme="light"] overrides of the OS default).
export const sureLightTheme = stylex.createTheme(vars, {
${tsRecord(entries, "light")}
});

// Dark theme (for [data-theme="dark"] + the system-default path in theme.ts).
export const sureDarkTheme = stylex.createTheme(vars, {
${tsRecord(entries, "dark")}
});
`;
  writeFileSync(STYLEX_TS, stylexTs);

  // Plain-data twin of the theme: same values, no StyleX runtime. Used by
  // unit tests, canvas/SVG chart code (which needs raw hex, not CSS vars),
  // and the drift check. `import type` is erased, so this module never pulls
  // in @stylexjs/stylex.
  const valuesTs = `// GENERATED — do not edit by hand.
// Source: design/tokens/sure.tokens.json
// Build:  npm run tokens:build
//
// Plain-data twin of sure-tokens.stylex.ts for compiler-free consumers
// (tests, canvas/SVG charts). Values MUST match the StyleX file; the drift
// test enforces this. Never hand-edit.
import type { SureTokenName } from "./sure-tokens.stylex";

export const lightValues: Record<SureTokenName, string> = {
${tsRecord(entries, "light")}
};

export const darkValues: Record<SureTokenName, string> = {
${tsRecord(entries, "dark")}
};

export type SureTokenGroup =
  | "color"
  | "utility"
  | "chart"
  | "typography"
  | "radius"
  | "shadow"
  | "motion";

export interface SureTokenMeta {
  readonly source: string;
  readonly group: SureTokenGroup;
}

export const tokenMeta: Record<SureTokenName, SureTokenMeta> = {
${entries.map((e) => `\t${e.name}: { source: ${JSON.stringify(e.source)}, group: ${JSON.stringify(e.group)} },`).join("\n")}
};
`;
  writeFileSync(VALUES_TS, valuesTs);

  const themeCss = `/* GENERATED — do not edit by hand.
 * Source: design/tokens/sure.tokens.json
 * Build:  npm run tokens:build
 *
 * Static theme shell for the StyleX consumer (apps/web). The semantic
 * variable values live in sure-tokens.stylex.ts (compiled by
 * @stylexjs/unplugin); this file only carries what must exist as static CSS:
 * color-scheme defaults, the reduced-motion guard, and forced-colors
 * fallbacks. Applied by apps/web/src/styles/theme.ts.
 */
:root {
\tcolor-scheme: light dark;
}

/* An explicit choice wins over the OS default. */
:root[data-theme="light"] {
\tcolor-scheme: light;
}

:root[data-theme="dark"] {
\tcolor-scheme: dark;
}

/* No explicit choice (pre-hydration, or no stored preference): follow the OS
 * for UA chrome (scrollbars, form controls). The app-level theme resolves
 * on hydration via apps/web/src/styles/theme.ts; there are no inline
 * scripts (ADR-0001 REQ-TRAN-02). */
@media (prefers-color-scheme: dark) {
\t:root:not([data-theme]) {
\t\tcolor-scheme: dark;
\t}
}

/* Motion tokens (motionStrokeFill and transitions built on semantic vars)
 * MUST collapse when the user prefers reduced motion. This global guard
 * covers future animations even if a component forgets the per-component
 * StyleX pattern documented in apps/web/src/styles/README.md. */
@media (prefers-reduced-motion: reduce) {
\t*,
\t*::before,
\t*::after {
\t\tanimation-duration: 0.01ms !important;
\t\tanimation-iteration-count: 1 !important;
\t\ttransition-duration: 0.01ms !important;
\t\tscroll-behavior: auto !important;
\t}
}

/* Forced-colors (Windows High Contrast): drop decorative shadows so content
 * stays legible and guarantee a visible focus indicator from system colors.
 * Components keep using semantic vars; the OS palette wins inside this block. */
@media (forced-colors: active) {
\t*,
\t*::before,
\t*::after {
\t\tbox-shadow: none !important;
\t\ttext-shadow: none !important;
\t}

\t:is(a, button, input, select, textarea, [tabindex]):focus-visible {
\t\toutline: 2px solid CanvasText;
\t\toutline-offset: 2px;
\t\tforced-color-adjust: none;
\t}
}
`;
  writeFileSync(THEME_CSS, themeCss);

  const darkOverrides = entries.filter((e) => e.dark !== e.light).length;
  console.log(
    `tokens → ${STYLEX_TS.replace(ROOT + "/", "")} (${entries.length} semantic vars, ${darkOverrides} dark overrides) + plain values + theme shell`
  );
  return entries;
}

function build() {
  const tokens = JSON.parse(readFileSync(TOKENS, "utf8"));

  // Pre-compute the set of valid token paths so refs can be validated as we go.
  VALID_PATHS = new Set();
  for (const [path] of walk(tokens)) {
    VALID_PATHS.add(path.join("."));
  }

  const themeLines = [];
  const darkLines = [];
  const utilityBlocks = [];

  for (const [path, node] of walk(tokens)) {
    if (path[0] === "utility") {
      const name = path.slice(1).join("-");
      const ext = node.$extensions || {};

      if (ext["sure.compose"]) {
        utilityBlocks.push(`@utility ${name} {\n  @apply ${ext["sure.compose"].join(" ")};\n}`);
        continue;
      }

      const prefix = ext["sure.utility"]?.prefix;
      const raw = ext["sure.utility"]?.raw;
      const dark = ext["sure.dark"];

      const lightLine = raw
        ? `${raw}: ${resolveTemplate(node.$value)};`
        : `@apply ${utilityClasses(node.$value, prefix)};`;

      let block = `@utility ${name} {\n  ${lightLine}`;
      if (dark) {
        const darkLine = raw
          ? `${raw}: ${resolveTemplate(dark)};`
          : `@apply ${utilityClasses(dark, prefix)};`;
        block += `\n\n  @variant theme-dark {\n    ${darkLine}\n  }`;
      }
      block += `\n}`;
      utilityBlocks.push(block);
      continue;
    }

    const name = varName(path);
    themeLines.push(`  ${name}: ${resolveTemplate(node.$value)};`);

    const dark = node.$extensions?.["sure.dark"];
    if (dark !== undefined) {
      darkLines.push(`    ${name}: ${resolveTemplate(dark)};`);
    }
  }

  const css = `${HEADER}
@theme {
${themeLines.join("\n")}

${KEYFRAMES}
}

@layer base {
  [data-theme="dark"] {
${darkLines.join("\n")}
  }
}

${utilityBlocks.join("\n\n")}
`;

  writeFileSync(OUT, css);
  console.log(`tokens → ${OUT.replace(ROOT + "/", "")} (${themeLines.length} primitives, ${darkLines.length} dark overrides, ${utilityBlocks.length} utilities)`);

  // Second consumer, same source: resolve concrete values for StyleX.
  RAW_BY_PATH = new Map();
  for (const [path, node] of walk(tokens)) {
    RAW_BY_PATH.set(path.join("."), node);
  }
  buildStyleXFiles(tokens);
}

try {
  build();
} catch (err) {
  // Token errors are user-facing; the stack trace is noise.
  if (err.message?.startsWith("[tokens]")) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}
