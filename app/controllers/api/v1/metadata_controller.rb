# frozen_string_literal: true

class Api::V1::MetadataController < Api::V1::BaseController
  # Public contract metadata for the alternate frontend compatibility check
  # (t_alt_fnd_015). The BFF reads this during readiness and session
  # establishment and rejects incompatible Rails deployments before users
  # encounter arbitrary request failures. Public by default — version and
  # capability tokens carry no family data — with optional validation of a
  # presented API key (see `reject_invalid_api_key!`).
  skip_before_action :authenticate_request!
  skip_before_action :check_api_key_rate_limit
  skip_before_action :log_api_access

  # Optional deployment-credential validation: the endpoint stays public so
  # version checks work without credentials, but a presented API key that is
  # unknown or inactive is rejected with 401. The BFF always attaches its
  # deployment key when configured, so an invalid SURE_API_KEY reports the
  # `unauthenticated` compatibility state instead of a misleading `ready`.
  before_action :reject_invalid_api_key!

  # Semver contract version served by this Rails build. The web BFF supports
  # major version 1; bump MAJOR for breaking contract changes.
  CONTRACT_VERSION = "1.0.0"

  # Capability tokens the alternate frontend requires for session
  # establishment. Removing or renaming one is a breaking change.
  CAPABILITIES = %w[auth.login auth.refresh auth.logout].freeze

  def show
    render json: {
      api_version: CONTRACT_VERSION,
      capabilities: CAPABILITIES
    }
  end

  private

    def reject_invalid_api_key!
      api_key_value = request.headers["X-Api-Key"]
      return if api_key_value.blank?

      api_key = ApiKey.find_by_value(api_key_value)
      return if api_key&.active?

      render json: { error: "unauthorized", message: "API key is invalid or inactive" }, status: :unauthorized
    end
end
