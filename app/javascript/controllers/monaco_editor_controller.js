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
const SUREQL_SOURCES = ["transactions", "accounts"];

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
    this.editor.onDidChangeModelContent(() => this.renderCount());
    this.renderCount();
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
    } else if (language === PRQL_LANGUAGE_ID) {
      registerPrql(this.monaco);
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
      this.sqlOutputTarget.textContent = "Compiling…";
      this.sqlOutputTarget.classList.remove("text-destructive");
    }

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
      const data = await response.json();
      if (this.hasSqlOutputTarget) {
        if (response.ok && data.sql) {
          this.sqlOutputTarget.textContent = data.sql;
          this.sqlOutputTarget.classList.remove("text-destructive");
        } else {
          this.sqlOutputTarget.textContent =
            data.error || "Failed to compile sureql";
          this.sqlOutputTarget.classList.add("text-destructive");
        }
      }
    } catch (err) {
      if (this.hasSqlOutputTarget) {
        this.sqlOutputTarget.textContent =
          err?.message || "Failed to compile sureql";
        this.sqlOutputTarget.classList.add("text-destructive");
      }
    } finally {
      if (this.hasSubmitBtnTarget) this.submitBtnTarget.disabled = false;
      if (this.hasSubmitSpinnerTarget) this.submitSpinnerTarget.hidden = true;
    }
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
}
