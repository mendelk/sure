# frozen_string_literal: true

module ProviderConnection::Configuration
  extend ActiveSupport::Concern
  include ProviderConnection::Authorization

  attr_writer :configuration_url_options

  # This is an input allowlist, not a list of model attributes to serialize.
  # Credentials are write-only, including identifiers encrypted by a provider.
  CONFIGURATION_FIELDS = {
    "financekit" => %w[enrollment_id protocol_version consent replaces_connection_id],
    "akahu" => %w[name sync_start_date app_token user_token],
    "up" => %w[name sync_start_date access_token],
    "monobank" => %w[name sync_start_date access_token],
    "fio" => %w[name sync_start_date token],
    "plaid" => %w[name public_token region],
    "simplefin" => %w[setup_token sync_start_date],
    "lunchflow" => %w[name sync_start_date api_key base_url],
    "enable_banking" => %w[name sync_start_date country_code application_id client_certificate],
    "coinbase" => %w[name sync_start_date api_key api_secret],
    "binance" => %w[name sync_start_date api_key api_secret],
    "kraken" => %w[name sync_start_date api_key api_secret],
    "coinspot" => %w[name sync_start_date api_key api_secret],
    "onchain_wallet" => %w[name sync_start_date etherscan_api_key],
    "coinstats" => %w[name sync_start_date api_key],
    "snaptrade" => %w[name],
    "ibkr" => %w[name query_id token],
    "mercury" => %w[name sync_start_date token base_url],
    "brex" => %w[name sync_start_date token base_url],
    "sophtron" => %w[name sync_start_date user_id access_key base_url],
    "indexa_capital" => %w[name sync_start_date api_token username document password],
    "trading212" => %w[api_key api_secret environment currency],
    "trade_republic" => %w[phone_number pin currency login_method],
    "questrade" => %w[name sync_start_date refresh_token],
    "redbark" => %w[name sync_start_date api_key],
    "wise" => %w[name sync_start_date token profile_id import_all_history]
  }.freeze
  SECRET_FIELDS = %w[app_token user_token personal_access_token access_token token public_token setup_token api_key api_secret etherscan_api_key query_id user_id access_key api_token password client_certificate refresh_token pin].freeze
  NO_INITIAL_SYNC = %w[enable_banking coinstats indexa_capital sophtron snaptrade onchain_wallet trade_republic financekit].freeze

  def configuration
    authorize_manage!
    {
      provider: key, item_id: item&.id, name: Provider::Metadata.for(key)[:name] || key.humanize,
      fields: configuration_field_names.map { |field| configuration_field(field) },
      account_types: configuration_account_types,
      authorization: configuration_authorization,
      actions: configuration_actions
    }
  end

  def create!(attributes)
    authorize_manage!
    raise ProviderConnection::Invalid, "Connection already exists" if item

    attrs = configuration_attributes(attributes)
    case key
    when "plaid"
      region = plaid_region!(attrs["region"])
      raise ProviderConnection::Invalid, "Public token is required" if attrs["public_token"].blank?
      @item = family.create_plaid_item!(public_token: attrs["public_token"], item_name: attrs["name"].presence || "Plaid", region: region, owner: user)
    when "fio"
      @item = family.create_fio_item!(token: attrs["token"], item_name: attrs["name"].presence, sync_start_date: attrs["sync_start_date"])
    when "onchain_wallet"
      @item = family.create_onchain_wallet_item!
      item.update!(attrs) if attrs.any?
    when "simplefin"
      raise ProviderConnection::Invalid, "Setup token is required" if attrs["setup_token"].blank?
      @item = family.create_simplefin_item!(setup_token: attrs["setup_token"], item_name: "SimpleFIN Connection", sync_start_date: attrs["sync_start_date"])
    when "wise"
      @item = create_wise_configuration!(attrs)
    when "financekit"
      @item = Financekit::Enrollment.create!(user, attrs).item
    else
      login_method = attrs.delete("login_method")
      @item = items.build(attrs)
      item.name = "#{Provider::Metadata.for(key)[:name] || key.humanize} Connection" if item.respond_to?(:name=) && item.name.blank?
      item.currency = family.currency if %w[trading212 trade_republic].include?(key) && item.currency.blank?
      if key == "trade_republic"
        raise ProviderConnection::Invalid, "PIN is required" if login_method != "qr" && item.pin.blank?
        item.status = :requires_update if login_method == "qr"
      end
      item.validate_api_key! if key == "coinstats"
      item.save!
      defaults = "set_#{key}_institution_defaults!"
      item.public_send(defaults) if item.respond_to?(defaults)
      item.verify_and_provision_customer! if key == "sophtron"
      item.start_configuration_login!(qr: login_method == "qr", pin: item.pin) if key == "trade_republic"
      item.sync_later unless NO_INITIAL_SYNC.include?(key)
    end
    item
  end

  def update!(attributes)
    authorize_manage!
    raise ProviderConnection::Invalid, "Connection is required" unless item
    if key == "financekit"
      action = attributes.to_h.with_indifferent_access[:action]
      raise ProviderConnection::Invalid, "Use activate or repair for a publisher connection" unless %w[activate repair].include?(action)
      configure_action!(action, {})
      return item
    end

    attrs = configuration_attributes(attributes)
    if key == "simplefin" && attrs["setup_token"].present?
      URI.parse(Base64.decode64(attrs.delete("setup_token")))
      SimplefinConnectionUpdateJob.perform_later(family_id: family.id, old_simplefin_item_id: item.id, setup_token: attributes.to_h.with_indifferent_access[:setup_token])
    else
      attrs.delete("setup_token")
    end
    if key == "plaid"
      attrs.except!("public_token", "region")
    end
    attrs.delete("profile_id") if key == "wise"
    attrs.delete("login_method")
    SECRET_FIELDS.each { |field| attrs.delete(field) if attrs.key?(field) && attrs[field].blank? }
    if key == "indexa_capital" && %w[username document password].all? { |field| attrs[field].present? } && attrs["api_token"].blank?
      attrs["api_token"] = nil
    end
    reauthenticate = key == "trade_republic" && ((attrs["phone_number"].present? && attrs["phone_number"] != item.phone_number) || attrs["pin"].present?)
    raise ProviderConnection::Invalid, "PIN is required" if reauthenticate && attrs["pin"].blank?
    attrs["status"] = :good if %w[ibkr trading212].include?(key) ||
      (key == "fio" && attrs["token"].present?) || (key == "questrade" && attrs["refresh_token"].present?) || (key == "redbark" && attrs["api_key"].present?)
    if key == "fio" && (attrs["token"].present? || (attrs.key?("sync_start_date") && attrs["sync_start_date"].to_s != item.sync_start_date.to_s))
      attrs["history_unlock_required_at"] = nil
    end
    item.assign_attributes(attrs)
    item.validate_api_key! if key == "coinstats" && attrs["api_key"].present?
    if key == "brex"
      unless BrexItem::AccountFlow.update_item_with_cache_expiration(item, family: family, attributes: attrs.symbolize_keys)
        raise ActiveRecord::RecordInvalid, item
      end
    else
      item.save!
      Rails.cache.delete("mercury_accounts_#{family.id}_#{item.id}") if key == "mercury" && (attrs.key?("token") || attrs.key?("base_url"))
    end
    item.verify_and_provision_customer! if key == "sophtron"
    item.start_configuration_login!(pin: attrs["pin"]) if reauthenticate
    item.sync_later if %w[fio ibkr trading212].include?(key) && !item.syncing?
    item
  end

  def configure_action!(action, attributes = {})
    authorize_manage!
    attrs = attributes.to_h.with_indifferent_access
    action = action.to_s
    case key
    when "enable_banking"
      configure_enable_banking!(action, attrs)
    when "snaptrade"
      configure_snaptrade_device!(action, attrs)
    when "plaid"
      raise ProviderConnection::Invalid, "Unknown configuration action" unless action == "link_token"
      plaid_configuration_link_token!(attrs)
    when "trade_republic"
      raise ProviderConnection::Invalid, "Connection is required" unless item
      case action
      when "initiate_login" then item.start_configuration_login!(pin: attrs[:pin])
      when "initiate_qr_login" then item.start_configuration_login!(qr: true)
      when "complete_login" then item.complete_configuration_login!(code: attrs[:code])
      when "poll_login" then item.complete_configuration_login!(poll: true)
      when "poll_qr_login" then item.complete_configuration_login!(qr: true, poll: true)
      when "cancel_qr_login" then item.update!(pending_login_state: nil, status: :requires_update); { status: "cancelled" }
      else raise ProviderConnection::Invalid, "Unknown configuration action"
      end
    when "sophtron"
      raise ProviderConnection::Invalid, "Connection is required" unless item
      item.configure_connection!(action, attrs)
    when "wise"
      case action
      when "profiles"
        token = attrs[:token].to_s.strip
        raise ProviderConnection::Invalid, "Token is required" if token.blank?
        { profiles: Provider::Wise.new(token, base_url: Rails.configuration.x.wise.base_url).get_profiles }
      when "generate_sca_keypair"
        raise ProviderConnection::Invalid, "Connection is required" unless item
        item.generate_sca_keypair!
        { public_key: item.sca_public_key }
      else raise ProviderConnection::Invalid, "Unknown configuration action"
      end
    when "financekit"
      raise ProviderConnection::Invalid, "Connection is required" unless item
      case action
      when "activate" then { credential: item.activate! }
      when "repair" then { credential: item.repair! }
      else raise ProviderConnection::Invalid, "Unknown configuration action"
      end
    when "onchain_wallet", "coinstats"
      configure_wallet_action!(action, attrs)
    else
      raise ProviderConnection::Invalid, "Unknown configuration action"
    end
  end

  private

    def configuration_attributes(attributes)
      attributes.to_h.stringify_keys.slice(*CONFIGURATION_FIELDS.fetch(key)).tap do |attrs|
        %w[token api_key api_secret access_token personal_access_token refresh_token app_token user_token].each do |field|
          attrs[field] = attrs[field].to_s.strip if attrs[field].present?
        end
        if attrs["sync_start_date"].present?
          begin
            Date.iso8601(attrs["sync_start_date"].to_s)
          rescue Date::Error
            raise ProviderConnection::Invalid, "Sync start date must be an ISO 8601 date"
          end
        end
        if key == "trading212" && attrs["environment"].present? && !Trading212Item.environments.key?(attrs["environment"])
          raise ProviderConnection::Invalid, "Invalid Trading 212 environment"
        end
      end
    end

    def configuration_field_names
      names = CONFIGURATION_FIELDS.fetch(key)
      names = names - %w[enrollment_id protocol_version consent replaces_connection_id] if key == "financekit"
      names = names - %w[profile_id] if key == "wise" && item
      names = names - %w[login_method] if key == "trade_republic" && item
      names
    end

    def configuration_field(field)
      secret = SECRET_FIELDS.include?(field)
      type = if secret
        field == "client_certificate" ? "textarea" : "password"
      elsif field == "sync_start_date"
        "date"
      elsif field == "import_all_history"
        "checkbox"
      elsif %w[environment region login_method].include?(field)
        "select"
      else
        "text"
      end
      optional_credentials = %w[etherscan_api_key api_token password public_token pin]
      required_input = secret && !optional_credentials.include?(field)
      required_input ||= key == "wise" && field == "profile_id"
      required_input ||= key == "enable_banking" && %w[country_code application_id].include?(field)
      result = { name: field, label: field.humanize, type: type, required: !item && required_input }
      if secret
        result[:configured] = item.present? && item.respond_to?(field) && item.public_send(field).present?
      else
        result[:value] = configuration_public_value(field) if item&.respond_to?(field)
        result[:value] ||= family.currency if field == "currency"
      end
      choices = case field
      when "environment" then %w[live demo]
      when "region" then %w[us eu]
      when "login_method" then %w[pin qr]
      end
      result[:options] = choices.map { |value| { label: value.humanize, value: value } } if choices
      result[:value] ||= choices.first if choices
      result
    end

    def configuration_public_value(field)
      value = item.public_send(field)
      return value unless field == "base_url" && value.present?

      uri = URI.parse(value)
      uri.userinfo = nil
      uri.query = nil
      uri.fragment = nil
      uri.to_s
    rescue URI::Error
      nil
    end

    def configuration_account_types
      return %w[Depository CreditCard Investment Crypto Loan OtherAsset] if key == "snaptrade"
      adapter = "Provider::#{key.camelize}Adapter".constantize
      types = adapter.supported_account_types
      key == "simplefin" ? (types + %w[Crypto OtherAsset]).uniq : types
    end

    def configuration_authorization
      case key
      when "snaptrade"
        routes = Rails.application.routes.url_helpers
        flows = []
        if Provider::Snaptrade.authorization_code_configured?
          flows << { name: "authorization_code", href: routes.oauth_authorize_snaptrade_items_path(item_id: item&.id) }
        end
        if Provider::Snaptrade.oauth_configured?
          flows << { name: "device_code", action: "device_authorize" }
        end
        portal = item&.oauth_configured? ? routes.connect_snaptrade_item_path(item) : nil
        authorization_href = flows.find { |flow| flow[:href] }&.fetch(:href)
        { kind: "oauth", configured: Provider::Snaptrade.oauth_configured?, href: portal || authorization_href,
          authorization_href: authorization_href, flows: flows, portal_href: portal }
      when "enable_banking"
        { kind: "oauth", configured: item&.credentials_configured? || false, action: "banks",
          session_valid: item&.session_valid? || false, reauthorize_action: item&.aspsp_name.present? ? "reauthorize" : nil }
      when "financekit"
        { kind: "native", enrollment_endpoint: "/api/v1/financekit/connections", protocol_version: Financekit::VERSION }
      when "plaid"
        { kind: "plaid", action: "link_token", regions: %w[us eu] }
      when "trade_republic"
        { kind: "challenge", stage: item&.login_stage, pending: item&.pending_login_state.present? }
      when "sophtron"
        { kind: "challenge", pending: item&.current_job_id.present? }
      when "indexa_capital"
        { kind: "credentials", credential_modes: [ { fields: %w[api_token] }, { fields: %w[username document password] } ] }
      else
        { kind: "credentials" }
      end
    end

    def configuration_actions
      definitions = case key
      when "plaid" then { "link_token" => %w[region accountable_type add_accounts] }
      when "enable_banking" then { "banks" => [], "authorize" => %w[aspsp_name psu_type new_connection], "reauthorize" => [] }
      when "snaptrade" then { "device_authorize" => [], "device_complete" => %w[flow_token] }
      when "trade_republic" then { "initiate_login" => %w[pin], "initiate_qr_login" => [], "complete_login" => %w[code], "poll_login" => [], "poll_qr_login" => [], "cancel_qr_login" => [] }
      when "sophtron" then { "institutions" => %w[query], "connect_institution" => %w[institution_id institution_name bank_username bank_password new_connection], "connection_status" => [], "submit_mfa" => %w[mfa_type security_answers token_choice token_input captcha_input] }
      when "wise" then { "profiles" => %w[token], "generate_sca_keypair" => [] }
      when "onchain_wallet" then { "preview_wallet" => %w[address chain], "link_wallet" => %w[address chain assets], "review_tokens" => %w[address chain], "update_tokens" => %w[address chain assets], "disconnect_wallet" => %w[address chain], "disconnect_asset" => %w[provider_account_id], "enable_crypto_prices" => [] }
      when "coinstats" then { "options" => [], "link_wallet" => %w[address blockchain], "link_exchange" => %w[exchange_connection_id name] }
      when "financekit" then { "activate" => [], "repair" => [] }
      else {}
      end
      definitions.map do |action, fields|
        { name: action, label: action.humanize, method: "POST", fields: fields.map { |field| configuration_action_field(field) } }
      end
    end

    def configuration_action_field(field)
      choices = case field
      when "chain" then Onchain::Chains.all.map { |chain| { value: chain.key, label: chain.label } }
      when "mfa_type" then %w[security_answer token_choice token_input verify_phone captcha].map { |value| { value: value, label: value.humanize } }
      when "region" then %w[us eu].map { |value| { value: value, label: value.upcase } }
      when "psu_type" then %w[personal business].map { |value| { value: value, label: value.humanize } }
      when "accountable_type" then configuration_account_types.map { |value| { value: value, label: value.titleize } }
      end
      type = if choices
        "select"
      elsif %w[add_accounts new_connection].include?(field)
        "checkbox"
      elsif %w[pin code bank_password security_answers token_input captcha_input token flow_token].include?(field)
        "password"
      else
        "text"
      end
      { name: field, label: field.humanize, type: type }.tap { |result| result[:options] = choices if choices }
    end

    def plaid_region!(value)
      region = value.presence || "us"
      raise ProviderConnection::Invalid, "Invalid Plaid region" unless %w[us eu].include?(region)
      allowed = region == "eu" ? family.can_connect_plaid_eu? : family.can_connect_plaid_us?
      raise ProviderConnection::Invalid, "Plaid is not configured for this region" unless allowed
      region
    end

    def plaid_configuration_link_token!(attrs)
      region = item ? item.plaid_region : plaid_region!(attrs[:region])
      routes = Rails.application.routes.url_helpers
      options = @configuration_url_options || Rails.application.routes.default_url_options
      webhook = family.plaid_webhooks_url(region: region, url_options: options)
      redirect_url = routes.accounts_url(**options)
      if item
        token = item.get_update_link_token(webhooks_url: webhook, redirect_url: redirect_url,
          account_selection_enabled: item.us? && ActiveModel::Type::Boolean.new.cast(attrs[:add_accounts]))
      else
        account_type = attrs[:accountable_type].presence || "Depository"
        raise ProviderConnection::Invalid, "Unsupported account type" unless configuration_account_types.include?(account_type)
        token = family.get_link_token(webhooks_url: webhook, redirect_url: redirect_url, accountable_type: account_type, region: region.to_sym)
      end
      raise ProviderConnection::Invalid, "Plaid is not configured" if token.blank?
      { link_token: token }
    end

    def create_wise_configuration!(attrs)
      token = attrs["token"].to_s.strip
      raise ProviderConnection::Invalid, "Token and profile are required" if token.blank? || attrs["profile_id"].blank?
      profile = Provider::Wise.new(token, base_url: Rails.configuration.x.wise.base_url).get_profiles.find { |candidate| candidate["id"].to_s == attrs["profile_id"].to_s }
      raise ProviderConnection::Invalid, "Profile does not belong to this token" unless profile
      profile_type = profile["type"] == "business" ? "business" : "personal"
      family.create_wise_item!(token: token, profile_id: profile.fetch("id").to_s, profile_type: profile_type,
        item_name: attrs["name"].presence || "Wise #{profile_type.humanize}", sync_start_date: attrs["sync_start_date"],
        import_all_history: ActiveModel::Type::Boolean.new.cast(attrs["import_all_history"]) || false)
    end
end
