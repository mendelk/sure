/* oxlint-disable unicorn/consistent-function-scoping -- This function is serialized into the browser and must carry its own redaction helper. */
export interface AmazonCapture {
  version: number;
  source_url: string;
  captured_at: string;
  visible_text: string;
  order_numbers: string[];
  links: { text: string; url: string }[];
}

/** Import in the automation host, then evaluate captureAmazon.toString() in the page. */
export function captureAmazon({ selector }: { selector: string }): AmazonCapture {
  const amazonHost =
    /^(?:www\.)?amazon\.(?:com|ca|co\.uk|de|fr|it|es|co\.jp|com\.au|in|com\.mx|com\.br|nl|se|pl|com\.be|ie|sg|ae|sa)$/iu;
  if (!amazonHost.test(location.hostname)) throw new Error("Not a supported Amazon retail host");
  if (typeof selector !== "string" || !selector.trim())
    throw new Error("An observed section selector is required");
  const roots = document.querySelectorAll<HTMLElement>(selector);
  if (roots.length !== 1) throw new Error("Selector must identify exactly one evidence section");
  const root = roots[0]!;
  if (root.matches("html, body") || root.querySelector('input[type="password"]'))
    throw new Error("Select a payment/shipment section, not the whole page or sign-in form");

  const text = root.innerText.trim();
  if (!text) throw new Error("Evidence section has no visible text");
  const cleanUrl = (href: string): string | null => {
    const url = new URL(href, location.href);
    if (url.protocol !== "https:" || !amazonHost.test(url.hostname)) return null;
    const clean = new URL(url.origin + url.pathname);
    for (const key of ["orderID", "orderId"]) {
      const value = url.searchParams.get(key);
      if (value !== null) clean.searchParams.set(key, value);
    }
    return clean.href;
  };
  // Retain issuer/type for comparison, never the masked card's identifying suffix.
  const redact = (value: string): string =>
    value
      .replaceAll(/[•*·]{2,}\s*\d+/gu, "[payment method redacted]")
      .replaceAll(/(ending in|ends in)\s*:?\s*\d+/giu, "$1 [redacted]");
  const links: AmazonCapture["links"] = [];
  for (const link of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (link.getClientRects().length === 0) continue;
    const url = cleanUrl(link.href);
    const label = redact(link.innerText.trim());
    if (label.length > 0 && url !== null) links.push({ text: label, url });
  }
  return {
    version: 1,
    source_url: cleanUrl(location.href)!,
    captured_at: new Date().toISOString(),
    visible_text: redact(text),
    order_numbers: [...new Set(text.match(/\b\d{3}-\d{7}-\d{7}\b/gu))],
    links,
  };
}
