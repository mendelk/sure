import { useNavigate, useSearch } from "@tanstack/react-router";

// Query key carrying the page that opened a settings dialog, so closing or
// saving returns there instead of the settings index. SPA Links
// (transaction row/detail) and ERB menu links (dropdowns rendered in page
// context) set it; dialog routes read it via useDialogClose.
export const RETURN_TO_KEY = "return_to";

export function parseReturnTo(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//"))
    return fallback;
  return value;
}

export function currentReturnTo(): string {
  return `${window.location.pathname}${window.location.search}`;
}

// Navigate back to the opener page (or the settings index fallback) when a
// dialog closes or its save completes.
export function useDialogClose(fallbackTo: string): () => void {
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const value = search[RETURN_TO_KEY];
  const target = parseReturnTo(value, fallbackTo);
  return () => {
    void navigate({ to: target, resetScroll: false });
  };
}
