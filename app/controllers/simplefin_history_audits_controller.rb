class SimplefinHistoryAuditsController < ApplicationController
  before_action :set_account

  def show
    return render("spa/show", layout: "spa") if request.format.html?

    render json: {
      account: @account.slice(:id, :name, :currency),
      default_period_days: Account::SimplefinHistoryAudit::MAX_PERIOD_DAYS,
      max_period_days: Account::SimplefinHistoryAudit::MAX_PERIOD_DAYS,
      text: I18n.t("accounts.simplefin_history_audit")
    }
  end

  private
    def set_account
      unless Current.user.admin?
        render json: { error: "forbidden", message: I18n.t("shared.require_admin") }, status: :forbidden
        return
      end
      @account = accessible_accounts.find(params[:account_id])
      unless Current.family.accounts.writable_by(Current.user).exists?(id: @account.id)
        render json: { error: "forbidden", message: I18n.t("accounts.not_authorized") }, status: :forbidden
      end
    end
end
