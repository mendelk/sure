export function Toggle({
  checked,
  disabled,
  id,
  label = "Toggle",
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  id?: string;
  label?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full motion-safe:transition-colors motion-safe:duration-300 focus-ring disabled:cursor-not-allowed disabled:opacity-70 ${
        checked ? "bg-success" : "bg-toggle-track"
      }`}
      disabled={disabled}
      id={id}
      onClick={() => {
        onChange(!checked);
      }}
      role="switch"
      type="button"
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none mt-0.5 inline-block size-4 rounded-full bg-container theme-dark:bg-inverse shadow-xs motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-in-out ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
