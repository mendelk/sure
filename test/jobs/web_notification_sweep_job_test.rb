require "test_helper"
require_relative "../support/web_notification_test_helper"

class WebNotificationSweepJobTest < ActiveJob::TestCase
  include WebNotificationTestHelper

  setup do
    @user = enable_web_notifications
    register_web_browser(@user)
    @notification = publish_web_transaction(@user)
    WebNotification::Transactions.any_instance.stubs(:call)
    WebNotification::EventCollector.any_instance.stubs(:call)
  end

  test "global scheduled sweep reconstructs missing deliveries and enqueues them" do
    assert_difference "WebNotificationDelivery.count", 1 do
      assert_enqueued_jobs 1, only: WebNotificationDeliveryJob do
        WebNotificationSweepJob.perform_now
      end
    end
    assert_equal "pending", @notification.web_notification_deliveries.sole.status
  end

  test "missed Redis enqueue remains recoverable on the next periodic sweep" do
    WebNotificationDeliveryJob.expects(:perform_later).raises(ActiveJob::EnqueueError).once
    WebNotificationSweepJob.perform_now(user_id: @user.id)
    delivery = @notification.web_notification_deliveries.sole
    assert_equal "pending", delivery.status
    assert_nil delivery.accepted_at

    WebNotificationDeliveryJob.expects(:perform_later).with(delivery.id).once
    assert_no_difference "WebNotificationDelivery.count" do
      WebNotificationSweepJob.perform_now(user_id: @user.id)
    end
  end

  test "inactive users are not scanned but outstanding rows are recovered to suppress dispatch" do
    WebNotificationDelivery.prepare_for!(@user)
    delivery = @notification.web_notification_deliveries.sole
    @user.update_columns(active: false)
    WebNotification::Transactions.any_instance.expects(:call).never
    WebNotification::EventCollector.any_instance.expects(:call).never
    assert_enqueued_with(job: WebNotificationDeliveryJob, args: [ delivery.id ]) do
      WebNotificationSweepJob.perform_now(user_id: @user.id)
    end
    with_web_push_config { delivery.deliver! }
    assert_equal "suppressed", delivery.reload.status
  end

  test "generator failure does not prevent committed delivery recovery" do
    WebNotification::Transactions.any_instance.stubs(:call).raises(StandardError, "private source response")
    assert_enqueued_jobs 1, only: WebNotificationDeliveryJob do
      WebNotificationSweepJob.perform_now(user_id: @user.id)
    end
    assert_equal "pending", @notification.web_notification_deliveries.sole.status
  end
end
