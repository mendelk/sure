class Transactions::BulkUpdatesController < ApplicationController
  def new
    render json: {
      permissions: selected_permissions,
      source_account_ids: selected_entries.map(&:account_id).uniq
    }
  end

  def create
    unless selected_permissions[structural_update? ? :can_edit : :can_annotate]
      return render json: { error: "Not authorized to update the selected transactions" }, status: :forbidden
    end

    transfer_account = if bulk_update_params[:transfer_account_id].present?
      Current.family.accounts.writable_by(Current.user).find_by(id: bulk_update_params[:transfer_account_id])
    end
    if bulk_update_params[:transfer_account_id].present? && transfer_account.nil?
      return render json: { error: t("transactions.bulk_updates.errors.target_not_writable") }, status: :forbidden
    end

    entries = transfer_account ? selected_entries : selected_entries.excluding_split_parents
    updated = entries.preload(:entryable).bulk_update!(
      bulk_update_params,
      transfer_account: transfer_account
    )

    respond_to do |format|
      format.html { redirect_back_or_to transactions_path, notice: "#{updated} transactions updated" }
      format.json { render json: { updated_count: updated } }
    end
  rescue ActiveRecord::RecordInvalid => error
    message = error.record.errors.full_messages.to_sentence
    respond_to do |format|
      format.html { redirect_back_or_to transactions_path, alert: message }
      format.json { render json: { error: message }, status: :unprocessable_entity }
    end
  end

  private
    def selected_entries
      @selected_entries ||= Current.accessible_entries.where(id: bulk_update_params[:entry_ids]).preload(:account)
    end

    def selected_permissions
      ids = Array(bulk_update_params[:entry_ids]).uniq
      complete = ids.present? && selected_entries.size == ids.size
      permissions = selected_entries.map { |entry| account_permissions(entry.account) }
      {
        can_edit: complete && permissions.all? { |permission| permission[:can_edit] },
        can_annotate: complete && permissions.all? { |permission| permission[:can_annotate] }
      }
    end

    def structural_update?
      bulk_update_params[:date].present? || bulk_update_params[:name].present? || bulk_update_params[:transfer_account_id].present?
    end

    def bulk_update_params
      params.require(:bulk_update)
            .permit(:date, :notes, :name, :category_id, :merchant_id, :transfer_account_id, entry_ids: [], tag_ids_to_add: [], tag_ids_to_remove: [])
    end
end
