# frozen_string_literal: true

require "test_helper"

class Api::V1::TagsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @other_family_user = users(:empty)

    @user.api_keys.active.destroy_all
    @read_key = ApiKey.create!(user: @user, name: "Tags read", key: ApiKey.generate_secure_key, scopes: %w[read], source: "mobile")
    @write_key = ApiKey.create!(user: @user, name: "Tags write", key: ApiKey.generate_secure_key, scopes: %w[read_write], source: "web")

    @tag = @user.family.tags.create!(name: "Test Tag #{SecureRandom.hex(4)}", color: "#3b82f6")
  end

  # Index action tests
  test "index requires authentication" do
    get api_v1_tags_url

    assert_response :unauthorized
  end

  test "index returns user's family tags successfully" do
    get api_v1_tags_url, headers: read_headers

    assert_response :success

    tags = JSON.parse(response.body)
    assert_kind_of Array, tags
    assert tags.length >= 1

    tag = tags.first
    assert tag.key?("id")
    assert tag.key?("name")
    assert tag.key?("color")
    assert tag.key?("created_at")
    assert tag.key?("updated_at")
  end

  test "index does not return tags from other families" do
    other_tag = @other_family_user.family.tags.create!(name: "Other Tag", color: "#3b82f6")

    get api_v1_tags_url, headers: read_headers

    assert_response :success
    tags = JSON.parse(response.body)
    tag_ids = tags.map { |t| t["id"] }

    assert_includes tag_ids, @tag.id
    assert_not_includes tag_ids, other_tag.id
  end

  # Show action tests
  test "show requires authentication" do
    get api_v1_tag_url(@tag)

    assert_response :unauthorized
  end

  test "show returns tag successfully" do
    get api_v1_tag_url(@tag), headers: read_headers

    assert_response :success

    tag = JSON.parse(response.body)
    assert_equal @tag.id, tag["id"]
    assert_equal @tag.name, tag["name"]
    assert_equal "#3b82f6", tag["color"]
  end

  test "show returns 404 for non-existent tag" do
    get api_v1_tag_url(id: SecureRandom.uuid), headers: read_headers

    assert_response :not_found
  end

  test "show returns 404 for tag from another family" do
    other_tag = @other_family_user.family.tags.create!(name: "Other Tag", color: "#3b82f6")

    get api_v1_tag_url(other_tag), headers: read_headers

    assert_response :not_found
  end

  # Create action tests
  test "create requires authentication" do
    post api_v1_tags_url, params: { tag: { name: "New Tag" } }

    assert_response :unauthorized
  end

  test "create requires read_write scope" do
    post api_v1_tags_url,
         params: { tag: { name: "New Tag", color: "#4da568" } },
         headers: read_headers

    assert_response :forbidden
  end

  test "create tag successfully" do
    tag_name = "New Tag #{SecureRandom.hex(4)}"

    assert_difference -> { @user.family.tags.count }, 1 do
      post api_v1_tags_url,
           params: { tag: { name: tag_name, color: "#4da568" } },
           headers: read_write_headers
    end

    assert_response :created

    tag = JSON.parse(response.body)
    assert_equal tag_name, tag["name"]
    assert_equal "#4da568", tag["color"]
  end

  test "create tag with auto-assigned color" do
    tag_name = "Auto Color Tag #{SecureRandom.hex(4)}"

    post api_v1_tags_url,
         params: { tag: { name: tag_name } },
         headers: read_write_headers

    assert_response :created

    tag = JSON.parse(response.body)
    assert_equal tag_name, tag["name"]
    assert tag["color"].present?
  end

  test "create fails with duplicate name" do
    post api_v1_tags_url,
         params: { tag: { name: @tag.name } },
         headers: read_write_headers

    assert_response :unprocessable_entity
  end

  # Update action tests
  test "update requires authentication" do
    patch api_v1_tag_url(@tag), params: { tag: { name: "Updated" } }

    assert_response :unauthorized
  end

  test "update requires read_write scope" do
    patch api_v1_tag_url(@tag),
          params: { tag: { name: "Updated" } },
          headers: read_headers

    assert_response :forbidden
  end

  test "update tag successfully" do
    new_name = "Updated Tag #{SecureRandom.hex(4)}"

    patch api_v1_tag_url(@tag),
          params: { tag: { name: new_name, color: "#db5a54" } },
          headers: read_write_headers

    assert_response :success

    tag = JSON.parse(response.body)
    assert_equal new_name, tag["name"]
    assert_equal "#db5a54", tag["color"]
  end

  test "update tag partially" do
    original_name = @tag.name

    patch api_v1_tag_url(@tag),
          params: { tag: { color: "#eb5429" } },
          headers: read_write_headers

    assert_response :success

    tag = JSON.parse(response.body)
    assert_equal original_name, tag["name"]
    assert_equal "#eb5429", tag["color"]
  end

  test "update returns 404 for non-existent tag" do
    patch api_v1_tag_url(id: SecureRandom.uuid),
          params: { tag: { name: "Not Found" } },
          headers: read_write_headers

    assert_response :not_found
  end

  test "update returns 404 for tag from another family" do
    other_tag = @other_family_user.family.tags.create!(name: "Other Tag", color: "#3b82f6")

    patch api_v1_tag_url(other_tag),
          params: { tag: { name: "Hacker Update" } },
          headers: read_write_headers

    assert_response :not_found
  end

  # Destroy action tests
  test "destroy requires authentication" do
    delete api_v1_tag_url(@tag)

    assert_response :unauthorized
  end

  test "destroy requires read_write scope" do
    delete api_v1_tag_url(@tag), headers: read_headers

    assert_response :forbidden
  end

  test "destroy tag successfully" do
    tag_to_delete = @user.family.tags.create!(name: "Delete Me #{SecureRandom.hex(4)}", color: "#c44fe9")

    assert_difference -> { @user.family.tags.count }, -1 do
      delete api_v1_tag_url(tag_to_delete), headers: read_write_headers
    end

    assert_response :no_content
  end

  test "destroy returns 404 for non-existent tag" do
    delete api_v1_tag_url(id: SecureRandom.uuid), headers: read_write_headers

    assert_response :not_found
  end

  test "destroy returns 404 for tag from another family" do
    other_tag = @other_family_user.family.tags.create!(name: "Other Tag", color: "#3b82f6")

    assert_no_difference -> { @other_family_user.family.tags.count } do
      delete api_v1_tag_url(other_tag), headers: read_write_headers
    end

    assert_response :not_found
  end

  test "workspace includes usage and form options are family scoped" do
    transaction = @user.family.transactions.first!
    transaction.tags << @tag
    get "/api/v1/tags", params: { include: "workspace" }, headers: read_headers
    assert_response :success
    row = JSON.parse(response.body).dig("workspace", "tags").find { |tag| tag["id"] == @tag.id }
    assert_equal 1, row["transactions_count"]
    get "/api/v1/tags/form_options", headers: read_headers
    assert_response :success
    assert_nil JSON.parse(response.body).dig("tag", "id")
    foreign = @other_family_user.family.tags.create!(name: "Foreign options")
    get "/api/v1/tags/form_options", params: { id: foreign.id }, headers: read_headers
    assert_response :not_found
  end

  test "workspace tag counts hide private account activity while retaining family taxonomy" do
    owner = @user.family.users.create!(email: "private-tag-owner@example.com", password: "Password123!", password_confirmation: "Password123!", role: "member")
    private_account = @user.family.accounts.create!(name: "Private tag activity", balance: 100, currency: "USD", accountable: Depository.new, owner: owner)
    private_transaction = private_account.entries.create!(name: "Private purchase", date: Date.current, amount: 10, currency: "USD", entryable: Transaction.new).transaction
    shared_tag = @user.family.tags.create!(name: "Shared taxonomy")
    private_transaction.tags << [ @tag, shared_tag ]
    visible_account = @user.family.accounts.create!(name: "Visible tag activity", balance: 100, currency: "USD", accountable: Depository.new, owner: @user)
    visible_transaction = visible_account.entries.create!(name: "Visible purchase", date: Date.current, amount: 20, currency: "USD", entryable: Transaction.new).transaction
    visible_transaction.tags << shared_tag

    get "/api/v1/tags", params: { include: "workspace" }, headers: read_headers
    assert_response :success
    rows = JSON.parse(response.body).dig("workspace", "tags").index_by { |row| row["id"] }
    assert_equal @tag.name, rows.fetch(@tag.id)["name"]
    assert_equal 0, rows.fetch(@tag.id)["transactions_count"]
    assert_equal 1, rows.fetch(shared_tag.id)["transactions_count"]

    share = private_account.account_shares.create!(user: @user, permission: "read_only")
    get "/api/v1/tags", params: { include: "workspace" }, headers: read_headers
    assert_response :success
    rows = JSON.parse(response.body).dig("workspace", "tags").index_by { |row| row["id"] }
    assert_equal 1, rows.fetch(@tag.id)["transactions_count"]
    assert_equal 2, rows.fetch(shared_tag.id)["transactions_count"]

    share.destroy!
    patch "/api/v1/tags/#{shared_tag.id}", params: { tag: { name: "Renamed shared taxonomy" } }, headers: read_write_headers
    assert_response :success
    assert_equal 1, JSON.parse(response.body)["transactions_count"]
    assert_equal [ @tag.id, shared_tag.id ].sort, private_transaction.reload.tag_ids.sort
  end

  test "replacement validates tenancy and self replacement before moving transaction tags" do
    transaction = @user.family.transactions.first!
    transaction.tags << @tag
    replacement = @user.family.tags.create!(name: "Replacement", color: "#6471eb")
    post "/api/v1/tags/#{@tag.id}/replacement", params: { replacement_tag_id: @tag.id }, headers: read_write_headers
    assert_response :unprocessable_entity
    foreign = @other_family_user.family.tags.create!(name: "Foreign replacement")
    post "/api/v1/tags/#{@tag.id}/replacement", params: { replacement_tag_id: foreign.id }, headers: read_write_headers
    assert_response :not_found
    post "/api/v1/tags/#{@tag.id}/replacement", params: { replacement_tag_id: replacement.id }, headers: read_headers
    assert_response :forbidden
    post "/api/v1/tags/#{@tag.id}/replacement", params: { replacement_tag_id: replacement.id }, headers: read_write_headers
    assert_response :success
    assert_includes transaction.reload.tag_ids, replacement.id
    assert_not Tag.exists?(@tag.id)
  end

  test "bulk deletion is write protected and leaves other families unchanged" do
    foreign = @other_family_user.family.tags.create!(name: "Foreign bulk tag")
    @user.family.transactions.first!.tags << @tag
    delete "/api/v1/tags/destroy_all", headers: read_headers
    assert_response :forbidden
    delete "/api/v1/tags/destroy_all", headers: read_write_headers
    assert_response :success
    assert_empty Tag.where(family_id: @user.family_id)
    assert_empty Tagging.where(tag_id: @tag.id)
    get "/api/v1/tags", params: { include: "workspace" }, headers: read_headers
    assert_response :success
    assert_empty JSON.parse(response.body).dig("workspace", "tags")
    assert Tag.exists?(foreign.id)
  end

  private

    def read_headers
      { "X-Api-Key" => @read_key.display_key }
    end

    def read_write_headers
      { "X-Api-Key" => @write_key.display_key }
    end
end
