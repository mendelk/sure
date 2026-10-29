/* eslint-disable import/max-dependencies -- Account actions compose menus, dialogs, routing, mutations, and shared form fields. */
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import type { AccountAction, AccountSearch } from "../api/accounts";
import { invalidateAccountQueries, postAccountAction } from "../api/account-spa";
import { CategoryIcon, Icon } from "../icon";
import type { AccountId } from "../ids";
import { Modal } from "../modal";
import { currentReturnTo, parseReturnTo } from "../return-to";
import { Button } from "./button";
import { AccountProviderPicker } from "./account-provider-picker";

export function ConfirmSubmit({
  label,
  message,
  text,
  children,
  onCancel,
}: {
  label: string;
  message: string;
  text: Record<string, string>;
  children: ReactNode;
  onCancel: () => void;
}) {
  return (
    <Modal
      open
      onClose={onCancel}
      ariaLabelledby="account-confirm-title"
      panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
    >
      <h2 id="account-confirm-title" className="text-lg font-medium text-primary">
        {label}
      </h2>
      <p className="my-4 text-sm text-secondary">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {text.cancel}
        </Button>
        {children}
      </div>
    </Modal>
  );
}
export function AccountActionControl({
  action,
  accountId,
  search,
  text,
  disabled = false,
  compact = false,
  iconOnly = false,
}: {
  action: AccountAction;
  accountId: AccountId;
  search: AccountSearch;
  text: Record<string, string>;
  disabled?: boolean;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [pickingProvider, setPickingProvider] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmation = action.confirm ?? (action.method === "delete" ? text.delete_confirm : null);
  const content = (
    <>
      <CategoryIcon name={action.icon} />
      {iconOnly ? null : <span>{action.label}</span>}
    </>
  );
  const buttonClass = compact ? "w-full justify-start! rounded-none!" : undefined;
  const mutation = useMutation({
    mutationFn: postAccountAction,
    onError: (caught) => {
      setError(caught instanceof Error ? caught.message : "Action failed");
    },
    onSuccess: (_data, acted) => {
      setConfirming(false);
      if (acted.method === "get") follow();
      else {
        void invalidateAccountQueries(queryClient);
        if (
          acted.method === "delete" &&
          new URL(acted.href, window.location.origin).pathname === `/api/v1/accounts/${accountId}`
        )
          void navigate({ to: "/accounts" });
      }
    },
  });
  const follow = () => {
    if (action.key === "link_provider") {
      setPickingProvider(true);
      return;
    }
    const url = new URL(action.href, window.location.origin);
    const navigationParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(action.params)) {
      if (typeof value === "string") {
        url.searchParams.set(key, value);
        navigationParams[key] = value;
      }
    }
    if (url.pathname === `/accounts/${accountId}`) {
      void navigate({
        to: "/accounts/$accountId",
        params: { accountId },
        search: { ...search, ...navigationParams },
        resetScroll: false,
      });
    } else if (url.pathname === "/transactions/new") {
      const extra = Object.fromEntries(url.searchParams);
      void navigate({
        to: "/accounts/$accountId/transactions/new",
        params: { accountId },
        search: { ...search, ...extra },
        resetScroll: false,
      });
    } else if (
      url.pathname === "/valuations/new" ||
      url.pathname === `/accounts/${accountId}/valuations/new`
    ) {
      void navigate({
        to: "/accounts/$accountId/valuations/new",
        params: { accountId },
        search: {
          ...search,
          return_to: currentReturnTo(),
        },
        resetScroll: false,
      });
    } else if (url.pathname.startsWith("/loans/") && url.pathname.endsWith("/edit")) {
      void navigate({
        to: "/loans/$accountId/edit",
        params: { accountId },
        search: { ...search, tab: "overview" },
        resetScroll: false,
      });
    } else if (/^\/properties\/[^/]+\/edit\/?$/u.test(url.pathname)) {
      void navigate({
        to: "/properties/$accountId/edit",
        params: { accountId },
        search: { ...search, tab: "overview" },
        resetScroll: false,
      });
    } else if (/^\/properties\/[^/]+\/balances\/?$/u.test(url.pathname)) {
      void navigate({
        to: "/properties/$accountId/balances",
        params: { accountId },
        search: { ...search, tab: "overview" },
        resetScroll: false,
      });
    } else if (/^\/properties\/[^/]+\/address\/?$/u.test(url.pathname)) {
      void navigate({
        to: "/properties/$accountId/address",
        params: { accountId },
        search: { ...search, tab: "overview" },
        resetScroll: false,
      });
    } else if (
      /^\/(depositories|investments|vehicles|credit_cards|cryptos|other_assets|other_liabilities)\/[^/]+\/edit\/?$/u.test(
        url.pathname,
      )
    ) {
      void navigate({
        to: "/accounts/$accountId/edit",
        params: { accountId },
        search: { ...search, tab: "overview" },
        resetScroll: false,
      });
    } else if (url.pathname === `/accounts/${accountId}/sharing`) {
      void navigate({
        to: "/accounts/$accountId/sharing",
        params: { accountId },
        search: { ...search },
        resetScroll: false,
      });
    } else if (url.pathname === `/accounts/${accountId}/provider_replacement`) {
      void navigate({
        to: "/accounts/$accountId/provider_replacement",
        params: { accountId },
        search: {
          ...search,
          simplefin_account_id: url.searchParams.get("simplefin_account_id") ?? undefined,
          return_to: parseReturnTo(url.searchParams.get("return_to"), currentReturnTo()),
        },
        resetScroll: false,
      });
    } else if (url.pathname === "/account_statements") {
      void navigate({
        to: "/account_statements",
        search: {},
        resetScroll: false,
      });
    } else if (/^\/account_statements\/[0-9a-f-]{36}\/?$/u.test(url.pathname)) {
      const statementId = url.pathname.split("/")[2];
      void navigate({
        to: "/account_statements/$statementId",
        params: { statementId },
        resetScroll: false,
      });
    } else window.location.assign(url.href);
  };
  return (
    <>
      {pickingProvider ? (
        <AccountProviderPicker
          accountId={accountId}
          onClose={() => {
            setPickingProvider(false);
          }}
        />
      ) : null}
      {action.method === "get" ? (
        <Button
          variant="ghost"
          size={iconOnly ? "icon-sm" : "sm"}
          aria-label={iconOnly ? action.label : undefined}
          title={iconOnly ? action.label : undefined}
          className={buttonClass}
          disabled={disabled}
          onClick={() => {
            if (confirmation !== null && confirmation !== "") setConfirming(true);
            else follow();
          }}
        >
          {content}
        </Button>
      ) : (
        <Button
          aria-label={iconOnly ? action.label : undefined}
          className={buttonClass}
          disabled={disabled || mutation.isPending}
          onClick={() => {
            if (confirmation !== null && confirmation !== "") setConfirming(true);
            else mutation.mutate(action);
          }}
          title={iconOnly ? action.label : undefined}
          type="button"
          variant={action.method === "delete" ? "destructive-outline" : "ghost"}
          size={iconOnly ? "icon-sm" : "sm"}
        >
          {content}
        </Button>
      )}
      {confirming ? (
        <ConfirmSubmit
          label={action.label}
          message={confirmation ?? text.delete_confirm}
          text={text}
          onCancel={() => {
            setConfirming(false);
          }}
        >
          <Button
            disabled={mutation.isPending}
            variant={action.method === "delete" ? "destructive" : "primary"}
            onClick={() => {
              if (action.method === "get") {
                setConfirming(false);
                follow();
              } else mutation.mutate(action);
            }}
          >
            {action.label}
          </Button>
        </ConfirmSubmit>
      ) : null}
      {error !== null ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
export function AccountActionMenu({
  actions,
  label,
  accountId,
  search,
  text,
  iconOnly = false,
}: {
  actions: AccountAction[];
  label: string;
  accountId: AccountId;
  search: AccountSearch;
  text: Record<string, string>;
  iconOnly?: boolean;
}) {
  if (actions.length === 0) return null;
  return (
    <Menu as="div" className="relative">
      <MenuButton
        as={Button}
        variant={iconOnly ? "ghost" : "secondary"}
        size={iconOnly ? "icon-md" : "sm"}
        aria-label={label}
      >
        <Icon name={iconOnly ? "more-horizontal" : "plus"} />
        {iconOnly ? null : label}
      </MenuButton>
      <MenuItems
        unmount={false}
        className="shadow-border-lg absolute right-0 z-30 mt-2 min-w-52 rounded-lg bg-container py-1 focus:outline-none"
      >
        {actions.map((action) => (
          <MenuItem key={action.key} as="div" className="data-focus:bg-container-hover">
            <AccountActionControl
              action={action}
              accountId={accountId}
              search={search}
              text={text}
              compact
            />
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
}
