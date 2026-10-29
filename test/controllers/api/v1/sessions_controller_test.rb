require "test_helper"
require "base64"

class Api::V1::SessionsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @api_key = ApiKey.create!(user: @user, name: "Logout test", key: ApiKey.generate_secure_key,
      scopes: %w[read_write], source: "web")
  end

  test "logout ends only the cookie session and removes its browser registrations" do
    sign_in @user
    current_session = Current.session
    another_session = @user.sessions.create!
    foreign_session = users(:family_member).sessions.create!
    current_browser = register(current_session, "current")
    other_browser = register(another_session, "other")

    assert_difference "Session.count", -1 do
      assert_difference "WebPushSubscription.count", -1 do
        delete api_v1_session_path, params: { id: foreign_session.id, session_id: another_session.id }, as: :json
      end
    end

    assert_response :success
    assert_equal({ "redirect_url" => new_session_path }, response.parsed_body)
    refute Session.exists?(current_session.id)
    assert Session.exists?(another_session.id)
    assert Session.exists?(foreign_session.id)
    refute WebPushSubscription.exists?(current_browser.id)
    assert WebPushSubscription.exists?(other_browser.id)

    delete api_v1_session_path, as: :json
    assert_response :unauthorized
  end

  test "write API keys cannot end any browser session even when a cookie is present" do
    sign_in @user
    browser_session = Current.session

    assert_no_difference "Session.count" do
      delete api_v1_session_path, params: { id: browser_session.id }, headers: api_headers(@api_key), as: :json
    end
    assert_response :forbidden
    assert_equal "browser_session_required", response.parsed_body.fetch("error")
    assert Session.exists?(browser_session.id)

    delete api_v1_session_path, as: :json
    assert_response :success
  end

  test "read-only API keys fail the write scope requirement" do
    @api_key.update!(scopes: %w[read])
    assert_no_difference "Session.count" do
      delete api_v1_session_path, headers: api_headers(@api_key), as: :json
    end
    assert_response :forbidden
    assert_equal "insufficient_scope", response.parsed_body.fetch("error")
  end

  test "logout requires authentication" do
    delete api_v1_session_path, as: :json
    assert_response :unauthorized
  end

  test "cookie logout rejects absent and invalid CSRF tokens and accepts the real browser token" do
    sign_in @user
    browser_session_id = Current.session.id
    original = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true

    [ {}, { "X-CSRF-Token" => "invalid" } ].each do |headers|
      assert_no_difference "Session.count" do
        delete api_v1_session_path, headers: headers, as: :json
      end
      assert_response :unprocessable_entity
      assert Session.exists?(browser_session_id)
    end

    get new_session_path
    token = css_select('meta[name="csrf-token"]').first["content"]
    assert_difference "Session.count", -1 do
      delete api_v1_session_path, headers: { "X-CSRF-Token" => token }, as: :json
    end
    assert_response :success
  ensure
    ActionController::Base.allow_forgery_protection = original
  end

  private
    def api_headers(key)
      { "X-Api-Key" => key.display_key }
    end

    def register(browser_session, name)
      WebPushSubscription.register_for!(user: browser_session.user, session: browser_session,
        endpoint: "https://fcm.googleapis.com/fcm/send/#{name}",
        p256dh: Base64.urlsafe_encode64("\x04" + "\x01" * 64, padding: false),
        auth: Base64.urlsafe_encode64("\x02" * 16, padding: false))
    end
end
