/* eslint-disable import/max-dependencies -- Source-aware Markdown combines ProseMark, CodeMirror completion, safe rendering, and source queries. */
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Annotation, Compartment, EditorState, Prec, Transaction } from "@codemirror/state";
import { EditorView, keymap, tooltips } from "@codemirror/view";
import {
  autocompletion,
  acceptCompletion,
  startCompletion,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { GFM, type MarkdownConfig } from "@lezer/markdown";
import {
  prosemarkBasicSetup,
  prosemarkBaseThemeSetup,
  prosemarkMarkdownSyntaxExtensions,
  prosemarkMarkdownFormattingKeymap,
} from "@prosemark/core";
import { pasteRichTextExtension } from "@prosemark/paste-rich-text";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Root } from "mdast";
import type { Plugin } from "unified";
import type { State, Extension as MicromarkExtension } from "micromark-util-types";
import type { Extension as FromMarkdownExtension } from "mdast-util-from-markdown";
import { codes } from "micromark-util-symbol";
import { Button } from "./components/button";
import type { ReportBuilderText } from "./report-definition";
import { sourceQueryOptions, type Source, type SourceData } from "./source";
import {
  interpolateSourceText,
  parsePath,
  sourceVariablePaths,
  transformSourceExpressions,
} from "./rich-text-variables";

const externalChange = Annotation.define<boolean>();

declare module "micromark-util-types" {
  interface TokenTypeMap {
    sourceExpression: "sourceExpression";
  }
}

declare module "unified" {
  interface Data {
    micromarkExtensions?: MicromarkExtension[];
    fromMarkdownExtensions?: FromMarkdownExtension[];
  }
}

// Keep literal source paths (including underscores and bracket keys) out of
// Markdown's emphasis/link parser. Split formatted paths still use the AST walk.
const sourceExpressions: Plugin<[], Root> = function sourceExpressions() {
  const data = this.data();
  (data.micromarkExtensions ??= []).push({
    text: {
      [codes.leftCurlyBrace]: {
        name: "sourceExpression",
        tokenize: (effects, ok, nok) => {
          let path = "";
          const inside: State = (code) => {
            if (code === codes.rightCurlyBrace) {
              if (!parsePath(path.trim(), true)) return nok(code);
              effects.consume(code);
              effects.exit("sourceExpression");
              return ok;
            }
            if (
              code === null ||
              code === codes.leftCurlyBrace ||
              code === codes.lineFeed ||
              code === codes.carriageReturn ||
              code === codes.carriageReturnLineFeed
            )
              return nok(code);
            path += code < 0 ? " " : String.fromCodePoint(code);
            effects.consume(code);
            return inside;
          };
          return (code) => {
            effects.enter("sourceExpression");
            effects.consume(code);
            return inside;
          };
        },
      },
    },
  });
  (data.fromMarkdownExtensions ??= []).push({
    enter: {
      sourceExpression(token) {
        this.enter({ type: "text", value: this.sliceSerialize(token) }, token);
      },
    },
    exit: {
      sourceExpression(token) {
        this.exit(token);
      },
    },
  });
};

// Source paths are literal text, not Markdown reference links such as [0].
const sourceExpressionSyntax: MarkdownConfig = {
  defineNodes: ["SourceExpression"],
  parseInline: [
    {
      name: "SourceExpression",
      before: "Link",
      parse: (context, character, from) => {
        if (character !== 123) return -1;
        let to = from + 1;
        while (to < context.end) {
          const next = context.char(to);
          if (next === 125)
            return context.addElement(context.elt("SourceExpression", from, to + 1));
          if (next === 123 || next === 10) return -1;
          to++;
        }
        return -1;
      },
    },
  ],
};

function useVariableSource(source: Source | undefined, endpoint: string) {
  const options = source ? sourceQueryOptions(endpoint, source, "all") : undefined;
  return useQuery<SourceData>({
    ...options,
    queryKey: options?.queryKey ?? ["source", undefined],
    queryFn: options?.queryFn ?? skipToken,
  });
}

function MarkdownContent({ template, data }: { template: string; data?: unknown }) {
  const plugins = useMemo(
    () => [
      remarkGfm,
      sourceExpressions,
      () => (tree: Root) => {
        if (data === undefined) return;
        transformSourceExpressions(tree, (path) => {
          const expression = `{${path}}`;
          const value = interpolateSourceText(expression, data);
          return value === expression ? undefined : value;
        });
      },
    ],
    [data],
  );
  // Interpolation happens after Markdown parsing: values remain literal text,
  // never Markdown, HTML, image sources, or link destinations.
  return (
    <div className="prose max-w-none">
      <Markdown remarkPlugins={plugins} skipHtml>
        {template}
      </Markdown>
    </div>
  );
}

export function SourceVariablePreview({
  template,
  source,
  endpoint,
  text,
  missingSource = false,
}: {
  template: string;
  source: Source | undefined;
  endpoint: string;
  text: ReportBuilderText;
  missingSource?: boolean;
}) {
  const query = useVariableSource(source, endpoint);
  return (
    <div
      data-richtext-preview=""
      aria-busy={source !== undefined && query.isFetching}
      className="space-y-2"
    >
      {missingSource && (
        <output className="block text-sm text-secondary">
          {text.layout_richtext_source_missing}
        </output>
      )}
      {source !== undefined && query.isPending && (
        <output className="block text-sm text-secondary">{text.loading}</output>
      )}
      {query.isError && (
        <p role="alert" className="text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : text.request_failed}
        </p>
      )}
      {query.data?.result.truncated === true && (
        <output className="block text-sm text-secondary">{text.source_truncated}</output>
      )}
      <MarkdownContent template={template} data={query.data?.result} />
    </div>
  );
}

export function SourceRichTextEditor({
  template,
  onChange,
  source,
  endpoint,
  text,
  missingSource = false,
}: {
  template: string;
  onChange: (template: string) => void;
  source: Source | undefined;
  endpoint: string;
  text: ReportBuilderText;
  missingSource?: boolean;
}) {
  const query = useVariableSource(source, endpoint);
  const paths = useMemo(
    () => (query.data ? sourceVariablePaths(query.data.result) : []),
    [query.data],
  );
  const parent = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const latest = useRef({ template, onChange });
  useLayoutEffect(() => {
    latest.current = { template, onChange };
  }, [template, onChange]);
  const completion = useMemo(() => new Compartment(), []);
  const complete = useMemo<CompletionSource>(
    () => (context) => {
      const line = context.state.doc.lineAt(context.pos);
      const match = line.text.slice(0, context.pos - line.from).match(/\{([^{}]*)$/u);
      if (!match) return null;
      const prefix = match[1].trimStart();
      const suffix = line.text.slice(context.pos - line.from).match(/^[^{}]*\}/u)?.[0].length ?? 0;
      const from = context.pos - match[0].length;
      const to = context.pos + suffix;
      return {
        from,
        to,
        filter: false,
        options: paths
          .filter((path) => path.startsWith(prefix))
          .slice(0, 8)
          .map((path) => ({
            label: `{${path}}`,
            apply: (view: EditorView) => {
              const insert = `{${path}}`;
              view.dispatch({
                changes: { from, to, insert },
                selection: { anchor: from + insert.length },
                userEvent: "input.complete",
              });
            },
          })),
      };
    },
    [paths],
  );

  useEffect(() => {
    let view: EditorView | undefined;
    if (parent.current) {
      view = new EditorView({
        parent: parent.current,
        doc: latest.current.template,
        extensions: [
          markdown({
            extensions: [GFM, ...prosemarkMarkdownSyntaxExtensions, sourceExpressionSyntax],
          }),
          prosemarkBasicSetup(),
          prosemarkBaseThemeSetup(),
          pasteRichTextExtension(),
          Prec.highest(keymap.of([{ key: "Tab", run: acceptCompletion }])),
          completion.of([]),
          tooltips({ parent: document.body }),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": text.layout_richtext_content }),
          EditorState.phrases.of({ Completions: text.layout_richtext_variables }),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some(
                (transaction) => transaction.annotation(externalChange) === true,
              )
            )
              latest.current.onChange(update.state.doc.toString());
            if (
              update.selectionSet &&
              !update.docChanged &&
              update.view.hasFocus &&
              update.state.selection.main.empty
            ) {
              const cursor = update.state.selection.main.head;
              const line = update.state.doc.lineAt(cursor);
              if (/\{[^{}]*$/u.test(line.text.slice(0, cursor - line.from))) {
                // CodeMirror cannot dispatch another transaction during an update.
                queueMicrotask(() => {
                  if (editor.current === update.view) startCompletion(update.view);
                });
              }
            }
          }),
        ],
      });
      editor.current = view;
    }
    return () => {
      editor.current = null;
      view?.destroy();
    };
  }, [completion, text]);

  useEffect(() => {
    const view = editor.current;
    if (view) {
      view.dispatch({
        effects: completion.reconfigure(
          autocompletion({
            override: [complete],
            tooltipClass: () => "dashboard-source-completion",
            interactionDelay: 0,
          }),
        ),
      });
      if (view.hasFocus && view.state.selection.main.empty) startCompletion(view);
    }
  }, [completion, complete]);

  useEffect(() => {
    const view = editor.current;
    if (view && view.state.doc.toString() !== template) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: template },
        annotations: [externalChange.of(true), Transaction.addToHistory.of(false)],
      });
    }
  }, [template]);

  const format = (key: string) => {
    const view = editor.current;
    if (!view) return;
    prosemarkMarkdownFormattingKeymap.find((binding) => binding.key === key)?.run?.(view);
    view.focus();
  };
  const prefixLines = (prefix: string) => {
    const view = editor.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const first = view.state.doc.lineAt(from);
    const last = view.state.doc.lineAt(to);
    const lines = view.state.doc.sliceString(first.from, last.to).split("\n");
    const remove = lines.every((line) => line.startsWith(prefix));
    view.dispatch({
      changes: {
        from: first.from,
        to: last.to,
        insert: lines
          .map((line) => (remove ? line.slice(prefix.length) : prefix + line))
          .join("\n"),
      },
      userEvent: "input.format",
    });
    view.focus();
  };
  return (
    <div className="space-y-4" data-prosemark-editor="">
      <div role="toolbar" aria-label={text.layout_richtext_format} className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="ghost"
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            format("Mod-b");
          }}
        >
          {text.layout_richtext_bold}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            format("Mod-i");
          }}
        >
          {text.layout_richtext_italic}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            prefixLines("## ");
          }}
        >
          {text.layout_richtext_heading}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            prefixLines("- ");
          }}
        >
          {text.layout_richtext_list}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            format("Mod-k");
          }}
        >
          {text.layout_richtext_link}
        </Button>
      </div>
      <div ref={parent} />
      {(source !== undefined || missingSource) && (
        <section
          aria-label={text.layout_richtext_preview}
          className="space-y-2 border-t border-secondary pt-3"
        >
          <h3 className="text-xs font-medium text-secondary">{text.layout_richtext_preview}</h3>
          <SourceVariablePreview
            template={template}
            source={source}
            endpoint={endpoint}
            text={text}
            missingSource={missingSource}
          />
        </section>
      )}
    </div>
  );
}
