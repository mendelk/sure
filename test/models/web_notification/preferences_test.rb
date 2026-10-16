require "test_helper"
require_relative "../../support/web_notification_test_helper"

class WebNotificationPreferencesTest < ActiveSupport::TestCase
  include WebNotificationTestHelper

  setup do
    @user = users(:family_admin)
    @user.family.update!(timezone: "America/New_York")
  end

  teardown { travel_back }

  test "disabled defaults and explicit opt in baseline survive unrelated edits" do
    preferences = WebNotification::Preferences.new(@user)
    assert_not preferences.enabled?
    assert_not preferences.show_details?
    assert_not preferences.include_pending?
    assert_equal BigDecimal("0"), preferences.minimum_amount_for("EUR")
    assert_nil preferences.enabled_at

    travel_to Time.utc(2026, 10, 16, 12)
    enable_web_notifications(@user)
    enabled_at = WebNotification::Preferences.new(@user).enabled_at
    travel 1.hour
    WebNotification::Preferences.new(@user).update!(show_details: true)
    assert_equal enabled_at, WebNotification::Preferences.new(@user).enabled_at
    WebNotification::Preferences.new(@user).update!(enabled: false)
    WebNotification::Preferences.new(@user).update!(enabled: true)
    assert_equal Time.current, WebNotification::Preferences.new(@user).enabled_at
  end

  test "overnight quiet hours cover both sides of midnight and end boundary is open" do
    enable_web_notifications(@user, quiet_start: "22:00", quiet_end: "07:00")
    preferences = WebNotification::Preferences.new(@user)
    assert_equal Time.utc(2026, 10, 17, 11), preferences.next_push_at(now: Time.utc(2026, 10, 17, 3))
    assert_equal Time.utc(2026, 10, 17, 11), preferences.next_push_at(now: Time.utc(2026, 10, 17, 9))
    assert_equal Time.utc(2026, 10, 17, 11), preferences.next_push_at(now: Time.utc(2026, 10, 17, 11))
    assert_equal Time.utc(2026, 10, 16, 16), preferences.next_push_at(now: Time.utc(2026, 10, 16, 16))
  end

  test "digest uses family local calendar and quiet ending across DST fallback" do
    enable_web_notifications(@user, frequency: "daily_digest", digest_at: "23:00", quiet_start: "22:00", quiet_end: "07:00")
    preferences = WebNotification::Preferences.new(@user)
    assert_equal Time.utc(2026, 11, 1, 12), preferences.next_push_at(now: Time.utc(2026, 10, 31, 16))
    preferences.update!(digest_at: "09:00", quiet_start: nil, quiet_end: nil)
    assert_equal Time.utc(2026, 11, 1, 14), preferences.next_push_at(now: Time.utc(2026, 11, 1, 13))
    assert_equal Time.utc(2026, 11, 2, 14), preferences.next_push_at(now: Time.utc(2026, 11, 1, 15))
  end

  test "invalid schedules thresholds currencies and private account selections are rejected atomically" do
    enable_web_notifications(@user)
    preferences = WebNotification::Preferences.new(@user)
    [ { quiet_start: "25:00", quiet_end: "07:00" }, { quiet_start: "22:00" },
      { digest_at: "9:00" }, { frequency: "hourly" }, { budget_threshold_pct: 0 },
      { minimum_amounts: { "USD" => "-1" } }, { minimum_amounts: { "ZZZ" => "2" } },
      { account_ids: [ SecureRandom.uuid ] }, { event_types: [ "unknown" ] } ].each do |attributes|
      assert_raises(ActiveModel::ValidationError) { preferences.update!(attributes) }
      assert preferences.errors.any?
      assert_equal "immediate", WebNotification::Preferences.new(@user.reload).frequency
    end
  end

  test "per currency minimums and account selection do not suppress scoped budget events" do
    enable_web_notifications(@user, account_ids: [ accounts(:depository).id ], minimum_amounts: { "USD" => "12.50" })
    preferences = WebNotification::Preferences.new(@user)
    assert_equal BigDecimal("12.5"), preferences.minimum_amount_for("USD")
    assert_equal BigDecimal("0"), preferences.minimum_amount_for("EUR")
    assert preferences.eligible_for?(event_type: "transactions_added", account: accounts(:depository))
    assert_not preferences.eligible_for?(event_type: "transactions_added", account: accounts(:credit_card))
    assert preferences.eligible_for?(event_type: "budget_threshold")
    assert_not preferences.eligible_for?(event_type: "payment_due")
  end

  test "test event bypasses event selection but not opt in or preview" do
    enable_web_notifications(@user, event_types: [])
    assert WebNotification::Preferences.new(@user).eligible_for?(event_type: "test")
    assert_not WebNotification::Preferences.new(@user).eligible_for?(event_type: "transactions_added", account: accounts(:depository))
    @user.update!(preferences: @user.preferences.merge("preview_features_enabled" => false))
    assert_not WebNotification::Preferences.new(@user).eligible_for?(event_type: "test")
  end
end
