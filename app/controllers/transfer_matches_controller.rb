class TransferMatchesController < ApplicationController
  before_action :set_entry

  def new
    @accounts = Current.family.accounts.writable_by(Current.user).visible.alphabetically.where.not(id: @entry.account_id)
    @transfer_match_candidates = @entry.transaction.transfer_match_candidates
  end

  def create
    return unless require_account_permission!(@entry.account, redirect_path: transactions_path)

    result = Transfer::Matcher.match(
      transaction: @entry.transaction,
      method: transfer_match_params[:method],
      matched_entry_id: transfer_match_params[:matched_entry_id],
      target_account_id: transfer_match_params[:target_account_id],
      accessible_accounts: accessible_accounts,
      accessible_entries: Current.accessible_entries
    )

    unless result.error.nil?
      redirect_back_or_to transactions_path, alert: result.error
      return
    end

    @transfer = result.transfer
    @transfer.sync_account_later

    redirect_back_or_to transactions_path, notice: t(".success")
  end

  private
    def set_entry
      @entry = Current.accessible_entries.find(params[:transaction_id])
    end

    def transfer_match_params
      params.require(:transfer_match).permit(:method, :matched_entry_id, :target_account_id)
    end
end
