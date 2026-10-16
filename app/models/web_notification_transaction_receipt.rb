class WebNotificationTransactionReceipt < ApplicationRecord
  belongs_to :user
  belongs_to :event, class_name: "WebNotificationTransactionEvent"
  belongs_to :web_notification
end
