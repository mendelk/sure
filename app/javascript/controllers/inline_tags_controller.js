import { Controller } from "@hotwired/stimulus";

// Inline tag editor for transaction rows. Displays tag pills in the read
// view and PATCHes add/remove straight to the existing tags endpoints
// (TransactionsController#update_tags / TransfersController#update_tags).
export default class extends Controller {
  static targets = ["display", "option", "search", "error", "emptyHint"];
  static values = { updateUrl: String };

  connect() {
    this.selectedIds = new Set(
      this.optionTargets
        .filter((option) => option.getAttribute("aria-selected") === "true")
        .map((option) => option.dataset.tagId),
    );
    this.saving = false;
  }

  filter() {
    if (!this.hasSearchTarget) return;
    const query = this.searchTarget.value.trim().toLowerCase();
    this.optionTargets.forEach((option) => {
      const name = (option.dataset.filterName || option.dataset.tagName || "").toLowerCase();
      option.classList.toggle("hidden", !name.includes(query));
    });
  }

  async toggle(event) {
    event.preventDefault();
    const option = event.currentTarget;
    const id = option.dataset.tagId;
    const wasSelected = this.selectedIds.has(id);

    if (wasSelected) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.updateOption(option);
    this.renderDisplay();
    this.clearError();

    try {
      await this.save();
    } catch {
      // Revert optimistic toggle on failure
      if (wasSelected) {
        this.selectedIds.add(id);
      } else {
        this.selectedIds.delete(id);
      }
      this.updateOption(option);
      this.renderDisplay();
      this.showError();
    }
  }

  updateOption(option) {
    const isSelected = this.selectedIds.has(option.dataset.tagId);
    option.setAttribute("aria-selected", isSelected ? "true" : "false");
    option.classList.toggle("bg-container-inset", isSelected);
    const icon = option.querySelector(".check-icon");
    if (icon) icon.classList.toggle("hidden", !isSelected);
  }

  renderDisplay() {
    if (!this.hasDisplayTarget) return;
    const display = this.displayTarget;
    // Clear existing pills / hint, keep the trailing edit icon if present
    const editIcon = display.querySelector("[data-edit-icon]");
    display.innerHTML = "";

    const selected = this.optionTargets.filter((option) =>
      this.selectedIds.has(option.dataset.tagId),
    );

    if (selected.length === 0) {
      const hint = document.createElement("span");
      hint.className =
        "text-xs text-secondary hover:text-primary transition-colors inline-flex items-center gap-1";
      hint.textContent = "+ Tag";
      display.appendChild(hint);
    } else {
      selected.slice(0, 3).forEach((option) => {
        display.appendChild(
          this.buildPill(option.dataset.tagName, option.dataset.tagColor),
        );
      });
      if (selected.length > 3) {
        const more = document.createElement("span");
        more.className = "text-xs text-secondary shrink-0";
        more.textContent = `+${selected.length - 3}`;
        display.appendChild(more);
      }
    }

    if (editIcon) {
      display.appendChild(editIcon);
    }
  }

  buildPill(name, color) {
    const pill = document.createElement("span");
    pill.className =
      "inline-flex items-center align-middle font-medium whitespace-nowrap shrink-0 border leading-none rounded-full px-1.5 py-0.5 text-xs gap-1";
    pill.title = name;
    if (color) {
      pill.style.backgroundColor = `color-mix(in oklab, ${color} 10%, transparent)`;
      pill.style.color = color;
      pill.style.borderColor = `color-mix(in oklab, ${color} 20%, transparent)`;
    }
    pill.textContent = name;
    return pill;
  }

  async save() {
    if (!this.updateUrlValue) return;
    if (this.saveAbortController) this.saveAbortController.abort();
    const abortController = new AbortController();
    this.saveAbortController = abortController;

    try {
      const response = await fetch(this.updateUrlValue, {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": this.csrfToken,
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ tag_ids: Array.from(this.selectedIds) }),
        credentials: "same-origin",
        signal: abortController.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } finally {
      if (this.saveAbortController === abortController) {
        this.saveAbortController = null;
      }
    }
  }

  showError() {
    if (!this.hasErrorTarget) return;
    this.errorTarget.textContent = "Could not update tags";
    this.errorTarget.classList.remove("hidden");
  }

  clearError() {
    if (!this.hasErrorTarget) return;
    this.errorTarget.textContent = "";
    this.errorTarget.classList.add("hidden");
  }

  get csrfToken() {
    return document.querySelector("meta[name='csrf-token']")?.content;
  }
}
