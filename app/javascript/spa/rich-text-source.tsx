/* eslint-disable jsx-a11y/prefer-tag-over-role -- A contenteditable completion list must preserve the text caret; native select/datalist cannot attach to it. */
import { Render, type Config, type RichText, type RichtextField } from "@puckeditor/core";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "./components/button";
import type { ReportBuilderText } from "./report-definition";
import { sourceQueryOptions, type Source, type SourceData } from "./source";
import { interpolateSourceHtml, sourceVariablePaths } from "./rich-text-variables";

const previewConfig: Config<{ Text: { content: RichText } }> = {
  components: {
    Text: {
      fields: { content: { type: "richtext" } },
      render: ({ content }) => <div className="prose">{content}</div>,
    },
  },
};

function useVariableSource(source: Source | undefined, endpoint: string) {
  const options = source ? sourceQueryOptions(endpoint, source, "all") : undefined;
  return useQuery<SourceData>({
    ...options,
    queryKey: options?.queryKey ?? ["source", undefined],
    queryFn: options?.queryFn ?? skipToken,
  });
}

export function SourceVariablePreview({
  template,
  source,
  endpoint,
  text,
}: {
  template: string;
  source: Source | undefined;
  endpoint: string;
  text: ReportBuilderText;
}) {
  const query = useVariableSource(source, endpoint);
  const content = useMemo(
    () => (query.data ? interpolateSourceHtml(template, query.data.result) : template),
    [template, query.data],
  );
  return (
    <div
      data-richtext-preview=""
      aria-busy={source !== undefined && query.isFetching}
      className="space-y-2"
    >
      {source === undefined && (
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
      <Render
        config={previewConfig}
        data={{ content: [{ type: "Text", props: { id: "richtext-preview", content } }] }}
      />
    </div>
  );
}

type Editor = NonNullable<Parameters<NonNullable<RichtextField["renderMenu"]>>[0]["editor"]>;
type Completion = { prefix: string; from: number; to: number };

export function SourceVariableAutocomplete({
  editor,
  source,
  endpoint,
  text,
}: {
  editor: Editor | null;
  source: Source | undefined;
  endpoint: string;
  text: ReportBuilderText;
}) {
  const query = useVariableSource(source, endpoint);
  const paths = useMemo(
    () => (query.data ? sourceVariablePaths(query.data.result) : []),
    [query.data],
  );
  const subscribe = useCallback(
    (notify: () => void) => {
      editor?.on("update", notify);
      editor?.on("selectionUpdate", notify);
      editor?.on("focus", notify);
      editor?.on("blur", notify);
      editor?.on("unmount", notify);
      return () => {
        editor?.off("update", notify);
        editor?.off("selectionUpdate", notify);
        editor?.off("focus", notify);
        editor?.off("blur", notify);
        editor?.off("unmount", notify);
      };
    },
    [editor],
  );
  const getSnapshot = useCallback(() => {
    if (
      !editor ||
      !editor.isInitialized ||
      editor.isDestroyed ||
      !editor.isFocused ||
      editor.view.composing
    )
      return null;
    const { from, to, $from } = editor.state.selection;
    if (from !== to) return null;
    const before = editor.state.doc.textBetween($from.start(), from, "\n", "\uFFFC");
    const match = before.match(/\{([^{}]*)$/u);
    if (!match) return null;
    const after = editor.state.doc.textBetween(to, $from.end());
    const suffix = after.match(/^[^{}]*\}/u)?.[0].length ?? 0;
    return `${from - match[0].length}:${to + suffix}:${match[1].trimStart()}`;
  }, [editor]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [selected, setSelected] = useState({ snapshot, index: 0 });
  const completion = useMemo<Completion | null>(() => {
    if (snapshot === null || snapshot === dismissed) return null;
    const match = snapshot.match(/^(\d+):(\d+):([\s\S]*)$/u);
    return match ? { from: Number(match[1]), to: Number(match[2]), prefix: match[3] } : null;
  }, [snapshot, dismissed]);
  const suggestions = useMemo(
    () =>
      completion ? paths.filter((path) => path.startsWith(completion.prefix)).slice(0, 8) : [],
    [paths, completion],
  );
  const activeIndex =
    selected.snapshot === snapshot && selected.index < suggestions.length ? selected.index : 0;
  const id = useId();
  const accept = useCallback(
    (path: string) => {
      if (!editor || !completion) return;
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from: completion.from, to: completion.to },
          { type: "text", text: `{${path}}` },
        )
        .run();
      setDismissed(snapshot);
    },
    [editor, completion, snapshot],
  );

  useEffect(() => {
    const dom =
      editor !== null && editor.isInitialized && !editor.isDestroyed ? editor.view.dom : undefined;
    const enabled = completion !== null && suggestions.length > 0;
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setSelected({
          snapshot,
          index: (activeIndex + direction + suggestions.length) % suggestions.length,
        });
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        accept(suggestions[activeIndex]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setDismissed(snapshot);
      }
    };
    if (dom && enabled) {
      dom.setAttribute("aria-autocomplete", "list");
      dom.setAttribute("aria-controls", id);
      dom.setAttribute("aria-activedescendant", `${id}-${activeIndex}`);
      dom.addEventListener("keydown", keydown, true);
    }
    return () => {
      if (dom && enabled) {
        dom.removeEventListener("keydown", keydown, true);
        dom.removeAttribute("aria-autocomplete");
        dom.removeAttribute("aria-controls");
        dom.removeAttribute("aria-activedescendant");
      }
    };
  }, [editor, completion, suggestions, activeIndex, snapshot, id, accept]);

  if (!source || suggestions.length === 0) return null;
  return (
    <div
      id={id}
      role="listbox"
      aria-label={text.layout_richtext_variables}
      className="max-h-64 overflow-auto rounded-lg border border-secondary bg-container p-1"
    >
      {suggestions.map((path, index) => (
        <Button
          key={path}
          id={`${id}-${index}`}
          role="option"
          aria-selected={index === activeIndex}
          fullWidth
          size="sm"
          variant="ghost"
          className={`justify-start ${index === activeIndex ? "bg-surface-inset text-primary" : ""}`}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            accept(path);
          }}
        >
          <span className="truncate font-mono">{`{${path}}`}</span>
        </Button>
      ))}
    </div>
  );
}
