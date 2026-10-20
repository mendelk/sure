import {
  Asterisk,
  ArrowDown,
  ArrowLeftRight,
  ArrowLeft,
  ArrowUp,
  AtSign,
  Bitcoin,
  CarFront,
  ChartArea,
  ChartLine,
  Command,
  Menu as MenuIcon,
  MousePointerClick,
  TriangleAlert,
  WalletMinimal,
  Bell,
  Box,
  ChartBar,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  CircleAlert,
  ClipboardCopy,
  Clock,
  Copy,
  CornerDownLeft,
  CornerDownRight,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  FileText,
  Filter,
  GitBranch,
  Image,
  GripHorizontal,
  GripVertical,
  HandCoins,
  HardDriveUpload,
  Home,
  Landmark,
  icons,
  LayoutDashboard,
  Keyboard,
  List,
  Link2,
  Link2Off,
  LoaderCircle,
  Lock,
  LogOut,
  Map as MapIcon,
  MapPin,
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
  Sparkles,
  SlidersHorizontal,
  Store,
  Tag,
  Tags,
  Split,
  Trash2,
  User,
  X,
  Compass,
  Minus,
  Receipt,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
const ICONS = {
  "alert-triangle": TriangleAlert,
  "arrow-down": ArrowDown,
  "arrow-left-right": ArrowLeftRight,
  "arrow-left": ArrowLeft,
  "arrow-up": ArrowUp,
  "at-sign": AtSign,
  bitcoin: Bitcoin,
  "car-front": CarFront,
  "chart-area": ChartArea,
  "chart-line": ChartLine,
  command: Command,
  menu: MenuIcon,
  "mouse-pointer-click": MousePointerClick,
  "wallet-minimal": WalletMinimal,
  bell: Bell,
  box: Box,
  "chart-bar": ChartBar,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-up": ChevronUp,
  "chevron-right": ChevronRight,
  "circle-alert": CircleAlert,
  "clipboard-copy": ClipboardCopy,
  clock: Clock,
  compass: Compass,
  copy: Copy,
  asterisk: Asterisk,
  "corner-down-left": CornerDownLeft,
  "corner-down-right": CornerDownRight,
  "credit-card": CreditCard,
  download: Download,
  eye: Eye,
  "eye-off": EyeOff,
  "file-text": FileText,
  filter: Filter,
  image: Image,
  "git-branch": GitBranch,
  "grip-horizontal": GripHorizontal,
  "grip-vertical": GripVertical,
  "hand-coins": HandCoins,
  "layout-dashboard": LayoutDashboard,
  "hard-drive-upload": HardDriveUpload,
  home: Home,
  landmark: Landmark,
  list: List,
  link: Link2,
  unlink: Link2Off,
  "link-2": Link2,
  keyboard: Keyboard,
  "loader-circle": LoaderCircle,
  lock: Lock,
  "log-out": LogOut,
  map: MapIcon,
  "map-pin": MapPin,
  "message-circle-question": MessageCircleQuestion,
  minus: Minus,
  "more-horizontal": MoreHorizontal,
  "panel-left": PanelLeft,
  "panel-right": PanelRight,
  pencil: Pencil,
  "pie-chart": PieChart,
  play: Play,
  plus: Plus,
  receipt: Receipt,
  "receipt-text": ReceiptText,
  "refresh-ccw": RefreshCcw,
  "rotate-ccw": RotateCcw,
  shapes: Shapes,
  search: Search,
  sparkles: Sparkles,
  "sliders-horizontal": SlidersHorizontal,
  store: Store,
  tag: Tag,
  tags: Tags,
  split: Split,
  "trash-2": Trash2,
  user: User,
  x: X,
} satisfies Record<string, ComponentType<SVGProps<SVGSVGElement>>>;

// Key list for consumers that need to validate icon names at a boundary
// (e.g. the bootstrap schema's navItems.icon). `Object.keys` types as
// `string[]`; the object literal's keys are the source of truth, so the
// assertion only narrows back to what `keyof typeof ICONS` already says.
// eslint-disable-next-line typescript/no-unsafe-type-assertion -- Keys come from the ICONS literal itself; Object.keys just widens them.
export const ICON_KEYS = Object.keys(ICONS) as [IconName, ...IconName[]];

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
