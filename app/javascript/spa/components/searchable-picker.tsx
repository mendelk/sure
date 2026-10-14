import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Popover,
  PopoverButton,
  PopoverPanel,
} from "@headlessui/react";
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "../icon";

export type PickerOption = {
  value: string;
  label: string;
  content?: ReactNode;
  disabled?: boolean;
  key?: string;
  group?: string;
  keepOpen?: boolean;
};

export function SearchablePicker({
  disabled = false,
  error,
  footer,
  inline = false,
  label,
  loading = false,
  multiple = false,
  onOpen,
  onQueryChange,
  onSelect,
  options,
  portal = true,
  query,
  searchLabel,
  selectedValues,
  trigger,
}: {
  disabled?: boolean;
  error?: string;
  footer?: ReactNode;
  inline?: boolean;
  label: string;
  loading?: boolean;
  multiple?: boolean;
  onOpen?: () => void;
  onQueryChange: (query: string) => void;
  onSelect: (value: string) => boolean | undefined | Promise<boolean | undefined>;
  options: PickerOption[];
  portal?: boolean;
  query: string;
  searchLabel: string;
  selectedValues: string[];
  trigger: ReactNode;
}) {
  const triggerId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoredFocusRequest = useRef(0);
  const [focusRequest, setFocusRequest] = useState(0);
  useEffect(() => {
    if (disabled || restoredFocusRequest.current === focusRequest) return;
    triggerRef.current?.focus();
    restoredFocusRequest.current = focusRequest;
  }, [disabled, focusRequest]);
  const triggerButton = (
    <PopoverButton
      aria-label={label}
      className={
        inline
          ? "focus-ring inline-flex max-w-full min-w-0 cursor-pointer items-center rounded-full"
          : "form-field__input min-h-7 flex cursor-pointer items-center gap-2 pr-8 text-left"
      }
      disabled={disabled}
      id={triggerId}
      onClick={() => {
        onQueryChange("");
        onOpen?.();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onQueryChange("");
          onOpen?.();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
      ref={triggerRef}
      type="button"
    >
      {trigger}
    </PopoverButton>
  );
  return (
    <Popover className={inline ? "inline-flex max-w-full min-w-0" : "relative"}>
      {({ close }) => {
        const content = (
          <>
            <div className="relative mb-1">
              <ComboboxInput
                aria-label={searchLabel}
                autoComplete="off"
                className="h-10 w-full rounded-lg border-none bg-container pl-10 pr-3 text-base text-primary placeholder:text-secondary focus:outline-hidden focus:ring-0 sm:text-sm"
                displayValue={() => query}
                onChange={(event) => {
                  onQueryChange(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  event.stopPropagation();
                  close(triggerRef);
                }}
                placeholder={searchLabel}
                value={query}
              />
              <Icon
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary"
                name="search"
              />
            </div>
            <ComboboxOptions
              className="flex max-h-64 flex-col gap-1 overflow-y-auto"
              modal={false}
              static
            >
              {loading ? (
                <output className="px-3 py-1 text-sm text-secondary">Loading…</output>
              ) : null}
              {options.map((option, index) => (
                <Fragment key={option.key ?? option.value}>
                  {option.group !== undefined && option.group !== options[index - 1]?.group ? (
                    <p className="px-3 py-1 text-xs font-medium uppercase text-secondary">
                      {option.group}
                    </p>
                  ) : null}
                  <ComboboxOption
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-primary data-focus:bg-container-inset-hover data-selected:bg-container-inset data-disabled:cursor-default data-disabled:opacity-50"
                    disabled={disabled || option.disabled === true}
                    value={option.value}
                  >
                    {({ selected }) => (
                      <>
                        <span
                          className={`flex size-4 shrink-0 items-center justify-center ${selected ? "" : "invisible"}`}
                        >
                          <Icon className="size-4 text-primary" name="check" />
                        </span>
                        {option.content ?? option.label}
                      </>
                    )}
                  </ComboboxOption>
                </Fragment>
              ))}
              {!loading && options.length === 0 ? (
                <p className="px-3 py-1 text-sm text-secondary">No matches found</p>
              ) : null}
            </ComboboxOptions>
            {error !== undefined ? (
              <p className="px-3 py-1 text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {footer}
          </>
        );
        return (
          <>
            {inline ? (
              triggerButton
            ) : (
              <div className="form-field">
                <div className="form-field__body">
                  <label className="form-field__label" htmlFor={triggerId}>
                    {label}
                  </label>
                  {triggerButton}
                </div>
              </div>
            )}
            <PopoverPanel
              anchor="bottom start"
              className={`z-50 min-w-48 max-w-[calc(100vw-2rem)] rounded-lg bg-container p-1.5 shadow-lg [--anchor-gap:0.375rem] ${inline ? "w-72" : "w-(--button-width)"}`}
              focus
              portal={portal}
            >
              {multiple ? (
                <Combobox
                  immediate
                  multiple
                  onChange={(values: string[]) => {
                    const changed =
                      values.find((value) => !selectedValues.includes(value)) ??
                      selectedValues.find((value) => !values.includes(value));
                    if (changed !== undefined) void onSelect(changed);
                  }}
                  value={selectedValues}
                >
                  {content}
                </Combobox>
              ) : (
                <Combobox
                  immediate
                  onChange={(value: string | null) => {
                    if (value === null) return;
                    void Promise.resolve(onSelect(value)).then((saved) => {
                      if (
                        saved !== false &&
                        options.find((option) => option.value === value)?.keepOpen !== true
                      ) {
                        close(triggerRef);
                        setFocusRequest((request) => request + 1);
                      }
                    });
                  }}
                  value={selectedValues[0] ?? null}
                >
                  {content}
                </Combobox>
              )}
            </PopoverPanel>
          </>
        );
      }}
    </Popover>
  );
}
