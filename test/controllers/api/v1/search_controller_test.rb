# frozen_string_literal: true

require "test_helper"

class Api::V1::SearchControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @family = @user.family
    @user.api_keys.active.destroy_all

    @api_key = ApiKey.create!(
      user: @user,
      name: "Test Read-Write Key",
      scopes: [ "read_write" ],
      display_key: "test_rw_#{SecureRandom.hex(8)}"
    )

    @read_only_api_key = ApiKey.create!(
      user: @user,
      name: "Test Read-Only Key",
      scopes: [ "read" ],
      display_key: "test_ro_#{SecureRandom.hex(8)}",
      source: "mobile"
    )

    Redis.new.del("api_rate_limit:#{@api_key.id}")
    Redis.new.del("api_rate_limit:#{@read_only_api_key.id}")
  end

  test "requires authentication" do
    get "/api/v1/search", params: { q: "checking" }
    assert_response :unauthorized
  end

  test "blank query returns empty grouped results" do
    get "/api/v1/search", headers: api_headers(@read_only_api_key)
    assert_response :success

    body = JSON.parse(response.body)
    assert_equal "", body["query"]
    assert_equal({ "accounts" => [], "transactions" => [], "categories" => [], "merchants" => [], "tags" => [] }, body["results"])
  end

  test "finds accounts by name" do
    get "/api/v1/search", params: { q: "Checking" }, headers: api_headers(@read_only_api_key)
    assert_response :success

    accounts = JSON.parse(response.body)["results"]["accounts"]
    assert accounts.any? { |hit| hit["title"] == "Checking Account" }
    hit = accounts.find { |h| h["title"] == "Checking Account" }
    assert_equal "account", hit["type"]
    assert_equal "/accounts/#{accounts(:depository).id}", hit["url"]
  end

  test "finds transactions by entry name" do
    get "/api/v1/search", params: { q: "Starbucks" }, headers: api_headers(@read_only_api_key)
    assert_response :success

    transactions = JSON.parse(response.body)["results"]["transactions"]
    assert transactions.any? { |hit| hit["title"] == "Starbucks" }
    hit = transactions.find { |h| h["title"] == "Starbucks" }
    assert_equal "transaction", hit["type"]
    assert_equal "/transactions/#{entries(:transaction).entryable_id}", hit["url"]
  end

  test "finds transactions by smart amount with currency symbol" do
    get "/api/v1/search", params: { q: "$10" }, headers: api_headers(@read_only_api_key)
    assert_response :success

    transactions = JSON.parse(response.body)["results"]["transactions"]
    assert transactions.any? { |hit| hit["title"] == "Starbucks" },
      "expected $10 to match the 10.00 Starbucks entry"
  end

  test "finds categories filtered to transactions list" do
    get "/api/v1/search", params: { q: "Food" }, headers: api_headers(@read_only_api_key)
    assert_response :success

    categories = JSON.parse(response.body)["results"]["categories"]
    hit = categories.find { |h| h["title"] == "Food & Drink" }
    assert_not_nil hit
    assert_equal "/transactions?categories%5B%5D=Food+%26+Drink", hit["url"]
  end

  test "finds merchants filtered to transactions list" do
    get "/api/v1/search", params: { q: "Netflix" }, headers: api_headers(@read_only_api_key)
    assert_response :success

    merchants = JSON.parse(response.body)["results"]["merchants"]
    hit = merchants.find { |h| h["title"] == "Netflix" }
    assert_not_nil hit
    assert_equal "/transactions?merchants%5B%5D=Netflix", hit["url"]
  end

  test "finds tags filtered to transactions list" do
    get "/api/v1/search", params: { q: "Trips" }, headers: api_headers(@read_only_api_key)
    assert_response :success

    tags = JSON.parse(response.body)["results"]["tags"]
    hit = tags.find { |h| h["title"] == "Trips" }
    assert_not_nil hit
    assert_equal "tag", hit["type"]
    assert_equal "/transactions?tags%5B%5D=Trips", hit["url"]
  end

  test "finds transactions by tag name" do
    tagged = @family.transactions.first
    tagged.tags << tags(:one)

    get "/api/v1/search", params: { q: "Trips" }, headers: api_headers(@read_only_api_key)
    assert_response :success

    transactions = JSON.parse(response.body)["results"]["transactions"]
    assert transactions.any? { |hit| hit["id"] == tagged.id },
      "expected tag search to match the tagged transaction"
  end

  test "does not return other families records" do
    other_user = users(:family_member)
    other_user.update!(family: families(:empty))
    other_key = ApiKey.create!(
      user: other_user,
      name: "Other Family Key",
      key: ApiKey.generate_secure_key,
      scopes: %w[read],
      source: "web"
    )

    get "/api/v1/search", params: { q: "Checking" }, headers: api_headers(other_key)
    assert_response :success

    titles = JSON.parse(response.body)["results"]["accounts"].map { |h| h["title"] }
    assert_not_includes titles, "Checking Account"
  end

  test "respects per_type limit" do
    get "/api/v1/search", params: { q: "a", per_type: 1 }, headers: api_headers(@read_only_api_key)
    assert_response :success

    JSON.parse(response.body)["results"].each_value do |hits|
      assert hits.length <= 1
    end
  end
end
