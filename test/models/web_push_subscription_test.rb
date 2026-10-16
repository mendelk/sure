require "test_helper"
require_relative "../support/web_notification_test_helper"

class WebPushSubscriptionTest < ActiveSupport::TestCase
  include WebNotificationTestHelper

  test "only known HTTPS browser push services are accepted" do
    browser = register_web_browser(users(:family_admin))
    [ "http://fcm.googleapis.com/fcm/send/key", "https://127.0.0.1/push", "https://[::1]/push",
      "https://169.254.169.254/latest/meta-data", "https://fcm.googleapis.com.attacker.example/push",
      "https://fcm.googleapis.com@evil.example/push", "https://evil.example@fcm.googleapis.com/push",
      "https://fcm.googleapis.com:8443/push", "https://fcm.googleapis.com/push#fragment",
      "https://localhost/push", "file:///etc/passwd", "https://push.apple.com.evil.example/push",
      "https://wns.notify.windows.com.attacker.example/push", "https://notnotify.windows.com/push" ].each do |endpoint|
      browser.endpoint = endpoint
      assert_not browser.valid?, endpoint
      assert_includes browser.errors.attribute_names, :endpoint
    end
    [ "https://fcm.googleapis.com/fcm/send/key", "https://updates.push.services.mozilla.com/wpush/v2/key",
      "https://web.push.apple.com/key", "https://wns2-db5p.notify.windows.com/w/?token=key" ].each do |endpoint|
      browser.endpoint = endpoint
      assert browser.valid?, browser.errors.full_messages.join(", ")
    end
  end

  test "malformed key encodings and wrong decoded key lengths are rejected" do
    browser = register_web_browser(users(:family_admin))
    [ "not a key", Base64.urlsafe_encode64("a" * 64), Base64.urlsafe_encode64("a" * 65) ].each do |key|
      browser.p256dh = key
      assert_not browser.valid?
      assert_includes browser.errors.attribute_names, :p256dh
    end
    browser.p256dh = @browser_key
    browser.auth = Base64.urlsafe_encode64("a" * 15)
    assert_not browser.valid?
    assert_includes browser.errors.attribute_names, :auth
  end

  test "authenticated browser ownership transfer invalidates stale revocations and deliveries" do
    owner = users(:family_admin)
    browser = register_web_browser(owner)
    old_id = browser.id
    replacement = WebPushSubscription.register_for!(user: users(:family_member), session: users(:family_member).sessions.create!, endpoint: browser.endpoint,
      p256dh: browser.p256dh, auth: browser.auth)
    assert_not_equal old_id, replacement.id
    assert_not WebPushSubscription.exists?(old_id)
    assert_nil WebPushSubscription.where(user_id: owner.id).find_by(id: replacement.id)
    assert_equal 0, WebPushSubscription.where(user_id: owner.id, id: old_id).delete_all
    assert WebPushSubscription.exists?(replacement.id)
  end

  test "knowing endpoint without browser credentials does not authorize takeover" do
    browser = register_web_browser(users(:family_admin))
    assert_raises(ActiveRecord::RecordInvalid) do
      WebPushSubscription.register_for!(user: users(:family_member), session: users(:family_member).sessions.create!, endpoint: browser.endpoint,
        p256dh: browser.p256dh, auth: Base64.urlsafe_encode64("b" * 16))
    end
    assert_equal users(:family_admin).id, browser.reload.user_id
  end

  test "same owner explicit reenrollment preserves id and reactivates registration" do
    browser = register_web_browser(users(:family_admin))
    browser.update!(disabled_at: Time.current)
    repeated = register_web_browser(users(:family_admin))
    assert_equal browser.id, repeated.id
    assert_nil repeated.disabled_at
  end

  test "enrollment requires an existing session belonging to the registered user" do
    owner = users(:family_admin)
    browser = register_web_browser(owner)
    deleted_session = owner.sessions.create!
    deleted_session.destroy!
    [ nil, owner.sessions.build, deleted_session, users(:family_member).sessions.create! ].each do |session|
      assert_raises(ActiveRecord::RecordInvalid) do
        WebPushSubscription.register_for!(user: owner, session: session, endpoint: browser.endpoint,
          p256dh: browser.p256dh, auth: browser.auth)
      end
    end
    assert_equal browser.session_id, browser.reload.session_id
  end

  test "a surviving session cannot enroll a browser for an inactive user" do
    owner = users(:family_admin)
    browser = register_web_browser(owner)
    owner.update_columns(active: false)
    assert_raises(ActiveRecord::RecordInvalid) do
      WebPushSubscription.register_for!(user: owner, session: browser.session, endpoint: browser.endpoint,
        p256dh: browser.p256dh, auth: browser.auth)
    end
  end

  test "same owner reenrollment binds the new session and old logout cannot revoke it" do
    owner = users(:family_admin)
    browser = register_web_browser(owner)
    previous_session = browser.session
    current_session = owner.sessions.create!
    renewed = WebPushSubscription.register_for!(user: owner, session: current_session, endpoint: browser.endpoint,
      p256dh: browser.p256dh, auth: browser.auth)
    assert_equal browser.id, renewed.id
    assert_equal current_session.id, renewed.session_id
    previous_session.destroy!
    assert WebPushSubscription.exists?(renewed.id)
    current_session.destroy!
    assert_not WebPushSubscription.exists?(renewed.id)
  end

  test "credentials are redacted from inspect JSON and parameter logs" do
    browser = register_web_browser(users(:family_admin))
    [ browser.endpoint, browser.p256dh, browser.auth ].each do |secret|
      assert_not_includes browser.inspect, secret
      assert_not_includes browser.to_json, secret
    end
    assert_empty browser.as_json(only: [ :endpoint, :p256dh, :auth ])
    filter = ActiveSupport::ParameterFilter.new(Rails.application.config.filter_parameters)
    assert_equal({ "endpoint" => "[FILTERED]", "p256dh" => "[FILTERED]", "auth" => "[FILTERED]" },
      filter.filter("endpoint" => browser.endpoint, "p256dh" => browser.p256dh, "auth" => browser.auth))
  end
end
