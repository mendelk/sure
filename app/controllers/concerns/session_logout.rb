module SessionLogout
  extend ActiveSupport::Concern

  included do
    extend SslConfigurable
  end

  private
    # Return a navigation destination instead of issuing a response, so JSON
    # and ERB callers share the same session cleanup and federated logout.
    def logout_session(session_record, user: Current.user)
      id_token = session[:id_token_hint]
      login_provider = session[:sso_login_provider]
      oidc_identity = if login_provider.present?
        user.oidc_identities.find_by(provider: login_provider)
      else
        user.oidc_identities.first
      end

      session_record.destroy!
      session.delete(:id_token_hint)
      session.delete(:sso_login_provider)

      if oidc_identity && id_token.present?
        idp_logout_url = build_idp_logout_url(oidc_identity, id_token)
        if idp_logout_url
          SsoAuditLog.log_logout_idp!(user: user, provider: oidc_identity.provider, request: request)
          return idp_logout_url
        end
      end

      SsoAuditLog.log_logout!(user: user, request: request)
      new_session_path
    end

    def build_idp_logout_url(oidc_identity, id_token)
      provider_config = ProviderLoader.load_providers.find do |provider|
        provider[:name] == oidc_identity.provider
      end
      return nil unless provider_config

      if provider_config[:strategy] == "openid_connect" && provider_config[:issuer].present?
        begin
          discovery_url = discovery_url_for(provider_config[:issuer])
          response = Faraday.new(ssl: self.class.faraday_ssl_options).get(discovery_url) do |req|
            req.options.timeout = 5
            req.options.open_timeout = 3
          end
          return nil unless response.success?

          discovery = JSON.parse(response.body)
          end_session_endpoint = discovery["end_session_endpoint"]
          return nil unless end_session_endpoint.present?

          params = {
            id_token_hint: id_token,
            post_logout_redirect_uri: "#{request.base_url}/auth/logout/callback"
          }
          "#{end_session_endpoint}?#{params.to_query}"
        rescue Faraday::Error, JSON::ParserError, StandardError => e
          Rails.logger.warn("[SSO] Failed to fetch OIDC discovery for logout: #{e.message}")
          nil
        end
      end
    end

    def discovery_url_for(issuer)
      if issuer.end_with?("/")
        "#{issuer}.well-known/openid-configuration"
      else
        "#{issuer}/.well-known/openid-configuration"
      end
    end
end
