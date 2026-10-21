import { Icon } from "../icon";

const DEFAULT_TEXT = {
  title: "No accounts yet",
  description: "Add accounts to display net worth data",
  addAccount: "Add account",
} as const;

export type NoAccountsText = {
  title: string;
  description: string;
  addAccount: string;
};
export function resolveNoAccountsText(homeText: Record<string, string | undefined>) {
  return {
    title: homeText.no_accounts_title ?? DEFAULT_TEXT.title,
    description: homeText.no_accounts_description ?? DEFAULT_TEXT.description,
    addAccount: homeText.no_accounts_add ?? DEFAULT_TEXT.addAccount,
  };
}

export function NoAccountsPlaceholder({
  newAccountHref,
  text = DEFAULT_TEXT,
}: {
  newAccountHref: string;
  text?: NoAccountsText;
}) {
  return (
    <div className="h-[300px] lg:h-[340px] bg-container shadow-border-xs rounded-xl py-4 flex flex-col items-center justify-center">
      <div className="space-y-3 text-center flex flex-col items-center">
        <div className="size-12 rounded-full bg-container-inset flex items-center justify-center">
          <Icon name="wallet-minimal" size="lg" className="text-secondary" />
        </div>

        <p className="text-sm font-medium text-primary">{text.title}</p>
        <p className="text-secondary text-sm">{text.description}</p>
        <a
          href={newAccountHref}
          className="inline-flex items-center gap-1.5 rounded-lg bg-container-inset px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          <Icon name="plus" size="sm" />
          {text.addAccount}
        </a>
      </div>
    </div>
  );
}
