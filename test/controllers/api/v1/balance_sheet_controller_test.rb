# frozen_string_literal: true

require "test_helper"

# Behavioral coverage for the core dashboard API contract
# (GET /api/v1/balance_sheet). Covers totals, bounded trend periods,
# grouped account summaries, sync state, authorization, family scoping,
# and the empty / single-currency / multi-currency / stale / syncing
# contract fixtures. See docs/api/dashboard.md.
class Api::V1::BalanceSheetControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @family = @user.family

    @user.api_keys.active.destroy_all

    @auth = ApiKey.create!(
      user: @user,
      name: "Test Read Key",
      scopes: [ "read" ],
      display_key: "test_ro_#{SecureRandom.hex(8)}",
      source: "mobile"
    )

    Redis.new.del("api_rate_limit:#{@auth.id}")
  end

  test "should require authentication" do
    get "/api/v1/balance_sheet"
    assert_response :unauthorized
  end

  test "should require read scope" do
    key_without_read = ApiKey.new(
      user: @user,
      name: "No Read Key",
      scopes: [],
      source: "mobile",
      display_key: "no_read_#{SecureRandom.hex(8)}"
    )
    key_without_read.save!(validate: false)

    get "/api/v1/balance_sheet", headers: api_headers(key_without_read)
    assert_response :forbidden
  ensure
    key_without_read&.destroy
  end

  test "should return balance sheet with net worth data" do
    get "/api/v1/balance_sheet", headers: api_headers(@auth)

    assert_response :success
    response_body = JSON.parse(response.body)

    assert response_body.key?("currency")
    assert response_body.key?("net_worth")
    assert response_body.key?("assets")
    assert response_body.key?("liabilities")

    %w[net_worth assets liabilities].each do |field|
      assert response_body[field].key?("amount"), "#{field} should have amount"
      assert response_body[field].key?("currency"), "#{field} should have currency"
      assert response_body[field].key?("formatted"), "#{field} should have formatted"
    end
  end

  test "should return dashboard payload with trend, groups, and sync" do
    get "/api/v1/balance_sheet", headers: api_headers(@auth)

    assert_response :success
    response_body = JSON.parse(response.body)

    assert_equal @family.currency, response_body["currency"]
    assert_equal Time.zone.today.iso8601, response_body["as_of"]
    listed_count = response_body["groups"].flat_map { |group| group["account_groups"] }
      .sum { |group| group["accounts_count"] }
    assert_equal listed_count, response_body["accounts_count"]
    assert_operator response_body["accounts_count"], :>, 0

    trend = response_body["trend"]
    assert_equal "last_30_days", trend["period"]
    assert trend["start_date"] <= trend["end_date"]
    assert_not_empty trend["values"]
    trend["values"].each do |point|
      assert point.key?("date")
      assert point["value"].key?("amount")
      assert_equal @family.currency, point["value"]["currency"]
    end

    classifications = response_body["groups"].map { |group| group["classification"] }
    assert_includes classifications, "asset"
    assert_includes classifications, "liability"

    asset_group = response_body["groups"].find { |group| group["classification"] == "asset" }
    assert asset_group.key?("total")
    assert asset_group.key?("syncing")
    assert_not_empty asset_group["account_groups"]
    depository = asset_group["account_groups"].find { |group| group["key"] == "depository" }
    assert_not_nil depository
    assert_not_empty depository["accounts"]
    account = depository["accounts"].first
    %w[id name currency balance converted_balance classification syncing].each do |field|
      assert account.key?(field), "account should have #{field}"
    end

    sync = response_body["sync"]
    assert_includes [ true, false ], sync["syncing"]
    assert_includes [ true, false ], sync["stale"]
  end

  test "should scope totals and groups to the caller's family" do
    other_family = families(:empty)
    other_user = users(:new_email)
    other_user.api_keys.active.destroy_all
    other_auth = ApiKey.create!(
      user: other_user,
      name: "Other Family Read Key",
      scopes: [ "read" ],
      display_key: "test_other_ro_#{SecureRandom.hex(8)}",
      source: "mobile"
    )

    get "/api/v1/balance_sheet", headers: api_headers(other_auth)

    assert_response :success
    response_body = JSON.parse(response.body)
    assert_equal other_family.currency, response_body["currency"]
    assert_equal 0, response_body["accounts_count"]
    assert_empty response_body["groups"].flat_map { |group| group["account_groups"] }
  ensure
    other_auth&.destroy
  end

  test "should represent an empty family without errors" do
    other_user = users(:new_email)
    other_user.api_keys.active.destroy_all
    other_auth = ApiKey.create!(
      user: other_user,
      name: "Empty Family Read Key",
      scopes: [ "read" ],
      display_key: "test_empty_ro_#{SecureRandom.hex(8)}",
      source: "mobile"
    )

    get "/api/v1/balance_sheet", headers: api_headers(other_auth)

    assert_response :success
    response_body = JSON.parse(response.body)

    assert_equal 0, response_body["accounts_count"]
    assert_equal 0, response_body["net_worth"]["amount"].to_f
    assert_empty response_body["groups"].flat_map { |group| group["account_groups"] }
    assert_not_nil response_body["trend"]["values"]
    assert_equal false, response_body["sync"]["syncing"]
    assert_nil response_body["sync"]["latest"]
  ensure
    other_auth&.destroy
  end

  test "should convert single foreign-currency account into family currency" do
    @family.accounts.create!(
      owner: @user,
      name: "Euro Savings",
      balance: 1000,
      currency: "EUR",
      accountable: Depository.new
    )
    ExchangeRate.create!(from_currency: "EUR", to_currency: @family.currency, rate: 1.1, date: Date.current)

    get "/api/v1/balance_sheet", headers: api_headers(@auth)

    assert_response :success
    response_body = JSON.parse(response.body)
    euro_account = response_body["groups"].flat_map { |group| group["account_groups"] }
      .flat_map { |group| group["accounts"] }
      .find { |account| account["name"] == "Euro Savings" }

    assert_not_nil euro_account
    assert_equal "EUR", euro_account["currency"]
    assert_equal "EUR", euro_account["balance"]["currency"]
    assert_equal @family.currency, euro_account["converted_balance"]["currency"]
    assert_in_delta 1100, euro_account["converted_balance"]["amount"].to_f, 0.01
  end

  test "should aggregate multi-currency accounts into family totals" do
    @family.accounts.create!(
      owner: @user,
      name: "Euro Savings",
      balance: 1000,
      currency: "EUR",
      accountable: Depository.new
    )
    @family.accounts.create!(
      owner: @user,
      name: "Pound Savings",
      balance: 2000,
      currency: "GBP",
      accountable: Depository.new
    )
    ExchangeRate.create!(from_currency: "EUR", to_currency: @family.currency, rate: 1.1, date: Date.current)
    ExchangeRate.create!(from_currency: "GBP", to_currency: @family.currency, rate: 1.3, date: Date.current)

    get "/api/v1/balance_sheet", headers: api_headers(@auth)

    assert_response :success
    response_body = JSON.parse(response.body)
    accounts = response_body["groups"].flat_map { |group| group["account_groups"] }
      .flat_map { |group| group["accounts"] }
    assert_includes accounts.map { |account| account["name"] }, "Euro Savings"
    assert_includes accounts.map { |account| account["name"] }, "Pound Savings"
    assert_equal @family.currency, response_body["net_worth"]["currency"]
  end

  test "should accept each bounded trend period" do
    %w[last_7_days last_30_days last_90_days last_365_days current_month current_year].each do |period|
      get "/api/v1/balance_sheet", params: { period: period }, headers: api_headers(@auth)

      assert_response :success, "expected success for period=#{period}"
      trend = JSON.parse(response.body)["trend"]
      assert_equal period, trend["period"]
      assert_operator trend["values"].size, :<=, 400
    end
  end

  test "should reject unbounded trend periods" do
    get "/api/v1/balance_sheet", params: { period: "last_decade" }, headers: api_headers(@auth)

    assert_response :unprocessable_entity
    response_body = JSON.parse(response.body)
    assert_equal "validation_failed", response_body["error"]
  end

  test "should report syncing state while a visible sync is in progress" do
    Sync.for_family(@family).destroy_all
    Sync.create!(syncable: @family, status: "syncing", syncing_at: Time.current)

    get "/api/v1/balance_sheet", headers: api_headers(@auth)

    assert_response :success
    sync = JSON.parse(response.body)["sync"]
    assert_equal true, sync["syncing"]
    assert_not_nil sync["latest"]
    assert_equal "syncing", sync["latest"]["status"]
  ensure
    Sync.for_family(@family).destroy_all
  end

  test "should report stale state when the last sync completed over a day ago" do
    Sync.for_family(@family).destroy_all
    @family.touch(:latest_sync_completed_at)
    @family.update_column(:latest_sync_completed_at, 2.days.ago)

    get "/api/v1/balance_sheet", headers: api_headers(@auth)

    assert_response :success
    sync = JSON.parse(response.body)["sync"]
    assert_equal false, sync["syncing"]
    assert_equal true, sync["stale"]
    assert_not_nil sync["last_completed_at"]
  ensure
    Sync.for_family(@family).destroy_all
    @family.touch(:latest_sync_completed_at)
    @family.touch(:latest_sync_activity_at)
  end

  test "should report fresh state after a recent completed sync" do
    Sync.for_family(@family).destroy_all
    Sync.create!(syncable: @family, status: "completed", completed_at: 1.hour.ago)

    get "/api/v1/balance_sheet", headers: api_headers(@auth)

    assert_response :success
    sync = JSON.parse(response.body)["sync"]
    assert_equal false, sync["syncing"]
    assert_equal false, sync["stale"]
    assert_not_nil sync["last_completed_at"]
  ensure
    Sync.for_family(@family).destroy_all
    @family.touch(:latest_sync_completed_at)
    @family.touch(:latest_sync_activity_at)
  end
end
