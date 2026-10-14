import { forwardRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";
import { Icon } from "../icon";

/**
 * Variants mirror the Rails DS::Buttonish surfaces so the SPA and ERB UI stay
 * in step. Legacy spellings (`destructive-outline`) remain accepted aliases.
 */
const VARIANT_CLASSES = {
  primary:
    "button-bg-primary text-inverse hover:button-bg-primary-hover disabled:bg-gray-500 theme-dark:disabled:bg-gray-400",
  secondary:
    "border border-secondary bg-container text-primary hover:bg-surface-hover disabled:button-bg-disabled",
  destructive:
    "button-bg-destructive text-inverse hover:button-bg-destructive-hover disabled:bg-red-200 theme-dark:disabled:bg-red-600",
  "destructive-outline":
    "border border-destructive bg-container text-destructive hover:bg-surface-hover",
  outline: "border border-secondary bg-transparent text-primary hover:bg-surface-hover",
  outline_destructive:
    "border border-secondary bg-transparent text-destructive hover:bg-container-inset-hover",
  ghost: "text-secondary hover:bg-surface-hover hover:text-primary",
  /** Quiet text-link affordance (retry, unlock, inline "clear filters"). */
  link: "text-link hover:underline",
  /** Quieter outline for "there is nothing here yet" affordances; pair with `border-dashed`. */
  outline_muted:
    "border border-secondary bg-transparent text-secondary hover:border-primary hover:text-primary",
} as const;

const SIZE_CLASSES = {
  xs: "min-h-7 gap-1 px-2 py-1 text-xs",
  sm: "min-h-8 gap-1.5 px-2.5 py-1.5 text-xs",
  md: "h-10 gap-2 px-4 text-sm",
  "icon-xs": "size-7",
  "icon-sm": "size-8",
  "icon-md": "size-9",
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASSES;
export type ButtonSize = keyof typeof SIZE_CLASSES;

type ButtonContentProps =
  | {
      children?: ReactNode;
      label?: never;
      labelClassName?: never;
    }
  | {
      children?: never;
      label: ReactNode;
      labelClassName?: string;
    };

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  fullWidth?: boolean;
  iconProps?: ComponentProps<typeof Icon>;
  size?: ButtonSize;
  variant?: ButtonVariant;
} & ButtonContentProps;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    fullWidth = false,
    iconProps,
    label,
    labelClassName,
    size = "md",
    type = "button",
    variant = "primary",
    ...props
  },
  ref,
) {
  const variantClasses = VARIANT_CLASSES[variant];
  const sizeClasses = SIZE_CLASSES[size];

  const classes = [
    "inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:text-inherit",
    variantClasses,
    sizeClasses,
    fullWidth ? "w-full" : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button ref={ref} className={classes} type={type} {...props}>
      {iconProps ? <Icon {...iconProps} /> : null}
      {label === undefined ? (
        children
      ) : (
        <span className={["min-w-0 truncate", labelClassName].filter(Boolean).join(" ")}>
          {label}
        </span>
      )}
    </button>
  );
});

/**
 * Accessible tab trigger built on Button's focus/disabled rails. Pass
 * `selected` instead of styling the active tab by hand — the same tab-item
 * active utility the ERB tab strips use decides the visual state.
 */
export type TabButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "variant" | "size"
> & {
  selected: boolean;
  children: ReactNode;
};

export const TabButton = forwardRef<HTMLButtonElement, TabButtonProps>(function TabButton(
  { className, selected, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-selected={selected}
      className={[
        "inline-flex items-center justify-center rounded-md px-6 py-1 text-sm font-medium motion-safe:transition-colors motion-safe:duration-200 focus-ring",
        selected
          ? "tab-item-active text-primary shadow-sm"
          : "text-secondary hover:bg-surface-inset-hover",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="tab"
      type="button"
      {...props}
    />
  );
});

/**
 * Row-menu entry (`role="menuitem"` inside a `role="menu"` popover). The 17
 * hand-rolled copies across rules/tags/categories/merchants/accounts pages
 * differed only in tint, so `destructive` switches the text colour.
 */
export type MenuItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  destructive?: boolean;
};

export const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(function MenuItem(
  { className, destructive = false, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={[
        "block w-full px-4 py-2 text-left text-sm hover:bg-container-hover focus-ring",
        destructive ? "text-destructive" : "text-primary",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="menuitem"
      type="button"
      {...props}
    />
  );
});
