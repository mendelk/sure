# frozen_string_literal: true

class Api::V1::TransactionsController < Api::V1::BaseController
  include Pagy::Backend

  # Ensure proper scope authorization for read vs write access
  before_action :ensure_read_scope, only: [ :index, :show ]
  before_action :ensure_write_scope, only: [ :create, :update, :destroy ]
  before_action :set_transaction, only: [ :show, :update, :destroy ]

  def index
    family = current_resource_owner.family
    accessible_account_ids = family.accounts
      .accessible_by(current_resource_owner)
      .where.not(status: "pending_deletion")
      .select(:id)

    @search = Transaction::Search.new(
      family,
      filters: search_filters.merge(
        # v1 contract: global ledger history includes disabled accounts; only
        # pending-deletion accounts are excluded (filtered above).
        active_accounts_only: false
      ),
      accessible_account_ids: accessible_account_ids
    )

    scope = @search.transactions_scope
                   .reverse_chronological
                   .includes(
                     { entry: :account },
                     :category, :merchant, :tags,
                     transfer_as_outflow: { inflow_transaction: { entry: :account } },
                     transfer_as_inflow: { outflow_transaction: { entry: :account } }
                   )

    # Handle pagination with Pagy
    @pagy, @transactions = pagy(
      scope,
      page: safe_page_param,
      limit: safe_per_page_param
    )

    # Make per_page available to the template
    @per_page = safe_per_page_param
    @totals = @search.totals

    # Rails will automatically use app/views/api/v1/transactions/index.json.jbuilder
    render :index

  rescue Date::Error => e
    render json: {
      error: "validation_failed",
      message: e.message,
      errors: [ e.message ]
    }, status: :unprocessable_entity
  rescue InvalidFilterError => e
    render_validation_error(e.message)
  rescue => e
    Rails.logger.error "TransactionsController#index error: #{e.message}"
    Rails.logger.error e.backtrace.join("\n")

    render json: {
      error: "internal_server_error",
      message: "An unexpected error occurred"
    }, status: :internal_server_error
  end

  def show
    # Rails will automatically use app/views/api/v1/transactions/show.json.jbuilder
    render :show

  rescue => e
    Rails.logger.error "TransactionsController#show error: #{e.message}"
    Rails.logger.error e.backtrace.join("\n")

    render json: {
      error: "internal_server_error",
      message: "An unexpected error occurred"
    }, status: :internal_server_error
  end

  def create
    family = current_resource_owner.family

    # Validate account_id is present
    unless account_id_param.present?
      render json: {
        error: "validation_failed",
        message: "Account ID is required",
        errors: [ "Account ID is required" ]
      }, status: :unprocessable_entity
      return
    end

    if idempotency_source_param.present? && idempotency_external_id.blank?
      render json: {
        error: "validation_failed",
        message: "Source requires external_id",
        errors: [ "Source requires external_id" ]
      }, status: :unprocessable_entity
      return
    end

    account = family.accounts.writable_by(current_resource_owner).find(account_id_param)

    if idempotency_key_requested? && (existing_entry = existing_idempotent_entry(account))
      return render_existing_idempotent_entry(existing_entry)
    end

    @entry = account.entries.new(entry_params_for_create)

    if @entry.save
      @entry.lock_saved_attributes!
      @entry.transaction.lock_attr!(:tag_ids) if @entry.transaction.tags.any?
      @entry.mark_user_modified! if user_modified_requested?
      @entry.sync_account_later

      @transaction = @entry.transaction
      render :show, status: :created
    else
      render json: {
        error: "validation_failed",
        message: "Transaction could not be created",
        errors: @entry.errors.full_messages
      }, status: :unprocessable_entity
    end

  rescue ActiveRecord::RecordNotUnique
    if idempotency_key_requested? && account && (existing_entry = existing_idempotent_entry(account))
      render_existing_idempotent_entry(existing_entry)
    else
      raise
    end
  rescue => e
    Rails.logger.error "TransactionsController#create error: #{e.message}"
    Rails.logger.error e.backtrace.join("\n")

    render json: {
      error: "internal_server_error",
      message: "An unexpected error occurred"
    }, status: :internal_server_error
  end

  def update
    if @entry.split_child?
      render json: { error: "validation_failed", message: "Split child transactions cannot be edited directly. Use the split editor." }, status: :unprocessable_entity
      return
    end

    if @entry.split_parent? && split_financial_fields_changed?
      render json: { error: "validation_failed", message: "Split parent amount, date, and type cannot be changed directly. Use the split editor." }, status: :unprocessable_entity
      return
    end

    Entry.transaction do
      if @entry.update(entry_params_for_update)
        # Handle tags separately - only when explicitly provided in the request
        # This allows clearing tags with tag_ids: [] while preserving tags when not specified
        if tags_provided?
          @entry.transaction.tag_ids = transaction_params[:tag_ids] || []
          @entry.transaction.save!
          @entry.transaction.lock_attr!(:tag_ids) if @entry.transaction.tags.any?
        end

        if excluded_provided?
          @entry.update!(excluded: transaction_params[:excluded])
          @entry.lock_attr!(:excluded)
        end

        @entry.sync_account_later
        @entry.lock_saved_attributes!
        @entry.mark_user_modified! if user_modified_requested?

        @transaction = @entry.transaction
        render :show
      else
        render json: {
          error: "validation_failed",
          message: "Transaction could not be updated",
          errors: @entry.errors.full_messages
        }, status: :unprocessable_entity
        raise ActiveRecord::Rollback
      end
    end

  rescue => e
    Rails.logger.error "TransactionsController#update error: #{e.message}"
    Rails.logger.error e.backtrace.join("\n")

    render json: {
      error: "internal_server_error",
      message: "An unexpected error occurred"
    }, status: :internal_server_error
  end

  def destroy
    if @entry.split_child?
      render json: { error: "validation_failed", message: "Split child transactions cannot be deleted individually." }, status: :unprocessable_entity
      return
    end

    @entry.destroy!
    @entry.sync_account_later

    render json: {
      message: "Transaction deleted successfully"
    }, status: :ok

  rescue => e
    Rails.logger.error "TransactionsController#destroy error: #{e.message}"
    Rails.logger.error e.backtrace.join("\n")

    render json: {
      error: "internal_server_error",
      message: "An unexpected error occurred"
    }, status: :internal_server_error
  end

  private

    def set_transaction
      raise ActiveRecord::RecordNotFound unless valid_uuid?(params[:id])

      family = current_resource_owner.family
      @transaction = family.transactions
        .joins(entry: :account)
        .merge(Account.accessible_by(current_resource_owner))
        .find(params[:id])
      @entry = @transaction.entry
    rescue ActiveRecord::RecordNotFound
      render json: {
        error: "not_found",
        message: "Transaction not found"
      }, status: :not_found
    end

    def ensure_read_scope
      authorize_scope!(:read)
    end

    def ensure_write_scope
      authorize_scope!(:write)
    end

    # Maps query params onto Transaction::Search filter attributes so the API
    # uses the same filter semantics as the rest of the app (name- and ID-based
    # filters, transfer-aware type filtering, pending/confirmed status,
    # single-value amount filtering, and slack-style exclusions).
    def search_filters
      filters = {}
      filters[:search] = params[:search] if params[:search].present?
      filters[:start_date] = validate_date!(:start_date) if params[:start_date].present?
      filters[:end_date] = validate_date!(:end_date) if params[:end_date].present?
      filters.merge!(amount_filters)

      filters[:account_ids] = array_param(:account_ids) | array_param(:account_id)
      filters[:accounts] = array_param(:accounts)

      # Transaction::Search filters categories/merchants/tags by name; resolve
      # legacy ID-based params to names.
      category_ids = array_param(:category_ids) | array_param(:category_id)
      filters[:categories] = array_param(:categories) | names_for_ids(current_resource_owner.family.categories, category_ids)
      merchant_ids = array_param(:merchant_ids) | array_param(:merchant_id)
      filters[:merchants] = array_param(:merchants) | names_for_ids(current_resource_owner.family.merchants, merchant_ids)
      tag_ids = array_param(:tag_ids)
      filters[:tags] = array_param(:tags) | names_for_ids(current_resource_owner.family.tags, tag_ids)

      filters[:types] = array_param(:types) | array_param(:type)
      filters[:status] = array_param(:status)
      filters.merge!(exclusion_filters)
      filters
    end

    # Slack-style negative filters (e.g. `-category:House`). Mirrors the
    # classic search box: only faceted filters are negatable, and ID-based
    # params resolve to names like their positive counterparts.
    def exclusion_filters
      family = current_resource_owner.family
      excluded_category_ids = array_param(:excluded_category_ids) | array_param(:excluded_category_id)
      excluded_merchant_ids = array_param(:excluded_merchant_ids) | array_param(:excluded_merchant_id)
      excluded_tag_ids = array_param(:excluded_tag_ids)
      {
        excluded_categories: array_param(:excluded_categories) | names_for_ids(family.categories, excluded_category_ids),
        excluded_merchants: array_param(:excluded_merchants) | names_for_ids(family.merchants, excluded_merchant_ids),
        excluded_tags: array_param(:excluded_tags) | names_for_ids(family.tags, excluded_tag_ids),
        excluded_accounts: array_param(:excluded_accounts),
        excluded_account_ids: array_param(:excluded_account_ids) | array_param(:excluded_account_id),
        excluded_types: array_param(:excluded_types) | array_param(:excluded_type),
        excluded_status: array_param(:excluded_status)
      }.reject { |_, value| value.blank? }
    end

    # Classic single-value amount filter (EntrySearch): one amount plus an
    # equal/greater/less operator. `min_amount`/`max_amount` remain documented
    # legacy aliases; explicit amount/amount_operator wins when both present.
    def amount_filters
      amount = params[:amount].presence || params[:min_amount].presence || params[:max_amount].presence
      return {} if amount.blank?

      operator = params[:amount_operator].presence ||
        (params[:min_amount].present? ? "greater" : params[:max_amount].present? ? "less" : "equal")
      unless %w[equal greater less].include?(operator)
        raise InvalidFilterError, "amount_operator must be one of: equal, greater, less"
      end
      raise InvalidFilterError, "amount must be a number" unless numeric?(amount)

      { amount: amount, amount_operator: operator }
    end

    def numeric?(value)
      Float(value)
      true
    rescue ArgumentError, TypeError
      false
    end

    def names_for_ids(scope, ids)
      return [] if ids.blank?
      scope.where(id: ids).pluck(:name)
    end

    def validate_date!(key)
      Date.iso8601(params[key])
    rescue ArgumentError
      raise InvalidFilterError, "#{key} must be an ISO 8601 date"
    end

    # Accepts repeated params (a=1&a=2), comma-separated values (a=1,2), and
    # Rails' array notation (a[]=1), matching how the browser SPA sends filters.
    def array_param(key)
      Array(params[key]).flat_map { |value| value.to_s.split(",") }.compact_blank
    end

    def transaction_params
      params.require(:transaction).permit(
        :date, :amount, :name, :description, :notes, :currency,
        :category_id, :merchant_id, :nature, :user_modified,
        :excluded, tag_ids: []
      )
    end

    # An API client can opt a transaction it creates into the same
    # sync-protection a manual edit gets (Entry#protected_from_sync?) -
    # useful for a client that owns its own writes into an account also
    # linked to a bank-sync provider (Plaid/SimpleFin/etc.), so the next
    # sync only links its external_id to the entry instead of overwriting
    # the category/name the client already set.
    def user_modified_requested?
      ActiveModel::Type::Boolean.new.cast(transaction_params[:user_modified])
    end

    def account_id_param
      params.dig(:transaction, :account_id).presence
    end

    def entry_params_for_create
      entry_params = {
        name: transaction_params[:name] || transaction_params[:description],
        date: transaction_params[:date],
        amount: calculate_signed_amount,
        currency: transaction_params[:currency] || current_resource_owner.family.currency,
        notes: transaction_params[:notes],
        entryable_type: "Transaction",
        entryable_attributes: {
          category_id: transaction_params[:category_id],
          merchant_id: transaction_params[:merchant_id],
          tag_ids: transaction_params[:tag_ids] || []
        }
      }
      if idempotency_key_requested?
        entry_params[:external_id] = idempotency_external_id
        entry_params[:source] = idempotency_source
      end

      entry_params.compact
    end

    def entry_params_for_update
      entry_params = {
        name: transaction_params[:name] || transaction_params[:description],
        date: transaction_params[:date],
        notes: transaction_params[:notes]
      }

      entryable_attrs = { id: @entry.entryable_id }
      if transaction_params.key?(:category_id)
        entryable_attrs[:category_id] = transaction_params[:category_id].presence
      end
      if transaction_params.key?(:merchant_id)
        entryable_attrs[:merchant_id] = transaction_params[:merchant_id].presence
      end
      entry_params[:entryable_attributes] = entryable_attrs if entryable_attrs.size > 1

      # Only update amount if provided
      if transaction_params[:amount].present?
        entry_params[:amount] = calculate_signed_amount
      end

      entry_params.compact
    end

    # Check if tag_ids was explicitly provided in the request.
    # This distinguishes between "user wants to update tags" vs "user didn't specify tags".
    def tags_provided?
      params[:transaction].key?(:tag_ids)
    end

    # Check if excluded was explicitly provided in the request.
    def excluded_provided?
      params[:transaction].key?(:excluded)
    end

    def split_financial_fields_changed?
      params.dig(:transaction, :amount).present? ||
        params.dig(:transaction, :date).present? ||
        params.dig(:transaction, :nature).present?
    end

    def idempotency_key_requested?
      idempotency_external_id.present?
    end

    def idempotency_external_id
      idempotency_param_value(:external_id)
    end

    def idempotency_source
      idempotency_source_param.presence || "api"
    end

    def idempotency_source_param
      idempotency_param_value(:source)
    end

    def idempotency_param_value(key)
      value = params.dig(:transaction, key)
      value.to_s.presence if value.is_a?(String) || value.is_a?(Numeric)
    end

    def existing_idempotent_entry(account)
      account.entries.find_by(
        external_id: idempotency_external_id,
        source: idempotency_source
      )
    end

    def render_existing_idempotent_entry(entry)
      unless entry.entryable.is_a?(Transaction)
        render json: {
          error: "validation_failed",
          message: "External ID already exists for a non-transaction entry",
          errors: [ "External ID already exists for a non-transaction entry" ]
        }, status: :unprocessable_entity
        return
      end

      @entry = entry
      @transaction = entry.transaction
      render :show, status: :ok
    end

    def calculate_signed_amount
      amount = transaction_params[:amount].to_f
      nature = transaction_params[:nature]

      case nature&.downcase
      when "income", "inflow"
        -amount.abs  # Income is negative
      when "expense", "outflow"
        amount.abs   # Expense is positive
      else
        amount       # Use as provided
      end
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
        25  # Default
      end
    end
end
