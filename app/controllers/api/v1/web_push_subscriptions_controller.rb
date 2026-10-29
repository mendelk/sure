class Api::V1::WebPushSubscriptionsController < Api::V1::BaseController
  before_action :ensure_write_scope
  before_action :require_browser_session!
  before_action :require_web_push_enabled!

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
    render_json({ id: browser.id, status: browser.last_status }, status: :created)
  rescue ActiveRecord::RecordInvalid, ArgumentError, ActionController::ParameterMissing
    render_json({ error: "invalid_subscription", message: t("web_notifications.errors.invalid_subscription") }, status: :unprocessable_entity)
  end

  private
    def require_browser_session!
      return if @authentication_method == :session && Current.session&.persisted?

      render_json({ error: "browser_session_required", message: "This operation requires an authenticated browser session" }, status: :forbidden)
    end

    def require_web_push_enabled!
      unless Current.user.preview_features_enabled?
        return render_json({ error: "feature_disabled", message: I18n.t("preview.not_enabled") }, status: :forbidden)
      end
      unless WebNotification::Preferences.new(Current.user).enabled?
        return render_json({ error: "notifications_disabled", message: t("web_notifications.errors.disabled") }, status: :unprocessable_entity)
      end
      unless WebPushSubscription.configured?
        render_json({ error: "push_unconfigured", message: t("web_notifications.errors.unconfigured") }, status: :service_unavailable)
      end
    end

    def subscription_params
      subscription = params.require(:subscription)
      raise ActionController::ParameterMissing, :subscription unless subscription.is_a?(ActionController::Parameters)
      raise ActionController::ParameterMissing, :keys unless subscription[:keys].is_a?(ActionController::Parameters)

      subscription.permit(:endpoint, :label, keys: %i[p256dh auth])
    end
end
