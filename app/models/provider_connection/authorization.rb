# frozen_string_literal: true

module ProviderConnection::Authorization
  attr_writer :configuration_request_ip

  private

    def configure_enable_banking!(action, attributes)
      raise ProviderConnection::Invalid, "Connection is required" unless item
      case action
      when "banks"
        { banks: item.configuration_banks }
      when "authorize", "reauthorize"
        options = @configuration_url_options || Rails.application.routes.default_url_options
        routes = Rails.application.routes.url_helpers
        callback = if Rails.env.production?
          routes.callback_enable_banking_items_url(**options)
        else
          ENV.fetch("DEV_WEBHOOKS_URL", routes.root_url(**options)).chomp("/") + routes.callback_enable_banking_items_path
        end
        result = item.begin_configuration_authorization!(attributes, callback_url: callback,
          request_ip: @configuration_request_ip, reauthorize: action == "reauthorize")
        @item = items.find(result[:item_id]) if result[:item_id] != item.id
        result
      else
        raise ProviderConnection::Invalid, "Unknown configuration action"
      end
    end

    def configure_snaptrade_device!(action, attributes)
      raise ProviderConnection::Invalid, "SnapTrade OAuth is not configured" unless Provider::Snaptrade.oauth_configured?
      case action
      when "device_authorize"
        @item ||= items.create!(name: I18n.t("snaptrade_items.default_name"))
        payload = item.start_oauth_device_flow(scope: "read")
        ttl = payload["expires_in"].to_i
        ttl = 15.minutes unless ttl.positive?
        token = configuration_flow_encryptor.encrypt_and_sign({ "family_id" => family.id, "user_id" => user.id,
          "item_id" => item.id, "device_code" => payload.fetch("device_code") },
          expires_in: [ ttl, 1.hour ].min, purpose: "snaptrade-device-flow")
        public_data = payload.slice("user_code", "verification_uri", "verification_uri_complete", "expires_in", "interval")
        %w[verification_uri verification_uri_complete].each do |field|
          next if public_data[field].blank?
          uri = URI.parse(public_data[field])
          raise ProviderConnection::Invalid, "Invalid verification URL received" unless uri.scheme == "https" && uri.host.present? && uri.userinfo.blank?
        end
        public_data.merge("item_id" => item.id, "flow_token" => token, "status" => "pending")
      when "device_complete"
        raise ProviderConnection::Invalid, "Connection is required" unless item
        flow = configuration_flow_encryptor.decrypt_and_verify(attributes[:flow_token].to_s, purpose: "snaptrade-device-flow")
        unless flow.is_a?(Hash) && flow["family_id"] == family.id && flow["user_id"] == user.id && flow["item_id"] == item.id && flow["device_code"].present?
          raise ProviderConnection::Invalid, "Device authorization is invalid or expired"
        end
        item.complete_oauth_device_flow!(device_code: flow["device_code"])
        item.sync_later_with_follow_up
        { status: "complete", item_id: item.id }
      else
        raise ProviderConnection::Invalid, "Unknown configuration action"
      end
    rescue ActiveSupport::MessageEncryptor::InvalidMessage, URI::Error
      raise ProviderConnection::Invalid, "Device authorization is invalid or expired"
    rescue Provider::Snaptrade::AuthenticationError => error
      case error.oauth_error
      when "authorization_pending", "slow_down"
        { status: "pending", slow_down: error.oauth_error == "slow_down" }
      when "expired_token", "access_denied"
        { status: "expired", reason: error.oauth_error }
      else
        raise
      end
    end

    def configuration_flow_encryptor
      key = Rails.application.key_generator.generate_key("provider-configuration-flow", 32)
      ActiveSupport::MessageEncryptor.new(key, cipher: "aes-256-gcm", serializer: JSON)
    end
end
