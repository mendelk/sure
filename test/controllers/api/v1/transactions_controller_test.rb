# frozen_string_literal: true

require "test_helper"

class Api::V1::TransactionsControllerTest < ActionDispatch::IntegrationTest
  include EntriesTestHelper

  setup do
    @user = users(:family_admin)
    @family = @user.family
    @account = @family.accounts.first
    @transaction = @family.transactions.first

    # Destroy existing active API keys to avoid validation errors
    @user.api_keys.active.destroy_all

    # Create fresh API keys instead of using fixtures to avoid parallel test conflicts (rate limiting in test)
    @api_key = ApiKey.create!(
      user: @user,
      name: "Test Read-Write Key",
      scopes: [ "read_write" ],
      display_key: "test_rw_#{SecureRandom.hex(8)}"
    )

    @read_only_api_key = ApiKey.create!(
      user: @user,
      name: "Test Read-Only Key",
      scopes: [ "read" ],
      display_key: "test_ro_#{SecureRandom.hex(8)}",
      source: "mobile"  # Use different source to allow multiple keys
    )

    # Clear any existing rate limit data
    Redis.new.del("api_rate_limit:#{@api_key.id}")
    Redis.new.del("api_rate_limit:#{@read_only_api_key.id}")
  end

  test "unmatched payment and funds movement categories remain editable" do
    %w[cc_payment funds_movement].each do |kind|
      entry = create_transaction(account: accounts(:credit_card), amount: "-14.03", kind: kind)

      get api_v1_transaction_url(entry.entryable), headers: api_headers(@read_only_api_key)
      assert_response :success
      body = JSON.parse(response.body)
      assert body["category_editable"]
      assert_nil body["transfer"]

      patch api_v1_transaction_url(entry.entryable),
        params: { transaction: { category_id: categories(:food_and_drink).id } },
        headers: api_headers(@api_key)
      assert_response :success
      assert_equal categories(:food_and_drink).id, entry.entryable.reload.category_id
      assert_equal kind, entry.entryable.kind
    end
  end

  test "incoming loan transfer displays the outgoing category read only" do
    transfer = create_transfer(from_account: accounts(:depository), to_account: accounts(:loan), amount: 100).reload
    transfer.outflow_transaction.update!(kind: "loan_payment", category: categories(:food_and_drink))

    get api_v1_transaction_url(transfer.inflow_transaction), headers: api_headers(@read_only_api_key)
    assert_response :success
    body = JSON.parse(response.body)
    assert_not body["category_editable"]
    assert body["category_set_on_transfer_outflow"]
    assert_nil body["category"]
    assert_equal categories(:food_and_drink).name, body.dig("display_category", "name")

    get api_v1_transactions_url, params: { account_id: accounts(:loan).id }, headers: api_headers(@read_only_api_key)
    assert_response :success
    listed = JSON.parse(response.body)["transactions"].find { |item| item["id"] == transfer.inflow_transaction_id }
    assert_equal body["display_category"], listed["display_category"]
  end

  test "incoming transfer display does not expose an inaccessible outgoing category" do
    source = accounts(:depository)
    source.update!(owner: users(:family_member))
    source.account_shares.where(user: @user).delete_all
    private_category = @family.categories.create!(name: "Private transfer category", color: "#123456")
    transfer = create_transfer(from_account: source, to_account: accounts(:loan), amount: 100).reload
    transfer.outflow_transaction.update!(kind: "loan_payment", category: private_category)

    get api_v1_transaction_url(transfer.inflow_transaction), headers: api_headers(@read_only_api_key)
    assert_response :success
    body = JSON.parse(response.body)
    assert_not body["category_editable"]
    assert body["category_set_on_transfer_outflow"]
    assert_equal I18n.t("categories.virtual.payment"), body.dig("display_category", "name")
    assert_not_includes response.body, private_category.name
  end

  # INDEX action tests
  test "should get index with valid API key" do
    get api_v1_transactions_url, headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    assert response_data.key?("transactions")
    assert response_data.key?("pagination")

    # Agent-friendly numeric fields (validate type + sign invariants)
    first = response_data["transactions"].first
    assert_amount_cents_fields(first)
    assert response_data["pagination"].key?("page")
    assert response_data["pagination"].key?("per_page")
    assert response_data["pagination"].key?("total_count")
    assert response_data["pagination"].key?("total_pages")
  end

  test "list and detail expose merchant logos at the current Brandfetch resolution" do
    stored_url = "https://cdn.brandfetch.io/netflix.com/icon/fallback/lettermark/w/40/h/40?c=test-client"
    merchant = @family.merchants.create!(
      name: "Logo Merchant", website_url: "https://netflix.com", logo_url: stored_url
    )
    @transaction.update!(merchant: merchant)

    Setting.stub :brand_fetch_high_res_logos, true do
      get api_v1_transactions_url, params: { merchant_id: merchant.id }, headers: api_headers(@read_only_api_key)
      assert_response :success
      listed = JSON.parse(response.body)["transactions"].find { |transaction| transaction["id"] == @transaction.id }

      get api_v1_transaction_url(@transaction), headers: api_headers(@read_only_api_key)
      assert_response :success
      detail = JSON.parse(response.body)

      [ listed, detail ].each do |transaction|
        assert_equal stored_url.sub("/w/40/h/40", "/w/120/h/120"), transaction["logo_url"]
        assert_equal transaction["logo_url"], transaction.dig("merchant", "logo_url")
        assert_equal "https://netflix.com", transaction.dig("merchant", "website_url")
      end
    end

    assert_equal stored_url, merchant.reload.logo_url
  end

  test "transaction logos prefer investment securities over merchants" do
    merchant = @family.merchants.create!(name: "Broker", logo_url: "https://example.com/broker.png")
    security = securities(:aapl)
    security.update!(website_url: nil, logo_url: "https://example.com/issuer.png")
    @transaction.update!(merchant: merchant, extra: { "security_id" => security.id })

    get api_v1_transactions_url, params: { merchant_id: merchant.id }, headers: api_headers(@read_only_api_key)

    assert_response :success
    transaction = JSON.parse(response.body)["transactions"].find { |item| item["id"] == @transaction.id }
    assert_equal "https://example.com/issuer.png", transaction["logo_url"]
    assert_equal "https://example.com/broker.png", transaction.dig("merchant", "logo_url")
  end

  test "transaction logos remain absent when no merchant or security has a logo" do
    @transaction.update!(merchant: nil, extra: {})

    get api_v1_transaction_url(@transaction), headers: api_headers(@read_only_api_key)

    assert_response :success
    assert_nil JSON.parse(response.body)["logo_url"]
  end

  test "index batches investment activity security lookups" do
    @transaction.update!(extra: { "security_id" => securities(:aapl).id })
    baseline_queries = count_db_queries do
      get api_v1_transactions_url, params: { per_page: 100 }, headers: api_headers(@read_only_api_key)
      assert_response :success
    end

    [ securities(:aapl), securities(:msft) ].each do |security|
      @account.entries.create!(
        name: "Investment income", amount: -10, currency: "USD", date: Date.current,
        entryable: Transaction.new(extra: { "security_id" => security.id })
      )
    end

    expanded_queries = count_db_queries do
      get api_v1_transactions_url, params: { per_page: 100 }, headers: api_headers(@read_only_api_key)
      assert_response :success
    end

    assert_equal baseline_queries, expanded_queries
  end

  test "index avoids per-transaction transfer queries" do
    from_account = @family.accounts.first
    to_account = @family.accounts.second || @family.accounts.create!(
      name: "Second Account",
      balance: 0,
      currency: @family.currency,
      accountable: Depository.new
    )

    create_transfer(from_account: from_account, to_account: to_account, amount: 10)
    baseline_queries = count_db_queries do
      get api_v1_transactions_url, params: { per_page: 200 }, headers: api_headers(@api_key)
      assert_response :success
    end

    5.times { create_transfer(from_account: from_account, to_account: to_account, amount: 10) }
    expanded_queries = count_db_queries do
      get api_v1_transactions_url, params: { per_page: 200 }, headers: api_headers(@api_key)
      assert_response :success
    end

    assert_equal baseline_queries, expanded_queries
  end

  test "should get index with read-only API key" do
    get api_v1_transactions_url, headers: api_headers(@read_only_api_key)
    assert_response :success
  end

  test "should filter transactions by account_id" do
    get api_v1_transactions_url, params: { account_id: @account.id }, headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    response_data["transactions"].each do |transaction|
      assert_equal @account.id, transaction["account"]["id"]
    end
  end

  test "should include disabled account transactions in index history" do
    disabled_transaction = create_disabled_account_transaction(name: "Closed Account Grocery")

    get api_v1_transactions_url, headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    transaction_ids = response_data["transactions"].map { |transaction| transaction["id"] }
    assert_includes transaction_ids, disabled_transaction.id
  end

  test "should exclude pending deletion account transactions from index history" do
    pending_deletion_transaction = create_account_transaction(
      status: "pending_deletion",
      name: "Pending Delete Account Grocery"
    )

    get api_v1_transactions_url, headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    transaction_ids = response_data["transactions"].map { |transaction| transaction["id"] }
    assert_not_includes transaction_ids, pending_deletion_transaction.id
  end

  test "should filter disabled account transactions by account_id" do
    disabled_transaction = create_disabled_account_transaction(name: "Closed Account Filter")
    disabled_account = disabled_transaction.entry.account

    get api_v1_transactions_url,
        params: { account_id: disabled_account.id },
        headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    assert_equal [ disabled_transaction.id ], response_data["transactions"].map { |transaction| transaction["id"] }
  end

  test "should filter transactions by date range" do
    start_date = 1.month.ago.to_date
    end_date = Date.current

    get api_v1_transactions_url,
        params: { start_date: start_date, end_date: end_date },
        headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    response_data["transactions"].each do |transaction|
      transaction_date = Date.parse(transaction["date"])
      assert transaction_date >= start_date
      assert transaction_date <= end_date
    end
  end

  test "should filter transactions by tag_ids without error" do
    tag_one = tags(:one)
    tag_two = tags(:two)
    tagged_entry = @account.entries.create!(
      name: "Tagged Transaction",
      amount: 12.34,
      currency: "USD",
      date: Date.current,
      entryable: Transaction.new(tags: [ tag_one, tag_two ])
    )

    untagged_entry = @account.entries.create!(
      name: "Untagged Transaction",
      amount: 12.34,
      currency: "USD",
      date: Date.current,
      entryable: Transaction.new
    )

    get api_v1_transactions_url,
        params: { tag_ids: [ tag_one.id, tag_two.id ], per_page: 200 },
        headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    transaction_ids = response_data["transactions"].map { |t| t["id"] }
    assert_equal 1, transaction_ids.count(tagged_entry.transaction.id)
    assert_includes transaction_ids, tagged_entry.transaction.id
    assert_not_includes transaction_ids, untagged_entry.transaction.id
  end

  test "should filter disabled account transactions by date range" do
    disabled_transaction = create_disabled_account_transaction(
      name: "Closed Account Date Range",
      date: Date.current - 3.days
    )

    get api_v1_transactions_url,
        params: { start_date: Date.current - 4.days, end_date: Date.current - 2.days },
        headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    transaction_ids = response_data["transactions"].map { |transaction| transaction["id"] }
    assert_includes transaction_ids, disabled_transaction.id
  end

  test "should search transactions" do
    # Create a transaction with a specific name for testing
    entry = @account.entries.create!(
      name: "Test Coffee Purchase",
      amount: 5.50,
      currency: "USD",
      date: Date.current,
      entryable: Transaction.new
    )

    get api_v1_transactions_url,
        params: { search: "Coffee" },
        headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    found_transaction = response_data["transactions"].find { |t| t["id"] == entry.transaction.id }
    assert_not_nil found_transaction, "Should find the coffee transaction"
  end

  test "should search disabled account transactions" do
    disabled_transaction = create_disabled_account_transaction(name: "Closed Account Coffee")

    get api_v1_transactions_url,
        params: { search: "Closed Account Coffee" },
        headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    found_transaction = response_data["transactions"].find { |transaction| transaction["id"] == disabled_transaction.id }
    assert_not_nil found_transaction, "Should find disabled account transactions in global history search"
  end

  test "should filter transactions by absolute amount with operator" do
    small_entry = @account.entries.create!(
      name: "Small Amount Coffee",
      amount: 5.50,
      currency: "USD",
      date: Date.current,
      entryable: Transaction.new
    )

    large_entry = @account.entries.create!(
      name: "Large Amount Coffee",
      amount: 500.00,
      currency: "USD",
      date: Date.current,
      entryable: Transaction.new
    )

    get api_v1_transactions_url,
        params: { search: "Amount Coffee", amount: 100, amount_operator: "greater", per_page: 200 },
        headers: api_headers(@api_key)
    assert_response :success

    transaction_ids = JSON.parse(response.body)["transactions"].map { |t| t["id"] }
    assert_includes transaction_ids, large_entry.transaction.id
    assert_not_includes transaction_ids, small_entry.transaction.id
  end

  test "should support min_amount legacy alias" do
    entry = @account.entries.create!(
      name: "Legacy Alias Coffee",
      amount: 500.00,
      currency: "USD",
      date: Date.current,
      entryable: Transaction.new
    )

    get api_v1_transactions_url,
        params: { search: "Legacy Alias Coffee", min_amount: 100 },
        headers: api_headers(@api_key)
    assert_response :success

    transaction_ids = JSON.parse(response.body)["transactions"].map { |t| t["id"] }
    assert_includes transaction_ids, entry.transaction.id
  end

  test "should reject invalid amount_operator" do
    get api_v1_transactions_url,
        params: { amount: 100, amount_operator: "between" },
        headers: api_headers(@api_key)
    assert_response :unprocessable_entity
  end

  test "should exclude transactions by negative category filter" do
    food_entry = @account.entries.create!(
      name: "Excluded Category Coffee",
      amount: 12.34,
      currency: "USD",
      date: Date.current,
      entryable: Transaction.new(category: categories(:food_and_drink))
    )

    other_entry = @account.entries.create!(
      name: "Excluded Category Coffee",
      amount: 12.34,
      currency: "USD",
      date: Date.current,
      entryable: Transaction.new(category: categories(:income))
    )

    get api_v1_transactions_url,
        params: { search: "Excluded Category Coffee", excluded_categories: [ "Food & Drink" ], per_page: 200 },
        headers: api_headers(@api_key)
    assert_response :success

    transaction_ids = JSON.parse(response.body)["transactions"].map { |t| t["id"] }
    assert_includes transaction_ids, other_entry.transaction.id
    assert_not_includes transaction_ids, food_entry.transaction.id
  end
  test "should filter transactions by Uncategorized category alias and sentinel" do
    uncategorized_entry = @account.entries.create!(
      name: "Uncategorized Item",
      amount: 15.00,
      currency: "USD",
      date: Date.current,
      entryable: Transaction.new(category: nil)
    )

    categorized_entry = @account.entries.create!(
      name: "Categorized Item",
      amount: 25.00,
      currency: "USD",
      date: Date.current,
      entryable: Transaction.new(category: categories(:food_and_drink))
    )

    # Via literal "Uncategorized" alias
    get api_v1_transactions_url,
        params: { categories: [ "Uncategorized" ], per_page: 200 },
        headers: api_headers(@api_key)
    assert_response :success
    ids = JSON.parse(response.body)["transactions"].map { |t| t["id"] }
    assert_includes ids, uncategorized_entry.transaction.id
    assert_not_includes ids, categorized_entry.transaction.id

    # Via Category::UNCATEGORIZED_FILTER_VALUE sentinel
    get api_v1_transactions_url,
        params: { categories: [ Category::UNCATEGORIZED_FILTER_VALUE ], per_page: 200 },
        headers: api_headers(@api_key)
    assert_response :success
    ids = JSON.parse(response.body)["transactions"].map { |t| t["id"] }
    assert_includes ids, uncategorized_entry.transaction.id
    assert_not_includes ids, categorized_entry.transaction.id
  end

  test "should exclude transactions by negative id-based filters" do
    merchant_entry = @account.entries.create!(
      name: "Excluded Merchant Coffee",
      amount: 12.34,
      currency: "USD",
      date: Date.current,
      entryable: Transaction.new(merchant: merchants(:netflix))
    )

    other_entry = @account.entries.create!(
      name: "Excluded Merchant Coffee",
      amount: 12.34,
      currency: "USD",
      date: Date.current,
      entryable: Transaction.new
    )

    get api_v1_transactions_url,
        params: { search: "Excluded Merchant Coffee", excluded_merchant_ids: [ merchants(:netflix).id ], per_page: 200 },
        headers: api_headers(@api_key)
    assert_response :success

    transaction_ids = JSON.parse(response.body)["transactions"].map { |t| t["id"] }
    assert_includes transaction_ids, other_entry.transaction.id
    assert_not_includes transaction_ids, merchant_entry.transaction.id
  end

  test "should paginate transactions" do
    get api_v1_transactions_url,
        params: { page: 1, per_page: 5 },
        headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    assert response_data["transactions"].size <= 5
    assert_equal 1, response_data["pagination"]["page"]
    assert_equal 5, response_data["pagination"]["per_page"]
  end

  test "should reject index request without API key" do
    get api_v1_transactions_url
    assert_response :unauthorized
  end

  test "should reject index request with invalid API key" do
    get api_v1_transactions_url, headers: { "X-Api-Key" => "invalid-key" }
    assert_response :unauthorized
  end

  # SHOW action tests
  test "should show transaction with valid API key" do
    get api_v1_transaction_url(@transaction), headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    assert_equal @transaction.id, response_data["id"]
    assert response_data.key?("name")
    assert response_data.key?("amount")
    assert_amount_cents_fields(response_data)
    assert response_data.key?("date")
    assert response_data.key?("account")
  end

  test "should show transaction with read-only API key" do
    get api_v1_transaction_url(@transaction), headers: api_headers(@read_only_api_key)
    assert_response :success
  end

  test "should show disabled account transaction" do
    disabled_transaction = create_disabled_account_transaction(name: "Closed Account Show")

    get api_v1_transaction_url(disabled_transaction), headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    assert_equal disabled_transaction.id, response_data["id"]
    assert_equal disabled_transaction.entry.account_id, response_data["account"]["id"]
  end

  test "should return 404 for valid missing transaction id" do
    get api_v1_transaction_url(SecureRandom.uuid), headers: api_headers(@api_key)
    assert_response :not_found

    response_data = JSON.parse(response.body)
    assert_equal "not_found", response_data["error"]
    assert_equal "Transaction not found", response_data["message"]
  end

  test "should return 404 for malformed id" do
    get api_v1_transaction_url(999999), headers: api_headers(@api_key)
    assert_response :not_found

    response_data = JSON.parse(response.body)
    assert_equal "not_found", response_data["error"]
    assert_equal "Transaction not found", response_data["message"]
  end

  test "should reject show request without API key" do
    get api_v1_transaction_url(@transaction)
    assert_response :unauthorized
  end

  # CREATE action tests
  test "should create transaction with valid parameters" do
    transaction_params = {
      transaction: {
        account_id: @account.id,
        name: "Test Transaction",
        amount: 25.00,
        date: Date.current,
        currency: "USD",
        nature: "expense"
      }
    }

    assert_difference("@account.entries.count", 1) do
      post api_v1_transactions_url,
           params: transaction_params,
           headers: api_headers(@api_key)
    end

    assert_response :created
    response_data = JSON.parse(response.body)
    assert_equal "Test Transaction", response_data["name"]
    assert_equal @account.id, response_data["account"]["id"]
    event = WebNotificationTransactionEvent.find_by!(entry_id: response_data["entry_id"])
    assert_equal "create:api", event.source
    assert_not event.baseline?
  end

  test "should create transaction with external idempotency key" do
    transaction_params = {
      transaction: {
        account_id: @account.id,
        name: "Imported Transaction",
        amount: 25.00,
        date: Date.current,
        currency: "USD",
        nature: "expense",
        external_id: "import-txn-1",
        source: "external_import"
      }
    }

    assert_difference("@account.entries.count", 1) do
      post api_v1_transactions_url,
           params: transaction_params,
           headers: api_headers(@api_key)
    end

    assert_response :created
    response_data = JSON.parse(response.body)
    assert_equal "import-txn-1", response_data["external_id"]
    assert_equal "external_import", response_data["source"]

    entry = @account.entries.find_by!(external_id: "import-txn-1", source: "external_import")
    assert_equal response_data["id"], entry.transaction.id
  end

  test "should create transaction protected from provider sync when user_modified is true" do
    transaction_params = {
      transaction: {
        account_id: @account.id,
        name: "Imported Transaction",
        amount: 25.00,
        date: Date.current,
        currency: "USD",
        nature: "expense",
        user_modified: true
      }
    }

    assert_difference("@account.entries.count", 1) do
      post api_v1_transactions_url,
           params: transaction_params,
           headers: api_headers(@api_key)
    end

    assert_response :created
    response_data = JSON.parse(response.body)
    assert_equal true, response_data["user_modified"]

    entry = Transaction.find(response_data["id"]).entry
    assert entry.user_modified?
    assert entry.protected_from_sync?
  end

  test "should not mark transaction user_modified by default" do
    transaction_params = {
      transaction: {
        account_id: @account.id,
        name: "Imported Transaction",
        amount: 25.00,
        date: Date.current,
        currency: "USD",
        nature: "expense"
      }
    }

    post api_v1_transactions_url, params: transaction_params, headers: api_headers(@api_key)

    assert_response :created
    response_data = JSON.parse(response.body)
    assert_equal false, response_data["user_modified"]
  end

  test "should use default source when external_id provided without source" do
    transaction_params = {
      transaction: {
        account_id: @account.id,
        name: "Imported Transaction",
        amount: 25.00,
        date: Date.current,
        currency: "USD",
        nature: "expense",
        external_id: "default-source-test"
      }
    }

    assert_difference("@account.entries.count", 1) do
      post api_v1_transactions_url,
           params: transaction_params,
           headers: api_headers(@api_key)
    end

    assert_response :created
    response_data = JSON.parse(response.body)
    entry = @account.entries.find_by!(external_id: "default-source-test")
    assert_equal "api", entry.source
    assert_equal "api", response_data["source"]

    assert_no_difference("@account.entries.count") do
      post api_v1_transactions_url,
           params: transaction_params.deep_merge(transaction: { name: "Changed Name" }),
           headers: api_headers(@api_key)
    end

    assert_response :ok
  end

  test "should reject source without external idempotency key" do
    transaction_params = {
      transaction: {
        account_id: @account.id,
        name: "Imported Transaction",
        amount: 25.00,
        date: Date.current,
        currency: "USD",
        nature: "expense",
        source: "external_import"
      }
    }

    assert_no_difference("@account.entries.count") do
      post api_v1_transactions_url,
           params: transaction_params,
           headers: api_headers(@api_key)
    end

    assert_response :unprocessable_entity
    response_data = JSON.parse(response.body)
    assert_equal "validation_failed", response_data["error"]
    assert_equal "Source requires external_id", response_data["message"]
    assert_equal [ "Source requires external_id" ], response_data["errors"]
  end

  test "should return existing transaction for duplicate external idempotency key" do
    transaction_params = {
      transaction: {
        account_id: @account.id,
        name: "Imported Transaction",
        amount: 25.00,
        date: Date.current,
        currency: "USD",
        nature: "expense",
        external_id: "import-txn-2",
        source: "external_import"
      }
    }

    post api_v1_transactions_url,
         params: transaction_params,
         headers: api_headers(@api_key)
    assert_response :created
    created_data = JSON.parse(response.body)

    assert_no_difference [ "@account.entries.count", "WebNotificationTransactionEvent.count" ] do
      post api_v1_transactions_url,
           params: transaction_params.deep_merge(transaction: { name: "Changed Name" }),
           headers: api_headers(@api_key)
    end

    assert_response :ok
    response_data = JSON.parse(response.body)
    assert_equal created_data["id"], response_data["id"]
    assert_equal "Imported Transaction", response_data["name"]
  end

  test "create rolls back the ledger when its durable notification observation fails" do
    WebNotificationTransactionEvent.expects(:observe!).raises(StandardError, "observation unavailable")

    assert_no_difference [ "Entry.count", "Transaction.count", "WebNotificationTransactionEvent.count" ] do
      post api_v1_transactions_url,
        params: { transaction: { account_id: @account.id, name: "Atomic API create", amount: 25,
          date: Date.current, currency: "USD", nature: "expense" } },
        headers: api_headers(@api_key)
    end
    assert_response :internal_server_error
  end

  test "should scope external idempotency keys to account" do
    other_account = @family.accounts.create!(
      name: "Other API Account",
      accountable: Depository.new,
      balance: 0,
      currency: "USD"
    )
    transaction_params = {
      transaction: {
        name: "Imported Transaction",
        amount: 25.00,
        date: Date.current,
        currency: "USD",
        nature: "expense",
        external_id: "shared-import-txn",
        source: "external_import"
      }
    }

    assert_difference("Entry.count", 2) do
      post api_v1_transactions_url,
           params: transaction_params.deep_merge(transaction: { account_id: @account.id }),
           headers: api_headers(@api_key)
      assert_response :created

      post api_v1_transactions_url,
           params: transaction_params.deep_merge(transaction: { account_id: other_account.id }),
           headers: api_headers(@api_key)
      assert_response :created
    end
  end

  test "should scope external idempotency keys to source" do
    transaction_params = {
      transaction: {
        account_id: @account.id,
        name: "Imported Transaction",
        amount: 25.00,
        date: Date.current,
        currency: "USD",
        nature: "expense",
        external_id: "shared-source-txn",
        source: "external_import"
      }
    }

    assert_difference("Entry.count", 2) do
      post api_v1_transactions_url,
           params: transaction_params,
           headers: api_headers(@api_key)
      assert_response :created

      post api_v1_transactions_url,
           params: transaction_params.deep_merge(transaction: { source: "other_import" }),
           headers: api_headers(@api_key)
      assert_response :created
    end

    @account.entries.find_by!(external_id: "shared-source-txn", source: "external_import")
    @account.entries.find_by!(external_id: "shared-source-txn", source: "other_import")
  end

  test "should reject external idempotency key collision with non-transaction entry" do
    @account.entries.create!(
      name: "Existing valuation",
      amount: 100,
      currency: "USD",
      date: Date.current,
      external_id: "import-non-transaction",
      source: "external_import",
      entryable: Valuation.new
    )

    post api_v1_transactions_url,
         params: {
           transaction: {
             account_id: @account.id,
             name: "Imported Transaction",
             amount: 25.00,
             date: Date.current - 1.day,
             currency: "USD",
             nature: "expense",
             external_id: "import-non-transaction",
             source: "external_import"
           }
         },
         headers: api_headers(@api_key)

    assert_response :unprocessable_entity
    response_data = JSON.parse(response.body)
    assert_equal "validation_failed", response_data["error"]
  end

  test "should reject create with read-only API key" do
    transaction_params = {
      transaction: {
        account_id: @account.id,
        name: "Test Transaction",
        amount: 25.00,
        date: Date.current
      }
    }

    post api_v1_transactions_url,
         params: transaction_params,
         headers: api_headers(@read_only_api_key)
    assert_response :forbidden
  end

  test "should reject create with invalid parameters" do
    transaction_params = {
      transaction: {
        # Missing required fields
        name: "Test Transaction"
      }
    }

    post api_v1_transactions_url,
         params: transaction_params,
         headers: api_headers(@api_key)
    assert_response :unprocessable_entity
  end

  test "should reject invalid date on create" do
    transaction_params = {
      transaction: {
        account_id: @account.id,
        name: "Invalid Date Transaction",
        amount: 25.00,
        date: "not-a-date",
        currency: "USD",
        nature: "expense"
      }
    }

    assert_no_difference("@account.entries.count") do
      post api_v1_transactions_url,
           params: transaction_params,
           headers: api_headers(@api_key)
    end

    assert_response :unprocessable_entity
    response_data = JSON.parse(response.body)
    assert_equal "validation_failed", response_data["error"]
    assert_equal "Transaction could not be created", response_data["message"]
    assert response_data["errors"].any? { |error| error.match?(/Date/) }
  end

  test "should reject create without API key" do
    post api_v1_transactions_url, params: { transaction: { name: "Test" } }
    assert_response :unauthorized
  end

  # UPDATE action tests
  test "should update transaction with valid parameters" do
    update_params = {
      transaction: {
        name: "Updated Transaction Name",
        amount: 30.00
      }
    }

    put api_v1_transaction_url(@transaction),
        params: update_params,
        headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    assert_equal "Updated Transaction Name", response_data["name"]
  end

  test "should touch category last_used_at when category changes via API" do
    category = categories(:food_and_drink)
    category.update!(last_used_at: nil)

    put api_v1_transaction_url(@transaction),
        params: { transaction: { category_id: category.id } },
        headers: api_headers(@api_key)
    assert_response :success

    assert_not_nil category.reload.last_used_at
  end

  test "should protect transaction from provider sync when updated with user_modified true" do
    update_params = {
      transaction: {
        name: "Client-owned Name",
        user_modified: true
      }
    }

    put api_v1_transaction_url(@transaction),
        params: update_params,
        headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    assert_equal "Client-owned Name", response_data["name"]
    assert_equal true, response_data["user_modified"]

    entry = @transaction.entry.reload
    assert entry.user_modified?
    assert entry.protected_from_sync?
  end

  test "should not change user_modified on update by default" do
    put api_v1_transaction_url(@transaction),
        params: { transaction: { name: "Updated Name Only" } },
        headers: api_headers(@api_key)
    assert_response :success

    assert_equal false, JSON.parse(response.body)["user_modified"]
    assert_not @transaction.entry.reload.user_modified?
  end

  test "should reject update with read-only API key" do
    update_params = {
      transaction: {
        name: "Updated Transaction Name"
      }
    }

    put api_v1_transaction_url(@transaction),
        params: update_params,
        headers: api_headers(@read_only_api_key)
    assert_response :forbidden
  end

  test "should reject update for non-existent transaction" do
    put api_v1_transaction_url(999999),
        params: { transaction: { name: "Test" } },
        headers: api_headers(@api_key)
    assert_response :not_found
  end

  test "should reject update without API key" do
    put api_v1_transaction_url(@transaction), params: { transaction: { name: "Test" } }
    assert_response :unauthorized
  end

  test "should preserve tags when tag_ids not provided in update" do
    # Set up transaction with existing tags
    original_tags = [ Tag.first, Tag.second ]
    @transaction.tags = original_tags
    @transaction.save!

    # Update only the name, without providing tag_ids
    update_params = {
      transaction: {
        name: "Updated Name Only"
      }
    }

    put api_v1_transaction_url(@transaction),
        params: update_params,
        headers: api_headers(@api_key)
    assert_response :success

    @transaction.reload
    assert_equal "Updated Name Only", @transaction.entry.name
    # Tags should be preserved since tag_ids was not in the request
    assert_equal original_tags.map(&:id).sort, @transaction.tag_ids.sort
  end

  test "should clear tags when empty tag_ids explicitly provided in update" do
    # Set up transaction with existing tags
    @transaction.tags = [ Tag.first, Tag.second ]
    @transaction.save!

    # Explicitly provide empty tag_ids to clear tags
    update_params = {
      transaction: {
        name: "Updated Name",
        tag_ids: []
      }
    }

    put api_v1_transaction_url(@transaction),
        params: update_params,
        headers: api_headers(@api_key)
    assert_response :success

    @transaction.reload
    # Tags should be cleared since tag_ids was explicitly provided as empty
    assert_empty @transaction.tags
  end

  test "should update tags when tag_ids explicitly provided in update" do
    # Set up transaction with one tag
    @transaction.tags = [ Tag.first ]
    @transaction.save!

    new_tags = [ Tag.second ]

    update_params = {
      transaction: {
        tag_ids: new_tags.map(&:id)
      }
    }

    put api_v1_transaction_url(@transaction),
        params: update_params,
        headers: api_headers(@api_key)
    assert_response :success

    @transaction.reload
    assert_equal new_tags.map(&:id), @transaction.tag_ids
  end

  # DESTROY action tests
  test "should destroy transaction" do
  entry_to_delete = @account.entries.create!(
    name: "Transaction to Delete",
    amount: 10.00,
    currency: "USD",
    date: Date.current,
    entryable: Transaction.new
  )
  transaction_to_delete = entry_to_delete.transaction

  assert_difference("@account.entries.count", -1) do
    delete api_v1_transaction_url(transaction_to_delete), headers: api_headers(@api_key)
  end

  assert_response :success
  response_data = JSON.parse(response.body)
  assert response_data.key?("message")
end

  test "should reject destroy with read-only API key" do
    delete api_v1_transaction_url(@transaction), headers: api_headers(@read_only_api_key)
    assert_response :forbidden
  end

  test "should reject destroy for non-existent transaction" do
    delete api_v1_transaction_url(999999), headers: api_headers(@api_key)
    assert_response :not_found
  end

  test "should reject destroy without API key" do
    delete api_v1_transaction_url(@transaction)
    assert_response :unauthorized
  end

  # JSON structure tests
  test "transaction JSON should have expected structure" do
    get api_v1_transaction_url(@transaction), headers: api_headers(@api_key)
    assert_response :success

    transaction_data = JSON.parse(response.body)

    # Basic fields
    assert transaction_data.key?("id")
    assert transaction_data.key?("date")
    assert transaction_data.key?("amount")
    assert transaction_data.key?("currency")
    assert transaction_data.key?("name")
    assert transaction_data.key?("classification")
    assert transaction_data.key?("created_at")
    assert transaction_data.key?("updated_at")

    # Account information
    assert transaction_data.key?("account")
    assert transaction_data["account"].key?("id")
    assert transaction_data["account"].key?("name")
    assert transaction_data["account"].key?("account_type")

    # Optional fields should be present (even if nil)
    assert transaction_data.key?("category")
    assert transaction_data.key?("merchant")
    assert transaction_data.key?("tags")
    assert transaction_data.key?("transfer")
    assert transaction_data.key?("notes")
  end

  test "transactions with transfers should include transfer information" do
    transfer = create_transfer_between_accounts

    get api_v1_transaction_url(transfer.inflow_transaction), headers: api_headers(@api_key)
    assert_response :success

    transaction_data = JSON.parse(response.body)
    assert_not_nil transaction_data["transfer"]
    assert transaction_data["transfer"].key?("id")
    assert transaction_data["transfer"].key?("amount")
    assert transaction_data["transfer"].key?("currency")
    assert transaction_data["transfer"].key?("other_account")
  end

  test "index renders transfer rows without per-transfer transaction lookups" do
    transfer = create_transfer_between_accounts

    queries = capture_sql_queries do
      get api_v1_transactions_url,
          params: { per_page: 100 },
          headers: api_headers(@api_key)
    end

    assert_response :success

    response_data = JSON.parse(response.body)
    transfer_transaction_ids = [ transfer.inflow_transaction_id, transfer.outflow_transaction_id ]
    transfer_rows = response_data["transactions"].select { |transaction| transfer_transaction_ids.include?(transaction["id"]) }

    assert_equal 2, transfer_rows.size
    assert transfer_rows.all? { |transaction| transaction["transfer"].present? }
    assert_empty queries.grep(/SELECT "transactions"\.\* FROM "transactions" WHERE "transactions"\."id" =/)
    assert_empty queries.grep(/SELECT "entries"\.\* FROM "entries" WHERE "entries"\."id" =/)
    assert_empty queries.grep(/SELECT "accounts"\.\* FROM "accounts" WHERE "accounts"\."id" =/)
  end

  private

    def api_headers(api_key)
      { "X-Api-Key" => api_key.display_key }
    end

    def count_db_queries(&block)
      queries = 0
      callback = lambda do |_name, _started, _finished, _unique_id, payload|
        return if payload[:cached]
        return if payload[:name].in?(%w[SCHEMA TRANSACTION])

        queries += 1
      end

      ActiveSupport::Notifications.subscribed(callback, "sql.active_record", &block)
      queries
    end

    def create_transfer_between_accounts
      from_account = @family.accounts.create!(
        name: "Transfer From Account",
        balance: 1000,
        currency: "USD",
        accountable: Depository.new
      )

      to_account = @family.accounts.create!(
        name: "Transfer To Account",
        balance: 0,
        currency: "USD",
        accountable: Depository.new
      )

      Transfer::Creator.new(
        family: @family,
        source_account_id: from_account.id,
        destination_account_id: to_account.id,
        date: Date.current,
        amount: 100
      ).create
    end

    def capture_sql_queries
      queries = []
      callback = lambda do |_name, _started, _finished, _unique_id, payload|
        next if payload[:cached]
        next if %w[SCHEMA TRANSACTION].include?(payload[:name])

        queries << payload[:sql].squish
      end

      ActiveSupport::Notifications.subscribed(callback, "sql.active_record") do
        yield
      end

      queries
    end

    # Validates agent-friendly numeric fields: type, sign invariants
    def assert_amount_cents_fields(txn_json)
      assert txn_json.key?("amount_cents"), "Expected amount_cents field"
      assert txn_json.key?("signed_amount_cents"), "Expected signed_amount_cents field"
      assert_kind_of Integer, txn_json["amount_cents"]
      assert_kind_of Integer, txn_json["signed_amount_cents"]
      assert_operator txn_json["amount_cents"], :>=, 0, "amount_cents must be non-negative"
      assert_equal txn_json["amount_cents"].abs, txn_json["signed_amount_cents"].abs,
                   "Absolute values of amount_cents and signed_amount_cents must match"
      if txn_json["classification"] == "income"
        assert_operator txn_json["signed_amount_cents"], :>=, 0,
                        "income transactions should have non-negative signed_amount_cents"
      else
        assert_operator txn_json["signed_amount_cents"], :<=, 0,
                        "non-income transactions should have non-positive signed_amount_cents"
      end
    end
    def create_disabled_account_transaction(name:, date: Date.current)
      create_account_transaction(status: "disabled", name: name, date: date)
    end

    test "index exposes parent_entry_id and split_parents for grouped headers" do
      parent_entry = create_transaction(amount: 56, name: "Delta Airlines", account: @account)
      parent_entry.split!([
        { name: "Whatever", amount: 46, category_id: nil },
        { name: "Delta Airlines", amount: 10, category_id: nil }
      ])

      get api_v1_transactions_url, headers: api_headers(@read_only_api_key)
      assert_response :success

      body = JSON.parse(response.body)
      children = body["transactions"].select { |t| t["parent_entry_id"] == parent_entry.id }
      assert_equal 2, children.length, "expected both split children with parent_entry_id"

      parents = body["split_parents"]
      header = parents.find { |p| p["entry_id"] == parent_entry.id }
      assert_not_nil header, "expected split_parents to include the parent entry"
      assert_equal "Delta Airlines", header["name"]
    end

    test "index keeps split groups intact across page boundaries" do
      parent_entry = create_transaction(amount: 56, name: "Split Parent", account: @account)
      parent_entry.split!([
        { name: "Child One", amount: 46, category_id: nil },
        { name: "Child Two", amount: 10, category_id: nil }
      ])

      get api_v1_transactions_url, params: { per_page: 1 }, headers: api_headers(@read_only_api_key)
      assert_response :success

      body = JSON.parse(response.body)
      page_ids = body["transactions"].map { |t| t["id"] }
      parent_ids = body["transactions"].map { |t| t["parent_entry_id"] }.compact.uniq
      # Siblings ride along even when pagination would strand them
      header_ids = body["split_parents"].map { |p| p["entry_id"] }
      assert parent_ids.all? { |pid|
        body["transactions"].count { |t| t["parent_entry_id"] == pid } > 1 ||
          header_ids.include?(pid)
      }, "expected groups intact, got #{page_ids.length} rows"
    end

    test "show includes split_children for split parent" do
      parent_entry = create_transaction(amount: 56, name: "Delta Airlines", account: @account)
      parent_entry.split!([
        { name: "Delta Airlines", amount: 10, category_id: categories(:food_and_drink).id },
        { name: "Whatever", amount: 46, category_id: nil }
      ])

      get api_v1_transaction_url(parent_entry.entryable), headers: api_headers(@read_only_api_key)
      assert_response :success

      body = JSON.parse(response.body)
      assert_equal 2, body["split_children"].length
      names = body["split_children"].map { |c| c["name"] }
      assert_includes names, "Delta Airlines"
      assert_includes names, "Whatever"
      categorized = body["split_children"].find { |c| c["name"] == "Delta Airlines" }
      assert_equal "Food & Drink", categorized["category_name"]
      assert_nil body["split_parent"]
    end

    test "split detail preserves transfer accounts when editing outflows and inflows" do
      counterpart = @family.accounts.create!(
        name: "Escrow", balance: 0, currency: "USD", owner: @user, accountable: Depository.new
      )

      [ 1, -1 ].each do |direction|
        parent_entry = create_transaction(amount: direction * 56, name: "Mortgage", account: @account)
        parent_entry.split!([
          { name: "Mortgage payment", amount: direction * 10 },
          { name: "Mortgage escrow contribution", amount: direction * 46, transfer_account: counterpart }
        ])

        get api_v1_transaction_url(parent_entry.entryable), headers: api_headers(@read_only_api_key)
        assert_response :success
        children = JSON.parse(response.body)["split_children"]
        escrow = children.find { |child| child["name"] == "Mortgage escrow contribution" }
        payment = children.find { |child| child["name"] == "Mortgage payment" }
        assert_equal counterpart.id, escrow["transfer_account_id"]
        assert_nil payment["transfer_account_id"]

        patch api_v1_transaction_split_url(parent_entry.entryable),
          params: { split: { splits: children.map { |child|
            {
              name: child["name"],
              amount: direction * (child["name"] == escrow["name"] ? -46 : -10),
              transfer_account_id: child["transfer_account_id"]
            }
          } } },
          headers: api_headers(@api_key)
        assert_response :success

        updated_escrow = parent_entry.reload.child_entries.find_by!(name: escrow["name"])
        transfer = updated_escrow.transaction.transfer
        assert_not_nil transfer
        other_entry = direction.positive? ? transfer.inflow_transaction.entry : transfer.outflow_transaction.entry
        assert_equal counterpart.id, other_entry.account_id
        assert_equal direction * -46, other_entry.amount
      end
    end

    test "show includes split_parent for split child" do
      parent_entry = create_transaction(amount: 56, name: "Delta Airlines", account: @account)
      children = parent_entry.split!([
        { name: "Delta Airlines", amount: 10, category_id: nil },
        { name: "Whatever", amount: 46, category_id: nil }
      ])

      get api_v1_transaction_url(children.first.entryable), headers: api_headers(@read_only_api_key)
      assert_response :success

      body = JSON.parse(response.body)
      assert_equal [], body["split_children"]
      assert_equal parent_entry.id, body["split_parent"]["entry_id"]
      assert_equal "Delta Airlines", body["split_parent"]["name"]
    end

    test "update toggles one_time kind" do
      entry = create_transaction(amount: 50, name: "Concert", account: @account)
      transaction = entry.entryable
      assert_equal "standard", transaction.kind

      patch api_v1_transaction_url(transaction),
        params: { transaction: { kind: "one_time" } },
        headers: api_headers(@api_key)
      assert_response :success
      assert_equal "one_time", transaction.reload.kind
      assert_equal "one_time", JSON.parse(response.body)["kind"]

      patch api_v1_transaction_url(transaction),
        params: { transaction: { kind: "standard" } },
        headers: api_headers(@api_key)
      assert_response :success
      assert_equal "standard", transaction.reload.kind
    end

    test "update rejects invalid kind" do
      entry = create_transaction(amount: 50, name: "Concert", account: @account)

      patch api_v1_transaction_url(entry.entryable),
        params: { transaction: { kind: "bogus" } },
        headers: api_headers(@api_key)
      assert_response :success
      assert_equal "standard", entry.entryable.reload.kind
    end

    test "mark_as_recurring creates recurring transaction" do
      entry = create_transaction(amount: 42, name: "Gym", account: @account)

      post mark_as_recurring_api_v1_transaction_url(entry.entryable),
        headers: api_headers(@api_key)
      assert_response :created

      body = JSON.parse(response.body)
      assert body["id"].present?
      assert entry.entryable.reload.existing_manual_recurring_transaction.present?
    end

    test "mark_as_recurring rejects duplicates" do
      entry = create_transaction(amount: 42, name: "Gym", account: @account)
      transaction = entry.entryable
      RecurringTransaction.create_from_transaction(transaction)

      post mark_as_recurring_api_v1_transaction_url(transaction),
        headers: api_headers(@api_key)
      assert_response :unprocessable_entity
    end

    test "mark_as_recurring requires write scope" do
      entry = create_transaction(amount: 42, name: "Gym", account: @account)

      post mark_as_recurring_api_v1_transaction_url(entry.entryable),
        headers: api_headers(@read_only_api_key)
      assert_response :forbidden
    end

    test "update sets investment_activity_label" do
      entry = create_transaction(amount: 100, name: "AAPL Buy", account: @account)

      patch api_v1_transaction_url(entry.entryable),
        params: { transaction: { investment_activity_label: "Buy" } },
        headers: api_headers(@api_key)
      assert_response :success
      assert_equal "Buy", entry.entryable.reload.investment_activity_label
      assert_equal "Buy", JSON.parse(response.body)["investment_activity_label"]
    end

    test "update clears investment_activity_label with invalid value" do
      entry = create_transaction(amount: 100, name: "AAPL Buy", account: @account)
      entry.entryable.update!(investment_activity_label: "Buy")

      patch api_v1_transaction_url(entry.entryable),
        params: { transaction: { investment_activity_label: "Bogus" } },
        headers: api_headers(@api_key)
      assert_response :success
      assert_nil entry.entryable.reload.investment_activity_label
    end

    test "unlock clears sync protection" do
      entry = create_transaction(amount: 50, name: "Locked", account: @account)
      entry.update!(user_modified: true)
      assert entry.reload.protected_from_sync?

      post unlock_api_v1_transaction_url(entry.entryable),
        headers: api_headers(@api_key)
      assert_response :success
      refute entry.reload.protected_from_sync?
    end

    test "unlock requires write scope" do
      entry = create_transaction(amount: 50, name: "Locked", account: @account)

      post unlock_api_v1_transaction_url(entry.entryable),
        headers: api_headers(@read_only_api_key)
      assert_response :forbidden
    end

    test "show includes protection and empty bill allocations" do
      entry = create_transaction(amount: 50, name: "Protected", account: @account)
      entry.update!(user_modified: true)

      get api_v1_transaction_url(entry.entryable), headers: api_headers(@read_only_api_key)
      assert_response :success

      body = JSON.parse(response.body)
      assert_equal true, body["protected_from_sync"]
      assert_equal [], body["bill_allocations"]
    end

    test "show includes potential_duplicate suggestion" do
      posted = create_transaction(amount: -50, name: "Posted Coffee", account: @account)
      pending_entry = create_transaction(amount: -50, name: "Pending Coffee", account: @account)
      pending_entry.entryable.update!(
        extra: {
          "simplefin" => { "pending" => true },
          "potential_posted_match" => {
            "entry_id" => posted.id,
            "reason" => "fuzzy_match",
            "confidence" => "high",
            "posted_amount" => "-50.0"
          }
        }
      )

      get api_v1_transaction_url(pending_entry.entryable), headers: api_headers(@read_only_api_key)
      assert_response :success

      duplicate = JSON.parse(response.body)["potential_duplicate"]
      assert_not_nil duplicate
      assert_equal posted.id, duplicate["entry_id"]
      assert_equal "Posted Coffee", duplicate["name"]
    end

    test "show omits potential_duplicate without suggestion" do
      entry = create_transaction(amount: 50, name: "Plain", account: @account)

      get api_v1_transaction_url(entry.entryable), headers: api_headers(@read_only_api_key)
      assert_response :success

      assert_nil JSON.parse(response.body)["potential_duplicate"]
    end

    test "dismiss_duplicate clears suggestion" do
      posted = create_transaction(amount: -50, name: "Posted", account: @account)
      pending_entry = create_transaction(amount: -50, name: "Pending", account: @account)
      pending_entry.entryable.update!(
        extra: {
          "simplefin" => { "pending" => true },
          "potential_posted_match" => { "entry_id" => posted.id }
        }
      )

      post dismiss_duplicate_api_v1_transaction_url(pending_entry.entryable),
        headers: api_headers(@api_key)
      assert_response :success

      get api_v1_transaction_url(pending_entry.entryable), headers: api_headers(@read_only_api_key)
      assert_nil JSON.parse(response.body)["potential_duplicate"]
    end

    test "dismiss_duplicate requires write scope" do
      entry = create_transaction(amount: 50, name: "Plain", account: @account)

      post dismiss_duplicate_api_v1_transaction_url(entry.entryable),
        headers: api_headers(@read_only_api_key)
      assert_response :forbidden
    end

    test "merge_duplicate merges pending into posted" do
      posted = create_transaction(amount: -50, name: "Posted Coffee", account: @account)
      pending_entry = create_transaction(amount: -50, name: "Pending Coffee", account: @account)
      pending_entry.entryable.update!(
        extra: {
          "simplefin" => { "pending" => true },
          "potential_posted_match" => { "entry_id" => posted.id }
        }
      )

      post merge_duplicate_api_v1_transaction_url(pending_entry.entryable),
        headers: api_headers(@api_key)
      assert_response :success
      assert_nil Entry.find_by(id: pending_entry.id)
    end

    test "merge_duplicate rejects without suggestion" do
      entry = create_transaction(amount: 50, name: "Plain", account: @account)

      post merge_duplicate_api_v1_transaction_url(entry.entryable),
        headers: api_headers(@api_key)
      assert_response :unprocessable_entity
    end

    def create_account_transaction(status:, name:, date: Date.current)
      account = @family.accounts.create!(
        name: "#{status.titleize} Checking #{SecureRandom.hex(4)}",
        balance: 0,
        currency: "USD",
        status: status,
        accountable: Depository.new
      )

      entry = account.entries.create!(
        name: name,
        amount: 12.34,
        currency: "USD",
        date: date,
        entryable: Transaction.new
      )

      entry.transaction
    end
end
