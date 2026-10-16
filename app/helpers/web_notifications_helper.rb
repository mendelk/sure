module WebNotificationsHelper
  def web_notification_event_types
    WebNotification::Preferences::EVENT_TYPES
  end

  def web_notification_browser_data(preferences)
    {
      controller: "web-push",
      web_push_public_key_value: WebPushSubscription.public_key,
      web_push_configured_value: WebPushSubscription.configured?,
      web_push_enabled_value: preferences.enabled?,
      web_push_user_id_value: Current.user.id,
      web_push_session_id_value: Current.session.id,
      web_push_create_url_value: web_push_subscriptions_path,
      web_push_messages_value: t("web_notifications.browser.states").to_json,
      action: "web-push:renewed@window->web-push#refresh web-push:changed@window->web-push#refresh web-push:reconcile-failed@window->web-push#reconcileFailed"
    }
  end

  def web_notification_delivery_label(notification)
    t("web_notifications.delivery.#{notification.delivery_summary}", default: t("web_notifications.delivery.unknown"))
  end

  def web_push_device_label(subscription)
    subscription.label.presence || t("web_notifications.browser.unnamed")
  end
end
