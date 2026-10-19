require "test_helper"

class Api::V1::ProviderReplacementsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @family = @user.family
    @account = @family.accounts.create!(owner: @user, name: "Original card", currency: "USD", balance: 0,
      accountable: CreditCard.new)
    @item = @family.simplefin_items.create!(name: "Replacement bank", access_url: "https://example.com/replacement")
    @provider = @item.simplefin_accounts.create!(name: "New card", account_id: "new-card", account_type: "credit",
      currency: "USD", current_balance: 0, raw_transactions_payload: [])
    @user.api_keys.active.destroy_all
    @key = ApiKey.create!(user: @user, name: "Replacement writer", scopes: [ "read_write" ], source: "web",
      display_key: "replacement_#{SecureRandom.hex(12)}")
    @read_key = ApiKey.create!(user: @user, name: "Replacement reader", scopes: [ "read" ], source: "mobile",
      display_key: "replacement_read_#{SecureRandom.hex(12)}")
  end

  test "requires authentication and preserves read only scope" do
    get api_v1_account_provider_replacement_path(@account)
    assert_response :unauthorized

    get api_v1_account_provider_replacement_path(@account), headers: api_headers(@read_key)
    assert_response :success
    assert_includes response.parsed_body.fetch("candidates").map { |candidate| candidate.fetch("id") }, @provider.id

    post preview_api_v1_account_provider_replacement_path(@account),
      params: { simplefin_account_id: @provider.id }, headers: api_headers(@read_key), as: :json
    assert_response :forbidden

    post apply_api_v1_account_provider_replacement_path(@account),
      params: { simplefin_account_id: @provider.id, fingerprint: "unreviewed", idempotency_key: "readonly" },
      headers: api_headers(@read_key), as: :json
    assert_response :forbidden
    refute @account.reload.linked?
  end

  test "reviewed apply preserves canonical identity and is idempotent" do
    post preview_api_v1_account_provider_replacement_path(@account),
      params: { simplefin_account_id: @provider.id }, headers: api_headers(@key), as: :json
    assert_response :success
    preview = response.parsed_body
    refute @account.reload.linked?, "preview must not change the ledger mapping"

    body = { simplefin_account_id: @provider.id, fingerprint: preview.fetch("fingerprint"), matches: [], idempotency_key: "reviewed-apply" }
    post apply_api_v1_account_provider_replacement_path(@account), params: body, headers: api_headers(@key), as: :json
    assert_response :success
    result = response.parsed_body
    assert_equal @account.id, result.fetch("account_id")
    assert_equal @account.id, @provider.reload.current_account.id
    assert_equal "Original card", @account.reload.name
    assert_equal @user.id, @account.owner_id

    post apply_api_v1_account_provider_replacement_path(@account), params: body, headers: api_headers(@key), as: :json
    assert_response :success
    assert_equal result, response.parsed_body
    assert_equal 1, @account.account_providers.where(provider: @provider).count
  end

  test "rejects stale reviews without moving the mapping" do
    post preview_api_v1_account_provider_replacement_path(@account),
      params: { simplefin_account_id: @provider.id }, headers: api_headers(@key), as: :json
    assert_response :success
    fingerprint = response.parsed_body.fetch("fingerprint")
    @provider.update!(current_balance: -25)

    post apply_api_v1_account_provider_replacement_path(@account),
      params: { simplefin_account_id: @provider.id, fingerprint: fingerprint, matches: [], idempotency_key: "stale" },
      headers: api_headers(@key), as: :json
    assert_response :conflict
    assert_equal "stale_preview", response.parsed_body.fetch("error")
    refute @account.reload.linked?
  end

  test "rejects missing review fields and malformed pair lists" do
    post apply_api_v1_account_provider_replacement_path(@account),
      params: { simplefin_account_id: @provider.id }, headers: api_headers(@key), as: :json
    assert_response :unprocessable_entity

    post apply_api_v1_account_provider_replacement_path(@account),
      params: { simplefin_account_id: @provider.id, fingerprint: "review", idempotency_key: "bad-pairs", matches: { incoming_id: "x" } },
      headers: api_headers(@key), as: :json
    assert_response :unprocessable_entity
    refute @account.reload.linked?
  end

  test "does not expose other families providers or accounts" do
    other_family = Family.create!(name: "Private family", currency: "USD")
    other_user = other_family.users.create!(email: "replacement-private@example.com", password: "Password123!", role: "admin")
    other_account = other_family.accounts.create!(owner: other_user, name: "Private account", currency: "USD", balance: 0,
      accountable: CreditCard.new)
    other_item = other_family.simplefin_items.create!(name: "Private provider", access_url: "https://example.com/private")
    other_provider = other_item.simplefin_accounts.create!(name: "Private card", account_id: "private", currency: "USD",
      current_balance: 0, account_type: "credit")

    get api_v1_account_provider_replacement_path(other_account), headers: api_headers(@key)
    assert_response :not_found

    post preview_api_v1_account_provider_replacement_path(@account),
      params: { simplefin_account_id: other_provider.id }, headers: api_headers(@key), as: :json
    assert_response :not_found
    assert_not_includes response.body, "Private card"

    get api_v1_account_provider_replacement_path("not-an-account"), headers: api_headers(@key)
    assert_response :not_found
  end

  test "family administrator cannot replace another members read only account" do
    member = users(:family_member)
    @account.update!(owner: member)
    @account.account_shares.create!(user: @user, permission: "read_only")
    post preview_api_v1_account_provider_replacement_path(@account),
      params: { simplefin_account_id: @provider.id }, headers: api_headers(@key), as: :json
    assert_response :forbidden
    refute @account.reload.linked?
  end
end
