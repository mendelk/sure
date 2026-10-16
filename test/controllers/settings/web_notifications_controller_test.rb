require "test_helper"

class Settings::WebNotificationsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @user.update!(preferences: @user.preferences.to_h.merge("preview_features_enabled" => true, "existing_setting" => "keep"))
    WebPushSubscription.stubs(:configured?).returns(false)
    sign_in @user
    ensure_tailwind_build
  end

  test "requires the user's preview opt in" do
    @user.update!(preferences: @user.preferences.merge("preview_features_enabled" => false))
    get settings_web_notifications_path
    assert_redirected_to root_path
    patch settings_web_notifications_path, params: { web_notifications: { enabled: "1" } }
    assert_redirected_to root_path
    refute WebNotification::Preferences.new(@user.reload).enabled?
  end

  test "renders all preferences and explicit unavailable server state" do
    get settings_web_notifications_path
    assert_response :success
    assert_select "input[name='web_notifications[enabled]'][type=checkbox]"
    assert_select "input[name='web_notifications[event_types][]'][type=checkbox]", count: 6
    assert_select "input[name='web_notifications[minimum_amounts][USD]']"
    assert_select "select[name='web_notifications[frequency]']"
    assert_select "input[name='web_notifications[quiet_start]']"
    assert_select "input[name='web_notifications[quiet_end]']"
    assert_select "input[name='web_notifications[show_details]'][type=checkbox]"
    assert_select "input[name='web_notifications[bill_days_before]']"
    assert_select "input[name='web_notifications[budget_threshold_pct]']"
    assert_includes response.body, I18n.t("web_notifications.errors.unconfigured")
  end

  test "saves all settings for current user without overwriting other preferences" do
    connected = accounts(:connected)
    connected.update!(currency: "EUR")
    patch settings_web_notifications_path, params: { web_notifications: {
      enabled: "1", event_types: [ "", "transactions_added", "payment_due" ],
      account_ids: [ "", accounts(:depository).id, connected.id ], include_pending: "1",
      minimum_amounts: { "USD" => "2.50", "EUR" => "7" }, frequency: "daily_digest",
      digest_at: "08:30", quiet_start: "22:00", quiet_end: "07:00", show_details: "0",
      bill_days_before: "5", budget_threshold_pct: "90"
    } }
    assert_redirected_to settings_web_notifications_path(updated: "1")
    preferences = WebNotification::Preferences.new(@user.reload)
    assert preferences.enabled?
    assert preferences.include_pending?
    refute preferences.show_details?
    assert_equal [ "transactions_added", "payment_due" ], preferences.event_types
    assert_equal "daily_digest", preferences.frequency
    assert_equal "08:30", preferences.digest_at
    assert_equal "22:00", preferences.quiet_start
    assert_equal "07:00", preferences.quiet_end
    assert_equal BigDecimal("2.50"), preferences.minimum_amount_for("USD")
    assert_equal BigDecimal("7"), preferences.minimum_amount_for("EUR")
    assert_equal 5, preferences.bill_days_before
    assert_equal 90, preferences.budget_threshold_pct
    assert_equal "keep", @user.preferences["existing_setting"]
    refute WebNotification::Preferences.new(users(:family_member)).enabled?
  end

  test "rejects account selection after access is removed" do
    account = accounts(:depository)
    account.update!(owner: users(:family_member))
    account.unshare_with!(@user)
    patch settings_web_notifications_path, params: { web_notifications: { enabled: "1", account_ids: [ account.id ] } }
    assert_response :unprocessable_entity
    refute WebNotification::Preferences.new(@user.reload).enabled?
    assert_select "input[name='web_notifications[account_ids][]'][value=?]", account.id, count: 0
  end

  test "invalid currency thresholds render an actionable validation error without saving" do
    patch settings_web_notifications_path, params: { web_notifications: {
      enabled: "1", minimum_amounts: { "USD" => "invalid" }
    } }
    assert_response :unprocessable_entity
    assert_includes response.body, I18n.t("web_notifications.preferences.invalid")
    assert_select "[data-web-push-enabled-value='false']"
    refute WebNotification::Preferences.new(@user.reload).enabled?
  end

  test "device list is user scoped and never renders endpoint or encryption credentials" do
    keys = { p256dh: Base64.urlsafe_encode64("\x04" + "\x01" * 64, padding: false),
             auth: Base64.urlsafe_encode64("\x02" * 16, padding: false) }
    endpoint = "https://fcm.googleapis.com/fcm/send/secret-owned-endpoint"
    browser = WebPushSubscription.register_for!(user: @user, session: Current.session, endpoint: endpoint, label: "Owned device", **keys)
    WebPushSubscription.register_for!(user: users(:family_member), session: users(:family_member).sessions.create!,
      endpoint: "https://fcm.googleapis.com/fcm/send/foreign-endpoint", label: "Foreign device", **keys)
    get settings_web_notifications_path
    assert_response :success
    assert_includes response.body, "Owned device"
    refute_includes response.body, "Foreign device"
    refute_includes response.body, endpoint
    refute_includes response.body, keys[:p256dh]
    refute_includes response.body, keys[:auth]
    assert_select "[data-subscription-id=?]", browser.id
  end

  test "saving unrelated fields does not reset enabled baseline" do
    WebNotification::Preferences.new(@user).update!(enabled: true)
    original = WebNotification::Preferences.new(@user).enabled_at
    travel 5.minutes do
      patch settings_web_notifications_path, params: { web_notifications: { show_details: "1" } }
    end
    assert_equal original, WebNotification::Preferences.new(@user.reload).enabled_at
  end

  test "settings update retains CSRF protection" do
    original = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    patch settings_web_notifications_path, params: { web_notifications: { enabled: "1" } }, as: :json
    assert_response :unprocessable_entity
    refute WebNotification::Preferences.new(@user.reload).enabled?
  ensure
    ActionController::Base.allow_forgery_protection = original
  end
end
