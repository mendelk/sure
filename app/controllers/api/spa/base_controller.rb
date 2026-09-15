class Api::Spa::BaseController < ApplicationController
  before_action :force_json_format

  private
    def force_json_format
      request.format = :json
    end

    def authenticate_user!
      if session_record = find_session_by_cookie
        Current.session = session_record
      else
        render json: {
          error: "unauthorized",
          message: "An authenticated browser session is required"
        }, status: :unauthorized
      end
    end
end
