# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Api::V1::ProviderManagement", type: :request do
  let(:user) { users(:family_admin) }
  let(:api_key) do
    key = ApiKey.generate_secure_key
    ApiKey.create!(user: user, name: "API Docs Key", key: key, scopes: %w[read_write], source: "web")
  end
  let(:'X-Api-Key') { api_key.plain_key }
  let(:provider) { "mercury" }
  let(:id) { mercury_items(:one).id }
  let(:body) { {} }

  path "/api/v1/provider_connections/form_options" do
    get "Describes provider configuration and supported actions" do
      tags "Provider Connections"
      security [ { apiKeyAuth: [] } ]
      produces "application/json"
      description "Administrator-only configuration metadata (or connector-owner policy for Plaid). Fields include labels, input types, safe current values, credential readiness and select options. Credentials are write-only. Available actions describe their field inputs. Reading metadata does not contact a provider. OAuth authorization links are normal navigation, not API writes. Supported provider keys are the same as the provider status collection."
      parameter name: :provider, in: :query, required: true, schema: { type: :string }
      response "200", "configuration metadata" do
        schema type: :object, required: [ :data ], properties: { data: { type: :object, properties: {
          provider: { type: :string }, item_id: { type: :string, nullable: true }, name: { type: :string },
          fields: { type: :array, items: { type: :object, properties: { name: { type: :string }, label: { type: :string }, type: { type: :string }, required: { type: :boolean }, configured: { type: :boolean }, value: { nullable: true }, options: { type: :array, items: { type: :object } } } } },
          authorization: { type: :object, properties: { kind: { type: :string }, href: { type: :string, nullable: true } } },
          actions: { type: :array, items: { type: :object, properties: { name: { type: :string }, label: { type: :string }, fields: { type: :array, items: { type: :object } } } } }
        } } }
        run_test!
      end
      response("403", "not a provider administrator or connector owner") { run_test! }
      response("404", "unknown provider") { run_test! }
    end
  end

  path "/api/v1/provider_connections/{provider}" do
    parameter name: :provider, in: :path, required: true, schema: { type: :string }
    post "Creates a provider connection" do
      tags "Provider Connections"
      security [ { apiKeyAuth: [] } ]
      consumes "application/json"
      produces "application/json"
      description "Requires read_write and provider-management authorization. Submit the fields described by form_options. Provider-specific creation uses existing domain adapters, token exchange, credential validation and initial-sync semantics. SimpleFIN accepts setup_token, Plaid accepts public_token and region. Credentials never appear in the response. FinanceKit consent enrollment uses its dedicated API."
      parameter name: :body, in: :body, schema: { type: :object, additionalProperties: true }
      response("201", "connection created; data contains id and provider") { run_test! }
      response("401", "unauthenticated") { run_test! }
      response("403", "insufficient scope or provider permission") { run_test! }
      response("422", "invalid provider configuration") { run_test! }
    end
  end

  path "/api/v1/provider_connections/{provider}/{id}" do
    parameter name: :provider, in: :path, required: true, schema: { type: :string }
    parameter name: :id, in: :path, required: true, schema: { type: :string, format: :uuid }
    get "Shows provider management workspace" do
      tags "Provider Connections"
      security [ { apiKeyAuth: [] } ]
      produces "application/json"
      description "Returns data.connection (sanitized status), data.configuration (write-only credential form metadata), and data.setup (cached provider-account mappings, type/subtype choices and writable manual link destinations). Requires provider-management permission; does not contact the upstream provider."
      response("200", "provider workspace") { run_test! }
      response("403", "provider permission denied") { run_test! }
      response("404", "connection not in this family") { run_test! }
    end
    patch "Updates provider configuration or reconnect credentials" do
      tags "Provider Connections"
      security [ { apiKeyAuth: [] } ]
      consumes "application/json"
      produces "application/json"
      description "Submit supported form_options fields. Blank stored credentials retain existing values. SimpleFIN setup-token rotation is queued asynchronously. Provider-specific cache expiration, status recovery and reauthentication are retained. Browser sessions require CSRF."
      parameter name: :body, in: :body, schema: { type: :object, additionalProperties: true }
      response("200", "configuration saved") { run_test! }
      response("403", "insufficient scope or permission") { run_test! }
      response("404", "connection not found") { run_test! }
      response("422", "invalid date or configuration") { run_test! }
    end
    delete "Removes a provider connection" do
      tags "Provider Connections"
      security [ { apiKeyAuth: [] } ]
      produces "application/json"
      description "Requires write access to all mapped accounts. Preserves provider-specific unlinking, remote-session revocation and asynchronous deletion. A failed unlink prevents deletion."
      response("202", "removal scheduled") { run_test! }
      response("403", "insufficient scope or permission") { run_test! }
      response("404", "connection not found") { run_test! }
      response("409", "provider links could not be safely detached") { run_test! }
    end
  end

  path "/api/v1/provider_connections/{provider}/{id}/setup" do
    parameter name: :provider, in: :path, required: true, schema: { type: :string }
    parameter name: :id, in: :path, required: true, schema: { type: :string, format: :uuid }
    get "Lists cached provider accounts and setup selections" do
      tags "Provider Connections"
      security [ { apiKeyAuth: [] } ]
      produces "application/json"
      description "data includes accounts, unlinked_accounts, linked_accounts, account_types with subtypes, owners, linkable_accounts, sync dates, syncing and stale_accounts. Each account includes allowed_accountable_types, suggested type/subtype/confidence, conservative initial accountable_type (possibly skip), and linkable_account_ids. Does not fetch upstream data; explicitly POST sync to discover accounts."
      response("200", "setup metadata") { run_test! }
      response("403", "provider permission denied") { run_test! }
      response("404", "connection not found") { run_test! }
    end
    patch "Applies provider account setup selections" do
      tags "Provider Connections"
      security [ { apiKeyAuth: [] } ]
      consumes "application/json"
      produces "application/json"
      description "Creates/accounts links with the provider's existing setup semantics. Owner and destination must be authorized. Skip is explicit. SimpleFIN stale-account move/delete remains scoped and checks affected accounts. Successful results include created_account_ids, linked_account_ids, existing_account_ids, skipped_provider_account_ids, warnings, account_setup. FinanceKit mappings remain in dedicated enrollment APIs."
      parameter name: :body, in: :body, schema: { type: :object, properties: {
        selections: { type: :array, items: { type: :object, required: [ :id ], properties: {
          id: { type: :string, format: :uuid }, accountable_type: { type: :string }, subtype: { type: :string },
          account_id: { type: :string, format: :uuid }, owner_id: { type: :string, format: :uuid },
          sync_start_date: { type: :string, format: :date }, balance: { type: :string }
        } } }, sync_start_date: { type: :string, format: :date },
        stale_account_actions: { type: :object, additionalProperties: { type: :object, properties: { action: { type: :string, enum: %w[skip move delete] }, target_account_id: { type: :string, format: :uuid } } } }
      } }
      response("200", "setup applied") { run_test! }
      response("403", "account or provider permission denied") { run_test! }
      response("404", "provider account or destination not found") { run_test! }
      response("409", "mapping conflicts with an existing link") { run_test! }
      response("422", "invalid type, subtype, selection or date") { run_test! }
    end
  end

  path "/api/v1/provider_connections/{provider}/{id}/link" do
    parameter name: :provider, in: :path, required: true, schema: { type: :string }
    parameter name: :id, in: :path, required: true, schema: { type: :string, format: :uuid }
    post "Links a provider account to an existing account" do
      tags "Provider Connections"
      security [ { apiKeyAuth: [] } ]
      consumes "application/json"
      produces "application/json"
      description "Requires read_write, provider-management and owner/full-control account access. Preserves provider-specific type compatibility, existing mapping cleanup and sync scheduling."
      parameter name: :body, in: :body, schema: { type: :object, required: %w[account_id provider_account_id], properties: { account_id: { type: :string, format: :uuid }, provider_account_id: { type: :string, format: :uuid }, sync_start_date: { type: :string, format: :date } } }
      response("200", "account linked") { run_test! }
      response("403", "account or provider permission denied") { run_test! }
      response("404", "account or feed not found") { run_test! }
      response("409", "account or feed already linked") { run_test! }
      response("422", "incompatible account") { run_test! }
    end
  end

  %w[/api/v1/provider_connections/{provider}/configure /api/v1/provider_connections/{provider}/{id}/configure].each do |endpoint|
    path endpoint do
      parameter name: :provider, in: :path, required: true, schema: { type: :string }
      parameter name: :id, in: :path, required: true, schema: { type: :string, format: :uuid } if endpoint.include?("{id}")
      post "Performs a documented provider configuration action" do
        tags "Provider Connections"
        security [ { apiKeyAuth: [] } ]
        consumes "application/json"
        produces "application/json"
        description "Available names/fields are described in configuration.actions. Supports Plaid link_token; Trade Republic login/QR challenge progression; Sophtron institution lookup/connect, MFA and connection status; Wise profile lookup/SCA key generation; on-chain wallet preview/token selection/update/disconnect; CoinStats blockchain/exchange options and linking; Enable Banking banks/authorize/reauthorize; SnapTrade device_authorize/device_complete. Enable Banking returns a validated external authorization_url, never a native form redirect. SnapTrade device_authorize returns item_id, an encrypted expiring flow_token bound to family/user/item, user_code and verification URLs; submit flow_token to that item's device_complete action to redeem. Raw device codes are never exposed. Wallet previews never persist an abandoned connection. Browser writes require CSRF. Provider failures return sanitized errors, not credentials or raw upstream payloads."
        parameter name: :body, in: :body, schema: { type: :object, required: [ :action ], properties: { action: { type: :string } }, additionalProperties: true }
        response("200", "action result") { run_test! }
        response("403", "insufficient scope or permission") { run_test! }
        response("409", "state conflict") { run_test! }
        response("422", "unsupported action or invalid configuration") { run_test! }
      end
    end
  end

  %w[sync cancel_sync dismiss_replacement_suggestion].each do |action|
    path "/api/v1/provider_connections/{provider}/{id}/#{action}" do
      parameter name: :provider, in: :path, required: true, schema: { type: :string }
      parameter name: :id, in: :path, required: true, schema: { type: :string, format: :uuid }
      post action.humanize do
        tags "Provider Connections"
        security [ { apiKeyAuth: [] } ]
        consumes "application/json"
        produces "application/json"
        description "Requires read_write and provider-management permission. sync preserves provider-specific refresh, supports SimpleFIN balances_only, and Sophtron interactive manual sync. cancel_sync requests cooperative cancellation of incomplete connection syncs. dismiss_replacement_suggestion accepts dormant_sfa_id and active_sfa_id scoped to the SimpleFIN connection and changes only the latest sync's dismissal state."
        parameter name: :body, in: :body, schema: { type: :object, properties: { balances_only: { type: :boolean }, dormant_sfa_id: { type: :string, format: :uuid }, active_sfa_id: { type: :string, format: :uuid } } }
        response(action == "dismiss_replacement_suggestion" ? "200" : "202", "operation accepted") { run_test! }
        response("403", "insufficient scope or permission") { run_test! }
        response("404", "connection or provider account not found") { run_test! }
        response("422", "unsupported operation or missing parameters") { run_test! }
      end
    end
  end

  path "/api/v1/provider_connections/{provider}/{id}/connections" do
    parameter name: :provider, in: :path, required: true, schema: { type: :string }
    parameter name: :id, in: :path, required: true, schema: { type: :string, format: :uuid }
    get "Lists authorized brokerage connections" do
      tags "Provider Connections"
      security [ { apiKeyAuth: [] } ]
      produces "application/json"
      description "SnapTrade remote authorizations with sanitized brokerage name/slug, disabled flag and local mapped account names. Other providers return an empty array."
      response("200", "brokerages listed") { run_test! }
      response("403", "provider permission denied") { run_test! }
      response("404", "connection not found") { run_test! }
    end
  end

  path "/api/v1/provider_connections/{provider}/{id}/connections/{authorization_id}" do
    parameter name: :provider, in: :path, required: true, schema: { type: :string }
    parameter name: :id, in: :path, required: true, schema: { type: :string, format: :uuid }
    parameter name: :authorization_id, in: :path, required: true, schema: { type: :string }
    let(:authorization_id) { "authorization-id" }
    delete "Removes a SnapTrade brokerage authorization" do
      tags "Provider Connections"
      security [ { apiKeyAuth: [] } ]
      produces "application/json"
      description "Only authorizations enumerated by this family's authenticated SnapTrade item may be removed. Checks mapped-account write permission, uses existing local account cleanup callbacks, and directly removes orphan authorizations upstream."
      response("200", "brokerage removed") { run_test! }
      response("403", "insufficient scope or account permission") { run_test! }
      response("404", "authorization not owned by this connection") { run_test! }
      response("409", "connection must be authorized") { run_test! }
    end
  end
end
