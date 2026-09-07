// Sure UI primitives barrel (apps/web).
//
// Feature code imports from `~/components/ui` — never deep-imports a
// primitive file, and never reaches past this barrel into duplicate
// hand-rolled shapes. See COMPOSITION.md for the composition rules.
export { SureAlert, SureBadge } from "./alert";
export type { SureAlertProps, SureBadgeProps, SureTone } from "./alert";
export { SureButton, SureLink } from "./button";
export type { SureButtonProps, SureButtonSize, SureButtonVariant, SureLinkProps } from "./button";
export {
	SureCard,
	SureCardContent,
	SureCardDescription,
	SureCardFooter,
	SureCardHeader,
	SureCardTitle,
} from "./card";
export { SureEmptyState, SureSkeleton } from "./card";
export type { SureEmptyStateProps, SureSkeletonProps } from "./card";
export { SureCheckbox, SureSwitch } from "./checkbox";
export type { SureCheckboxProps, SureSwitchProps } from "./checkbox";
export { SureDialog, SurePopover } from "./dialog";
export type { SureDialogProps, SureDialogSize, SurePopoverProps } from "./dialog";
export { SureMenu } from "./menu";
export type { SureMenuItem, SureMenuProps } from "./menu";
export { SureCombobox, SureSelect } from "./select";
export type { SureComboboxProps, SureOption, SureSelectProps } from "./select";
export { SureTabs } from "./tabs";
export type { SureTabItem, SureTabsProps } from "./tabs";
export { SureTextField } from "./text-field";
export type { SureTextFieldProps } from "./text-field";
export { SureToastProvider, useSureToast } from "./toast";
export type { SureToastOptions, SureToastTone } from "./toast";
