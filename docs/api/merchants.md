# Merchants API

The Merchants API allows external applications to create, retrieve, update, delete, and bulk-import merchants within Sure. Merchants represent payees or vendors associated with transactions.

## Generated OpenAPI specification

- The source of truth for the documentation lives in [`spec/requests/api/v1/merchants_spec.rb`](../../spec/requests/api/v1/merchants_spec.rb). These specs authenticate against the Rails stack, exercise every merchant endpoint, and capture real response shapes.
- Regenerate the OpenAPI document with:

  ```sh
  RAILS_ENV=test bundle exec rake rswag:specs:swaggerize
  ```

  The task compiles the request specs and writes the result to [`docs/api/openapi.yaml`](openapi.yaml).

- Run just the documentation specs with:

  ```sh
  bundle exec rspec spec/requests/api/v1/merchants_spec.rb
  ```

## Authentication requirements

| Endpoint | Required scope |
| --- | --- |
| `GET` endpoints | `read` |
| `POST`, `PATCH`, and `DELETE` endpoints | `write` |

## Available endpoints

| Endpoint | Scope | Description |
| --- | --- | --- |
| `GET /api/v1/merchants` | `read` | List all merchants available to the family. |
| `GET /api/v1/merchants/{id}` | `read` | Retrieve a single merchant by ID. |
| `POST /api/v1/merchants` | `write` | Create a family merchant. |
| `PATCH /api/v1/merchants/{id}` | `write` | Update a merchant. |
| `DELETE /api/v1/merchants/{id}` | `write` | Delete or unlink a merchant. |
| `POST /api/v1/merchants/import` | `write` | Bulk-import merchants from a CSV file. |

Refer to the generated [`openapi.yaml`](openapi.yaml) for request/response schemas, reusable components, and security definitions.

## Merchant types

Sure supports two types of merchants:

| Type | Description |
| --- | --- |
| `FamilyMerchant` | Merchants created and owned by the family. |
| `ProviderMerchant` | Merchants from external providers (e.g., Plaid) assigned to transactions. |

The `GET /api/v1/merchants` endpoint returns both types: all family merchants plus any provider merchants that are assigned to the family's transactions.

## Merchant object

A merchant response includes:

```json
{
  "id": "uuid",
  "name": "Whole Foods",
  "type": "FamilyMerchant",
  "color": "#e99537",
  "website_url": "https://wholefoodsmarket.com",
  "logo_url": "https://cdn.example.com/whole-foods.png",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

## Listing merchants

Example request:

```http
GET /api/v1/merchants
X-Api-Key: <read-scoped-key>
```

Example response:

```json
[
  {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "Amazon",
      "type": "FamilyMerchant",
      "color": "#e99537",
      "website_url": "https://amazon.com",
      "logo_url": "https://cdn.example.com/amazon.png",
      "created_at": "2024-01-10T08:00:00Z",
    "updated_at": "2024-01-10T08:00:00Z"
  },
  {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "name": "Starbucks",
      "type": "ProviderMerchant",
      "color": null,
      "website_url": "https://starbucks.com",
      "logo_url": "https://cdn.example.com/starbucks.png",
      "created_at": "2024-01-12T14:30:00Z",
    "updated_at": "2024-01-12T14:30:00Z"
  }
]
```

## Using merchants with transactions

When creating or updating transactions, you can assign a merchant using the `merchant_id` field:

```json
{
  "transaction": {
    "account_id": "uuid",
    "date": "2024-01-15",
    "amount": 75.50,
    "name": "Coffee",
    "nature": "expense",
    "merchant_id": "550e8400-e29b-41d4-a716-446655440002"
  }
}
```

## Creating and updating merchants

Create a merchant with `POST /api/v1/merchants` and update one with `PATCH /api/v1/merchants/{id}`. Both endpoints accept `name`, `color`, `website_url`, and `logo_url` inside a `merchant` object. `name` is required when creating a merchant.

```json
{
  "merchant": {
    "name": "Coffee Shop",
    "color": "#e99537",
    "website_url": "https://coffeeshop.com",
    "logo_url": "https://cdn.example.com/coffee-shop.png"
  }
}
```

Updating an assigned `ProviderMerchant` creates a family-owned copy and reassigns the family's transactions to it. This prevents changes from affecting other families that use the shared provider merchant. The response contains the new `FamilyMerchant` ID.

## Deleting merchants

`DELETE /api/v1/merchants/{id}` deletes a `FamilyMerchant` and returns `204 No Content`. For an assigned `ProviderMerchant`, it unlinks that merchant from the family's transactions without deleting the shared provider record.

## Importing merchants via CSV

`POST /api/v1/merchants/import` accepts a `multipart/form-data` upload and bulk-creates `FamilyMerchant` records. Existing merchants with the same name are skipped (no update, no error). For compatibility, CSV uploads to `POST /api/v1/merchants` are also accepted.

### Request

```http
POST /api/v1/merchants/import
Content-Type: multipart/form-data
X-Api-Key: <write-scoped-key>

file=@merchants.csv
```

### CSV format

| Column | Required | Description |
| --- | --- | --- |
| `name` | Yes | Merchant name. Rows with a blank name are skipped. |
| `color` | No | Hex colour code (e.g. `#e99537`). Defaults to a random palette colour. |
| `website_url` | No | Merchant website. Aliases accepted: `website url`, `website`. |
| `logo_url` | No | Direct merchant logo URL. Aliases accepted: `logo url`, `logo`. |

The header row is required. Column names are matched case-insensitively and extra spaces, underscores, and asterisks are ignored (e.g. `Name*`, `Website URL`, and `website_url` all match).

Example CSV:

```csv
name,color,website_url,logo_url
Coffee Shop,#e99537,https://coffeeshop.com,https://cdn.example.com/coffee.png
Pizza Palace,#4da568,https://pizzapalace.com,https://cdn.example.com/pizza.png
Bookstore,,,
```

### Response — 201 Created

```json
{
  "imported": 2,
  "skipped": 1,
  "merchants": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "Coffee Shop",
      "type": "FamilyMerchant",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "name": "Pizza Palace",
      "type": "FamilyMerchant",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

`skipped` counts rows where a merchant with that name already exists for the family.

### Error responses for CSV import

| HTTP status | `error` value | Cause |
| --- | --- | --- |
| `401` | `unauthorized` | Missing or invalid API key. |
| `403` | `forbidden` | API key lacks the `write` scope. |
| `422` | `missing_file` | No `file` parameter supplied. |
| `422` | `file_too_large` | File exceeds 10 MB. |
| `422` | `invalid_file_type` | File is not a recognised CSV MIME type. |
| `422` | `missing_column` | CSV has no `name` column. |
| `422` | `invalid_csv` | CSV is malformed or cannot be parsed. |

## Importing merchants via the web UI

Merchants can also be imported through the built-in multi-step import flow at **Settings → Imports → New Import → Raw Data → Import merchants**. The flow supports the same CSV format as the API endpoint (upload → configure → clean → publish).

A shortcut button ("Import merchants") is also available directly on the **Merchants** page.

## Error responses

Errors conform to the shared `ErrorResponse` schema in the OpenAPI document:

```json
{
  "error": "Human readable error message"
}
```

Common error codes include `unauthorized`, `not_found`, and `internal_server_error`.
