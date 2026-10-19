class Transactions::BulkUpdatesController < ApplicationController
  def new
    render json: { permissions: selected_permissions }
  end

  def create
    unless selected_permissions[structural_update? ? :can_edit : :can_annotate]
      return render json: { error: "Not authorized to update the selected transactions" }, status: :forbidden
    end

    # Skip split parents from bulk update - update children instead
    updated = selected_entries
                     .excluding_split_parents
                     .preload(:entryable)
                     .bulk_update!(bulk_update_params, update_tags: tags_provided?)

    redirect_back_or_to transactions_path, notice: "#{updated} transactions updated"
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
      bulk_update_params[:date].present? || bulk_update_params[:name].present?
    end

    def bulk_update_params
      params.require(:bulk_update)
            .permit(:date, :notes, :name, :category_id, :merchant_id, entry_ids: [], tag_ids: [])
    end

    # Check if tag_ids was explicitly provided in the request.
    # This distinguishes between "user wants to update tags" vs "user didn't touch tags field".
    def tags_provided?
      bulk_update = params[:bulk_update]
      bulk_update.respond_to?(:key?) && bulk_update.key?(:tag_ids)
    end
end
