# frozen_string_literal: true

require "test_helper"

class Api::V1::ProviderConnectionsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @family = @user.family
    @mercury_item = mercury_items(:one)

    @user.api_keys.active.destroy_all

    @api_key = ApiKey.create!(
      user: @user,
      name: "Test Read Key",
      scopes: [ "read" ],
      display_key: "test_read_#{SecureRandom.hex(8)}",
      source: "web"
    )

    @read_write_key = ApiKey.create!(
      user: @user,
      name: "Test Read-Write Key",
      scopes: [ "read_write" ],
      display_key: "test_rw_#{SecureRandom.hex(8)}",
      source: "mobile"
    )

    redis = Redis.new
    redis.del("api_rate_limit:#{@api_key.id}")
    redis.del("api_rate_limit:#{@read_write_key.id}")
  end

  test "lists provider connection status for current family" do
    failed_sync = @mercury_item.syncs.create!(
      status: "failed",
      failed_at: Time.current,
      error: "secret token failed"
    )

    get api_v1_provider_connections_url, headers: api_headers(@api_key)
    assert_response :success

    json_response = JSON.parse(response.body)
    mercury_connection = json_response["data"].detect do |connection|
      connection["id"] == @mercury_item.id && connection["provider"] == "mercury"
    end

    assert_not_nil mercury_connection
    assert_equal "mercury", mercury_connection["provider"]
    assert_equal "MercuryItem", mercury_connection["provider_type"]
    assert_equal @mercury_item.name, mercury_connection["name"]
    assert_equal @mercury_item.status, mercury_connection["status"]
    assert_includes [ true, false ], mercury_connection["requires_update"]
    assert_equal true, mercury_connection["credentials_configured"]
    assert_includes [ true, false ], mercury_connection["scheduled_for_deletion"]
    assert_includes [ true, false ], mercury_connection["pending_account_setup"]
    assert_equal @mercury_item.mercury_accounts.count, mercury_connection["accounts"]["total_count"]
    assert_equal failed_sync.id, mercury_connection["sync"]["latest"]["id"]
    assert_equal true, mercury_connection["sync"]["latest"]["error"]["present"]
    assert_equal "Sync failed", mercury_connection["sync"]["latest"]["error"]["message"]
  end

  test "reports failed sync errors as present without exposing raw messages" do
    failed_sync = @mercury_item.syncs.create!(
      status: "failed",
      failed_at: Time.current,
      error: nil
    )

    get api_v1_provider_connections_url, headers: api_headers(@api_key)
    assert_response :success

    mercury_connection = JSON.parse(response.body)["data"].detect do |connection|
      connection["id"] == @mercury_item.id && connection["provider"] == "mercury"
    end

    assert_equal failed_sync.id, mercury_connection["sync"]["latest"]["id"]
    assert_equal true, mercury_connection["sync"]["latest"]["error"]["present"]
    assert_equal "Sync failed", mercury_connection["sync"]["latest"]["error"]["message"]
  end

  test "reports stale sync errors as present" do
    stale_sync = @mercury_item.syncs.create!(
      status: "stale",
      syncing_at: 2.days.ago
    )

    get api_v1_provider_connections_url, headers: api_headers(@api_key)
    assert_response :success

    mercury_connection = JSON.parse(response.body)["data"].detect do |connection|
      connection["id"] == @mercury_item.id && connection["provider"] == "mercury"
    end

    assert_equal stale_sync.id, mercury_connection["sync"]["latest"]["id"]
    assert_equal true, mercury_connection["sync"]["latest"]["error"]["present"]
    assert_equal "Sync became stale before completion", mercury_connection["sync"]["latest"]["error"]["message"]
  end

  test "does not expose provider secrets or raw sync errors" do
    @mercury_item.syncs.create!(
      status: "failed",
      failed_at: Time.current,
      error: "raw provider token secret"
    )
    kraken_item = kraken_items(:one)
    kraken_item.syncs.create!(
      status: "failed",
      failed_at: Time.current,
      error: "raw kraken key secret"
    )

    get api_v1_provider_connections_url, headers: api_headers(@api_key)
    assert_response :success

    json_response = JSON.parse(response.body)
    kraken_connection = json_response["data"].detect do |connection|
      connection["id"] == kraken_item.id && connection["provider"] == "kraken"
    end

    assert_not_nil kraken_connection
    assert_equal "KrakenItem", kraken_connection["provider_type"]
    refute_includes response.body, @mercury_item.token
    refute_includes response.body, kraken_item.api_key
    refute_includes response.body, kraken_item.api_secret
    refute_includes response.body, "raw provider token secret"
    refute_includes response.body, "raw kraken key secret"
  end

  test "fails closed when credential readiness is unknown" do
    get api_v1_provider_connections_url, headers: api_headers(@api_key)
    assert_response :success

    plaid_connection = JSON.parse(response.body)["data"].detect do |connection|
      connection["provider"] == "plaid"
    end

    assert_not_nil plaid_connection
    assert_includes [ true, false ], plaid_connection["requires_update"]
    assert_equal false, plaid_connection["credentials_configured"]
    assert_includes [ true, false ], plaid_connection["scheduled_for_deletion"]
    assert_includes [ true, false ], plaid_connection["pending_account_setup"]
  end

  test "excludes another family's provider connections" do
    other_item = snaptrade_items(:unauthorized_item)

    get api_v1_provider_connections_url, headers: api_headers(@api_key)
    assert_response :success

    ids = JSON.parse(response.body)["data"].map { |connection| connection["id"] }
    assert_not_includes ids, other_item.id
  end

  test "read_write key can list provider connection status" do
    get api_v1_provider_connections_url, headers: api_headers(@read_write_key)
    assert_response :success
  end

  test "lists Brex provider connection status" do
    brex_item = brex_items(:one)

    get api_v1_provider_connections_url, headers: api_headers(@api_key)
    assert_response :success

    brex_connection = JSON.parse(response.body)["data"].detect do |connection|
      connection["id"] == brex_item.id && connection["provider"] == "brex"
    end

    assert_not_nil brex_connection
    assert_equal "BrexItem", brex_connection["provider_type"]
    assert_equal brex_item.name, brex_connection["name"]
    assert_equal brex_item.brex_accounts.count, brex_connection["accounts"]["total_count"]
    assert_equal brex_item.linked_accounts_count, brex_connection["accounts"]["linked_count"]
    assert_equal brex_item.unlinked_accounts_count, brex_connection["accounts"]["unlinked_count"]
  end

  test "reports credentials_configured true for an authorized SnapTrade item" do
    snaptrade_item = snaptrade_items(:configured_item)

    get api_v1_provider_connections_url, headers: api_headers(@api_key)
    assert_response :success

    snaptrade_connection = JSON.parse(response.body)["data"].detect do |connection|
      connection["id"] == snaptrade_item.id && connection["provider"] == "snaptrade"
    end

    assert_not_nil snaptrade_connection
    assert_equal true, snaptrade_connection["credentials_configured"]
  end

  test "returns an empty list when no provider connections exist" do
    ProviderConnectionStatus.stub(:for_family, []) do
      get api_v1_provider_connections_url, headers: api_headers(@api_key)
    end

    assert_response :success
    assert_equal [], JSON.parse(response.body)["data"]
  end

  test "requires authentication" do
    get api_v1_provider_connections_url
    assert_response :unauthorized
  end

  test "rejects api keys without read scope" do
    write_only_key = ApiKey.new(
      user: @user,
      name: "Test Write Key",
      scopes: [ "write" ],
      display_key: "test_write_#{SecureRandom.hex(8)}",
      source: "monitoring"
    ).tap { |api_key| api_key.save!(validate: false) }

    get api_v1_provider_connections_url, headers: api_headers(write_only_key)
    assert_response :forbidden
  end

  test "does not leak internal provider status errors" do
    ProviderConnectionStatus.stub(:for_family, ->(_family) { raise StandardError, "secret provider failure" }) do
      get api_v1_provider_connections_url, headers: api_headers(@api_key)
    end

    assert_response :internal_server_error
    assert_equal "internal_server_error", JSON.parse(response.body)["error"]
    refute_includes response.body, "secret provider failure"
  end

  test "management metadata is family scoped and omits credentials" do
    get "/api/v1/provider_connections/mercury/#{@mercury_item.id}", headers: api_headers(@api_key)
    assert_response :success
    data = response.parsed_body.fetch("data")
    assert_equal @mercury_item.id, data.dig("connection", "id")
    assert_equal "mercury", data.dig("configuration", "provider")
    assert data.fetch("setup").key?("unlinked_accounts")
    refute_includes response.body, @mercury_item.token
  end

  test "configuration options are available without creating a connection" do
    assert_no_difference "MercuryItem.count" do
      get "/api/v1/provider_connections/form_options", params: { provider: "mercury" }, headers: api_headers(@api_key)
    end
    assert_response :success
    assert response.parsed_body.dig("data", "fields").any? { |field| field["name"] == "token" }
  end

  test "writes require read_write scope before mutating a connection" do
    original = @mercury_item.name
    patch "/api/v1/provider_connections/mercury/#{@mercury_item.id}", params: { name: "Changed" }, headers: api_headers(@api_key), as: :json
    assert_response :forbidden
    assert_equal original, @mercury_item.reload.name
  end

  test "members cannot manage tenant-wide provider credentials" do
    @read_write_key.update!(user: users(:family_member))
    patch "/api/v1/provider_connections/mercury/#{@mercury_item.id}", params: { name: "Changed" }, headers: api_headers(@read_write_key), as: :json
    assert_response :forbidden
    get "/api/v1/provider_connections/form_options", params: { provider: "mercury" }, headers: api_headers(@read_write_key)
    assert_response :forbidden
  end

  test "unknown provider and malformed connection identifiers return not found" do
    get "/api/v1/provider_connections/Object/#{@mercury_item.id}", headers: api_headers(@api_key)
    assert_response :not_found
    get "/api/v1/provider_connections/mercury/not-a-uuid", headers: api_headers(@api_key)
    assert_response :not_found
  end

  test "another family's connection cannot be managed" do
    patch "/api/v1/provider_connections/snaptrade/#{snaptrade_items(:unauthorized_item).id}", params: { name: "Changed" }, headers: api_headers(@read_write_key), as: :json
    assert_response :not_found
  end

  test "creates and updates a credential connection with write only credentials" do
    MercuryItem.any_instance.stubs(:sync_later)
    post "/api/v1/provider_connections/mercury", params: { name: "API connection", token: "new-provider-secret" }, headers: api_headers(@read_write_key), as: :json
    assert_response :created
    id = response.parsed_body.dig("data", "id")
    assert_equal "new-provider-secret", @family.mercury_items.find(id).token
    refute_includes response.body, "new-provider-secret"
    patch "/api/v1/provider_connections/mercury/#{id}", params: { name: "Renamed", token: "" }, headers: api_headers(@read_write_key), as: :json
    assert_response :success
    assert_equal "Renamed", @family.mercury_items.find(id).name
    assert_equal "new-provider-secret", @family.mercury_items.find(id).token
  end

  test "invalid configuration and dates return sanitized validation errors" do
    patch "/api/v1/provider_connections/mercury/#{@mercury_item.id}", params: { sync_start_date: "not-a-date" }, headers: api_headers(@read_write_key), as: :json
    assert_response :unprocessable_entity
    post "/api/v1/provider_connections/trading212", params: { environment: "unknown" }, headers: api_headers(@read_write_key), as: :json
    assert_response :unprocessable_entity
    refute_includes response.body, "new-provider-secret"
  end

  test "sync schedules the scoped provider and cancellation resolves pending syncs" do
    post "/api/v1/provider_connections/mercury/#{@mercury_item.id}/sync", headers: api_headers(@read_write_key), as: :json
    assert_response :accepted
    sync = @mercury_item.syncs.ordered.first
    assert sync.pending?
    post "/api/v1/provider_connections/mercury/#{@mercury_item.id}/cancel_sync", headers: api_headers(@read_write_key), as: :json
    assert_response :accepted
    assert sync.reload.stale?
  end

  test "balances-only sync is restricted to SimpleFIN" do
    post "/api/v1/provider_connections/mercury/#{@mercury_item.id}/sync", params: { balances_only: true }, headers: api_headers(@read_write_key), as: :json
    assert_response :unprocessable_entity
  end

  test "setup endpoint reads cached accounts without requesting a provider sync" do
    MercuryItem.any_instance.expects(:sync_later).never
    get "/api/v1/provider_connections/mercury/#{@mercury_item.id}/setup", headers: api_headers(@api_key)
    assert_response :success
    assert response.parsed_body.fetch("data").key?("accounts")
  end

  test "setup validates selection and account tenancy" do
    patch "/api/v1/provider_connections/mercury/#{@mercury_item.id}/setup", params: { selections: "invalid" }, headers: api_headers(@read_write_key), as: :json
    assert_response :unprocessable_entity
    patch "/api/v1/provider_connections/mercury/#{@mercury_item.id}/setup", params: { selections: [ { id: SecureRandom.uuid, accountable_type: "Depository" } ] }, headers: api_headers(@read_write_key), as: :json
    assert_response :not_found
    post "/api/v1/provider_connections/mercury/#{@mercury_item.id}/link", params: { account_id: SecureRandom.uuid, provider_account_id: SecureRandom.uuid }, headers: api_headers(@read_write_key), as: :json
    assert_response :not_found
  end

  test "connection removal aborts when provider unlink reports failures" do
    MercuryItem.any_instance.stubs(:unlink_all!).returns([ { error: "provider-specific-secret" } ])
    MercuryItem.any_instance.expects(:destroy_later).never
    delete "/api/v1/provider_connections/mercury/#{@mercury_item.id}", headers: api_headers(@read_write_key), as: :json
    assert_response :conflict
    refute_includes response.body, "provider-specific-secret"
  end

  test "connection removal performs provider cleanup before scheduling deletion" do
    MercuryItem.any_instance.stubs(:unlink_all!).returns([])
    MercuryItem.any_instance.expects(:destroy_later)
    delete "/api/v1/provider_connections/mercury/#{@mercury_item.id}", headers: api_headers(@read_write_key), as: :json
    assert_response :accepted
  end

  test "configuration actions validate provider support without legacy controller dispatch" do
    post "/api/v1/provider_connections/mercury/#{@mercury_item.id}/configure", params: { action: "unknown" }, headers: api_headers(@read_write_key), as: :json
    assert_response :unprocessable_entity
    post "/api/v1/provider_connections/mercury/#{@mercury_item.id}/dismiss_replacement_suggestion", params: { dormant_sfa_id: "x", active_sfa_id: "y" }, headers: api_headers(@read_write_key), as: :json
    assert_response :unprocessable_entity
  end

  test "brokerage metadata and removal are scoped to authenticated SnapTrade item" do
    item = snaptrade_items(:configured_item)
    SnaptradeItem.any_instance.stubs(:fetch_connections).returns([ { "id" => "authorized", "brokerage" => { "name" => "Broker" } } ])
    get "/api/v1/provider_connections/snaptrade/#{item.id}/connections", headers: api_headers(@api_key)
    assert_response :success
    assert_equal "authorized", response.parsed_body.dig("data", 0, "authorization_id")
    delete "/api/v1/provider_connections/snaptrade/#{item.id}/connections/not-owned", headers: api_headers(@read_write_key), as: :json
    assert_response :not_found
    remote = mock
    remote.expects(:delete_connection).with(authorization_id: "authorized")
    SnaptradeItem.any_instance.stubs(:snaptrade_provider).returns(remote)
    delete "/api/v1/provider_connections/snaptrade/#{item.id}/connections/authorized", headers: api_headers(@read_write_key), as: :json
    assert_response :success
  end

  test "provider failures never expose credentials in errors" do
    MercuryItem.any_instance.stubs(:sync_later).raises(StandardError, "secret-provider-token")
    post "/api/v1/provider_connections/mercury/#{@mercury_item.id}/sync", headers: api_headers(@read_write_key), as: :json
    assert_response :internal_server_error
    refute_includes response.body, "secret-provider-token"
  end

  test "browser credential writes require CSRF while API keys do not" do
    sign_in @user
    original = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    patch "/api/v1/provider_connections/mercury/#{@mercury_item.id}", params: { name: "Blocked" }, as: :json
    assert_response :unprocessable_entity
    refute_equal "Blocked", @mercury_item.reload.name
    patch "/api/v1/provider_connections/mercury/#{@mercury_item.id}", params: { name: "API key write" }, headers: api_headers(@read_write_key), as: :json
    assert_response :success
    assert_equal "API key write", @mercury_item.reload.name
  ensure
    ActionController::Base.allow_forgery_protection = original
  end

  test "SimpleFIN dismissal is scoped idempotent and preserves other sync statistics" do
    item = @family.simplefin_items.create!(name: "SimpleFIN", access_url: "https://example.test/access")
    dormant = item.simplefin_accounts.create!(name: "Dormant", account_id: "old", account_type: "checking", currency: "USD", current_balance: 10)
    active = item.simplefin_accounts.create!(name: "Active", account_id: "new", account_type: "checking", currency: "USD", current_balance: 10)
    sync = item.syncs.create!(status: :completed, completed_at: Time.current, sync_stats: { "total_accounts" => 2 })
    2.times do
      post "/api/v1/provider_connections/simplefin/#{item.id}/dismiss_replacement_suggestion", params: { dormant_sfa_id: dormant.id, active_sfa_id: active.id }, headers: api_headers(@read_write_key), as: :json
      assert_response :success
    end
    assert_equal 2, sync.reload.sync_stats["total_accounts"]
    assert_equal [ "#{dormant.id}:#{active.id}" ], sync.sync_stats["dismissed_replacement_suggestions"]
    post "/api/v1/provider_connections/simplefin/#{item.id}/dismiss_replacement_suggestion", params: { dormant_sfa_id: dormant.id, active_sfa_id: SecureRandom.uuid }, headers: api_headers(@read_write_key), as: :json
    assert_response :not_found
  end

  test "SimpleFIN balances sync queues the existing balances-only job" do
    item = @family.simplefin_items.create!(name: "SimpleFIN", access_url: "https://example.test/access")
    SyncJob.expects(:perform_later).with(instance_of(Sync), balances_only: true)
    post "/api/v1/provider_connections/simplefin/#{item.id}/sync", params: { balances_only: true }, headers: api_headers(@read_write_key), as: :json
    assert_response :accepted
  end

  test "connection removal requires write access to every mapped account" do
    account = @family.accounts.create!(name: "Private member account", owner: users(:family_member), accountable: Crypto.new(subtype: "exchange"), currency: "USD", balance: 10)
    provider_account = kraken_accounts(:one)
    AccountProvider.where(provider: provider_account).destroy_all
    AccountProvider.create!(account: account, provider: provider_account)
    KrakenItem.any_instance.expects(:unlink_all!).never
    KrakenItem.any_instance.expects(:destroy_later).never
    delete "/api/v1/provider_connections/kraken/#{provider_account.kraken_item_id}", headers: api_headers(@read_write_key), as: :json
    assert_response :forbidden
    assert AccountProvider.exists?(account: account, provider: provider_account)
  end

  private

    def api_headers(api_key)
      { "X-Api-Key" => api_key.plain_key }
    end
end
