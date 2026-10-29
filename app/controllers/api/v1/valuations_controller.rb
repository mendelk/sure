# frozen_string_literal: true

class Api::V1::ValuationsController < Api::V1::BaseController
  include Pagy::Backend
  include AccountAuthorizable

  InvalidFilterError = Class.new(StandardError)
  BOOLEAN_PARAM = ActiveModel::Type::Boolean.new

  before_action :ensure_read_scope, only: [ :index, :show, :form_options ]
  before_action :ensure_write_scope, only: [ :create, :update, :preview, :destroy ]
  before_action :set_valuation, only: [ :show, :update, :destroy, :preview ], if: -> { params[:id].present? }

  rescue_from ActiveRecord::RecordNotFound do
    render_errors([ t("valuations.errors.not_found") ], status: :not_found)
  end

  rescue_from ActionController::ParameterMissing do
    render_errors([ t("valuations.errors.invalid_entry") ])
  end

  rescue_from ActiveRecord::RecordInvalid, ActiveRecord::RecordNotDestroyed do |error|
    render_errors(error.record.errors.full_messages)
  end

  def index
    family = current_resource_owner.family
    accessible_account_ids = family.accounts.accessible_by(current_resource_owner).select(:id)
    valuations_query = family.entries
      .where(entryable_type: "Valuation", account_id: accessible_account_ids)
      .includes(:account, :entryable)

    valuations_query = apply_filters(valuations_query).reverse_chronological
    @per_page = safe_per_page_param

    @pagy, @entries = pagy(
      valuations_query,
      page: safe_page_param,
      limit: @per_page
    )

    render :index
  rescue InvalidFilterError => e
    render json: {
      error: "validation_failed",
      message: e.message,
      errors: [ e.message ]
    }, status: :unprocessable_entity
  rescue => e
    Rails.logger.error "ValuationsController#index error: #{e.message}"
    Rails.logger.error e.backtrace.join("\n")

    render json: {
      error: "internal_server_error",
      message: "An unexpected error occurred"
    }, status: :internal_server_error
  end

  def show
    render :show
  end

  def form_options
    account = accessible_accounts.find(params[:account_id]) if params[:account_id].present?
    return if account && !require_valuation_permission!(account)

    accounts = accessible_accounts.writable_by(current_resource_owner).alphabetically.includes(:account_providers)
    entry = Entry.new(
      account: account, entryable: Valuation.new,
      name: account ? Valuation.build_reconciliation_name(account.accountable_type) : "",
      date: Date.current, currency: account&.currency || current_resource_owner.family.currency
    )
    render json: { workspace: Valuation::PageData.new(entry: entry, accounts: accounts, permissions: {
      can_edit: accounts.any?, can_annotate: accounts.any?
    }) }
  end

  def preview
    return render_errors([ t("valuations.errors.invalid_entry") ]) if !@entry && valuation_account_id.blank?

    account = @entry&.account || accessible_accounts.find(valuation_account_id)
    return unless require_valuation_permission!(account)

    input = reconciliation_input(account, existing_entry: @entry)
    return unless input

    result = if @entry
      account.update_reconciliation(@entry, **input.to_h, dry_run: true)
    else
      account.create_reconciliation(**input.to_h, dry_run: true)
    end
    return render_errors([ result.error_message ]) unless result.success?

    render json: { confirmation: Valuation::PageData.confirmation(
      account: account, date: input.date, result: result, is_update: @entry.present?
    ) }
  end

  def create
    return render_errors([ t("valuations.errors.invalid_entry") ]) if valuation_account_id.blank?

    account = accessible_accounts.find(valuation_account_id)
    return unless require_valuation_permission!(account)

    input = reconciliation_input(account)
    return unless input

    requested_upsert = upsert_requested?
    existing_write = false
    errors = nil
    ActiveRecord::Base.transaction do
      account.lock! if requested_upsert
      existing_write = account.entries.valuations.exists?(date: input.date) if requested_upsert
      result = account.create_reconciliation(**input.to_h)
      unless result.success?
        errors = [ result.error_message ]
        raise ActiveRecord::Rollback
      end
      @entry = account.entries.valuations.find_by!(date: input.date)
      @entry.update!(notes: valuation_params[:notes]) if valuation_params.key?(:notes)
    end
    return render_errors(errors) if errors

    @valuation = @entry.entryable
    render :show, status: requested_upsert && existing_write ? :ok : :created
  end

  def update
    financial_update = valuation_params.key?(:date) || valuation_params.key?(:amount)
    return unless require_valuation_permission!(@entry.account, financial_update ? :write : :annotate)
    return render_errors([ t("valuations.errors.invalid_entry") ]) unless financial_update || valuation_params.key?(:notes)

    input = reconciliation_input(@entry.account, existing_entry: @entry) if financial_update
    return if financial_update && !input

    errors = nil
    ActiveRecord::Base.transaction do
      if financial_update
        result = @entry.account.update_reconciliation(@entry, **input.to_h)
        unless result.success?
          errors = [ result.error_message ]
          raise ActiveRecord::Rollback
        end
      end
      @entry.update!(notes: valuation_params[:notes]) if valuation_params.key?(:notes)
    end
    return render_errors(errors) if errors

    @entry.reload
    @valuation = @entry.entryable
    render :show
  end

  def destroy
    return unless require_valuation_permission!(@entry.account)

    @entry.destroy!
    @entry.sync_account_later
    head :no_content
  end

  private

    def accessible_accounts
      current_resource_owner.family.accounts.accessible_by(current_resource_owner)
    end

    def set_valuation
      @entry = current_resource_owner.family.entries.valuations
        .where(account_id: accessible_accounts.select(:id)).find(params[:id])
      @valuation = @entry.entryable
    end

    def require_valuation_permission!(account, level = :write)
      return true if account_permissions(account).fetch(level == :annotate ? :can_annotate : :can_edit)

      render_errors([ t("accounts.not_authorized") ], status: :forbidden)
      false
    end

    def reconciliation_input(account, existing_entry: nil)
      input = Valuation::ReconciliationInput.new(account: account, attributes: valuation_params, existing_entry: existing_entry)
      return input if input.valid?

      render_errors(input.errors)
      nil
    end

    def render_errors(errors, status: :unprocessable_entity)
      render json: { error: { forbidden: "forbidden", not_found: "not_found" }.fetch(status, "validation_failed"),
        message: errors.join(", "), errors: errors }, status: status
    end

    def ensure_read_scope
      authorize_scope!(:read)
    end

    def ensure_write_scope
      authorize_scope!(:write)
    end

    def apply_filters(query)
      if params[:account_id].present?
        raise InvalidFilterError, "account_id must be a valid UUID" unless valid_uuid?(params[:account_id])

        query = query.where(account_id: params[:account_id])
      end
      query = query.where("entries.date >= ?", parse_date_param(:start_date)) if params[:start_date].present?
      query = query.where("entries.date <= ?", parse_date_param(:end_date)) if params[:end_date].present?
      query
    end

    def parse_date_param(key)
      Date.iso8601(params[key].to_s)
    rescue ArgumentError
      raise InvalidFilterError, "#{key} must be an ISO 8601 date"
    end

    def safe_page_param
      page = params[:page].to_i
      page > 0 ? page : 1
    end

    def safe_per_page_param
      per_page = params[:per_page].to_i

      case per_page
      when 1..100
        per_page
      else
        25
      end
    end

    def valuation_account_id
      params.dig(:valuation, :account_id)
    end

    def valuation_params
      params.require(:valuation).permit(:amount, :date, :notes)
    end

    def upsert_requested?
      raw_value = params.key?(:upsert) ? params[:upsert] : params.dig(:valuation, :upsert)

      BOOLEAN_PARAM.cast(raw_value)
    end
end
