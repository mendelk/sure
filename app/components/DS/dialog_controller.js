import { Controller } from "@hotwired/stimulus";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

// Turbo frame links with data-turbo-action="advance" (e.g. transaction
// rows opening the drawer) push a history entry *after* the response
// renders, so by the time the new dialog connects the push already
// happened. Record the pre-navigation history index at click time so a
// drawer dialog can return to it on close.
let lastAdvanceClick = null;

function currentRestorationIndex() {
  return window.history.state?.turbo?.restorationIndex ?? 0;
}

if (typeof document !== "undefined") {
  document.addEventListener(
    "click",
    (event) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target?.closest?.('a[data-turbo-action="advance"]');
      if (!link) return;
      lastAdvanceClick = {
        frame: link.getAttribute("data-turbo-frame"),
        index: currentRestorationIndex(),
      };
    },
    true,
  );

  // Browser back/forward buttons change the URL without going through
  // dialog#close. Turbo doesn't reliably re-render the drawer for
  // frame-pushed entries, so close any dialogs a popstate leaves behind —
  // an open dialog always belongs to the previous history entry.
  window.addEventListener("popstate", () => {
    document.querySelectorAll("dialog").forEach((dlg) => {
      if (!dlg.open) return;
      dlg.close();
      const frame = dlg.closest('turbo-frame[id="modal"], turbo-frame[id="drawer"]');
      if (frame) frame.innerHTML = "";
    });
  });
}

// Connects to data-controller="dialog"
export default class extends Controller {
  static targets = ["content"]

  static values = {
    autoOpen: { type: Boolean, default: false },
    reloadOnClose: { type: Boolean, default: false },
    disableClickOutside: { type: Boolean, default: false },
  };

  connect() {
    this._priorFocus = null;
    this._onKeydown = this.#onKeydown.bind(this);
    this._onClose = this.#onClose.bind(this);
    this._onCancel = this.#onCancel.bind(this);

    this.element.addEventListener("keydown", this._onKeydown);
    this.element.addEventListener("close", this._onClose);
    this.element.addEventListener("cancel", this._onCancel);

    // If this dialog was opened by an advance-action link targeting the
    // drawer, remember the pre-navigation history index so close() can
    // return the URL to the underlying page.
    if (this.#isDrawerDialog() && lastAdvanceClick?.frame === "drawer") {
      this._drawerReturnIndex = lastAdvanceClick.index;
      // A drawer navigation replaces the drawer's content, but a dialog
      // from a full page load lives outside the drawer frame — close any
      // such stale dialogs so only the fresh drawer remains.
      this.#closeStaleDialogs();
    } else {
      this._drawerReturnIndex = null;
    }
    lastAdvanceClick = null;

    if (this.element.open) return;
    if (this.autoOpenValue) {
      this._priorFocus = document.activeElement;
      this.element.showModal();
      this.#focusInitial();
    }
  }

  disconnect() {
    this.element.removeEventListener("keydown", this._onKeydown);
    this.element.removeEventListener("close", this._onClose);
    this.element.removeEventListener("cancel", this._onCancel);
  }

  // Native <dialog> Escape handling bypasses our close() (and with it any
  // history cleanup), so intercept it and route through close() instead.
  // Inner components (e.g. custom selects) stop Escape propagation for
  // their own dismissal, which also suppresses this event until the next
  // press — matching the X button behavior exactly.
  #onCancel(event) {
    event.preventDefault();
    this.close();
  }

  // If the user clicks anywhere outside of the visible content, close the dialog
  clickOutside(e) {
    if (this.disableClickOutsideValue) return;
    if (!this.contentTarget.contains(e.target)) {
      this.close();
    }
  }

  close() {
    // A drawer opened via an advance-action link pushed history entries
    // (the drawer navigation itself, plus any in-drawer edits). Go back to
    // the pre-drawer entry so the URL matches the visible page again, and
    // clear the drawer UI as well — Turbo may restore the previous page
    // from snapshot on pop, but if it doesn't (or the snapshot is stale)
    // the drawer must still end up closed.
    if (this.#isDrawerDialog() && this._drawerReturnIndex != null) {
      const stepsBack = this._drawerReturnIndex - currentRestorationIndex();
      if (stepsBack < 0) {
        window.history.go(stepsBack);
      }
    }

    this.element.close();
    this.#clearParentModalFrame();
    this.#clearParentDrawerFrame();

    if (this.reloadOnCloseValue) {
      Turbo.visit(window.location.href);
    } else if (this.#closeFallbackUrl()) {
      // No history to return to (e.g. direct page load of a detail URL):
      // closing would strand the user on an empty page, so navigate to
      // the fallback instead.
      Turbo.visit(this.#closeFallbackUrl());
    }
  }

  // Move focus to the first focusable child unless the dialog already
  // declared one via the autofocus attribute. Native `<dialog>.showModal()`
  // is supposed to do this but the behavior varies across engines.
  #focusInitial() {
    if (this.element.querySelector("[autofocus]")) return;
    this.#focusables()[0]?.focus();
  }

  // Tab/Shift+Tab wrap inside the dialog so focus can't leak to the page
  // behind. Without this an a11y user can tab into the backdrop'd content
  // and lose the modal context entirely.
  #onKeydown(e) {
    if (e.key !== "Tab") return;
    const focusables = this.#focusables();
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  #onClose() {
    const prior = this._priorFocus;
    this._priorFocus = null;
    if (prior && typeof prior.focus === "function" && document.body.contains(prior)) {
      prior.focus();
    }
  }

  #focusables() {
    return Array.from(this.element.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
  }

  #isDrawerDialog() {
    return this.element.closest('turbo-frame[id="drawer"]') != null;
  }

  // Fallback destination when the dialog has no history entry to return
  // to (e.g. direct page load of a detail URL — closing would otherwise
  // strand the user on an empty page). Only dialogs that opt in via
  // close_fallback_url use it; everything else just closes.
  #closeFallbackUrl() {
    if (this._drawerReturnIndex != null && currentRestorationIndex() > this._drawerReturnIndex) return null;
    return this.element.dataset.closeFallbackUrl || null;
  }

  // Close other open dialogs that don't belong to a turbo frame (e.g. a
  // drawer rendered inline by a full page load). Uses the native close so
  // no history or frame cleanup runs for dialogs we're discarding.
  #closeStaleDialogs() {
    document.querySelectorAll("dialog[open]").forEach((other) => {
      if (other !== this.element && !other.closest("turbo-frame")) {
        other.close();
      }
    });
  }

  // When the dialog lives inside a top-level <turbo-frame id="modal">,
  // emptying the frame on close stops Turbo's page cache from snapshotting
  // an open dialog and reopening it on browser back.
  #clearParentModalFrame() {
    const frame = this.element.closest('turbo-frame[id="modal"]');
    if (frame) frame.innerHTML = "";
  }

  // Same idea for the drawer: after closing, the drawer must read empty so
  // a subsequent snapshot (or a popstate Turbo chooses not to restore)
  // can't resurrect a stale open dialog.
  #clearParentDrawerFrame() {
    const frame = this.element.closest('turbo-frame[id="drawer"]');
    if (frame) frame.innerHTML = "";
  }
}
