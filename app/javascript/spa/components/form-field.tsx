import { createElement, type ComponentPropsWithRef, type ReactNode } from "react";

type BaseFormFieldProps = {
  actions?: ReactNode;
  containerClassName?: string;
  description?: ReactNode;
  error?: ReactNode;
  id: string;
  label?: ReactNode;
  required?: boolean;
};

export type InputFormFieldProps = BaseFormFieldProps &
  Omit<ComponentPropsWithRef<"input">, keyof BaseFormFieldProps | "children"> & {
    as?: "input";
    control?: never;
  };

export type TextareaFormFieldProps = BaseFormFieldProps &
  Omit<ComponentPropsWithRef<"textarea">, keyof BaseFormFieldProps | "children"> & {
    as: "textarea";
    control?: never;
  };

export type SelectFormFieldProps = BaseFormFieldProps &
  Omit<ComponentPropsWithRef<"select">, keyof BaseFormFieldProps> & {
    as: "select";
    control?: never;
  };

export type CustomFormFieldControlProps = {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
  className: string;
  id: string;
};

export type CustomFormFieldProps = BaseFormFieldProps & {
  as?: never;
  control: (props: CustomFormFieldControlProps) => ReactNode;
};

export type FormFieldProps =
  | InputFormFieldProps
  | TextareaFormFieldProps
  | SelectFormFieldProps
  | CustomFormFieldProps;

export function FormField(props: FormFieldProps) {
  const { actions, containerClassName, description, error, id, label, required = false } = props;
  const hasDescription = description !== undefined && description !== null && description !== false;
  const hasError = error !== undefined && error !== null && error !== false && error !== "";
  const hasActions = actions !== undefined && actions !== null && actions !== false;
  const hasLabel = label !== undefined && label !== null && label !== false;
  const descriptionId = hasDescription ? `${id}-description` : undefined;
  const errorId = hasError ? `${id}-error` : undefined;

  let control: ReactNode;
  if (props.control !== undefined) {
    const describedBy = [descriptionId, errorId].filter(Boolean).join(" ");
    control = props.control({
      "aria-describedby": describedBy || undefined,
      "aria-invalid": hasError || undefined,
      "aria-required": required || undefined,
      className: "form-field__input",
      id,
    });
  } else {
    const existingDescribedBy = props["aria-describedby"];
    const existingInvalid = props["aria-invalid"];
    const {
      actions: _actions,
      as = "input",
      className,
      containerClassName: _containerClassName,
      control: _control,
      description: _description,
      error: _error,
      id: _id,
      label: _label,
      required: _required,
      ...controlProps
    } = props;
    const describedBy = [existingDescribedBy, descriptionId, errorId].filter(Boolean).join(" ");
    control = createElement(as, {
      ...controlProps,
      "aria-describedby": describedBy || undefined,
      "aria-invalid": hasError ? true : existingInvalid,
      className: ["form-field__input", className].filter(Boolean).join(" "),
      id,
      required,
    });
  }
  const labelElement = hasLabel ? (
    <label className="form-field__label" htmlFor={id}>
      {label}
      {required ? (
        <span aria-hidden="true" className="ml-0.5 text-destructive">
          *
        </span>
      ) : null}
    </label>
  ) : null;

  return (
    <div
      className={["form-field", hasError ? "border-destructive" : undefined, containerClassName]
        .filter(Boolean)
        .join(" ")}
    >
      {hasActions ? (
        <div className="form-field__header">
          {labelElement}
          <div className="form-field__actions">{actions}</div>
        </div>
      ) : null}
      <div className="form-field__body">
        {hasActions ? null : labelElement}
        {control}
        {hasDescription ? (
          <p className="text-xs text-secondary" id={descriptionId}>
            {description}
          </p>
        ) : null}
        {hasError ? (
          <p className="text-xs text-destructive" id={errorId} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
