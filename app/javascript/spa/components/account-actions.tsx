import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState, type ReactNode } from "react";
import type { AccountAction, AccountSearch } from "../api/accounts";
import { readCsrfToken } from "../api/transactions";
import { CategoryIcon, Icon } from "../icon";
import type { AccountId } from "../ids";
import { Modal } from "../modal";
import { Button } from "./button";

export function CsrfFields({ method = "post" }: { method?: string }) {
  return (
    <>
      <input type="hidden" name="authenticity_token" value={readCsrfToken()} />
      {method !== "post" ? <input type="hidden" name="_method" value={method} /> : null}
    </>
  );
}
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
  const form = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);
  const confirmation = action.confirm ?? (action.method === "delete" ? text.delete_confirm : null);
  const content = (
    <>
      <CategoryIcon name={action.icon} />
      {iconOnly ? null : <span>{action.label}</span>}
    </>
  );
  const buttonClass = compact ? "w-full justify-start! rounded-none!" : undefined;
  const follow = () => {
    const url = new URL(action.href, window.location.origin);
    for (const [key, value] of Object.entries(action.params)) url.searchParams.set(key, value);
    if (url.pathname === `/accounts/${accountId}`) {
      void navigate({
        to: "/accounts/$accountId",
        params: { accountId },
        search: { ...search, ...action.params },
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
    } else window.location.assign(url.href);
  };
  return (
    <>
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
        <form
          ref={form}
          action={action.href}
          method="post"
          onSubmit={(event) => {
            if (confirmation !== null && confirmation !== "") {
              event.preventDefault();
              setConfirming(true);
            }
          }}
        >
          <CsrfFields method={action.method} />
          {Object.entries(action.params).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <Button
            type="submit"
            variant={action.method === "delete" ? "destructive-outline" : "ghost"}
            size={iconOnly ? "icon-sm" : "sm"}
            aria-label={iconOnly ? action.label : undefined}
            title={iconOnly ? action.label : undefined}
            disabled={disabled}
            className={buttonClass}
          >
            {content}
          </Button>
        </form>
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
            variant={action.method === "delete" ? "destructive" : "primary"}
            onClick={() => {
              setConfirming(false);
              if (action.method === "get") follow();
              else form.current?.submit();
            }}
          >
            {action.label}
          </Button>
        </ConfirmSubmit>
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
