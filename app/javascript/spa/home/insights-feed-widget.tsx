import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Icon, type IconName } from "../icon";
import { acknowledgeHomeInsight, homeWidgetsQueryOptions, type HomeInsight } from "./home-api";

const DEFAULT_TEXT = {
  headerNew: "New",
  header: "Insights",
  preview: "Preview",
  viewAll: "View all",
  acknowledge: "Acknowledge",
  empty: "You're all caught up.",
} as const;

export type InsightsFeedText = {
  headerNew: string;
  header: string;
  preview: string;
  viewAll: string;
  acknowledge: string;
  empty: string;
};
export function resolveInsightsText(homeText: Record<string, string | undefined>) {
  return {
    headerNew: homeText.insights_header_new ?? DEFAULT_TEXT.headerNew,
    header: homeText.insights_header ?? DEFAULT_TEXT.header,
    preview: homeText.insights_preview ?? DEFAULT_TEXT.preview,
    viewAll: homeText.insights_view_all ?? DEFAULT_TEXT.viewAll,
    acknowledge: homeText.insights_acknowledge ?? DEFAULT_TEXT.acknowledge,
    empty: DEFAULT_TEXT.empty,
  };
}
export type { HomeInsight };

/**
 * Maps server insight icon keys to SPA icon names. Unknown keys fall back to
 * a lightbulb-style generic icon, mirroring the ERB helper's default.
 */
function insightIconName(key: string): IconName {
  const map: Record<string, IconName> = {
    activity: "chart-line",
    "alert-triangle": "alert-triangle",
    trophy: "sparkles",
    repeat: "refresh-ccw",
    "piggy-bank": "wallet-minimal",
    wallet: "wallet-minimal",
    "circle-check": "check",
    "shield-alert": "circle-alert",
    lightbulb: "sparkles",
  };
  return map[key] ?? "sparkles";
}

function InsightRow({
  insight,
  viewAllHref,
  text,
  onAcknowledged,
}: {
  insight: HomeInsight;
  viewAllHref: string;
  text: InsightsFeedText;
  onAcknowledged: (id: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  if (insight.status === "acknowledged") return null;

  const acknowledge = async () => {
    setPending(true);
    setFailed(false);
    try {
      await acknowledgeHomeInsight(insight.acknowledge_path);
      onAcknowledged(insight.id);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="relative flex items-center mx-3 px-3 py-2.5 rounded-lg gap-3 group/insight">
      <a
        href={viewAllHref}
        className="absolute inset-0 rounded-lg cursor-pointer"
        aria-label={insight.title}
        data-turbo-prefetch="false"
      />
      <div
        className="h-7 w-7 shrink-0 rounded-full flex justify-center items-center group-hover/insight:scale-105 transition-all duration-300"
        style={{
          backgroundColor: `color-mix(in oklab, ${insight.icon_css_color} 10%, transparent)`,
          color: insight.icon_css_color,
        }}
      >
        <Icon name={insightIconName(insight.icon_key)} size="sm" className="text-current" />
      </div>

      <div className="min-w-0 grow">
        <span className="text-sm font-medium text-primary truncate block">{insight.title}</span>
        <p className="text-sm text-secondary truncate">{insight.body}</p>
      </div>

      {insight.key_figure ? (
        <div className="text-right shrink-0">
          <p
            className={`text-sm font-medium whitespace-nowrap privacy-sensitive ${insight.sentiment === "positive" ? "text-success" : "text-primary"}`}
          >
            {insight.key_figure.value}
          </p>
          <p className="text-xs text-secondary whitespace-nowrap">{insight.key_figure.caption}</p>
        </div>
      ) : null}

      <div className="relative z-10 shrink-0 opacity-0 group-hover/insight:opacity-100 group-focus-within/insight:opacity-100 pointer-coarse:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => void acknowledge()}
          disabled={pending}
          title={failed ? "Try again" : text.acknowledge}
          aria-label={`${text.acknowledge}: ${insight.title}`}
          className="flex items-center justify-center w-7 h-7 rounded-full text-secondary hover:text-primary hover:bg-container-inset-hover transition-colors disabled:opacity-50"
        >
          <Icon name="check" size="sm" className="text-current" />
        </button>
      </div>
    </div>
  );
}

export function InsightsFeedWidget({
  insights,
  viewAllHref,
  homePath,
  text = DEFAULT_TEXT,
}: {
  insights: HomeInsight[];
  viewAllHref: string;
  homePath: string;
  text?: InsightsFeedText;
}) {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<Record<string, true>>({});

  const visible = insights.filter(
    (insight) => insight.status !== "acknowledged" && !(insight.id in dismissed),
  );
  const newCount = visible.filter((insight) => insight.status === "active").length;

  const handleAcknowledged = (id: string) => {
    setDismissed((prev) => ({ ...prev, [id]: true as const }));
    void queryClient.invalidateQueries({ queryKey: homeWidgetsQueryOptions(homePath).queryKey });
  };

  return (
    <div id="insights-feed" className="px-4 -mt-2">
      <div className="bg-container-inset rounded-xl p-1 space-y-1">
        <div className="px-4 py-2 flex items-center justify-between uppercase text-xs font-medium text-secondary">
          <div className="flex items-center gap-2">
            {newCount > 0 ? (
              <p>
                {text.headerNew}
                <span className="text-subdued mx-1">&middot;</span>
                {newCount}
              </p>
            ) : (
              <p>{text.header}</p>
            )}
            <span className="inline-flex items-center rounded-full bg-container px-2 py-0.5 text-[11px] font-medium normal-case">
              {text.preview}
            </span>
          </div>

          <a
            href={viewAllHref}
            data-turbo-prefetch="false"
            className="text-xs font-medium normal-case hover:underline"
          >
            {text.viewAll}
          </a>
        </div>

        <div className="py-1.5 shadow-border-xs rounded-lg bg-container text-sm">
          {visible.length > 0 ? (
            visible.map((insight) => (
              <InsightRow
                key={insight.id}
                insight={insight}
                viewAllHref={viewAllHref}
                text={text}
                onAcknowledged={handleAcknowledged}
              />
            ))
          ) : (
            <p className="px-4 py-3 text-sm text-secondary">{text.empty}</p>
          )}
        </div>
      </div>
    </div>
  );
}
