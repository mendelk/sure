/* oxlint-disable unicorn/consistent-function-scoping -- Serialized browser functions must carry every helper with them. */
export interface OrderCapture {
  version: 1;
  order_number: string;
  source_url: string;
  captured_at: string;
  items: { title: string; quantity_text: string; price_text: string }[];
  summary_rows: { label: string; value: string }[];
}

/** Serialize into the observed order page; selectors identify individual item grids and summary rows. */
export function captureAmazonOrder({
  order_number,
  item_selectors,
  summary_row_selectors,
}: {
  order_number: string;
  item_selectors: string[];
  summary_row_selectors: string[];
}): OrderCapture {
  const amazonHost =
    /^(?:www\.)?amazon\.(?:com|ca|co\.uk|de|fr|it|es|co\.jp|com\.au|in|com\.mx|com\.br|nl|se|pl|com\.be|ie|sg|ae|sa)$/iu;
  const page = new URL(location.href);
  if (page.protocol !== "https:" || !amazonHost.test(page.hostname))
    throw new Error("Select an HTTPS Amazon retail order page");
  if (document.querySelector("#orderDetails") === null) {
    const accessText = [...document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6,button")]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => element.innerText.trim())
      .join("\n");
    const passwordVisible = [...document.querySelectorAll('input[type="password"]')].some(
      (element) => element.getClientRects().length > 0,
    );
    if (
      /continue shopping|robot check|captcha|verify.*(?:human|identity)|sign.?in/iu.test(
        accessText,
      ) ||
      passwordVisible
    )
      throw new Error("Amazon access challenge requires user action; stop browser navigation");
  }
  if (typeof order_number !== "string" || !/^\d{3}-\d{7}-\d{7}$/u.test(order_number))
    throw new Error("A real Amazon order number is required");
  const orderParameters = [...page.searchParams].filter(([key]) => /^orderid$/iu.test(key));
  if (orderParameters.length !== 1 || orderParameters[0]![1] !== order_number)
    throw new Error("The page orderID must uniquely match the requested order");
  if (
    !Array.isArray(item_selectors) ||
    !Array.isArray(summary_row_selectors) ||
    item_selectors.length === 0
  )
    throw new Error("Observed item selectors and summary-row selectors are required");

  const redact = (value: string): string =>
    value
      .replaceAll(/[•*·●xX]{2,}\s*\d{2,}/gu, "[payment method redacted]")
      .replaceAll(/\b(ending in|ends in|last four(?: digits)?)\s*:?\s*\d+/giu, "$1 [redacted]");
  const visible = (element: Element): boolean => {
    if (element.getClientRects().length === 0) return false;
    for (let current: Element | null = element; current !== null; current = current.parentElement) {
      if (current.matches("[hidden], .a-offscreen, .aok-offscreen, .sr-only")) return false;
      const style = getComputedStyle(current);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse" ||
        style.opacity === "0"
      )
        return false;
    }
    return true;
  };
  // Read text nodes only within the selected, bounded field. In particular, do
  // not expose hidden screen-reader copies, controls, attributes or image alt text.
  const text = (element: Element): string => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (
        parent === null ||
        !visible(parent) ||
        parent.closest("script, style, noscript, input, textarea, select, button") !== null
      )
        continue;
      parts.push(node.textContent ?? "");
    }
    return redact(parts.join("").replaceAll(/\s+/gu, " ").trim());
  };
  const forbiddenMetadata = (element: Element): boolean =>
    /address|carousel|recommend|similar[-_]?products|(?:^|[-_])sims(?:[-_]|$)/iu.test(
      `${element.id} ${element.getAttribute("class") ?? ""} ${element instanceof HTMLElement ? (element.dataset.componentType ?? "") : ""}`,
    );
  const selected: HTMLElement[] = [];
  const select = (selector: string): HTMLElement => {
    if (typeof selector !== "string" || selector.trim().length === 0)
      throw new Error("Every selector must identify an observed bounded section");
    const matches = document.querySelectorAll(selector);
    const root = matches[0];
    if (matches.length !== 1 || !(root instanceof HTMLElement) || !visible(root))
      throw new Error("Every selector must identify exactly one visible section");
    if (
      root.matches("html, body, form, address") ||
      root.closest("form, address") !== null ||
      root.querySelector('form, address, input[type="password"]') !== null
    )
      throw new Error("Whole pages, forms, addresses and credential sections are forbidden");
    for (let current: Element | null = root; current !== null; current = current.parentElement) {
      if (forbiddenMetadata(current))
        throw new Error("Address, recommendation and carousel sections are forbidden");
    }
    if (
      [...root.querySelectorAll("[id], [class], [data-component-type]")].some((element) =>
        forbiddenMetadata(element),
      )
    )
      throw new Error("The selected section contains an address, recommendation or carousel");
    if (selected.some((other) => other.contains(root) || root.contains(other)))
      throw new Error("Selected sections must not duplicate or contain one another");
    selected.push(root);
    return root;
  };
  const amounts = (element: Element): string[] => {
    // A displayed amount is evidence, not an inferred price. Retain distinct
    // amounts explicitly so an old/list price cannot silently become the price.
    const matches = text(element).match(/[-−]?\s*\$\s*\d[\d,]*\.\d{2}(?!\d)/gu) ?? [];
    return matches.map((value) => value.replaceAll(/\s+/gu, "").replace("−", "-"));
  };
  const displayAmounts = (values: string[]): string => {
    const unique = [...new Set(values)];
    if (unique.length === 0) return "";
    if (unique.length === 1) return unique[0]!;
    return `Ambiguous: ${unique.join(" | ")}`;
  };

  const items: OrderCapture["items"] = item_selectors.map((selector) => {
    const root = select(selector);
    if (!root.matches(".a-fixed-left-grid"))
      throw new Error("An item selector must identify its observed .a-fixed-left-grid");
    const titles = [...root.querySelectorAll<HTMLAnchorElement>("a[href]")].filter((link) => {
      if (!visible(link) || text(link).length === 0) return false;
      const url = new URL(link.href, page.href);
      return (
        url.protocol === "https:" &&
        amazonHost.test(url.hostname) &&
        /\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:\/|$)/iu.test(url.pathname)
      );
    });
    if (titles.length !== 1)
      throw new Error("An item grid must contain exactly one visible nonempty product-title link");
    const title = titles[0]!;
    const leftColumns = [...root.querySelectorAll<HTMLElement>(".a-col-left")].filter((element) =>
      visible(element),
    );
    if (leftColumns.length !== 1)
      throw new Error("An item grid must contain one visible .a-col-left quantity/image column");
    const left = leftColumns[0]!;
    const prices: string[] = [];
    for (const span of root.querySelectorAll("span")) {
      if (
        !visible(span) ||
        left.contains(span) ||
        title.contains(span) ||
        span.contains(title) ||
        span.closest(
          '[id*="seller" i], [class*="seller" i], [id*="merchant" i], [class*="merchant" i], address',
        ) !== null
      )
        continue;
      prices.push(...amounts(span));
    }
    return {
      title: text(title),
      // Empty is unknown. A missing visible badge is never evidence of quantity 1.
      quantity_text: text(left),
      price_text: displayAmounts(prices),
    };
  });

  const summary_rows: OrderCapture["summary_rows"] = summary_row_selectors.map((selector) => {
    const root = select(selector);
    const labels = [...root.querySelectorAll<HTMLElement>(".od-line-item-row-label")].filter(
      (element) => visible(element),
    );
    if (labels.length !== 1 || labels[0]!.parentElement !== root) {
      throw new Error(
        "A summary selector must identify the immediate parent of one visible price label",
      );
    }
    const label = labels[0]!;
    if (root.querySelector("a[href], input, textarea, select") !== null)
      throw new Error("A summary row must contain only its price label and shown amount");
    const labelText = text(label);
    if (labelText.length === 0 || /address|payment method|ending in|ends in/iu.test(labelText))
      throw new Error("A summary row must have a nonprivate financial label");
    const values = [...root.children]
      .filter((child) => child !== label && visible(child))
      .flatMap((element) => amounts(element));
    return { label: labelText, value: displayAmounts(values) };
  });
  const source = new URL(page.origin + page.pathname);
  source.searchParams.set("orderID", order_number);
  return {
    version: 1,
    order_number,
    source_url: source.href,
    captured_at: new Date().toISOString(),
    items,
    summary_rows,
  };
}
