class Api::V1::SimplefinHistoryAuditsController < Api::V1::BaseController
  before_action -> { authorize_scope!(:write) }

  def create
    account = Current.family.accounts.accessible_by(Current.user).find(params[:account_id])
    if params.key?(:start_date) || params.key?(:end_date)
      raise Account::SimplefinHistoryAudit::Error, "Use period_days instead of start_date or end_date"
    end
    render json: Account::SimplefinHistoryAudit.new(account: account, user: Current.user).call(
      period_days: params[:period_days], cursor: params[:cursor])
  rescue Account::SimplefinHistoryAudit::Error => error
    render json: { error: error.code, message: error.message }, status: error.status
  end

  def import
    account = Current.family.accounts.accessible_by(Current.user).find(params[:account_id])
    decisions = params[:decisions]
    if decisions.is_a?(Array)
      decisions = decisions.map do |decision|
        decision.is_a?(ActionController::Parameters) ? decision.permit(:token, :entry_id).to_h : decision
      end
    end
    render json: Account::SimplefinHistoryAudit.new(account: account, user: Current.user).import!(decisions: decisions)
  rescue Account::SimplefinHistoryAudit::Error => error
    render json: { error: error.code, message: error.message }, status: error.status
  end
end
