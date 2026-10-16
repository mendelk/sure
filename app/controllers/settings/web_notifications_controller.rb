class Settings::WebNotificationsController < ApplicationController
  layout "settings"
  before_action :require_preview_features!
  before_action :load_settings

  def show
  end

  def update
    @preferences.update!(preference_params.to_h)
    WebNotificationSweepJob.perform_later(user_id: Current.user.id) if @preferences.enabled?
    redirect_to settings_web_notifications_path(updated: "1"), status: :see_other
  rescue ActiveModel::ValidationError
    render :show, status: :unprocessable_entity
  end

  private
    def load_settings
      @preferences = WebNotification::Preferences.new(Current.user)
      @browser_preferences = WebNotification::Preferences.new(Current.user)
      @accounts = Current.user.accessible_accounts.where(status: "active").order(:name)
      @currencies = (@accounts.reorder(nil).distinct.pluck(:currency) + [ Current.family.currency ] + @preferences.minimum_amounts.keys).compact.uniq.sort
      @subscriptions = WebPushSubscription.where(user: Current.user).order(created_at: :desc)
    end

    def preference_params
      preferences = params.require(:web_notifications)
      raise ActionController::ParameterMissing, :web_notifications unless preferences.is_a?(ActionController::Parameters)

      preferences.permit(:enabled, :include_pending, :frequency,
        :digest_at, :quiet_start, :quiet_end, :show_details, :bill_days_before,
        :budget_threshold_pct, event_types: [], account_ids: [], minimum_amounts: {})
    end
end
