# frozen_string_literal: true

class Api::V1::TransactionSplitsController < Api::V1::BaseController
  before_action :ensure_write_scope
  before_action :set_entry
  before_action :validate_annotations, only: [ :create, :update ]

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

    Entry.transaction do
      apply_parent_annotations!(@entry)
      @children = @entry.split!(splits)
    end
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
      apply_parent_annotations!(entry)
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

  def destroy
    entry = @entry.split_child? ? @entry.parent_entry : @entry
    return render_validation_error("Transaction is not split") unless entry.split_parent?

    counterpart_accounts = entry.child_entries.includes(entryable: [ :transfer_as_inflow, :transfer_as_outflow ]).filter_map do |child|
      transfer = child.entryable.transfer
      next unless transfer
      transfer.inflow_transaction_id == child.entryable_id ? transfer.outflow_transaction.entry.account : transfer.inflow_transaction.entry.account
    end.uniq
    unless counterpart_accounts.all? { |account| account_permissions(account)[:can_edit] }
      return render json: { error: "forbidden", message: "Write access required for transfer accounts" }, status: :forbidden
    end
    Entry.transaction do
      entry.lock!
      entry.unsplit!
    end
    ([ entry.account ] + counterpart_accounts).uniq.each(&:sync_later)
    render json: { message: "Transaction unsplit", transaction_id: entry.entryable_id }
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotDestroyed => error
    render_validation_error(error.message)
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
        }.merge(split.slice(:notes, :tag_ids).to_h.symbolize_keys)
      end
    end

    def split_params
      params.require(:split).permit(
        splits: [ :name, :amount, :category_id, :excluded, :transfer_account_id, :notes, { tag_ids: [] } ],
        parent: [ :notes, { tag_ids: [] } ]
      )
    end

    # Check the raw shape before strong parameters can silently discard malformed
    # annotations. Resolve every tag before any split, unsplit or annotation write.
    def validate_annotations
      input = params.require(:split)
      parent = input[:parent]
      if input.key?(:parent) && !parent.is_a?(ActionController::Parameters)
        return render_validation_error("Parent annotations must be an object")
      end

      children = input[:splits]
      children = children.values if children.respond_to?(:values)
      annotations = [ parent, *Array.wrap(children) ].compact
      tag_ids = []
      annotations.each do |annotation|
        next unless annotation.is_a?(ActionController::Parameters)

        if annotation.key?(:notes) && !annotation[:notes].is_a?(String)
          return render_validation_error("Notes must be a string")
        end
        next unless annotation.key?(:tag_ids)

        ids = annotation[:tag_ids]
        unless ids.is_a?(Array) && ids.all? { |id| id.is_a?(String) && valid_uuid?(id) }
          return render_validation_error("Tag IDs must be an array of valid UUIDs")
        end
        tag_ids.concat(ids)
      end

      invalid_tag_ids = tag_ids.uniq - family.tags.where(id: tag_ids.uniq).pluck(:id)
      render_validation_error("Tags must belong to your family") if invalid_tag_ids.any?
    end

    def apply_parent_annotations!(entry)
      annotations = split_params[:parent]
      return unless annotations

      entry.update!(notes: annotations[:notes]) if annotations.key?(:notes)
      entry.transaction.update!(tag_ids: annotations[:tag_ids]) if annotations.key?(:tag_ids)
    end

    def family
      current_resource_owner.family
    end
end
