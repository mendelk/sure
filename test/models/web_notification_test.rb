require "test_helper"
require_relative "../support/web_notification_test_helper"

class WebNotificationTest < ActiveSupport::TestCase
  include WebNotificationTestHelper

  setup do
    @user = enable_web_notifications
  end

  test "publication deduplicates without replacing semantic data or read state" do
    notification = publish_web_transaction(@user)
    notification.mark_read!
    repeated = publish_web_transaction(@user)
    assert_equal notification.id, repeated.id
    assert_equal notification.data, repeated.data
    assert_equal notification.read_at, repeated.read_at
    assert_equal 1, WebNotification.where(user: @user, dedup_key: "transaction").count
  end

  test "disabled and inaccessible account events are not published" do
    assert_nil publish_web_transaction(users(:family_member))
    member = enable_web_notifications(users(:family_member))
    accounts(:depository).account_shares.where(user: member).delete_all
    assert_nil publish_web_transaction(member)
    assert_nil WebNotification.publish!(user: @user, event_type: "transactions_added", dedup_key: "foreign",
      account: Account.new(id: SecureRandom.uuid, family: families(:empty), status: "active"),
      data: { entry_ids: [ SecureRandom.uuid ], count: 1 })
  end

  test "cached notification recipient cannot bypass later user deactivation or preview opt out" do
    notification = publish_web_transaction(@user)
    assert notification.authorized?
    User.where(id: @user.id).update_all(active: false)
    assert_not notification.authorized?
    assert_empty WebNotification.visible_to(@user.reload)
    User.where(id: @user.id).update_all(active: true, preferences: @user.preferences.merge("preview_features_enabled" => false))
    assert_not notification.authorized?
    assert_empty WebNotification.visible_to(@user.reload)
  end

  test "revoked sharing removes inbox access and strips detailed rendering" do
    member = enable_web_notifications(users(:family_member), show_details: true)
    account = accounts(:depository)
    account.account_shares.find_or_create_by!(user: member) { |share| share.permission = "read_only" }
    notification = publish_web_transaction(member)
    assert_includes WebNotification.visible_to(member), notification
    assert notification.authorized?
    account.account_shares.where(user: member).delete_all
    assert_not notification.authorized?
    assert_not_includes WebNotification.visible_to(member), notification
    assert_equal I18n.t("web_notifications.generic_body"), notification.body
    assert_equal Rails.application.routes.url_helpers.web_notifications_path, notification.destination_path
  end

  test "household budget evidence is hidden when contributing account access or finance inclusion is lost" do
    member = enable_web_notifications(users(:family_member))
    account = accounts(:depository)
    share = account.account_shares.find_or_create_by!(user: member) { |row| row.permission = "read_only" }
    share.update!(include_in_finances: true)
    budget = budgets(:one)
    notification = WebNotification.publish!(user: member, event_type: "budget_threshold", dedup_key: "budget",
      data: { budget_id: budget.id, budget_category_id: SecureRandom.uuid, threshold_pct: 100, account_ids: [ account.id ] })
    assert notification
    assert_includes WebNotification.visible_to(member), notification
    share.update!(include_in_finances: false)
    assert_not notification.authorized?
    assert_not_includes WebNotification.visible_to(member), notification
  end

  test "private budgets are never visible to another family member" do
    budget = budgets(:one)
    budget.update!(user: users(:family_member))
    assert_nil WebNotification.publish!(user: @user, event_type: "budget_threshold", dedup_key: "private-budget",
      data: { budget_id: budget.id, budget_category_id: SecureRandom.uuid, threshold_pct: 100, account_ids: [] })
  end

  test "bill notification loses authorization when destination account becomes private" do
    member = enable_web_notifications(users(:family_member))
    source = accounts(:depository)
    destination = accounts(:credit_card)
    [ source, destination ].each do |account|
      account.account_shares.find_or_create_by!(user: member) { |share| share.permission = "read_only" }
    end
    series = recurring_transactions(:netflix_subscription)
    series.update_columns(destination_account_id: destination.id)
    occurrence = RecurringOccurrence.create!(family: member.family, recurring_transaction: series,
      original_due_on: Date.current + 1, due_on: Date.current + 1, currency: "USD")
    notification = WebNotification.publish!(user: member, account: source, event_type: "payment_due", dedup_key: "bill",
      data: { occurrence_id: occurrence.id, series_id: series.id })
    assert notification
    destination.account_shares.where(user: member).delete_all
    assert_not notification.authorized?
    assert_not_includes WebNotification.visible_to(member), notification
  end

  test "generic push is default and detailed push uses trusted semantic path only" do
    notification = publish_web_transaction(@user)
    payload = notification.push_payload
    assert_equal I18n.t("web_notifications.generic_body"), payload[:body]
    assert_equal Rails.application.routes.url_helpers.account_path(accounts(:depository)), payload[:path]
    assert_equal "web-notification-#{notification.id}", payload[:tag]
    WebNotification::Preferences.new(@user).update!(show_details: true)
    assert_equal notification.body, notification.push_payload[:body]
    assert_raises(ActiveRecord::RecordInvalid) do
      WebNotification.publish!(user: @user, event_type: "transactions_added", account: accounts(:depository),
        dedup_key: "injected-path", data: { entry_ids: [], count: 1, path: "https://evil.example" })
    end
  end

  test "event text uses recipient locale before household locale" do
    @user.update!(locale: "es")
    notification = publish_web_transaction(@user)
    I18n.expects(:t).with("web_notifications.events.transactions_added.title", locale: "es",
      account_name: accounts(:depository).name, count: 1, threshold_pct: 0).returns("Movimientos")
    assert_equal "Movimientos", notification.title
  end

  test "test notification is immediate and tied to exactly one browser" do
    WebNotification::Preferences.new(@user).update!(frequency: "daily_digest", quiet_start: "00:00", quiet_end: "23:59")
    browser = register_web_browser(@user)
    notification = WebNotification.publish!(user: @user, event_type: "test", dedup_key: "test", subscription: browser)
    assert_equal browser.id, notification.target_subscription_id
    assert_in_delta Time.current.to_f, notification.push_after.to_f, 1
    assert_nil WebNotification.publish!(user: @user, event_type: "test", dedup_key: "untargeted")
  end
end
