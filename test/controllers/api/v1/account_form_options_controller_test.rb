# frozen_string_literal: true

require "test_helper"

class Api::V1::AccountFormOptionsControllerTest < ActionDispatch::IntegrationTest
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
  end

  test "should require authentication" do
    get "/api/v1/account_form_options"
    assert_response :unauthorized

    response_body = JSON.parse(response.body)
    assert_equal "unauthorized", response_body["error"]
  end

  test "should require read scope" do
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

    get "/api/v1/account_form_options", headers: api_headers(api_key_without_read)

    assert_response :forbidden
    response_body = JSON.parse(response.body)
    assert_equal "insufficient_scope", response_body["error"]
  ensure
    api_key_without_read&.destroy
  end

  test "should return option data with read key" do
    get "/api/v1/account_form_options", headers: api_headers(@api_key)

    assert_response :success
    response_body = JSON.parse(response.body)

    %w[account_types subtypes tax_treatments loan_rate_types loan_insurance_rate_types mileage_units currencies default_currency].each do |key|
      assert response_body.key?(key), "expected response to include #{key}"
    end
  end

  test "should list the seven non-property account types" do
    get "/api/v1/account_form_options", headers: api_headers(@api_key)

    assert_response :success
    values = JSON.parse(response.body).fetch("account_types").map { |option| option["value"] }

    assert_equal %w[depository investment crypto vehicle other_asset credit_card loan other_liability], values
  end

  test "should include subtype options per type with investment groups" do
    get "/api/v1/account_form_options", headers: api_headers(@api_key)

    assert_response :success
    subtypes = JSON.parse(response.body).fetch("subtypes")

    assert_equal %w[depository investment crypto vehicle other_asset credit_card loan other_liability], subtypes.keys

    depository_values = subtypes.fetch("depository").map { |option| option["value"] }
    assert_includes depository_values, "checking"
    assert_includes depository_values, "savings"

    loan_values = subtypes.fetch("loan").map { |option| option["value"] }
    assert_includes loan_values, "mortgage"

    crypto_values = subtypes.fetch("crypto").map { |option| option["value"] }
    assert_equal %w[wallet exchange], crypto_values

    assert_equal [], subtypes.fetch("vehicle")
    assert_equal [], subtypes.fetch("other_asset")
    assert_equal [], subtypes.fetch("other_liability")

    investment_options = subtypes.fetch("investment")
    assert investment_options.length > 10
    assert investment_options.all? { |option| option["group"].present? }
    groups = investment_options.map { |option| option["group"] }.uniq
    assert_includes groups, "United States"
    assert_includes investment_options.map { |option| option["value"] }, "brokerage"
  end

  test "should return labeled select data without hardcoding" do
    get "/api/v1/account_form_options", headers: api_headers(@api_key)

    assert_response :success
    response_body = JSON.parse(response.body)

    tax_values = response_body.fetch("tax_treatments").map { |option| option["value"] }
    assert_equal %w[taxable tax_deferred tax_exempt], tax_values
    assert response_body.fetch("tax_treatments").all? { |option| option["label"].present? }

    rate_values = response_body.fetch("loan_rate_types").map { |option| option["value"] }
    assert_equal %w[fixed variable adjustable], rate_values

    insurance_values = response_body.fetch("loan_insurance_rate_types").map { |option| option["value"] }
    assert_equal %w[level_term decreasing_life], insurance_values

    mileage_values = response_body.fetch("mileage_units").map { |option| option["value"] }
    assert_equal %w[mi km], mileage_values

    currencies = response_body.fetch("currencies")
    assert currencies.any? { |option| option["value"] == "USD" }
    assert response_body["default_currency"].present?
  end
end
