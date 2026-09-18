# Session-cookie authentication for first-party browser clients calling the
# /api/v1 namespace. Complements API-key/OAuth auth in Api::V1::BaseController:
# a signed-in browser session authenticates without an API key, while external
# clients keep using their credentials. Read-only by design — the browser SPA
# has no need to mutate financial data through the v1 API, and session cookies
# must never carry write scope.
#
# CSRF: the SPA fetches with `credentials: "same-origin"` and standard
# form/JSON requests, so Rails' forgery protection still applies to any
# non-GET request. These endpoints are GET-only.
module Api::V1::SessionAuthentication
  extend ActiveSupport::Concern

  private
    # Attempt browser-session authentication when no API credential is
    # present. Runs after the standard OAuth/API-key attempt has failed.
    def authenticate_session
      return false if performed?

      session_record = find_session_by_cookie
      return false unless session_record

      Current.session = session_record
      @current_user = Current.user
      @authentication_method = :session
      true
    end
end