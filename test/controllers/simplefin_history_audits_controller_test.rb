require "test_helper"

class SimplefinHistoryAuditsControllerTest < ActionDispatch::IntegrationTest
  setup do
    sign_in @user = users(:family_admin)
    @account = accounts(:depository)
    @account.update!(owner: @user)
    @account.account_shares.destroy_all
  end

  test "opening the audit does not fetch provider history" do
    Provider::Simplefin.any_instance.expects(:get_accounts).never
    get account_simplefin_history_audit_path(@account, format: :json)
    assert_response :success
    assert_equal @account.id, response.parsed_body.dig("account", "id")
  end

  test "requires a browser session" do
    Current.session.destroy!
    get account_simplefin_history_audit_path(@account)
    assert_redirected_to new_session_path
  end

  test "members cannot audit even accounts they own" do
    @user.update!(role: "member")
    get account_simplefin_history_audit_path(@account, format: :json)
    assert_response :forbidden
  end

  test "administrators cannot audit another members read only account" do
    @account.update!(owner: users(:family_member))
    @account.account_shares.create!(user: @user, permission: "read_only")
    get account_simplefin_history_audit_path(@account, format: :json)
    assert_response :forbidden
  end

  test "does not expose accounts from another family" do
    family = Family.create!(name: "Private family", currency: "USD")
    account = family.accounts.create!(name: "Private account", currency: "USD", balance: 0, accountable: Depository.new)
    get account_simplefin_history_audit_path(account, format: :json)
    assert_response :not_found
  end
end
