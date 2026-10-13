// eslint-disable import/max-dependencies -- Accounts index composes provider cards, group tables, the sync toolbar, action menus, the sharing dialog, and the new-account handoff.
import { DialogTitle } from "@headlessui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  accountsIndexQueryOptions,
  invalidateAccountQueries,
  sharingQueryOptions,
  updateFinanceInclusion,
  updateSharing,
  type AccountListRow,
  type AccountsIndex,
  type ProviderItem,
  type SharingMember,
  type SpaAction,
} from "./api/account-spa";
import { readCsrfToken } from "./api/transactions";
import { AccountIdSchema } from "./ids";
import { CategoryIcon, Icon } from "./icon";
import { Alert } from "./components/alert";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { Toggle } from "./components/toggle";
import { BrandLogo } from "./components/brand-logo";
import { Modal } from "./modal";

// ERB parity strings the row renders inline.
const ROW_TEXT = {
  deletion_in_progress: "(deletion in progress...)",
  default_label: "Default",
  excluded: "Excluded from reports",
} as const;

type ConfirmState = { action: SpaAction };

function actionForm(action: SpaAction): HTMLFormElement {
  const form = document.createElement("form");
  form.method = "post";
  form.action = action.href;
  const csrf = document.createElement("input");
  csrf.type = "hidden";
  csrf.name = "authenticity_token";
  csrf.value = readCsrfToken();
  form.append(csrf);
  const method = action.method ?? "post";
  if (method !== "post" && method !== "get") {
    const override = document.createElement("input");
    override.type = "hidden";
    override.name = "_method";
    override.value = method;
    form.append(override);
  }
  for (const [name, value] of Object.entries(action.params ?? {})) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }
  return form;
}

function AccountLettermark({
  name,
  color,
  logoUrl,
}: {
  name: string;
  color: string;
  logoUrl: string | null;
}) {
  return (
    <BrandLogo
      src={logoUrl}
      className="size-9 rounded-full text-xs font-medium uppercase"
      style={{
        color,
        backgroundColor: `color-mix(in oklab, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 10%, transparent)`,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </BrandLogo>
  );
}

function ProviderLettermark({ item }: { item: ProviderItem }) {
  return (
    <BrandLogo
      src={item.logo_url}
      className="size-8 rounded-full text-xs font-medium uppercase text-inverse"
      style={{ backgroundColor: item.logo_color ?? "var(--color-gray-500)" }}
    >
      {item.logo_icon !== null && item.logo_icon !== undefined && item.logo_icon !== "" ? (
        <CategoryIcon name={item.logo_icon} className="size-4 text-inherit" />
      ) : (
        item.logo_text
      )}
    </BrandLogo>
  );
}

function StatusLine({ item }: { item: ProviderItem }) {
  if (item.syncing) {
    return (
      <p className="flex items-center gap-1 text-secondary">
        <Icon className="animate-spin" name="loader-circle" size="sm" />
        {item.status_label}
      </p>
    );
  }
  if (item.status === "requires_update") {
    return (
      <p className="flex items-center gap-1 text-warning">
        <Icon name="circle-alert" size="sm" />
        {item.status_label}
      </p>
    );
  }
  if (item.status === "error") {
    return (
      <p className="flex items-center gap-1 text-destructive" title={item.status_label}>
        <Icon name="circle-alert" size="sm" />
        {item.status_label}
      </p>
    );
  }
  return <p className="text-secondary">{item.status_label}</p>;
}

function ConfirmationDialog({
  state,
  onCancel,
  onConfirm,
}: {
  state: ConfirmState;
  onCancel: () => void;
  onConfirm: (action: SpaAction) => void;
}) {
  return (
    <Modal
      ariaLabelledby="spa-confirm-title"
      onClose={onCancel}
      open
      panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
    >
      <h2 className="text-lg font-medium text-primary" id="spa-confirm-title">
        {state.action.confirm?.title ?? state.action.label}
      </h2>
      <p className="my-4 text-sm text-secondary">{state.action.confirm?.body ?? ""}</p>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} variant="secondary">
          Cancel
        </Button>
        <Button
          onClick={() => {
            onConfirm(state.action);
          }}
          variant="destructive"
        >
          {state.action.confirm?.confirmText ?? state.action.label}
        </Button>
      </div>
    </Modal>
  );
}

function AccountRowMenu({
  row,
  onConfirm,
}: {
  row: AccountListRow;
  onConfirm: (action: SpaAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const editable = row.actions.filter((action) => action.key !== "complete_setup");
  if (editable.length === 0) return null;
  return (
    <div className="relative">
      <IconButton
        icon="more-horizontal"
        label={`${row.name} menu`}
        onClick={() => {
          setOpen((value) => !value);
        }}
      />
      {open ? (
        <div
          className="shadow-border-lg absolute right-0 z-30 mt-2 min-w-52 rounded-lg bg-container py-1"
          role="menu"
        >
          {editable.map((action) =>
            action.method === "get" ? (
              <a
                className="block w-full px-4 py-2 text-left text-sm text-primary hover:bg-container-hover"
                href={action.href}
                key={action.key}
                onClick={() => {
                  setOpen(false);
                }}
                role="menuitem"
              >
                {action.label}
              </a>
            ) : (
              <button
                className="block w-full px-4 py-2 text-left text-sm text-primary hover:bg-container-hover"
                key={action.key}
                onClick={() => {
                  setOpen(false);
                  onConfirm(action);
                }}
                role="menuitem"
                type="button"
              >
                {action.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function AccountRowView({
  row,
  onConfirm,
}: {
  row: AccountListRow;
  onConfirm: (action: SpaAction) => void;
}) {
  return (
    <li className="relative flex items-center justify-between gap-3 px-4 py-4 hover:bg-surface-hover">
      <div className="flex min-w-0 items-center gap-3">
        <AccountLettermark color={row.color} logoUrl={row.logo_url} name={row.name} />
        <div className="min-w-0">
          {row.pending_deletion ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
              {row.name}
              <span className="animate-pulse text-destructive">
                {ROW_TEXT.deletion_in_progress}
              </span>
            </p>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-1.5">
                <Link
                  className={`text-sm font-medium hover:underline ${row.active ? "text-primary" : "text-secondary"}`}
                  params={{ accountId: row.id }}
                  to="/accounts/$accountId"
                >
                  {row.name}
                </Link>
                {row.exclude_from_reports ? (
                  <span title={ROW_TEXT.excluded}>
                    <Icon className="text-secondary" name="eye-off" size="sm" />
                  </span>
                ) : null}
                {row.shared ? (
                  <span title={row.owner_name ?? undefined}>
                    <Icon className="text-secondary" name="user" size="sm" />
                  </span>
                ) : null}
                {row.institution_name !== null && row.institution_name !== "" ? (
                  <span className="hidden text-secondary sm:inline">• {row.institution_name}</span>
                ) : null}
              </p>
              <p className="truncate text-sm text-secondary">{row.subtype_label}</p>
              {row.is_default ? (
                <p className="text-xs text-secondary opacity-50">{ROW_TEXT.default_label}</p>
              ) : null}
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {row.draft ? null : row.syncing ? (
          <span
            aria-hidden="true"
            className="h-6 w-16 animate-pulse rounded-full bg-container-inset"
          />
        ) : (
          <p
            className={`text-sm font-medium tabular-nums privacy-sensitive ${row.active ? "text-primary" : "text-secondary"}`}
          >
            {row.balance}
          </p>
        )}
        {row.draft ? (
          <Button
            onClick={() => {
              const setup = row.actions.find((action) => action.key === "complete_setup");
              if (setup !== undefined && (setup.method ?? "get") === "get")
                window.location.assign(setup.href);
            }}
            size="sm"
            variant="secondary"
          >
            {row.actions[0]?.label ?? "Complete setup"}
          </Button>
        ) : !row.pending_deletion ? (
          <AccountRowMenu onConfirm={onConfirm} row={row} />
        ) : null}
      </div>
    </li>
  );
}

function GroupTable({
  group,
  onConfirm,
}: {
  group: AccountsIndex["groups"][number];
  onConfirm: (action: SpaAction) => void;
}) {
  return (
    <section
      aria-label={group.name}
      className="overflow-hidden rounded-xl bg-container shadow-border-xs"
    >
      <div className="flex items-center gap-2 bg-container-inset px-4 py-2.5 text-xs font-medium uppercase text-secondary">
        <p>{group.name}</p>
        <span className="text-subdued">&middot;</span>
        <p>{group.accounts.length}</p>
        {!group.syncing ? (
          <p className="ml-auto privacy-sensitive text-xs font-medium tabular-nums text-secondary">
            {group.total}
          </p>
        ) : null}
      </div>
      <ul className="divide-y divide-tertiary">
        {group.accounts.map((row) => (
          <AccountRowView key={row.id} onConfirm={onConfirm} row={row} />
        ))}
      </ul>
    </section>
  );
}

function submitPost(href: string) {
  const form = document.createElement("form");
  form.method = "post";
  form.action = href;
  const csrf = document.createElement("input");
  csrf.type = "hidden";
  csrf.name = "authenticity_token";
  csrf.value = readCsrfToken();
  form.append(csrf);
  document.body.append(form);
  form.submit();
}

function SyncControls({ sync }: { sync: AccountsIndex["sync"] }) {
  const syncing = sync.syncing;
  return (
    <div className="flex shrink-0 items-center gap-2" id="accounts-sync-controls">
      <IconButton
        className={syncing ? "animate-pulse" : ""}
        disabled={syncing}
        icon={syncing ? "loader-circle" : "refresh-ccw"}
        label={sync.syncing_label}
        onClick={() => {
          if (!syncing) submitPost(sync.sync_href);
        }}
      />
      {sync.cancel_path !== null ? (
        <Button
          onClick={() => {
            submitPost(sync.cancel_path ?? "");
          }}
          size="sm"
          variant="ghost"
        >
          {sync.cancel_label}
        </Button>
      ) : null}
    </div>
  );
}

export function SharingDialog({
  accountId,
  onClose,
  onSaved,
}: {
  accountId: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const query = useQuery(sharingQueryOptions(accountId));
  const payload = query.data;
  const [members, setMembers] = useState<SharingMember[] | null>(null);
  const [financeIncluded, setFinanceIncluded] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentMembers = members ?? payload?.members ?? [];
  const setMember = (id: string, patch: Partial<SharingMember>) => {
    setMembers((previous) => {
      const list = previous ?? (payload?.members ? [...payload.members] : []);
      for (const member of list) if (member.id === id) Object.assign(member, patch);
      return [...list];
    });
  };

  async function save() {
    if (payload === undefined) return;
    setSaving(true);
    setError(null);
    try {
      if (payload.owned) {
        await updateSharing(
          accountId,
          currentMembers.map((member) => ({
            user_id: member.id,
            shared: member.shared,
            permission: member.permission,
          })),
        );
      } else if (financeIncluded !== null) await updateFinanceInclusion(accountId, financeIncluded);
      onSaved?.();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save sharing settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      ariaLabelledby="spa-sharing-title"
      onClose={onClose}
      open
      panelClassName="w-full max-w-xl rounded-xl bg-container p-6 shadow-border-lg"
    >
      <div className="flex items-start justify-between gap-4">
        <DialogTitle className="text-lg font-medium text-primary">Account Sharing</DialogTitle>
        <IconButton icon="x" label="Close" onClick={onClose} />
      </div>

      {query.isError ? (
        <Alert className="mt-4" live="alert" variant="error">
          Sharing options are unavailable.
        </Alert>
      ) : null}
      {error !== null ? (
        <Alert className="mt-4" live="alert" variant="error">
          {error}
        </Alert>
      ) : null}

      {payload !== undefined ? (
        payload.owned ? (
          payload.no_members ? (
            <p className="mt-4 text-sm text-secondary">
              No other members in your {payload.moniker} to share with
            </p>
          ) : (
            <div className="mt-4 rounded-xl bg-container-inset p-1">
              <div className="grid grid-cols-3 gap-4 px-4 py-2 text-xs font-medium uppercase text-secondary">
                <p>Member</p>
                <p>Permission</p>
                <p className="text-right">Shared</p>
              </div>
              {currentMembers.map((member, index) => (
                <div
                  className="mt-2 flex items-center rounded-lg bg-container p-4 shadow-border-xs"
                  key={member.id}
                >
                  <input
                    name={`sharing[members][${index}][user_id]`}
                    type="hidden"
                    value={member.id}
                  />
                  <div className="grid w-full grid-cols-3 items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-full bg-surface-inset text-xs font-medium text-secondary">
                        {member.initials}
                      </span>
                      <span className="text-sm text-primary">{member.name}</span>
                    </div>
                    <FormField
                      aria-label={`Permission for ${member.name}`}
                      as="select"
                      disabled={!member.shared}
                      id={`member-permission-${member.id}`}
                      onChange={(event) => {
                        setMember(member.id, { permission: event.target.value });
                      }}
                      value={member.permission}
                    >
                      {Object.entries(payload.permissions).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </FormField>
                    <div className="flex justify-end">
                      <Toggle
                        checked={member.shared}
                        id={`member-shared-${member.id}`}
                        label={`Share with ${member.name}`}
                        onChange={(checked) => {
                          setMember(member.id, { shared: checked });
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          payload.member !== null && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-surface-inset text-xs font-medium text-secondary">
                  {payload.owner?.initials}
                </span>
                <div>
                  <p className="text-sm font-medium text-primary">Owner: {payload.owner?.name}</p>
                  <p className="text-xs text-secondary">
                    {payload.permissions[payload.viewer_permission ?? "read_only"]}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-container-inset p-4">
                <div>
                  <p className="text-sm font-medium text-primary">
                    Include in my budgets &amp; reports
                  </p>
                  <p className="text-xs text-secondary">
                    Count this account in your net worth, budgets, and reports
                  </p>
                </div>
                <Toggle
                  checked={financeIncluded ?? payload.member.include_in_finances}
                  id="include-in-finances"
                  label="Include in finances"
                  onChange={setFinanceIncluded}
                />
              </div>
            </div>
          )
        )
      ) : (
        <output
          aria-busy="true"
          className="mt-4 block h-40 animate-pulse rounded-xl bg-container"
        />
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onClose} variant="secondary">
          Cancel
        </Button>
        <Button
          disabled={
            saving || payload === undefined || (payload.owned ? false : payload.member === null)
          }
          onClick={() => {
            void save();
          }}
        >
          {saving ? "Saving…" : "Save sharing settings"}
        </Button>
      </div>
    </Modal>
  );
}

function ProviderCard({
  item,
  onRowConfirm,
}: {
  item: ProviderItem;
  onRowConfirm: (action: SpaAction) => void;
}) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<SpaAction | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  if (item.scheduled_for_deletion) {
    return (
      <section aria-label={item.name} className="rounded-xl bg-container p-4 shadow-border-xs">
        <div className="flex items-center gap-2">
          <ProviderLettermark item={item} />
          <p className="text-sm font-medium text-primary">{item.name}</p>
          <p className="animate-pulse text-sm text-destructive">{ROW_TEXT.deletion_in_progress}</p>
        </div>
      </section>
    );
  }

  const actions: SpaAction[] = [];
  if (item.manage_href !== undefined && item.manage_href !== null && item.manage_href !== "") {
    actions.push({
      key: "manage",
      label: "Manage connection",
      href: item.manage_href,
      method: "get",
    });
  }
  if (item.delete_href !== undefined && item.delete_href !== null && item.delete_href !== "") {
    actions.push({
      key: "delete_item",
      label: item.confirm_delete?.confirmText ?? `Delete ${item.name}`,
      href: item.delete_href,
      method: "delete",
      confirm: item.confirm_delete,
    });
  }

  return (
    <section aria-label={item.name} className="rounded-xl bg-container p-4 shadow-border-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Icon name="chevron-right" size="sm" />
          <ProviderLettermark item={item} />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-primary">{item.name}</p>
            <StatusLine item={item} />
          </div>
        </div>
        {actions.length > 0 ? (
          <div className="relative">
            <IconButton
              icon="more-horizontal"
              label={`${item.name} menu`}
              onClick={() => {
                setMenuOpen((value) => !value);
              }}
            />
            {menuOpen ? (
              <div
                className="shadow-border-lg absolute right-0 z-30 mt-2 min-w-52 rounded-lg bg-container py-1"
                role="menu"
              >
                {actions.map((action) =>
                  action.method === "get" ? (
                    <a
                      className="block w-full px-4 py-2 text-left text-sm text-primary hover:bg-container-hover"
                      href={action.href}
                      key={action.key}
                      onClick={() => {
                        setMenuOpen(false);
                      }}
                      role="menuitem"
                    >
                      {action.label}
                    </a>
                  ) : (
                    <button
                      className="block w-full px-4 py-2 text-left text-sm text-primary hover:bg-container-hover"
                      key={action.key}
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirm(action);
                      }}
                      role="menuitem"
                      type="button"
                    >
                      {action.label}
                    </button>
                  ),
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-4 space-y-4">
        {item.wallet !== undefined && item.wallet !== null && item.wallet.accounts !== undefined ? (
          <GroupTable
            group={{
              key: item.provider_key,
              name: item.name,
              color: item.logo_color ?? "",
              total: "",
              syncing: false,
              accounts: item.wallet.accounts,
            }}
            onConfirm={onRowConfirm}
          />
        ) : item.group !== null && item.group.length > 0 ? (
          item.group.map((group) => (
            <GroupTable group={group} key={group.key} onConfirm={onRowConfirm} />
          ))
        ) : null}
        {item.empty !== null ? (
          <div className="flex flex-col items-center justify-center gap-2 p-4">
            <p className="text-sm font-medium text-primary">{item.empty.title}</p>
            <p className="text-sm text-secondary">{item.empty.description}</p>
          </div>
        ) : null}
      </div>
      {confirm !== null ? (
        <ConfirmationDialog
          onCancel={() => {
            setConfirm(null);
          }}
          onConfirm={(action) => {
            setConfirm(null);
            actionForm(action).submit();
            void invalidateAccountQueries(queryClient);
          }}
          state={{ action: confirm }}
        />
      ) : null}
    </section>
  );
}

export function AccountsIndexPage() {
  const queryClient = useQueryClient();
  const query = useQuery(accountsIndexQueryOptions("/accounts.json"));
  const [sharing, setSharing] = useState<{ accountId: string } | null>(null);
  const [confirm, setConfirm] = useState<SpaAction | null>(null);
  const data = query.data;

  const onRowConfirm = (action: SpaAction) => {
    if (action.key === "sharing") setSharing({ accountId: extractAccountId(action.href) });
    else setConfirm(action);
  };

  if (query.isError) {
    return (
      <section aria-labelledby="accounts-index-title" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-medium text-primary" id="accounts-index-title">
            Accounts
          </h1>
        </div>
        <Alert live="alert" variant="error">
          <p className="mb-3">Account list is unavailable.</p>
          <Button
            onClick={() => {
              void query.refetch();
            }}
            variant="secondary"
          >
            Try again
          </Button>
        </Alert>
      </section>
    );
  }

  const empty = data !== undefined && data.items.length === 0 && data.groups.length === 0;
  const syncable = data?.sync.syncing ?? false;

  return (
    <section aria-labelledby="accounts-index-title" className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-medium text-primary" id="accounts-index-title">
          Accounts
        </h1>
        <div className="flex items-center gap-2">
          {data !== undefined ? <SyncControls sync={data.sync} /> : null}
          <Link
            className="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-container px-3 text-xs font-medium text-primary shadow-border-xs hover:bg-surface-hover"
            to="/accounts/new"
          >
            <Icon name="plus" size="sm" />
            New account
          </Link>
        </div>
      </div>

      {sharing !== null ? (
        <SharingDialog
          accountId={sharing.accountId}
          onClose={() => {
            setSharing(null);
          }}
          onSaved={() => {
            void invalidateAccountQueries(queryClient);
          }}
        />
      ) : null}

      {confirm !== null ? (
        <ConfirmationDialog
          onCancel={() => {
            setConfirm(null);
          }}
          onConfirm={(action) => {
            setConfirm(null);
            actionForm(action).submit();
            void invalidateAccountQueries(queryClient);
          }}
          state={{ action: confirm }}
        />
      ) : null}

      {empty ? (
        <div className="flex h-[60vh] items-center justify-center">
          <div className="flex max-w-[300px] flex-col items-center text-center text-sm">
            <p className="mb-1 font-medium text-primary">No accounts yet</p>
            <p className="mb-4 text-secondary">
              Add an account either via connection, importing or entering manually.
            </p>
            <Link
              className="focus-ring inline-flex h-10 items-center rounded-lg bg-container px-4 text-sm font-medium text-primary shadow-border-xs hover:bg-surface-hover"
              to="/accounts/new"
            >
              New account
            </Link>
          </div>
        </div>
      ) : (
        <>
          {(data?.items ?? []).map((item) => (
            <ProviderCard item={item} key={`${item.kind}-${item.id}`} onRowConfirm={onRowConfirm} />
          ))}
          {data !== undefined &&
            data.groups.map((group) => (
              <GroupTable group={group} key={group.key} onConfirm={onRowConfirm} />
            ))}
        </>
      )}
      <span aria-hidden="true" data-syncing={syncable ? "true" : "false"} hidden />
    </section>
  );
}

function extractAccountId(href: string): string {
  const match = /\/accounts\/([0-9a-f-]{36})\/sharing/u.exec(href);
  return AccountIdSchema.parse(match?.[1] ?? "");
}
