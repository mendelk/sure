# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "API V1 Reports", type: :request do
  let(:family) { Family.create!(name: "API Reports Family", currency: "USD") }
  let(:user) do
    family.users.create!(email: "reports-api@example.com", password: "password123", password_confirmation: "password123")
  end
  let(:api_key) do
    key = ApiKey.generate_secure_key
    ApiKey.create!(user: user, name: "API Docs Key", key: key, scopes: %w[read_write], source: "web")
  end
  let(:"X-Api-Key") { api_key.plain_key }

  path "/api/v1/reports/catalog" do
    get "Discover authorized report fields and filter options" do
      tags "Reports"
      description "Returns the server-owned structured-report vocabulary and options drawn only from the authenticated user's accessible transaction accounts. Read scope is sufficient."
      security [ { apiKeyAuth: [] }, { cookieSession: [] } ]
      produces "application/json"

      response "200", "authorized catalog" do
        schema "$ref" => "#/components/schemas/ReportCatalog"
        run_test!
      end
      response "401", "unauthorized" do
        schema "$ref" => "#/components/schemas/ErrorResponse"
        let(:"X-Api-Key") { "invalid-key" }
        run_test!
      end
    end
  end

  path "/api/v1/reports/compile" do
    post "Compile an authorized SureQL query" do
      tags "Reports"
      description "Compiles registry-only SureQL sources with account authorization injected. Does not execute SQL. Read scope is sufficient; cookie-authenticated requests require CSRF."
      security [ { apiKeyAuth: [] }, { cookieSession: [] } ]
      consumes "application/json"
      produces "application/json"
      parameter name: :query, in: :body, required: true, schema: {
        type: :object, required: %w[source], properties: { source: { type: :string } }
      }
      let(:query) { { source: "from transactions\ntake 5" } }

      response "200", "compiled SQL" do
        schema type: :object, required: %w[sql], properties: { sql: { type: :string } }
        run_test!
      end
      response "400", "source missing" do
        schema "$ref" => "#/components/schemas/ErrorResponse"
        let(:query) { {} }
        run_test!
      end
      response "422", "unknown source or invalid query" do
        schema "$ref" => "#/components/schemas/ReportError"
        let(:query) { { source: "from unknown_source" } }
        run_test!
      end
      response "401", "unauthorized" do
        schema "$ref" => "#/components/schemas/ErrorResponse"
        let(:"X-Api-Key") { "invalid-key" }
        run_test!
      end
    end
  end

  path "/api/v1/reports/run" do
    post "Execute SureQL, pivot, or structured report" do
      tags "Reports"
      description "Read-only execution using the existing authorized compiler and bounded domain runners. Supply source for SureQL, source+pivot for chart aggregation, report for aggregate/detail reports, or catalog:true for catalog discovery. SureQL defaults to 50 rows; explicit pagination permits 1–100 rows per page with lookahead. Structured reports paginate complete groups or detail entries; all_columns:true expands aggregate columns for charts. Pivot aggregation runs before the preview cap while preserving explicit SureQL take limits. Semantic ledger signs and exact structured monetary decimals are preserved. Invalid definitions include an actionable field path. Read scope is sufficient; cookie-authenticated POSTs require CSRF."
      security [ { apiKeyAuth: [] }, { cookieSession: [] } ]
      consumes "application/json"
      produces "application/json"
      parameter name: :execution, in: :body, required: true, schema: { "$ref" => "#/components/schemas/ReportExecutionRequest" }
      let(:execution) { { source: "from transactions\ntake 5", pagination: { limit: 10, offset: 0 } } }

      response "200", "report results or catalog" do
        schema oneOf: [
          { "$ref" => "#/components/schemas/SureqlResult" },
          { "$ref" => "#/components/schemas/PivotResult" },
          { "$ref" => "#/components/schemas/StructuredReportResult" },
          { "$ref" => "#/components/schemas/ReportCatalog" }
        ]
        run_test!
      end
      response "400", "required execution source missing" do
        schema "$ref" => "#/components/schemas/ErrorResponse"
        let(:execution) { {} }
        run_test!
      end
      response "422", "invalid source, report, pivot, pagination, or database query" do
        schema "$ref" => "#/components/schemas/ReportError"
        let(:execution) { { source: "from unknown_source" } }
        run_test!
      end
      response "401", "unauthorized" do
        schema "$ref" => "#/components/schemas/ErrorResponse"
        let(:"X-Api-Key") { "invalid-key" }
        run_test!
      end
    end
  end
end
