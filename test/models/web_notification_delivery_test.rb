require "test_helper"
require_relative "../support/web_notification_test_helper"

class WebNotificationDeliveryTest < ActiveSupport::TestCase
  include WebNotificationTestHelper

  setup do
    travel_to Time.utc(2026, 10, 16, 12)
    @user = enable_web_notifications
    @user.family.update!(timezone: "UTC")
    @browser = register_web_browser(@user)
    @notification = publish_web_transaction(@user)
  end

  teardown { travel_back }

  test "actual RFC Web Push transport encrypts and records service acceptance not browser display" do
    WebNotificationDelivery.prepare_for!(@user)
    delivery = @notification.web_notification_deliveries.sole
    request = stub_request(:post, @browser.endpoint).with do |http|
      http.headers["Authorization"].start_with?("vapid t=") &&
        http.headers["Content-Encoding"] == "aes128gcm" &&
        !http.body.include?(accounts(:depository).name)
    end.to_return(status: 201)
    with_web_push_config { delivery.deliver! }
    assert_requested request, times: 1
    assert_equal "accepted", delivery.reload.status
    assert_equal Time.current, delivery.accepted_at
    assert_equal 1, delivery.attempts
    assert_equal "accepted", @notification.delivery_summary
    assert_equal 201, @browser.reload.last_status
    with_web_push_config { delivery.deliver! }
    assert_requested request, times: 1
  end

  test "expired subscription is disabled without claiming unsent work accepted" do
    WebNotificationDelivery.prepare_for!(@user)
    delivery = @notification.web_notification_deliveries.sole
    stub_request(:post, @browser.endpoint).to_return(status: 410)
    with_web_push_config { delivery.deliver! }
    assert_equal "expired", delivery.reload.status
    assert_nil delivery.accepted_at
    assert @browser.reload.disabled_at
    assert_equal 410, @browser.last_status
  end

  test "transient service errors retry durably and stop after five physical attempts" do
    WebNotificationDelivery.prepare_for!(@user)
    delivery = @notification.web_notification_deliveries.sole
    request = stub_request(:post, @browser.endpoint).to_return(status: 503)
    with_web_push_config do
      5.times do |index|
        delivery.deliver!
        delivery.reload
        assert_equal index + 1, delivery.attempts
        assert_equal(index == 4 ? "failed" : "retry", delivery.status)
        assert_nil delivery.accepted_at
        travel_to delivery.next_attempt_at
      end
      delivery.deliver!
    end
    assert_requested request, times: 5
    assert_nil @browser.reload.disabled_at
  end

  test "rate limits and timeouts remain recoverable while authentication errors fail explicitly" do
    WebNotificationDelivery.prepare_for!(@user)
    delivery = @notification.web_notification_deliveries.sole
    stub_request(:post, @browser.endpoint).to_return(status: 429)
    with_web_push_config { delivery.deliver! }
    assert_equal "retry", delivery.reload.status
    assert_equal "http_429", delivery.error_code
    travel_to delivery.next_attempt_at
    stub_request(:post, @browser.endpoint).to_timeout
    with_web_push_config { delivery.deliver! }
    assert_equal "retry", delivery.reload.status
    assert_equal "transport_error", delivery.error_code
    travel_to delivery.next_attempt_at
    stub_request(:post, @browser.endpoint).to_return(status: 403)
    with_web_push_config { delivery.deliver! }
    assert_equal "failed", delivery.reload.status
    assert_equal "http_403", delivery.error_code
    assert_nil delivery.accepted_at
  end

  test "missing VAPID never produces fake acceptance" do
    WebNotificationDelivery.prepare_for!(@user)
    delivery = @notification.web_notification_deliveries.sole
    with_env_overrides("WEB_PUSH_PUBLIC_KEY" => nil, "WEB_PUSH_PRIVATE_KEY" => nil, "WEB_PUSH_SUBJECT" => nil) do
      delivery.deliver!
    end
    assert_equal "retry", delivery.reload.status
    assert_equal "not_configured", delivery.error_code
    assert_nil delivery.accepted_at
    assert_not_requested :post, @browser.endpoint
  end

  test "delivery time opt out and account access loss prevent any network disclosure" do
    WebNotificationDelivery.prepare_for!(@user)
    delivery = @notification.web_notification_deliveries.sole
    WebNotification::Preferences.new(@user).update!(enabled: false)
    with_web_push_config { delivery.deliver! }
    assert_equal "suppressed", delivery.reload.status
    assert_not_requested :post, @browser.endpoint

    WebNotification::Preferences.new(@user).update!(enabled: true)
    other = publish_web_transaction(@user, key: "later")
    WebNotificationDelivery.prepare_for!(@user)
    accounts(:depository).update_columns(owner_id: users(:family_member).id)
    accounts(:depository).account_shares.where(user: @user).delete_all
    with_web_push_config { other.web_notification_deliveries.sole.deliver! }
    assert_equal "suppressed", other.web_notification_deliveries.sole.status
    assert_not_requested :post, @browser.endpoint
  end

  test "stale processing lease recovers without silently accepting abandoned work" do
    WebNotificationDelivery.prepare_for!(@user)
    delivery = @notification.web_notification_deliveries.sole
    delivery.update!(status: "processing", attempts: 1, next_attempt_at: 5.minutes.from_now)
    with_web_push_config { delivery.deliver! }
    assert_equal "processing", delivery.reload.status
    assert_nil delivery.accepted_at
    assert_not_requested :post, @browser.endpoint
    travel 6.minutes
    request = stub_request(:post, @browser.endpoint).to_return(status: 201)
    with_web_push_config { delivery.deliver! }
    assert_requested request, times: 1
    assert_equal "accepted", delivery.reload.status
    assert_equal 2, delivery.attempts
  end

  test "digest produces one transport request while retaining separate inbox and delivery records" do
    @notification.destroy!
    WebNotification::Preferences.new(@user).update!(frequency: "daily_digest", digest_at: "13:00")
    notifications = 3.times.map { |index| publish_web_transaction(@user, key: "digest-#{index}") }
    WebNotificationDelivery.prepare_for!(@user)
    assert_equal 0, WebNotificationDelivery.count
    travel 1.hour
    WebNotificationDelivery.prepare_for!(@user)
    assert_equal 3, WebNotificationDelivery.count
    assert_equal 1, WebNotificationDelivery.distinct.count(:digest_key)
    request = stub_request(:post, @browser.endpoint).to_return(status: 201)
    with_web_push_config { WebNotificationDelivery.order(:id).each(&:deliver!) }
    assert_requested request, times: 1
    assert_equal 3, WebNotificationDelivery.where(status: "accepted").count
    assert_equal notifications.map(&:id).sort, WebNotification.order(:id).pluck(:id).sort
  end

  test "logout removes the browser registration and prevents queued delivery" do
    WebNotificationDelivery.prepare_for!(@user)
    delivery_id = @notification.web_notification_deliveries.sole.id
    @browser.session.destroy!
    assert_not WebPushSubscription.exists?(@browser.id)
    assert_not WebNotificationDelivery.exists?(delivery_id)
    with_web_push_config { WebNotificationDeliveryJob.perform_now(delivery_id) }
    assert_not_requested :post, @browser.endpoint
  end

  test "legacy unbound and mismatched sessions cannot authorize a financial push" do
    WebNotificationDelivery.prepare_for!(@user)
    delivery = @notification.web_notification_deliveries.sole
    @browser.update_columns(session_id: nil)
    with_web_push_config { delivery.deliver! }
    assert_equal "suppressed", delivery.reload.status
    assert_not_requested :post, @browser.endpoint

    @browser.update_columns(session_id: users(:family_member).sessions.create!.id)
    second = publish_web_transaction(@user, key: "mismatched-session")
    mismatched_delivery = WebNotificationDelivery.create!(web_notification: second,
      web_push_subscription: @browser, next_attempt_at: Time.current)
    with_web_push_config { mismatched_delivery.deliver! }
    assert_equal "suppressed", mismatched_delivery.reload.status
    assert_not_requested :post, @browser.endpoint
  end

  test "immediate to digest reschedules already queued work and combines new arrivals" do
    WebNotificationDelivery.prepare_for!(@user)
    delivery = @notification.web_notification_deliveries.sole
    WebNotification::Preferences.new(@user).update!(frequency: "daily_digest", digest_at: "13:00")
    assert_equal Time.utc(2026, 10, 16, 13), delivery.reload.next_attempt_at
    assert_equal delivery.next_attempt_at.utc.iso8601, delivery.digest_key
    with_web_push_config { delivery.deliver! }
    assert_not_requested :post, @browser.endpoint
    second = publish_web_transaction(@user, key: "digest-new-arrival")
    travel 1.hour
    WebNotificationDelivery.prepare_for!(@user)
    assert_equal delivery.digest_key, second.web_notification_deliveries.sole.digest_key
    request = stub_request(:post, @browser.endpoint).to_return(status: 201)
    with_web_push_config { delivery.deliver! }
    assert_requested request, times: 1
    assert_equal 2, WebNotificationDelivery.where(status: "accepted").count
  end

  test "digest to immediate advances unsent work without replaying accepted deliveries" do
    WebNotificationDelivery.prepare_for!(@user)
    accepted = @notification.web_notification_deliveries.sole
    request = stub_request(:post, @browser.endpoint).to_return(status: 201)
    with_web_push_config { accepted.deliver! }
    WebNotification::Preferences.new(@user).update!(frequency: "daily_digest", digest_at: "13:00")
    later = publish_web_transaction(@user, key: "digest-to-immediate")
    WebNotificationDelivery.prepare_for!(@user, now: 1.hour.from_now)
    pending = later.web_notification_deliveries.sole
    assert pending.digest_key
    WebNotification::Preferences.new(@user).update!(frequency: "immediate")
    assert_equal Time.current, pending.reload.next_attempt_at
    assert_nil pending.digest_key
    assert_equal Time.current, later.reload.push_after
    assert_equal "accepted", accepted.reload.status
    assert_equal 1, accepted.attempts
    with_web_push_config do
      accepted.deliver!
      pending.deliver!
    end
    assert_requested request, times: 2
    assert_equal "accepted", pending.reload.status
    assert_equal 1, accepted.reload.attempts
  end

  test "digest localization follows the recipient preference before the family locale" do
    @user.update!(locale: "es")
    WebNotification::Preferences.new(@user).update!(frequency: "daily_digest", digest_at: "13:00")
    travel 1.hour
    WebNotificationDelivery.prepare_for!(@user)
    I18n.expects(:t).with("web_notifications.digest_title", locale: "es", count: 1).returns("Resumen")
    I18n.expects(:t).with("web_notifications.digest_body", locale: "es", count: 1).returns("Una notificación")
    request = stub_request(:post, @browser.endpoint).to_return(status: 201)
    with_web_push_config { @notification.web_notification_deliveries.sole.deliver! }
    assert_requested request, times: 1
  end

  test "targeted test never fans out and later enrolled browser receives no historical burst" do
    second = register_web_browser(@user, suffix: "second")
    notification = WebNotification.publish!(user: @user, event_type: "test", dedup_key: "browser-test", subscription: @browser)
    WebNotificationDelivery.prepare_for!(@user)
    assert_equal [ @browser.id ], notification.web_notification_deliveries.pluck(:web_push_subscription_id)
    travel 1.minute
    third = register_web_browser(@user, suffix: "third")
    WebNotificationDelivery.prepare_for!(@user)
    assert_not WebNotificationDelivery.exists?(web_push_subscription: third)
    assert_not notification.web_notification_deliveries.exists?(web_push_subscription: second)
  end
end
