import { useHotkey } from "@tanstack/react-hotkeys";
import type { RefObject } from "react";

// Focuses a page's table search field on "/". The hotkeys lib ignores
// single-key shortcuts while typing in inputs, so this never hijacks text
// entry; preventDefault keeps "/" itself out of the newly focused field.
export function useSearchShortcut(target: RefObject<HTMLInputElement | null>) {
  useHotkey(
    "/",
    (event) => {
      event.preventDefault();
      target.current?.focus();
    },
    { preventDefault: true },
  );
}
