import {
  ArrowLeftRight,
  Box,
  ChartBar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCopy,
  Clock,
  Copy,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  Filter,
  GitBranch,
  GripHorizontal,
  HardDriveUpload,
  icons,
  LayoutDashboard,
  List,
  LoaderCircle,
  LogOut,
  Map as MapIcon,
  MessageCircleQuestion,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Pencil,
  PieChart,
  Play,
  Plus,
  ReceiptText,
  RefreshCcw,
  RotateCcw,
  Shapes,
  Search,
  SlidersHorizontal,
  Store,
  Tag,
  Tags,
  User,
  X,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

const ICONS = {
  "arrow-left-right": ArrowLeftRight,
  box: Box,
  "chart-bar": ChartBar,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "circle-alert": CircleAlert,
  "clipboard-copy": ClipboardCopy,
  clock: Clock,
  copy: Copy,
  "credit-card": CreditCard,
  download: Download,
  eye: Eye,
  "eye-off": EyeOff,
  filter: Filter,
  "git-branch": GitBranch,
  "grip-horizontal": GripHorizontal,
  "layout-dashboard": LayoutDashboard,
  "hard-drive-upload": HardDriveUpload,
  list: List,
  "loader-circle": LoaderCircle,
  "log-out": LogOut,
  map: MapIcon,
  "message-circle-question": MessageCircleQuestion,
  "more-horizontal": MoreHorizontal,
  "panel-left": PanelLeft,
  "panel-right": PanelRight,
  pencil: Pencil,
  "pie-chart": PieChart,
  play: Play,
  plus: Plus,
  "receipt-text": ReceiptText,
  "refresh-ccw": RefreshCcw,
  "rotate-ccw": RotateCcw,
  shapes: Shapes,
  search: Search,
  "sliders-horizontal": SlidersHorizontal,
  store: Store,
  tag: Tag,
  tags: Tags,
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

export function CategoryIcon({
  name,
  className = "size-4 shrink-0",
}: {
  name?: string;
  className?: string;
}) {
  const pascal = (name ?? "shapes")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  const IconComponent = (icons as Record<string, (typeof icons)["Shapes"]>)[pascal] ?? icons.Shapes;

  return <IconComponent aria-hidden="true" className={className} />;
}
