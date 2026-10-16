class WebNotificationDelivery < ApplicationRecord
  MAX_ATTEMPTS = 5
  LEASE = 5.minutes
  RETRY_DELAYS = [ 1.minute, 5.minutes, 15.minutes, 1.hour ].freeze
  OPEN_STATUSES = %w[pending retry processing].freeze

  belongs_to :web_notification
  belongs_to :web_push_subscription
  validates :status, inclusion: { in: OPEN_STATUSES + %w[accepted failed suppressed expired] }
  scope :recoverable, ->(now = Time.current) { where(status: OPEN_STATUSES).where("next_attempt_at <= ?", now) }

  # Called by Preferences while holding the recipient's row lock, the same lock
  # dispatch uses. Terminal delivery results are never revived by schedule edits.
  def self.reschedule_for!(user, preferences:, now: Time.current)
    notifications = WebNotification.where(user_id: user.id).where.not(event_type: "test")
      .where("created_at >= ?", preferences.enabled_at || user.created_at)
    notifications = notifications.where.not(id: select(:web_notification_id))
      .or(notifications.where(id: where(status: OPEN_STATUSES).select(:web_notification_id)))
    scheduled_at = preferences.next_push_at(now: now)
    notifications.update_all(push_after: scheduled_at, updated_at: now)
    where(web_notification_id: notifications.select(:id), status: OPEN_STATUSES).update_all(
      status: "pending", next_attempt_at: scheduled_at, updated_at: now,
      digest_key: preferences.frequency == "daily_digest" ? scheduled_at.utc.iso8601 : nil)
  end

  # Creation and enqueueing are deliberately separate. The periodic sweep can
  # reconstruct missing rows and recover any committed rows Redis never saw.
  def self.prepare_for!(user, now: Time.current)
    user.with_lock do
      preferences = WebNotification::Preferences.new(user)
      return unless user.active? && user.preview_features_enabled? && preferences.enabled?

      WebPushSubscription.enabled.where(user_id: user.id).find_each do |subscription|
        notifications = WebNotification.visible_to(user).where("push_after <= ? AND created_at >= ?", now, preferences.enabled_at || user.created_at)
          .where("created_at >= ?", subscription.created_at)
          .where(target_subscription_id: [ nil, subscription.id ])
          .where(event_type: preferences.event_types + [ "test" ])
          .where.not(id: where(web_push_subscription_id: subscription.id).select(:web_notification_id))
        notifications = notifications.where(account_id: [ nil ] + preferences.account_ids) if preferences.account_ids.any?
        notifications.find_each do |notification|
          next unless preferences.eligible_for?(event_type: notification.event_type, account: notification.account)
          create_or_find_by!(web_notification: notification, web_push_subscription: subscription) do |delivery|
            delivery.next_attempt_at = notification.push_after
            if preferences.frequency == "daily_digest" && notification.event_type != "test"
              delivery.digest_key = notification.push_after.utc.iso8601
            end
          end
        end
      end
    end
  end

  def deliver!(now: Time.current)
    owner = web_notification.user
    claimed_ids = claim!(owner, now)
    return if claimed_ids.empty?

    # Serialize browser ownership and preference changes against dispatch, and
    # recheck financial access immediately before the bounded network request.
    owner.with_lock do
      subscription = WebPushSubscription.lock.find_by(id: web_push_subscription_id, user_id: owner.id)
      browser_session = Session.lock.find_by(id: subscription.session_id, user_id: owner.id) if subscription
      deliveries = self.class.where(id: claimed_ids, status: "processing").order(:id).lock.to_a
      return if deliveries.empty?
      preferences = WebNotification::Preferences.new(owner)
      deliveries.select! do |delivery|
        notification = delivery.web_notification
        allowed = browser_session && subscription.disabled_at.nil? && subscription.endpoint_allowed? &&
          notification.authorized? && preferences.eligible_for?(event_type: notification.event_type, account: notification.account) &&
          (notification.event_type == "test" || preferences.enabled_at.nil? || notification.created_at >= preferences.enabled_at)
        delivery.update!(status: "suppressed", error_code: "access_revoked") unless allowed
        allowed
      end
      return if deliveries.empty?

      allowed_at = preferences.next_push_at(now: now, digest: false)
      unless deliveries.first.web_notification.event_type == "test" || allowed_at <= now
        deliveries.each { |delivery| delivery.update!(status: "pending", attempts: delivery.attempts - 1, next_attempt_at: allowed_at, error_code: nil) }
        return
      end

      begin
        raise WebPush::ConfigurationError, "Web Push is not configured" unless WebPushSubscription.configured?
        response = WebPush.payload_send(endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth,
          message: payload_for(deliveries, owner).to_json,
          vapid: { subject: ENV.fetch("WEB_PUSH_SUBJECT"), public_key: WebPushSubscription.public_key, private_key: ENV.fetch("WEB_PUSH_PRIVATE_KEY") },
          ttl: 1.hour.to_i, urgency: "normal", open_timeout: 5, read_timeout: 10, ssl_timeout: 5)
        # Accepted means the push service accepted the request, never that the
        # browser displayed it. A worker death after HTTP acceptance can replay;
        # the stable OS tag replaces the previous visible notification.
        unless response.code.to_i.between?(200, 299)
          raise WebPush::ResponseError.new(response, "push_service")
        end
        subscription.update!(last_status: response.code.to_i)
        deliveries.each { |delivery| delivery.update!(status: "accepted", accepted_at: now, error_code: nil) }
      rescue WebPush::ResponseError => error
        status = error.response.code.to_i
        subscription.update!(last_status: status)
        if [ 404, 410 ].include?(status)
          subscription.update!(disabled_at: now)
          deliveries.each { |delivery| delivery.update!(status: "expired", error_code: "http_#{status}") }
        elsif status == 429 || status.between?(500, 599)
          retry_deliveries!(deliveries, "http_#{status}", now)
        else
          deliveries.each { |delivery| delivery.update!(status: "failed", error_code: "http_#{status}") }
        end
      rescue StandardError => error
        # Never persist/log exception messages: push provider responses and URI
        # exceptions may contain credential-bearing endpoints or payloads.
        retry_deliveries!(deliveries, error.is_a?(WebPush::ConfigurationError) ? "not_configured" : "transport_error", now)
      end
    end
  rescue ActiveRecord::RecordNotFound
    # Revoking a subscription deletes its deliveries and invalidates queued IDs.
    nil
  end

  private
    def claim!(owner, now)
      owner.with_lock do
        reload
        return [] unless OPEN_STATUSES.include?(status) && next_attempt_at <= now
        relation = self.class.where(web_push_subscription_id: web_push_subscription_id).recoverable(now)
        relation = digest_key.present? ? relation.where(digest_key: digest_key) : relation.where(id: id)
        relation.order(:id).lock.filter_map do |delivery|
          if delivery.attempts >= MAX_ATTEMPTS
            delivery.update!(status: "failed", error_code: "attempts_exhausted")
            next
          end
          delivery.update!(status: "processing", attempts: delivery.attempts + 1, next_attempt_at: now + LEASE)
          delivery.id
        end
      end
    end

    def retry_deliveries!(deliveries, code, now)
      deliveries.each do |delivery|
        exhausted = delivery.attempts >= MAX_ATTEMPTS
        delivery.update!(status: exhausted ? "failed" : "retry", error_code: code,
          next_attempt_at: now + RETRY_DELAYS.fetch([ delivery.attempts - 1, RETRY_DELAYS.length - 1 ].min))
      end
    end

    def payload_for(deliveries, owner)
      return deliveries.first.web_notification.push_payload unless digest_key.present?

      locale = owner.locale.presence || owner.family.locale.presence || I18n.default_locale
      { title: I18n.t("web_notifications.digest_title", locale: locale, count: deliveries.size),
        body: I18n.t("web_notifications.digest_body", locale: locale, count: deliveries.size),
        path: Rails.application.routes.url_helpers.web_notifications_path,
        tag: "web-notification-digest-#{Digest::SHA256.hexdigest("#{web_push_subscription_id}:#{digest_key}")[0, 32]}" }
    end
end
