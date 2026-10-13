# frozen_string_literal: true

# SPA property wizard backend. The manual wizard (overview → balances →
# address) keeps PropertiesController's create→balances→address→activate
# semantics; the AVM branch preserves the signed-token replay protection
# (lookup mints a family-scoped, expiring token; confirm rebuilds everything
# from the token payload and never trusts user-editable fields).
class Api::V1::PropertiesController < Api::V1::BaseController
  before_action :ensure_read_scope, only: %i[form_options avm_providers]
  before_action :ensure_write_scope, only: %i[create update_address avm_lookup avm_confirm]
  before_action :set_property, only: %i[update_address]

  # GET /api/v1/properties/form_options
  # Subtype/area-unit/address option data for the SPA property wizard,
  # translated server-side so the SPA never hardcodes option lists.
  def form_options
    render_json({
      subtypes: Property::SUBTYPES.keys.map do |subtype|
        {
          value: subtype,
          label: Property.long_subtype_label_for(subtype),
          short_label: Property.short_subtype_label_for(subtype)
        }
      end,
      area_units: [
        { value: "sqft", label: I18n.t("properties.overview_fields.square_feet") },
        { value: "sqm", label: I18n.t("properties.overview_fields.square_meters") }
      ],
      avm_providers: configured_avm_providers.map do |provider_key|
        { value: provider_key.to_s, label: I18n.t("properties.avm_providers.#{provider_key}") }
      end,
      currencies: currency_options,
      default_currency: family.primary_currency_code
    })
  end

  # GET /api/v1/properties/avm_providers
  def avm_providers
    render_json({
      providers: configured_avm_providers.map do |provider_key|
        { value: provider_key.to_s, label: I18n.t("properties.avm_providers.#{provider_key}") }
      end
    })
  end

  # POST /api/v1/properties
  # Step 1 of the manual wizard: creates the draft account with a zero
  # balance (matching PropertiesController#create) and returns the account
  # id the SPA navigates to for the balances step.
  def create
    @account = family.accounts.build(
      property_create_params.merge(
        balance: 0,
        status: "draft",
        owner: current_resource_owner,
        currency: property_create_params[:currency].presence || family.currency,
        accountable: Property.new,
      ),
    )
    @account.save!
    @account.auto_share_with_family! if family.share_all_by_default?

    render json: { id: @account.id, status: @account.status }, status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: {
      error: "validation_failed",
      message: e.record.errors.full_messages.to_sentence.presence || e.message,
      errors: e.record.errors.full_messages
    }, status: :unprocessable_entity
  end

  # PATCH /api/v1/properties/:id/address
  # Final wizard step (and address edit for active accounts): saves the
  # address, then activates a draft account — mirroring
  # PropertiesController#update_address, minus the HTML redirect.
  def update_address
    if @account.property.update(address_params)
      @account.activate! if @account.draft?
      render json: { id: @account.id, status: @account.status }
    else
      render json: {
        error: "validation_failed",
        message: @account.property.errors.full_messages.to_sentence.presence ||
          I18n.t("properties.address.save", default: "Unable to update address. Please check the required fields."),
        errors: @account.property.errors.full_messages
      }, status: :unprocessable_entity
    end
  end

  # POST /api/v1/properties/avm_lookup
  # AVM step 1: spends one provider request, then returns the fetched data
  # plus a signed preview token. Creates nothing.
  def avm_lookup
    provider_key = params[:avm_provider].to_s

    unless configured_avm_providers.map(&:to_s).include?(provider_key)
      return render_validation_error(I18n.t("providers.property_valuation.not_configured"))
    end

    importer = Property::AvmImport.new(
      family: family,
      owner: current_resource_owner,
      provider_key: provider_key,
      name: params.dig(:account, :name),
      address_attributes: avm_address_params.to_h.symbolize_keys
    )

    preview = importer.lookup
    token = avm_preview_verifier.generate(
      {
        "provider_key" => provider_key,
        "name" => params.dig(:account, :name),
        "address" => avm_address_params.to_h,
        "data" => preview.to_h.transform_values(&:to_s)
      },
      expires_in: 1.hour,
      purpose: avm_preview_token_purpose
    )

    render json: {
      provider_key: provider_key,
      preview: {
        valuation: preview.valuation.to_s,
        currency: preview.currency,
        property_type: preview.property_type,
        year_built: preview.year_built,
        area_value: preview.area_value,
        area_unit: preview.area_unit
      },
      preview_token: token
    }
  rescue Property::AvmImport::Error => e
    render json: {
      error: "validation_failed",
      message: e.message,
      errors: [ e.message ]
    }, status: :unprocessable_entity
  end

  # POST /api/v1/properties/avm_confirm
  # AVM step 2: verifies the signed preview token (proving the lookup ran
  # and spent its provider request) and creates the active account from the
  # token payload. Nothing user-editable is trusted — a direct confirm POST
  # with fabricated data fails verification. No provider request is made.
  def avm_confirm
    payload = verify_avm_preview_token!

    importer = Property::AvmImport.new(
      family: family,
      owner: current_resource_owner,
      provider_key: payload["provider_key"],
      name: payload["name"],
      address_attributes: payload["address"].symbolize_keys
    )

    @account = importer.create_account(avm_data_from_payload(payload))

    render json: { id: @account.id, status: @account.status }, status: :created
  rescue Property::AvmImport::Error => e
    render json: {
      error: "validation_failed",
      message: e.message,
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

    def family
      current_resource_owner.family
    end

    def accounts_scope
      family.accounts.accessible_by(current_resource_owner)
    end

    def set_property
      unless self.class.valid_uuid?(params[:id])
        render json: { error: "not_found", message: "Account not found" }, status: :not_found
        return
      end

      @account = accounts_scope.find(params[:id])
      unless @account.property?
        render json: { error: "not_found", message: "Account not found" }, status: :not_found
        return
      end

      require_manageable!(@account)
    end

    def require_manageable!(account)
      return true if account.permission_for(current_resource_owner).in?([ :owner, :full_control ])

      render json: { error: "forbidden", message: I18n.t("accounts.not_authorized") }, status: :forbidden
      false
    end

    def property_create_params
      params.require(:account).permit(
        :name, :currency, :institution_name, :institution_domain, :notes,
        accountable_attributes: [ :subtype, :year_built, :area_unit, :area_value ]
      )
    end

    def address_params
      params.require(:property)
            .permit(address_attributes: [ :line1, :line2, :locality, :region, :country, :postal_code, :county ])
    end

    def avm_address_params
      params.require(:account).require(:address).permit(:line1, :locality, :region, :postal_code)
    end

    def avm_preview_verifier
      Rails.application.message_verifier(:avm_preview)
    end

    # Scoping the token's purpose to the family means a token minted in one
    # family's session can't be replayed to seed a property in another —
    # a purpose mismatch fails verification just like a bad signature.
    def avm_preview_token_purpose
      "avm_preview/family/#{family.id}"
    end

    def verify_avm_preview_token!
      avm_preview_verifier.verify(params[:avm_preview_token].to_s, purpose: avm_preview_token_purpose)
    rescue ActiveSupport::MessageVerifier::InvalidSignature
      raise Property::AvmImport::Error.new(I18n.t("providers.property_valuation.preview_expired"))
    end

    # Rebuilds the valuation data from the signed preview payload (values
    # were stringified for serialization; blanks were nil).
    def avm_data_from_payload(payload)
      raw = payload["data"] || {}

      Provider::PropertyValuationConcept::PropertyValuation.new(
        valuation: raw["valuation"].to_d,
        currency: raw["currency"].presence || "USD",
        property_type: raw["property_type"].presence,
        year_built: raw["year_built"].presence&.to_i,
        area_value: raw["area_value"].presence&.to_i,
        area_unit: raw["area_unit"].presence || "sqft"
      )
    end

    def configured_avm_providers
      registry = Provider::Registry.for_concept(:property_valuations)
      registry.provider_keys.select { |key| registry.get_provider(key).present? }
    end

    # Same list the native currency picker offers for this family.
    def currency_options
      family.enabled_currency_codes.filter_map do |code|
        currency = Money::Currency.new(code)
        { value: currency.iso_code, label: "#{currency.name} (#{currency.iso_code})" }
      rescue Money::Currency::UnknownCurrencyError, ArgumentError
        nil
      end
    end
end
