# frozen_string_literal: true

require "test_helper"

class Api::V1::AccountLinkOptionsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin = users(:family_admin)

    @admin.api_keys.active.destroy_all
    @api_key = ApiKey.create!(
      user: @admin,
      name: "Test Read Key",
      scopes: [ "read" ],
      source: "web",
      display_key: "test_read_#{SecureRandom.hex(8)}"
    )

    @member = users(:family_member)
    @member.api_keys.active.destroy_all
    @member_api_key = ApiKey.create!(
      user: @member,
      name: "Member Read Key",
      scopes: [ "read" ],
      source: "web",
      display_key: "member_read_#{SecureRandom.hex(8)}"
    )
  end

  test "should require authentication" do
    get "/api/v1/account_link_options", params: { account_type: "depository" }
    assert_response :unauthorized
    assert_equal "unauthorized", JSON.parse(response.body)["error"]
  end

  test "should require read scope" do
    api_key_without_read = ApiKey.new(
      user: @admin,
      name: "No Read Key",
      scopes: [],
      source: "web",
      display_key: "no_read_#{SecureRandom.hex(8)}"
    )
    api_key_without_read.save!(validate: false)

    get "/api/v1/account_link_options",
        params: { account_type: "depository" },
        headers: api_headers(api_key_without_read)

    assert_response :forbidden
    assert_equal "insufficient_scope", JSON.parse(response.body)["error"]
  ensure
    api_key_without_read&.destroy
  end

  test "should reject unknown account type with 422" do
    get "/api/v1/account_link_options",
        params: { account_type: "nope" },
        headers: api_headers(@api_key)

    assert_response :unprocessable_entity
    assert_equal "unprocessable_entity", JSON.parse(response.body)["error"]
  end

  test "should reject missing account type with 422" do
    get "/api/v1/account_link_options", headers: api_headers(@api_key)

    assert_response :unprocessable_entity
  end

  test "should return manual path, label and provider shapes" do
    stub_configs = [
      { key: "plaid_us", name: "Plaid", member_connectable: false,
        new_account_path: ->(_type, _return_to) { "/plaid/new" } }
    ]

    Provider::Factory.stub(:connection_configs_for_account_type, stub_configs) do
      get "/api/v1/account_link_options",
          params: { account_type: "depository" },
          headers: api_headers(@api_key)
    end

    assert_response :success
    body = JSON.parse(response.body)
    assert_equal "depository", body["account_type"]
    assert_equal new_depository_path, body["manual_path"]
    assert body["manual_label"].present?
    provider = body.fetch("providers").sole
    assert_equal "plaid_us", provider.fetch("key")
    assert_equal "Plaid", provider.fetch("name")
    uri = URI.parse(provider.fetch("new_account_path"))
    assert_equal "/provider_connections/plaid/new", uri.path
    assert_equal({ "accountable_type" => "Depository", "region" => "us" }, Rack::Utils.parse_query(uri.query))
  end

  test "should pass a safe return_to into paths and drop unsafe values" do
    stub_configs = [
      { key: "plaid_us", name: "Plaid", member_connectable: false,
        new_account_path: ->(_type, return_to) { "/plaid/new?return_to=#{return_to}" } }
    ]

    Provider::Factory.stub(:connection_configs_for_account_type, stub_configs) do
      get "/api/v1/account_link_options",
          params: { account_type: "credit_card", return_to: "/accounts" },
          headers: api_headers(@api_key)
    end

    assert_response :success
    body = JSON.parse(response.body)
    assert_equal new_credit_card_path(return_to: "/accounts"), body["manual_path"]
    assert_equal "/accounts", Rack::Utils.parse_query(URI.parse(body["providers"].first["new_account_path"]).query)["return_to"]

    Provider::Factory.stub(:connection_configs_for_account_type, stub_configs) do
      get "/api/v1/account_link_options",
          params: { account_type: "credit_card", return_to: "https://evil.example" },
          headers: api_headers(@api_key)
    end

    assert_response :success
    body = JSON.parse(response.body)
    assert_equal new_credit_card_path, body["manual_path"]
  end

  test "should hide non-member-connectable providers from members" do
    stub_configs = [
      { key: "plaid_us", name: "Plaid", member_connectable: false,
        new_account_path: ->(_type, _return_to) { "/plaid/new" } },
      { key: "simplefin", name: "SimpleFin", member_connectable: true,
        new_account_path: ->(_type, _return_to) { "/simplefin/new" } }
    ]

    Provider::Factory.stub(:connection_configs_for_account_type, stub_configs) do
      get "/api/v1/account_link_options",
          params: { account_type: "depository" },
          headers: api_headers(@member_api_key)
    end

    assert_response :success
    providers = JSON.parse(response.body)["providers"]
    assert_equal [ "simplefin" ], providers.map { |p| p["key"] }

    Provider::Factory.stub(:connection_configs_for_account_type, stub_configs) do
      get "/api/v1/account_link_options",
          params: { account_type: "depository" },
          headers: api_headers(@api_key)
    end

    assert_response :success
    providers = JSON.parse(response.body)["providers"]
    assert_equal %w[plaid_us simplefin], providers.map { |p| p["key"] }
  end

  test "connection-specific provider options preserve selection in the SPA setup path" do
    item = mercury_items(:one)
    configs = [ { key: "mercury_#{item.id}", name: item.name, new_account_path: ->(*) { raise "Legacy navigation must not be used" } } ]
    Provider::Factory.stub(:connection_configs_for_account_type, configs) do
      get "/api/v1/account_link_options", params: { account_type: "depository" }, headers: api_headers(@api_key)
    end
    assert_response :success
    path = response.parsed_body.fetch("providers").sole.fetch("new_account_path")
    assert_equal "/provider_connections/mercury/#{item.id}/setup", URI.parse(path).path
  end
end
