# frozen_string_literal: true

class Api::V1::TransactionTransferMatchesController < Api::V1::BaseController
  include Api::V1::MoneyHelper

  before_action :ensure_read_scope, only: :transfer_match_candidates
  before_action :ensure_write_scope, only: :create
  before_action :set_entry

  # Candidate entries this transaction could be matched against, ordered by
  # date proximity. Powers the "match an existing transaction" picker.
  def transfer_match_candidates
    candidates = @entry.amount.negative? ?
      family_matches_scope(inflow_transaction_id: @entry.transaction.id) :
      family_matches_scope(outflow_transaction_id: @entry.transaction.id)

    render json: {
      candidates: candidates.filter_map { |match|
        json = candidate_json(match)
        json unless json.empty?
      }
    }
  end

  def create
    method = transfer_match_params[:method]

    if method == "existing"
      matched = Current.accessible_entries.find_by(id: transfer_match_params[:matched_entry_id])
      return render_validation_error("Matched transaction not found") if matched.nil?
      return render_validation_error("Write access required for matched transaction's account") unless writable_entry?(matched)
    elsif method == "new"
      target_account_id = transfer_match_params[:target_account_id].presence
      return render_validation_error("target_account_id is required") if target_account_id.nil?
      unless valid_uuid?(target_account_id)
        return render_validation_error("target_account_id must be a valid UUID")
      end

      account = family.accounts.find_by(id: target_account_id)
      return render_validation_error("Target account not found") if account.nil?

      unless Account.writable_by(current_resource_owner).exists?(account.id)
        return render_validation_error("Write access required for target account")
      end
    else
      return render_validation_error("method must be \"existing\" or \"new\"")
    end

    result = nil
    transfer = Entry.transaction do
      result = Transfer::Matcher.match(
        transaction: @entry.transaction,
        method: method,
        matched_entry_id: transfer_match_params[:matched_entry_id],
        target_account_id: transfer_match_params[:target_account_id],
        accessible_accounts: family.accounts,
        accessible_entries: Current.accessible_entries
      )
      raise ActiveRecord::Rollback if result.error.present?
      result.transfer
    end

    return render_validation_error(result.error) if result.error.present?

    transfer.sync_account_later
    transfer.reload
    @transfer = transfer
    render "api/v1/transfers/show"
  rescue => e
    Rails.logger.error "TransactionTransferMatchesController#create error: #{e.message}"
    Rails.logger.error e.backtrace.join("\n")

    render json: {
      error: "internal_server_error",
      message: "An unexpected error occurred"
    }, status: :internal_server_error
  end

  private
    def set_entry
      transaction_id = params[:transaction_id] || params[:id]
      raise ActiveRecord::RecordNotFound unless valid_uuid?(transaction_id)

      transaction = family.transactions
        .joins(entry: :account)
        .merge(Account.accessible_by(current_resource_owner))
        .find(transaction_id)
      @entry = transaction.entry
      raise ActiveRecord::RecordNotFound if @entry.nil?
    rescue ActiveRecord::RecordNotFound
      render json: { error: "not_found", message: "Transaction not found" }, status: :not_found
    end

    def writable_entry?(entry)
      Account.writable_by(current_resource_owner).exists?(entry.account_id)
    end

    def transfer_match_params
      params.require(:transfer_match).permit(:method, :matched_entry_id, :target_account_id)
    end

    def family_matches_scope(**filters)
      current_resource_owner.family.transfer_match_candidates(date_window: 30, **filters)
    end

    def candidate_json(match)
      inflow_entry = Entry.find_by(entryable_id: match.inflow_transaction_id, entryable_type: "Transaction")
      outflow_entry = Entry.find_by(entryable_id: match.outflow_transaction_id, entryable_type: "Transaction")
      return {} if inflow_entry.nil? || outflow_entry.nil?

      {
        inflow_transaction_id: match.inflow_transaction_id,
        outflow_transaction_id: match.outflow_transaction_id,
        date_diff: match.date_diff,
        inflow_transaction: side_json(inflow_entry),
        outflow_transaction: side_json(outflow_entry)
      }
    end

    def side_json(entry)
      account = entry.account
      {
        id: entry.transaction.id,
        name: entry.name,
        date: entry.date.iso8601,
        amount: entry.amount_money.abs.format,
        signed_amount_cents: (entry.amount.negative? ? -1 : 1) * money_to_minor_units(entry.amount_money.abs),
        currency: entry.currency,
        account: {
          id: account.id,
          name: account.name
        }
      }
    end

    def family
      current_resource_owner.family
    end
end
