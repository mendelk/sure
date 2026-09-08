// Sure charts barrel (t_alt_fnd_016).
//
// Feature code imports the three chart components plus the injectable
// `SureChartLabels` helpers from here — never `@tanstack/charts` directly.
// The Alpha dependency is an implementation detail of each chart module.
export { AllocationDonut } from "./allocation-donut";
export type { AllocationDonutProps, AllocationSlice } from "./allocation-donut";
export { CashFlowChart } from "./cash-flow-chart";
export type { CashFlowChartProps, CashFlowPoint, CashFlowSeries } from "./cash-flow-chart";
export {
	applyCountTemplate,
	applyTitleTemplate,
	defaultAllocationCopy,
	defaultCashFlowCopy,
	defaultNetWorthCopy,
} from "./chart-copy";
export type { AllocationCopy, CashFlowCopy, ChartCopyBase, NetWorthCopy } from "./chart-copy";
export { SURE_CHART_MASKED_LABEL, defaultChartLabels, withPrivacyMasking } from "./chart-format";
export type { SureChartLabels } from "./chart-format";
export { useChartEnvironment } from "./chart-environment";
export type { ChartEnvironment } from "./chart-environment";
export { sureChartPalette, sureChartTheme } from "./chart-palette";
export type { SureChartPalette, SureChartThemeMapping } from "./chart-palette";
export { NetWorthChart } from "./net-worth-chart";
export type { NetWorthChartProps, NetWorthPoint } from "./net-worth-chart";
export { SureChartDataTable, SureChartFigure, SureChartLegend } from "./sure-chart-host";
export type {
	SureChartFigureProps,
	SureChartLegendItem,
	SureChartTableProps,
} from "./sure-chart-host";
