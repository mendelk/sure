# frozen_string_literal: true

class Api::V1::TransfersController < Api::V1::BaseController
  include Pagy::Backend
  include Api::V1::TransferDecisionFiltering

  before_action :ensure_read_scope
  before_action :ensure_write_scope, only: %i[update destroy mark_as_recurring]
  before_action :set_transfer, only: %i[show update destroy mark_as_recurring]

  def index
    transfers_query = apply_transfer_decision_filters(transfers_scope, status_model: Transfer).order(created_at: :desc)
    @per_page = safe_per_page_param

    @pagy, @transfers = pagy(
      transfers_query,
      page: safe_page_param,
      limit: @per_page
    )

    render :index
  rescue Api::V1::TransferDecisionFiltering::InvalidFilterError => e
    render_validation_error(e.message)
  end

  def show
    render :show
  end

  def update
    outflow_account = @transfer.outflow_transaction.entry.account
    unless outflow_account.permission_for(current_resource_owner).in?(%i[owner full_control])
      render json: { error: "forbidden", message: "You do not have permission to modify this transfer" }, status: :forbidden
      return
    end

    status = transfer_params[:status]

    if status.present?
      if status == "confirmed"
        @transfer.confirm!
        @transfer.sync_account_later
      elsif status == "rejected"
        @transfer.reject!
        render json: { message: "Transfer rejected" }, status: :ok
        return
      else
        render_validation_error("status must be confirmed or rejected")
        return
      end
    end

    if transfer_params.key?(:notes)
      @transfer.update!(notes: transfer_params[:notes])
    end

    if transfer_params.key?(:tag_ids)
      resolved_tag_ids = current_resource_owner.family.tags.where(id: Array(transfer_params[:tag_ids]).reject(&:blank?)).pluck(:id)
      Transfer.transaction do
        [ @transfer.outflow_transaction, @transfer.inflow_transaction ].compact.each do |transaction|
          transaction.tag_ids = resolved_tag_ids
          transaction.lock_attr!(:tag_ids)
        end
      end
    end

    if transfer_params.key?(:category_id) && @transfer.categorizable?
      category = current_resource_owner.family.categories.find_by(id: transfer_params[:category_id]) if transfer_params[:category_id].present?
      @transfer.outflow_transaction.update!(category: category)
    end

    @transfer.reload
    render :show
  rescue => e
    Rails.logger.error "TransfersController#update error: #{e.message}"
    Rails.logger.error e.backtrace.join("\n")

    render json: {
      error: "internal_server_error",
      message: "An unexpected error occurred"
    }, status: :internal_server_error
  end

  def destroy
    outflow_account = @transfer.outflow_transaction.entry.account
    unless outflow_account.permission_for(current_resource_owner).in?(%i[owner full_control])
      render json: { error: "forbidden", message: "You do not have permission to modify this transfer" }, status: :forbidden
      return
    end

    @transfer.destroy!
    head :no_content
  rescue => e
    Rails.logger.error "TransfersController#destroy error: #{e.message}"
    render json: {
      error: "internal_server_error",
      message: "An unexpected error occurred"
    }, status: :internal_server_error
  end

  def mark_as_recurring
    outflow_account = @transfer.outflow_transaction.entry.account
    inflow_account = @transfer.inflow_transaction.entry.account
    unless outflow_account.permission_for(current_resource_owner).in?(%i[owner full_control]) &&
           inflow_account.permission_for(current_resource_owner).in?(%i[owner full_control])
      render json: { error: "forbidden", message: "You do not have permission to modify this transfer" }, status: :forbidden
      return
    end

    if current_resource_owner.family.recurring_transactions_disabled?
      render json: { error: "validation_failed", message: "Recurring transactions feature is disabled" }, status: :unprocessable_entity
      return
    end

    existing = current_resource_owner.family.recurring_transactions.find_by(
      account_id: outflow_account.id,
      destination_account_id: inflow_account.id,
      amount: @transfer.outflow_transaction.entry.amount,
      currency: @transfer.outflow_transaction.entry.currency
    )

    if existing
      render json: { error: "conflict", message: "A recurring transfer already exists for this pattern" }, status: :conflict
      return
    end

    recurring = RecurringTransaction.create_from_transfer(@transfer)
    render json: { message: "Transfer marked as recurring", recurring_transaction_id: recurring.id }, status: :created
  rescue => e
    Rails.logger.error "TransfersController#mark_as_recurring error: #{e.message}"
    render json: {
      error: "internal_server_error",
      message: "An unexpected error occurred"
    }, status: :internal_server_error
  end

  private

    def set_transfer
      raise ActiveRecord::RecordNotFound unless valid_uuid?(params[:id])

      @transfer = transfers_scope.find(params[:id])
    end

    def transfer_params
      params.require(:transfer).permit(:status, :notes, :category_id, tag_ids: [])
    end

    def transfers_scope
      transfer_decision_scope(Transfer)
    end
end
