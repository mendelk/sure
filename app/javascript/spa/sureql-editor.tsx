import * as monacoEditor from "monaco-editor/editor.js";
import { Editor, loader } from "@monaco-editor/react";
import type * as MonacoType from "monaco-editor";
import type { editor, languages, Position } from "monaco-editor";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import prqlSyntax, { PRQL_TRANSFORMS } from "./prql-syntax";
import { Icon } from "./icon";

type Monaco = typeof MonacoType;

const CUSTOM_LANGUAGE_ID = "sureql";
const PRQL_LANGUAGE_ID = "prql";

// Monaco is bundled from the npm package (editor.api core, no built-in
// languages — sureql/prql are registered locally) and injected into the
// loader so it never fetches a CDN script.
loader.config({
  monaco: monacoEditor,
});

declare global {
  interface Window {
    sureqlEditor?: editor.IStandaloneCodeEditor;
  }
}

const SUREQL_SOURCES = ["transactions", "accounts"];
const SUREQL_COLUMNS: Record<string, string[]> = {
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

const SUREQL_DIMENSIONS: Record<string, Array<{ snippet: string; detail: string }>> = {
  transactions: [{ snippet: "c=categories (==category_id)", detail: "dimension join" }],
};
const SUREQL_BRIDGE_COLUMNS: Record<string, string[]> = {
  transactions: ["transfer_id", "category_id", "merchant_id", "kind"],
};

let sureqlCompletionsRegistered = false;

function registerPrqlLanguage(monaco: Monaco, id: string, extraKeywords: string[] = []) {
  if (monaco.languages.getLanguages().some((l: languages.ILanguageExtensionPoint) => l.id === id))
    return;

  monaco.languages.register({ id });

  monaco.languages.setMonarchTokensProvider(id, {
    ...prqlSyntax,
    keywords: [...prqlSyntax.keywords, ...extraKeywords],
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

function registerSureql(monaco: Monaco) {
  registerPrqlLanguage(monaco, CUSTOM_LANGUAGE_ID, SUREQL_SOURCES);
  if (sureqlCompletionsRegistered) return;
  sureqlCompletionsRegistered = true;

  monaco.languages.registerCompletionItemProvider(CUSTOM_LANGUAGE_ID, {
    triggerCharacters: [" ", "{", "("],
    provideCompletionItems(model: editor.ITextModel, position: Position) {
      const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const kind = monaco.languages.CompletionItemKind;

      if (/^\s*from\s*\w*$/u.test(line)) {
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

      const fromMatch = model.getValue().match(/^\s*from\s+(\w+)/mu);
      const sourceName = fromMatch?.[1] ?? "";
      const columns = SUREQL_COLUMNS[sourceName] ?? [];
      const bridgeColumns = SUREQL_BRIDGE_COLUMNS[sourceName] ?? [];
      const dimensions = SUREQL_DIMENSIONS[sourceName] ?? [];

      if (/^\s*join\s*[\w=()]*$/u.test(line)) {
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

      const suggestions: languages.CompletionItem[] = [
        ...columns.map((column) => ({
          label: column,
          kind: kind.Field,
          insertText: column,
          range,
          detail: sourceName || "column",
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
      ];

      return { suggestions };
    },
  });
}

function validateSureqlSource(monaco: Monaco, model: editor.ITextModel) {
  const markers: editor.IMarkerData[] = [];
  model.getLinesContent().forEach((content, index) => {
    const match = content.match(/^\s*from\s+(\w+)\s*$/u);
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

function isLanguage(val: string): val is "sureql" | "prql" {
  return val === "sureql" || val === "prql";
}

function isTheme(val: string): val is "system" | "light" | "dark" {
  return val === "system" || val === "light" || val === "dark";
}

function resolveMonacoTheme(preference: "system" | "light" | "dark" = "system"): string {
  if (preference === "dark") return "vs-dark";
  if (preference === "light") return "vs";

  const appTheme = document.documentElement.dataset.theme;
  if (appTheme === "dark") return "vs-dark";
  if (appTheme === "light") return "vs";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "vs-dark" : "vs";
}

function subscribeTheme(callback: () => void) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", callback);
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => {
    mediaQuery.removeEventListener("change", callback);
    observer.disconnect();
  };
}

export interface SureqlEditorProps {
  value: string;
  defaultValue?: string;
  onChange: (value: string) => void;
  onRun: () => void;
  loading?: boolean;
}

export function SureqlEditor({
  value,
  defaultValue = "from transactions\nsort {-date}\ntake 10",
  onChange,
  onRun,
  loading = false,
}: SureqlEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const [language, setLanguage] = useState<"sureql" | "prql">("sureql");
  const [themePreference, setThemePreference] = useState<"system" | "light" | "dark">("system");
  const [cursorPos, setCursorPos] = useState({ line: 1, column: 1 });
  const [copied, setCopied] = useState(false);

  const systemTheme = useSyncExternalStore(
    subscribeTheme,
    () => resolveMonacoTheme("system"),
    () => "vs",
  );
  const activeTheme =
    themePreference === "system" ? systemTheme : resolveMonacoTheme(themePreference);

  const onRunRef = useRef(onRun);
  useEffect(() => {
    onRunRef.current = onRun;
  }, [onRun]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const languageRef = useRef(language);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  // Clean up global reference on unmount
  useEffect(
    () => () => {
      if (window.sureqlEditor) delete window.sureqlEditor;
    },
    [],
  );

  const handleBeforeMount = (monaco: Monaco) => {
    registerSureql(monaco);
    registerPrqlLanguage(monaco, PRQL_LANGUAGE_ID);
  };

  const handleOnMount = (editorInstance: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editorInstance;
    monacoRef.current = monaco;
    window.sureqlEditor = editorInstance;

    editorInstance.onDidChangeCursorPosition((e) => {
      setCursorPos({ line: e.position.lineNumber, column: e.position.column });
    });

    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRunRef.current();
    });

    const model = editorInstance.getModel();
    if (model && languageRef.current === "sureql") validateSureqlSource(monaco, model);
  };

  const handleEditorChange = (val: string | undefined) => {
    const next = val ?? "";
    onChangeRef.current(next);

    if (editorRef.current && monacoRef.current && languageRef.current === "sureql") {
      const model = editorRef.current.getModel();
      if (model) validateSureqlSource(monacoRef.current, model);
    }
  };

  const handleLanguageChange = (newLang: "sureql" | "prql") => {
    setLanguage(newLang);
    if (!editorRef.current || !monacoRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    monacoRef.current.editor.setModelLanguage(model, newLang);
    if (newLang === "sureql") validateSureqlSource(monacoRef.current, model);
    else monacoRef.current.editor.setModelMarkers(model, CUSTOM_LANGUAGE_ID, []);
  };

  const handleCopy = async () => {
    const text = editorRef.current ? editorRef.current.getValue() : value;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      // Ignore clipboard write failures
    }
  };

  const handleReset = () => {
    if (editorRef.current) {
      editorRef.current.setValue(defaultValue);
      editorRef.current.focus();
    }
    onChange(defaultValue);
  };

  return (
    <section
      aria-labelledby="query-editor-heading"
      className="overflow-hidden rounded-xl border border-secondary bg-container shadow-border-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tertiary px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <label
            id="query-editor-heading"
            htmlFor="query-language-select"
            className="flex items-center gap-2 text-sm text-secondary"
          >
            <span>Language</span>
            <select
              id="query-language-select"
              value={language}
              onChange={(e) => {
                const val = e.target.value;
                if (isLanguage(val)) handleLanguageChange(val);
              }}
              className="rounded-lg border border-primary bg-container-inset px-2 py-1 text-xs text-primary focus-ring"
            >
              <option value="sureql">sureql (app dialect)</option>
              <option value="prql">PRQL</option>
            </select>
          </label>

          <label
            htmlFor="query-theme-select"
            className="flex items-center gap-2 text-sm text-secondary"
          >
            <span>Theme</span>
            <select
              id="query-theme-select"
              value={themePreference}
              onChange={(e) => {
                const val = e.target.value;
                if (isTheme(val)) setThemePreference(val);
              }}
              className="rounded-lg border border-primary bg-container-inset px-2 py-1 text-xs text-primary focus-ring"
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void handleCopy();
            }}
            title="Copy query to clipboard"
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-secondary bg-container px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-surface-hover focus-ring"
          >
            {copied ? (
              <>
                <Icon name="check" size="sm" className="text-success" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Icon name="copy" size="sm" />
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleReset}
            title="Reset to default query"
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-secondary bg-container px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-surface-hover focus-ring"
          >
            <Icon name="rotate-ccw" size="sm" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={onRun}
            disabled={loading || value.trim().length === 0}
            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg button-bg-primary px-3 py-1.5 text-xs font-medium text-inverse transition-colors hover:button-bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-ring"
          >
            {loading ? (
              <>
                <Icon name="loader-circle" size="sm" className="animate-spin text-inverse" />
                <span>Running…</span>
              </>
            ) : (
              <>
                <Icon name="play" size="sm" className="text-inverse" />
                <span>Run</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="relative h-[260px] w-full bg-surface-inset">
        <Editor
          height="100%"
          language={language}
          value={value}
          theme={activeTheme}
          beforeMount={handleBeforeMount}
          onMount={handleOnMount}
          onChange={handleEditorChange}
          wrapperProps={{
            role: "application",
            "aria-label": "SureQL Query Editor",
          }}
          options={{
            fontSize: 14,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: "all",
            stickyScroll: { enabled: false },
            automaticLayout: true,
          }}
          loading={
            <div className="flex size-full items-center justify-center gap-2 bg-surface-inset text-sm text-secondary">
              <Icon name="loader-circle" className="animate-spin" />
              <span>Loading Monaco editor…</span>
            </div>
          }
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-tertiary px-4 py-2.5 text-xs text-secondary tabular-nums">
        <div className="flex items-center gap-4">
          <span>
            Ln {cursorPos.line}, Col {cursorPos.column}
          </span>
          <span>{value.length} characters</span>
        </div>

        <p className="text-xs text-secondary">
          Press{" "}
          <kbd className="rounded-sm border border-secondary bg-surface-inset px-1 py-0.5 font-mono text-[10px]">
            ⌘
          </kbd>{" "}
          +{" "}
          <kbd className="rounded-sm border border-secondary bg-surface-inset px-1 py-0.5 font-mono text-[10px]">
            Enter
          </kbd>{" "}
          or click Run
        </p>
      </div>
    </section>
  );
}
