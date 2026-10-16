class WebPushSubscriptionsController < ApplicationController
  before_action :require_preview_features!
  before_action :require_notifications_enabled!, only: %i[create test]
  before_action :require_push_configuration!, only: %i[create test]

  def create
    subscription = subscription_params
    browser = WebPushSubscription.register_for!(
      user: Current.user,
      session: Current.session,
      endpoint: subscription[:endpoint],
      p256dh: subscription.dig(:keys, :p256dh),
      auth: subscription.dig(:keys, :auth),
      label: subscription[:label].to_s.truncate(80),
      user_agent: request.user_agent.to_s.truncate(500)
    )
    render json: { id: browser.id, status: browser.last_status }, status: :created
  rescue ActiveRecord::RecordInvalid, ArgumentError, ActionController::ParameterMissing
    render json: { error: t("web_notifications.errors.invalid_subscription") }, status: :unprocessable_entity
  end

  def destroy
    WebPushSubscription.where(user: Current.user).find(params[:id]).destroy!
    respond_to do |format|
      format.json { head :no_content }
      format.html { redirect_to settings_web_notifications_path(revoked: "1"), status: :see_other }
    end
  end

  def test
    unless params[:confirmed].in?([ true, "1" ])
      return render json: { error: t("web_notifications.errors.test_confirmation") }, status: :unprocessable_entity
    end

    browser = WebPushSubscription.where(user: Current.user, disabled_at: nil).find(params[:id])
    unless current_browser?(browser)
      return render json: { error: t("web_notifications.errors.current_browser_required") }, status: :unprocessable_entity
    end
    notification = nil
    limited = false
    Current.user.with_lock do
      now = Time.current
      limited = Current.user.preferences.to_h.fetch("web_notification_test_requested_at", 0).to_i > (now - 1.minute).to_i
      unless limited
        notification = WebNotification.publish!(user: Current.user, event_type: "test",
          dedup_key: "test:#{SecureRandom.uuid}", subscription: browser)
        if notification
          Current.user.update!(preferences: Current.user.preferences.to_h.merge("web_notification_test_requested_at" => now.to_i))
        end
      end
    end
    if limited
      response.set_header("Retry-After", "60")
      render json: { error: t("web_notifications.errors.test_rate_limit") }, status: :too_many_requests
    elsif notification
      WebNotificationSweepJob.perform_later(user_id: Current.user.id)
      render json: { message: t("web_notifications.browser.test_queued") }, status: :accepted
    else
      render json: { error: t("web_notifications.errors.disabled") }, status: :unprocessable_entity
    end
  end

  private
    def subscription_params
      subscription = params.require(:subscription)
      raise ActionController::ParameterMissing, :subscription unless subscription.is_a?(ActionController::Parameters)
      raise ActionController::ParameterMissing, :keys unless subscription[:keys].is_a?(ActionController::Parameters)

      subscription.permit(:endpoint, :label, keys: %i[p256dh auth])
    end

    def current_browser?(browser)
      subscription = subscription_params
      ActiveSupport::SecurityUtils.secure_compare(browser.endpoint, subscription[:endpoint].to_s) &&
        ActiveSupport::SecurityUtils.secure_compare(browser.p256dh, subscription.dig(:keys, :p256dh).to_s) &&
        ActiveSupport::SecurityUtils.secure_compare(browser.auth, subscription.dig(:keys, :auth).to_s)
    rescue ActionController::ParameterMissing
      false
    end

    def require_notifications_enabled!
      return if WebNotification::Preferences.new(Current.user).enabled?

      render json: { error: t("web_notifications.errors.disabled") }, status: :unprocessable_entity
    end

    def require_push_configuration!
      return if WebPushSubscription.configured?

      render json: { error: t("web_notifications.errors.unconfigured") }, status: :service_unavailable
    end
end
