# frozen_string_literal: true

class Api::V1::TransfersController < Api::V1::BaseController
  include Pagy::Backend
  include Api::V1::TransferDecisionFiltering

  before_action :ensure_read_scope
  before_action :ensure_write_scope, only: :update
  before_action :set_transfer, only: %i[show update]

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

    if status == "confirmed"
      @transfer.confirm!
      @transfer.sync_account_later
      @transfer.reload
      render :show
    elsif status == "rejected"
      @transfer.reject!
      render json: { message: "Transfer rejected" }, status: :ok
    else
      render_validation_error("status must be confirmed or rejected")
    end
  rescue => e
    Rails.logger.error "TransfersController#update error: #{e.message}"
    Rails.logger.error e.backtrace.join("\n")

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
      params.require(:transfer).permit(:status)
    end

    def transfers_scope
      transfer_decision_scope(Transfer)
    end
end
