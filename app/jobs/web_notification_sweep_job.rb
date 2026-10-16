class WebNotificationSweepJob < ApplicationJob
  queue_as :scheduled

  def perform(user_id: nil)
    now = Time.current
    users = User.where(active: true).with_preview_features
      .where("preferences @> ?", { web_notifications: { enabled: true } }.to_json)
    users = users.where(id: user_id) if user_id
    users.find_each do |user|
      [ WebNotification::Transactions, WebNotification::EventCollector ].each do |generator|
        begin
          generator.new(user).call(now: now)
        rescue StandardError => error
          Rails.logger.error("Web notification generation failed user_id=#{user.id} generator=#{generator.name} error_class=#{error.class.name}")
        end
      end
      begin
        WebNotificationDelivery.prepare_for!(user, now: now)
      rescue StandardError => error
        Rails.logger.error("Web notification preparation failed user_id=#{user.id} error_class=#{error.class.name}")
      end
    end

    deliveries = WebNotificationDelivery.recoverable(now)
    deliveries = deliveries.joins(:web_notification).where(web_notifications: { user_id: user_id }) if user_id
    deliveries.find_each do |delivery|
      begin
        WebNotificationDeliveryJob.perform_later(delivery.id)
      rescue StandardError => error
        # Committed delivery rows remain recoverable if Redis is unavailable.
        Rails.logger.error("Web notification enqueue failed delivery_id=#{delivery.id} error_class=#{error.class.name}")
      end
    end
  end
end
