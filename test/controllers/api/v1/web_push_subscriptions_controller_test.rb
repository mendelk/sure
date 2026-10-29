require "test_helper"
require "base64"

class Api::V1::WebPushSubscriptionsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @other = users(:family_member)
    @user.update!(preferences: @user.preferences.to_h.merge("preview_features_enabled" => true))
    WebNotification::Preferences.new(@user).update!(enabled: true)
    WebPushSubscription.stubs(:configured?).returns(true)
    @keys = { p256dh: Base64.urlsafe_encode64("\x04" + "\x01" * 64, padding: false),
              auth: Base64.urlsafe_encode64("\x02" * 16, padding: false) }
    @api_key = ApiKey.create!(user: @user, name: "Browser push test", key: ApiKey.generate_secure_key,
      scopes: %w[read_write], source: "web")
  end

  test "registers only for the authenticated browser and never returns private credentials" do
    sign_in @user
    browser_session_id = Current.session.id
    foreign_session = @other.sessions.create!
    assert_difference "WebPushSubscription.count", 1 do
      post api_v1_web_push_subscriptions_path,
        params: { subscription: payload.merge(user_id: @other.id, session_id: foreign_session.id) }, as: :json
    end
    assert_response :created
    browser = WebPushSubscription.find(response.parsed_body.fetch("id"))
    assert_equal @user.id, browser.user_id
    assert_equal browser_session_id, browser.session_id
    assert_equal %w[id status], response.parsed_body.keys.sort
    refute_includes response.body, payload[:endpoint]
    refute_includes response.body, @keys[:auth]
  end

  test "API keys do not acquire browser ownership even with a browser cookie" do
    sign_in @user
    assert_no_difference "WebPushSubscription.count" do
      post api_v1_web_push_subscriptions_path, params: { subscription: payload }, headers: api_headers(@api_key), as: :json
    end
    assert_response :forbidden
    assert_equal "browser_session_required", response.parsed_body.fetch("error")
  end

  test "read-only API keys cannot register browsers" do
    @api_key.update!(scopes: %w[read])
    post api_v1_web_push_subscriptions_path, params: { subscription: payload }, headers: api_headers(@api_key), as: :json
    assert_response :forbidden
    assert_equal "insufficient_scope", response.parsed_body.fetch("error")
  end

  test "requires authentication" do
    post api_v1_web_push_subscriptions_path, params: { subscription: payload }, as: :json
    assert_response :unauthorized
  end

  test "preview opt in notification preference and VAPID configuration are enforced" do
    sign_in @user
    @user.update!(preferences: @user.preferences.to_h.merge("preview_features_enabled" => false))
    post api_v1_web_push_subscriptions_path, params: { subscription: payload }, as: :json
    assert_response :forbidden
    assert_equal "feature_disabled", response.parsed_body.fetch("error")

    @user.update!(preferences: @user.preferences.to_h.merge("preview_features_enabled" => true))
    WebNotification::Preferences.new(@user).update!(enabled: false)
    post api_v1_web_push_subscriptions_path, params: { subscription: payload }, as: :json
    assert_response :unprocessable_entity

    WebNotification::Preferences.new(@user).update!(enabled: true)
    WebPushSubscription.stubs(:configured?).returns(false)
    post api_v1_web_push_subscriptions_path, params: { subscription: payload }, as: :json
    assert_response :service_unavailable
    assert_equal "push_unconfigured", response.parsed_body.fetch("error")
  end

  test "malformed payloads keys and unsafe endpoints are rejected" do
    sign_in @user
    [ [], "invalid", { endpoint: payload[:endpoint], keys: [] },
      payload.merge(endpoint: "https://127.0.0.1/private"),
      payload.merge(keys: @keys.merge(auth: "bad")),
      payload.merge(endpoint: "https://fcm.googleapis.com/#{'x' * 4096}") ].each do |subscription|
      assert_no_difference "WebPushSubscription.count" do
        post api_v1_web_push_subscriptions_path, params: { subscription: subscription }, as: :json
      end
      assert_response :unprocessable_entity
      assert_equal "invalid_subscription", response.parsed_body.fetch("error")
    end
  end

  test "account switching requires the full original subscription proof" do
    foreign_session = @other.sessions.create!
    old = WebPushSubscription.register_for!(user: @other, session: foreign_session, endpoint: payload[:endpoint], **@keys)
    sign_in @user

    post api_v1_web_push_subscriptions_path,
      params: { subscription: payload.merge(keys: @keys.merge(auth: Base64.urlsafe_encode64("\x03" * 16, padding: false))) }, as: :json
    assert_response :unprocessable_entity
    assert_equal @other.id, old.reload.user_id

    assert_no_difference "WebPushSubscription.count" do
      post api_v1_web_push_subscriptions_path, params: { subscription: payload }, as: :json
    end
    assert_response :created
    replacement = WebPushSubscription.find(response.parsed_body.fetch("id"))
    assert_equal @user.id, replacement.user_id
    assert_equal Current.session.id, replacement.session_id
    refute_equal old.id, replacement.id
    refute WebPushSubscription.exists?(old.id)

    foreign_session.destroy!
    assert WebPushSubscription.exists?(replacement.id)
  end

  test "a new login for the same user rebinds the browser without creating another registration" do
    sign_in @user
    post api_v1_web_push_subscriptions_path, params: { subscription: payload }, as: :json
    browser_id = response.parsed_body.fetch("id")
    previous_session_id = WebPushSubscription.find(browser_id).session_id
    sign_in @user
    current_session_id = Current.session.id
    refute_equal previous_session_id, current_session_id

    assert_no_difference "WebPushSubscription.count" do
      post api_v1_web_push_subscriptions_path, params: { subscription: payload }, as: :json
    end
    assert_response :created
    assert_equal browser_id, response.parsed_body.fetch("id")
    assert_equal current_session_id, WebPushSubscription.find(browser_id).session_id
    Session.find(previous_session_id).destroy!
    assert WebPushSubscription.exists?(browser_id)
  end

  test "cookie registration requires the real CSRF token" do
    sign_in @user
    original = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    assert_no_difference "WebPushSubscription.count" do
      post api_v1_web_push_subscriptions_path, params: { subscription: payload }, as: :json
    end
    assert_response :unprocessable_entity

    get new_session_path
    token = css_select('meta[name="csrf-token"]').first["content"]
    assert_difference "WebPushSubscription.count", 1 do
      post api_v1_web_push_subscriptions_path, params: { subscription: payload }, headers: { "X-CSRF-Token" => token }, as: :json
    end
    assert_response :created
  ensure
    ActionController::Base.allow_forgery_protection = original
  end

  private
    def api_headers(key)
      { "X-Api-Key" => key.display_key }
    end

    def payload
      { endpoint: "https://fcm.googleapis.com/fcm/send/api-browser", keys: @keys }
    end
end
