// Monarch grammar for PRQL, converted to TS from the PRQL playground:
// https://github.com/PRQL/prql/blob/main/web/playground/src/workbench/prql-syntax.js
// (sha256 at conversion time: 0c3ccd3a315226eb7dcb6136abbcfb0fb53ca4ab655f8704c70e8ec707110682)
//
// Update policy: PRQL does not publish the grammar to npm (prql-js is compiler
// bindings, not language tooling), so re-diff this file against upstream when
// PRQL ships a language change worth reflecting.

import type { languages } from "monaco-editor";

// Keep in sync with the lexer's `keyword` parser in
// prqlc/prqlc-parser/src/lexer/mod.rs. `case` is listed below.
const TRANSFORMS = [
  "aggregate",
  "append",
  "derive",
  "filter",
  "from_text",
  "from",
  "group",
  "intersect",
  "join",
  "loop",
  "remove",
  "select",
  "sort",
  "take",
  "window",
];
// Used by sureql completions, which extend the PRQL grammar.
export { TRANSFORMS as PRQL_TRANSFORMS };
const MODULES = ["date", "math", "text"];
// "in", "as"
const BUILTIN_FUNCTIONS = ["case"];
const KEYWORDS = ["let", "prql", "into", "type", "module", "internal", "func", "import", "enum"];
const LITERALS = ["null", "true", "false"];

// Monarch allows arbitrary attributes that the tokenizer refers to via
// `@name` (see `cases: { "@keywords": ... }` below); `IMonarchLanguage`
// accepts them through an index signature, but spreading an `any`-typed value
// trips oxlint's no-unsafe-assignment, so name the two we use.
type PrqlMonarchLanguage = languages.IMonarchLanguage & {
  keywords: string[];
  operators: string[];
};

const def: PrqlMonarchLanguage = {
  keywords: [...TRANSFORMS, ...MODULES, ...BUILTIN_FUNCTIONS, ...KEYWORDS, ...LITERALS],

  operators: [
    "+",
    "-",
    "*",
    "/",
    "//",
    "%",
    "==",
    "!=",
    "->",
    "=>",
    ">",
    "<",
    ">=",
    "<=",
    "~=",
    "&&",
    "||",
    "??",
  ],

  tokenizer: {
    root: [
      { include: "@comment" },

      // named-args
      [/(\w+)\s*:/u, { cases: { $1: "key" } }],

      // identifiers and keywords
      [/[a-z_$][\w$]*/u, { cases: { "@keywords": "keyword", "@default": "identifier" } }],

      // whitespace
      { include: "@whitespace" },

      // delimiters
      [/[()[\]]/u, "@brackets"],

      // numbers
      // Slightly modified from https://stackoverflow.com/a/23872060/3064736;
      // it requires a number after a decimal point, so ranges appear as
      // ranges. We disallow a leading word character so we don't highlight a
      // number in `foo_1`. Underscores are allowed more liberally than PRQL,
      // which disallows them at the start or end (difficult in regex).
      [/[+-]?[^\w](([\d_]+(\.[\d_]+)?)|(\.[\d_]+))/u, "number"],

      // double-quoted strings
      // non-terminated string
      [/"([^"\\]|\\.)*$/u, "string.invalid"],
      [/"/u, { token: "string.quote", bracket: "@open", next: "@string" }],

      // single-quoted strings; interchangeable with double quotes in PRQL, so
      // they can hold arbitrary-length content (e.g. `'USA'`), not just a
      // single character.
      // non-terminated string
      [/'([^'\\]|\\.)*$/u, "string.invalid"],
      [/'/u, { token: "string.quote", bracket: "@open", next: "@stringSingle" }],
    ],

    comment: [[/#.*/u, "comment"]],

    string: [
      [/[^\\"]+/u, "string"],
      [/"/u, { token: "string.quote", bracket: "@close", next: "@pop" }],
    ],

    stringSingle: [
      [/[^\\']+/u, "string"],
      [/'/u, { token: "string.quote", bracket: "@close", next: "@pop" }],
    ],

    // PRQL's only comment syntax is `#`, handled by the `comment` state above.
    // There are no `//` line comments or `/* */` block comments — `//` is the
    // integer-division operator (`TokenKind::DivInt` in the lexer), so a rule
    // matching it here would swallow the rest of the line as a comment.
    whitespace: [[/[ \t\r\n]+/u, "white"]],
  },
};

export default def;
