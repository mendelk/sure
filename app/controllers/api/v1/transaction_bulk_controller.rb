# frozen_string_literal: true

class Api::V1::TransactionBulkController < Api::V1::BaseController
  before_action -> { authorize_scope!(action_name == "permissions" ? :read : :write) }
  before_action :set_selection

  def permissions
    render json: { permissions: selection_permissions, source_account_ids: @entries.map(&:account_id).uniq }
  end

  def update
    attributes = params.require(:bulk_update).permit(:date, :notes, :name, :category_id, :merchant_id, :transfer_account_id, tag_ids_to_add: [], tag_ids_to_remove: [])
    structural = attributes.values_at(:date, :name, :transfer_account_id).any?(&:present?)
    return forbidden unless selection_permissions[structural ? :can_edit : :can_annotate]
    return unless validate_references(attributes)

    transfer_account = if attributes[:transfer_account_id].present?
      family.accounts.writable_by(current_resource_owner).find_by(id: attributes[:transfer_account_id])
    end
    return forbidden if attributes[:transfer_account_id].present? && !transfer_account

    entries = transfer_account ? @entries : @entries.excluding_split_parents
    updated = entries.preload(:entryable).bulk_update!(attributes, transfer_account: transfer_account)
    render json: { updated_count: updated }
  rescue ActiveRecord::RecordInvalid => error
    render_validation_error(error.record.errors.full_messages.to_sentence)
  end

  def destroy
    return forbidden unless selection_permissions[:can_edit]

    entries = @entries.where(parent_entry_id: nil).preload(:account)
    accounts = entries.map(&:account).uniq
    count = 0
    Entry.transaction { entries.each { |entry| entry.destroy!; count += 1 } }
    accounts.each(&:sync_later)
    render json: { deleted_count: count }
  rescue ActiveRecord::RecordNotDestroyed, ActiveRecord::RecordInvalid => error
    render_validation_error(error.message)
  end

  private
    def family
      current_resource_owner.family
    end

    def set_selection
      input = action_name == "permissions" ? params : params.require(action_name == "destroy" ? :bulk_delete : :bulk_update)
      ids = input[:entry_ids]
      unless ids.is_a?(Array) && ids.present? && ids.all? { |id| valid_uuid?(id) }
        return render_validation_error("Entry IDs must be a nonempty array of UUIDs")
      end
      @ids = ids.uniq
      @entries = family.entries.joins(:account).merge(Account.accessible_by(current_resource_owner)).where(id: @ids).preload(:account)
      if @entries.size != @ids.size
        render json: { error: "not_found", message: "Selected entries not found" }, status: :not_found
      end
    end

    def selection_permissions
      permissions = @entries.map { |entry| account_permissions(entry.account) }
      { can_edit: permissions.all? { |permission| permission[:can_edit] }, can_annotate: permissions.all? { |permission| permission[:can_annotate] } }
    end

    def validate_references(attributes)
      { category_id: family.categories, merchant_id: family.merchants, tag_ids_to_add: family.tags, tag_ids_to_remove: family.tags }.each do |key, scope|
        ids = Array.wrap(attributes[key]).compact_blank.uniq
        next if ids.empty?
        unless ids.all? { |id| valid_uuid?(id) } && scope.where(id: ids).count == ids.size
          render_validation_error("#{key} must belong to your family")
          return false
        end
      end
      true
    end

    def forbidden
      render json: { error: "forbidden", message: "Not authorized to change the selected entries" }, status: :forbidden
    end
end
