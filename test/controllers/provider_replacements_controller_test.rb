require "test_helper"

class ProviderReplacementsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    sign_in @user
    @family = @user.family
    @account = @family.accounts.create!(owner: @user, name: "Continuous card", balance: 0, currency: "USD", accountable: CreditCard.new)
    @item = @family.simplefin_items.create!(name: "Replacement", access_url: "https://example.com/session-replacement")
    @provider = @item.simplefin_accounts.create!(name: "New card", account_id: "new-card", account_type: "credit",
      currency: "USD", current_balance: 0, raw_transactions_payload: [])
  end

  test "picker includes unlinked and generic linked choices but not the current writer" do
    current = @item.simplefin_accounts.create!(name: "Current card", account_id: "current-card", account_type: "credit",
      currency: "USD", current_balance: 0)
    AccountProvider.create!(account: @account, provider: current)
    duplicate = @family.accounts.create!(owner: @user, name: "Duplicate card", balance: 0, currency: "USD", accountable: CreditCard.new)
    linked = @item.simplefin_accounts.create!(name: "Already configured", account_id: "configured-card", account_type: "credit",
      currency: "USD", current_balance: 0)
    AccountProvider.create!(account: duplicate, provider: linked)

    get account_provider_replacement_path(@account), as: :json
    assert_response :success
    choices = response.parsed_body.fetch("candidates")
    assert_includes choices.map { |row| row.fetch("id") }, @provider.id
    assert_equal duplicate.id, choices.find { |row| row.fetch("id") == linked.id }.fetch("linked_account").fetch("id")
    refute_includes choices.map { |row| row.fetch("id") }, current.id
  end

  test "manual depository linking preserves the account and imports only after reviewed apply" do
    manual = @family.accounts.create!(owner: @user, name: "Manual checking", balance: 0, currency: "USD", accountable: Depository.new(subtype: "checking"))
    @provider.update!(account_type: "depository")
    get account_provider_replacement_path(manual), as: :json
    assert_response :success

    apply_replacement(manual, @provider)
    assert_response :success
    assert_equal manual.id, response.parsed_body.fetch("account_id")
    assert_equal manual.id, @provider.reload.current_account.id
    assert_equal "Manual checking", manual.reload.name
  end

  test "replaces legacy linkage without destroying canonical history" do
    old = @item.simplefin_accounts.create!(name: "Old card", account_id: "old-card", account_type: "credit",
      currency: "USD", current_balance: 0)
    @account.update!(simplefin_account_id: old.id)
    entry = @account.entries.create!(name: "Historical purchase", date: 1.month.ago.to_date, amount: 20, currency: "USD", entryable: Transaction.new)

    apply_replacement(@account, @provider, accept_balance_difference: true)
    assert_response :success
    assert_nil @account.reload.simplefin_account_id
    assert_equal @account.id, entry.reload.account_id
    assert_equal @account.id, @provider.reload.current_account.id
    assert_equal "active", @account.status
  end

  test "mapping move leaves another providers account ledger intact" do
    source = @family.accounts.create!(owner: @user, name: "Multi-provider card", balance: 0, currency: "USD", accountable: CreditCard.new)
    AccountProvider.create!(account: source, provider: @provider)
    plaid_item = @family.plaid_items.create!(name: "Other connection", access_token: "test", plaid_id: "other-connection")
    plaid = plaid_item.plaid_accounts.create!(name: "Other card", plaid_id: "other-card", plaid_type: "credit", currency: "USD", current_balance: 0)
    AccountProvider.create!(account: source, provider: plaid)
    entry = source.entries.create!(name: "Other provider purchase", date: Date.current, amount: 12, currency: "USD", entryable: Transaction.new)

    apply_replacement(@account, @provider)
    assert_response :success
    assert_equal source.id, entry.reload.account_id
    assert_equal "active", source.reload.status
    assert source.account_providers.exists?(provider: plaid)
    assert_equal @account.id, @provider.reload.current_account.id
  end

  test "does not replace a different provider without explicit unlink" do
    @account.update!(plaid_account: plaid_accounts(:one))
    post preview_account_provider_replacement_path(@account), params: { simplefin_account_id: @provider.id }, as: :json
    assert_response :success
    assert response.parsed_body.fetch("blockers").any?

    post apply_account_provider_replacement_path(@account),
      params: { simplefin_account_id: @provider.id, fingerprint: response.parsed_body.fetch("fingerprint"), matches: [], idempotency_key: "foreign-provider" }, as: :json
    assert_response :unprocessable_entity
    assert_equal plaid_accounts(:one).id, @account.reload.plaid_account_id
    assert_nil @provider.reload.current_account
  end

  test "non administrator cannot use replacement actions" do
    sign_in users(:family_member)
    get account_provider_replacement_path(@account), as: :json
    assert_response :forbidden
    post preview_account_provider_replacement_path(@account), params: { simplefin_account_id: @provider.id }, as: :json
    assert_response :forbidden
    assert_nil @provider.reload.current_account
  end

  test "late retired activity stays visible until explicitly reviewed into the canonical ledger" do
    old = @item.simplefin_accounts.create!(name: "Retired card", account_id: "retired-card", account_type: "credit",
      currency: "USD", current_balance: 0, raw_transactions_payload: [])
    AccountProvider.create!(account: @account, provider: old)
    apply_replacement(@account, @provider)
    assert_response :success

    SimplefinAccount.unscoped.find(old.id).update!(raw_transactions_payload: [
      { "id" => "late-purchase", "amount" => "-7", "description" => "Late purchase", "posted" => Date.current.to_time.to_i }
    ])
    @provider.update!(current_balance: -7, balance_sign_override: "debt")
    get accounts_path, as: :json
    assert_response :success
    prompts = response.parsed_body.fetch("items").flat_map { |item| item.fetch("replacement_prompts") }
    assert prompts.any? { |prompt| prompt.fetch("dormant_sfa_id") == old.id && prompt.fetch("account_id") == @account.id }
    refute @account.entries.exists?(name: "Late purchase")

    apply_replacement(@account, @provider)
    assert_response :success
    assert_equal BigDecimal("7"), @account.entries.find_by!(name: "Late purchase").amount
    get accounts_path, as: :json
    assert_response :success
    prompts = response.parsed_body.fetch("items").flat_map { |item| item.fetch("replacement_prompts") }
    refute prompts.any? { |prompt| prompt.fetch("dormant_sfa_id") == old.id }
  end

  private
    def apply_replacement(account, provider, accept_balance_difference: false)
      post preview_account_provider_replacement_path(account), params: { simplefin_account_id: provider.id }, as: :json
      assert_response :success
      fingerprint = response.parsed_body.fetch("fingerprint")
      post apply_account_provider_replacement_path(account), params: {
        simplefin_account_id: provider.id, fingerprint: fingerprint, matches: [],
        idempotency_key: SecureRandom.uuid, accept_balance_difference: accept_balance_difference
      }, as: :json
    end
end
