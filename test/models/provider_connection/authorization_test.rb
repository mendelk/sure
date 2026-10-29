require "test_helper"

class ProviderConnection::AuthorizationTest < ActiveSupport::TestCase
  setup do
    @user = users(:family_admin)
    @family = @user.family
  end

  test "device authorization encrypts the private code and binds redemption to user family and item" do
    subject = snaptrade_connection
    subject.item.expects(:start_oauth_device_flow).with(scope: "read").returns(device_payload)
    response = subject.configure_action!("device_authorize")
    token = response.fetch("flow_token")
    assert_equal "public-user-code", response["user_code"]
    assert_not response.key?("device_code")
    assert_not_includes token, "private-device-code"
    assert_not_includes response.to_json, "private-device-code"
    subject.item.expects(:complete_oauth_device_flow!).with(device_code: "private-device-code")
    subject.item.expects(:sync_later_with_follow_up)
    assert_equal({ status: "complete", item_id: subject.item.id }, subject.configure_action!("device_complete", flow_token: token))
  end

  test "a forged token or raw device code cannot authorize a connection" do
    subject = snaptrade_connection
    subject.item.expects(:complete_oauth_device_flow!).never
    assert_raises(ProviderConnection::Invalid) { subject.configure_action!("device_complete", flow_token: "forged", device_code: "injected") }
    assert_raises(ProviderConnection::Invalid) { subject.configure_action!("device_complete", device_code: "injected") }
  end

  test "device flow token cannot be replayed into another connection or another administrator" do
    subject = snaptrade_connection
    subject.item.expects(:start_oauth_device_flow).returns(device_payload)
    token = subject.configure_action!("device_authorize").fetch("flow_token")
    second_item = @family.snaptrade_items.create!(name: "Second brokerage")
    second = ProviderConnection.new(family: @family, user: @user, provider: "snaptrade", id: second_item.id)
    second.item.expects(:complete_oauth_device_flow!).never
    assert_raises(ProviderConnection::Invalid) { second.configure_action!("device_complete", flow_token: token) }
    other_admin = users(:family_member)
    other_admin.update!(role: :admin)
    other = ProviderConnection.new(family: @family, user: other_admin, provider: "snaptrade", id: subject.item.id)
    other.item.expects(:complete_oauth_device_flow!).never
    assert_raises(ProviderConnection::Invalid) { other.configure_action!("device_complete", flow_token: token) }
  end

  test "expired device flow token is refused before contacting the provider" do
    subject = snaptrade_connection
    subject.item.expects(:start_oauth_device_flow).returns(device_payload)
    token = subject.configure_action!("device_authorize").fetch("flow_token")
    subject.item.expects(:complete_oauth_device_flow!).never
    travel 16.minutes do
      assert_raises(ProviderConnection::Invalid) { subject.configure_action!("device_complete", flow_token: token) }
    end
  end

  test "pending device authorization remains retryable without leaking upstream error content" do
    subject = snaptrade_connection
    subject.item.expects(:start_oauth_device_flow).returns(device_payload)
    token = subject.configure_action!("device_authorize").fetch("flow_token")
    subject.item.expects(:complete_oauth_device_flow!).raises(
      Provider::Snaptrade::AuthenticationError.new("private provider response", oauth_error: "authorization_pending")
    )
    response = subject.configure_action!("device_complete", flow_token: token)
    assert_equal "pending", response[:status]
    assert_not_includes response.to_json, "private provider response"
  end

  test "device verification links must be external HTTPS URLs" do
    subject = snaptrade_connection
    subject.item.expects(:start_oauth_device_flow).returns(device_payload.merge("verification_uri" => "javascript:alert(1)"))
    assert_raises(ProviderConnection::Invalid) { subject.configure_action!("device_authorize") }
  end

  test "bank metadata is provider-scoped sanitized and sorted without returning credentials" do
    subject = banking_connection
    provider = mock
    subject.item.stubs(:enable_banking_provider).returns(provider)
    provider.expects(:get_aspsps).with(country: "DE").returns(aspsps: [
      { name: "Beta", beta: true, country: "DE", secret: "not-public" },
      { name: "Alpha", beta: false, bic: "ALPHA", psu_types: [ "personal" ] }
    ])
    response = subject.configure_action!("banks")
    assert_equal %w[Alpha Beta], response[:banks].map { |bank| bank[:name] }
    assert_not_includes response.to_json, "not-public"
    assert_not_includes response.to_json, subject.item.client_certificate
  end

  test "bank authorization uses trusted callback and request IP and returns only validated external URL" do
    subject = banking_connection
    subject.configuration_url_options = { host: "example.com", protocol: "https" }
    subject.configuration_request_ip = "203.0.113.10"
    subject.item.expects(:begin_authorization!).with do |**arguments|
      assert_equal "Alpha", arguments[:aspsp_name]
      assert_equal "business", arguments[:psu_type]
      assert_equal subject.item.id, arguments[:state]
      assert_not_equal "https://evil.example/callback", arguments[:redirect_url]
      true
    end.returns("https://auth.enablebanking.com/connect/one")
    response = subject.configure_action!("authorize", aspsp_name: "Alpha", psu_type: "business", redirect_url: "https://evil.example/callback")
    assert_equal "https://auth.enablebanking.com/connect/one", response[:authorization_url]
    assert_equal "203.0.113.10", subject.item.reload.last_psu_ip
  end

  test "bank authorization rejects untrusted redirect hosts schemes and credentialed URLs" do
    subject = banking_connection
    subject.configuration_url_options = { host: "example.com", protocol: "https" }
    %w[https://enablebanking.com.evil.example/connect http://auth.enablebanking.com/connect https://secret@auth.enablebanking.com/connect].each do |url|
      subject.item.expects(:begin_authorization!).returns(url)
      assert_raises(ProviderConnection::Invalid) { subject.configure_action!("authorize", aspsp_name: "Alpha") }
    end
  end

  private

    def snaptrade_connection
      Provider::Snaptrade.stubs(:oauth_configured?).returns(true)
      ProviderConnection.new(family: @family, user: @user, provider: "snaptrade", id: snaptrade_items(:configured_item).id)
    end

    def banking_connection
      item = @family.enable_banking_items.create!(name: "Bank", country_code: "DE", application_id: "app", client_certificate: "private-certificate")
      ProviderConnection.new(family: @family, user: @user, provider: "enable_banking", id: item.id)
    end

    def device_payload
      { "device_code" => "private-device-code", "user_code" => "public-user-code", "verification_uri" => "https://accounts.snaptrade.com/device", "expires_in" => 900, "interval" => 5 }
    end
end
