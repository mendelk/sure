require "test_helper"

class WebNotificationsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @other = users(:family_member)
    [ @user, @other ].each do |user|
      user.update!(preferences: user.preferences.to_h.merge("preview_features_enabled" => true))
      WebNotification::Preferences.new(user).update!(enabled: true)
    end
    @account = accounts(:depository)
    @notification = notification_for(@user, "own")
    @foreign = notification_for(@other, "foreign")
    sign_in @user
    ensure_tailwind_build
  end

  test "inbox requires a session" do
    reset!
    get web_notifications_path
    assert_redirected_to new_session_path
  end

  test "inbox requires the user's preview opt in" do
    @user.update!(preferences: @user.preferences.merge("preview_features_enabled" => false))
    get web_notifications_path
    assert_redirected_to root_path
  end

  test "lists only the user's accessible notifications with unread filtering" do
    @notification.mark_read!
    unread = notification_for(@user, "unread")
    get web_notifications_path(filter: "unread")
    assert_response :success
    assert_select "form[action=?]", web_notification_path(unread, filter: "unread")
    assert_select "form[action=?]", web_notification_path(@notification, filter: "unread"), count: 0
    assert_select "form[action=?]", web_notification_path(@foreign, filter: "unread"), count: 0
  end

  test "can mark a notification read and unread" do
    patch web_notification_path(@notification), params: { web_notification: { read: "1" } }
    assert_redirected_to web_notifications_path(filter: "all")
    assert @notification.reload.read_at

    patch web_notification_path(@notification), params: { web_notification: { read: "0" } }
    assert_nil @notification.reload.read_at
  end

  test "cannot mark another household user's notification read" do
    patch web_notification_path(@foreign), params: { web_notification: { read: "1" } }
    assert_response :not_found
    assert_nil @foreign.reload.read_at
  end

  test "cannot access a notification after account access is removed" do
    @account.update!(owner: @other)
    @account.unshare_with!(@user)
    patch web_notification_path(@notification), params: { web_notification: { read: "1" } }
    assert_response :not_found
    assert_nil @notification.reload.read_at
  end

  test "mark all read never changes another user's rows" do
    post mark_all_read_web_notifications_path
    assert_redirected_to web_notifications_path(filter: "all")
    assert @notification.reload.read_at
    assert_nil @foreign.reload.read_at
  end

  test "mark read and mark all read retain CSRF protection" do
    original = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    patch web_notification_path(@notification), params: { web_notification: { read: "1" } }, as: :json
    assert_response :unprocessable_entity
    post mark_all_read_web_notifications_path, as: :json
    assert_response :unprocessable_entity
    assert_nil @notification.reload.read_at
  ensure
    ActionController::Base.allow_forgery_protection = original
  end

  private
    def notification_for(user, key)
      WebNotification.create!(user: user, account: @account, event_type: "transactions_added",
        dedup_key: key, data: { "entry_ids" => [], "count" => 1 }, push_after: Time.current)
    end
end
