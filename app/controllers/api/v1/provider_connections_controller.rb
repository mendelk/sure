# frozen_string_literal: true

class Api::V1::ProviderConnectionsController < Api::V1::BaseController
  before_action :ensure_read_scope
  before_action :ensure_write_scope, except: %i[index show form_options setup connections]

  rescue_from StandardError, with: :provider_failure
  rescue_from ProviderConnection::Forbidden, with: :provider_forbidden
  rescue_from ProviderConnection::Invalid, ActiveRecord::RecordInvalid, ArgumentError, Date::Error, KeyError,
    URI::InvalidURIError, Provider::Wise::WiseError, Provider::Sophtron::Error,
    Provider::Simplefin::SimplefinError, Provider::TradeRepublicClient::Error, Plaid::ApiError,
    Provider::Snaptrade::Error, Provider::EnableBanking::EnableBankingError,
    ActionController::InvalidAuthenticityToken, with: :provider_invalid
  rescue_from ProviderConnection::Conflict, with: :provider_conflict
  rescue_from ActiveRecord::RecordNotFound, with: :handle_not_found

  def index
    @provider_connections = ProviderConnectionStatus.for_family(current_resource_owner.family)
    render :index
  end

  def form_options
    resource.authorize_manage!
    render_json({ data: resource.configuration })
  end

  def show
    render_json({ data: { connection: resource.status, configuration: resource.configuration, setup: resource.account_setup } })
  end

  def create
    resource.authorize_manage!
    item = resource.create!(attributes)
    render_json({ data: { id: item.id, provider: resource.key } }, status: :created)
  end

  def update
    resource.authorize_manage!
    resource.update!(attributes)
    render_json({ data: { id: resource.item.id, provider: resource.key } })
  end

  def destroy
    render_json({ data: resource.remove! }, status: :accepted)
  end

  def sync
    render_json({ data: resource.sync!(balances_only: ActiveModel::Type::Boolean.new.cast(attributes["balances_only"])) }, status: :accepted)
  end

  def cancel_sync
    render_json({ data: resource.cancel_sync! }, status: :accepted)
  end

  def setup
    resource.authorize_manage!
    render_json({ data: resource.account_setup })
  end

  def complete_setup
    resource.authorize_manage!
    render_json({ data: resource.complete_setup!(attributes) })
  end

  def link
    resource.authorize_manage!
    render_json({ data: resource.link_existing!(attributes) })
  end

  def configure
    resource.authorize_manage!
    render_json({ data: resource.configure_action!(attributes.fetch("action"), attributes.except("action")) })
  end

  def dismiss_replacement_suggestion
    render_json({ data: resource.dismiss_replacement_suggestion!(attributes) })
  end

  def connections
    render_json({ data: resource.connections })
  end

  def remove_connection
    render_json({ data: resource.remove_connection!(params[:authorization_id]) })
  end

  private
    def resource
      @resource ||= ProviderConnection.new(
        family: current_resource_owner.family,
        user: current_resource_owner,
        provider: params[:provider],
        id: params[:id]
      ).tap do |connection|
        connection.configuration_url_options = { host: request.host, protocol: request.protocol, port: request.optional_port }
        connection.configuration_request_ip = request.remote_ip
      end
    end

    def attributes
      # Each domain operation validates its explicitly supported attributes;
      # path/query parameters never become configuration assignments.
      body = request.request_parameters
      raise ProviderConnection::Invalid, "Provider parameters must be an object" unless body.is_a?(Hash)
      body.deep_stringify_keys
    end

    def provider_forbidden(error)
      render_json({ error: "forbidden", message: error.message }, status: :forbidden)
    end

    def provider_conflict(error)
      render_json({ error: "conflict", message: error.message }, status: :conflict)
    end

    def provider_invalid(error)
      message = case error
      when ProviderConnection::Invalid then error.message
      when ActiveRecord::RecordInvalid then "Provider configuration is invalid"
      else "Invalid provider request"
      end
      render_json({ error: "invalid_request", message: message }, status: :unprocessable_entity)
    end

    def provider_failure(error)
      DebugLogEntry.capture(
        category: "provider_sync_error", level: "error",
        message: "Provider management failed (#{error.class.name})",
        source: self.class.name, provider_key: params[:provider],
        family: current_resource_owner&.family
      )
      render_json({ error: "internal_server_error", message: "An unexpected error occurred" }, status: :internal_server_error)
    end
end
