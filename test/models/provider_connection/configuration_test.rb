require "test_helper"

class ProviderConnection::ConfigurationTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  setup do
    @family = families(:dylan_family)
    @user = users(:family_admin)
  end

  test "every registered provider has configuration metadata and account type selections" do
    ProviderConnectionStatus::PROVIDERS.each do |provider|
      metadata = connection(provider[:key]).configuration
      assert_equal provider[:key], metadata[:provider]
      assert metadata[:account_types].any?, provider[:key]
      assert_kind_of Array, metadata[:fields]
      assert_kind_of Hash, metadata[:authorization]
    end
  end

  test "SnapTrade metadata selects the configured device grant and scopes reauthorization to the item" do
    item = snaptrade_items(:configured_item)
    Provider::Snaptrade.stubs(:authorization_code_configured?).returns(false)
    Provider::Snaptrade.stubs(:oauth_configured?).returns(true)
    authorization = connection("snaptrade", item).configuration[:authorization]
    assert_equal [ "device_code" ], authorization[:flows].map { |flow| flow[:name] }
    assert_equal "device_authorize", authorization[:flows].sole[:action]
    assert_equal Rails.application.routes.url_helpers.connect_snaptrade_item_path(item), authorization[:href]
  end

  test "metadata keeps credential values write only while reporting configured state" do
    item = trading212_items(:configured_item)
    metadata = connection("trading212", item).configuration
    %w[api_key api_secret].each do |name|
      field = metadata[:fields].find { |candidate| candidate[:name] == name }
      assert field[:configured]
      assert_not field.key?(:value)
    end
    assert_equal "live", metadata[:fields].find { |field| field[:name] == "environment" }[:value]
    assert_not_includes metadata.to_json, item.api_secret
  end

  test "members cannot read or mutate administrator provider configuration" do
    subject = ProviderConnection.new(family: @family, user: users(:family_member), provider: "fio")
    assert_raises(ProviderConnection::Forbidden) { subject.configuration }
    assert_no_difference "FioItem.count" do
      assert_raises(ProviderConnection::Forbidden) { subject.create!(token: "token") }
    end
  end

  test "foreign family administrators cannot manage configuration" do
    subject = ProviderConnection.new(family: @family, user: users(:empty), provider: "fio", id: fio_items(:one).id)
    assert_raises(ProviderConnection::Forbidden) { subject.update!(name: "changed") }
    assert_equal "Test Fio Connection", fio_items(:one).reload.name
  end

  test "connection and provider identifiers cannot cross provider or family boundaries" do
    assert_raises(ActiveRecord::RecordNotFound) { connection("File") }
    assert_raises(ActiveRecord::RecordNotFound) { connection("fio", trading212_items(:configured_item)) }
    assert_raises(ActiveRecord::RecordNotFound) do
      ProviderConnection.new(family: families(:empty), user: users(:empty), provider: "fio", id: fio_items(:one).id)
    end
  end

  test "credential providers create real family scoped items through the same domain" do
    credentials = {
      "akahu" => { app_token: "app", user_token: "user" },
      "up" => { access_token: "up-token" },
      "monobank" => { access_token: "mono-token" },
      "fio" => { token: "fio-token" },
      "lunchflow" => { api_key: "lunchflow-key" },
      "enable_banking" => { country_code: "DE", application_id: "app", client_certificate: "certificate" },
      "coinbase" => { api_key: "key", api_secret: "secret" },
      "binance" => { api_key: "key", api_secret: "secret" },
      "kraken" => { api_key: "key", api_secret: "secret" },
      "coinspot" => { api_key: "key", api_secret: "secret" },
      "onchain_wallet" => {},
      "coinstats" => { api_key: "coinstats-key" },
      "snaptrade" => {},
      "ibkr" => { query_id: "123", token: "ibkr-token" },
      "mercury" => { token: "mercury-token" },
      "brex" => { token: "brex-token" },
      "sophtron" => { user_id: "developer", access_key: Base64.strict_encode64("secret") },
      "indexa_capital" => { api_token: "indexa-token" },
      "trading212" => { api_key: "key", api_secret: "secret", environment: "demo" },
      "questrade" => { refresh_token: "questrade-token" },
      "redbark" => { api_key: "redbark-key" }
    }
    CoinstatsItem.any_instance.stubs(:validate_api_key!).returns(true)
    SophtronItem.any_instance.stubs(:verify_and_provision_customer!).returns(true)
    credentials.each do |provider, attributes|
      subject = connection(provider)
      subject.items.klass.any_instance.stubs(:sync_later)
      item = subject.create!(attributes.merge(family_id: families(:empty).id, status: "requires_update"))
      assert item.persisted?, provider
      assert_equal @family.id, item.family_id, provider
      assert_equal item, subject.item
      attributes.each { |field, value| assert_equal value, item.public_send(field), "#{provider}.#{field}" }
      subject.update!(attributes)
      assert_equal @family.id, item.reload.family_id, provider
    end
  end

  test "invalid credentials and environment do not create a connection" do
    assert_no_difference "FioItem.count" do
      assert_raises(ActiveRecord::RecordInvalid) { connection("fio").create!(token: " ") }
    end
    assert_no_difference "Trading212Item.count" do
      assert_raises(ProviderConnection::Invalid) do
        connection("trading212").create!(api_key: "key", api_secret: "secret", environment: "arbitrary")
      end
    end
  end

  test "invalid sync dates fail before provider writes instead of being cast to nil" do
    assert_no_difference "FioItem.count" do
      assert_raises(ProviderConnection::Invalid) do
        connection("fio").create!(token: "token", sync_start_date: "not-a-date")
      end
    end
    item = fio_items(:one)
    original = item.sync_start_date
    assert_raises(ProviderConnection::Invalid) do
      connection("fio", item).update!(sync_start_date: "2026-02-30")
    end
    assert_equal original, item.reload.sync_start_date
  end

  test "Coinstats rejects invalid provider credentials before persistence" do
    provider = mock
    Provider::Coinstats.expects(:new).with("invalid-key").returns(provider)
    provider.expects(:get_blockchains).returns(OpenStruct.new(success?: false, error: StandardError.new("invalid-key")))
    assert_no_difference "CoinstatsItem.count" do
      error = assert_raises(ActiveRecord::RecordInvalid) { connection("coinstats").create!(api_key: "invalid-key") }
      assert_not_includes error.record.errors.full_messages.join, "invalid-key"
    end
  end

  test "blank update credentials keep the stored secrets and provider protected attributes" do
    item = trading212_items(:configured_item)
    item.update!(status: :requires_update)
    subject = connection("trading212", item)
    subject.item.stubs(:sync_later)
    subject.update!(api_key: "", api_secret: "", environment: "demo", family_id: families(:empty).id)
    item.reload
    assert_equal "test_api_key", item.api_key
    assert_equal "test_api_secret", item.api_secret
    assert_equal "demo", item.environment
    assert_equal "good", item.status
    assert_equal @family.id, item.family_id
  end

  test "Indexa can switch from token to complete username credentials without retaining the old token as active" do
    item = indexa_capital_items(:configured_with_token)
    connection("indexa_capital", item).update!(api_token: "", username: "user@example.com", document: "12345678A", password: "new-password")
    item.reload
    assert_nil item.api_token
    assert_equal "user@example.com", item.username
    assert_equal "new-password", item.password
  end

  test "fio token rotation rearms history and schedules validation sync" do
    item = fio_items(:one)
    item.update!(status: :requires_update, history_unlock_required_at: Time.current)
    subject = connection("fio", item)
    subject.item.expects(:sync_later)
    subject.update!(token: " rotated-token ")
    item.reload
    assert_equal "rotated-token", item.token
    assert_equal "good", item.status
    assert_nil item.history_unlock_required_at
  end

  test "simplefin creation claims access and update preserves asynchronous replacement" do
    provider = mock
    Provider::Simplefin.expects(:new).returns(provider)
    provider.expects(:claim_access_url).with("setup").returns("https://user:secret@example.com/simplefin")
    SimplefinItem.any_instance.stubs(:sync_later)
    subject = connection("simplefin")
    item = subject.create!(setup_token: "setup")
    assert_equal "https://user:secret@example.com/simplefin", item.access_url
    metadata = subject.configuration
    assert_not_includes metadata.to_json, item.access_url
    token = Base64.strict_encode64("https://example.com/claim")
    assert_enqueued_with(job: SimplefinConnectionUpdateJob, args: [ { family_id: @family.id, old_simplefin_item_id: item.id, setup_token: token } ]) do
      subject.update!(setup_token: token)
    end
  end

  test "wise profile must come from the provided token and stored tokens never appear in metadata" do
    provider = mock
    Provider::Wise.stubs(:new).with("new-token", base_url: Rails.configuration.x.wise.base_url).returns(provider)
    provider.stubs(:get_profiles).returns([ { "id" => 99, "type" => "personal" } ])
    assert_raises(ProviderConnection::Invalid) { connection("wise").create!(token: "new-token", profile_id: "100") }
    WiseItem.any_instance.stubs(:sync_later)
    subject = connection("wise")
    item = subject.create!(token: "new-token", profile_id: "99")
    assert_equal "99", item.profile_id
    assert_equal "personal", item.profile_type
    assert_not_includes subject.configuration.to_json, "new-token"
  end

  test "plaid exchanges a public token with explicit owner rather than ambient Current user" do
    @family.stubs(:can_connect_plaid_us?).returns(true)
    provider = mock
    Provider::Registry.expects(:plaid_provider_for_region).with("us").returns(provider)
    provider.expects(:exchange_public_token).with("public").returns(OpenStruct.new(item_id: "remote-new", access_token: "plaid-secret"))
    PlaidItem.any_instance.stubs(:sync_later)
    Current.set(session: users(:empty).sessions.create!) do
      item = connection("plaid").create!(public_token: "public", region: "us", name: "Bank")
      assert_equal @user, item.owner
      assert_equal @family, item.family
    end
  end

  test "Plaid link token action uses trusted server URLs and validates account types" do
    @family.stubs(:can_connect_plaid_us?).returns(true)
    subject = connection("plaid")
    subject.configuration_url_options = { host: "example.com", protocol: "https" }
    @family.expects(:get_link_token).with(
      webhooks_url: @family.plaid_webhooks_url(region: :us, url_options: { host: "example.com", protocol: "https" }),
      redirect_url: Rails.application.routes.url_helpers.accounts_url(host: "example.com", protocol: "https"),
      accountable_type: "Depository", region: :us
    ).returns("temporary-link-token")
    assert_equal({ link_token: "temporary-link-token" }, subject.configure_action!("link_token", region: "us"))
    assert_raises(ProviderConnection::Invalid) do
      subject.configure_action!("link_token", region: "us", accountable_type: "User")
    end
  end

  test "unknown configuration actions are rejected without treating credentials as executable operations" do
    assert_raises(ProviderConnection::Invalid) { connection("fio").configure_action!("destroy_all", {}) }
    assert_raises(ProviderConnection::Invalid) { connection("plaid").create!(public_token: "public", region: "arbitrary") }
  end

  private

    def connection(provider, item = nil)
      ProviderConnection.new(family: @family, user: @user, provider: provider, id: item&.id)
    end
end
