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

    post "Audit fresh SimpleFIN history without importing or changing financial data" do
      description "Requires an administrator, account write permission, and read_write scope. Each page makes one account-filtered provider request over at most 60 days, including associated retired feeds. Follow next_cursor to walk older history without an empty-window or one-year cutoff. Provider history availability is not guaranteed. Stop on provider errors or rate limits."
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
      response "409", "provider mappings changed; restart or resolve conflicting links" do
        let(:audit_request) do
          cursor = Account::SimplefinHistoryAudit.new(account: account, user: user).call.fetch(:next_cursor)
          provider.update!(account_id: "changed-feed")
          { cursor: cursor }
        end
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
      response "422", "invalid dates/cursor or no available SimpleFIN feed" do
        let(:audit_request) { { start_date: "not-a-date" } }
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
end
