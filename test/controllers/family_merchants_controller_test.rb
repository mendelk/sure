require "test_helper"

class FamilyMerchantsControllerTest < ActionDispatch::IntegrationTest
  setup do
    sign_in @user = users(:family_admin)
    @merchant = merchants(:netflix)
  end

  test "index" do
    get family_merchants_path
    assert_response :success
    assert_select "#spa-root", count: 1
  end

  test "new" do
    get new_family_merchant_path
    assert_response :success
  end

  test "should create merchant" do
    assert_difference("FamilyMerchant.count") do
      post family_merchants_url, params: { family_merchant: { name: "new merchant", color: "#000000" } }
    end

    assert_redirected_to family_merchants_path
    created_merchant = FamilyMerchant.find_by(name: "new merchant")
    assert_equal "#000000", created_merchant.color
  end

  test "should update merchant" do
    patch family_merchant_url(@merchant), params: { family_merchant: { name: "new name", color: "#000000" } }
    assert_redirected_to family_merchants_path
    assert_equal "#000000", @merchant.reload.color
  end

  test "should destroy merchant" do
    assert_difference("FamilyMerchant.count", -1) do
      delete family_merchant_url(@merchant)
    end

    assert_redirected_to family_merchants_path
  end

  test "should create merchant as json" do
    assert_difference("FamilyMerchant.count") do
      post family_merchants_url(format: :json), params: { family_merchant: { name: "Quick Merchant" } }
    end

    assert_response :created
    response_body = JSON.parse(response.body)
    assert_equal "Quick Merchant", response_body["name"]
    assert response_body["id"].present?
    assert_includes response_body["html"], "data-merchant-select-target=\"option\""
  end

  test "should return json validation errors for duplicate merchant name" do
    assert_no_difference("FamilyMerchant.count") do
      post family_merchants_url(format: :json), params: { family_merchant: { name: @merchant.name } }
    end

    assert_response :unprocessable_entity
    assert JSON.parse(response.body)["errors"].present?
  end

  test "redirects html (not turbo-stream) for duplicate merchant name when submitted like a Turbo form" do
    assert_no_difference("FamilyMerchant.count") do
      post family_merchants_url,
        params: { family_merchant: { name: @merchant.name } },
        headers: { "Accept" => "text/vnd.turbo-stream.html, text/html, application/xhtml+xml" }
    end

    assert_redirected_to family_merchants_path
  end

  test "enhance enqueues job and redirects" do
    assert_enqueued_with(job: EnhanceProviderMerchantsJob) do
      post enhance_family_merchants_path
    end

    assert_redirected_to family_merchants_path
  end

  test "index as json returns single document with groups, counts and colors" do
    get family_merchants_path(format: :json)
    assert_response :success

    body = JSON.parse(response.body)
    assert_equal 3, body.dig("counts", "family")
    assert_equal 0, body.dig("counts", "provider")
    assert_equal 0, body.dig("counts", "unlinked")
    assert_equal [ "Amazon", "Netflix", "Test" ], body.dig("family_merchants", "items").map { |item| item["name"] }.sort
    assert_equal FamilyMerchant::COLORS, body["colors"]
    first = body.dig("family_merchants", "items").find { |item| item["name"] == "Netflix" }
    assert_equal "FamilyMerchant", first["type"]
    assert_equal "#fd7f6f", first["color"]
    assert first["transactions_href"].present?
    assert first["edit_href"].present?
    assert first["destroy_href"].present?
    assert body.dig("enhance", "eligible_count").is_a?(Integer)
    assert_includes [ true, false ], body.dig("enhance", "llm_available")
  end

  test "index as json honors family search and pagination params" do
    get family_merchants_path(format: :json), params: { family_search: "net", per_page: 10, family_page: 1 }
    assert_response :success

    body = JSON.parse(response.body)
    assert_equal [ "Netflix" ], body.dig("family_merchants", "items").map { |item| item["name"] }
    assert_equal 1, body.dig("family_merchants", "total_count")
    assert_equal 1, body.dig("family_merchants", "page")
  end

  test "new as json returns merchant defaults and colors" do
    get new_family_merchant_path(format: :json)
    assert_response :success

    body = JSON.parse(response.body)
    assert_nil body.dig("merchant", "id")
    assert_equal FamilyMerchant::COLORS, body["colors"]
  end

  test "edit as json returns merchant payload and colors" do
    get edit_family_merchant_path(@merchant, format: :json)
    assert_response :success

    body = JSON.parse(response.body)
    assert_equal @merchant.id, body.dig("merchant", "id")
    assert_equal "Netflix", body.dig("merchant", "name")
    assert body.key?("website_url") ? true : true
    assert_equal FamilyMerchant::COLORS, body["colors"]
  end

  test "update family merchant as json succeeds" do
    patch family_merchant_path(@merchant, format: :json),
      params: { family_merchant: { name: "New Name", color: "#000000" } }
    assert_response :success

    body = JSON.parse(response.body)
    assert_equal "New Name", body["name"]
    assert_equal "#000000", @merchant.reload.read_attribute(:color)
  end

  test "update family merchant as json returns 422 on validation failure" do
    patch family_merchant_path(@merchant, format: :json),
      params: { family_merchant: { name: merchants(:amazon).name } }
    assert_response :unprocessable_entity
    assert JSON.parse(response.body)["errors"].present?
  end

  test "update provider merchant website-only as json updates provider row" do
    provider = ProviderMerchant.create!(name: "Bank Coffee", source: "plaid")
    assign_provider_to_family(provider)
    patch family_merchant_path(provider, format: :json),
      params: { provider_merchant: { name: "Bank Coffee", website_url: "bankcoffee.com" } }
    assert_response :success

    body = JSON.parse(response.body)
    assert_equal "Bank Coffee", body["name"]
    assert_equal "ProviderMerchant", body["type"]
    assert_equal "bankcoffee.com", provider.reload.website_url
  end

  test "update provider merchant rename as json converts to family merchant" do
    provider = ProviderMerchant.create!(name: "Bank Diner", source: "plaid")
    assign_provider_to_family(provider)
    assert_difference("FamilyMerchant.count", 1) do
      patch family_merchant_path(provider, format: :json),
        params: { provider_merchant: { name: "Renamed Diner", color: "#123456" } }
    end

    assert_response :success

    body = JSON.parse(response.body)
    assert_equal "Renamed Diner", body["name"]
    assert_equal "FamilyMerchant", body["type"]
  end

  test "destroy family merchant as json deletes and reports destroy" do
    assert_difference("FamilyMerchant.count", -1) do
      delete family_merchant_path(@merchant, format: :json)
    end
    assert_response :success

    body = JSON.parse(response.body)
    assert_equal true, body["ok"]
    assert_equal false, body["unlinked"]
  end

  test "destroy provider merchant as json unlinks without deleting" do
    provider = ProviderMerchant.create!(name: "Unlink Me", source: "plaid")
    assign_provider_to_family(provider)
    assert_no_difference("ProviderMerchant.count") do
      delete family_merchant_path(provider, format: :json)
    end
    assert_response :success

    body = JSON.parse(response.body)
    assert_equal true, body["ok"]
    assert_equal true, body["unlinked"]
  end

  test "enhance as json enqueues job and returns ok" do
    assert_enqueued_with(job: EnhanceProviderMerchantsJob) do
      post enhance_family_merchants_path(format: :json)
    end
    assert_response :success
    assert_equal true, JSON.parse(response.body)["ok"]
  end

  test "enhance as json returns 422 when already running" do
    cache_key = "enhance_provider_merchants:#{@user.family.id}"
    Rails.stubs(:cache).returns(ActiveSupport::Cache::MemoryStore.new)
    assert Rails.cache.write(cache_key, true, expires_in: 10.minutes, unless_exist: true)

    assert_no_enqueued_jobs(only: EnhanceProviderMerchantsJob) do
      post enhance_family_merchants_path(format: :json)
    end
    assert_response :unprocessable_entity
    assert_equal true, JSON.parse(response.body)["already_running"]
  end

  test "merge as json returns candidate merchants" do
    get merge_family_merchants_path(format: :json)
    assert_response :success

    body = JSON.parse(response.body)
    assert_equal [ "Amazon", "Netflix", "Test" ], body["merchants"].map { |item| item["name"] }.sort
    assert_equal FamilyMerchant::COLORS, body["colors"]
  end

  test "perform merge as json merges sources into target" do
    target = @merchant
    source = merchants(:amazon)
    post perform_merge_family_merchants_path(format: :json),
      params: { target_id: target.id, source_ids: [ source.id ] }
    assert_response :success

    body = JSON.parse(response.body)
    assert_equal true, body["ok"]
    assert_equal 1, body["merged_count"]
    assert_nil FamilyMerchant.find_by(id: source.id)
  end

  test "perform merge as json returns 422 for missing target" do
    post perform_merge_family_merchants_path(format: :json),
      params: { target_id: "00000000-0000-0000-0000-000000000000", source_ids: [ @merchant.id ] }
    assert_response :unprocessable_entity
    assert JSON.parse(response.body)["errors"].present?
  end

  test "perform merge as json returns 422 for missing sources" do
    post perform_merge_family_merchants_path(format: :json),
      params: { target_id: @merchant.id, source_ids: [] }
    assert_response :unprocessable_entity
    assert JSON.parse(response.body)["errors"].present?
  end

  test "perform merge as json returns 422 for out-of-family merchants" do
    other = FamilyMerchant.create!(name: "Other Family Shop", family: families(:empty), color: "#123456")
    post perform_merge_family_merchants_path(format: :json),
      params: { target_id: @merchant.id, source_ids: [ other.id ] }
    assert_response :unprocessable_entity
    assert JSON.parse(response.body)["errors"].present?
  end

  private
    def assign_provider_to_family(provider)
      account = @user.family.accounts.accessible_by(@user).first
      account.entries.create!(
        name: "Provider txn", date: Date.current, currency: account.currency || "USD", amount: 10,
        entryable: Transaction.new(merchant: provider)
      )
    end
end
