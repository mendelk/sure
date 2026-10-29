require "test_helper"

class Api::V1::UserPreferencesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @user.api_keys.active.destroy_all
    @key = ApiKey.create!(user: @user, name: "Preferences writer", scopes: [ "read_write" ], source: "web", display_key: SecureRandom.hex(24))
    @read_key = ApiKey.create!(user: @user, name: "Preferences reader", scopes: [ "read" ], source: "web", display_key: SecureRandom.hex(24))
  end

  test "explicit period preference changes affect only the authenticated user" do
    other = users(:family_member)
    original = other.default_period
    patch "/api/v1/user_preferences", params: { user_id: other.id, preferences: { default_period: "last_30_days", id: other.id } }, headers: api_headers(@key), as: :json
    assert_response :success
    assert_equal "last_30_days", @user.reload.default_period
    assert_equal "last_30_days", response.parsed_body.dig("preferences", "default_period")
    assert_equal original, other.reload.default_period
  end

  test "invalid or missing periods do not overwrite the preference" do
    original = @user.default_period
    [ "not-a-period", "", nil, 3 ].each do |period|
      patch "/api/v1/user_preferences", params: { preferences: { default_period: period } }, headers: api_headers(@key), as: :json
      assert_response :unprocessable_entity
      assert_equal original, @user.reload.default_period
    end
    patch "/api/v1/user_preferences", params: {}, headers: api_headers(@key), as: :json
    assert_response :bad_request
    patch "/api/v1/user_preferences", params: { preferences: "invalid" }, headers: api_headers(@key), as: :json
    assert_response :bad_request
  end

  test "writes require authentication and write scope" do
    patch "/api/v1/user_preferences", params: { preferences: { default_period: "last_30_days" } }, as: :json
    assert_response :unauthorized
    patch "/api/v1/user_preferences", params: { preferences: { default_period: "last_30_days" } }, headers: api_headers(@read_key), as: :json
    assert_response :forbidden
  end

  test "browser session updates its own preference through the canonical API" do
    sign_in @user
    patch "/api/v1/user_preferences", params: { preferences: { default_period: "last_30_days" } }, as: :json
    assert_response :success
    assert_equal "last_30_days", @user.reload.default_period
  end

  private
    def api_headers(key)
      { "X-Api-Key" => key.display_key }
    end
end
