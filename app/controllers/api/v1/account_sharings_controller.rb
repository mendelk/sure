class Api::V1::AccountSharingsController < Api::V1::BaseController
  before_action :authorize_read_scope, only: :show
  before_action :authorize_write_scope, only: :update
  before_action :set_account

  def show
    render json: Account::SpaIndexData.new(
      item_specs: [], groups: [], family: Current.family, user: Current.user, account: @account
    ).sharing_payload
  end

  def update
    sharing = Account::Sharing.new(@account, user: Current.user)
    if !@account.owned_by?(Current.user) && params[:update_finance_inclusion].present?
      sharing.update_finance_inclusion!(params.require(:include_in_finances))
    elsif @account.owned_by?(Current.user)
      members = params.require(:sharing).permit(members: [ :user_id, :shared, :permission ])[:members]
      sharing.update_members!(members.is_a?(Array) ? members : members&.values || [])
    else
      return render json: { error: "forbidden", message: "Only the account owner can change sharing" }, status: :forbidden
    end
    head :no_content
  rescue ActiveRecord::RecordInvalid => e
    render_validation_error(e.record.errors.full_messages.join(", "))
  end

  private
    def authorize_read_scope
      authorize_scope!(:read)
    end

    def authorize_write_scope
      authorize_scope!(:write)
    end

    def set_account
      raise ActiveRecord::RecordNotFound unless valid_uuid?(params[:account_id])
      @account = Current.family.accounts.accessible_by(Current.user).find(params[:account_id])
    end
end
