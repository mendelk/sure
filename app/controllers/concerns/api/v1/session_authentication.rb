# Session-cookie authentication for first-party browser clients calling the
# /api/v1 namespace. Complements API-key/OAuth auth in Api::V1::BaseController:
# a signed-in browser session authenticates without an API key, while external
# clients keep using their credentials.
#
# Writes: unsafe-method session requests keep Rails forgery protection
# (Api::V1::BaseController#session_write_request?), so the SPA must present
# the standard CSRF token; scope checks then admit read_write. External
# token-based clients are unaffected.
#
# CSRF: the SPA fetches with `credentials: "same-origin"` and sends the
# `X-CSRF-Token` header on non-GET requests.
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
