class WebNotificationDeliveryJob < ApplicationJob
  queue_as :scheduled

  def perform(delivery_id)
    WebNotificationDelivery.find_by(id: delivery_id)&.deliver!
  end
end
