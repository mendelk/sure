import { Controller } from "@hotwired/stimulus";

// Configurable transaction-table columns. Visibility for the optional
// attributes (tags, merchant, notes) lives in localStorage so it persists
// across visits and is shared by the global transactions table and the
// account activity feed (both render the same row partial).
export default class extends Controller {
  static targets = ["attr", "bodyCol", "headerCol", "nameCell", "toggle"];

  static values = {
    storageKey: { type: String, default: "sure:transaction-columns:v1" },
  };

  connect() {
    this.state = this.load();
    this.apply();
    this.onStorage = (event) => {
      if (event.key === this.storageKeyValue) {
        this.state = this.load();
        this.apply();
      }
    };
    window.addEventListener("storage", this.onStorage);
  }

  disconnect() {
    window.removeEventListener("storage", this.onStorage);
  }

  toggle(event) {
    const key = event.currentTarget.dataset.key;
    if (!(key in this.state)) return;
    this.state[key] = event.currentTarget.checked;
    this.save();
    this.apply();
  }

  load() {
    try {
      const raw = localStorage.getItem(this.storageKeyValue);
      if (!raw) return this.defaults;
      return { ...this.defaults, ...JSON.parse(raw) };
    } catch {
      return this.defaults;
    }
  }

  save() {
    try {
      localStorage.setItem(this.storageKeyValue, JSON.stringify(this.state));
    } catch {
      // Storage unavailable (private mode, quota) — table still works for
      // this page load, preferences just won't persist.
    }
  }

  apply() {
    const anyOn = Object.values(this.state).some(Boolean);

    this.attrTargets.forEach((el) => {
      el.classList.toggle("hidden", !this.state[el.dataset.column]);
    });
    this.bodyColTargets.forEach((el) => el.classList.toggle("hidden", !anyOn));
    this.headerColTargets.forEach((el) =>
      el.classList.toggle("hidden", !anyOn),
    );
    this.nameCellTargets.forEach((el) => {
      const onClass = el.dataset.onClass;
      if (onClass) el.classList.toggle(onClass, anyOn);
    });
    this.toggleTargets.forEach((el) => {
      if (el.dataset.key in this.state) el.checked = !!this.state[el.dataset.key];
    });
  }

  get defaults() {
    return { tags: true, merchant: false, notes: false };
  }
}
