# frozen_string_literal: true

class Api::V1::TransactionDuplicatesController < Api::V1::BaseController
  before_action -> { authorize_scope!(action_name == "index" ? :read : :write) }
  before_action :set_transaction

  def index
    offset = [ params[:offset].to_i, 0 ].max
    candidates = @transaction.pending_duplicate_candidates(limit: 11, offset: offset).to_a
    render json: {
      candidates: candidates.first(10).map { |entry| { entry_id: entry.id, transaction_id: entry.entryable_id, name: entry.name, date: entry.date.iso8601, amount: entry.amount_money.format, currency: entry.currency } },
      offset: offset, has_more: candidates.size > 10
    }
  end

  def create
    id = params.require(:duplicate_merge).permit(:posted_entry_id)[:posted_entry_id]
    return render_validation_error("Select an eligible posted transaction") unless valid_uuid?(id)

    if @transaction.merge_with_posted_entry!(id)
      render json: { message: "Duplicate transactions merged" }
    else
      render_validation_error("Select an eligible posted transaction in the same account and currency")
    end
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotDestroyed, ActiveRecord::Deadlocked, ActiveRecord::LockWaitTimeout => error
    render_validation_error(error.message)
  end

  private
    def set_transaction
      raise ActiveRecord::RecordNotFound unless valid_uuid?(params[:transaction_id])
      @transaction = current_resource_owner.family.transactions.joins(entry: :account)
        .merge(Account.accessible_by(current_resource_owner)).find(params[:transaction_id])
      unless account_permissions(@transaction.entry.account)[:can_annotate]
        return render json: { error: "forbidden", message: "Not authorized to merge this transaction" }, status: :forbidden
      end
      render_validation_error("Only pending transactions can be merged") unless @transaction.pending?
    end
end
