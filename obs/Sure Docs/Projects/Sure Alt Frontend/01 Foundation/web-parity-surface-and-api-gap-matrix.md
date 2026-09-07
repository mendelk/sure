---
title: "Web parity surface and API gap matrix"
project: "Sure Alt Frontend / 01 Foundation"
task: "t_alt_fnd_001"
status: "authoritative-draft"
createdAt: "2026-09-07T00:00:00.000Z"
---

# Web parity surface and API gap matrix

Authoritative route-and-workflow inventory for self-hosted Sure web parity in the
Sure Alt Frontend program. Task: [[audit-web-parity-surface-and-api-gap-matrix|Audit web parity surface and API gap matrix]] (`t_alt_fnd_001`).

- **Scope:** every non-billing browser route and every existing system test, from
  `config/routes.rb`, `app/controllers`, `app/views`, `app/javascript/controllers`,
  and `test/system`. Super-admin surfaces are in scope. Hosted billing
  (`subscription`, Stripe webhooks, `settings/payment`) and native-client-only
  flows (desktop/mobile SSO handoff) are explicitly excluded with rationale.
- **Rule for supported rows:** no supported workflow may depend on rendering or
  redirecting to Rails HTML. Anything that can only work as Rails HTML is marked
  `EXCLUDE` with rationale, or `GAP` (required API extension).
- **Task-graph rule:** rows link to the owning task ID in this program. Where no
  task owns a required extension, the row links to a `GAP-API-*` entry and the gap
  is flagged in §8 instead of silently broadening another task.

## Method and reproducible verification

Inventory was built without booting Rails (no Ruby runtime in this environment),
directly from version-controlled sources. A reviewer can reproduce every claim:

```bash
# 1. Browser route sources (grouped resource + explicit routes)
rg -n "resources? |namespace |get |post |patch |put |delete |match |direct |mount " config/routes.rb
# 2. System tests under matrix accountability (25 files)
find test/system -name "*_test.rb" | sort
# 3. Existing OpenAPI operations (72 paths at time of writing)
python3 -c "import yaml; d=yaml.safe_load(open('docs/api/openapi.yaml')); print(len(d['paths'])); print('\n'.join(sorted(d['paths'])))"
# 4. API controllers backing the operations
ls app/controllers/api/v1/
# 5. Polling / realtime behavior sources
rg -ln "polling|setInterval|watchdog" app/javascript/controllers/
# 6. Destructive-confirmation sources
rg -c "confirm" app/views/ | sort
# 7. Coverage: every system test and every route resource cited in this matrix
python3 - <<'EOF'
import re, glob
m = open("obs/Sure Docs/Projects/Sure Alt Frontend/01 Foundation/web-parity-surface-and-api-gap-matrix.md").read().lower()
missing = [f for f in glob.glob("test/system/**/*_test.rb")
           if open(f).read().split("class ")[1].split("<")[0].strip().lower().replace("::"," ") .split()[0] not in m
           and f.split("/")[-1].replace("_test.rb","") not in m]
print("system tests missing from matrix:", missing or "NONE")
src = open("config/routes.rb").read()
names = set(re.findall(r"(?:resources|resource)\s+:(\w+)", src)) | set(re.findall(r"namespace\s+:(\w+)", src))
missing_r = sorted(n for n in names if n not in m)
print("route resources missing from matrix:", missing_r or "NONE")
EOF
```

Coverage result at commit time: **no system test and no route resource missing**
(see commit message for SHA; rerun command 7 after any routes change).

## Legend

- `SUPPORTED` — an existing versioned OpenAPI operation covers the workflow.
- `PARTIAL` — some operations exist; the row names the missing ones (`GAP-API-*`).
- `GAP` — a required API extension; the row names the `GAP-API-*` entry (§7).
- `EXCLUDE` — out of scope, with rationale in §8. Excluded rows need no API.
- Roles: `visitor` (unauthenticated), `member` (signed-in family user),
  `family_admin`, `super_admin`. All authenticated web routes additionally require
  an active family context unless noted.
- Behavior prefixes: `states:` empty/loading/error handling; `up/down:`
  uploads/downloads; `redir:` redirects; `poll:` polling/realtime; `confirm:`
  destructive confirmations.

## A. Unauthenticated entry, sessions, and recovery

| # | Workflow (browser routes) | Roles | Behavior notes | API mapping | Task | System test |
|---|---|---|---|---|---|---|
| A1 | Signup: `registration#new/create` | visitor | states: validation errors, invite-code/self-host gating (`ensure_signup_open`); redir: → onboarding after signup | `SUPPORTED` — `POST /api/v1/auth/signup` | [[implement-signup-recovery-and-sso-entry-flows|Implement signup, recovery, and SSO entry flows]] (`t_alt_set_005`) | `onboardings_test.rb` (post-signup path) |
| A2 | Login/logout/sessions: `sessions#index/new/create/destroy`, `current_session#update`, `password#edit/update` (signed-in password change) | visitor → member | states: invalid-credential + locked errors, session-list empty state; confirm: logout is a destructive-button pattern | `PARTIAL` — `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh` exist; session list/revoke and signed-in password change are `GAP-API-01` | [[implement-secure-login-refresh-and-logout-sessions|Implement secure login, refresh, and logout sessions]] (`t_alt_fnd_007`) + [[implement-password-email-and-session-management|Implement password, email, and session management]] (`t_alt_set_003`) | — (covered by request specs `auth_spec.rb`; no browser system test) |
| A3 | Passwordless passkey login: `passkey_sessions#options/create` (`POST /sessions/passkey_options`, `POST /sessions/passkey`) | visitor | states: device/no-credential errors; redir: → dashboard/onboarding on success | `GAP` — `GAP-API-02` (no passkey challenge/verify operations) | [[implement-mfa-and-passkey-management|Implement MFA and passkey management]] (`t_alt_set_004`) | — (no system test) |
| A4 | Password reset: `password_reset#new/create/edit/update` | visitor | states: unknown-email (deliberately generic), expired-token error; redir: token link → reset form → login | `GAP` — `GAP-API-03` | [[implement-password-email-and-session-management|Implement password, email, and session management]] (`t_alt_set_003`) | — (no system test) |
| A5 | Email confirmation: `email_confirmation#new`, `users#resend_confirmation_email` | visitor/member | states: expired/invalid token; redir: → login or onboarding | `GAP` — `GAP-API-03` (same capability group) | [[implement-password-email-and-session-management|Implement password, email, and session management]] (`t_alt_set_003`) | — (no system test) |
| A6 | SSO/OIDC entry: `/auth/:provider/callback`, `/auth/failure`, `/auth/logout/callback`, `oidc_account#link/create_link/new_user/create_user` | visitor → member | redir: IdP round-trips stay server-side; failure → login with error; new-user → onboarding | `PARTIAL` — `POST /api/v1/auth/sso_exchange`, `sso_link`, `sso_create_account` exist; browser dance itself is BFF/server-side, never Rails-HTML-in-app | [[implement-signup-recovery-and-sso-entry-flows|Implement signup, recovery, and SSO entry flows]] (`t_alt_set_005`) + [[implement-hardened-sure-api-bff-transport|Implement hardened Sure API BFF transport]] (`t_alt_fnd_005`) | `onboardings_test.rb` (callback visit) |
| A7 | Desktop/mobile SSO handoff: `POST /sessions/desktop_exchange`, `GET /auth/desktop/:provider`, `GET /auth/mobile/:provider` | native clients | redir: `sure://` scheme handoff | `EXCLUDE` — native-client work, out of web parity scope (§8) | — | — |
| A8 | Invitation accept: `invitations#accept` (member route) | visitor | states: expired/revoked invite; redir: → signup or login prefilled | `GAP` — `GAP-API-04` (accept via token) | [[implement-family-membership-invitations-and-sharing|Implement family membership, invitations, and sharing]] (`t_alt_set_007`) | — (no system test; gap flagged, not broadened) |
| A9 | Public/static pages: `pages#privacy/terms` (or `LEGAL_*_URL` redirect), `pages#intro`, `pages#changelog`, `pages#feedback`, `pages#redis_configuration_error`, `up` health check | visitor (+ member for changelog/feedback) | redir: privacy/terms redirect to env URLs when set; states: static, no loading | `SUPPORTED` — no API needed (static/BFF content + load-balancer health); privacy-by-design strings via i18n | [[build-responsive-app-shell-and-route-guards|Build responsive app shell and route guards]] (`t_alt_fnd_010`) + [[add-localization-theme-and-privacy-foundations|Add localization, theme, and privacy foundations]] (`t_alt_fnd_011`) + [[add-structured-logging-health-and-error-handling|Add structured logging, health, and error handling]] (`t_alt_fnd_014`) | — (no system test) |
| A10 | Internal SureQL console: `dashboard/monarch`, `monarch_compile`, `monarch_run` | member | returns server-rendered HTML rows (`monarch_results_html`) | `EXCLUDE` — internal experiment; HTML-row payload violates the no-Rails-HTML rule (§8) | — | — |
| A11 | PWA shell: `pwa#service_worker`, `pwa#manifest`; push: `push_subscriptions#create/destroy` | visitor/member | states: offline fallback, update-prompt; poll: none (push-based) | `SUPPORTED` — `POST/DELETE /api/v1/push_subscriptions[/{id}]` + static manifest/SW via BFF | [[add-installable-resilient-pwa-foundation|Add installable resilient PWA foundation]] (`t_alt_fnd_013`) + [[add-web-push-notifications|Add web push notifications]] (`t_alt_auto_006`) | — (no system test) |
| A12 | OAuth provider + machine endpoints: `.well-known/*`, `oauth_registration#create`, Doorkeeper authorizations, `POST /mcp`, `webhooks/*` (plaid/plaid_eu/stripe) | third-party/server callers | confirm: Doorkeeper consent screen (approve/deny) | `EXCLUDE` — server-to-server/machine surface; browser consent stays Rails-hosted (§8) | — | — |

## B. Onboarding (gated new-user flows)

| # | Workflow (browser routes) | Roles | Behavior notes | API mapping | Task | System test |
|---|---|---|---|---|---|---|
| B1 | Onboarding funnel: `onboarding#show`, `preferences_onboarding`, `goals_onboarding`, `trial_onboarding` | member (gated: incomplete profile) | states: gated redirects until complete; redir: → dashboard when done | `GAP` — `GAP-API-05` (onboarding state + step completion) | [[implement-new-user-onboarding|Implement new-user onboarding]] (`t_alt_set_009`) | `onboardings_test.rb` |
| B2 | MFA setup during auth: `mfa#new/create/verify/verify_code/webauthn_options/verify_webauthn/disable`; settings-side passkeys: `settings/webauthn_credentials#create/destroy/options` | member | states: invalid-code, fallback between TOTP/WebAuthn; confirm: disable is destructive | `GAP` — `GAP-API-06` | [[implement-mfa-and-passkey-management|Implement MFA and passkey management]] (`t_alt_set_004`) | — (no system test) |

## C. Core shell, dashboard, accounts, and net worth

| # | Workflow (browser routes) | Roles | Behavior notes | API mapping | Task | System test |
|---|---|---|---|---|---|---|
| C1 | Dashboard root: `pages#dashboard` (`/`), `pages#update_preferences` (`PATCH dashboard/preferences`) | member | states: empty-family, loading skeletons, sync-error banner; poll: sync progress toast (`sync_toast_controller`) | `PARTIAL` — `GET /api/v1/balance_sheet`, `GET /api/v1/balances`, `GET /api/v1/insights` exist; dashboard preferences/order are `GAP-API-07` | [[define-core-dashboard-api-contract|Define core dashboard API contract]] (`t_alt_beta_001`) + [[compose-responsive-core-dashboard|Compose responsive core dashboard]] (`t_alt_beta_010`) | `account_activity_test.rb` (root visits), `transaction_drawer_navigation_test.rb` |
| C2 | Account hub + detail: `accounts#index/new/show/destroy`, `account#sync/sync_all/sparkline`, `toggle_active`, `toggle_exclude_from_reports`, `set_default/remove_default`, `select_provider`, `confirm_unlink/unlink`, `account_sharings#show/update` | member (+ family_admin for sharing) | states: per-account sync spinners, empty activity/holdings tabs; confirm: unlink + delete pages; redir: `select_provider` → provider link flow | `PARTIAL` — `GET/POST /api/v1/accounts`, `GET /api/v1/accounts/{id}` exist; update/delete/sync/toggles/default/sharing are `GAP-API-08` | [[complete-account-management-api|Complete account management API]] (`t_alt_fin_001`) + [[implement-account-summary-navigation|Implement account summary navigation]] (`t_alt_beta_002`) + [[build-account-detail-activity-and-balance-history|Build account detail, activity, and balance history]] (`t_alt_fin_003`) + [[implement-sync-trigger-and-progress-ui|Implement sync trigger and progress UI]] (`t_alt_beta_009`) | `accounts_test.rb`, `accounts_sync_ui_test.rb`, `account_activity_test.rb` |
| C3 | Manual account forms (all types): `depositories/investments/properties/vehicles/credit_cards/loans/cryptos/other_assets/other_liabilities#new/create/edit/update`; `properties#balances/update_balances/address/update_address` | member | states: per-type validation errors; confirm: none (forms) | `GAP` — `GAP-API-08` (same group; typed accountables) | [[build-manual-account-forms-for-all-account-types|Build manual account forms for all account types]] (`t_alt_fin_002`) + [[complete-account-management-api|Complete account management API]] (`t_alt_fin_001`) | `property_test.rb` |
| C4 | Net-worth trends + helpers: `accountable_sparklines#show`, `exchange_rates#show`, `currencies#show` | member | states: missing-price gaps in sparkline series | `PARTIAL` — `GET /api/v1/balances[/{id}]`, `GET /api/v1/security_prices[/{id}]` exist; FX/sparkline helpers are `GAP-API-09` (minor; scope decision in owning task) | [[build-net-worth-and-balance-trends|Build net worth and balance trends]] (`t_alt_beta_003`) + [[evaluate-tanstack-charts-for-sure-visualizations|Evaluate TanStack Charts for Sure visualizations]] (`t_alt_fnd_016`) | `accounts_sync_ui_test.rb` (sparkline), `transactions_form_exchange_rate_test.rb` |
| C5 | Account statements: `account_statements#index/show/create/update/destroy`, `link/unlink/reject` | member | states: unmatched-statement queue; up/down: statement file upload on create; confirm: reject | `GAP` — `GAP-API-10` | [[implement-account-statement-workflows|Implement account statement workflows]] (`t_alt_fin_004`) | — (no system test; gap flagged) |

## D. Transactions, transfers, and recurring automation

| # | Workflow (browser routes) | Roles | Behavior notes | API mapping | Task | System test |
|---|---|---|---|---|---|---|
| D1 | Transaction browsing: `transactions#index/show`, `update_preferences`, drawer navigation, search/filter | member | states: empty search, loading rows, sync-error; poll: none (Turbo frames) | `SUPPORTED` — `GET /api/v1/transactions[/{id}]` | [[complete-transaction-list-contract|Complete transaction list contract]] (`t_alt_beta_004`) + [[build-transaction-browsing-route|Build transaction browsing route]] (`t_alt_beta_005`) | `transactions_test.rb`, `transaction_drawer_navigation_test.rb` |
| D2 | Transaction create/edit/delete: `transactions#new/create/update/destroy`, `convert_to_trade`, `create_trade_from_transaction`, `unlock`, `mark_as_recurring` | member | states: locked (reconciled) entries need unlock; confirm: delete | `PARTIAL` — `POST/PATCH/DELETE /api/v1/transactions[/{id}]` exist; convert-to-trade/recurring-mark are `GAP-API-11` | [[implement-transaction-create-edit-and-delete|Implement transaction create, edit, and delete]] (`t_alt_beta_006`) | `transactions_test.rb`, `transactions_form_exchange_rate_test.rb` |
| D3 | Category/tag/merchant editing + rule bootstrap: `transaction_categories#update`, `transfers/tags`, `transactions/tags`, merchant rule menu → `rules#new` prefilled | member | states: uncategorized queue; typeahead selects | `SUPPORTED` — transaction `PATCH`, `GET /api/v1/categories`, `GET/POST /api/v1/tags`, `GET/POST /api/v1/merchants` | [[implement-transaction-category-tag-and-merchant-editing|Implement transaction category, tag, and merchant editing]] (`t_alt_beta_007`) | `transaction_category_select_test.rb`, `transactions_test.rb` ("category rule from merchant") |
| D4 | Splits: `split#new/create/edit/update/destroy` (nested) | member | states: remainder-must-zero validation | `PARTIAL` — `POST /api/v1/transactions/{transaction_id}/split` exists; edit/update/destroy split are `GAP-API-11` | [[implement-transaction-split-workflow|Implement transaction split workflow]] (`t_alt_beta_008`) | — (no dedicated system test) |
| D5 | Transfer matching + duplicates: `transfer_match#new/create`, `pending_duplicate_merges#new/create`, `merge_duplicate`, `dismiss_duplicate` | member | states: candidate-match lists, no-match empty state; confirm: merge is destructive | `GAP` — `GAP-API-11` (match/merge operations; `GET /api/v1/rejected_transfers[/{id}]` read exists) | [[implement-transfer-management-parity|Implement transfer management parity]] (`t_alt_fin_009`) | `transfers_test.rb` |
| D6 | Bulk + assisted ops: `transactions/bulk_deletion#create`, `bulk_update#new/create`, `categorize#show/create/assign_entry/preview_rule` | member | states: selection-count, preview-before-apply; confirm: bulk delete | `GAP` — `GAP-API-12` (no bulk/preview operations; flagged ownerless — closest is `t_alt_beta_004`, scope decision required, §8) | [[complete-transaction-list-contract|Complete transaction list contract]] (`t_alt_beta_004`) — scope TBD, see §8 | `transactions_test.rb` (bulk paths), `transaction_category_select_test.rb` |
| D7 | Receipt attachments: `transaction_attachments#show/create/destroy` | member | up/down: ActiveStorage upload (count/type validation), inline vs attachment download (redirects to blob URL) | `GAP` — `GAP-API-13` (no attachment operations; flagged ownerless — closest is `t_alt_beta_006`, §8) | [[implement-transaction-create-edit-and-delete|Implement transaction create, edit, and delete]] (`t_alt_beta_006`) — scope TBD, see §8 | — (no system test) |
| D8 | Transfers: `transfers#new/create/destroy/show/update`, `mark_as_recurring`, `tags` | member | states: unmatched-transfer review; confirm: delete | `PARTIAL` — `GET /api/v1/transfers[/{id}]` exist; write ops are `GAP-API-14` | [[implement-transfer-management-parity|Implement transfer management parity]] (`t_alt_fin_009`) | `transfers_test.rb` |
| D9 | Recurring: `recurring_transactions#index/destroy/identify/cleanup/update_settings/toggle_status` | member | states: candidate-detection review; confirm: delete; poll: none | `PARTIAL` — full CRUD exists (`GET/POST/PATCH/DELETE /api/v1/recurring_transactions[/{id}]`); identify/cleanup/settings are `GAP-API-15` | [[implement-recurring-transaction-automation|Implement recurring transaction automation]] (`t_alt_auto_001`) | — (no system test) |

## E. Categories, tags, merchants, budgets, goals, plan

| # | Workflow (browser routes) | Roles | Behavior notes | API mapping | Task | System test |
|---|---|---|---|---|---|---|
| E1 | Categories: `categories` (except show) + `merge/perform_merge/bootstrap/destroy_all`, `category/deletions#new/create`, `category/dropdown#show` | member (+ family_admin for destroy_all) | states: uncategorized fallback; confirm: merge + destroy_all + reassignment delete | `PARTIAL` — `GET/POST /api/v1/categories[/{id}]` exist; update/delete/merge/bootstrap are `GAP-API-16` | [[complete-category-tag-and-merchant-management|Complete category, tag, and merchant management]] (`t_alt_fin_011`) | `categories_test.rb` |
| E2 | Tags: `tags` (except show) + `tag/deletions#new/create`, `destroy_all` | member | confirm: reassignment delete, destroy_all | `SUPPORTED` — full CRUD exists | [[complete-category-tag-and-merchant-management|Complete category, tag, and merchant management]] (`t_alt_fin_011`) | `transactions_test.rb` (tagged fixture path) |
| E3 | Merchants: `family_merchants#index/new/create/edit/update/destroy`, `merge/perform_merge`, `enhance` | member | states: unenriched-merchant queue; confirm: merge + delete | `PARTIAL` — CRUD + `POST /api/v1/merchants/import` exist; merge/enhance are `GAP-API-16` | [[complete-category-tag-and-merchant-management|Complete category, tag, and merchant management]] (`t_alt_fin_011`) | — (no system test) |
| E4 | Budgets + plan hub: `budgets#index/show/edit/update`, `copy_previous`, `picker`, `budget_categories#index/show/update/move`, `plan#show` | member | states: unbudgeted-month, overspent; confirm: none | `PARTIAL` — `GET /api/v1/budgets[/{id}]`, `GET /api/v1/budget_categories[/{id}]` exist; all writes + copy/move are `GAP-API-17` | [[complete-budget-write-api|Complete budget write API]] (`t_alt_fin_012`) + [[build-responsive-budget-planning-ui|Build responsive budget planning UI]] (`t_alt_fin_013`) + [[compose-plan-hub|Compose plan hub]] (`t_alt_fin_016`) | — (no system test) |
| E5 | Goals + pledges: `goals` (full CRUD) + `pause/resume/complete/archive/unarchive/reopen/consume/record_consumption`, `goal_pledges#new/create/destroy/renew` | member | states: gated behind preview (`goals_onboarding` redirect); confirm: delete goal/pledge | `GAP` — `GAP-API-18` (no goals/pledges operations at all) | [[add-goals-and-pledges-api|Add goals and pledges API]] (`t_alt_fin_014`) + [[build-goals-planning-ui|Build goals planning UI]] (`t_alt_fin_015`) | `goals_form_test.rb`, `onboardings_test.rb` (goals gate) |
| E6 | Reports + exports: `reports#index/update_preferences/export_transactions/google_sheets_instructions/print/picker` | member | down: CSV export download; redir: external Sheets docs | `GAP` — `GAP-API-19` (report preferences + transaction export EPR; Sheets instructions stay external link) | [[implement-reports-and-export-tools|Implement reports and export tools]] (`t_alt_fin_010`) | — (no system test) |

## F. Investments: holdings, trades, valuations, securities

| # | Workflow (browser routes) | Roles | Behavior notes | API mapping | Task | System test |
|---|---|---|---|---|---|---|
| F1 | Holdings: `holdings#index/new/show/update/destroy`, `unlock_cost_basis`, `remap_security`, `reset_security`, `sync_prices` | member | states: unknown-security queue; confirm: reset | `PARTIAL` — `GET /api/v1/holdings[/{id}]` exist; writes + remap/sync are `GAP-API-20` | [[implement-holdings-management-parity|Implement holdings management parity]] (`t_alt_fin_005`) | `account_activity_test.rb` (holdings tab) |
| F2 | Trades: `trades#show/new/create/update/destroy`, `unlock` | member | states: locked entries; confirm: delete | `SUPPORTED` — full CRUD exists | [[implement-trade-management-ui|Implement trade management UI]] (`t_alt_fin_006`) | `trades_test.rb` |
| F3 | Valuations: `valuations#show/new/create/update/destroy`, `confirm_create`, `confirm_update` | member | confirm: out-of-band confirm pages for create/update | `PARTIAL` — `GET/POST/PATCH /api/v1/valuations[/{id}]` exist; delete is `GAP-API-21` (minor) | [[implement-valuation-management-parity|Implement valuation management parity]] (`t_alt_fin_007`) | — (no system test) |
| F4 | Securities + prices: `securities#index`, `settings/securities` (show) | member | states: missing-price; down: none | `SUPPORTED` — `GET /api/v1/securities[/{id}]`, `GET /api/v1/security_prices[/{id}]` | [[implement-securities-and-price-history-ui|Implement securities and price history UI]] (`t_alt_fin_008`) | — (no system test) |

## G. Imports, exports, sync jobs, AI, and rules

| # | Workflow (browser routes) | Roles | Behavior notes | API mapping | Task | System test |
|---|---|---|---|---|---|---|
| G1 | Import wizard: `imports#index/new/show/create/update/destroy`, `publish/revert/apply_template/cancel/summary`, nested `upload/configuration/clean/confirm/qif_category_selection/rows/mappings`, `import_upload_sample_csv` | member | up: CSV/file upload + drag-and-drop; states: column-map, clean, confirm steps; confirm: publish + revert + cancel | `PARTIAL` — `GET/POST /api/v1/imports[/{id}]`, `preflight`, `rows`, `POST /api/v1/import_sessions[/{id}[/chunks/publish]]` exist; revert/apply-template/cancel/mappings are `GAP-API-22` | [[complete-import-session-api|Complete import session API]] (`t_alt_ing_014`) + [[build-resumable-import-wizard|Build resumable import wizard]] (`t_alt_ing_015`) | `imports_test.rb`, `drag_and_drop_import_test.rb` |
| G2 | Family exports: `family_exports#new/create/index/destroy`, `download`, `cancel`; `archived_exports#show` (token link) | member (+ family_admin for destroy) | down: export file download + tokenized archive link; poll: `polling_controller` on pending/processing exports; confirm: cancel + delete | `PARTIAL` — `GET/POST /api/v1/family_exports[/{id}[/download]]` exist; cancel is `GAP-API-23` | [[complete-family-export-lifecycle-api|Complete family export lifecycle API]] (`t_alt_ing_016`) + [[build-family-export-ui|Build family export UI]] (`t_alt_ing_017`) | — (no system test; polling covered by `polling_controller.js`) |
| G3 | Sync jobs: `syncs#cancel`, `settings/background_jobs#show/cancel` | member | poll: sync progress UI; confirm: cancel | `PARTIAL` — `GET /api/v1/syncs[/{id}/latest]`, `POST /api/v1/sync` exist; cancel is `GAP-API-24` | [[implement-sync-trigger-and-progress-ui|Implement sync trigger and progress UI]] (`t_alt_beta_009`) + [[implement-hosting-debug-and-background-job-settings|Implement hosting, debug, and background job settings]] (`t_alt_set_008`) | `accounts_sync_ui_test.rb` |
| G4 | AI chat: `chats` (CRUD) + `messages#create/report_timeout`, `chats#retry` | member | poll: `chat_controller` watchdog (5s) + `report_timeout` for wedged "Thinking…" bubbles; states: streaming/error/failed | `SUPPORTED` — `CRUD /api/v1/chats[/{id}]`, `POST messages`, `POST messages/retry` | [[implement-resilient-ai-chat|Implement resilient AI chat]] (`t_alt_auto_004`) | `chats_test.rb` |
| G5 | Rules: `rules` (except show) + `confirm/apply/destroy_all/confirm_all/apply_all/clear_ai_cache` | member | states: dry-run confirm before apply; confirm: apply + destroy_all | `PARTIAL` — `GET /api/v1/rules[/{id}]`, `GET /api/v1/rule_runs[/{id}]` exist; all writes + apply flows are `GAP-API-25` | [[implement-rules-authoring-and-execution|Implement rules authoring and execution]] (`t_alt_auto_002`) | `rules_test.rb` |
| G6 | Insights: `insights#index`, `refresh`, `acknowledge/unacknowledge` | member | states: empty (all clear), refresh spinner; poll: none | `PARTIAL` — `GET /api/v1/insights` exists; refresh/ack are `GAP-API-26` | [[implement-insights-workflows|Implement insights workflows]] (`t_alt_auto_003`) | — (no system test) |
| G7 | AI settings + usage: `settings/ai_prompts#show`, `settings/llm_usages#show`, `users#rule_prompt_settings`, `auth#enable_ai` (`PATCH auth/enable_ai`) | member (+ family_admin for prompts) | states: usage quota display; confirm: none | `PARTIAL` — `PATCH /api/v1/auth/enable_ai` exists; prompts/usage read are `GAP-API-27` | [[implement-ai-settings-prompts-and-usage|Implement AI settings, prompts, and usage]] (`t_alt_auto_005`) | `settings/ai_prompts_test.rb` |

## H. Provider connections (all `*_items` + settings provider surfaces)

One state-machine family per provider, fronted by `settings/providers#show/update`,
`sync_all`, per-provider `sync`, `connect_form`, and the legacy `bank_sync` 301 to
`/settings/providers`. Web flows use Turbo + provider JS (`plaid_controller`,
`sophtron` MFA submit, `lunchflow_preload_controller`); sync progress reuses the
sync toast/polling pattern (no Rails-HTML dependency for supported rows).

| # | Workflow (browser routes) | Roles | Behavior notes | API mapping | Task | System test |
|---|---|---|---|---|---|---|
| H1 | Provider catalog + settings: `settings/providers#show/update`, `sync_all`, `sync`, `connect_form`; `GET settings/bank_sync` → 301 `/settings/providers` | member | states: per-provider status panels, empty (no connections); redir: bank_sync 301; poll: sync progress | `PARTIAL` — `GET /api/v1/provider_connections` exists; connection CRUD/sync/connect-form schema are `GAP-API-28` | [[define-reusable-provider-connection-api-contract|Define reusable provider connection API contract]] (`t_alt_ing_004`) + [[add-provider-management-api|Add provider management API]] (`t_alt_ing_002`) + [[build-provider-catalog-and-settings-ui|Build provider catalog and settings UI]] (`t_alt_ing_003`) + [[inventory-provider-connection-state-machines|Inventory provider connection state machines]] (`t_alt_ing_001`) | `settings/providers_test.rb` |
| H2 | SimpleFIN: `simplefin_items#index/new/create/show/edit/update/destroy`, `select_existing_account/link_existing_account`, `sync`, `balances`, `setup_accounts/complete_account_setup`, `dismiss_replacement_suggestion` | member | states: claim-token, replacement suggestion; confirm: delete; poll: sync | `GAP` — `GAP-API-28` (first implementation) | [[implement-simplefin-connection|Implement SimpleFIN connection]] (`t_alt_ing_007`) | `settings/providers_test.rb` (SimpleFIN panel) |
| H3 | Plaid + Enable Banking: `plaid_items#new/edit/create/destroy` + link-existing + `sync`; `enable_banking_items#new/create/update/destroy` + `callback`, `link_accounts`, `select_bank`, `authorize/reauthorize`, `new_connection` + setup/sync | member | redir: bank OAuth callbacks (`callback`); states: reauthorize-required; confirm: delete | `GAP` — `GAP-API-28` | [[implement-plaid-and-enable-banking-connections|Implement Plaid and Enable Banking connections]] (`t_alt_ing_005`) | — (no system test) |
| H4 | SnapTrade: `snaptrade_items#index/show/destroy` + `callback/oauth_authorize/oauth_callback/oauth_device_authorize/start_oauth_device_flow`, `connect`, `connections`, `complete_oauth_device_flow`, `delete_connection` + setup/sync | member | redir: OAuth + device-code flows; confirm: delete connection | `GAP` — `GAP-API-28` | [[implement-snaptrade-connection-flows|Implement SnapTrade connection flows]] (`t_alt_ing_006`) | — (no system test) |
| H5 | Exchange + CoinStats: `coinbase_items` / `binance_items` (full link flow + setup/sync), `kraken_items#create/update/destroy` + link/sync, `coinstats_items#index/new/create/update/destroy` + `link_wallet/link_exchange` + `sync` | member | states: API-key validation errors; confirm: delete | `GAP` — `GAP-API-28` | [[implement-exchange-and-coinstats-connections|Implement exchange and CoinStats connections]] (`t_alt_ing_008`) | — (no system test) |
| H6 | Brokerage (OAuth/device): `questrade_items`, `indexa_capital_items`, `mercury_items` (full link + setup/sync); `ibkr_items#create/update/destroy` + link/sync; `trading212_items#create/update/destroy` + link/sync | member | redir: broker OAuth authorize/callback; confirm: delete | `GAP` — `GAP-API-28` | [[implement-brokerage-provider-connections|Implement brokerage provider connections]] (`t_alt_ing_009`) | — (no system test) |
| H7 | Business finance: `wise_items` (+ `select_profiles/link_profiles`), `brex_items` (via `brex_items/account_flows` + `account_setups`) + setup/sync | member | states: profile/account selection steps; confirm: delete | `GAP` — `GAP-API-28` | [[implement-business-finance-provider-connections|Implement business finance provider connections]] (`t_alt_ing_010`) | — (no system test) |
| H8 | Akahu + Redbark: `akahu_items` (full link + setup/sync); `redbark_items#create/update/destroy` + link/sync | member | states: API-key errors; confirm: delete | `GAP` — `GAP-API-28` | [[implement-akahu-and-redbark-connections|Implement Akahu and Redbark connections]] (`t_alt_ing_011`) | — (no system test) |
| H9 | Sophtron challenge: `sophtron_items` (full link + setup/sync) + `connect_institution/toggle_manual_sync/balances/connection_status/submit_mfa` | member | states: MFA/security-question challenge (`submit_mfa`), connection-status; poll: status check | `GAP` — `GAP-API-28` | [[implement-sophtron-challenge-flow|Implement Sophtron challenge flow]] (`t_alt_ing_012`) | — (no system test) |
| H10 | On-chain wallets: `onchain_wallet_items#update/destroy` + `new_wallet/preview_wallet/link_wallet/enable_crypto_prices`, `manage/review_tokens/update_tokens/disconnect_wallet/disconnect_asset` + `sync` | member | states: address-preview before link; confirm: disconnect wallet/asset, delete | `GAP` — `GAP-API-28` | [[implement-on-chain-wallet-connections|Implement on-chain wallet connections]] (`t_alt_ing_013`) | `onchain_wallets_test.rb` |
| H11 | Lunchflow + Up: `lunchflow_items` / `up_items` (full link + setup/sync) | member | redir: provider authorize; confirm: delete | `GAP` — `GAP-API-28` | [[implement-lunchflow-and-up-connections|Implement Lunchflow and Up connections]] (`t_alt_v2p_001`) | — (no system test) |

## I. Settings, identity, family, and developer surfaces

| # | Workflow (browser routes) | Roles | Behavior notes | API mapping | Task | System test |
|---|---|---|---|---|---|---|
| I1 | Profile/preferences/appearance: `settings/profile#show/destroy`, `settings/preferences#show/update`, `settings/budget_shares#update`, `settings/appearance#show/update` | member | states: validation errors; confirm: profile destroy (account deletion guarded → I3) | `PARTIAL` — `GET /api/v1/family_settings` exists; profile/preferences/appearance writes are `GAP-API-29` | [[define-identity-capabilities-and-settings-contract|Define identity capabilities and settings contract]] (`t_alt_set_001`) + [[implement-profile-preferences-and-appearance|Implement profile, preferences, and appearance]] (`t_alt_set_002`) | `settings_test.rb` |
| I2 | API keys + MCP: `settings/api_keys#index/show/new/create/destroy`, `settings/mcp#show/revoke` | member (+ family_admin for create) | states: one-time secret reveal (create only); confirm: revoke/delete | `GAP` — `GAP-API-30` | [[implement-api-key-and-mcp-settings|Implement API key and MCP settings]] (`t_alt_set_006`) | `settings/api_keys_test.rb` |
| I3 | Guarded reset + deletion: `users#update/destroy/reset/reset_with_sample_data`, `users/reset/status` page flow | member (self) / family_admin | confirm: multi-step guarded reset + delete (sample-data variant for demos); states: reset progress | `PARTIAL` — `DELETE /api/v1/users/reset`, `GET /api/v1/users/reset/status`, `DELETE /api/v1/users/me` exist; update + sample-data reset are `GAP-API-31` | [[implement-guarded-reset-and-account-deletion|Implement guarded reset and account deletion]] (`t_alt_set_014`) | — (no system test) |
| I4 | Family + sharing + linked SSO: `invitations#new/create/destroy`, `account_sharings` via accounts (C2), `settings/sso_identities#destroy`, `settings/security#show` hub | family_admin (+ member read for sharing) | states: pending-invite list; confirm: revoke invite, unlink SSO identity | `GAP` — `GAP-API-04` (invite lifecycle) | [[implement-family-membership-invitations-and-sharing|Implement family membership, invitations, and sharing]] (`t_alt_set_007`) | — (no system test) |
| I5 | Hosting/debug/jobs: `settings/hosting#show/update/clear_cache/disconnect_external_assistant`, `settings/debug#show`, `settings/background_jobs#show/cancel`, `settings/guides#show` | family_admin (hosting/debug), member (guides) | states: cache/external-assistant status; confirm: clear cache, disconnect assistant, cancel job | `GAP` — `GAP-API-32` | [[implement-hosting-debug-and-background-job-settings|Implement hosting, debug, and background job settings]] (`t_alt_set_008`) | — (no system test) |
| I6 | Design-system overlay (test harness only): exercised by `ds_overlay_morph_test.rb`, Lookbook at `/design-system` (non-production) | developer | states: overlay morph transitions | `EXCLUDE` — dev/test harness, not product surface (§8) | [[build-accessible-ui-primitives-and-storybook|Build accessible UI primitives and Storybook]] (`t_alt_fnd_009`) tracks the real primitive work | `ds_overlay_morph_test.rb` |

## J. Super-admin surfaces (`admin/*`, invite codes, impersonation)

All rows require `super_admin` (`Admin::BaseController#require_super_admin!`,
`SuperAdminConstraint` for Sidekiq Web, `ensure_super_admin` for invite codes).

| # | Workflow (browser routes) | Roles | Behavior notes | API mapping | Task | System test |
|---|---|---|---|---|---|---|
| J1 | Admin users: `admin/users#index/update/destroy`, `deletion` confirm | super_admin | states: last-super-admin demote guard (blocked with alert); confirm: deletion page | `GAP` — `GAP-API-33` | [[define-super-admin-api-and-authorization|Define super-admin API and authorization]] (`t_alt_set_010`) + [[implement-admin-user-family-and-invitation-management|Implement admin user, family, and invitation management]] (`t_alt_set_011`) | `admin_user_removals_test.rb` |
| J2 | Admin families + invitations: `admin/families#destroy`, `admin/invitations#destroy/destroy_all` | super_admin | confirm: destroy family + destroy-all invites | `GAP` — `GAP-API-33` | [[implement-admin-user-family-and-invitation-management|Implement admin user, family, and invitation management]] (`t_alt_set_011`) | `admin_user_removals_test.rb` (family/user removal) |
| J3 | Admin SSO + identity blocks: `admin/sso_providers` (CRUD) + `toggle/test_connection`, `admin/sso_identity_blocks#destroy` | super_admin | states: connection-test result; confirm: delete block/provider | `GAP` — `GAP-API-33` | [[implement-admin-sso-provider-and-identity-block-management|Implement admin SSO provider and identity block management]] (`t_alt_set_012`) | — (no system test) |
| J4 | Admin health + queues: `admin/system_health#show`, Sidekiq Web (`/sidekiq`, super-admin-gated outside dev) | super_admin | poll: queue/latency refresh on health page | `PARTIAL` — health/queue read is `GAP-API-34`; Sidekiq Web itself is `EXCLUDE` (break-glass Rails UI stays mounted; alt frontend uses the API-driven view, §8) | [[implement-admin-system-health-and-queue-tools|Implement admin system health and queue tools]] (`t_alt_set_013`) | `admin/system_health_test.rb` |
| J5 | Impersonation: `impersonation_sessions#create/join/leave/approve/reject/complete` | super_admin (+ impersonated member context after join) | states: pending-approval queue; confirm: join/leave/complete session transitions | `GAP` — `GAP-API-35` | [[implement-admin-impersonation-sessions|Implement admin impersonation sessions]] (`t_alt_set_016`) | — (no system test) |
| J6 | Invite codes (self-hosted): `invite_codes#index/create/destroy` (`ensure_self_hosted` + `ensure_super_admin`) | super_admin | confirm: revoke code | `GAP` — `GAP-API-33` (same admin group) | [[implement-admin-user-family-and-invitation-management|Implement admin user, family, and invitation management]] (`t_alt_set_011`) | — (no system test) |

## §7. Required API extension register

Each entry is the smallest versioned-API addition that unblocks the linked rows.
Status `owned` means a program task already covers it; `flagged` means §8 must
resolve ownership before implementation.

| Gap ID | Extension | Consuming rows | Owning task / status |
|---|---|---|---|
| GAP-API-01 | Session list/revoke + signed-in password change | A2 | `t_alt_set_003` — owned |
| GAP-API-02 | Passkey challenge options + verification (login) | A3 | `t_alt_set_004` — owned |
| GAP-API-03 | Password-reset + email-confirm request/confirm | A4, A5 | `t_alt_set_005`/`t_alt_set_003` — owned |
| GAP-API-04 | Invitation lifecycle (create/list/revoke/accept-by-token) | A8, I4 | `t_alt_set_007` — owned |
| GAP-API-05 | Onboarding state + step completion | B1 | `t_alt_set_009` — owned |
| GAP-API-06 | MFA enroll/verify/disable (TOTP + WebAuthn) | B2 | `t_alt_set_004` — owned |
| GAP-API-07 | Dashboard preferences (layout/order) | C1 | `t_alt_beta_001` — owned |
| GAP-API-08 | Account write ops (typed accountables, toggles, default, sharing, unlink) | C2, C3 | `t_alt_fin_001`/`t_alt_fin_002` — owned |
| GAP-API-09 | FX rate + sparkline helpers | C4 | `t_alt_beta_003` — owned (minor scope decision) |
| GAP-API-10 | Statement upload/list/link workflow | C5 | `t_alt_fin_004` — owned |
| GAP-API-11 | Transaction write completions (convert-to-trade, recurring-mark, split edit/delete, match/merge) | D2, D4, D5 | `t_alt_beta_006`/`t_alt_beta_008`/`t_alt_fin_009` — owned |
| GAP-API-12 | Bulk delete/update + categorize preview/assign | D6 | **flagged** — closest `t_alt_beta_004`; needs scope decision, §8 |
| GAP-API-13 | Receipt attachments (upload/list/delete) | D7 | **flagged** — closest `t_alt_beta_006`; needs scope decision, §8 |
| GAP-API-14 | Transfer write ops | D8 | `t_alt_fin_009` — owned |
| GAP-API-15 | Recurring identify/cleanup/settings | D9 | `t_alt_auto_001` — owned |
| GAP-API-16 | Category/tag/merchant merge + bootstrap + enhance | E1, E3 | `t_alt_fin_011` — owned |
| GAP-API-17 | Budget + budget-category writes (copy/move/preferences) | E4 | `t_alt_fin_012` — owned |
| GAP-API-18 | Goals + pledges CRUD and lifecycle | E5 | `t_alt_fin_014` — owned |
| GAP-API-19 | Report preferences + transaction export | E6 | `t_alt_fin_010` — owned |
| GAP-API-20 | Holding writes (remap/reset/cost-basis/sync) | F1 | `t_alt_fin_005` — owned |
| GAP-API-21 | Valuation delete | F3 | `t_alt_fin_007` — owned (minor) |
| GAP-API-22 | Import revert/apply-template/cancel/mappings | G1 | `t_alt_ing_014` — owned |
| GAP-API-23 | Export cancel | G2 | `t_alt_ing_016` — owned |
| GAP-API-24 | Sync cancel | G3 | `t_alt_beta_009`/`t_alt_set_008` — owned |
| GAP-API-25 | Rule writes + apply/confirm flows | G5 | `t_alt_auto_002` — owned |
| GAP-API-26 | Insight refresh/acknowledge | G6 | `t_alt_auto_003` — owned |
| GAP-API-27 | AI prompts + LLM usage read | G7 | `t_alt_auto_005` — owned |
| GAP-API-28 | Provider connection contract (CRUD/sync/connect schema/state) for all H-rows | H1–H11 | `t_alt_ing_004` + `t_alt_ing_002` (+ per-provider UI tasks) — owned |
| GAP-API-29 | Profile/preferences/appearance writes | I1 | `t_alt_set_001`/`t_alt_set_002` — owned |
| GAP-API-30 | API-key + MCP token management | I2 | `t_alt_set_006` — owned |
| GAP-API-31 | User update + sample-data reset | I3 | `t_alt_set_014` — owned |
| GAP-API-32 | Hosting/debug/background-job reads + actions | I5 | `t_alt_set_008` — owned |
| GAP-API-33 | Super-admin users/families/invites/SSO/invite-codes | J1–J3, J6 | `t_alt_set_010`/`t_alt_set_011`/`t_alt_set_012` — owned |
| GAP-API-34 | System-health + queue read/actions (API-driven, not Sidekiq Web) | J4 | `t_alt_set_013` — owned |
| GAP-API-35 | Impersonation session lifecycle | J5 | `t_alt_set_016` — owned |

## §8. Explicit exclusions and task-graph flags

Exclusions (no API work; rationale recorded so a reviewer never re-audits them):

- **Hosted billing:** `subscription#new/show/create/upgrade/success` (self-host
  guarded), `webhooks#stripe`, `settings/payment#show`. Self-hosted program
  target excludes hosted billing; no task owns billing UI.
- **Native clients:** desktop/mobile SSO handoff routes (A7). Native-app concern.
- **Machine surfaces:** `.well-known/*`, `oauth_registration`, Doorkeeper consent,
  `POST /mcp`, `webhooks#plaid/plaid_eu`. Browser consent (if ever needed) stays
  Rails-hosted; alt frontend authenticates via API keys (I2).
- **Ops break-glass:** Sidekiq Web mount (J4). Remains Rails-mounted for
  emergencies; alt frontend parity is the API-driven queue view (`t_alt_set_013`).
- **Dev-only:** Lookbook `/design-system`, Rswag `/api-docs`, test-only
  `api/v1/test*` routes. Never shipped to production.
- **Internal experiment:** Monarch SureQL console (A10). Returns server-rendered
  HTML rows by design and cannot satisfy the no-Rails-HTML rule.

Task-graph flags (gaps recorded here, no silent broadening):

1. `GAP-API-12` (bulk transaction ops) and `GAP-API-13` (receipt attachments)
   have no explicit owning task; closest are `t_alt_beta_004` and `t_alt_beta_006`.
   Resolution (extend the neighbor vs. file a new task) belongs to
   [[close-the-route-and-workflow-parity-matrix|Close the route and workflow parity matrix]] (`t_alt_rel_008`),
   which closes this matrix at release time.
2. `GAP-API-09`/`GAP-API-21` are minor (helper + single delete); owning tasks
   decide inclusion during implementation.
3. System-test coverage holes (no browser test today): A2–A5, C5, D4, D7, E3, E4,
   E6, F3, F4, G2, G6, H3–H9, H11, I3–I5, J3, J5, J6. The frontend/integration
   harness ([[build-frontend-and-rails-integration-test-harness|Build frontend and Rails integration test harness]] `t_alt_fnd_012`)
   should add API-level coverage where the Rails suite has none.
4. This matrix adds no new tasks and changes no PM task status; it only links rows
   to existing IDs listed in §2–§6 of the program plan.

## Verification appendix

Reviewer checklist for `t_alt_fnd_001`:

- [ ] Every non-billing browser route in `config/routes.rb` appears in §A–§J or §8.
  Reproduce with command 1 (routes) cross-checked against the Behavior/Workflow
  columns, or rerun command 7 (mechanical citation check).
- [ ] Every file from command 2 (`find test/system -name "*_test.rb"`) is cited in
  a System test column or §8: account_activity, accounts_sync_ui, accounts,
  admin/system_health, admin_user_removals, categories, chats, drag_and_drop_import,
  ds_overlay_morph, goals_form, imports, onboardings, onchain_wallets, property,
  rules, settings/ai_prompts, settings/api_keys, settings/providers, settings_test,
  trades, transaction_category_select, transaction_drawer_navigation,
  transactions_form_exchange_rate, transactions, transfers.
- [ ] No SUPPORTED or PARTIAL row depends on rendering or redirecting to Rails
  HTML: OAuth callbacks, blob downloads, and 301s terminate at the BFF/edge or are
  replaced by versioned API operations listed in §7.
