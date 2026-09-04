import { Controller } from "@hotwired/stimulus";

const MONACO_VERSION = "0.52.2";
const MONACO_CDN = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs`;
const CUSTOM_LANGUAGE_ID = "sureql";
const PRQL_LANGUAGE_ID = "prql";

let monacoPromise = null;

function loadMonaco() {
  if (monacoPromise) return monacoPromise;

  monacoPromise = new Promise((resolve, reject) => {
    if (window.monaco?.editor) {
      resolve(window.monaco);
      return;
    }

    if (typeof window.require === "function" && window.require.config) {
      window.require.config({ paths: { vs: MONACO_CDN } });
      window.require(
        ["vs/editor/editor.main"],
        () => resolve(window.monaco),
        reject,
      );
      return;
    }

    const script = document.createElement("script");
    script.src = `${MONACO_CDN}/loader.js`;
    script.async = true;
    script.onload = () => {
      window.require.config({ paths: { vs: MONACO_CDN } });
      window.require(
        ["vs/editor/editor.main"],
        () => resolve(window.monaco),
        reject,
      );
    };
    script.onerror = () => reject(new Error("Failed to load monaco loader.js"));
    document.head.appendChild(script);
  });

  return monacoPromise;
}

const PRQL_TRANSFORMS = [
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
const PRQL_MODULES = ["date", "math", "text"];
const PRQL_BUILTIN_FUNCTIONS = ["case"];
const PRQL_KEYWORDS = [
  "let",
  "prql",
  "into",
  "type",
  "module",
  "internal",
  "func",
  "import",
  "enum",
];
const PRQL_LITERALS = ["null", "true", "false"];

// sureql is PRQL restricted to the app's source registry — reuse the
// PRQL tokenizer, plus registry source names as keywords so `from
// transactions` reads as a keyword.
//
// Constrained vocabulary: completions and validation below are driven by
// these lists, which mirror Sureql::SOURCES in lib/sureql.rb (source names)
// and each source's curated `select` columns. The backend still owns the
// truth — unknown sources are rejected at compile time — but the editor
// should never suggest something the backend won't accept.
const SUREQL_SOURCES = ["transactions", "accounts"];
const SUREQL_COLUMNS = {
  transactions: [
    "id",
    "account_id",
    "date",
    "name",
    "amount",
    "currency",
    "notes",
    "excluded",
    "entryable_type",
    "entryable_id",
  ],
  accounts: [
    "id",
    "family_id",
    "owner_id",
    "name",
    "classification",
    "subtype",
    "currency",
    "balance",
    "cash_balance",
    "status",
    "exclude_from_reports",
    "created_at",
  ],
};

// Dimension joins per source, mirroring Sureql dimensions in lib/sureql.rb.
// The bridge table stays hidden: the backend injects it as `t`, and these
// bridge columns are usable as bare words (`filter transfer_id == null`).
const SUREQL_DIMENSIONS = {
  transactions: [{ snippet: "c=categories (==category_id)", detail: "dimension join" }],
};
const SUREQL_BRIDGE_COLUMNS = {
  transactions: ["transfer_id", "category_id", "merchant_id", "kind"],
};

// Registered once per page load — registerSureql can run again when the
// user switches back to the sureql language.
let sureqlCompletionsRegistered = false;

function registerPrqlLanguage(monaco, id, extraKeywords = []) {
  if (monaco.languages.getLanguages().some((l) => l.id === id)) {
    return;
  }

  monaco.languages.register({ id });

  monaco.languages.setMonarchTokensProvider(id, {
    keywords: [
      ...PRQL_TRANSFORMS,
      ...PRQL_MODULES,
      ...PRQL_BUILTIN_FUNCTIONS,
      ...PRQL_KEYWORDS,
      ...PRQL_LITERALS,
      ...extraKeywords,
    ],
    operators: [
      "+", "-", "*", "/", "//", "%",
      "==", "!=", "->", "=>", ">", "<", ">=", "<=", "~=",
      "&&", "||", "??",
    ],
    tokenizer: {
      root: [
        { include: "@comment" },
        [/(\w+)\s*:/, { cases: { $1: "key" } }],
        [
          /[a-z_$][\w$]*/,
          { cases: { "@keywords": "keyword", "@default": "identifier" } },
        ],
        { include: "@whitespace" },
        [/[()[\]]/, "@brackets"],
        [/[+-]?[^\w](([\d_]+(\.[\d_]+)?)|(\.[\d_]+))/, "number"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, { token: "string.quote", bracket: "@open", next: "@string" }],
        [/'([^'\\]|\\.)*$/, "string.invalid"],
        [/'/, { token: "string.quote", bracket: "@open", next: "@stringSingle" }],
      ],
      comment: [[/#.*/, "comment"]],
      string: [
        [/[^\\"]+/, "string"],
        [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
      ],
      stringSingle: [
        [/[^\\']+/, "string"],
        [/'/, { token: "string.quote", bracket: "@close", next: "@pop" }],
      ],
      whitespace: [[/[ \t\r\n]+/, "white"]],
    },
  });

  monaco.languages.setLanguageConfiguration(id, {
    comments: { lineComment: "#" },
    brackets: [
      ["(", ")"],
      ["[", "]"],
    ],
    autoClosingPairs: [
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });
}

function registerPrql(monaco) {
  registerPrqlLanguage(monaco, PRQL_LANGUAGE_ID);
}

function registerSureql(monaco) {
  registerPrqlLanguage(monaco, CUSTOM_LANGUAGE_ID, SUREQL_SOURCES);
  registerSureqlCompletions(monaco);
}

// Only words the backend understands: registry sources on a `from` line,
// otherwise the active source's curated columns plus PRQL transforms.
function registerSureqlCompletions(monaco) {
  if (sureqlCompletionsRegistered) return;
  sureqlCompletionsRegistered = true;

  monaco.languages.registerCompletionItemProvider(CUSTOM_LANGUAGE_ID, {
    triggerCharacters: [" ", "{", "("],
    provideCompletionItems(model, position) {
      const line = model
        .getLineContent(position.lineNumber)
        .slice(0, position.column - 1);
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const kind = monaco.languages.CompletionItemKind;

      if (/^\s*from\s*\w*$/.test(line)) {
        return {
          suggestions: SUREQL_SOURCES.map((source) => ({
            label: source,
            kind: kind.Keyword,
            insertText: source,
            range,
            detail: "sureql source",
          })),
        };
      }

      const fromMatch = model
        .getValue()
        .match(/^\s*from\s+(\w+)/m);
      const sourceName = fromMatch?.[1];
      const columns = SUREQL_COLUMNS[sourceName] ?? [];
      const bridgeColumns = SUREQL_BRIDGE_COLUMNS[sourceName] ?? [];
      const dimensions = SUREQL_DIMENSIONS[sourceName] ?? [];

      if (/^\s*join\s*[\w=()]*$/.test(line)) {
        return {
          suggestions: dimensions.map((dim) => ({
            label: dim.snippet,
            kind: kind.Reference,
            insertText: dim.snippet,
            range,
            detail: dim.detail,
          })),
        };
      }

      return {
        suggestions: [
          ...columns.map((column) => ({
            label: column,
            kind: kind.Field,
            insertText: column,
            range,
            detail: sourceName ?? "column",
          })),
          ...bridgeColumns.map((column) => ({
            label: column,
            kind: kind.Field,
            insertText: column,
            range,
            detail: "bridge t",
          })),
          ...PRQL_TRANSFORMS.map((transform) => ({
            label: transform,
            kind: kind.Keyword,
            insertText: transform,
            range,
            detail: "prql transform",
          })),
        ],
      };
    },
  });
}

// Flags `from <unknown>` lines inline so straying outside the registry
// surfaces in the editor, not just as a backend error after Run.
function validateSureqlSource(monaco, model) {
  const markers = [];
  model.getLinesContent().forEach((content, index) => {
    const match = content.match(/^\s*from\s+(\w+)\s*$/);
    if (match && !SUREQL_SOURCES.includes(match[1])) {
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: `Unknown sureql source \`${match[1]}\`. Available sources: ${SUREQL_SOURCES.join(", ")}`,
        startLineNumber: index + 1,
        endLineNumber: index + 1,
        startColumn: content.indexOf(match[1]) + 1,
        endColumn: content.indexOf(match[1]) + 1 + match[1].length,
      });
    }
  });
  monaco.editor.setModelMarkers(model, CUSTOM_LANGUAGE_ID, markers);
}

// Connects to data-controller="monaco-editor"
export default class extends Controller {
  static targets = [
    "container",
    "loading",
    "error",
    "language",
    "theme",
    "position",
    "count",
    "source",
    "sqlOutput",
    "jsonOutput",
    "resultsOutput",
    "resultMeta",
    "submitBtn",
    "submitSpinner",
  ];
  static values = {
    language: { type: String, default: CUSTOM_LANGUAGE_ID },
    submitUrl: String,
  };

  connect() {
    this.editor = null;
    this.disposed = false;
    this.systemDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    this.systemDarkQuery.addEventListener?.("change", this.applyTheme);
    this.documentThemeObserver = new MutationObserver(this.applyTheme);
    this.documentThemeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    this.resizeObserver = new ResizeObserver(() => {
      this.editor?.layout();
    });
    this.resizeObserver.observe(this.containerTarget);

    loadMonaco()
      .then((monaco) => {
        if (this.disposed) return;
        this.monaco = monaco;
        registerSureql(monaco);
        registerPrql(monaco);
        this.buildEditor();
      })
      .catch(() => {
        this.loadingTarget.hidden = true;
        this.errorTarget.hidden = false;
      });
  }

  disconnect() {
    this.disposed = true;
    this.systemDarkQuery?.removeEventListener?.("change", this.applyTheme);
    this.documentThemeObserver?.disconnect();
    this.resizeObserver?.disconnect();
    this.editor?.dispose();
    this.editor = null;
  }

  buildEditor() {
    // Initial sample lives in a <template> target (a text/plain <script>
    // trips erb-lint). Template text sits in .content, not .textContent.
    const rawSource =
      this.sourceTarget.content?.textContent ?? this.sourceTarget.textContent;
    const initialValue = this.hasSourceTarget ? `${rawSource.trim()}\n` : "";

    this.editor = this.monaco.editor.create(this.containerTarget, {
      value: initialValue,
      language: this.languageValue,
      automaticLayout: true,
      fontSize: 14,
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      padding: { top: 12 },
      renderLineHighlight: "all",
      stickyScroll: { enabled: false },
    });

    this.initialValue = initialValue;
    if (this.hasLanguageTarget) this.languageTarget.value = this.languageValue;

    this.editor.onDidChangeCursorPosition((e) =>
      this.renderPosition(e.position),
    );
    this.editor.onDidChangeModelContent(() => {
      this.renderCount();
      this.validateSource();
    });
    this.renderCount();
    this.validateSource();
    this.renderPosition(this.editor.getPosition());
    this.applyTheme();
    this.loadingTarget.hidden = true;
  }

  changeLanguage(event) {
    const language = event.currentTarget.value;
    this.languageValue = language;
    if (!this.editor) return;

    if (language === CUSTOM_LANGUAGE_ID) {
      registerSureql(this.monaco);
      this.validateSource();
    } else if (language === PRQL_LANGUAGE_ID) {
      registerPrql(this.monaco);
      this.monaco.editor.setModelMarkers(
        this.editor.getModel(),
        CUSTOM_LANGUAGE_ID,
        [],
      );
    }
    this.monaco.editor.setModelLanguage(this.editor.getModel(), language);
  }

  changeTheme() {
    this.applyTheme();
  }

  applyTheme = () => {
    if (!this.editor) return;
    this.monaco.editor.setTheme(this.resolveTheme());
  };

  resolveTheme() {
    const preference = this.hasThemeTarget ? this.themeTarget.value : "system";
    if (preference === "dark") return "vs-dark";
    if (preference === "light") return "vs";

    const appTheme = document.documentElement.dataset.theme;
    if (appTheme === "dark") return "vs-dark";
    if (appTheme === "light") return "vs";
    return this.systemDarkQuery.matches ? "vs-dark" : "vs";
  }

  async submit() {
    if (!this.editor) return;
    if (this.languageValue !== CUSTOM_LANGUAGE_ID) return;

    const source = this.editor.getValue();
    if (!source.trim()) return;

    if (this.hasSubmitBtnTarget) this.submitBtnTarget.disabled = true;
    if (this.hasSubmitSpinnerTarget) this.submitSpinnerTarget.hidden = false;
    if (this.hasSqlOutputTarget) {
      this.sqlOutputTarget.textContent = "Running…";
      this.sqlOutputTarget.classList.remove("text-destructive");
    }
    if (this.hasJsonOutputTarget) {
      this.jsonOutputTarget.textContent = "Running…";
      this.jsonOutputTarget.classList.remove("text-destructive");
    }
    if (this.hasResultsOutputTarget) {
      this.resultsOutputTarget.innerHTML =
        '<p class="px-4 py-3 rounded-xl border border-primary bg-surface-inset text-secondary">Running…</p>';
    }
    if (this.hasResultMetaTarget) this.resultMetaTarget.textContent = "";

    try {
      const csrfToken = document.querySelector(
        'meta[name="csrf-token"]',
      )?.content;
      const response = await fetch(this.submitUrlValue, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        body: JSON.stringify({ source }),
      });
      const contentType = response.headers.get("content-type") || "";
      let data = null;
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        // Non-JSON means we got a redirect (e.g. signed-out → login page),
        // a missing route (404), or an HTML 500. response.json() would throw
        // "Unexpected token '<', "<!DOCTYPE "..." — surface the real cause.
        const text = await response.text();
        console.error(
          `[monaco-editor] expected JSON but got ${response.status} ${contentType}: ${text.slice(0, 200)}`,
        );
        throw new Error(this.describeNonJsonResponse(response));
      }
      if (response.ok && data.sql) {
        if (this.hasSqlOutputTarget) {
          this.sqlOutputTarget.textContent = data.sql;
          this.sqlOutputTarget.classList.remove("text-destructive");
        }
        if (this.hasJsonOutputTarget) {
          this.jsonOutputTarget.textContent = JSON.stringify(
            data.rows ?? [],
            null,
            2,
          );
          this.jsonOutputTarget.classList.remove("text-destructive");
        }
        if (this.hasResultsOutputTarget) {
          if (data.html) {
            this.resultsOutputTarget.innerHTML = data.html;
          } else {
            this.resultsOutputTarget.innerHTML = this.buildTable(
              data.columns ?? [],
              data.rows ?? [],
            );
          }
        }
        if (this.hasResultMetaTarget) {
          const count = data.row_count ?? (data.rows ?? []).length;
          this.resultMetaTarget.textContent = data.truncated
            ? `${count} rows (limited to 50)`
            : `${count} rows`;
        }
      } else {
        const message = data.error || "Failed to run sureql";
        if (this.hasSqlOutputTarget) {
          this.sqlOutputTarget.textContent = message;
          this.sqlOutputTarget.classList.add("text-destructive");
        }
        if (this.hasJsonOutputTarget) {
          this.jsonOutputTarget.textContent = message;
          this.jsonOutputTarget.classList.add("text-destructive");
        }
        if (this.hasResultsOutputTarget) {
          this.resultsOutputTarget.innerHTML =
            `<p class="px-4 py-3 rounded-xl border border-primary bg-surface-inset text-destructive">${this.escapeHtml(message)}</p>`;
        }
      }
    } catch (err) {
      const message = err?.message || "Failed to run sureql";
      if (this.hasSqlOutputTarget) {
        this.sqlOutputTarget.textContent = message;
        this.sqlOutputTarget.classList.add("text-destructive");
      }
      if (this.hasJsonOutputTarget) {
        this.jsonOutputTarget.textContent = message;
        this.jsonOutputTarget.classList.add("text-destructive");
      }
      if (this.hasResultsOutputTarget) {
        this.resultsOutputTarget.innerHTML =
          `<p class="px-4 py-3 rounded-xl border border-primary bg-surface-inset text-destructive">${this.escapeHtml(message)}</p>`;
      }
    } finally {
      if (this.hasSubmitBtnTarget) this.submitBtnTarget.disabled = false;
      if (this.hasSubmitSpinnerTarget) this.submitSpinnerTarget.hidden = true;
    }
  }

  // Generic fallback table for aggregations / non-transaction sources.
  // Transaction queries get server-rendered rows (data.html) instead.
  buildTable(columns, rows) {
    if (!columns.length) {
      return '<p class="px-4 py-3 rounded-xl border border-primary bg-surface-inset text-secondary">No rows returned.</p>';
    }
    const head = columns
      .map((c) => `<th class="px-3 py-2 text-left font-medium">${this.escapeHtml(String(c))}</th>`)
      .join("");
    const body = rows.length
      ? rows
          .map(
            (row) =>
              `<tr class="border-t border-tertiary">${columns
                .map((c) => `<td class="px-3 py-2 align-top whitespace-pre-wrap break-all">${this.escapeHtml(this.cellText(row[c]))}</td>`)
                .join("")}</tr>`,
          )
          .join("")
      : `<tr><td colspan="${columns.length}" class="px-3 py-6 text-center text-secondary">No rows returned.</td></tr>`;
    return `<div class="rounded-xl border border-primary bg-container overflow-auto"><table class="min-w-full text-sm text-primary"><thead class="text-xs uppercase text-secondary bg-surface-inset"><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  cellText(value) {
    if (value === null || value === undefined) return "null";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  // Maps HTML-instead-of-JSON responses to actionable messages.
  // Most common: dev server predates the /run route (404), session expired
  // and the request was redirected to the login page, or a 500 error page.
  describeNonJsonResponse(response) {
    if (response.redirected || response.url?.includes("/sessions")) {
      return "Session expired — reload the page and sign in, then run again.";
    }
    if (response.status === 404) {
      return `Query endpoint not found (404 at ${this.submitUrlValue}). Restart the dev server so the new route loads, then run again.`;
    }
    if (response.status >= 500) {
      return `Server error (${response.status}). Check the Rails log for [sureql], then run again.`;
    }
    if (response.status === 422) {
      return "Request rejected (422). Reload the page (CSRF token may be stale), then run again.";
    }
    return `Unexpected response (${response.status || "network error"}). Reload and try again — check the console for details.`;
  }

  escapeHtml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  async copy() {
    if (!this.editor) return;
    try {
      await navigator.clipboard.writeText(this.editor.getValue());
    } catch {
      this.editor.focus();
      document.execCommand?.("copy");
    }
  }

  reset() {
    this.editor?.setValue(this.initialValue ?? "");
    this.editor?.focus();
  }

  renderPosition(position) {
    if (!this.hasPositionTarget || !position) return;
    this.positionTarget.textContent = `Ln ${position.lineNumber}, Col ${position.column}`;
  }

  renderCount() {
    if (!this.hasCountTarget || !this.editor) return;
    const count = this.editor.getValue().length;
    this.countTarget.textContent = `${count} characters`;
  }

  validateSource() {
    if (!this.editor || this.languageValue !== CUSTOM_LANGUAGE_ID) return;
    validateSureqlSource(this.monaco, this.editor.getModel());
  }
}
