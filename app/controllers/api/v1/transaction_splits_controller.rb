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

    transfer_ids = splits.filter_map { |split| split[:transfer_account_id].presence }.uniq
    if transfer_ids.any?
      return render_validation_error("Transfer account IDs must be valid UUIDs") unless transfer_ids.all? { |id| valid_uuid?(id) }

      return render_validation_error("Transfer account must differ from source account") if transfer_ids.include?(@entry.account_id)

      transfer_accounts = family.accounts.where(id: transfer_ids)
      return render_validation_error("Transfer accounts must belong to your family") if transfer_accounts.count != transfer_ids.size

      writable_ids = Account.writable_by(current_resource_owner).where(id: transfer_ids).pluck(:id)
      return render_validation_error("Write access required for transfer accounts") if (transfer_ids - writable_ids).any?

      accounts_by_id = transfer_accounts.index_by(&:id)
      splits.each do |split|
        if split[:transfer_account_id].present?
          split[:transfer_account] = accounts_by_id[split[:transfer_account_id].to_s]
        end
      end
    end

    @children = @entry.split!(splits)
    @entry.sync_account_later
    splits.filter_map { |split| split[:transfer_account] }.uniq.each(&:sync_later)

    render :show, status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: {
      error: "validation_failed",
      message: "Transaction could not be split",
      errors: e.record.errors.full_messages.presence || [ e.message ]
    }, status: :unprocessable_entity
  end

  # Replaces an existing split (mirrors the HTML SplitsController#update:
  # unsplit then re-split in one transaction). Resolves split children to
  # their parent first.
  def update
    entry = @entry.split_child? ? @entry.parent_entry : @entry

    unless entry.split_parent?
      return render_validation_error("Transaction is not split")
    end

    splits = normalized_splits
    category_ids = splits.filter_map { |split| split[:category_id].presence }.uniq
    return render_validation_error("Category IDs must be valid UUIDs") unless category_ids.all? { |id| valid_uuid?(id) }

    invalid_category_ids = category_ids - family.categories.where(id: category_ids).pluck(:id)
    return render_validation_error("Categories must belong to your family") if invalid_category_ids.any?

    transfer_ids = splits.filter_map { |split| split[:transfer_account_id].presence }.uniq
    if transfer_ids.any?
      return render_validation_error("Transfer account IDs must be valid UUIDs") unless transfer_ids.all? { |id| valid_uuid?(id) }

      return render_validation_error("Transfer account must differ from source account") if transfer_ids.include?(entry.account_id)

      transfer_accounts = family.accounts.where(id: transfer_ids)
      return render_validation_error("Transfer accounts must belong to your family") if transfer_accounts.count != transfer_ids.size

      writable_ids = Account.writable_by(current_resource_owner).where(id: transfer_ids).pluck(:id)
      return render_validation_error("Write access required for transfer accounts") if (transfer_ids - writable_ids).any?

      accounts_by_id = transfer_accounts.index_by(&:id)
      splits.each do |split|
        if split[:transfer_account_id].present?
          split[:transfer_account] = accounts_by_id[split[:transfer_account_id].to_s]
        end
      end
    end

    transfer_account_ids_before = entry.child_entries.includes(entryable: [ :transfer_as_inflow, :transfer_as_outflow ]).flat_map do |child|
      transfer = child.entryable.try(:transfer)
      next [] if transfer.nil?
      [ transfer.from_account&.id, transfer.to_account&.id ]
    end

    Entry.transaction do
      entry.unsplit!
      @children = entry.split!(splits)
    end
    @entry = entry
    entry.sync_account_later
    (splits.filter_map { |split| split[:transfer_account] }.uniq + transfer_account_ids_before.compact.uniq.filter_map { |id| family.accounts.find_by(id: id) }).each(&:sync_later)

    render :show, status: :ok
  rescue ActiveRecord::RecordInvalid => e
    render json: {
      error: "validation_failed",
      message: "Transaction split could not be updated",
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
          excluded: split[:excluded],
          transfer_account_id: split[:transfer_account_id].presence
        }
      end
    end

    def split_params
      params.require(:split).permit(splits: %i[name amount category_id excluded transfer_account_id])
    end

    def family
      current_resource_owner.family
    end
end
