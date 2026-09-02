# frozen_string_literal: true

class Api::V1::TransactionSplitsController < Api::V1::BaseController
  before_action :ensure_write_scope
  before_action :set_entry

  def create
    unless @entry.transaction.splittable?
      return render_validation_error("Transaction cannot be split")
    end

    splits = normalized_splits
    category_ids = splits.filter_map { |split| split[:category_id].presence }.uniq
    return render_validation_error("Category IDs must be valid UUIDs") unless category_ids.all? { |id| valid_uuid?(id) }

    invalid_category_ids = category_ids - family.categories.where(id: category_ids).pluck(:id)
    return render_validation_error("Categories must belong to your family") if invalid_category_ids.any?

    @children = @entry.split!(splits)
    @entry.sync_account_later

    render :show, status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: {
      error: "validation_failed",
      message: "Transaction could not be split",
      errors: e.record.errors.full_messages.presence || [ e.message ]
    }, status: :unprocessable_entity
  end

  private
    def ensure_write_scope
      authorize_scope!(:write)
    end

    def set_entry
      raise ActiveRecord::RecordNotFound unless valid_uuid?(params[:transaction_id])

      transaction = family.transactions
        .joins(entry: :account)
        .merge(Account.writable_by(current_resource_owner))
        .find(params[:transaction_id])
      @entry = transaction.entry
    rescue ActiveRecord::RecordNotFound
      render json: { error: "not_found", message: "Transaction not found" }, status: :not_found
    end

    def normalized_splits
      raw_splits = split_params[:splits]
      raise ActionController::ParameterMissing, :splits if raw_splits.nil?

      raw_splits = raw_splits.values if raw_splits.respond_to?(:values)

      raw_splits.map do |split|
        {
          name: split[:name],
          amount: split[:amount].to_d * -1,
          category_id: split[:category_id].presence,
          excluded: split[:excluded]
        }
      end
    end

    def split_params
      params.require(:split).permit(splits: %i[name amount category_id excluded])
    end

    def family
      current_resource_owner.family
    end
end
