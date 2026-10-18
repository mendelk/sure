# Categories API Documentation

The Categories API allows external applications to retrieve, create, and update financial categories within Sure. Categories classify transactions and support a two-level hierarchy. Updates are limited to color and icon metadata; existing category names, hierarchy, and transaction assignments are preserved.

## Generated OpenAPI specification

- OpenAPI documentation is defined in [`spec/requests/api/v1/categories_spec.rb`](../../spec/requests/api/v1/categories_spec.rb). These rswag specs are documentation-only; behavioral coverage lives in [`test/controllers/api/v1/categories_controller_test.rb`](../../test/controllers/api/v1/categories_controller_test.rb).
- Regenerate the OpenAPI document with:

  ```sh
  RAILS_ENV=test bundle exec rake rswag:specs:swaggerize
  ```

  The task compiles the request specs and writes the result to [`docs/api/openapi.yaml`](openapi.yaml).

- Run just the documentation specs with:

  ```sh
  bundle exec rspec spec/requests/api/v1/categories_spec.rb
  ```

## Authentication requirements

Read endpoints require an OAuth2 access token or API key with `read` or `read_write` scope. Creating or updating categories requires `read_write`. Send API keys in the `X-Api-Key` header.

## Available endpoints

| Endpoint | Scope | Description |
| --- | --- | --- |
| `GET /api/v1/categories` | `read` | List categories with filtering and pagination. |
| `GET /api/v1/categories/{id}` | `read` | Retrieve a single category with full details. |
| `POST /api/v1/categories` | `read_write` | Create a category. |
| `PATCH /api/v1/categories/{id}` | `read_write` | Update a category's color and/or icon. |
| `PUT /api/v1/categories/{id}` | `read_write` | Same partial-update behavior as PATCH; omitted fields are preserved. |

Refer to the generated [`openapi.yaml`](openapi.yaml) for request/response schemas, reusable components (pagination, errors), and security definitions.

## Updating category colors and icons

```sh
curl --fail-with-body --request PATCH \
  --header "X-Api-Key: $SURE_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{"category":{"color":"#6471eb","icon":"building"}}' \
  "https://sure.achem.men/api/v1/categories/<category-id>"
```

Supply `color`, `icon`, or both under `category`. Colors must be six-digit hex strings; icons are Lucide names and cannot be blank. Omitted fields retain their current values. The endpoint does not permit changes to `name`, `parent_id`, `family_id`, or transaction assignments.

A successful update returns `200` with the full category object shown below. Only categories in the authenticated user's family can be updated. Missing categories and categories belonging to another family return `404`.

Subcategories inherit their parent's color when saved. Updating a parent's color does not automatically resave its children: update parents before children when applying a palette to an entire hierarchy.

Missing category payloads return `400`; missing authentication returns `401`; read-only keys return `403`; invalid colors or blank icons return `422` without persisting either field.

## Filtering options

The `GET /api/v1/categories` endpoint supports the following query parameters for filtering:

| Parameter | Type | Description |
| --- | --- | --- |
| `page` | integer | Page number (default: 1) |
| `per_page` | integer | Items per page (default: 25, max: 100) |
| `roots_only` | boolean | Return only root categories (categories without a parent) |
| `parent_id` | uuid | Filter subcategories by parent category ID |

## Category object

A category response includes:

```json
{
  "id": "uuid",
  "name": "Food & Drink",
  "color": "#f97316",
  "icon": "utensils",
  "parent": null,
  "subcategories_count": 2,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

## Category hierarchy

Categories support a two-level hierarchy:

- **Root categories** (parent categories) have `parent: null` and may have subcategories
- **Subcategories** have a `parent` object containing the parent's `id` and `name`

Example subcategory response:

```json
{
  "id": "uuid",
  "name": "Restaurants",
  "color": "#f97316",
  "icon": "utensils",
  "parent": {
    "id": "uuid",
    "name": "Food & Drink"
  },
  "subcategories_count": 0,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

## Filtering examples

### Get only root categories (no subcategories)

```
GET /api/v1/categories?roots_only=true
```

### Get subcategories of a specific parent

```
GET /api/v1/categories?parent_id=<parent-category-uuid>
```

### Combine filters with pagination

```
GET /api/v1/categories?roots_only=true&page=1&per_page=10
```

## Error responses

Errors conform to the shared `ErrorResponse` schema in the OpenAPI document:

```json
{
  "error": "error_code",
  "message": "Human readable error message"
}
```

Common error codes include `bad_request`, `unauthorized`, `forbidden`, `not_found`, `unprocessable_entity`, and `internal_server_error`.

## Web category form contract

The signed-in web UI uses session-authenticated `/categories` routes, separate
from the external `/api/v1/categories` endpoints above.
`GET /categories/new.json` returns an unsaved category: `id`, `name`,
`display_name`, and `display_name_with_parent` are `null`, while color and icon
defaults are populated. The SPA form schema accepts these nulls and renders the
name as an empty input. Persisted category rows and create responses still require
string IDs and names.

`test/system/categories_test.rb` exercises opening the blank form, creating a
category, and displaying its persisted row.
