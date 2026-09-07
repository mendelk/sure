class Merchant::DropdownsController < ApplicationController
  before_action :set_from_params

  def show
    @merchants = merchants_scope.to_a.excluding(@selected_merchant).prepend(@selected_merchant).compact
  end

  private
    def set_from_params
      if params[:transaction_id]
        @transaction = Current.family.transactions.find(params[:transaction_id])
        @entry = @transaction.entry
      end

      @selected_merchant = @transaction&.merchant
    end

    def merchants_scope
      Current.family.available_merchants_for(Current.user).alphabetically
    end
end
