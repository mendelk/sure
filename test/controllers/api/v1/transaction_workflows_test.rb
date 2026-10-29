require "test_helper"

class Api::V1::TransactionWorkflowsTest < ActionDispatch::IntegrationTest
  include EntriesTestHelper

  setup do
    @user = users(:family_admin)
    @account = accounts(:investment)
    @user.api_keys.active.destroy_all
    @key = ApiKey.create!(user: @user, name: "Ledger workflows", scopes: [ "read_write" ], display_key: ApiKey.generate_secure_key)
    @read_key = ApiKey.create!(user: @user, name: "Ledger reads", scopes: [ "read" ], source: "mobile", display_key: ApiKey.generate_secure_key)
    @entry = create_transaction(account: @account, amount: 100)
  end

  test "manual creation preserves currency rate protection and account scoped retry identity" do
    key = SecureRandom.uuid
    input = { transaction: { account_id: @account.id, name: "Foreign purchase", date: Date.current, amount: "12.34", currency: "EUR", nature: "inflow", exchange_rate: "1.05", idempotency_key: key, user_modified: true } }
    assert_difference "Entry.count", 1 do
      2.times do
        post "/api/v1/transactions", params: input, headers: api_headers(@key), as: :json
        assert_response :success
        assert_equal [], response.parsed_body.fetch("split_children")
        assert_equal true, response.parsed_body.fetch("protected_from_sync")
      end
    end
    entry = @account.entries.find_by!(idempotency_key: key)
    assert_equal BigDecimal("-12.34"), entry.amount
    assert_equal "EUR", entry.currency
    assert_equal 1.05, entry.transaction.exchange_rate
    assert_nil entry.external_id
    assert entry.user_modified?
  end

  test "manual creation returns validation errors without creating invalid foreign metadata" do
    post "/api/v1/transactions", params: { transaction: { account_id: @account.id, name: "Invalid", date: Date.current, amount: "not a number", currency: "USD" } }, headers: api_headers(@key), as: :json
    assert_response :unprocessable_entity
    post "/api/v1/transactions", params: { transaction: { account_id: SecureRandom.uuid, name: "Missing", date: Date.current, amount: 1 } }, headers: api_headers(@key), as: :json
    assert_response :not_found
  end

  test "bulk permissions and annotation updates honor sharing without permitting structural writes" do
    member = users(:family_member)
    @account.account_shares.create!(user: member, permission: "read_write")
    member.api_keys.active.destroy_all
    key = ApiKey.create!(user: member, name: "Shared ledger", scopes: [ "read_write" ], display_key: ApiKey.generate_secure_key)
    get "/api/v1/transactions/bulk_permissions", params: { entry_ids: [ @entry.id ] }, headers: api_headers(key)
    assert_response :success
    assert_equal({ "can_edit" => false, "can_annotate" => true }, response.parsed_body["permissions"])
    patch "/api/v1/transactions/bulk_update", params: { bulk_update: { entry_ids: [ @entry.id ], notes: "Annotated" } }, headers: api_headers(key), as: :json
    assert_response :success
    assert_equal "Annotated", @entry.reload.notes
    patch "/api/v1/transactions/bulk_update", params: { bulk_update: { entry_ids: [ @entry.id ], name: "Forbidden", notes: "Not saved" } }, headers: api_headers(key), as: :json
    assert_response :forbidden
    assert_equal "Annotated", @entry.reload.notes
    delete "/api/v1/transactions/bulk_deletion", params: { bulk_delete: { entry_ids: [ @entry.id ] } }, headers: api_headers(key), as: :json
    assert_response :forbidden
    assert Entry.exists?(@entry.id)
  end

  test "bulk selection rejects missing entries atomically and supports account trade deletion" do
    delete "/api/v1/transactions/bulk_deletion", params: { bulk_delete: { entry_ids: [ @entry.id, SecureRandom.uuid ] } }, headers: api_headers(@key), as: :json
    assert_response :not_found
    assert Entry.exists?(@entry.id)
    trade = create_trade(Security.first!, account: @account, qty: 1, price: 10, date: Date.current)
    delete "/api/v1/transactions/bulk_deletion", params: { bulk_delete: { entry_ids: [ @entry.id, trade.id ] } }, headers: api_headers(@key), as: :json
    assert_response :success
    assert_equal 2, response.parsed_body["deleted_count"]
    assert_not Entry.exists?(@entry.id)
    assert_not Entry.exists?(trade.id)
  end

  test "unsplit removes children and restores parent via API" do
    @entry.split!([ { name: "First", amount: 40 }, { name: "Second", amount: 60 } ])
    delete "/api/v1/transactions/#{@entry.entryable_id}/split", headers: api_headers(@key)
    assert_response :success
    assert_empty @entry.reload.child_entries
    assert_not @entry.excluded?
    delete "/api/v1/transactions/#{@entry.entryable_id}/split", headers: api_headers(@key)
    assert_response :unprocessable_entity
  end

  test "conversion derives sell quantity protects trade and rejects repeat conversion" do
    @entry.update!(amount: -100)
    input = { conversion: { security_id: Security.first!.id, price: "25" } }
    get "/api/v1/transactions/#{@entry.entryable_id}/conversion", headers: api_headers(@read_key)
    assert_response :success
    assert_difference "Trade.count", 1 do
      post "/api/v1/transactions/#{@entry.entryable_id}/conversion", params: input, headers: api_headers(@key), as: :json
      assert_response :created
    end
    trade = Trade.find(response.parsed_body["id"])
    assert_equal BigDecimal("-4"), trade.qty
    assert_equal BigDecimal("-100"), trade.entry.amount
    assert_equal "Sell", trade.investment_activity_label
    assert trade.entry.user_modified?
    assert @entry.reload.excluded?
    assert_no_difference "Trade.count" do
      post "/api/v1/transactions/#{@entry.entryable_id}/conversion", params: input, headers: api_headers(@key), as: :json
      assert_response :unprocessable_entity
    end
  end

  test "failed conversion leaves original and ledger unchanged" do
    assert_no_difference "Trade.count" do
      post "/api/v1/transactions/#{@entry.entryable_id}/conversion", params: { conversion: { security_id: Security.first!.id, qty: "0", price: "10" } }, headers: api_headers(@key), as: :json
      assert_response :unprocessable_entity
    end
    assert_not @entry.reload.excluded?
    assert_no_difference "Trade.count" do
      Entry.any_instance.stubs(:mark_user_modified!).raises(ActiveRecord::RecordNotSaved, "Protection failed")
      post "/api/v1/transactions/#{@entry.entryable_id}/conversion", params: { conversion: { security_id: Security.first!.id, qty: "1", price: "10" } }, headers: api_headers(@key), as: :json
      assert_response :unprocessable_entity
    end
    assert_not @entry.reload.excluded?
  end

  test "manual duplicate candidates and merge stay in the same account and currency" do
    @entry.transaction.update!(extra: { "plaid" => { "pending" => true } })
    posted = create_transaction(account: @account, name: "Posted name", date: Date.yesterday, amount: 100)
    foreign = create_transaction(account: @account, currency: "EUR", amount: 100)
    other_account = create_transaction(account: accounts(:depository), amount: 100)
    get "/api/v1/transactions/#{@entry.entryable_id}/duplicate_candidates", headers: api_headers(@key)
    assert_response :success
    ids = response.parsed_body["candidates"].map { |candidate| candidate["entry_id"] }
    assert_includes ids, posted.id
    assert_not_includes ids, foreign.id
    assert_not_includes ids, other_account.id
    post "/api/v1/transactions/#{@entry.entryable_id}/duplicate_merge", params: { duplicate_merge: { posted_entry_id: other_account.id } }, headers: api_headers(@key), as: :json
    assert_response :unprocessable_entity
    post "/api/v1/transactions/#{@entry.entryable_id}/duplicate_merge", params: { duplicate_merge: { posted_entry_id: foreign.id } }, headers: api_headers(@key), as: :json
    assert_response :unprocessable_entity
    assert Entry.exists?(@entry.id)
    post "/api/v1/transactions/#{@entry.entryable_id}/duplicate_merge", params: { duplicate_merge: { posted_entry_id: posted.id } }, headers: api_headers(@key), as: :json
    assert_response :success
    assert_not Entry.exists?(@entry.id)
    assert_equal Date.current, posted.reload.date
    assert_equal "Posted name", posted.name
  end

  test "conversion search retains provider exchange selection" do
    security = Security.new(ticker: "ABC", name: "Example", exchange_operating_mic: "XNYS", price_provider: "finnhub")
    Security.expects(:search_provider).with("ABC", country_code: @user.family.country).returns([ security ])
    get "/api/v1/transactions/#{@entry.entryable_id}/conversion", params: { q: "ABC" }, headers: api_headers(@key)
    assert_response :success
    assert_equal "ABC|XNYS|finnhub", response.parsed_body.fetch("search_results").first.fetch("ticker")
  end

  test "public ledger writes require auth and write scope" do
    [ [ :delete, "/api/v1/transactions/bulk_deletion", { bulk_delete: { entry_ids: [ @entry.id ] } } ],
      [ :patch, "/api/v1/transactions/bulk_update", { bulk_update: { entry_ids: [ @entry.id ], name: "Denied" } } ],
      [ :delete, "/api/v1/transactions/#{@entry.entryable_id}/split", {} ],
      [ :post, "/api/v1/transactions/#{@entry.entryable_id}/conversion", { conversion: { qty: 1 } } ],
      [ :post, "/api/v1/transactions/#{@entry.entryable_id}/duplicate_merge", { duplicate_merge: { posted_entry_id: SecureRandom.uuid } } ] ].each do |method, path, input|
      public_send(method, path, params: input, as: :json)
      assert_response :unauthorized
      public_send(method, path, params: input, headers: api_headers(@read_key), as: :json)
      assert_response :forbidden
    end
  end

  test "currency and dated exchange rate metadata are public read scoped resources" do
    get "/api/v1/currencies/USD", headers: api_headers(@read_key)
    assert_response :success
    assert response.parsed_body.key?("step")
    get "/api/v1/currencies/INVALID", headers: api_headers(@read_key)
    assert_response :not_found
    get "/api/v1/exchange_rate", params: { from: "USD", to: "USD", date: "not-a-date" }, headers: api_headers(@read_key)
    assert_response :unprocessable_entity
    get "/api/v1/exchange_rate", params: { from: "USD", to: "USD", date: Date.current.iso8601 }, headers: api_headers(@read_key)
    assert_response :success
    assert_equal 1.0, response.parsed_body["rate"]
  end

  test "session clients use the same create bulk and conversion resources" do
    sign_in @user
    post "/api/v1/transactions", params: { transaction: { account_id: @account.id, name: "Browser cash", date: Date.current, amount: "25", currency: "USD", nature: "outflow", idempotency_key: SecureRandom.uuid, user_modified: true } }, as: :json
    assert_response :created
    id = response.parsed_body.fetch("id")
    entry_id = response.parsed_body.fetch("entry_id")
    patch "/api/v1/transactions/bulk_update", params: { bulk_update: { entry_ids: [ entry_id ], notes: "Browser annotation" } }, as: :json
    assert_response :success
    post "/api/v1/transactions/#{id}/conversion", params: { conversion: { security_id: Security.first!.id, qty: "1", price: "25" } }, as: :json
    assert_response :created
    trade_entry_id = response.parsed_body.fetch("entry_id")
    delete "/api/v1/transactions/bulk_deletion", params: { bulk_delete: { entry_ids: [ entry_id, trade_entry_id ] } }, as: :json
    assert_response :success
    assert_equal 2, response.parsed_body.fetch("deleted_count")
  end

  private
    def api_headers(key)
      { "X-Api-Key" => key.display_key }
    end
end
