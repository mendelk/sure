class WebNotificationsController < ApplicationController
  before_action :require_preview_features!

  def index
    @filter = params[:filter].presence_in(%w[all unread read]) || "all"
    notifications = WebNotification.visible_to(Current.user)
    @unread_count = notifications.where(read_at: nil).count
    notifications = notifications.where(read_at: nil) if @filter == "unread"
    notifications = notifications.where.not(read_at: nil) if @filter == "read"
    @pagy, @notifications = pagy(notifications.includes(:account, :web_notification_deliveries).order(created_at: :desc, id: :desc), limit: 25)
  end

  def update
    notification = WebNotification.visible_to(Current.user).find(params[:id])
    raise ActiveRecord::RecordNotFound unless notification.authorized?

    attributes = params.require(:web_notification)
    raise ActionController::ParameterMissing, :web_notification unless attributes.is_a?(ActionController::Parameters)

    if attributes.permit(:read).require(:read) == "0"
      notification.update!(read_at: nil)
    else
      notification.mark_read!
    end
    redirect_to web_notifications_path(filter: inbox_filter), status: :see_other
  end

  def mark_all_read
    WebNotification.visible_to(Current.user).where(read_at: nil).find_each do |notification|
      notification.mark_read! if notification.authorized?
    end
    redirect_to web_notifications_path(filter: inbox_filter), status: :see_other
  end

  private
    def inbox_filter
      params[:filter].presence_in(%w[all unread read]) || "all"
    end
end
