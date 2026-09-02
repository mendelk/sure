# frozen_string_literal: true

require "test_helper"

class Api::V1::MerchantsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @other_family_user = users(:empty)

    assert_not_equal @user.family_id, @other_family_user.family_id,
      "Test setup error: @other_family_user must belong to a different family"

    @user.api_keys.active.destroy_all

    @merchant = @user.family.merchants.first || @user.family.merchants.create!(
      name: "Test Merchant"
    )
  end

  # Index action tests
  test "index requires authentication" do
    get api_v1_merchants_url

    assert_response :unauthorized
  end

  test "index returns user's family merchants successfully" do
    get api_v1_merchants_url, headers: api_headers(read_only_api_key)

    assert_response :success

    merchants = JSON.parse(response.body)
    assert_kind_of Array, merchants
    assert_not_empty merchants

    merchant = merchants.first
    assert merchant.key?("id")
    assert merchant.key?("name")
    assert merchant.key?("color")
    assert merchant.key?("website_url")
    assert merchant.key?("logo_url")
    assert merchant.key?("created_at")
    assert merchant.key?("updated_at")
  end

  test "index does not return merchants from other families" do
    other_merchant = @other_family_user.family.merchants.create!(name: "Other Merchant")

    get api_v1_merchants_url, headers: api_headers(read_only_api_key)

    assert_response :success
    merchants = JSON.parse(response.body)
    merchant_ids = merchants.map { |m| m["id"] }

    assert_includes merchant_ids, @merchant.id
    assert_not_includes merchant_ids, other_merchant.id
  end

  # Show action tests
  test "show requires authentication" do
    get api_v1_merchant_url(@merchant)

    assert_response :unauthorized
  end

  test "show returns merchant successfully" do
    get api_v1_merchant_url(@merchant), headers: api_headers(read_only_api_key)

    assert_response :success

    merchant = JSON.parse(response.body)
    assert_equal @merchant.id, merchant["id"]
    assert_equal @merchant.name, merchant["name"]
  end

  test "show returns 404 for non-existent merchant" do
    get api_v1_merchant_url(id: SecureRandom.uuid), headers: api_headers(read_only_api_key)

    assert_response :not_found
  end

  test "show returns 404 for merchant from another family" do
    other_merchant = @other_family_user.family.merchants.create!(name: "Other Merchant")

    get api_v1_merchant_url(other_merchant), headers: api_headers(read_only_api_key)

    assert_response :not_found
  end

  # Create action tests
  test "create requires authentication" do
    post api_v1_merchants_url, params: { merchant: { name: "New Merchant" } }

    assert_response :unauthorized
  end

  test "create rejects read-only api key" do
    post api_v1_merchants_url,
      params: { merchant: { name: "New Merchant" } },
      headers: api_headers(read_only_api_key)

    assert_response :forbidden
  end

  test "create persists website and logo URLs" do
    assert_difference "@user.family.merchants.count", 1 do
      post api_v1_merchants_url,
        params: {
          merchant: {
            name: "API Merchant",
            color: "#ff0000",
            website_url: "https://example.com",
            logo_url: "https://cdn.example.com/logo.png"
          }
        },
        headers: api_headers(read_write_api_key)
    end

    assert_response :created
    body = JSON.parse(response.body)
    assert_equal "API Merchant", body["name"]
    assert_equal "#ff0000", body["color"]
    assert_equal "https://example.com", body["website_url"]
    assert_equal "https://cdn.example.com/logo.png", body["logo_url"]
    assert_equal "FamilyMerchant", body["type"]
  end

  test "create returns 422 without a name" do
    post api_v1_merchants_url,
      params: { merchant: { logo_url: "https://cdn.example.com/logo.png" } },
      headers: api_headers(read_write_api_key)

    assert_response :unprocessable_entity
    assert_equal "unprocessable_entity", JSON.parse(response.body)["error"]
  end

  # Update action tests
  test "update changes merchant URLs" do
    patch api_v1_merchant_url(@merchant),
      params: {
        merchant: {
          website_url: "https://updated.example.com",
          logo_url: "https://cdn.example.com/updated-logo.png"
        }
      },
      headers: api_headers(read_write_api_key)

    assert_response :success
    body = JSON.parse(response.body)
    assert_equal "https://updated.example.com", body["website_url"]
    assert_equal "https://cdn.example.com/updated-logo.png", body["logo_url"]
    assert_equal body["logo_url"], @merchant.reload.logo_url
  end

  test "update rejects read-only api key" do
    patch api_v1_merchant_url(@merchant),
      params: { merchant: { name: "Blocked" } },
      headers: api_headers(read_only_api_key)

    assert_response :forbidden
  end

  test "update does not modify another family's merchant" do
    other_merchant = @other_family_user.family.merchants.create!(name: "Other Merchant")

    patch api_v1_merchant_url(other_merchant),
      params: { merchant: { name: "Blocked" } },
      headers: api_headers(read_write_api_key)

    assert_response :not_found
    assert_equal "Other Merchant", other_merchant.reload.name
  end

  test "update converts an assigned provider merchant for the family" do
    transaction = @user.family.transactions.first!
    provider_merchant = ProviderMerchant.create!(
      name: "Provider #{SecureRandom.hex(4)}",
      source: :plaid,
      provider_merchant_id: SecureRandom.uuid,
      logo_url: "https://provider.example.com/logo.png"
    )
    transaction.update!(merchant: provider_merchant)

    patch api_v1_merchant_url(provider_merchant),
      params: { merchant: { logo_url: "https://family.example.com/logo.png" } },
      headers: api_headers(read_write_api_key)

    assert_response :success
    body = JSON.parse(response.body)
    assert_equal "FamilyMerchant", body["type"]
    assert_equal "https://family.example.com/logo.png", body["logo_url"]
    assert_equal body["id"], transaction.reload.merchant_id
    assert_equal "https://provider.example.com/logo.png", provider_merchant.reload.logo_url
  end

  # Destroy action tests
  test "destroy removes a family merchant" do
    merchant = @user.family.merchants.create!(name: "Disposable Merchant")

    assert_difference "@user.family.merchants.count", -1 do
      delete api_v1_merchant_url(merchant), headers: api_headers(read_write_api_key)
    end

    assert_response :no_content
  end

  test "destroy rejects read-only api key" do
    delete api_v1_merchant_url(@merchant), headers: api_headers(read_only_api_key)

    assert_response :forbidden
    assert @merchant.reload
  end

  test "destroy unlinks an assigned provider merchant without deleting it" do
    transaction = @user.family.transactions.first!
    provider_merchant = ProviderMerchant.create!(
      name: "Disposable Provider #{SecureRandom.hex(4)}",
      source: :plaid,
      provider_merchant_id: SecureRandom.uuid
    )
    transaction.update!(merchant: provider_merchant)

    delete api_v1_merchant_url(provider_merchant), headers: api_headers(read_write_api_key)

    assert_response :no_content
    assert_nil transaction.reload.merchant_id
    assert ProviderMerchant.exists?(provider_merchant.id)
  end

  # CSV import action tests
  test "create keeps backwards compatibility for CSV imports" do
    post api_v1_merchants_url,
      params: { file: csv_file("name\nLegacy CSV Merchant") },
      headers: api_headers(read_write_api_key)

    assert_response :created
    assert_equal 1, JSON.parse(response.body)["imported"]
  end

  test "import creates merchants from csv with URLs" do
    csv_content = "name,color,website_url,logo_url\nImported Merchant,#ff0000,https://example.com,https://cdn.example.com/logo.png\nAnother Merchant,,,"

    assert_difference "@user.family.merchants.count", 2 do
      post import_api_v1_merchants_url,
        params: { file: csv_file(csv_content) },
        headers: api_headers(read_write_api_key)
    end

    assert_response :created
    body = JSON.parse(response.body)
    assert_equal 2, body["imported"]
    assert_equal 0, body["skipped"]
    assert_equal 2, body["merchants"].length

    imported = body["merchants"].find { |m| m["name"] == "Imported Merchant" }
    assert imported.present?
    assert imported["id"].present?
    assert_equal "FamilyMerchant", imported["type"]
    assert_equal "https://example.com", imported["website_url"]
    assert_equal "https://cdn.example.com/logo.png", imported["logo_url"]
  end

  test "import skips duplicate merchant names" do
    csv_content = "name\n#{@merchant.name}\nBrand New Merchant"

    assert_difference "@user.family.merchants.count", 1 do
      post import_api_v1_merchants_url,
        params: { file: csv_file(csv_content) },
        headers: api_headers(read_write_api_key)
    end

    assert_response :created
    body = JSON.parse(response.body)
    assert_equal 1, body["imported"]
    assert_equal 1, body["skipped"]
  end

  test "import returns 422 when file is missing" do
    post import_api_v1_merchants_url, headers: api_headers(read_write_api_key)

    assert_response :unprocessable_entity
    body = JSON.parse(response.body)
    assert_equal "missing_file", body["error"]
  end

  test "import returns 422 when csv is missing name column" do
    csv_content = "color,website_url\n#ff0000,https://example.com"

    post import_api_v1_merchants_url,
      params: { file: csv_file(csv_content) },
      headers: api_headers(read_write_api_key)

    assert_response :unprocessable_entity
    body = JSON.parse(response.body)
    assert_equal "missing_column", body["error"]
  end

  test "import returns 422 for invalid file type" do
    file = Rack::Test::UploadedFile.new(
      StringIO.new("not a csv"),
      "application/pdf",
      true,
      original_filename: "merchants.pdf"
    )

    post import_api_v1_merchants_url,
      params: { file: file },
      headers: api_headers(read_write_api_key)

    assert_response :unprocessable_entity
    body = JSON.parse(response.body)
    assert_equal "invalid_file_type", body["error"]
  end

  private

    def read_write_api_key
      @read_write_api_key ||= ApiKey.create!(
        user: @user,
        name: "Test RW Key",
        key: ApiKey.generate_secure_key,
        scopes: %w[read_write],
        source: "web"
      )
    end

    def read_only_api_key
      @read_only_api_key ||= ApiKey.create!(
        user: @user,
        name: "Test RO Key",
        key: ApiKey.generate_secure_key,
        scopes: %w[read],
        source: "mobile"
      )
    end

    def api_headers(api_key)
      { "X-Api-Key" => api_key.plain_key }
    end

    def csv_file(content, filename: "merchants.csv")
      uploaded_file(filename: filename, content_type: "text/csv", content: content)
    end
end
