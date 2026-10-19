require "test_helper"

class AccountSharingsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @owner = users(:family_admin)
    @member = users(:family_member)
    @account = @owner.family.accounts.create!(
      owner: @owner,
      name: "Sharing response checking",
      balance: 1000,
      currency: "USD",
      accountable: Depository.new
    )
    sign_in @owner
  end

  test "owner can save sharing changes without redirects" do
    patch account_sharing_url(@account, format: :json),
      params: sharing_params(shared: true, permission: "full_control"),
      headers: { "HTTP_REFERER" => account_sharing_url(@account, page: 1) },
      as: :json

    assert_response :no_content
    share = @account.account_shares.find_by!(user: @member)
    assert_equal "full_control", share.permission
    assert share.include_in_finances?

    share.update!(include_in_finances: false)
    patch account_sharing_url(@account, format: :json),
      params: sharing_params(shared: true, permission: "read_write"), as: :json

    assert_response :no_content
    assert_equal "read_write", share.reload.permission
    refute share.include_in_finances?

    patch account_sharing_url(@account, format: :json),
      params: sharing_params(shared: false, permission: "read_write"), as: :json

    assert_response :no_content
    refute @account.account_shares.exists?(user: @member)
  end

  test "member can save their finance inclusion without redirects or changing permissions" do
    share = @account.account_shares.create!(user: @member, permission: "read_only", include_in_finances: true)
    sign_in @member

    patch account_sharing_url(@account, format: :json),
      params: { update_finance_inclusion: "1", include_in_finances: "false" },
      headers: { "HTTP_REFERER" => account_sharing_url(@account, page: 1) },
      as: :json

    assert_response :no_content
    refute share.reload.include_in_finances?
    assert_equal "read_only", share.permission
  end

  test "a full control member cannot manage account sharing through JSON" do
    share = @account.account_shares.create!(user: @member, permission: "full_control")
    sign_in @member

    patch account_sharing_url(@account, format: :json),
      params: sharing_params(shared: false, permission: "read_only"), as: :json

    assert_response :forbidden
    assert_equal "full_control", share.reload.permission
  end

  test "HTML sharing saves redirect with GET semantics" do
    return_url = account_sharing_url(@account, page: 1)
    patch account_sharing_url(@account),
      params: sharing_params(shared: true, permission: "full_control"),
      headers: { "HTTP_REFERER" => return_url }

    assert_response :see_other
    assert_redirected_to return_url
    assert_equal "full_control", @account.account_shares.find_by!(user: @member).permission
  end

  test "HTML finance inclusion saves redirect with GET semantics" do
    share = @account.account_shares.create!(user: @member, permission: "read_only", include_in_finances: true)
    sign_in @member
    return_url = account_sharing_url(@account, page: 1)

    patch account_sharing_url(@account),
      params: { update_finance_inclusion: "1", include_in_finances: "false" },
      headers: { "HTTP_REFERER" => return_url }

    assert_response :see_other
    assert_redirected_to return_url
    refute share.reload.include_in_finances?
  end

  private

    def sharing_params(shared:, permission:)
      { sharing: { members: { "0" => { user_id: @member.id, shared: shared, permission: permission } } } }
    end
end
