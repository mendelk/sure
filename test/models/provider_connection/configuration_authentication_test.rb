require "test_helper"
require_relative "../../support/financekit_test_helper"

class ProviderConnection::ConfigurationAuthenticationTest < ActiveSupport::TestCase
  include FinancekitTestHelper

  setup do
    @user = users(:family_admin)
    @family = @user.family
  end

  test "Trade Republic configuration creation starts a real QR login without storing a PIN" do
    provider = mock
    provider.expects(:initiate_qr_login).returns(OpenStruct.new(data: { "status" => "pending", "pending_login_b64" => "new-private-state" }))
    TradeRepublicItem.any_instance.stubs(:trade_republic_provider).returns(provider)
    subject = ProviderConnection.new(family: @family, user: @user, provider: "trade_republic")
    assert_difference "TradeRepublicItem.count", 1 do
      item = subject.create!(login_method: "qr", currency: "EUR")
      assert_equal @family, item.family
      assert_equal "new-private-state", item.reload.pending_login_state
      assert_nil item.pin
      assert_nil item.session_blob
      assert_predicate item, :requires_update?
    end
  end

  test "Trade Republic credential changes require a fresh PIN and preserve the old session on invalid input" do
    item = trade_republic_items(:configured_item)
    session = item.session_blob
    phone = item.phone_number
    subject = ProviderConnection.new(family: @family, user: @user, provider: "trade_republic", id: item.id)
    assert_raises(ProviderConnection::Invalid) { subject.update!(phone_number: "+49123456789", pin: "") }
    assert_equal session, item.reload.session_blob
    assert_equal phone, item.phone_number
  end

  test "Trade Republic challenge responses omit serialized sessions and pending authentication state" do
    item = trade_republic_items(:configured_item)
    item.pin = "1234"
    provider = mock
    item.expects(:trade_republic_provider).with(pin: "1234").returns(provider)
    provider.expects(:initiate_login).returns("method" => "push", "pending_login_b64" => "private-pending")
    response = item.start_configuration_login!(pin: "1234")
    assert_equal "push", response["method"]
    assert_equal "private-pending", item.reload.pending_login_state
    assert_nil item.session_blob
    assert_not_includes response.to_json, "private-pending"
  end

  test "Trade Republic QR response includes a browser image but no private login material" do
    item = trade_republic_items(:configured_item)
    provider = mock
    item.expects(:trade_republic_provider).with(pin: nil).returns(provider)
    provider.expects(:initiate_qr_login).returns(OpenStruct.new(data: {
      "status" => "pending", "pending_login_b64" => "private-pending", "qr_code_payload" => "https://example.com/challenge"
    }))
    response = item.start_configuration_login!(qr: true)
    assert_match %r{\Adata:image/svg\+xml;base64,}, response.fetch("qr_code_image")
    assert_not_includes response.to_json, "private-pending"
  end

  test "Trade Republic successful authentication persists the session and schedules normal sync" do
    item = trade_republic_items(:configured_item)
    item.update!(pending_login_state: "challenge", status: :requires_update)
    provider = mock
    item.expects(:trade_republic_provider).returns(provider)
    provider.expects(:complete_login).with(pending_login_b64: "challenge", code: "123456").returns(OpenStruct.new(data: {
      "status" => "complete", "session_txt" => "private-session", "account" => { "brokerage_account_id" => "new-broker-account" }
    }))
    item.expects(:sync_later)
    response = item.complete_configuration_login!(code: "123456")
    assert_equal "complete", response["status"]
    assert_not_includes response.to_json, "private-session"
    assert_equal "private-session", item.reload.session_blob
    assert_nil item.pending_login_state
    assert_equal "new-broker-account", item.brokerage_account_id
    assert_predicate item, :good?
  end

  test "a superseded Trade Republic poll cannot overwrite newer authentication" do
    item = trade_republic_items(:configured_item)
    item.update!(pending_login_state: "old-challenge", status: :requires_update)
    provider = mock
    item.expects(:trade_republic_provider).returns(provider)
    provider.expects(:complete_login).with do |**arguments|
      assert_equal({ pending_login_b64: "old-challenge", code: nil }, arguments)
      TradeRepublicItem.find(item.id).update!(pending_login_state: "new-challenge")
      true
    end.returns(OpenStruct.new(data: { "status" => "complete", "session_txt" => "stale-session" }))
    item.expects(:sync_later).never
    assert_raises(ProviderConnection::Conflict) { item.complete_configuration_login! }
    assert_equal "new-challenge", item.reload.pending_login_state
    assert_not_equal "stale-session", item.session_blob
  end

  test "Trade Republic duplicate brokerage account is refused before synchronization" do
    existing = trade_republic_items(:configured_item)
    existing.update!(brokerage_account_id: "same-broker-account")
    item = trade_republic_items(:requires_update_item)
    item.update!(pending_login_state: "challenge")
    provider = mock
    item.expects(:trade_republic_provider).returns(provider)
    provider.expects(:complete_login).returns(OpenStruct.new(data: {
      "status" => "complete", "session_txt" => "private-session", "account" => { "brokerage_account_id" => "same-broker-account" }
    }))
    item.expects(:sync_later).never
    assert_raises(ProviderConnection::Conflict) { item.complete_configuration_login! }
    assert_nil item.reload.session_blob
    assert_nil item.pending_login_state
  end

  test "Sophtron customer verification uses authentication and existing provisioning logic" do
    item = sophtron_item
    provider = mock
    item.stubs(:sophtron_provider).returns(provider)
    provider.expects(:health_check_auth).returns({ "ok" => true })
    item.expects(:ensure_customer!).with(provider: provider).returns("customer")
    assert item.verify_and_provision_customer!
  end

  test "Sophtron institution connection persists only the provider returned job and does not serialize bank credentials" do
    item = sophtron_item
    item.update!(customer_id: "customer")
    provider = mock
    item.stubs(:sophtron_provider).returns(provider)
    provider.expects(:create_user_institution).with(institution_id: "bank", username: "login", password: "bank-secret", pin: "").returns({ "JobID" => "job", "UserInstitutionID" => "remote-institution" })
    response = item.configure_connection!("connect_institution", institution_id: "bank", bank_username: "login", bank_password: "bank-secret")
    assert_equal item.id, response[:item_id]
    assert_equal "job", item.reload.current_job_id
    assert_equal "remote-institution", item.user_institution_id
    assert_not_includes response.to_json, "bank-secret"
    assert_not_includes item.raw_job_payload.to_json, "bank-secret"
  end

  test "Sophtron MFA rejects empty oversized and unsupported answers before provider calls" do
    item = sophtron_item
    item.update!(current_job_id: "job")
    provider = mock
    item.stubs(:sophtron_provider).returns(provider)
    provider.expects(:update_job_security_answer).never
    [ [], Array.new(11, "answer"), [ "a" * 257 ] ].each do |answers|
      assert_raises(ProviderConnection::Invalid) do
        item.submit_configuration_mfa!(mfa_type: "security_answer", security_answers: answers)
      end
    end
    assert_raises(ProviderConnection::Invalid) { item.submit_configuration_mfa!(mfa_type: "arbitrary") }
  end

  test "Sophtron MFA handles supported challenge submissions without changing sync scheduling" do
    item = sophtron_item
    item.update!(current_job_id: "job")
    provider = mock
    item.stubs(:sophtron_provider).returns(provider)
    provider.expects(:update_job_security_answer).with("job", [ "blue", "cat" ]).returns({ "ok" => true })
    item.expects(:sync_later).never
    assert_equal({ status: "pending" }, item.submit_configuration_mfa!(mfa_type: "security_answer", security_answers: [ " blue ", "", "cat" ]))
  end

  test "FinanceKit configuration creation preserves enrollment consent and idempotency" do
    financekit_setup
    subject = ProviderConnection.new(family: @family, user: @user, provider: "financekit")
    assert_no_difference "FinancekitItem.count" do
      assert_equal @item, subject.create!(@enrollment)
    end
    metadata = subject.configuration
    assert_equal "native", metadata[:authorization][:kind]
    assert_equal "/api/v1/financekit/connections", metadata[:authorization][:enrollment_endpoint]
    assert_not_includes metadata.to_json, @credential
    assert_raises(Financekit::Error) do
      ProviderConnection.new(family: @family, user: @user, provider: "financekit").create!(
        @enrollment.deep_merge("consent" => { "upload_authorized" => false })
      )
    end
  end

  test "another family administrator cannot rotate a native publisher credential" do
    financekit_setup
    other_admin = @family.users.create!(first_name: "Other", last_name: "Admin", email: "other-provider-admin@example.com", password: "Password123!", role: :admin)
    subject = ProviderConnection.new(family: @family, user: other_admin, provider: "financekit", id: @item.id)
    assert_raises(ProviderConnection::Forbidden) { subject.configure_action!("repair", {}) }
    assert @item.reload.authenticate_credential?(@credential)
  end

  private

    def sophtron_item
      @family.sophtron_items.create!(name: "Sophtron", user_id: "developer", access_key: Base64.strict_encode64("secret"))
    end
end
