import {
  ArrowLeftRight,
  Box,
  ChartBar,
  ChevronRight,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  List,
  LogOut,
  Map as MapIcon,
  MessageCircleQuestion,
  PanelLeft,
  PanelRight,
  PieChart,
  RefreshCcw,
  User,
  X,
} from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";

function createIcon(children: ReactNode): ComponentType<SVGProps<SVGSVGElement>> {
  return function RawIcon(props: SVGProps<SVGSVGElement>) {
    return (
      // biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon, hidden from a11y tree by consumer
      <svg
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        {children}
      </svg>
    );
  };
}

const ICONS = {
  "arrow-left-right": ArrowLeftRight,
  box: Box,
  "chart-bar": ChartBar,
  "chevron-right": ChevronRight,
  "credit-card": CreditCard,
  clock: Clock,
  download: createIcon(
    <>
      <path d="M12 15V3" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
    </>,
  ),
  eye: Eye,
  "eye-off": EyeOff,
  filter: createIcon(
    <>
      <path d="M3 6h18" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </>,
  ),
  list: List,
  "log-out": LogOut,
  map: MapIcon,
  "message-circle-question": MessageCircleQuestion,
  "more-horizontal": createIcon(
    <>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </>,
  ),
  "panel-left": PanelLeft,
  "panel-right": PanelRight,
  "pie-chart": PieChart,
  plus: createIcon(
    <>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </>,
  ),
  "refresh-ccw": RefreshCcw,
  search: createIcon(
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.34-4.34" />
    </>,
  ),
  user: User,
  x: X,
} satisfies Record<string, ComponentType<SVGProps<SVGSVGElement>>>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = "md",
  ...rest
}: {
  name: keyof typeof ICONS;
  size?: "sm" | "md" | "lg";
} & SVGProps<SVGSVGElement>) {
  const IconComponent = ICONS[name];
  const sizeClass = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-6 h-6" }[size];
  const { className, ...restProps } = rest;

  return (
    <IconComponent
      aria-hidden="true"
      className={`shrink-0 text-secondary ${sizeClass} ${className ?? ""}`}
      {...restProps}
    />
  );
}
