export interface GiftCardPage {
  version: 1;
  source_url: string;
  captured_at: string;
  balance: string;
  has_next: boolean;
  has_previous: boolean;
  rows: { date: string; description: string; amount: string; closing_balance: string }[];
  order_links?: { order_number: string; url: string }[];
}

/** Serialize this function into the signed-in page; it performs no requests or writes. */
export function captureGiftCardLedger({ selector }: { selector: string }): GiftCardPage {
  if (
    location.protocol !== "https:" ||
    !/^(?:www\.)?amazon\.com$/u.test(location.hostname) ||
    location.pathname !== "/gc/balance"
  )
    throw new Error("Select the Amazon US gift-card activity page");
  const matches = document.querySelectorAll<HTMLTableElement>(selector);
  if (matches.length !== 1 || matches[0]!.tagName !== "TABLE")
    throw new Error("An observed unique gift-card table selector is required");
  const table = matches[0]!;
  if (table.getClientRects().length === 0) throw new Error("Gift-card table is not visible");
  const headers = [...table.querySelectorAll("th")].map((cell) => cell.innerText.trim());
  if (
    JSON.stringify(headers) !== JSON.stringify(["Date", "Description", "Amount", "Closing balance"])
  )
    throw new Error("Gift-card activity columns changed; observe the page again");
  const balances = [...document.querySelectorAll<HTMLElement>("h1,h2")].filter(
    (heading) =>
      heading.getClientRects().length > 0 &&
      heading.innerText.trim().startsWith("Your Gift Card Balance:"),
  );
  if (balances.length !== 1) throw new Error("A unique visible current balance is required");
  const prefixes = [
    "Gift Card applied to Amazon.com order",
    "Refund from Amazon.com order",
    "Release of Gift Card Balance hold from Amazon.com order",
    "Gift Card Balance added from Reload",
    "Gift Card Balance added from Auto-Reload",
  ];
  const standaloneLabels = ["Gift Card added", "Allowance added", "Amazon Cash load"];
  const rows: GiftCardPage["rows"] = [];
  const orderLinks = new Map<string, string>();
  for (const row of table.querySelectorAll("tr")) {
    if (row.getClientRects().length === 0) continue;
    const cells = [...row.querySelectorAll<HTMLTableCellElement>(":scope > td")];
    if (cells.length === 0) continue;
    if (cells.length !== 4) throw new Error("Gift-card activity row shape changed");
    const raw = cells[1]!.innerText.replaceAll(/\s+/gu, " ").trim();
    const order = raw.match(/\b\d{3}-\d{7}-\d{7}\b/u)?.[0];
    // Reconstruct only recognized public descriptions. Never retain claim codes,
    // serial numbers, payment details, or an unrecognized row's potentially private text.
    const prefix = prefixes.find((value) => raw === value || raw.startsWith(value + " "));
    const standalone = standaloneLabels.find(
      (value) => raw === value || raw.startsWith(value + " "),
    );
    const description =
      prefix !== undefined
        ? prefix + (order !== undefined ? ` ${order}` : "")
        : (standalone ?? "[Unrecognized gift-card activity]");
    for (const link of cells[1]!.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      if (link.getClientRects().length === 0 || order === undefined) continue;
      const observed = new URL(link.href, location.href);
      const linkedOrder =
        observed.searchParams.get("orderID") ?? observed.searchParams.get("orderId");
      if (
        observed.protocol !== "https:" ||
        !/^(?:www\.)?amazon\.com$/u.test(observed.hostname) ||
        linkedOrder !== order
      )
        continue;
      const clean = new URL(observed.origin + observed.pathname);
      clean.searchParams.set("orderID", order);
      orderLinks.set(order, clean.href);
    }
    rows.push({
      date: cells[0]!.innerText.trim(),
      description,
      amount: cells[2]!.innerText.trim(),
      closing_balance: cells[3]!.innerText.trim(),
    });
  }
  if (rows.length === 0) throw new Error("No visible gift-card activity rows");
  const labels = new Set(
    [...document.querySelectorAll<HTMLAnchorElement>("a")]
      .filter((link) => link.getClientRects().length > 0 && link.hasAttribute("href"))
      .map((link) => link.innerText.trim()),
  );
  return {
    version: 1,
    source_url: "https://www.amazon.com/gc/balance",
    captured_at: new Date().toISOString(),
    balance: balances[0]!.innerText.trim().replace(/^Your Gift Card Balance:\s*/u, ""),
    has_next: labels.has("Next"),
    has_previous: labels.has("Previous"),
    rows,
    order_links: [...orderLinks].map(([order_number, url]) => ({ order_number, url })),
  };
}
