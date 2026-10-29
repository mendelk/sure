# frozen_string_literal: true

require "test_helper"

class Api::V1::EnableAiControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @user.update!(ai_enabled: false)
    @user.api_keys.destroy_all
    User.any_instance.stubs(:ai_available?).returns(true)
    @read_key = create_key("read")
    @write_key = create_key("read_write")
  end

  test "requires authentication" do
    patch "/api/v1/auth/enable_ai", as: :json
    assert_response :unauthorized
    assert_not @user.reload.ai_enabled
  end

  test "read key cannot enable AI" do
    patch "/api/v1/auth/enable_ai", headers: api_headers(@read_key), as: :json
    assert_response :forbidden
    assert_not @user.reload.ai_enabled
  end

  test "write key enables only its owner without a user id or legacy payload" do
    other = users(:family_member)
    other.update!(ai_enabled: false)
    patch "/api/v1/auth/enable_ai", params: { user: { id: other.id } }, headers: api_headers(@write_key), as: :json
    assert_response :success
    assert_equal @user.id, response.parsed_body.dig("user", "id")
    assert_equal true, response.parsed_body.dig("user", "ai_enabled")
    assert @user.reload.ai_enabled
    assert_not other.reload.ai_enabled
  end

  test "unavailable provider cannot be enabled" do
    User.any_instance.stubs(:ai_available?).returns(false)
    patch "/api/v1/auth/enable_ai", headers: api_headers(@write_key), as: :json
    assert_response :forbidden
    assert_equal "AI is not available for your account", response.parsed_body["error"]
    assert_not @user.reload.ai_enabled
  end

  test "validation errors are returned without changing consent" do
    User.any_instance.stubs(:update).with(ai_enabled: true).returns(false)
    patch "/api/v1/auth/enable_ai", headers: api_headers(@write_key), as: :json
    assert_response :unprocessable_entity
    assert response.parsed_body["errors"].is_a?(Array)
    assert_not @user.reload.ai_enabled
  end

  test "session consent writes require CSRF after authentication" do
    sign_in @user
    original = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    begin
      patch "/api/v1/auth/enable_ai", as: :json
      assert_response :unprocessable_content
      assert_not @user.reload.ai_enabled

      get "/chats"
      assert_response :success
      token = css_select('meta[name="csrf-token"]').first["content"]
      patch "/api/v1/auth/enable_ai", headers: { "X-CSRF-Token" => token }, as: :json
      assert_response :success
      assert @user.reload.ai_enabled
    ensure
      ActionController::Base.allow_forgery_protection = original
    end
  end

  private

    def create_key(scope)
      ApiKey.create!(user: @user, name: "AI consent #{scope}", key: ApiKey.generate_secure_key, scopes: [ scope ], source: "web")
    end

    def api_headers(key)
      { "X-Api-Key" => key.display_key }
    end
end
