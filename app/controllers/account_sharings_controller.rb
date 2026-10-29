class AccountSharingsController < ApplicationController
  before_action :set_account

  def show
    return render("spa/show", layout: "spa") if request.format.html?

    render json: Account::SpaIndexData.new(
      item_specs: [], groups: [], family: Current.family, user: Current.user, account: @account
    ).sharing_payload.to_json
  end

  def update
    # Non-owners can update their own include_in_finances preference
    if !@account.owned_by?(Current.user) && params[:update_finance_inclusion].present?
      Account::Sharing.new(@account, user: Current.user).update_finance_inclusion!(params.permit(:include_in_finances)[:include_in_finances])
      respond_to do |format|
        format.json { head :no_content }
        format.html do
          redirect_back_or_to account_path(@account),
            notice: t("account_sharings.update.finance_toggle_success"), status: :see_other
        end
      end
      return
    end

    unless @account.owned_by?(Current.user)
      respond_to do |format|
        format.json { render json: { error: t("account_sharings.update.not_owner") }, status: :forbidden }
        format.html do
          redirect_to account_path(@account), alert: t("account_sharings.update.not_owner"), status: :see_other
        end
      end
      return
    end

    Account::Sharing.new(@account, user: Current.user).update_members!(sharing_members_params)

    respond_to do |format|
      format.json { head :no_content }
      format.html do
        redirect_back_or_to accounts_path, notice: t("account_sharings.update.success"), status: :see_other
      end
    end
  end

  private

    def set_account
      @account = Current.user.accessible_accounts.find(params[:account_id])
    end

    def sharing_members_params
      return [] unless params.dig(:sharing, :members)

      params.require(:sharing).permit(
        members: [ :user_id, :shared, :permission ]
      )[:members]&.values || []
    end
end
