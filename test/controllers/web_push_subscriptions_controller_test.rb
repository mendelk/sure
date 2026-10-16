require "test_helper"
require "base64"

class WebPushSubscriptionsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @other = users(:family_member)
    [ @user, @other ].each do |user|
      user.update!(preferences: user.preferences.to_h.merge("preview_features_enabled" => true))
      WebNotification::Preferences.new(user).update!(enabled: true)
    end
    WebPushSubscription.stubs(:configured?).returns(true)
    @keys = { p256dh: Base64.urlsafe_encode64("\x04" + "\x01" * 64, padding: false),
              auth: Base64.urlsafe_encode64("\x02" * 16, padding: false) }
    sign_in @user
  end

  test "registers under the session user and never returns push credentials" do
    post web_push_subscriptions_path, params: { subscription: payload.merge(user_id: @other.id) }, as: :json
    assert_response :created
    browser = WebPushSubscription.find(response.parsed_body.fetch("id"))
    assert_equal @user.id, browser.user_id
    assert_equal Current.session.id, browser.session_id
    assert_equal %w[id status], response.parsed_body.keys.sort
    refute_includes response.body, payload[:endpoint]
    refute_includes response.body, @keys[:auth]
  end

  test "rejects arbitrary endpoints without making a network request" do
    assert_no_difference "WebPushSubscription.count" do
      post web_push_subscriptions_path, params: { subscription: payload.merge(endpoint: "https://127.0.0.1/private") }, as: :json
    end
    assert_response :unprocessable_entity
  end

  test "malformed subscription shapes return a safe error rather than raising" do
    [ [], "invalid", { endpoint: payload[:endpoint], keys: [] } ].each do |subscription|
      assert_no_difference "WebPushSubscription.count" do
        post web_push_subscriptions_path, params: { subscription: subscription }, as: :json
      end
      assert_response :unprocessable_entity
      assert_equal I18n.t("web_notifications.errors.invalid_subscription"), response.parsed_body.fetch("error")
    end
  end

  test "requires explicit user and preview opt in" do
    WebNotification::Preferences.new(@user).update!(enabled: false)
    post web_push_subscriptions_path, params: { subscription: payload }, as: :json
    assert_response :unprocessable_entity

    @user.update!(preferences: @user.preferences.merge("preview_features_enabled" => false))
    post web_push_subscriptions_path, params: { subscription: payload }, as: :json
    assert_redirected_to root_path
  end

  test "reports unavailable VAPID configuration" do
    WebPushSubscription.stubs(:configured?).returns(false)
    post web_push_subscriptions_path, params: { subscription: payload }, as: :json
    assert_response :service_unavailable
  end

  test "cannot revoke another household user's browser" do
    browser = register(@other, "other")
    assert_no_difference "WebPushSubscription.count" do
      delete web_push_subscription_path(browser), as: :json
    end
    assert_response :not_found
  end

  test "browser owner can revoke a registration even after opting out" do
    browser = register(@user, "own")
    WebNotification::Preferences.new(@user).update!(enabled: false)
    assert_difference "WebPushSubscription.count", -1 do
      delete web_push_subscription_path(browser), as: :json
    end
    assert_response :no_content
  end

  test "test request targets only the current browser and queues delivery" do
    current = register(@user, "current")
    another = register(@user, "another")
    assert_enqueued_jobs 1, only: WebNotificationSweepJob do
      post test_web_push_subscription_path(current), params: { confirmed: true, subscription: payload("current") }, as: :json
    end
    assert_response :accepted
    notification = WebNotification.where(user: @user, event_type: "test").sole
    assert_equal current.id, notification.target_subscription_id
    refute_equal another.id, notification.target_subscription_id
  end

  test "test requires an explicit confirmation and cannot target another user" do
    current = register(@user, "current")
    foreign = register(@other, "foreign")
    assert_no_difference "WebNotification.count" do
      post test_web_push_subscription_path(current), as: :json
      assert_response :unprocessable_entity
      post test_web_push_subscription_path(foreign), params: { confirmed: true }, as: :json
      assert_response :not_found
    end
  end

  test "test cannot select a different owned browser using only its visible registration id" do
    register(@user, "current")
    another = register(@user, "another")
    assert_no_difference "WebNotification.count" do
      post test_web_push_subscription_path(another), params: { confirmed: true, subscription: payload("current") }, as: :json
    end
    assert_response :unprocessable_entity
    assert_equal I18n.t("web_notifications.errors.current_browser_required"), response.parsed_body.fetch("error")
  end

  test "test throttling applies across devices and survives revocation" do
    current = register(@user, "current")
    another = register(@user, "another")
    post test_web_push_subscription_path(current), params: { confirmed: true, subscription: payload("current") }, as: :json
    assert_response :accepted
    delete web_push_subscription_path(current), as: :json
    assert_no_difference "WebNotification.count" do
      post test_web_push_subscription_path(another), params: { confirmed: true, subscription: payload("another") }, as: :json
    end
    assert_response :too_many_requests
    assert_equal "60", response.headers["Retry-After"]
  end

  test "account switch replaces ownership and old owner cannot revoke the new registration" do
    old = register(@other, "shared-browser")
    post web_push_subscriptions_path, params: { subscription: payload("shared-browser") }, as: :json
    assert_response :created
    replacement = WebPushSubscription.find(response.parsed_body.fetch("id"))
    assert_equal @user.id, replacement.user_id
    refute_equal old.id, replacement.id

    sign_in @other
    delete web_push_subscription_path(replacement), as: :json
    assert_response :not_found
    assert WebPushSubscription.exists?(replacement.id)
  end

  test "enrollment revocation and tests all retain CSRF protection" do
    browser = register(@user, "current")
    original = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    assert_no_difference [ "WebPushSubscription.count", "WebNotification.count" ] do
      post web_push_subscriptions_path, params: { subscription: payload }, as: :json
      assert_response :unprocessable_entity
      delete web_push_subscription_path(browser), as: :json
      assert_response :unprocessable_entity
      post test_web_push_subscription_path(browser), params: { confirmed: true }, as: :json
      assert_response :unprocessable_entity
    end
  ensure
    ActionController::Base.allow_forgery_protection = original
  end

  test "same-user enrollment after a new login rebinds the existing browser to the new session" do
    browser = register(@user, "current")
    previous_session_id = browser.session_id
    sign_in @user
    refute_equal previous_session_id, Current.session.id

    post web_push_subscriptions_path, params: { subscription: payload("current") }, as: :json
    assert_response :created
    assert_equal browser.id, response.parsed_body.fetch("id")
    assert_equal Current.session.id, browser.reload.session_id
  end

  private
    def payload(name = "browser")
      { endpoint: "https://fcm.googleapis.com/fcm/send/#{name}", keys: @keys }
    end

    def register(user, name)
      WebPushSubscription.register_for!(user: user, session: user.sessions.order(:created_at).last || user.sessions.create!,
        endpoint: payload(name)[:endpoint], **@keys)
    end
end
