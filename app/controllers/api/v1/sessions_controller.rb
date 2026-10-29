class Api::V1::SessionsController < Api::V1::BaseController
  include SessionLogout

  before_action :ensure_write_scope
  before_action :require_browser_session!

  def destroy
    # Never accept a session ID: API credentials do not identify a browser
    # device, and only the authenticated cookie's session may be ended here.
    destination = logout_session(Current.session, user: Current.session.user)
    cookies.delete(:session_token)
    reset_session
    render_json({ redirect_url: destination })
  end

  private
    def require_browser_session!
      return if @authentication_method == :session && Current.session&.persisted?

      render_json({ error: "browser_session_required", message: "This operation requires an authenticated browser session" }, status: :forbidden)
    end
end
