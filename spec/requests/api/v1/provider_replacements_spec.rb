require "swagger_helper"

RSpec.describe "API V1 Provider Replacement", type: :request do
  let(:family) { Family.create!(name: "Replacement API", currency: "USD", locale: "en") }
  let(:user) { family.users.create!(email: "replacement-docs@example.com", password: "Password123!", role: "admin") }
  let(:account) { family.accounts.create!(owner: user, name: "Continuous card", currency: "USD", balance: 0, accountable: CreditCard.new) }
  let(:account_id) { account.id }
  let(:item) { family.simplefin_items.create!(name: "Replacement connection", access_url: "https://example.com/docs") }
  let(:provider) do
    item.simplefin_accounts.create!(name: "Replacement card", account_id: "replacement", currency: "USD",
      account_type: "credit", current_balance: 0, raw_transactions_payload: [])
  end
  let(:scopes) { %w[read_write] }
  let(:api_key) do
    key = ApiKey.generate_secure_key
    ApiKey.create!(user: user, name: "API Docs Key", key: key, scopes: scopes, source: "web")
  end
  let(:'X-Api-Key') { api_key.plain_key }

  path "/api/v1/accounts/{account_id}/provider_replacement" do
    parameter name: :account_id, in: :path, type: :string, required: true

    get "List SimpleFIN replacement choices for an existing ledger" do
      tags "Accounts"
      security [ { apiKeyAuth: [] } ]
      produces "application/json"

      response "200", "choices include unlinked and writable already-linked provider accounts" do
        schema "$ref" => "#/components/schemas/ProviderReplacementCandidates"
        run_test!
      end
      response "401", "authentication required" do
        let(:'X-Api-Key') { nil }
        schema "$ref" => "#/components/schemas/ErrorResponse"
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
  end

  path "/api/v1/accounts/{account_id}/provider_replacement/preview" do
    parameter name: :account_id, in: :path, type: :string, required: true

    post "Preview replacement without changing financial records" do
      tags "Accounts"
      security [ { apiKeyAuth: [] } ]
      consumes "application/json"
      produces "application/json"
      parameter name: :replacement_request, in: :body, schema: { "$ref" => "#/components/schemas/ProviderReplacementRequest" }
      let(:replacement_request) { { simplefin_account_id: provider.id, matches: [] } }

      response "200", "review transaction identities, conflicts and balance discrepancy" do
        schema "$ref" => "#/components/schemas/ProviderReplacementPreview"
        run_test!
      end
      response "401", "authentication required" do
        let(:'X-Api-Key') { nil }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
      response "403", "read only keys cannot preview a write operation" do
        let(:scopes) { %w[read] }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
      response "404", "provider not accessible" do
        let(:replacement_request) { { simplefin_account_id: SecureRandom.uuid } }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
      response "422", "invalid request" do
        let(:replacement_request) { {} }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
    end
  end

  path "/api/v1/accounts/{account_id}/provider_replacement/apply" do
    parameter name: :account_id, in: :path, type: :string, required: true

    post "Apply an explicitly reviewed replacement idempotently" do
      tags "Accounts"
      security [ { apiKeyAuth: [] } ]
      consumes "application/json"
      produces "application/json"
      parameter name: :replacement_request, in: :body, schema: { "$ref" => "#/components/schemas/ProviderReplacementApplyRequest" }
      let(:fingerprint) { Account::ProviderReplacement.new(account: account, simplefin_account: provider, user: user).preview.fetch(:fingerprint) }
      let(:replacement_request) do
        { simplefin_account_id: provider.id, fingerprint: fingerprint, matches: [],
          idempotency_key: "docs-reviewed-replacement", accept_balance_difference: false }
      end

      response "200", "canonical ledger retained and source mapping switched" do
        schema "$ref" => "#/components/schemas/ProviderReplacementResult"
        run_test!
      end
      response "401", "authentication required" do
        let(:'X-Api-Key') { nil }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
      response "403", "write scope required" do
        let(:scopes) { %w[read] }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
      response "404", "provider not accessible" do
        let(:replacement_request) { { simplefin_account_id: SecureRandom.uuid, fingerprint: "review", idempotency_key: "docs-missing" } }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
      response "409", "review is stale; refresh and review again" do
        let(:fingerprint) { "stale" }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
      response "422", "missing review, incompatible replacement or unresolved conflict" do
        let(:replacement_request) { { simplefin_account_id: provider.id } }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
    end
  end
end
