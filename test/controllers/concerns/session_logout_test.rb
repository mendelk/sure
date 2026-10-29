require "test_helper"

class SessionLogoutTest < ActiveSupport::TestCase
  class LogoutHarness
    include SessionLogout

    attr_reader :session, :request

    def initialize(session = {})
      @session = session
      @request = OpenStruct.new(base_url: "https://sure.example.com")
    end

    def new_session_path
      "/sessions/new"
    end

    def logout(record, user)
      logout_session(record, user: user)
    end
  end

  setup do
    @user = users(:family_admin)
    @session = @user.sessions.create!
  end

  test "local logout clears SSO state and audits the real user" do
    harness = LogoutHarness.new(id_token_hint: "stale-token", sso_login_provider: "missing-provider", other: "retained")
    SsoAuditLog.expects(:log_logout!).with(user: @user, request: harness.request)

    assert_equal "/sessions/new", harness.logout(@session, @user)
    refute Session.exists?(@session.id)
    assert_equal({ other: "retained" }, harness.session)
  end

  test "federated logout returns the configured identity provider destination after deleting the local session" do
    @user.oidc_identities.create!(provider: "logout-provider", uid: "logout-user")
    ProviderLoader.stubs(:load_providers).returns([
      { name: "logout-provider", strategy: "openid_connect", issuer: "https://idp.example.com/" }
    ])
    stub_request(:get, "https://idp.example.com/.well-known/openid-configuration")
      .to_return(status: 200, body: { end_session_endpoint: "https://idp.example.com/logout" }.to_json)
    harness = LogoutHarness.new(id_token_hint: "id-token", sso_login_provider: "logout-provider")
    SsoAuditLog.expects(:log_logout_idp!).with(user: @user, provider: "logout-provider", request: harness.request)
    SsoAuditLog.expects(:log_logout!).never

    destination = URI.parse(harness.logout(@session, @user))
    assert_equal "https", destination.scheme
    assert_equal "idp.example.com", destination.host
    assert_equal "/logout", destination.path
    assert_equal({ "id_token_hint" => "id-token", "post_logout_redirect_uri" => "https://sure.example.com/auth/logout/callback" },
      URI.decode_www_form(destination.query).to_h)
    refute Session.exists?(@session.id)
    assert_empty harness.session
  end

  test "unavailable discovery still completes local logout" do
    @user.oidc_identities.create!(provider: "logout-provider", uid: "logout-user")
    ProviderLoader.stubs(:load_providers).returns([
      { name: "logout-provider", strategy: "openid_connect", issuer: "https://idp.example.com" }
    ])
    stub_request(:get, "https://idp.example.com/.well-known/openid-configuration").to_return(status: 503)
    harness = LogoutHarness.new(id_token_hint: "id-token", sso_login_provider: "logout-provider")
    SsoAuditLog.expects(:log_logout!).with(user: @user, request: harness.request)

    assert_equal "/sessions/new", harness.logout(@session, @user)
    refute Session.exists?(@session.id)
    assert_empty harness.session
  end
end
