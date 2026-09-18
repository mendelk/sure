import { type SummaryAccount, useSummaryQuery } from "./api/summary";

function SummaryStat({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs text-secondary">{label}</p>
      <p className="font-medium tabular-nums privacy-sensitive">{value ?? "…"}</p>
    </div>
  );
}

function AccountListSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="h-12 animate-pulse rounded-xl border border-secondary bg-container"
        />
      ))}
    </div>
  );
}

function AccountGroup({ label, accounts }: { label: string; accounts: SummaryAccount[] }) {
  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-secondary">{label}</h2>
      <ul className="overflow-hidden rounded-xl border border-secondary bg-container">
        {accounts.map((account) => (
          <li
            key={account.id}
            className="flex items-center justify-between gap-4 border-b border-secondary px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{account.name}</p>
              <p className="text-xs text-secondary">{account.account_type}</p>
            </div>
            <span className="shrink-0 text-sm tabular-nums privacy-sensitive">
              {account.balance}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AccountsPage() {
  const { data, isLoading, error } = useSummaryQuery();

  if (error) {
    return (
      <section aria-labelledby="accounts-title" className="space-y-2">
        <h1 id="accounts-title" className="text-2xl font-semibold">
          Accounts
        </h1>
        <p className="text-sm text-destructive" role="alert">
          Account data failed to load.
        </p>
      </section>
    );
  }

  const assets = data?.accounts.filter((a) => a.classification === "asset");
  const liabilities = data?.accounts.filter((a) => a.classification === "liability");

  return (
    <section aria-labelledby="accounts-title" className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 id="accounts-title" className="text-2xl font-semibold">
          Accounts
        </h1>
        <div className="flex gap-6 text-sm">
          <SummaryStat label="Assets" value={data?.assets} />
          <SummaryStat label="Liabilities" value={data?.liabilities} />
          <SummaryStat label="Net worth" value={data?.net_worth} />
        </div>
      </div>

      {isLoading && <AccountListSkeleton />}

      {assets && assets.length === 0 && liabilities?.length === 0 && (
        <p className="text-sm text-secondary">No accounts yet.</p>
      )}

      {assets && assets.length > 0 && <AccountGroup label="Assets" accounts={assets} />}
      {liabilities && liabilities.length > 0 && (
        <AccountGroup label="Liabilities" accounts={liabilities} />
      )}
    </section>
  );
}
