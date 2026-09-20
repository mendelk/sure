import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useRouteContext, useRouterState } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { type SummaryAccount, useSummaryQuery } from "./api/summary";
import { readCsrfToken } from "./api/transactions";
import type { SpaBootstrap } from "./bootstrap";
import { Icon, type IconName } from "./icon";
import { useDismiss } from "./use-dismiss";

type NavItem = {
  label: string;
  path: keyof SpaBootstrap["railsPaths"];
  icon: IconName;
  spaPath?: "/transactions" | "/dashboards";
};

// Matches the desktop nav of the Rails layout (layouts/application.html.erb):
// Home, Dashboards, Transactions, Reports, Budgets. Plan/insights previews stay on the
// Rails side until they gain SPA routes.
const NAV_ITEMS: NavItem[] = [
  { label: "Home", path: "home", icon: "pie-chart" },
  {
    label: "Dashboards",
    path: "dashboards",
    icon: "layout-dashboard",
    spaPath: "/dashboards",
  },
  {
    label: "Transactions",
    path: "transactions",
    icon: "credit-card",
    spaPath: "/transactions",
  },
  { label: "Reports", path: "reports", icon: "chart-bar" },
  { label: "Budgets", path: "budgets", icon: "map" },
];

function RailNavItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const active = item.spaPath ? pathname === item.spaPath : pathname.startsWith(`/${item.path}`);

  const content = (
    <div className="flex grow flex-col gap-1 lg:flex-row lg:items-center">
      <div className={`h-4 w-1 rounded-r-sm lg:h-4 lg:w-1 ${active ? "bg-nav-indicator" : ""}`} />
      <div
        className={`relative mx-auto flex size-8 items-center justify-center rounded-lg ${
          active
            ? "bg-container text-primary shadow-xs"
            : "text-secondary group-hover:bg-surface-hover"
        }`}
      >
        <Icon name={item.icon} color="current" />
      </div>
      <div className="flex grow justify-center lg:pl-2">
        <span className={`text-[11px] font-medium ${active ? "text-primary" : "text-secondary"}`}>
          {item.label}
        </span>
      </div>
    </div>
  );

  if (item.spaPath) {
    return (
      <li>
        <Link
          to={item.spaPath}
          className="group relative block space-y-1 rounded-lg pb-1 focus-ring"
          aria-current={active ? "page" : undefined}
        >
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <a
        href={bootstrap.railsPaths[item.path]}
        className="group relative block space-y-1 rounded-lg pb-1 focus-ring"
        aria-current={active ? "page" : undefined}
      >
        {content}
      </a>
    </li>
  );
}

// Matches the production Rails account sidebar grouping: accounts are
// bucketed by account_type, each bucket gets a friendly label and a
// client-computed total from the account balance strings.
const ACCOUNT_TYPE_GROUPS: Record<string, string> = {
  depository: "Cash",
  investment: "Investments",
  crypto: "Crypto",
  property: "Properties",
  vehicle: "Vehicles",
  credit_card: "Credit Cards",
  loan: "Loans",
  other_asset: "Other Assets",
  other_liability: "Other Liabilities",
};

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  depository: "#16a34a",
  investment: "#8b5cf6",
  crypto: "#f7931a",
  property: "#0ea5e9",
  vehicle: "#f59e0b",
  other_asset: "#6b7280",
  credit_card: "#ef4444",
  loan: "#dc2626",
  other_liability: "#6b7280",
};

type AccountTypeGroup = {
  key: string;
  label: string;
  symbol: string;
  total: string;
  accounts: SummaryAccount[];
};

function parseAmount(value: string): number {
  const negative = value.trim().startsWith("-");
  const amount = Number(value.replaceAll(/[^0-9.]/gu, ""));
  if (Number.isNaN(amount)) return 0;
  return negative ? -amount : amount;
}

function formatAmount(value: number, symbol: string): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value < 0 ? "-" : ""}${symbol}${formatted}`;
}

function titleize(value: string): string {
  return value.replaceAll("_", " ").replaceAll(/\b\w/gu, (c) => c.toUpperCase());
}

function groupAccountsByType(accounts: SummaryAccount[]): AccountTypeGroup[] {
  const groups: AccountTypeGroup[] = [];
  const byKey = new Map<string, AccountTypeGroup>();

  for (const account of accounts) {
    let group = byKey.get(account.account_type);
    if (!group) {
      const symbol = account.balance.replaceAll(/[^$£€]/gu, "").charAt(0) || "$";
      group = {
        key: account.account_type,
        label: ACCOUNT_TYPE_GROUPS[account.account_type] ?? titleize(account.account_type),
        symbol,
        total: formatAmount(0, symbol),
        accounts: [],
      };
      byKey.set(account.account_type, group);
      groups.push(group);
    }
    group.accounts.push(account);
  }

  for (const group of groups) {
    const total = group.accounts.reduce((sum, account) => sum + parseAmount(account.balance), 0);
    group.total = formatAmount(total, group.symbol);
  }

  return groups;
}

function Lettermark({ name, type }: { name: string; type: string }) {
  const color = ACCOUNT_TYPE_COLORS[type] ?? "#737373";

  return (
    <span
      className="flex size-6 shrink-0 items-center justify-center rounded-full border text-center text-xs font-medium uppercase"
      style={{
        color,
        backgroundColor: `color-mix(in oklab, ${color} 10%, transparent)`,
        borderColor: `color-mix(in oklab, ${color} 10%, transparent)`,
      }}
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function AccountGroup({
  label,
  total,
  accounts,
}: {
  label: string;
  total?: string;
  accounts: SummaryAccount[];
}) {
  if (accounts.length === 0) return null;

  return (
    <section aria-label={label} className="mb-4">
      <details open={label === "Assets"}>
        <summary className="group flex cursor-pointer list-none items-center gap-3 rounded-lg focus-ring [&::-webkit-details-marker]:hidden">
          <Icon name="chevron-right" className="transition-transform group-open:rotate-90" />
          <span className="text-sm font-medium text-primary">{label}</span>
          <span className="ml-auto grow text-right text-sm font-medium text-primary privacy-sensitive">
            {total ?? "…"}
          </span>
        </summary>
        <ul className="mt-2 space-y-1">
          {accounts.map((account) => (
            <li key={account.id}>
              <a
                href={account.path}
                className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-surface-hover"
                title={account.name}
              >
                <Lettermark name={account.name} type={account.account_type} />
                <div className="min-w-0 grow">
                  <p className="truncate text-sm font-medium text-primary">{account.name}</p>
                  <p className="truncate text-sm text-secondary">
                    {titleize(account.account_type)}
                  </p>
                </div>
                <p className="ml-auto whitespace-nowrap text-right text-sm font-medium text-primary privacy-sensitive">
                  {account.balance}
                </p>
              </a>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function AccountTypeGroups({
  label,
  total,
  groups,
}: {
  label: string;
  total?: string;
  groups: AccountTypeGroup[];
}) {
  if (groups.length === 0) return null;

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between px-1 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
          {label}
        </span>
        <span className="text-xs font-medium text-secondary privacy-sensitive">{total ?? "…"}</span>
      </div>
      {groups.map((group) => (
        <AccountGroup
          key={group.key}
          label={group.label}
          total={group.total}
          accounts={group.accounts}
        />
      ))}
    </div>
  );
}

function SidebarContent() {
  const { data, isLoading } = useSummaryQuery();
  const accounts = data?.accounts ?? [];
  const assets = accounts.filter((a) => a.classification === "asset");
  const liabilities = accounts.filter((a) => a.classification === "liability");

  return (
    <div className="flex h-full flex-col">
      <TabGroup>
        <TabList
          className="mb-4 grid grid-cols-3 gap-0.5 rounded-md bg-surface-inset p-0.5"
          aria-label="Account groups"
        >
          {["All", "Assets", "Debts"].map((name) => (
            <Tab
              key={name}
              className={({ selected }: { selected: boolean }) =>
                `rounded-md px-2 py-1 text-sm font-medium focus:outline-none focus-visible:ring-2 ${
                  selected
                    ? "bg-container text-primary shadow-sm"
                    : "text-secondary hover:text-primary"
                }`
              }
            >
              {name}
            </Tab>
          ))}
        </TabList>

        {isLoading && <p className="text-sm text-secondary">Loading accounts…</p>}

        <TabPanels className="grow overflow-y-auto">
          <TabPanel className="space-y-2 focus:outline-none">
            <AccountTypeGroups
              label="Assets"
              total={data?.assets}
              groups={groupAccountsByType(assets)}
            />
            <AccountTypeGroups
              label="Liabilities"
              total={data?.liabilities}
              groups={groupAccountsByType(liabilities)}
            />
          </TabPanel>

          <TabPanel className="space-y-2 focus:outline-none">
            <AccountTypeGroups
              label="Assets"
              total={data?.assets}
              groups={groupAccountsByType(assets)}
            />
          </TabPanel>

          <TabPanel className="space-y-2 focus:outline-none">
            <AccountTypeGroups
              label="Liabilities"
              total={data?.liabilities}
              groups={groupAccountsByType(liabilities)}
            />
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </div>
  );
}

function LeftSidebar({ open }: { open: boolean }) {
  return (
    <div
      className={`hidden lg:block relative shrink-0 overflow-y-auto border-divider py-4 transition-all duration-300 ${
        open ? "w-full border-r" : "w-0 overflow-hidden border-r-0"
      }`}
      style={{ maxWidth: "var(--left-sidebar-width, 320px)" }}
      inert={!open}
    >
      <div className="flex h-full flex-col px-4">
        <SidebarContent />
      </div>
    </div>
  );
}

function MobileSidebar({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-20 h-full w-full overflow-y-auto bg-surface p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)] pr-3 lg:hidden">
      <div className="mb-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-secondary hover:bg-container-inset-hover hover:text-primary"
          aria-label="Close navigation"
        >
          <Icon name="x" />
        </button>
      </div>
      <div className="flex h-full flex-col">
        <SidebarContent />
      </div>
    </div>
  );
}

function MenuItem({
  href,
  icon,
  children,
  external,
}: {
  href: string;
  icon: IconName;
  children: React.ReactNode;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external === true ? "_blank" : undefined}
      rel={external === true ? "noopener noreferrer" : undefined}
      className="flex items-center gap-2 px-4 py-2.5 text-sm text-primary hover:bg-container-hover"
    >
      <Icon name={icon} size="sm" />
      {children}
    </a>
  );
}

function UserMenu({ rail = false }: { rail?: boolean }) {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useDismiss(
    ref,
    () => {
      setOpen(false);
    },
    open,
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
        }}
        className={`flex items-center justify-center font-medium uppercase ${
          rail
            ? "h-9 w-9 rounded-full bg-container-inset text-primary"
            : "h-9 w-9 rounded-full bg-container-inset text-primary"
        }`}
        aria-label="Open account menu"
        aria-expanded={open}
      >
        <span className="text-xs">{bootstrap.currentUser.initials}</span>
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-2 w-64 overflow-hidden rounded-xl border border-secondary bg-container shadow-lg ${
            rail ? "left-0" : "right-0"
          }`}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-container-inset font-medium uppercase">
              <span className="text-xs">{bootstrap.currentUser.initials}</span>
            </div>
            <div className="overflow-hidden text-ellipsis text-sm">
              <p className="font-medium">{bootstrap.currentUser.name}</p>
              <p className="text-secondary">{bootstrap.currentUser.email}</p>
            </div>
          </div>

          <div className="border-t border-tertiary">
            <MenuItem href={bootstrap.railsPaths.settings} icon="user">
              Settings
            </MenuItem>
            <MenuItem href={bootstrap.railsPaths.changelog} icon="box">
              Changelog
            </MenuItem>
            <MenuItem href="https://discord.gg/36ZGBsxYEK" icon="message-circle-question" external>
              Contact
            </MenuItem>
          </div>

          <form
            action={bootstrap.railsPaths.signOut}
            method="post"
            className="border-t border-tertiary"
            onSubmit={(event) => {
              const form = event.currentTarget;
              event.preventDefault();
              void fetch(form.action, {
                method: "DELETE",
                headers: {
                  "X-CSRF-Token": readCsrfToken(),
                },
              }).then(() => {
                window.location.assign("/sessions/new");
              });
            }}
          >
            <input type="hidden" name="_method" value="delete" />
            <button
              type="submit"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-primary hover:bg-container-hover"
            >
              <Icon name="log-out" size="sm" />
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function IconRail() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="hidden lg:block border-r border-divider">
      <nav className="flex h-full w-[84px] flex-col py-4" aria-label="Primary">
        <div className="mb-3 pl-2">
          <a href={bootstrap.railsPaths.home} className="block" aria-label="Sure home">
            <img src={bootstrap.railsPaths.logo} alt="" className="mx-auto h-9 w-9" />
          </a>
        </div>

        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <RailNavItem key={item.label} item={item} pathname={pathname} />
          ))}
        </ul>

        <div className="mx-auto mt-auto flex flex-col gap-2 pl-2">
          <a
            href="https://discord.gg/36ZGBsxYEK"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-container-inset-hover hover:text-primary"
            aria-label="Help (Discord)"
          >
            <Icon name="message-circle-question" />
          </a>
          <UserMenu rail />
        </div>
      </nav>
    </div>
  );
}

function PrivacyToggle() {
  const [active, setActive] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("privacy-mode"),
  );

  function toggle() {
    const next = !active;
    setActive(next);
    document.documentElement.classList.toggle("privacy-mode", next);
    try {
      localStorage.setItem("privacyMode", String(next));
    } catch {
      // localStorage unavailable (private mode, embedded webview) — session-only.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-lg p-2 text-secondary hover:bg-container-inset-hover hover:text-primary"
      title="Privacy mode"
      aria-label="Privacy mode"
      aria-pressed={active}
    >
      <Icon name="eye-off" size="sm" className={active ? "hidden" : ""} />
      <Icon name="eye" size="sm" className={active ? "" : "hidden"} />
    </button>
  );
}

function RefreshSummaryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg p-2 text-secondary hover:bg-container-inset-hover hover:text-primary"
      aria-label="Refresh data"
      title="Refresh data"
    >
      <Icon name="refresh-ccw" />
    </button>
  );
}

function MobileTopNav({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { bootstrap } = useRouteContext({ from: "__root__" });

  return (
    <nav
      className="flex items-center justify-between p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] lg:hidden"
      aria-label="Primary"
    >
      <button
        type="button"
        onClick={onOpenSidebar}
        className="rounded-lg p-2 text-secondary hover:bg-container-inset-hover hover:text-primary"
        aria-label="Open navigation"
      >
        <Icon name="panel-left" />
      </button>

      <a href={bootstrap.railsPaths.home} className="block" aria-label="Sure home">
        <img src={bootstrap.railsPaths.logo} alt="" className="mx-auto h-9 w-9" />
      </a>

      <div className="flex items-center gap-1">
        <PrivacyToggle />
        <UserMenu />
      </div>
    </nav>
  );
}

function MobileBottomNav() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-10 flex justify-around border-t border-tertiary bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Primary"
    >
      {NAV_ITEMS.map((item) => {
        const active = item.spaPath
          ? pathname === item.spaPath
          : pathname.startsWith(`/${item.path}`);

        if (item.spaPath) {
          return (
            <Link
              key={item.label}
              to={item.spaPath}
              className="flex flex-col items-center gap-1 px-3 py-2"
              aria-current={active ? "page" : undefined}
            >
              <Icon name={item.icon} color={active ? "current" : "default"} />
              <span
                className={`text-[11px] font-medium ${active ? "text-primary" : "text-secondary"}`}
              >
                {item.label}
              </span>
            </Link>
          );
        }

        return (
          <a
            key={item.label}
            href={bootstrap.railsPaths[item.path]}
            className="flex flex-col items-center gap-1 px-3 py-2"
            aria-current={active ? "page" : undefined}
          >
            <Icon name={item.icon} />
            <span
              className={`text-[11px] font-medium ${active ? "text-primary" : "text-secondary"}`}
            >
              {item.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}

function RightSidebar({ open }: { open: boolean }) {
  return (
    <div
      className={`hidden lg:block relative shrink-0 overflow-y-auto border-divider py-4 transition-all duration-300 ${
        open ? "w-full border-l" : "w-0 overflow-hidden border-l-0"
      }`}
      style={{ maxWidth: "var(--right-sidebar-width, 400px)" }}
      inert={!open}
    >
      <div className="flex h-full flex-col px-4">
        <div className="rounded-xl border border-secondary bg-container p-4">
          <p className="text-sm font-medium text-primary">Assistant</p>
          <p className="mt-1 text-xs text-secondary">
            AI assistant features available in your workspace.
          </p>
        </div>
      </div>
    </div>
  );
}

function BreadcrumbBar({
  onToggleSidebar,
  onToggleRightSidebar,
}: {
  onToggleSidebar: () => void;
  onToggleRightSidebar: () => void;
}) {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();

  const pageName =
    pathname === "/transactions"
      ? "Transactions"
      : pathname.startsWith("/dashboards")
        ? "Dashboards"
        : "Home";

  return (
    <div className="hidden lg:flex items-center justify-between gap-2 mb-6 sticky top-0 z-10 -mx-3 lg:-mx-10 px-3 lg:px-10 py-4 bg-surface border-b border-tertiary">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-secondary hover:bg-container-inset-hover hover:text-primary"
          aria-label="Toggle sidebar"
        >
          <Icon name="panel-left" />
        </button>

        <div className="flex items-center gap-2 py-2">
          {pageName !== "Home" && (
            <>
              <a
                href={bootstrap.railsPaths.home}
                className="text-sm font-medium text-secondary hover:underline"
              >
                Home
              </a>
              <Icon name="chevron-right" size="sm" />
            </>
          )}
          <span className="text-sm font-medium text-primary">{pageName}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <RefreshSummaryButton
          onClick={() => {
            void queryClient.invalidateQueries();
          }}
        />
        <PrivacyToggle />
        <button
          type="button"
          onClick={onToggleRightSidebar}
          className="rounded-lg p-2 text-secondary hover:bg-container-inset-hover hover:text-primary"
          aria-label="Toggle right sidebar"
        >
          <Icon name="panel-right" />
        </button>
      </div>
    </div>
  );
}

export function AppShell() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(location.pathname);

  // Close the mobile drawer on navigation — during render, not in an effect,
  // so it never paints open on the new route.
  if (lastPathname !== location.pathname) {
    setLastPathname(location.pathname);
    setMobileSidebarOpen(false);
  }

  return (
    <div className="flex flex-col lg:flex-row h-dvh bg-surface text-primary font-sans">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:rounded-lg focus:bg-container focus:text-primary focus:shadow-border-xs"
      >
        Skip to main content
      </a>

      {mobileSidebarOpen && (
        <MobileSidebar
          onClose={() => {
            setMobileSidebarOpen(false);
          }}
        />
      )}

      <MobileTopNav
        onOpenSidebar={() => {
          setMobileSidebarOpen(true);
        }}
      />

      <IconRail />

      <LeftSidebar open={sidebarOpen} />

      <div className="flex min-h-0 min-w-0 grow flex-col">
        <main
          id="main"
          className="grow overflow-y-auto px-3 lg:px-10 w-full mx-auto pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0"
        >
          <BreadcrumbBar
            onToggleSidebar={() => {
              setSidebarOpen((open) => !open);
            }}
            onToggleRightSidebar={() => {
              setRightSidebarOpen((open) => !open);
            }}
          />
          <Outlet />
        </main>
      </div>

      <RightSidebar open={rightSidebarOpen} />

      <MobileBottomNav />

      <span hidden>{bootstrap.currentUser.email}</span>
    </div>
  );
}
