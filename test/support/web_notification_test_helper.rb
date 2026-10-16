module WebNotificationTestHelper
  def enable_web_notifications(user = users(:family_admin), **settings)
    user.update!(preferences: (user.preferences || {}).merge("preview_features_enabled" => true))
    WebNotification::Preferences.new(user).update!({ enabled: true }.merge(settings))
    user
  end

  def register_web_browser(user, suffix: "browser")
    @browser_key ||= WebPush.generate_key.public_key
    @browser_sessions ||= {}
    session = @browser_sessions[[ user.id, suffix ]] ||= user.sessions.create!
    WebPushSubscription.register_for!(user: user, session: session, endpoint: "https://fcm.googleapis.com/fcm/send/#{suffix}",
      p256dh: @browser_key, auth: Base64.urlsafe_encode64("a" * 16, padding: false))
  end

  def publish_web_transaction(user, account: accounts(:depository), key: "transaction", now: Time.current)
    WebNotification.publish!(user: user, account: account, event_type: "transactions_added",
      dedup_key: key, data: { entry_ids: [ SecureRandom.uuid ], count: 1 }, now: now)
  end

  def with_web_push_config(&block)
    @vapid_key ||= WebPush.generate_key
    with_env_overrides("WEB_PUSH_PUBLIC_KEY" => @vapid_key.public_key,
      "WEB_PUSH_PRIVATE_KEY" => @vapid_key.private_key,
      "WEB_PUSH_SUBJECT" => "mailto:notifications@example.com", &block)
  end
end
