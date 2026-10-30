require "test_helper"

class TagsControllerTest < ActionDispatch::IntegrationTest
  setup do
    sign_in @user = users(:family_admin)
    @other_family_user = users(:empty)

    # Verify cross-family isolation setup is correct
    assert_not_equal @user.family_id, @other_family_user.family_id,
      "Test setup error: @other_family_user must belong to a different family"
  end

  test "should get index" do
    get tags_url
    assert_response :success
    assert_select "#spa-root", count: 1
  end

  test "should get index as json" do
    get tags_url(format: :json)
    assert_response :success

    response_body = JSON.parse(response.body)
    assert_equal Tag::COLORS, response_body["colors"]
    assert_equal @user.family.tags.count, response_body["tags"].length

    row = response_body["tags"].find { |entry| entry["id"] == tags(:one).id }
    assert_equal "Trips", row["name"]
    assert_equal tags(:one).color, row["color"]
    assert_equal tags(:one).transactions.count, row["transactions_count"]

    tag_names = response_body["tags"].map { |entry| entry["name"] }
    assert_equal tag_names.sort, tag_names
  end

  test "should get new as json" do
    get new_tag_url(format: :json)
    assert_response :success

    response_body = JSON.parse(response.body)
    assert_equal Tag::COLORS, response_body["colors"]
    assert_nil response_body["tag"]["id"]
    assert_includes Tag::COLORS, response_body["tag"]["color"]
  end

  test "should get edit as json" do
    get edit_tag_url(tags(:one), format: :json)
    assert_response :success

    response_body = JSON.parse(response.body)
    assert_equal Tag::COLORS, response_body["colors"]
    assert_equal tags(:one).id, response_body["tag"]["id"]
    assert_equal "Trips", response_body["tag"]["name"]
    assert_equal tags(:one).transactions.count, response_body["tag"]["transactions_count"]
  end

  test "should get new" do
    get new_tag_url
    assert_response :success
  end

  test "should create tag" do
    assert_difference("Tag.count") do
      post tags_url, params: { tag: { name: "Test Tag" } }
    end

    assert_redirected_to tags_url
    assert_equal "Tag created", flash[:notice]
  end

  test "should create tag as json" do
    assert_difference("Tag.count") do
      post tags_url(format: :json), params: { tag: { name: "Quick Tag", color: "#e99537" } }
    end

    assert_response :created

    response_body = JSON.parse(response.body)
    assert_equal "Quick Tag", response_body["name"]
    assert_equal "#e99537", response_body["color"]
    assert response_body["id"].present?
    assert_includes response_body["html"], "data-tag-select-target=\"option\""
    assert_includes response_body["html"], "data-tag-id=\"#{response_body["id"]}\""
    assert_includes response_body["html"], "data-tag-select-badge"
  end

  test "should return json validation errors" do
    assert_no_difference("Tag.count") do
      post tags_url(format: :json), params: { tag: { name: "" } }
    end

    assert_response :unprocessable_entity
    assert JSON.parse(response.body)["errors"].present?
  end

  test "should get edit" do
    get edit_tag_url(@user.family.tags.first)
    assert_response :success
  end

  test "should update tag" do
    patch tag_url(@user.family.tags.first), params: { tag: { name: "Test Tag" } }

    assert_redirected_to tags_url
    assert_equal "Tag updated", flash[:notice]
  end

  test "should update tag as json" do
    patch tag_url(tags(:one), format: :json), params: { tag: { name: "Renamed Tag", color: "#4da568" } }

    assert_response :success
    response_body = JSON.parse(response.body)
    assert_equal "Renamed Tag", response_body["name"]
    assert_equal "#4da568", response_body["color"]
    assert_equal tags(:one).reload.name, "Renamed Tag"
  end

  test "should return json validation errors on update" do
    duplicate_name = tags(:two).name

    patch tag_url(tags(:one), format: :json), params: { tag: { name: duplicate_name } }

    assert_response :unprocessable_entity
    assert JSON.parse(response.body)["errors"].present?
    assert_equal "Trips", tags(:one).reload.name
  end

  test "should destroy tag as json" do
    tag = @user.family.tags.create!(name: "Ephemeral")

    assert_difference("Tag.count", -1) do
      delete tag_url(tag, format: :json)
    end

    assert_response :success
    assert_equal({ "ok" => true }, JSON.parse(response.body))
  end

  test "should destroy all tags as json" do
    assert @user.family.tags.count > 0

    delete destroy_all_tags_url(format: :json)

    assert_response :success
    assert_equal({ "ok" => true }, JSON.parse(response.body))
    assert_equal 0, @user.family.tags.count
  end
end
