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
  before_action :ensure_write_scope, only: :create

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

  private

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

    def include_disabled_accounts?
      ActiveModel::Type::Boolean.new.cast(params[:include_disabled])
    end
end
