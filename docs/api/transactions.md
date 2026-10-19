# Transactions API Documentation

The Transactions API allows external applications to manage financial transactions within Sure. The OpenAPI description is generated from documentation-only request specs; Minitest verifies runtime behavior and authorization.

## Generated OpenAPI specification

- Documentation schemas live in [`spec/swagger_helper.rb`](../../spec/swagger_helper.rb), with operations described in [`spec/requests/api/v1/transactions_spec.rb`](../../spec/requests/api/v1/transactions_spec.rb). Runtime behavior is covered by the controller tests under `test/controllers/api/v1/`.
- Regenerate the OpenAPI document with:

  ```sh
  RAILS_ENV=test bundle exec rake rswag:specs:swaggerize
  ```

  The task compiles the request specs and writes the result to [`docs/api/openapi.yaml`](openapi.yaml).

- Inspect just the transaction documentation examples without exercising HTTP behavior:

  ```sh
  RAILS_ENV=test bundle exec rspec --dry-run spec/requests/api/v1/transactions_spec.rb
  ```

## Authentication requirements

All transaction endpoints require an OAuth2 access token or API key that grants the appropriate scope (`read` or `read_write`). Read endpoints (`GET /api/v1/transactions`) also accept an authenticated browser session (`cookieSession`). Write endpoints also accept a browser session when the request presents a valid CSRF token (`X-CSRF-Token` header), matching the classic web app's forgery protection.

## Account permissions

Credential scopes do not grant access beyond the viewer's account permissions.
Transaction list/detail responses and account responses include `permissions`:

- `can_annotate`: permits `category_id`, `merchant_id`, `tag_ids`, and `notes`.
- `can_edit`: permits structural/financial changes and actions such as deletion,
  unlocking, recurrence, and duplicate resolution. Requires account ownership or
  a `full_control` share, regardless of the user's family role.

A `read_only` share grants neither capability. A `read_write` share grants only
annotation. An accessible transaction with insufficient permission returns
`403 forbidden`; a PATCH that combines permitted annotations with restricted
fields is rejected atomically. Inaccessible transactions return `404 not_found`.
Split endpoints retain their writable-account lookup and also return 404 when
the viewer lacks full control.

Transfer responses and embedded transfer summaries expose
`permissions.can_edit`, based on the outflow account. Transfer editors must use
this capability rather than assuming that access to either account grants edits.
`can_mark_as_recurring` additionally requires full control of both endpoints and
enabled recurring features; `recurring_exists` separately indicates an existing
pattern. Transfer-match candidates include only pairs with writable accounts,
and match creation checks both source and counterpart/target permissions.

## Available endpoints

| Endpoint | Scope | Description |
| --- | --- | --- |
| `GET /api/v1/transactions` | `read` | List transactions with filtering and pagination. |
| `GET /api/v1/transactions/{id}` | `read` | Retrieve a single transaction with full details. |
| `POST /api/v1/transactions` | `write` | Create a new transaction. |
| `PATCH /api/v1/transactions/{id}` | `write` | Update an existing transaction. Supports `excluded` to toggle report exclusion. |
| `DELETE /api/v1/transactions/{id}` | `write` | Permanently delete a transaction. |
| `GET /api/v1/transactions/{id}/transfer_match_candidates` | `read` | List candidate entries this transaction could be matched against, ordered by date proximity. |
| `POST /api/v1/transactions/{id}/transfer_match` | `write` | Create a transfer match: link an existing transaction (`matched_entry_id`) or create a counterpart on `target_account_id`. |
| `PATCH /api/v1/transfers/{id}` | `write` | Confirm/reject a transfer match, update notes/tags, or set/clear the category of an eligible loan payment. |

Refer to the generated [`openapi.yaml`](openapi.yaml) for request/response schemas, reusable components (pagination, errors, accounts, categories, merchants, tags), and security definitions.

## Filtering options

The `GET /api/v1/transactions` endpoint supports the following query parameters for filtering:

| Parameter | Type | Description |
| --- | --- | --- |
| `page` | integer | Page number (default: 1) |
| `per_page` | integer | Items per page (default: 25, max: 100) |
| `account_id` | uuid | Filter by a single account ID |
| `account_ids[]` | uuid[] | Filter by multiple account IDs |
| `category_id` | uuid | Filter by a single category ID |
| `category_ids[]` | uuid[] | Filter by multiple category IDs |
| `merchant_id` | uuid | Filter by a single merchant ID |
| `merchant_ids[]` | uuid[] | Filter by multiple merchant IDs |
| `tag_ids[]` | uuid[] | Filter by tag IDs |
| `start_date` | date | Filter transactions from this date (inclusive) |
| `end_date` | date | Filter transactions until this date (inclusive) |
| `min_amount` | number | Filter by minimum amount |
| `max_amount` | number | Filter by maximum amount |
| `type` | string | Filter by transaction type: `income` or `expense` |
| `types[]` | string[] | Filter by multiple transaction types (`income`, `expense`, `transfer`) |
| `status[]` | string[] | Filter by transaction status (`pending`, `confirmed`) |
| `accounts[]` | string[] | Filter by account names |
| `categories[]` | string[] | Filter by category names |
| `merchants[]` | string[] | Filter by merchant names |
| `tags[]` | string[] | Filter by tag names |
| `search` | string | Search names and notes. Numeric terms also match exact amounts of either sign; quoted numeric terms match amounts only. |

## Transaction object

A transaction response includes:

```json
{
  "id": "uuid",
  "date": "2024-01-15",
  "amount": "$75.50",
  "currency": "USD",
  "name": "Grocery shopping",
  "notes": "Weekly groceries",
  "classification": "expense",
  "account": {
    "id": "uuid",
    "name": "Checking Account",
    "account_type": "depository"
  },
  "permissions": {
    "can_edit": true,
    "can_annotate": true
  },
  "category": {
    "id": "uuid",
    "name": "Groceries",
    "color": "#4CAF50",
    "icon": "shopping-cart"
  },
  "category_editable": true,
  "category_set_on_transfer_outflow": false,
  "display_category": {
    "name": "Groceries",
    "color": "#4CAF50",
    "icon": "shopping-cart"
  },
  "merchant": {
    "id": "uuid",
    "name": "Whole Foods"
  },
  "tags": [
    {
      "id": "uuid",
      "name": "Essential",
      "color": "#2196F3"
    }
  ],
  "transfer": null,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

`category` is the transaction's own stored category. `display_category` is a
read-only presentation object (`name`, `color`, `icon`) or `null`: it may contain
the matched outgoing leg's category or a virtual Payment/Transfer badge.
Outgoing categories from accounts the viewer cannot access are not exposed.

Clients should offer a category picker only when both `category_editable` and
`permissions.can_annotate` are true. Unmatched payment/transfer kinds remain
editable. `category_set_on_transfer_outflow` identifies incoming legs whose
category is owned by the outgoing transaction; these display that category
read-only rather than inviting an edit that would not affect the outgoing budget.

## Creating transactions

When creating a transaction, the `nature` field determines how the amount is stored:

| Nature | Behaviour |
| --- | --- |
| `income` / `inflow` | Amount is stored as negative (credit) |
| `expense` / `outflow` | Amount is stored as positive (debit) |

Example request body:

```json
{
  "transaction": {
    "account_id": "uuid",
    "date": "2024-01-15",
    "amount": 75.50,
    "name": "Grocery shopping",
    "nature": "expense",
    "category_id": "uuid",
    "merchant_id": "uuid",
    "tag_ids": ["uuid", "uuid"]
  }
}
```

## Transfer transactions

If a transaction is part of a transfer between accounts, the `transfer` field will be populated with details about the linked transaction:

```json
{
  "transfer": {
    "id": "uuid",
    "amount": "$500.00",
    "currency": "USD",
    "status": "pending",
    "permissions": {
      "can_edit": true
    },
    "other_account": {
      "id": "uuid",
      "name": "Savings Account",
      "account_type": "depository"
    }
  }
}
```

The SPA transaction list shows pending matches with an **Auto-matched** pill
(**A/M** on narrow screens). A checkmark to confirm and an X to reject appear only
when `transfer.permissions.can_edit` is true.
Both actions use `PATCH /api/v1/transfers/{id}` and refresh the transaction list
and cached transaction details, including the counterpart. Controls are disabled
while the action is in progress; failures remain visible beside the match controls.
Confirmed matches display a link icon instead of the pill and action buttons.

Loan payments expose a **Category** picker under **Details** in the SPA transfer
drawer when the API returns both `categorizable: true` and
`permissions.can_edit: true`. Otherwise, the category is read-only. The picker supports searching,
creating a category, and clearing it with **(uncategorized)**. Saving updates the
outflow transaction's category and refreshes the filtered ledger and cached
account/budget summaries. Failed saves leave the previous category intact and
display an error.

Ordinary account-to-account transfers and credit-card payments remain
non-categorizable and do not show this control. Uncategorized loan payments remain
eligible for the Uncategorized filter because they are budget-tracked outflows;
this editor does not change that policy.

## Error responses

Errors conform to the shared `ErrorResponse` schema in the OpenAPI document:

```json
{
  "error": "error_code",
  "message": "Human readable error message",
  "errors": ["Optional array of validation errors"]
}
```

Common error codes include `unauthorized`, `forbidden`, `not_found`, `validation_failed`, and `internal_server_error`.
