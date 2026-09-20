import { forwardRef } from "react";
import type { IconName } from "../icon";
import { Button, type ButtonProps } from "./button";

const BUTTON_SIZES = {
  sm: "icon-sm",
  md: "icon-md",
} as const;

export type IconButtonSize = keyof typeof BUTTON_SIZES;

export type IconButtonProps = Omit<
  ButtonProps,
  "aria-label" | "children" | "iconProps" | "label" | "labelClassName" | "size" | "title"
> & {
  icon: IconName;
  label: string;
  size?: IconButtonSize;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, icon, label, size = "md", variant = "ghost", ...props },
  ref,
) {
  return (
    <Button
      {...props}
      aria-label={label}
      className={className}
      iconProps={{ name: icon, size }}
      ref={ref}
      size={BUTTON_SIZES[size]}
      variant={variant}
      title={label}
    />
  );
});
