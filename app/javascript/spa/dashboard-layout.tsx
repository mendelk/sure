import {
  Puck,
  Render,
  RichTextMenu,
  createUsePuck,
  walkTree,
  type Config,
  type RichtextField,
  type Slot,
} from "@puckeditor/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type CSSProperties,
  type RefObject,
  type ComponentProps,
} from "react";
// eslint-disable-next-line import/no-unassigned-import -- Puck's editor stylesheet.
import "@puckeditor/core/puck.css";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { DashboardLayoutSchema } from "./dashboard-storage";
import { LayoutItemIdSchema, SourceIdSchema, type LayoutItemId } from "./ids";
import type { Dashboard, DashboardLayoutData, DashboardLayoutProps } from "./dashboard-storage";
import type { ReportBuilderText } from "./report-definition";
import type { Source } from "./source";
import { SourcePicker } from "./source-picker";
import {
  SourceVisualization,
  TableColumnsField,
  ChartTypeField,
  ChartCategoryField,
  ChartValueField,
  type SourceVisualizationView,
} from "./source-visualization";

// The editor's string IDs cross back into the branded domain through Zod.
type PuckLayoutProps = {
  [Type in keyof DashboardLayoutProps]: Omit<
    DashboardLayoutProps[Type],
    "id" | "content" | "sourceId"
  > &
    (Type extends "Grid" | "GridItem"
      ? { content: Slot<PuckLayoutProps> }
      : Type extends "RichText"
        ? { content: DashboardLayoutProps["RichText"]["content"] }
        : { sourceId: string });
};

type DashboardLayoutOptions = {
  dashboard: Dashboard;
  sources: Source[];
  endpoint: string;
  onCreateSource: (componentId: LayoutItemId) => void;
  onEditSource: (source: Source) => void;
  text: ReportBuilderText;
};

type RichTextMenuProps = Parameters<NonNullable<RichtextField["renderMenu"]>>[0];
type ActiveRichTextEditor = {
  id: LayoutItemId;
  editor: NonNullable<RichTextMenuProps["editor"]>;
};
type ActiveRichTextEditorRef = RefObject<ActiveRichTextEditor | null>;
type FocusRichTextEditor = (editor: ActiveRichTextEditor) => void;

// Puck retains its initial config. Live catalog updates must cross that boundary
// without remounting Puck and discarding the layout draft.
const SourceCatalogContext = createContext<Source[]>([]);

function useDashboardConfig(
  { endpoint, onCreateSource, onEditSource, text }: DashboardLayoutOptions,
  onFocusEditor?: FocusRichTextEditor,
) {
  return useMemo<Config<PuckLayoutProps>>(() => {
    const sourceField = {
      type: "custom" as const,
      render: ({
        value,
        onChange,
        id,
      }: {
        value: string;
        onChange: (value: string) => void;
        id: string;
      }) => (
        <SourceReferenceField
          id={id}
          value={value === "" ? "" : SourceIdSchema.parse(value)}
          onChange={onChange}
          onCreateSource={onCreateSource}
          onEditSource={onEditSource}
          text={text}
        />
      ),
    };
    const renderRichTextMenu = (props: RichTextMenuProps) =>
      onFocusEditor ? (
        <TrackRichTextEditor {...props} onFocusEditor={onFocusEditor} />
      ) : (
        props.children
      );
    return {
      categories: {
        layout: { components: ["Grid", "GridItem"], title: text.layout_grid },
        content: {
          components: ["Table", "Chart", "RichText"],
          title: text.layout_content,
        },
        other: { visible: false },
      },
      root: {
        fields: {},
      },
      components: {
        Grid: {
          label: text.layout_grid,
          fields: { content: { type: "slot", allow: ["GridItem"] } },
          defaultProps: { content: [] },
          resolvePermissions: ({ props }) =>
            props.id === "dashboard-grid"
              ? { delete: false, duplicate: false, drag: false }
              : { delete: true, duplicate: true, drag: true },
          render: ({ content: Content }) => (
            <Content className="grid min-w-0 grid-cols-12 items-start gap-3" />
          ),
        },
        GridItem: {
          label: text.layout_grid_item,
          inline: true,
          fields: {
            columnSpan: {
              type: "number",
              label: text.layout_column_span,
              min: 1,
              max: 12,
              step: 1,
            },
            height: {
              type: "custom",
              render: ({ id, value, onChange }) => (
                <GridItemHeightField id={id} value={value} onChange={onChange} text={text} />
              ),
            },
            content: { type: "slot" },
          },
          defaultProps: { content: [], columnSpan: 12, height: 4 },
          resolveData: ({ props }) => ({
            props: {
              columnSpan: Math.max(1, Math.min(12, Math.round(props.columnSpan) || 1)),
              height:
                props.height === "auto"
                  ? "auto"
                  : Math.max(3, Math.min(12, Math.round(props.height) || 3)),
            },
          }),
          render: ({ id, content: Content, columnSpan, height, puck }) => (
            <div
              ref={puck.dragRef}
              data-dashboard-grid-item={id}
              className="col-span-12 min-w-0 md:col-[span_var(--dashboard-column-span)]"
              style={
                {
                  "--dashboard-column-span": columnSpan,
                  height: height === "auto" ? undefined : height * 80,
                } as CSSProperties
              }
            >
              <Content
                className={`flex min-h-0 min-w-0 flex-col gap-3 ${height === "auto" ? "" : "h-full"}`}
              />
            </div>
          ),
        },
        Table: {
          label: text.source_table,
          inline: true,
          fields: {
            sourceId: sourceField,
            visibleColumns: {
              type: "custom",
              render: ({ value, onChange }) => (
                <TableColumnsEditor
                  endpoint={endpoint}
                  text={text}
                  value={value}
                  onChange={onChange}
                />
              ),
            },
          },
          defaultProps: { sourceId: "", visibleColumns: [] },
          render: ({ id, sourceId, visibleColumns, puck }) => (
            <div ref={puck.dragRef} data-dashboard-table={id} className="min-h-0 min-w-0 flex-1">
              <DashboardSourceVisualization
                endpoint={endpoint}
                text={text}
                view={{
                  type: "Table",
                  props: {
                    sourceId: sourceId === "" ? "" : SourceIdSchema.parse(sourceId),
                    visibleColumns,
                  },
                }}
                onEditSource={onEditSource}
              />
            </div>
          ),
        },
        Chart: {
          label: text.source_chart,
          inline: true,
          fields: {
            sourceId: sourceField,
            chartType: {
              type: "custom",
              render: ({ value, onChange }) => (
                <ChartTypeField value={value} onChange={onChange} text={text} />
              ),
            },
            categoryField: {
              type: "custom",
              render: ({ value, onChange }) => (
                <ChartAxisEditor
                  field="category"
                  endpoint={endpoint}
                  text={text}
                  value={value}
                  onChange={onChange}
                />
              ),
            },
            valueField: {
              type: "custom",
              render: ({ value, onChange }) => (
                <ChartAxisEditor
                  field="value"
                  endpoint={endpoint}
                  text={text}
                  value={value}
                  onChange={onChange}
                />
              ),
            },
          },
          defaultProps: { sourceId: "", chartType: "line", categoryField: "", valueField: "" },
          render: ({ id, sourceId, chartType, categoryField, valueField, puck }) => (
            <div ref={puck.dragRef} data-dashboard-chart={id} className="min-h-0 min-w-0 flex-1">
              <DashboardSourceVisualization
                endpoint={endpoint}
                text={text}
                view={{
                  type: "Chart",
                  props: {
                    sourceId: sourceId === "" ? "" : SourceIdSchema.parse(sourceId),
                    chartType,
                    categoryField,
                    valueField,
                  },
                }}
                onEditSource={onEditSource}
              />
            </div>
          ),
        },
        RichText: {
          label: text.layout_richtext,
          inline: true,
          fields: {
            content: {
              type: "richtext",
              contentEditable: true,
              label: text.layout_richtext_content,
              renderMenu: renderRichTextMenu,
              renderInlineMenu: renderRichTextMenu,
            },
          },
          defaultProps: { content: "" },
          render: ({ id, content, puck }) => (
            <div
              ref={puck.dragRef}
              data-dashboard-richtext={id}
              className="min-h-0 min-w-0 overflow-auto rounded-xl bg-container p-4 text-primary"
            >
              {content}
            </div>
          ),
        },
      },
    };
  }, [endpoint, onCreateSource, onEditSource, text, onFocusEditor]);
}

function GridItemHeightField({
  id,
  value,
  onChange,
  text,
}: {
  id: string;
  value: DashboardLayoutProps["GridItem"]["height"];
  onChange: (height: DashboardLayoutProps["GridItem"]["height"]) => void;
  text: ReportBuilderText;
}) {
  return (
    <div className="space-y-2">
      <FormField
        as="select"
        id={`${id}-mode`}
        label={text.layout_height_mode}
        value={value === "auto" ? "auto" : "fixed"}
        onChange={(event) => {
          onChange(event.currentTarget.value === "auto" ? "auto" : 4);
        }}
      >
        <option value="fixed">{text.layout_height_fixed}</option>
        <option value="auto">{text.layout_height_auto}</option>
      </FormField>
      {value !== "auto" && (
        <FormField
          id={id}
          label={text.layout_height}
          type="number"
          min={3}
          max={12}
          step={1}
          value={value}
          onChange={(event) => {
            onChange(Math.max(3, Math.min(12, Math.round(event.currentTarget.valueAsNumber) || 3)));
          }}
        />
      )}
    </div>
  );
}

function SourceReferenceField(
  props: Omit<ComponentProps<typeof SourcePicker>, "sources" | "onCreateSource"> &
    Pick<DashboardLayoutOptions, "onCreateSource">,
) {
  const sources = useContext(SourceCatalogContext);
  const selectedItem = useLayoutPuck((state) => state.selectedItem);
  if (selectedItem === null) return null;
  return (
    <SourcePicker
      {...props}
      sources={sources}
      onCreateSource={() => {
        props.onCreateSource(LayoutItemIdSchema.parse(selectedItem.props.id));
      }}
    />
  );
}

function DashboardSourceVisualization({
  view,
  endpoint,
  text,
  onEditSource,
}: Pick<DashboardLayoutOptions, "endpoint" | "text" | "onEditSource"> & {
  view: SourceVisualizationView;
}) {
  const source = useContext(SourceCatalogContext).find((item) => item.id === view.props.sourceId);
  if (source === undefined) {
    return (
      <p className="rounded-xl bg-container p-4 text-sm text-secondary">
        {text.source_choose_first}
      </p>
    );
  }
  return (
    <SourceVisualization
      source={source}
      endpoint={endpoint}
      text={text}
      view={view}
      onEditSource={() => {
        onEditSource(source);
      }}
    />
  );
}

function TableColumnsEditor(props: {
  endpoint: string;
  text: ReportBuilderText;
  value: string[];
  onChange: (columns: string[]) => void;
}) {
  const sources = useContext(SourceCatalogContext);
  const sourceId = useLayoutPuck((state) =>
    state.selectedItem?.type === "Table" ? state.selectedItem.props.sourceId : "",
  );
  return <TableColumnsField {...props} source={sources.find((source) => source.id === sourceId)} />;
}

function ChartAxisEditor({
  field,
  ...props
}: {
  field: "category" | "value";
  endpoint: string;
  text: ReportBuilderText;
  value: string;
  onChange: (field: string) => void;
}) {
  const sources = useContext(SourceCatalogContext);
  const sourceId = useLayoutPuck((state) =>
    state.selectedItem?.type === "Chart" ? state.selectedItem.props.sourceId : "",
  );
  const source = sources.find((item) => item.id === sourceId);
  return field === "category" ? (
    <ChartCategoryField {...props} source={source} />
  ) : (
    <ChartValueField {...props} source={source} />
  );
}

export function DashboardLayout(options: DashboardLayoutOptions) {
  const config = useDashboardConfig(options);
  return (
    <SourceCatalogContext.Provider value={options.sources}>
      <Render config={config} data={options.dashboard.layout} />
    </SourceCatalogContext.Provider>
  );
}

type DashboardLayoutEditorOptions = DashboardLayoutOptions & {
  onCancel: () => void;
  onSave: (layout: DashboardLayoutData) => void;
  onDraftChange: (layout: DashboardLayoutData) => void;
  initialComponentId?: LayoutItemId;
};

const useLayoutPuck = createUsePuck<Config<PuckLayoutProps>>();

function LayoutEditorActions({
  onCancel,
  onSave,
  text,
  activeEditor,
}: DashboardLayoutEditorOptions & { activeEditor: ActiveRichTextEditorRef }) {
  const data = useLayoutPuck((state) => state.appState.data);
  const config = useLayoutPuck((state) => state.config);
  const history = useLayoutPuck((state) => state.history);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={!history.hasPast} onClick={history.back} size="sm" variant="secondary">
        {text.undo_layout}
      </Button>
      <Button disabled={!history.hasFuture} onClick={history.forward} size="sm" variant="secondary">
        {text.redo_layout}
      </Button>
      <Button onClick={onCancel} size="sm" variant="secondary">
        {text.cancel_layout}
      </Button>
      <Button
        onClick={() => {
          // Native richtext fields debounce updates; save the live editor's final keystroke.
          const currentEditor = activeEditor.current;
          const resolved =
            currentEditor === null || currentEditor.editor.isDestroyed
              ? data
              : walkTree(data, config, (content) =>
                  content.map((item) =>
                    item.type === "RichText" && item.props.id === currentEditor.id
                      ? {
                          ...item,
                          props: { ...item.props, content: currentEditor.editor.getHTML() },
                        }
                      : item,
                  ),
                );
          // Puck's transient zones/UI state is not part of the dashboard document.
          onSave(DashboardLayoutSchema.parse({ root: { props: {} }, content: resolved.content }));
        }}
        size="sm"
      >
        {text.save_layout}
      </Button>
    </div>
  );
}

function TrackRichTextEditor({
  editor,
  children,
  onFocusEditor,
}: RichTextMenuProps & { onFocusEditor: FocusRichTextEditor }) {
  const id = useLayoutPuck((state) =>
    state.selectedItem?.type === "RichText" ? state.selectedItem.props.id : undefined,
  );
  useEffect(() => {
    const rememberEditor = () => {
      if (editor !== null && id !== undefined)
        onFocusEditor({ id: LayoutItemIdSchema.parse(id), editor });
    };
    editor?.on("focus", rememberEditor);
    if (editor?.isFocused === true) rememberEditor();
    return () => {
      editor?.off("focus", rememberEditor);
    };
  }, [onFocusEditor, editor, id]);
  return <RichTextMenu>{children}</RichTextMenu>;
}

function RestoreLayoutSelection({ id }: { id: LayoutItemId }) {
  const dispatch = useLayoutPuck((state) => state.dispatch);
  const getSelectorForId = useLayoutPuck((state) => state.getSelectorForId);
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    const itemSelector = getSelectorForId(id);
    if (itemSelector !== undefined) {
      dispatch({ type: "setUi", ui: { itemSelector }, recordHistory: false });
      restored.current = true;
    }
  }, [dispatch, getSelectorForId, id]);
  return null;
}

export function DashboardLayoutEditor(options: DashboardLayoutEditorOptions) {
  const activeEditor = useRef<ActiveRichTextEditor | null>(null);
  const [initialLayout] = useState(options.dashboard.layout);
  const onFocusEditor = useCallback((next: ActiveRichTextEditor) => {
    // Save blurs inline editing and closes its menu before the click handler runs.
    activeEditor.current = next;
  }, []);
  const config = useDashboardConfig(options, onFocusEditor);
  return (
    <SourceCatalogContext.Provider value={options.sources}>
      <section aria-label={options.text.edit_layout} className="space-y-3">
        <p className="text-sm text-secondary">{options.text.layout_help}</p>
        <Puck
          config={config}
          data={initialLayout}
          iframe={{ enabled: false }}
          onChange={(data) => {
            options.onDraftChange(
              DashboardLayoutSchema.parse({ root: { props: {} }, content: data.content }),
            );
          }}
        >
          {options.initialComponentId !== undefined && (
            <RestoreLayoutSelection id={options.initialComponentId} />
          )}
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold text-primary">{options.dashboard.name}</h1>
            <LayoutEditorActions {...options} activeEditor={activeEditor} />
          </header>
          <div className="mt-4 flex min-w-0 flex-col gap-4 lg:flex-row">
            <aside className="space-y-4 rounded-xl border border-secondary bg-container p-3 lg:w-64 lg:shrink-0">
              <Puck.Components />
              <Puck.Outline />
              <Puck.Fields />
            </aside>
            <div className="min-w-0 flex-1 pt-12">
              <Puck.Preview />
            </div>
          </div>
        </Puck>
      </section>
    </SourceCatalogContext.Provider>
  );
}
