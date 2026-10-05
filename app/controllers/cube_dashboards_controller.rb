class CubeDashboardsController < ApplicationController
  wrap_parameters false

  def query
    payload = request.request_parameters
    analytics = CubeAnalytics.new(Current.user)
    if payload.keys == [ "catalog" ] && payload["catalog"] == true
      render json: analytics.catalog
    elsif payload.keys == [ "query" ]
      render json: analytics.call(payload["query"])
    else
      render json: { error: I18n.t("cube_dashboards.errors.invalid_request"), code: "invalid_request" }, status: :unprocessable_entity
    end
  rescue CubeAnalytics::InvalidQuery => error
    render json: { error: error.message, code: error.code }, status: :unprocessable_entity
  rescue CubeAnalytics::Unavailable => error
    render json: { error: error.message, code: error.code }, status: :service_unavailable
  rescue CubeAnalytics::Unauthorized => error
    render json: { error: error.message, code: error.code }, status: :unauthorized
  end
end
