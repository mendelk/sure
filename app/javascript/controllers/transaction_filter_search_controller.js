import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["input", "menu", "tokens"];
  static values = {
    filters: Array,
    removeLabel: String,
  };

  connect() {
    this.activeIndex = 0;
    this.renderTokens();
  }

  search() {
    this.activeIndex = 0;
    this.renderMenu();
  }

  navigate(event) {
    if (event.key === "Escape") {
      this.hideMenu();
      return;
    }

    const options = this.menuTarget.querySelectorAll("[role='option']");

    if (event.key === "ArrowDown" && options.length > 0) {
      event.preventDefault();
      this.activeIndex = (this.activeIndex + 1) % options.length;
      this.updateActiveOption(options);
    } else if (event.key === "ArrowUp" && options.length > 0) {
      event.preventDefault();
      this.activeIndex =
        (this.activeIndex - 1 + options.length) % options.length;
      this.updateActiveOption(options);
    } else if (event.key === "Enter" && options.length > 0) {
      event.preventDefault();
      options[this.activeIndex]?.click();
    }
  }

  renderMenu() {
    const term = this.currentTerm();
    const filter = term && this.findFilter(term.key);

    if (!filter) {
      this.hideMenu();
      return;
    }

    // Slack-style negative filters (e.g. `-category:House`) only apply to
    // faceted filters. Branch/value filters (date, amount) can't be negated.
    if (term.negated && filter.kind !== "options") {
      this.hideMenu();
      return;
    }

    const options = this.optionsFor(filter, term.query);
    this.menuTarget.replaceChildren();

    for (const [index, option] of options.entries()) {
      const button = document.createElement("button");
      button.id = `transaction-filter-search-option-${index}`;
      button.type = "button";
      button.role = "option";
      button.className =
        "flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-primary hover:bg-surface-hover";
      button.textContent = option.label;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () =>
        this.select(filter, option, term.negated),
      );
      this.menuTarget.append(button);
    }

    if (options.length === 0) {
      this.hideMenu();
      return;
    }

    this.menuTarget.classList.remove("hidden");
    this.inputTarget.setAttribute("aria-expanded", "true");
    this.updateActiveOption(
      this.menuTarget.querySelectorAll("[role='option']"),
    );
  }

  select(filter, option, negated = false) {
    if (filter.kind === "branch") {
      this.replaceCurrentTerm(`${option.key}:`);
      this.activeIndex = 0;
      this.renderMenu();
      return;
    }

    if (filter.kind === "options") {
      if (negated && filter.excludedInputName) {
        // Negative filters have no popover checkboxes; persist as hidden
        // inputs (also rendered server-side for already-applied values).
        const exists = this.formElements(filter.excludedInputName).some(
          (element) => element.value === option.value,
        );
        if (!exists) {
          const hidden = document.createElement("input");
          hidden.type = "hidden";
          hidden.name = filter.excludedInputName;
          hidden.value = option.value;
          this.element.append(hidden);
        }
      } else {
        const input = this.formElements(filter.inputName).find(
          (element) => element.value === option.value,
        );
        if (input) input.checked = true;
      }
    } else {
      const input = this.formElements(filter.inputName)[0];
      if (input) input.value = option.value;
      if (filter.operator)
        this.formElements("q[amount_operator]")[0].value = filter.operator;
    }

    this.replaceCurrentTerm("");
    this.hideMenu();
    this.renderTokens();
    this.element.requestSubmit();
  }

  remove(event) {
    const { inputName, value } = event.currentTarget.dataset;

    for (const input of this.formElements(inputName)) {
      if (input.type === "hidden") {
        if (input.value === value) input.remove();
      } else if (input.type === "checkbox" || input.type === "radio") {
        if (input.value === value) input.checked = false;
      } else {
        input.value = "";
      }
    }

    this.renderTokens();
    this.element.requestSubmit();
  }

  optionsFor(filter, query) {
    if (filter.kind === "branch") {
      return filter.options.filter((option) =>
        this.matches(option.label, query),
      );
    }

    if (filter.kind === "value") {
      const value = query.trim();
      return value ? [{ label: value, value }] : [];
    }

    // Don't offer values that are already selected, either positively or as
    // exclusions, to avoid contradictory include+exclude states.
    const excludedValues = new Set(
      (filter.excludedInputName
        ? this.formElements(filter.excludedInputName)
        : []
      ).map((element) => element.value),
    );

    return this.formElements(filter.inputName)
      .filter(
        (input) => !input.checked && !excludedValues.has(input.value),
      )
      .map((input) => ({
        label:
          this.element
            .querySelector(`label[for='${input.id}']`)
            ?.textContent.trim() || input.value,
        value: input.value,
      }))
      .filter((option) => this.matches(option.label, query));
  }

  renderTokens() {
    this.tokensTarget.replaceChildren();

    for (const token of this.selectedTokens()) {
      const chip = document.createElement("span");
      chip.className =
        "inline-flex items-center gap-1 rounded-md bg-container-inset px-2 py-1 text-xs font-medium text-primary";

      const label = document.createElement("span");
      label.textContent = `${token.label}: ${token.displayValue}`;

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "text-secondary hover:text-primary";
      removeButton.textContent = "x";
      removeButton.dataset.inputName = token.inputName;
      removeButton.dataset.value = token.value;
      removeButton.setAttribute(
        "aria-label",
        this.removeLabelValue.replace("%{filter}", label.textContent),
      );
      removeButton.addEventListener("click", (event) => this.remove(event));

      chip.append(label, removeButton);
      this.tokensTarget.append(chip);
    }
  }

  selectedTokens() {
    const tokens = [];

    for (const filter of this.filtersValue) {
      if (filter.kind === "options") {
        for (const input of this.formElements(filter.inputName).filter(
          (element) => element.checked,
        )) {
          const displayValue =
            this.element
              .querySelector(`label[for='${input.id}']`)
              ?.textContent.trim() || input.value;
          tokens.push({
            label: filter.label,
            displayValue,
            inputName: filter.inputName,
            value: input.value,
          });
        }

        // Slack-style exclusions render as `-Label: value` tokens backed by
        // hidden inputs (see select()).
        if (filter.excludedInputName) {
          for (const input of this.formElements(filter.excludedInputName)) {
            tokens.push({
              label: `-${filter.label}`,
              displayValue: this.displayValueFor(filter, input.value),
              inputName: filter.excludedInputName,
              value: input.value,
            });
          }
        }
      } else if (filter.kind === "branch") {
        for (const child of filter.options) {
          const input = this.formElements(child.inputName)[0];
          if (!input?.value) continue;
          if (
            child.operator &&
            this.formElements("q[amount_operator]")[0]?.value !== child.operator
          )
            continue;

          tokens.push({
            label: child.operator
              ? `${filter.label} ${child.label.toLocaleLowerCase()}`
              : child.label,
            displayValue: input.value,
            inputName: child.inputName,
            value: input.value,
          });
        }
      }
    }

    return tokens;
  }

  currentTerm() {
    const match = this.inputTarget.value.match(
      /(^|\s)(-?)([a-z-]+):([^:]*)$/i,
    );
    if (!match) return null;

    return {
      negated: match[2] === "-",
      key: match[3].toLowerCase(),
      query: match[4],
      start: match.index + match[1].length,
    };
  }

  findFilter(key) {
    for (const filter of this.filtersValue) {
      if (filter.key === key) return filter;
      const child = filter.options?.find((option) => option.key === key);
      if (child) return child;
    }
  }

  replaceCurrentTerm(replacement) {
    const term = this.currentTerm();
    if (!term) return;

    this.inputTarget.value =
      `${this.inputTarget.value.slice(0, term.start)}${replacement}`.trimEnd();
  }

  formElements(name) {
    return Array.from(this.element.elements).filter(
      (element) => element.name === name,
    );
  }

  // Excluded values are stored in hidden inputs with no <label>, so resolve
  // the human-readable label from the matching positive checkbox instead.
  displayValueFor(filter, value) {
    const positive = this.formElements(filter.inputName).find(
      (element) => element.value === value,
    );
    if (positive?.id) {
      return (
        this.element.querySelector(`label[for='${positive.id}']`)?.textContent.trim() ||
        value
      );
    }
    return value;
  }

  matches(label, query) {
    return label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  }

  updateActiveOption(options) {
    options.forEach((option, index) => {
      const active = index === this.activeIndex;
      option.setAttribute("aria-selected", active ? "true" : "false");
      option.classList.toggle("bg-surface-hover", active);
      if (active)
        this.inputTarget.setAttribute("aria-activedescendant", option.id);
    });
  }

  hideMenu() {
    this.menuTarget.classList.add("hidden");
    this.inputTarget.setAttribute("aria-expanded", "false");
    this.inputTarget.removeAttribute("aria-activedescendant");
  }
}
