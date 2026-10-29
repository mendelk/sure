require "test_helper"

class Api::V1::AccountSharingsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @owner = users(:family_admin)
    @member = users(:family_member)
    @account = accounts(:depository)
    @owner_key = make_key(@owner)
    @member_key = make_key(@member)
    @read_key = make_key(@owner, scopes: [ "read" ])
  end

  test "sharing reads expose only eligible family members to the owner and real viewer permissions" do
    get sharing_path, headers: api_headers(@read_key)
    assert_response :success
    assert_equal true, response.parsed_body["owned"]
    assert_includes response.parsed_body["members"].map { |member| member["id"] }, @member.id
    get sharing_path, headers: api_headers(@member_key)
    assert_response :success
    assert_equal false, response.parsed_body["owned"]
    assert_equal "full_control", response.parsed_body["viewer_permission"]
    assert_equal true, response.parsed_body.dig("member", "include_in_finances")
  end

  test "owners change sharing through the domain writer without granting access to foreign members" do
    foreign = families(:empty).users.create!(email: "foreign-sharing@example.com", password: "Password123!")
    inactive = @owner.family.users.create!(email: "inactive-sharing@example.com", password: "Password123!", active: false)
    patch sharing_path, params: { sharing: { members: {
      "0" => { user_id: @member.id, shared: true, permission: "read_only" },
      "1" => { user_id: foreign.id, shared: true, permission: "full_control" },
      "2" => { user_id: inactive.id, shared: true, permission: "full_control" }
    } } }, headers: api_headers(@owner_key), as: :json
    assert_response :no_content
    assert_equal "read_only", @account.account_shares.find_by!(user: @member).permission
    assert_not @account.account_shares.exists?(user: foreign)
    assert_not @account.account_shares.exists?(user: inactive)
    patch sharing_path, params: { sharing: { members: { "0" => { user_id: @member.id, shared: false } } } }, headers: api_headers(@owner_key), as: :json
    assert_response :no_content
    assert_not @account.account_shares.exists?(user: @member)
  end

  test "shared users update only their own finance inclusion not sharing permissions" do
    patch sharing_path, params: { update_finance_inclusion: true, include_in_finances: false }, headers: api_headers(@member_key), as: :json
    assert_response :no_content
    share = @account.account_shares.find_by!(user: @member)
    assert_equal false, share.include_in_finances
    assert_equal "full_control", share.permission
    patch sharing_path, params: { sharing: { members: { "0" => { user_id: @owner.id, shared: false } } } }, headers: api_headers(@member_key), as: :json
    assert_response :forbidden
    assert @account.reload.owned_by?(@owner)
  end

  test "sharing requires authentication write scope and account access" do
    get sharing_path
    assert_response :unauthorized
    patch sharing_path, params: { sharing: { members: {} } }, headers: api_headers(@read_key), as: :json
    assert_response :forbidden
    other_family = families(:empty)
    outsider = other_family.users.create!(email: "outsider-sharing@example.com", password: "Password123!")
    get sharing_path, headers: api_headers(make_key(outsider))
    assert_response :not_found
    patch sharing_path, params: { sharing: { members: {} } }, headers: api_headers(make_key(outsider)), as: :json
    assert_response :not_found
  end

  test "missing sharing parameters report a JSON bad request" do
    patch sharing_path, params: {}, headers: api_headers(@owner_key), as: :json
    assert_response :bad_request
  end

  private
    def sharing_path
      "/api/v1/accounts/#{@account.id}/sharing"
    end

    def make_key(user, scopes: [ "read_write" ])
      ApiKey.create!(user: user, name: "Sharing key #{SecureRandom.hex(4)}", scopes: scopes, source: "web", display_key: SecureRandom.hex(24))
    end

    def api_headers(key)
      { "X-Api-Key" => key.display_key }
    end
end
