import { Icon, type IconName } from "../icon";

/** SPA counterpart to DS::FilledIcon's default, medium-sized variant. */
export function FilledIcon({ color, icon }: { color: string; icon: IconName }) {
  const tint = `color-mix(in oklab, ${color} 10%, transparent)`;

  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-lg border"
      style={{ backgroundColor: tint, borderColor: tint, color }}
    >
      <Icon name={icon} style={{ color: "inherit" }} />
    </span>
  );
}
