class Api::V1::SimplefinHistoryAuditsController < Api::V1::BaseController
  before_action -> { authorize_scope!(:write) }

  def create
    account = Current.family.accounts.accessible_by(Current.user).find(params[:account_id])
    render json: Account::SimplefinHistoryAudit.new(account: account, user: Current.user).call(
      start_date: params[:start_date], end_date: params[:end_date], cursor: params[:cursor])
  rescue Account::SimplefinHistoryAudit::Error => error
    render json: { error: error.code, message: error.message }, status: error.status
  end
end
