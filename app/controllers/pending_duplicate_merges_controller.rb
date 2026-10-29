class PendingDuplicateMergesController < ApplicationController
  before_action :set_transaction

  def new
    @limit = 10
    # Ensure offset is non-negative to prevent abuse
    @offset = [ (params[:offset] || 0).to_i, 0 ].max

    # Fetch one extra to determine if there are more results
    candidates = @transaction.pending_duplicate_candidates(limit: @limit + 1, offset: @offset).to_a
    @has_more = candidates.size > @limit
    @potential_duplicates = candidates.first(@limit)

    # Calculate range for display (e.g., "1-10", "11-20")
    @range_start = @offset + 1
    @range_end = @offset + @potential_duplicates.count
  end

  def create
    return unless require_account_permission!(@transaction.entry.account, :annotate, redirect_path: transactions_path)

    # Manually merge the pending transaction with the selected posted transaction
    unless merge_params[:posted_entry_id].present?
      redirect_back_or_to transactions_path, alert: t(".no_posted_selected")
      return
    end

    if @transaction.merge_with_posted_entry!(merge_params[:posted_entry_id])
      redirect_back_or_to transactions_path, notice: t(".merge_success")
    else
      redirect_back_or_to transactions_path, alert: t(".merge_failed")
    end
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotDestroyed,
         ActiveRecord::Deadlocked, ActiveRecord::LockWaitTimeout => e
    Rails.logger.error("Failed to manually merge pending transaction: #{e.message}")
    redirect_back_or_to transactions_path, alert: t("transactions.merge_duplicate.failure")
  end

  private
    def set_transaction
      entry = Current.accessible_entries.find(params[:transaction_id])
      @transaction = entry.entryable

      unless @transaction.is_a?(Transaction) && @transaction.pending?
        redirect_to transactions_path, alert: t("pending_duplicate_merges.set_transaction.pending_only")
      end
    end


    def merge_params
      params.require(:pending_duplicate_merges).permit(:posted_entry_id)
    end
end
