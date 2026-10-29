# frozen_string_literal: true

class Api::V1::AccountsController < Api::V1::BaseController
  include Pagy::Backend
  include AccountWorkspaceData

  ACCOUNT_TYPES = Accountable::TYPES.index_by(&:underscore).freeze
  # Per-type accountable fields accepted under the `accountable` key. `:subtype`
  # is accepted both top-level (delegated to the accountable by Account#subtype=)
  # and nested, matching the native forms which submit it nested.
  ACCOUNTABLE_ATTRIBUTES = {
    "Depository" => %i[subtype],
    "Investment" => %i[subtype],
    "Crypto" => %i[subtype tax_treatment],
    "Property" => %i[subtype year_built area_unit area_value],
    "Vehicle" => %i[subtype make model year mileage_value mileage_unit],
    "OtherAsset" => %i[subtype],
    "CreditCard" => %i[subtype available_credit minimum_payment payment_due_day minimum_payment_only apr annual_fee expiration_date],
    "Loan" => %i[subtype rate_type interest_rate term_months initial_balance start_date
      down_payment insurance_rate insurance_rate_type rate_changes],
    "OtherLiability" => %i[subtype]
  }.freeze

  before_action :ensure_read_scope, only: %i[index show provider_options]
  before_action :ensure_write_scope, only: %i[create update status sync destroy set_default remove_default unlink]
  before_action :set_lifecycle_account, only: %i[status sync destroy set_default remove_default provider_options unlink]
  before_action :ensure_manageable_account, only: %i[status destroy provider_options unlink]

  def index
    @per_page = safe_per_page_param

    @pagy, @accounts = pagy(
      accounts_scope.alphabetically,
      page: safe_page_param,
      limit: @per_page
    )

    if include_workspace?
      build_index_workspace
      @workspace = index_spa_payload
    end
    render :index
  rescue => e
    Rails.logger.error "AccountsController#index error: #{e.message}"
    Rails.logger.error e.backtrace.join("\n")

    render json: {
      error: "internal_server_error",
      message: "An unexpected error occurred"
    }, status: :internal_server_error
  end

  def show
    unless valid_uuid?(params[:id])
      render json: {
        error: "not_found",
        message: "Account not found"
      }, status: :not_found
      return
    end

    @account = accounts_scope.find(params[:id])

    if include_workspace?
      set_workspace_period
      build_detail_workspace
      @workspace = @account_page_data.as_json
    end
    render :show
  rescue ActiveRecord::RecordNotFound
    render json: {
      error: "not_found",
      message: "Account not found"
    }, status: :not_found
  rescue => e
    Rails.logger.error "AccountsController#show error: #{e.message}"
    Rails.logger.error e.backtrace.join("\n")

    render json: {
      error: "internal_server_error",
      message: "An unexpected error occurred"
    }, status: :internal_server_error
  end

  def create
    type_name = ACCOUNT_TYPES[account_params[:account_type].to_s]
    return render_validation_error("Account type is invalid") unless type_name

    attrs = account_params.to_h.deep_symbolize_keys
    attrs.delete(:account_type)
    opening_balance_date = parse_opening_balance_date(attrs.delete(:opening_balance_date))
    accountable_attrs = attrs.delete(:accountable)&.slice(*ACCOUNTABLE_ATTRIBUTES.fetch(type_name)) || {}
    accountable_attrs[:address_attributes] = property_address_params if type_name == "Property" && property_address_params.present?

    Account.transaction do
      @account = current_resource_owner.family.accounts.create_and_sync(
        attrs.merge(
          owner: current_resource_owner,
          currency: attrs[:currency].presence || current_resource_owner.family.currency,
          accountable_type: type_name,
          accountable_attributes: accountable_attrs
        ),
        opening_balance_date: opening_balance_date
      )
      @account.lock_saved_attributes!
    end

    render :show, status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: {
      error: "validation_failed",
      message: "Account could not be created",
      errors: e.record.errors.full_messages
    }, status: :unprocessable_entity
  rescue ArgumentError => e
    render json: {
      error: "validation_failed",
      message: "Account could not be created",
      errors: [ e.message ]
    }, status: :unprocessable_entity
  end

  def update
    unless valid_uuid?(params[:id])
      render json: {
        error: "not_found",
        message: "Account not found"
      }, status: :not_found
      return
    end

    @account = accounts_scope.find(params[:id])
    return unless ensure_manageable_account

    attrs = account_params.to_h.deep_symbolize_keys
    # Updating a balance actually changes the current valuation (which also
    # rewrites the cached `balance` column), so read it before the update
    # assigns the other submitted fields. Keep the remaining fields available
    # for the 422 response — but do not persist any of them yet.
    update_params = slice_update_params(attrs, @account.accountable_type)

    saved = Account.transaction do
      # Linked accounts manage their balance through provider sync (the native
      # forms hide the balance field when linked), so a submitted balance is
      # ignored rather than applied.
      if !@account.linked? && attrs.key?(:balance) && attrs[:balance].present? && attrs[:balance].to_d != @account.balance
        result = @account.set_current_balance(attrs[:balance].to_d)
        unless result.success?
          @account.assign_attributes(update_params)
          @error = result.error
          raise ActiveRecord::Rollback, "balance update failed"
        end
      end

      # Update remaining account attributes. Note: currency is intentionally
      # allowed here so all account types can have their currency changed via
      # this shared update path.
      unless @account.update(update_params)
        @error = @account.errors.full_messages.join(", ")
        raise ActiveRecord::Rollback, "account update failed"
      end

      # Inside the transaction, as `create` does: the locks are saved with
      # `update!`, and a raise there after the commit left the balance and the
      # attributes above in place behind a failed request.
      @account.lock_saved_attributes!

      true
    rescue ActiveRecord::RecordInvalid => e
      # E.g. `lock_saved_attributes!` raising via `update!` after the balance
      # and attributes above already applied: re-raise as a rollback so a
      # 422 never leaves half of the form committed, mirroring
      # AccountableResource#update.
      @error = e.record.errors.full_messages.join(", ").presence || e.message
      raise ActiveRecord::Rollback, "account update failed"
    rescue ArgumentError => e
      # Enum setters (crypto tax_treatment, loan insurance_rate_type) raise
      # on assignment rather than failing validation; report as 422 like
      # `create` does.
      @error = e.message
      raise ActiveRecord::Rollback, "account update failed"
    end

    unless saved
      render json: {
        error: "validation_failed",
        message: @error.presence || "Account could not be updated",
        errors: [ @error.presence || "Account could not be updated" ]
      }, status: :unprocessable_entity
      return
    end

    render :show
  rescue ActiveRecord::RecordNotFound
    render json: {
      error: "not_found",
      message: "Account not found"
    }, status: :not_found
  rescue => e
    Rails.logger.error "AccountsController#update error: #{e.message}"
    Rails.logger.error e.backtrace.join("\n")

    render json: {
      error: "internal_server_error",
      message: "An unexpected error occurred"
    }, status: :internal_server_error
  end

  def status
    target = params.require(:status)
    unless target.in?(%w[active disabled])
      return render_validation_error("Status must be active or disabled")
    end
    @account.with_lock do
      unless @account.status == target
        unless @account.status.in?(%w[active disabled])
          return render_validation_error("Only active or disabled accounts can change status")
        end
        target == "active" ? @account.enable! : @account.disable!
      end
    end
    render :show
  end

  def sync
    Account::Lifecycle.new(@account).request_sync
    render :show, status: :accepted
  end

  def destroy
    @account.with_lock do
      return render_validation_error("Linked accounts must be unlinked before deletion") if @account.linked?

      @account.destroy_later unless @account.pending_deletion?
    end
    head :no_content
  end

  def set_default
    return render_validation_error("Account is not eligible as a transaction default") unless @account.eligible_for_transaction_default?

    Current.user.update!(default_account: @account)
    render :show
  end

  def remove_default
    Current.user.update!(default_account: nil) if Current.user.default_account_id == @account.id
    head :no_content
  end

  def provider_options
    return render_validation_error("Account is already linked") if @account.linked?

    providers = Provider::Factory.connection_configs_for_account_type(
      account_type: @account.accountable_type, family: Current.family
    ).filter_map do |config|
      next unless config[:existing_account_path].present?

      key = config[:key].to_s
      region = key.in?(%w[plaid_us plaid_eu]) ? key.delete_prefix("plaid_") : nil
      provider_key = region ? "plaid" : key
      query = { account_id: @account.id, region: region }.compact.to_query
      { name: config[:name], key: key, description: config[:description],
        path: "/provider_connections/#{provider_key}/new?#{query}" }
    end
    render json: {
      providers: providers,
      text: {
        title: I18n.t("accounts.select_provider.title"),
        description: I18n.t("accounts.select_provider.description", account_name: @account.name),
        no_providers: I18n.t("accounts.select_provider.no_providers")
      }
    }
  end

  def unlink
    Account::Lifecycle.new(@account).unlink! if @account.linked?
    render :show
  rescue ActiveRecord::RecordInvalid => e
    render_validation_error(e.record.errors.full_messages.join(", "))
  end


  private
    def family
      Current.family
    end

    def include_workspace?
      params[:include].to_s.split(",").include?("workspace")
    end

    def set_workspace_period
      @period = if params[:start_date].present? && params[:end_date].present?
        Period.custom(start_date: Date.parse(params[:start_date]), end_date: Date.parse(params[:end_date]))
      else
        key = params[:period].presence || Current.user.default_period
        case key
        when "current_month" then Period.current_month_for(Current.family)
        when "last_month" then Period.last_month_for(Current.family)
        else Period.from_key(key)
        end
      end
    rescue ArgumentError, TypeError, ActiveModel::ValidationError, Period::InvalidKeyError
      @period = Period.last_30_days
    end

    def set_lifecycle_account
      raise ActiveRecord::RecordNotFound unless valid_uuid?(params[:id])
      @account = Current.family.accounts.accessible_by(Current.user).find(params[:id])
    end

    def ensure_manageable_account
      return true if @account.permission_for(Current.user).in?([ :owner, :full_control ])

      render json: { error: "forbidden", message: "You do not have permission to manage this account" }, status: :forbidden
      false
    end


    def ensure_read_scope
      authorize_scope!(:read)
    end

    def ensure_write_scope
      authorize_scope!(:write)
    end

    def account_params
      params.require(:account).permit(
        :name, :balance, :currency, :account_type, :subtype, :opening_balance_date,
        :institution_name, :institution_domain, :notes, :exclude_from_reports,
        :enable_category_matcher,
        accountable: [
          :subtype, :tax_treatment, :year_built, :area_unit, :area_value,
          :make, :model, :year, :mileage_value, :mileage_unit,
          :available_credit, :minimum_payment, :payment_due_day, :minimum_payment_only, :apr, :annual_fee, :expiration_date,
          :rate_type, :interest_rate, :term_months, :initial_balance,
          :start_date, :down_payment, :insurance_rate, :insurance_rate_type,
          { rate_changes: %i[effective_date rate] },
          { address: %i[line1 line2 locality region country postal_code county] }
        ]
      )
    end

    # Builds the `Account#update` payload from already-permitted params. Drops
    # create-only keys (account_type/opening_balance_date) and the balance
    # (applied separately through a valuation above), keeps only the
    # accountable fields valid for this account's type, and translates the
    # flat `accountable.address` hash into Property's nested `address_attributes`.
    def slice_update_params(attrs, accountable_type)
      update_params = attrs.except(:account_type, :opening_balance_date, :balance)
      raw_accountable = update_params.delete(:accountable) || {}
      permitted = ACCOUNTABLE_ATTRIBUTES.fetch(accountable_type, [])
      accountable_attrs = raw_accountable.slice(*permitted)
      if accountable_type == "Property" && raw_accountable[:address].present?
        accountable_attrs[:address_attributes] = raw_accountable[:address].slice(
          :line1, :line2, :locality, :region, :country, :postal_code, :county
        )
      end
      update_params[:accountable_attributes] = accountable_attrs if accountable_attrs.present?
      # Account#subtype= delegates to the accountable, so a top-level subtype
      # works for every type; a nested one (native form shape) wins when both.
      update_params.delete(:subtype) if accountable_attrs.key?(:subtype)
      update_params
    end

    def property_address_params
      account_params.dig(:accountable, :address)&.to_h&.deep_symbolize_keys || {}
    end

    def parse_opening_balance_date(value)
      value.presence&.to_date || default_opening_balance_date
    rescue Date::Error
      default_opening_balance_date
    end

    def default_opening_balance_date
      Time.zone.today - 2.years
    end

    def accounts_scope
      scope = current_resource_owner.family.accounts
                                    .accessible_by(current_resource_owner)
                                    .includes(:accountable, :plaid_account, :simplefin_account, account_providers: :provider)
      include_disabled_accounts? || include_workspace? || action_name == "update" ? scope : scope.visible
    end

    def include_disabled_accounts?
      ActiveModel::Type::Boolean.new.cast(params[:include_disabled])
    end
end
