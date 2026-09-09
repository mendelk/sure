# frozen_string_literal: true

class Api::V1::AccountsController < Api::V1::BaseController
  include Pagy::Backend

  ACCOUNT_TYPES = Accountable::TYPES.index_by(&:underscore).freeze
  ACCOUNTABLE_ATTRIBUTES = {
    "Depository" => [],
    "Investment" => [],
    "Crypto" => %i[tax_treatment],
    "Property" => %i[year_built area_unit area_value],
    "Vehicle" => %i[make model year mileage_value mileage_unit],
    "OtherAsset" => [],
    "CreditCard" => %i[available_credit minimum_payment apr annual_fee expiration_date],
    "Loan" => %i[rate_type interest_rate term_months initial_balance],
    "OtherLiability" => []
  }.freeze

  before_action :ensure_read_scope, only: %i[index show]
  before_action :ensure_write_scope, only: %i[create update archive destroy]
  before_action :set_account, only: %i[update archive destroy]
  before_action :ensure_manageable_account, only: %i[update archive destroy]
  before_action :ensure_manual_account, only: %i[update archive destroy]

  helper_method :account_capabilities

  def index
    @per_page = safe_per_page_param

    @pagy, @accounts = pagy(
      accounts_scope.alphabetically,
      page: safe_page_param,
      limit: @per_page
    )

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
    update_success = false
    error_payload = nil

    ActiveRecord::Base.transaction do
      if update_params[:balance].present? && update_params[:balance].to_d != @account.balance
        result = @account.set_current_balance(update_params[:balance].to_d)
        unless result.success?
          error_payload = {
            error: "validation_failed",
            message: "Account could not be updated",
            errors: [ result.error ]
          }
          raise ActiveRecord::Rollback
        end
      end

      unless @account.update(update_params.except(:balance))
        error_payload = {
          error: "validation_failed",
          message: "Account could not be updated",
          errors: @account.errors.full_messages
        }
        raise ActiveRecord::Rollback
      end

      @account.lock_saved_attributes!
      update_success = true
    end

    unless update_success
      render json: error_payload, status: :unprocessable_entity
      return
    end

    render :show
  rescue ActionController::ParameterMissing
    # Preserve the base controller's deterministic 400 for missing params.
    raise
  rescue => e
    Rails.logger.error "AccountsController#update error: #{e.message}"
    Rails.logger.error e.backtrace.join("\n")

    render json: {
      error: "internal_server_error",
      message: "An unexpected error occurred"
    }, status: :internal_server_error
  end

  def archive
    unless confirmation_provided?
      render json: {
        error: "validation_failed",
        message: "Archive confirmation is required",
        errors: [ "Confirm must be true to archive this account" ]
      }, status: :unprocessable_entity
      return
    end

    unless @account.active?
      render json: {
        error: "validation_failed",
        message: "Only active accounts can be archived",
        errors: [ "Account is not active" ]
      }, status: :unprocessable_entity
      return
    end

    @account.disable!
    render :show
  rescue => e
    Rails.logger.error "AccountsController#archive error: #{e.message}"
    Rails.logger.error e.backtrace.join("\n")

    render json: {
      error: "internal_server_error",
      message: "An unexpected error occurred"
    }, status: :internal_server_error
  end

  def destroy
    unless confirmation_provided?
      render json: {
        error: "validation_failed",
        message: "Delete confirmation is required",
        errors: [ "Confirm must be true to delete this account" ]
      }, status: :unprocessable_entity
      return
    end

    @account.destroy_later
    render json: {
      message: "Account deleted successfully"
    }, status: :ok
  rescue => e
    Rails.logger.error "AccountsController#destroy error: #{e.message}"
    Rails.logger.error e.backtrace.join("\n")

    render json: {
      error: "internal_server_error",
      message: "An unexpected error occurred"
    }, status: :internal_server_error
  end

  private

    def set_account
      unless valid_uuid?(params[:id])
        render json: {
          error: "not_found",
          message: "Account not found"
        }, status: :not_found
        return
      end

      @account = manageable_accounts_scope.find(params[:id])
    rescue ActiveRecord::RecordNotFound
      render json: {
        error: "not_found",
        message: "Account not found"
      }, status: :not_found
    end

    # Write access to an account requires ownership or a full-control share,
    # mirroring the web account management guards. Scoping (404) already
    # guarantees the account belongs to the caller's family.
    def ensure_manageable_account
      return if performed?
      return if manageable_account?(@account)

      render json: {
        error: "forbidden",
        message: "You do not have permission to manage this account"
      }, status: :forbidden
    end

    # Core milestone covers manual accounts only. Linked accounts keep their
    # provider-managed lifecycle (unlinking defers to t_alt_fin_018).
    def ensure_manual_account
      return if performed?
      return if @account.manual?

      render json: {
        error: "validation_failed",
        message: "Only manual accounts can be managed with this endpoint",
        errors: [ "Account is linked to a provider. Unlink it before managing it as a manual account." ]
      }, status: :unprocessable_entity
    end

    def confirmation_provided?
      ActiveModel::Type::Boolean.new.cast(params[:confirm])
    end

    # Core actions the current caller may attempt on this account, advertised
    # so navigation and forms can gate themselves truthfully. Update/archive/
    # delete require a read_write credential plus ownership or a full-control
    # share; read-only credentials and shares only ever see "read".
    def account_capabilities(account)
      capabilities = [ "read" ]
      return capabilities unless account.manual?
      return capabilities unless writable_credential?
      return capabilities unless manageable_account?(account)
      return capabilities if account.pending_deletion?

      capabilities += [ "update", "delete" ]
      capabilities << "archive" if account.active?
      capabilities
    end

    def manageable_account?(account)
      account.permission_for(current_resource_owner).in?([ :owner, :full_control ])
    end

    def writable_credential?
      Array(current_scopes).map(&:to_s).include?("read_write")
    end

    def ensure_read_scope
      authorize_scope!(:read)
    end

    def ensure_write_scope
      authorize_scope!(:write)
    end

    def update_params
      params.require(:account).permit(
        :name, :balance, :currency, :subtype, :institution_name, :notes
      )
    end

    def account_params
      params.require(:account).permit(
        :name, :balance, :currency, :account_type, :subtype, :opening_balance_date,
        :institution_name, :institution_domain, :notes, :exclude_from_reports,
        :enable_category_matcher,
        accountable: [
          :tax_treatment, :year_built, :area_unit, :area_value,
          :make, :model, :year, :mileage_value, :mileage_unit,
          :available_credit, :minimum_payment, :apr, :annual_fee, :expiration_date,
          :rate_type, :interest_rate, :term_months, :initial_balance,
          { address: %i[line1 line2 locality region country postal_code county] }
        ]
      )
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
                                     .includes(:accountable, account_providers: :provider)
      include_disabled_accounts? ? scope : scope.visible
    end

    # Write lookup spans draft/active/disabled so supported actions on
    # disabled accounts (update/delete) actually work without undocumented
    # params. Pending-deletion accounts stay out and remain non-manageable.
    def manageable_accounts_scope
      current_resource_owner.family.accounts
                             .accessible_by(current_resource_owner)
                             .historical
                             .includes(:accountable, account_providers: :provider)
    end

    def include_disabled_accounts?
      ActiveModel::Type::Boolean.new.cast(params[:include_disabled])
    end
end
