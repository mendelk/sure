# frozen_string_literal: true

module Api
  module V1
    class MerchantsController < BaseController
      before_action -> { authorize_scope!(:read) }, only: %i[index show]
      before_action -> { authorize_scope!(:write) }, only: %i[create update destroy import]
      before_action :set_merchant, only: %i[show update destroy]

      def index
        family = current_resource_owner.family
        user = current_resource_owner

        family_merchant_ids = family.merchants.select(:id)
        accessible_account_ids = family.accounts.accessible_by(user).select(:id)
        provider_merchant_ids = Transaction.joins(:entry)
          .where(entries: { account_id: accessible_account_ids })
          .where.not(merchant_id: nil)
          .select(:merchant_id)

        @merchants = Merchant
          .where(id: family_merchant_ids)
          .or(Merchant.where(id: provider_merchant_ids, type: "ProviderMerchant"))
          .distinct
          .alphabetically

        render json: @merchants.map { |m| merchant_json(m) }
      rescue StandardError => e
        Rails.logger.error("API Merchants Error: #{e.message}")
        render json: { error: "Failed to fetch merchants" }, status: :internal_server_error
      end

      def show
        render json: merchant_json(@merchant)
      rescue StandardError => e
        Rails.logger.error("API Merchant Show Error: #{e.message}")
        render json: { error: "Failed to fetch merchant" }, status: :internal_server_error
      end

      def create
        return import_csv if params[:file].present?

        family = current_resource_owner.family
        merchant = family.merchants.new(merchant_params)

        if merchant.save
          render json: merchant_json(merchant), status: :created
        else
          render_validation_errors(merchant)
        end
      rescue StandardError => e
        Rails.logger.error("API Merchant Create Error: #{e.message}")
        render json: { error: "internal_server_error", message: "An unexpected error occurred" },
               status: :internal_server_error
      end

      def update
        merchant = if @merchant.is_a?(ProviderMerchant)
          @merchant.convert_to_family_merchant_for(current_resource_owner.family, merchant_params)
        else
          @merchant.tap { |record| record.update!(merchant_params) }
        end

        render json: merchant_json(merchant)
      rescue ActiveRecord::RecordInvalid => e
        render_validation_errors(e.record)
      rescue StandardError => e
        Rails.logger.error("API Merchant Update Error: #{e.message}")
        render json: { error: "internal_server_error", message: "An unexpected error occurred" },
               status: :internal_server_error
      end

      def destroy
        if @merchant.is_a?(ProviderMerchant)
          @merchant.unlink_from_family(current_resource_owner.family)
        else
          @merchant.destroy!
        end

        head :no_content
      rescue StandardError => e
        Rails.logger.error("API Merchant Destroy Error: #{e.message}")
        render json: { error: "internal_server_error", message: "An unexpected error occurred" },
               status: :internal_server_error
      end

      def import
        import_csv
      end

      private

        def import_csv
          family = current_resource_owner.family

          unless params[:file].present?
            return render json: { error: "missing_file", message: "Please provide a CSV file." },
                          status: :unprocessable_entity
          end

          file = params[:file]

          if file.size > Import::MAX_CSV_SIZE
            return render json: {
              error: "file_too_large",
              message: "File is too large. Maximum size is #{Import::MAX_CSV_SIZE / 1.megabyte}MB."
            }, status: :unprocessable_entity
          end

          unless Import::ALLOWED_CSV_MIME_TYPES.include?(file.content_type)
            return render json: {
              error: "invalid_file_type",
              message: "Invalid file type. Please upload a CSV file."
            }, status: :unprocessable_entity
          end

          csv = Import.parse_csv_str(file.read)

          name_header = normalized_header(csv.headers, "name")
          unless name_header
            return render json: {
              error: "missing_column",
              message: "CSV must include a 'name' column."
            }, status: :unprocessable_entity
          end

          color_header = normalized_header(csv.headers, "color")
          website_url_header = normalized_header(csv.headers, "website_url", "website url", "website")
          logo_url_header = normalized_header(csv.headers, "logo_url", "logo url", "logo")

          imported = []
          skipped = []

          csv.each do |row|
            name = row[name_header].to_s.strip
            next if name.blank?

            merchant = family.merchants.find_or_initialize_by(name: name)

            if merchant.persisted?
              skipped << { name: name, reason: "already_exists" }
              next
            end

            merchant.color = row[color_header].to_s.strip.presence if color_header
            merchant.website_url = row[website_url_header].to_s.strip.presence if website_url_header
            merchant.logo_url = row[logo_url_header].to_s.strip.presence if logo_url_header

            if merchant.save
              imported << merchant
            else
              skipped << { name: name, errors: merchant.errors.full_messages }
            end
          end

          render json: {
            imported: imported.count,
            skipped: skipped.count,
            merchants: imported.map { |m| merchant_json(m) }
          }, status: :created
        rescue CSV::MalformedCSVError => e
          render json: { error: "invalid_csv", message: "CSV could not be parsed: #{e.message}" },
                 status: :unprocessable_entity
        rescue StandardError => e
          Rails.logger.error("API Merchants Import Error: #{e.message}")
          render json: { error: "internal_server_error", message: "An unexpected error occurred" },
                 status: :internal_server_error
        end

        def set_merchant
          @merchant = accessible_merchants.find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "not_found", message: "Merchant not found" }, status: :not_found
        end

        def accessible_merchants
          family = current_resource_owner.family
          accessible_account_ids = family.accounts.accessible_by(current_resource_owner).select(:id)
          provider_merchant_ids = Transaction.joins(:entry)
            .where(entries: { account_id: accessible_account_ids })
            .where.not(merchant_id: nil)
            .select(:merchant_id)

          Merchant.where(id: family.merchants.select(:id))
            .or(Merchant.where(id: provider_merchant_ids, type: "ProviderMerchant"))
        end

        def merchant_params
          params.require(:merchant).permit(:name, :color, :website_url, :logo_url)
        end

        def render_validation_errors(merchant)
          render json: {
            error: "unprocessable_entity",
            message: merchant.errors.full_messages.join(", ")
          }, status: :unprocessable_entity
        end

        def merchant_json(merchant)
          {
            id: merchant.id,
            name: merchant.name,
            type: merchant.type,
            color: merchant.color,
            website_url: merchant.website_url,
            logo_url: merchant.logo_url,
            created_at: merchant.created_at,
            updated_at: merchant.updated_at
          }
        end

        def normalized_header(headers, *candidates)
          normalized_map = headers.to_h { |h| [ normalize(h), h ] }
          candidates.each do |candidate|
            header = normalized_map[normalize(candidate)]
            return header if header.present?
          end
          nil
        end

        def normalize(str)
          str.to_s.strip.downcase.gsub(/\*/, "").gsub(/[\s_-]+/, "_")
        end
    end
  end
end
