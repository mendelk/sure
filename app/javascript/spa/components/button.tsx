import { forwardRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";
import { Icon } from "../icon";

const VARIANT_CLASSES = {
  primary:
    "button-bg-primary text-inverse hover:button-bg-primary-hover disabled:bg-gray-500 theme-dark:disabled:bg-gray-400",
  secondary:
    "border border-secondary bg-container text-primary hover:bg-surface-hover disabled:button-bg-disabled",
  destructive:
    "button-bg-destructive text-inverse hover:button-bg-destructive-hover disabled:bg-red-200 theme-dark:disabled:bg-red-600",
  "destructive-outline":
    "border border-destructive bg-container text-destructive hover:bg-surface-hover",
  ghost: "text-secondary hover:bg-surface-hover hover:text-primary",
} as const;

const SIZE_CLASSES = {
  sm: "min-h-8 gap-1.5 px-2.5 py-1.5 text-xs",
  md: "h-10 gap-2 px-4 text-sm",
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
  const classes = [
    "inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:text-inherit",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
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
