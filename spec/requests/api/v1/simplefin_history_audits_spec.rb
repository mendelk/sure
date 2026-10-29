require "swagger_helper"

RSpec.describe "API V1 SimpleFIN History Audit", type: :request do
  let(:family) { Family.create!(name: "History Audit API", currency: "USD", locale: "en") }
  let(:user) { family.users.create!(email: "history-audit-docs@example.com", password: "Password123!", role: "admin") }
  let(:account) { family.accounts.create!(owner: user, name: "Continuous card", currency: "USD", balance: 0, accountable: CreditCard.new) }
  let(:account_id) { account.id }
  let(:item) { family.simplefin_items.create!(name: "History connection", access_url: "https://example.com/audit-docs") }
  let!(:provider) do
    provider = item.simplefin_accounts.create!(name: "Current feed", account_id: "current", currency: "USD", account_type: "credit", current_balance: 0)
    AccountProvider.create!(account: account, provider: provider)
    provider
  end
  let(:scopes) { %w[read_write] }
  let(:api_key) do
    key = ApiKey.generate_secure_key
    ApiKey.create!(user: user, name: "API Docs Key", key: key, scopes: scopes, source: "web")
  end
  let(:'X-Api-Key') { api_key.plain_key }

  before do
    allow_any_instance_of(Provider::Simplefin).to receive(:get_accounts).and_return(
      { errors: [], accounts: [ { id: provider.account_id, transactions: [] } ] })
  end

  path "/api/v1/accounts/{account_id}/simplefin_history_audit" do
    parameter name: :account_id, in: :path, type: :string, required: true

    get "Read SimpleFIN history-audit page metadata" do
      description "Read-only metadata for administrators with writable access to the account. Does not contact SimpleFIN, run an audit, or change account/provider data. Supports read-scoped API keys and browser sessions."
      tags "Accounts"
      security [ { apiKeyAuth: [] } ]
      produces "application/json"
      response "200", "metadata returned" do
        schema type: :object, required: %w[account default_period_days max_period_days text], properties: {
          account: { type: :object, required: %w[id name currency], properties: {
            id: { type: :string, format: :uuid }, name: { type: :string }, currency: { type: :string }
          } },
          default_period_days: { type: :integer, example: 45 },
          max_period_days: { type: :integer, example: 45 },
          text: { type: :object, additionalProperties: true }
        }
        let(:scopes) { %w[read] }
        run_test!
      end
      response "403", "administrator and account write permission required" do
        before { user.update!(role: "member") }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
      response "404", "account not accessible" do
        let(:account_id) { SecureRandom.uuid }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
    end

    post "Audit fresh SimpleFIN history without importing or changing financial data" do
      description "Requires an administrator, account write permission, and read_write scope. Choose a period of 1–45 days (default 45), initially ending today. Each page makes one account-filtered provider request, including associated retired feeds. Follow next_cursor through remaining connections in that period, then the immediately preceding period of the same length, back to 1970-01-01. Provider history availability is not guaranteed. Stop on provider errors or rate limits."
      tags "Accounts"
      security [ { apiKeyAuth: [] } ]
      consumes "application/json"
      produces "application/json"
      parameter name: :audit_request, in: :body, schema: { "$ref" => "#/components/schemas/SimplefinHistoryAuditRequest" }
      let(:audit_request) { {} }

      response "200", "history comparison page, with coverage warnings and continuation/retry cursors" do
        schema "$ref" => "#/components/schemas/SimplefinHistoryAudit"
        run_test!
      end
      response "401", "authentication required" do
        let(:'X-Api-Key') { nil }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
      response "403", "administrator, account write permission, and read_write scope required" do
        let(:scopes) { %w[read] }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
      response "404", "account not accessible" do
        let(:account_id) { SecureRandom.uuid }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
      response "409", "provider mappings or audit period format changed; restart or resolve conflicting links" do
        let(:audit_request) do
          cursor = Account::SimplefinHistoryAudit.new(account: account, user: user).call.fetch(:next_cursor)
          provider.update!(account_id: "changed-feed")
          { cursor: cursor }
        end
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
      response "422", "invalid period/cursor or no available SimpleFIN feed" do
        let(:audit_request) { { period_days: 46 } }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
      response "429", "provider or API request quota reached; retry the same page later" do
        before do
          allow_any_instance_of(Provider::Simplefin).to receive(:get_accounts).and_raise(
            Provider::Simplefin::SimplefinError.new("Rate limited", :rate_limited))
        end
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
      response "502", "provider request failed or returned malformed account data" do
        before { allow_any_instance_of(Provider::Simplefin).to receive(:get_accounts).and_return({ accounts: nil }) }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
    end
  end

  path "/api/v1/accounts/{account_id}/simplefin_history_audit/import" do
    parameter name: :account_id, in: :path, type: :string, required: true

    post "Import or link explicitly reviewed SimpleFIN history transactions" do
      description "Requires an administrator, account write permission, and read_write scope. Submit one-hour import tokens from missing/possible_match rows with an explicit entry_id: null imports separately, while a reviewed candidate UUID creates an alias without changing manual, CSV, split or transfer data. The batch is atomic and rechecks feed mappings, candidate eligibility and tombstones under ingestion locks. Repeating an unchanged decision is idempotent; changed decisions conflict. No provider request, balance adoption, payload-cache or provider sync-timestamp update occurs. New imports schedule account recalculation."
      tags "Accounts"
      security [ { apiKeyAuth: [] } ]
      consumes "application/json"
      produces "application/json"
      parameter name: :import_request, in: :body, schema: { "$ref" => "#/components/schemas/SimplefinHistoryAuditImportRequest" }
      let(:import_token) do
        raw = { id: "historical", posted: Time.current.to_i, amount: "-12.34", description: "Historical purchase" }
        allow_any_instance_of(Provider::Simplefin).to receive(:get_accounts).and_return(
          { errors: [], accounts: [ { id: provider.account_id, transactions: [ raw ] } ] })
        Account::SimplefinHistoryAudit.new(account: account, user: user).call.fetch(:transactions).sole.fetch(:import_token)
      end
      let(:import_request) { { decisions: [ { token: import_token, entry_id: nil } ] } }

      response "200", "explicit decisions applied or replayed without additional provider requests" do
        schema "$ref" => "#/components/schemas/SimplefinHistoryAuditImport"
        run_test!
      end
      response "401", "authentication required" do
        let(:'X-Api-Key') { nil }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
      response "403", "administrator, account write permission, and read_write scope required" do
        let(:scopes) { %w[read] }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
      response "404", "account not accessible" do
        let(:account_id) { SecureRandom.uuid }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
      response "409", "feeds/candidates changed, identity was deleted, or a different decision was already applied" do
        let(:import_request) do
          token = import_token
          provider.update!(account_id: "changed-feed")
          { decisions: [ { token: token, entry_id: nil } ] }
        end
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
      response "422", "invalid/expired/wrong-account token or malformed decisions without explicit entry_id" do
        let(:import_request) { { decisions: [ { token: "invalid", entry_id: nil } ] } }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
    end
  end
end
