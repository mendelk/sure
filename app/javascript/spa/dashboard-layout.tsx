/* eslint-disable import/max-dependencies -- The board composes grid placement, component settings, shared sources, and in-place Markdown. */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import GridLayout, { useContainerWidth, verticalCompactor, type Layout } from "react-grid-layout";
// eslint-disable-next-line import/no-unassigned-import -- Grid positioning and resize handles.
import "react-grid-layout/css/styles.css";
// eslint-disable-next-line import/no-unassigned-import -- React Grid Layout uses react-resizable handles.
import "react-resizable/css/styles.css";
// eslint-disable-next-line import/no-unassigned-import -- Scoped grid and ProseMark theme adapters.
import "./dashboard-layout.css";
import { Button } from "./components/button";
import { IconButton } from "./components/icon-button";
import { Toggle } from "./components/toggle";
import {
  appendDashboardItem,
  DASHBOARD_GRID,
  type Dashboard,
  type DashboardLayoutContent,
  type DashboardLayoutData,
  type DashboardLayoutProps,
} from "./dashboard-storage";
import type { LayoutItemId } from "./ids";
import type { ReportBuilderText } from "./report-definition";
import type { Source } from "./source";
import { SourcePicker } from "./source-picker";
import { SourceRichTextEditor, SourceVariablePreview } from "./rich-text-source";
import {
  SourceVisualization,
  TableColumnsField,
  ChartTypeField,
  ChartCategoryField,
  ChartValueField,
} from "./source-visualization";

type DashboardItem = DashboardLayoutContent[number];

const gridMoves: Partial<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
type DashboardLayoutOptions = {
  dashboard: Dashboard;
  sources: Source[];
  endpoint: string;
  onCreateSource: (componentId: LayoutItemId) => void;
  onEditSource: (source: Source, componentId?: LayoutItemId) => void;
  text: ReportBuilderText;
};

function itemLabel(item: DashboardItem, text: ReportBuilderText): string {
  return item.type === "Table"
    ? text.source_table
    : item.type === "Chart"
      ? text.source_chart
      : text.layout_richtext;
}

function gridPositions(content: DashboardLayoutContent): Layout {
  return content.map((item) => ({
    i: item.props.id,
    ...item.position,
    minW: 1,
    maxW: DASHBOARD_GRID.cols,
    resizeHandles: ["se" as const],
  }));
}

function applyPositions(layout: DashboardLayoutData, positions: Layout): DashboardLayoutData {
  const byId = new Map(positions.map((position) => [position.i, position]));
  const content = layout.content.map((item) => {
    const next = byId.get(item.props.id);
    const current = item.position;
    if (
      !next ||
      (next.x === current.x && next.y === current.y && next.w === current.w && next.h === current.h)
    )
      return item;
    return {
      ...item,
      position: { x: next.x, y: next.y, w: next.w, h: next.h },
    };
  });
  return content.every((item, index) => item === layout.content[index]) ? layout : { content };
}

function BoardCard({
  item,
  options,
  selected,
  movable,
  onSelect,
  onChange,
  onHeight,
}: {
  item: DashboardItem;
  options: DashboardLayoutOptions;
  selected: boolean;
  movable: boolean;
  onSelect: (id: LayoutItemId) => void;
  onChange: (item: DashboardItem) => void;
  onHeight: (id: LayoutItemId, rows: number) => void;
}) {
  const content = useRef<HTMLDivElement>(null);
  const source = options.sources.find((candidate) => candidate.id === item.props.sourceId);
  const moveLabel = options.text.layout_move_item.replace("%{name}", itemLabel(item, options.text));
  const moveItem = (event: KeyboardEvent<HTMLButtonElement>) => {
    const move = gridMoves[event.key];
    if (!movable || move === undefined) return;
    event.preventDefault();
    onChange({
      ...item,
      position: {
        ...item.position,
        x: Math.max(0, Math.min(DASHBOARD_GRID.cols - item.position.w, item.position.x + move[0])),
        y: Math.max(0, item.position.y + move[1]),
      },
    });
  };
  useEffect(() => {
    let observer: ResizeObserver | undefined;
    if (item.heightMode === "auto" && content.current) {
      const element = content.current;
      const measure = () => {
        const height = element.getBoundingClientRect().height;
        onHeight(
          item.props.id,
          Math.ceil(
            (height + DASHBOARD_GRID.gap) / (DASHBOARD_GRID.rowHeight + DASHBOARD_GRID.gap),
          ),
        );
      };
      observer = new ResizeObserver(measure);
      observer.observe(element);
      measure();
    }
    return () => {
      observer?.disconnect();
    };
  }, [item.heightMode, item.props.id, onHeight]);
  return (
    <div
      className={`relative flex h-full min-h-0 min-w-0 flex-col ${selected ? "ring-2 ring-info" : ""}`}
      data-dashboard-grid-item={item.props.id}
      data-dashboard-table={item.type === "Table" ? item.props.id : undefined}
      data-dashboard-chart={item.type === "Chart" ? item.props.id : undefined}
      data-dashboard-richtext={item.type === "RichText" ? item.props.id : undefined}
    >
      <div
        data-dashboard-block-controls=""
        className="absolute right-6 top-0 z-10 flex items-center gap-1 rounded-lg bg-container shadow-border-xs"
      >
        {movable && (
          <IconButton
            size="sm"
            icon="grip-horizontal"
            label={moveLabel}
            data-dashboard-drag-handle=""
            className="cursor-grab"
            onKeyDown={moveItem}
          />
        )}
        <IconButton
          size="sm"
          icon="pencil"
          label={options.text.layout_edit_item.replace("%{name}", itemLabel(item, options.text))}
          data-dashboard-edit-item={item.props.id}
          aria-expanded={selected}
          aria-controls="dashboard-component-panel"
          onClick={() => {
            onSelect(item.props.id);
          }}
        />
      </div>
      <div
        ref={content}
        data-dashboard-auto-height={item.heightMode === "auto" ? "" : undefined}
        className={
          item.heightMode === "auto" ? "min-w-0 shrink-0" : "min-h-0 min-w-0 flex-1 overflow-auto"
        }
      >
        {item.type === "RichText" ? (
          <div className="text-primary">
            {selected ? (
              <SourceRichTextEditor
                template={item.props.content}
                source={source}
                endpoint={options.endpoint}
                text={options.text}
                missingSource={item.props.sourceId !== undefined && source === undefined}
                onChange={(value) => {
                  onChange({
                    ...item,
                    props: { ...item.props, content: value },
                  });
                }}
              />
            ) : (
              <SourceVariablePreview
                template={item.props.content}
                source={source}
                endpoint={options.endpoint}
                text={options.text}
                missingSource={item.props.sourceId !== undefined && source === undefined}
              />
            )}
          </div>
        ) : source === undefined ? (
          <p className="text-sm text-secondary">{options.text.source_choose_first}</p>
        ) : (
          <SourceVisualization
            source={source}
            view={item}
            endpoint={options.endpoint}
            text={options.text}
          />
        )}
      </div>
    </div>
  );
}

function DashboardBoard({
  options,
  layout,
  selectedId,
  onSelect,
  onChange,
}: {
  options: DashboardLayoutOptions;
  layout: DashboardLayoutData;
  selectedId?: LayoutItemId;
  onSelect: (id: LayoutItemId) => void;
  onChange: (layout: DashboardLayoutData) => void;
}) {
  const { width, containerRef, mounted } = useContainerWidth({
    measureBeforeMount: true,
  });
  const [autoRows, setAutoRows] = useState<Partial<Record<LayoutItemId, number>>>({});
  const onHeight = useCallback((id: LayoutItemId, rows: number) => {
    setAutoRows((current) => (current[id] === rows ? current : { ...current, [id]: rows }));
  }, []);
  const narrow = width < 640;
  const positions = useMemo(() => {
    const next = gridPositions(layout.content);
    let bottom = 0;
    for (let index = 0; index < next.length; index++) {
      const position = next[index];
      const item = layout.content[index];
      if (item.heightMode === "auto") position.h = autoRows[item.props.id] ?? position.h;
      // Lock the corner handle's vertical axis to the measured content height.
      if (item.heightMode === "auto") position.minH = position.maxH = position.h;
      if (narrow) {
        position.x = 0;
        position.y = bottom;
        position.w = DASHBOARD_GRID.cols;
      }
      bottom += position.h;
    }
    return next;
  }, [layout.content, autoRows, narrow]);
  const children = useMemo(
    () =>
      layout.content.map((item) => (
        <div key={item.props.id}>
          <BoardCard
            item={item}
            options={options}
            movable={!narrow}
            selected={item.props.id === selectedId}
            onSelect={onSelect}
            onChange={(next) => {
              onChange({
                content: layout.content.map((current) =>
                  current.props.id === next.props.id ? next : current,
                ),
              });
            }}
            onHeight={onHeight}
          />
        </div>
      )),
    [layout.content, narrow, options, onChange, onSelect, onHeight, selectedId],
  );
  return (
    <div ref={containerRef} data-dashboard-board="" className="min-w-0">
      {mounted && (
        <GridLayout
          width={width}
          layout={positions}
          gridConfig={{
            cols: DASHBOARD_GRID.cols,
            rowHeight: DASHBOARD_GRID.rowHeight,
            margin: [DASHBOARD_GRID.gap, DASHBOARD_GRID.gap],
            containerPadding: [0, 0],
          }}
          dragConfig={{
            enabled: !narrow,
            handle: "[data-dashboard-drag-handle]",
            cancel: ".cm-editor, input, select, textarea",
            allowMobileScroll: true,
          }}
          resizeConfig={{
            enabled: !narrow,
            handles: ["se"],
          }}
          onDragStop={(next) => {
            if (!narrow) onChange(applyPositions(layout, next));
          }}
          onResizeStop={(next) => {
            if (!narrow) onChange(applyPositions(layout, next));
          }}
        >
          {children}
        </GridLayout>
      )}
    </div>
  );
}

function ComponentSettings({
  item,
  options,
  onChange,
}: {
  item: DashboardItem;
  options: DashboardLayoutOptions;
  onChange: (item: DashboardItem) => void;
}) {
  const { text, endpoint } = options;
  const source = options.sources.find((candidate) => candidate.id === item.props.sourceId);
  return (
    <section aria-label={text.layout_settings} className="space-y-4">
      <h2 className="text-sm font-semibold text-primary">{itemLabel(item, text)}</h2>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="layout-auto-height" className="text-sm font-medium text-primary">
          {text.layout_auto_height}
        </label>
        <Toggle
          id="layout-auto-height"
          label={text.layout_auto_height}
          checked={item.heightMode === "auto"}
          onChange={(checked) => {
            onChange({
              ...item,
              heightMode: checked ? "auto" : "fixed",
            });
          }}
        />
      </div>
      <SourcePicker
        id="layout-source"
        value={item.props.sourceId}
        sources={options.sources}
        text={text}
        onChange={(sourceId) => {
          const next = structuredClone(item);
          if (sourceId === undefined) delete next.props.sourceId;
          else next.props.sourceId = sourceId;
          onChange(next);
        }}
        onCreateSource={() => {
          options.onCreateSource(item.props.id);
        }}
        onEditSource={(selectedSource) => {
          options.onEditSource(selectedSource, item.props.id);
        }}
      />
      {item.type === "Table" && (
        <TableColumnsField
          source={source}
          endpoint={endpoint}
          text={text}
          value={item.props.visibleColumns}
          onChange={(visibleColumns) => {
            onChange({ ...item, props: { ...item.props, visibleColumns } });
          }}
        />
      )}
      {item.type === "Chart" && (
        <>
          <ChartTypeField
            text={text}
            value={item.props.chartType}
            onChange={(chartType) => {
              onChange({ ...item, props: { ...item.props, chartType } });
            }}
          />
          <ChartCategoryField
            source={source}
            endpoint={endpoint}
            text={text}
            value={item.props.categoryField}
            onChange={(categoryField) => {
              onChange({ ...item, props: { ...item.props, categoryField } });
            }}
          />
          <ChartValueField
            source={source}
            endpoint={endpoint}
            text={text}
            value={item.props.valueField}
            onChange={(valueField) => {
              onChange({ ...item, props: { ...item.props, valueField } });
            }}
          />
        </>
      )}
    </section>
  );
}

export function DashboardLayout(
  options: DashboardLayoutOptions & {
    onChange: (layout: DashboardLayoutData) => void;
    selectedId?: LayoutItemId;
    adding: boolean;
    onSelect: (id?: LayoutItemId) => void;
  },
) {
  const { onChange, onSelect, selectedId, adding } = options;
  const panelClose = useRef<HTMLButtonElement>(null);
  const selected = options.dashboard.layout.content.find((item) => item.props.id === selectedId);
  useEffect(() => {
    if (selectedId !== undefined || adding) panelClose.current?.focus();
  }, [selectedId, adding]);
  const change = useCallback(
    (layout: DashboardLayoutData) => {
      const next = applyPositions(
        layout,
        verticalCompactor.compact(gridPositions(layout.content), DASHBOARD_GRID.cols),
      );
      if (next !== options.dashboard.layout) onChange(next);
    },
    [onChange, options.dashboard.layout],
  );
  const changeItem = (next: DashboardItem) => {
    change({
      content: options.dashboard.layout.content.map((item) =>
        item.props.id === next.props.id ? next : item,
      ),
    });
  };
  const add = (type: keyof DashboardLayoutProps) => {
    const next = appendDashboardItem(options.dashboard.layout, type);
    change(next);
    onSelect(next.content.at(-1)?.props.id);
  };
  const duplicate = (item: DashboardItem) => {
    const next = appendDashboardItem(options.dashboard.layout, item.type);
    const placeholder = next.content.at(-1);
    if (!placeholder) return;
    const copy = structuredClone(item);
    copy.props.id = placeholder.props.id;
    copy.position.x = 0;
    copy.position.y = placeholder.position.y;
    next.content[next.content.length - 1] = copy;
    change(next);
    onSelect(copy.props.id);
  };
  const remove = (id: LayoutItemId) => {
    change({
      content: options.dashboard.layout.content.filter((item) => item.props.id !== id),
    });
    onSelect();
  };
  return (
    <section className="space-y-3" data-dashboard-layout="">
      <div className="flex min-w-0 items-start gap-4">
        <div className="min-w-0 flex-1">
          <DashboardBoard
            options={options}
            layout={options.dashboard.layout}
            selectedId={selectedId}
            onSelect={onSelect}
            onChange={change}
          />
        </div>
        {(adding || selected) && (
          <aside
            id="dashboard-component-panel"
            aria-label={options.text.layout_settings}
            data-dashboard-component-panel=""
            className="fixed inset-y-0 right-0 z-30 w-80 max-w-full space-y-4 overflow-y-auto border-l border-secondary bg-container p-4 lg:sticky lg:top-20 lg:z-20 lg:max-h-[calc(100dvh-5rem)] lg:w-72 lg:shrink-0 lg:self-start"
          >
            <header className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-primary">
                {adding ? options.text.layout_add_item : options.text.layout_settings}
              </h2>
              <IconButton
                ref={panelClose}
                icon="x"
                size="sm"
                label={options.text.source_close}
                onClick={() => {
                  onSelect();
                }}
              />
            </header>
            {adding ? (
              <section aria-label={options.text.layout_add_item} className="space-y-2">
                <Button
                  fullWidth
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    add("Table");
                  }}
                >
                  {options.text.source_add_table}
                </Button>
                <Button
                  fullWidth
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    add("Chart");
                  }}
                >
                  {options.text.source_add_chart}
                </Button>
                <Button
                  fullWidth
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    add("RichText");
                  }}
                >
                  {options.text.layout_add_richtext}
                </Button>
              </section>
            ) : (
              selected && (
                <>
                  <ComponentSettings item={selected} options={options} onChange={changeItem} />
                  <div className="flex flex-wrap gap-2 border-t border-secondary pt-4">
                    <Button
                      size="sm"
                      variant="secondary"
                      iconProps={{ name: "copy", size: "sm" }}
                      onClick={() => {
                        duplicate(selected);
                      }}
                    >
                      {options.text.layout_duplicate_item}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive-outline"
                      iconProps={{ name: "trash-2", size: "sm" }}
                      onClick={() => {
                        remove(selected.props.id);
                      }}
                    >
                      {options.text.layout_delete_item}
                    </Button>
                  </div>
                </>
              )
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
