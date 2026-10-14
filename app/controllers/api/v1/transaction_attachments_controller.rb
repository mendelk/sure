# frozen_string_literal: true

module Api
  module V1
    # Transaction file attachments (receipts, invoices). Mirrors the HTML
    # TransactionAttachmentsController permissions: annotate-level roles can
    # upload, only owner/full_control can delete.
    class TransactionAttachmentsController < BaseController
      before_action :ensure_read_scope, only: %i[index show]
      before_action :ensure_write_scope, only: %i[create destroy]
      before_action :set_transaction
      before_action :set_attachment, only: %i[show destroy]
      before_action :set_permissions, only: %i[index create destroy]

      def index
        render json: { attachments: @transaction.attachments.map { |a| attachment_json(a) } }
      end

      def show
        disposition = params[:disposition] == "attachment" ? "attachment" : "inline"
        redirect_to rails_blob_url(@attachment, disposition: disposition), allow_other_host: true
      end

      def create
        unless @can_upload
          return render json: { error: "forbidden", message: "Not authorized to upload" }, status: :forbidden
        end

        files = Array(params[:attachments]).reject(&:blank?)
        if files.empty? && params[:attachment].present?
          files = [ params[:attachment] ]
        end
        return render_validation_error("No files selected") if files.empty?

        current_count = @transaction.attachments.count
        if current_count + files.length > Transaction::MAX_ATTACHMENTS_PER_TRANSACTION
          return render_validation_error("Cannot exceed #{Transaction::MAX_ATTACHMENTS_PER_TRANSACTION} attachments")
        end

        attached = nil
        @transaction.with_lock do
          existing_ids = @transaction.attachments.pluck(:id)
          attached = @transaction.attachments.attach(files)
          unless @transaction.valid?
            Array(attached).reject { |a| existing_ids.include?(a.id) }.each(&:purge)
            return render json: {
              error: "validation_failed",
              message: "Attachment upload failed",
              errors: @transaction.errors.full_messages_for(:attachments)
            }, status: :unprocessable_entity
          end
        end

        render json: {
          message: files.length == 1 ? "Attachment uploaded" : "#{files.length} attachments uploaded",
          attachments: Array(attached).map { |a| attachment_json(a) }
        }, status: :created
      rescue => e
        Rails.logger.error "TransactionAttachmentsController#create error: #{e.message}"
        render json: { error: "internal_server_error", message: "Upload failed" }, status: :internal_server_error
      end

      def destroy
        unless @can_delete
          return render json: { error: "forbidden", message: "Not authorized to delete" }, status: :forbidden
        end

        @attachment.purge
        render json: { message: "Attachment deleted" }, status: :ok
      rescue => e
        Rails.logger.error "TransactionAttachmentsController#destroy error: #{e.message}"
        render json: { error: "internal_server_error", message: "Delete failed" }, status: :internal_server_error
      end

      private

        def set_transaction
          raise ActiveRecord::RecordNotFound unless valid_uuid?(params[:transaction_id])

          @transaction = current_resource_owner.family.transactions
            .joins(entry: :account)
            .merge(Account.accessible_by(current_resource_owner))
            .find(params[:transaction_id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "not_found", message: "Transaction not found" }, status: :not_found
        end

        def set_attachment
          @attachment = @transaction.attachments.find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "not_found", message: "Attachment not found" }, status: :not_found
        end

        def set_permissions
          permission = @transaction.entry.account.permission_for(current_resource_owner)
          @can_upload = permission.in?([ :owner, :full_control, :read_write ])
          @can_delete = permission.in?([ :owner, :full_control ])
        end

        def attachment_json(attachment)
          {
            id: attachment.id,
            filename: attachment.filename.to_s,
            byte_size: attachment.byte_size,
            content_type: attachment.content_type,
            created_at: attachment.created_at.iso8601,
            url: api_v1_transaction_attachment_url(@transaction, attachment)
          }
        end
    end
  end
end
