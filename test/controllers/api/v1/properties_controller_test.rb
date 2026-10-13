# frozen_string_literal: true

require "test_helper"

class Api::V1::PropertiesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)

    @user.api_keys.active.destroy_all
    @api_key = ApiKey.create!(
      user: @user,
      name: "Test Read Key",
      scopes: [ "read" ],
      source: "web",
      display_key: "test_read_#{SecureRandom.hex(8)}"
    )
    @read_write_api_key = ApiKey.create!(
      user: @user,
      name: "Test Read Write Key",
      scopes: [ "read_write" ],
      source: "mobile",
      display_key: "test_read_write_#{SecureRandom.hex(8)}"
    )
  end

  test "should require authentication" do
    get "/api/v1/properties/form_options"
    assert_response :unauthorized

    response_body = JSON.parse(response.body)
    assert_equal "unauthorized", response_body["error"]
  end

  test "should require read scope for form options" do
    api_key_without_read = ApiKey.new(
      user: @user,
      name: "No Read Key",
      scopes: [],
      source: "web",
      display_key: "no_read_#{SecureRandom.hex(8)}"
    )
    # Valid persisted API keys can only be read/read_write; this intentionally
    # bypasses validations to exercise the runtime insufficient-scope guard.
    api_key_without_read.save!(validate: false)

    get "/api/v1/properties/form_options", headers: api_headers(api_key_without_read)

    assert_response :forbidden
    response_body = JSON.parse(response.body)
    assert_equal "insufficient_scope", response_body["error"]
  ensure
    api_key_without_read&.destroy
  end

  test "should return property option data with read key" do
    get "/api/v1/properties/form_options", headers: api_headers(@api_key)

    assert_response :success
    response_body = JSON.parse(response.body)

    %w[subtypes area_units avm_providers currencies default_currency].each do |key|
      assert response_body.key?(key), "expected response to include #{key}"
    end

    subtype_values = response_body.fetch("subtypes").map { |option| option["value"] }
    assert_includes subtype_values, "single_family_home"
    assert_includes subtype_values, "condominium"
    assert response_body.fetch("subtypes").all? { |option| option["label"].present? }

    area_values = response_body.fetch("area_units").map { |option| option["value"] }
    assert_equal %w[sqft sqm], area_values

    assert response_body["default_currency"].present?
  end

  test "should scope property subtypes to property only" do
    get "/api/v1/properties/form_options", headers: api_headers(@api_key)

    assert_response :success
    subtype_values = JSON.parse(response.body).fetch("subtypes").map { |option| option["value"] }

    assert_not_includes subtype_values, "checking"
    assert_not_includes subtype_values, "mortgage"
  end

  test "should reject create with read-only key" do
    post "/api/v1/properties",
      params: { account: { name: "Cabin", accountable_attributes: { subtype: "second_home" } } },
      headers: api_headers(@api_key)

    assert_response :forbidden
    response_body = JSON.parse(response.body)
    assert_equal "insufficient_scope", response_body["error"]
  end

  test "should create a draft property with write key" do
    assert_difference -> { Account.count } => 1 do
      post "/api/v1/properties",
        params: {
          account: {
            name: "Lake Cabin",
            currency: "USD",
            accountable_attributes: { subtype: "second_home", year_built: 1990, area_value: 1200, area_unit: "sqft" }
          }
        },
        headers: api_headers(@read_write_api_key)
    end

    assert_response :created
    response_body = JSON.parse(response.body)
    assert_equal "draft", response_body["status"]

    created_account = Account.find(response_body["id"])
    assert_equal "Lake Cabin", created_account.name
    assert created_account.accountable.is_a?(Property)
    assert_equal 0, created_account.balance
    assert_equal "second_home", created_account.subtype
    assert_equal 1990, created_account.accountable.year_built
    assert_equal 1200, created_account.accountable.area_value
  end

  test "should reject create with invalid params" do
    assert_no_difference "Account.count" do
      post "/api/v1/properties",
        params: { account: { name: "" } },
        headers: api_headers(@read_write_api_key)
    end

    assert_response :unprocessable_entity
    response_body = JSON.parse(response.body)
    assert_equal "validation_failed", response_body["error"]
  end

  test "should update address and activate the draft account" do
    account = @user.family.accounts.create!(
      name: "Draft Cabin",
      balance: 0,
      status: "draft",
      owner: @user,
      currency: @user.family.currency,
      accountable: Property.new(subtype: "second_home")
    )

    patch "/api/v1/properties/#{account.id}/address",
      params: {
        property: {
          address_attributes: {
            line1: "123 Main St",
            locality: "San Francisco",
            region: "CA",
            country: "US",
            postal_code: "94101"
          }
        }
      },
      headers: api_headers(@read_write_api_key)

    assert_response :success
    account.reload
    assert_equal "active", account.status
    assert_equal "123 Main St", account.property.address.line1
    assert_equal "San Francisco", account.property.address.locality
  end

  test "should return not found for address update on missing account" do
    patch "/api/v1/properties/#{SecureRandom.uuid}/address",
      params: { property: { address_attributes: { line1: "123 Main St" } } },
      headers: api_headers(@read_write_api_key)

    assert_response :not_found
  end

  test "should return not found for address update on non-property account" do
    depository = @user.family.accounts.where(accountable_type: "Depository").first

    patch "/api/v1/properties/#{depository.id}/address",
      params: { property: { address_attributes: { line1: "123 Main St" } } },
      headers: api_headers(@read_write_api_key)

    assert_response :not_found
  end

  test "should reject avm lookup for unconfigured providers" do
    Provider::Registry.stubs(:rentcast).returns(nil)
    Provider::Registry.stubs(:realie).returns(nil)

    post "/api/v1/properties/avm_lookup",
      params: {
        avm_provider: "rentcast",
        account: {
          name: "AVM Home",
          address: { line1: "1 Main St", locality: "Austin", region: "TX", postal_code: "78701" }
        }
      },
      headers: api_headers(@read_write_api_key)

    assert_response :unprocessable_entity
    response_body = JSON.parse(response.body)
    assert_equal "validation_failed", response_body["error"]
  end

  test "should reject incomplete avm lookup before calling the provider" do
    provider = mock
    provider.expects(:fetch_property_valuation).never
    Provider::Registry.stubs(:rentcast).returns(provider)

    post "/api/v1/properties/avm_lookup",
      params: {
        avm_provider: "rentcast",
        account: { name: "", address: { line1: "", locality: "", region: "", postal_code: "" } }
      },
      headers: api_headers(@read_write_api_key)

    assert_response :unprocessable_entity
  end

  test "should look up an avm preview without creating an account" do
    valuation = Provider::PropertyValuationConcept::PropertyValuation.new(
      valuation: 356_000, currency: "USD", property_type: "single_family_home",
      year_built: 1973, area_value: 1878, area_unit: "sqft"
    )
    provider = mock
    provider.expects(:fetch_property_valuation).with(
      line1: "5500 Grand Lake Dr", locality: "San Antonio", region: "TX", postal_code: "78244"
    ).returns(Provider::Response.new(success?: true, data: valuation, error: nil))
    Provider::Registry.stubs(:rentcast).returns(provider)

    assert_no_difference "Account.count" do
      post "/api/v1/properties/avm_lookup",
        params: {
          avm_provider: "rentcast",
          account: {
            name: "AVM Home",
            address: {
              line1: "5500 Grand Lake Dr", locality: "San Antonio", region: "TX", postal_code: "78244"
            }
          }
        },
        headers: api_headers(@read_write_api_key)
    end

    assert_response :success
    response_body = JSON.parse(response.body)
    assert_equal "rentcast", response_body["provider_key"]
    assert_equal "356000", response_body.dig("preview", "valuation").to_s
    assert_equal "single_family_home", response_body.dig("preview", "property_type")
    assert response_body["preview_token"].present?
  end

  test "should confirm an avm preview from the signed token without a provider call" do
    provider = mock
    provider.expects(:fetch_property_valuation).never
    Provider::Registry.stubs(:rentcast).returns(provider)

    assert_difference -> { Account.count } => 1 do
      post "/api/v1/properties/avm_confirm",
        params: {
          avm_provider: "rentcast",
          avm_preview_token: signed_preview_token,
          account: { accountable_type: "Property" }
        },
        headers: api_headers(@read_write_api_key)
    end

    assert_response :created
    response_body = JSON.parse(response.body)

    created_account = Account.find(response_body["id"])
    assert created_account.active?
    assert_equal "AVM Home", created_account.name
    assert_equal 356_000, created_account.balance
    assert_equal "rentcast", created_account.accountable.avm_provider
    assert_equal "single_family_home", created_account.subtype
    assert_equal "5500 Grand Lake Dr", created_account.property.address.line1
    assert_equal "US", created_account.property.address.country
  end

  test "should reject avm confirm without a valid signed preview token" do
    assert_no_difference "Account.count" do
      post "/api/v1/properties/avm_confirm",
        params: { avm_provider: "rentcast", avm_preview_token: "forged", account: { accountable_type: "Property" } },
        headers: api_headers(@read_write_api_key)
    end

    assert_response :unprocessable_entity
  end

  test "should reject an avm preview token minted for another family" do
    other_family = families(:empty)

    assert_no_difference "Account.count" do
      post "/api/v1/properties/avm_confirm",
        params: {
          avm_provider: "rentcast",
          avm_preview_token: signed_preview_token(family: other_family),
          account: { accountable_type: "Property" }
        },
        headers: api_headers(@read_write_api_key)
    end

    assert_response :unprocessable_entity
  end

  private
    def api_headers(api_key)
      { "X-Api-Key" => api_key.display_key }
    end

    def signed_preview_token(family: @user.family)
      Rails.application.message_verifier(:avm_preview).generate(
        {
          "provider_key" => "rentcast",
          "name" => "AVM Home",
          "address" => {
            "line1" => "5500 Grand Lake Dr",
            "locality" => "San Antonio",
            "region" => "TX",
            "postal_code" => "78244"
          },
          "data" => {
            "valuation" => "356000.0",
            "currency" => "USD",
            "property_type" => "single_family_home",
            "year_built" => "1973",
            "area_value" => "1878",
            "area_unit" => "sqft"
          }
        },
        expires_in: 1.hour,
        purpose: "avm_preview/family/#{family.id}"
      )
    end
end
