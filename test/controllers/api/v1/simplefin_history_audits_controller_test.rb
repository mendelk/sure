require "test_helper"

class Api::V1::SimplefinHistoryAuditsControllerTest < ActionDispatch::IntegrationTest
  setup do
    travel_to Time.utc(2026, 10, 19, 12)
    @user = users(:family_admin)
    @family = @user.family
    @account = @family.accounts.create!(owner: @user, name: "Continuous card", currency: "USD", balance: 29.72, accountable: CreditCard.new)
    @item = @family.simplefin_items.create!(name: "History connection", access_url: "https://example.com/audit")
    @item.syncs.create!(status: "completed", completed_at: 1.hour.ago)
    @provider = make_provider("new-card")
    AccountProvider.create!(account: @account, provider: @provider)
    @user.api_keys.active.destroy_all
    @key = ApiKey.create!(user: @user, name: "History writer", scopes: [ "read_write" ], source: "web", display_key: SecureRandom.hex(24))
    @read_key = ApiKey.create!(user: @user, name: "History reader", scopes: [ "read" ], source: "mobile", display_key: SecureRandom.hex(24))
  end

  teardown { travel_back }

  test "reports fresh missing activity without changing financial data or normal sync state" do
    stub_history([ raw_transaction("missing") ])
    before = [ @account.attributes, @provider.attributes, @item.attributes, @item.last_synced_at ]

    assert_no_difference [ "Entry.count", "Transaction.count", "Valuation.count", "Transfer.count", "AccountProvider.count", "SimplefinTransactionIdentity.count", "Sync.count" ] do
      audit(start_date: "2026-09-01", end_date: "2026-09-30")
      assert_response :success
    end

    assert_equal before, [ @account.reload.attributes, @provider.reload.attributes, @item.reload.attributes, @item.last_synced_at ]
    transaction = response.parsed_body.fetch("transactions").sole
    assert_equal "missing", transaction.fetch("status")
    assert_equal "144.81", transaction.fetch("amount")
    assert_equal "2026-09-15", transaction.fetch("date")
    assert_equal "USD", transaction.fetch("currency")
    assert_equal "Card payment - AUTOPAY", transaction.fetch("name")
    assert_nil response.parsed_body.fetch("next_cursor")
    assert response.parsed_body.dig("coverage", "page_complete")
    refute response.parsed_body.dig("coverage", "provider_history_complete")
  end

  test "a manually repaired payment is a review candidate not a second payment" do
    checking = @family.accounts.create!(owner: @user, name: "Checking", currency: "USD", balance: 0, accountable: Depository.new)
    payment = make_entry(amount: -144.81, name: "Manual card payment")
    outflow = checking.entries.create!(date: payment.date, name: "Bank payment", currency: "USD", amount: 144.81, entryable: Transaction.new(kind: "cc_payment"))
    transfer = Transfer.create!(inflow_transaction: payment.transaction, outflow_transaction: outflow.transaction, status: "confirmed")
    wrong_sign = make_entry(amount: 144.81)
    wrong_currency = make_entry(amount: -144.81, currency: "EUR")
    too_old = make_entry(amount: -144.81, date: Date.new(2026, 9, 10))
    stub_history([ raw_transaction("card-payment", amount: "144.81") ])

    assert_no_difference [ "Entry.count", "Transfer.count", "SimplefinTransactionIdentity.count" ] do
      audit(start_date: "2026-09-01", end_date: "2026-09-30")
    end
    result = response.parsed_body.fetch("transactions").sole
    assert_equal "possible_match", result.fetch("status")
    assert_equal [ payment.id ], result.fetch("possible_matches").map { |candidate| candidate.fetch("entry_id") }
    assert_not_includes result.to_json, wrong_sign.id
    assert_not_includes result.to_json, wrong_currency.id
    assert_not_includes result.to_json, too_old.id
    assert_nil payment.reload.external_id
    assert_equal payment.entryable_id, transfer.reload.inflow_transaction_id
    assert_equal outflow.entryable_id, transfer.outflow_transaction_id
  end

  test "provider scoped aliases and tombstones survive replacement ID collisions" do
    old = make_provider("old-card", retired_at: Time.current, retired_account: @account)
    existing = make_entry(amount: 144.81, source: "mfs_v2", external_id: "csv-id")
    SimplefinTransactionIdentity.create!(simplefin_account: old, external_id: "simplefin_shared", entry: existing, duplicate: true)
    SimplefinTransactionIdentity.create!(simplefin_account: @provider, external_id: "simplefin_deleted", entry: nil)
    stub_history([ raw_transaction("shared"), raw_transaction("deleted") ], { old.account_id => [ raw_transaction("shared") ] })

    audit(start_date: "2026-09-01", end_date: "2026-09-30")
    assert_response :success
    rows = response.parsed_body.fetch("transactions")
    retired_row = rows.find { |row| row["simplefin_account_id"] == old.id }
    current_row = rows.find { |row| row["simplefin_account_id"] == @provider.id && row["provider_transaction_id"] == "shared" }
    assert_equal "recorded", retired_row.fetch("status")
    assert_equal existing.id, retired_row.fetch("entry_id")
    assert_equal "possible_match", current_row.fetch("status"), "The old feed's alias must not claim a new feed's same ID"
    assert_equal "intentionally_deleted", rows.find { |row| row["provider_transaction_id"] == "deleted" }.fetch("status")
    assert_equal [ old.id, @provider.id ].sort, response.parsed_body.fetch("feeds").map { |feed| feed.fetch("simplefin_account_id") }.sort
  end

  test "legacy external IDs are recognized for an unreplaced feed" do
    existing = make_entry(source: "simplefin", external_id: "simplefin_legacy")
    stub_history([ raw_transaction("legacy") ])
    audit(start_date: "2026-09-15", end_date: "2026-09-15")
    row = response.parsed_body.fetch("transactions").sole
    assert_equal "recorded", row.fetch("status")
    assert_equal existing.id, row.fetch("entry_id")
  end

  test "continues beyond empty windows and a year with inclusive date boundaries" do
    historical = raw_transaction("old-missing", date: Date.new(2025, 1, 1))
    requested = []
    stub_request(:get, %r{\Ahttps://example\.com/audit/accounts\?}).to_return do |request|
      query = URI.decode_www_form(request.uri.query).to_h
      start_time, end_time = query.fetch("start-date").to_i, query.fetch("end-date").to_i
      requested << [ start_time, end_time ]
      rows = historical[:posted].between?(start_time, end_time - 1) ? [ historical ] : []
      { status: 200, body: { errors: [], accounts: [ { id: @provider.account_id, transactions: rows } ] }.to_json }
    end

    cursor = nil
    found = []
    loop do
      audit(cursor ? { cursor: cursor } : { start_date: "2025-01-01", end_date: "2026-10-19" })
      assert_response :success
      found.concat(response.parsed_body.fetch("transactions").map { |row| row.fetch("provider_transaction_id") })
      cursor = response.parsed_body.fetch("next_cursor")
      break unless cursor
    end

    assert_equal [ "old-missing" ], found
    assert_equal Time.utc(2025, 1, 1).to_i, requested.last.first
    assert_equal Time.utc(2026, 10, 20).to_i, requested.first.last
    requested.each_cons(2) { |newer, older| assert_equal newer.first, older.last, "History pages must have no boundary gaps" }
    assert requested.all? { |start_time, end_time| end_time - start_time <= 60.days }
  end

  test "queries only associated feeds even if the bridge returns unrelated accounts" do
    unrelated = make_provider("unrelated")
    request = stub_history([ raw_transaction("ours") ], { unrelated.account_id => [ raw_transaction("private") ] }).with do |outbound|
      pairs = URI.decode_www_form(outbound.uri.query)
      pairs.select { |name, _| name == "account" }.map(&:last) == [ @provider.account_id ] &&
        pairs.none? { |name, _| name == "pending" }
    end
    audit(start_date: "2026-09-01", end_date: "2026-09-30")
    assert_response :success
    assert_equal [ "ours" ], response.parsed_body.fetch("transactions").map { |row| row.fetch("provider_transaction_id") }
    assert_requested request
  end

  test "multiple connections are each visited before moving to an older window" do
    other_item = @family.simplefin_items.create!(name: "Previous connection", access_url: "https://example.com/other-audit")
    old = other_item.simplefin_accounts.create!(name: "Retired", account_id: "old", account_type: "credit", currency: "USD", current_balance: 0,
      retired_at: Time.current, retired_account: @account)
    stub_history([])
    stub_request(:get, %r{\Ahttps://example\.com/other-audit/accounts\?}).to_return(body: { errors: [], accounts: [ { id: old.account_id, transactions: [ raw_transaction("old-feed-missing") ] } ] }.to_json)
    windows, ids = [], []
    cursor = nil
    2.times do
      audit(cursor ? { cursor: cursor } : { start_date: "2026-09-01", end_date: "2026-09-30" })
      assert_response :success
      windows << response.parsed_body.fetch("coverage").slice("window_start_date", "window_end_date")
      ids.concat(response.parsed_body.fetch("transactions").map { |row| row.fetch("provider_transaction_id") })
      cursor = response.parsed_body.fetch("next_cursor")
    end
    assert_equal windows.first, windows.last
    assert_equal [ "old-feed-missing" ], ids
    assert_nil cursor
  end

  test "partial errors unavailable feeds and malformed transactions provide retry coverage" do
    old = make_provider("unavailable", retired_at: Time.current, retired_account: @account)
    stub_history([ raw_transaction("bad", amount: "not-money"), { description: "No identity" }, raw_transaction("pending").merge(pending: true) ], {}, errors: [ "Private upstream details" ])
    audit(start_date: "2026-09-01", end_date: "2026-09-30")
    assert_response :success
    body = response.parsed_body
    refute body.dig("coverage", "page_complete")
    assert_equal 2, body.dig("summary", "invalid")
    assert_equal 1, body.dig("summary", "pending")
    assert_equal 0, body.dig("summary", "missing")
    assert_equal %w[provider_errors feed_unavailable unresolved_transactions], body.fetch("warnings").map { |warning| warning.fetch("code") }
    refute body.fetch("feeds").find { |feed| feed["simplefin_account_id"] == old.id }.fetch("returned")
    assert body.fetch("retry_cursor")
    assert_not_includes response.body, "Private upstream details"
    diagnostic = DebugLogEntry.where(account: @account, category: "simplefin_history_audit").sole
    assert_equal "partial_response", diagnostic.metadata.fetch("code")
  end

  test "retains provider error explanations and scope only in support diagnostics" do
    stub_history([], errors: [ "Bank temporarily unavailable" ], errlist: [
      { code: "con.auth", msg: "Reconnect your bank", conn_id: "CON-bank", account_id: "ACT-card",
        access_url: "https://private.example/secret", transactions: [ { amount: "private-amount" } ] }
    ])

    audit(start_date: "2026-09-01", end_date: "2026-09-30")

    assert_response :success
    refute response.parsed_body.dig("coverage", "page_complete")
    metadata = DebugLogEntry.where(account: @account, category: "simplefin_history_audit").sole.metadata
    assert_equal [ "Bank temporarily unavailable" ], metadata.fetch("provider_errors").fetch("errors")
    assert_equal [ { "code" => "con.auth", "msg" => "Reconnect your bank", "conn_id" => "CON-bank", "account_id" => "ACT-card" } ],
      metadata.fetch("provider_errors").fetch("errlist")
    assert_equal @item.id, metadata.fetch("simplefin_item_id")
    assert_equal "2026-09-01", metadata.fetch("window_start_date")
    assert_equal "2026-09-30", metadata.fetch("window_end_date")
    assert_not_includes metadata.to_json, "private"
    assert_not_includes response.body, "Reconnect your bank"
    assert_not_includes response.body, "Bank temporarily unavailable"
  end

  test "redacts credentials and URLs before bounding provider error diagnostics" do
    @item.update!(access_url: "https://audit-user:audit%2Fpassword@example.com/audit")
    encoded_credentials = Base64.strict_encode64("audit-user:audit%2Fpassword")
    message = "Bank unavailable: #{@item.access_url} audit-user audit%2Fpassword audit/password " \
      "https://bank.example/reconnect?token=private-link Authorization: Bearer private-bearer " \
      "refresh_token=private-token password=\"private password\" #{encoded_credentials}"
    stub_request(:get, %r{\Ahttps://example\.com/audit/accounts\?})
      .to_return(body: { accounts: [], errlist: [ { code: "con.auth", msg: message, token: "private-field" } ] }.to_json)

    audit

    assert_response :success
    metadata = DebugLogEntry.where(account: @account, category: "simplefin_history_audit").sole.metadata
    error = metadata.fetch("provider_errors").fetch("errlist").sole
    assert_equal "con.auth", error.fetch("code")
    assert_includes error.fetch("msg"), "Bank unavailable:"
    assert_includes error.fetch("msg"), "[FILTERED]"
    %w[audit-user audit%2Fpassword audit/password private- example.com bank.example].each do |secret|
      assert_not_includes metadata.to_json, secret
    end
    assert_not_includes metadata.to_json, encoded_credentials
    assert_not_includes response.body, "Bank unavailable:"
  end

  test "bounds provider error diagnostics and ignores unexpected nested error data" do
    stub_history([], errors: [ "x" * 2_000 ] * 30, errlist: [
      { msg: { token: "nested-secret" }, code: "gen.api", unknown: "private-field" }
    ])

    audit

    assert_response :success
    details = DebugLogEntry.where(account: @account, category: "simplefin_history_audit").sole.metadata.fetch("provider_errors")
    assert_equal [ "x" * 1_000 ] * 20, details.fetch("errors")
    assert_equal [ { "code" => "gen.api" } ], details.fetch("errlist")
    assert_not_includes details.to_json, "secret"
    assert_not_includes details.to_json, "private"
  end

  test "duplicate provider rows do not invent missing payments and conflicting duplicates remain unresolved" do
    same = raw_transaction("duplicate")
    stub_history([ same, same, raw_transaction("conflict"), raw_transaction("conflict", amount: "-1.00") ])
    audit(start_date: "2026-09-01", end_date: "2026-09-30")
    assert_equal 1, response.parsed_body.dig("summary", "missing")
    assert_equal 1, response.parsed_body.dig("summary", "invalid")
    refute response.parsed_body.dig("coverage", "page_complete")
  end

  test "cursors reject tampering cross account replay changed feeds and mixed parameters" do
    stub_history([])
    audit
    assert_response :success
    cursor = response.parsed_body.fetch("next_cursor")
    audit(cursor: cursor + "tampered")
    assert_response :unprocessable_entity
    audit(cursor: cursor, start_date: "2026-09-01")
    assert_response :unprocessable_entity
    another = @family.accounts.create!(owner: @user, name: "Other card", currency: "USD", balance: 0, accountable: CreditCard.new)
    another_provider = make_provider("other-card")
    AccountProvider.create!(account: another, provider: another_provider)
    post api_v1_account_simplefin_history_audit_path(another), params: { cursor: cursor }, headers: api_headers(@key), as: :json
    assert_response :unprocessable_entity
    make_provider("new-retired-feed", retired_at: Time.current, retired_account: @account)
    audit(cursor: cursor)
    assert_response :conflict
    assert_equal "stale_cursor", response.parsed_body.fetch("error")
  end

  test "invalid dates malformed scalars and unavailable SimpleFIN return actionable errors" do
    [ { start_date: "2026-02-30" }, { start_date: [ "2026-09-01" ] }, { cursor: {} },
      { start_date: "2026-10-20" }, { start_date: "1969-12-31" }, { start_date: "2026-10-19", end_date: "2026-09-01" } ].each do |params|
      audit(params)
      assert_response :unprocessable_entity
    end
    @account.account_providers.destroy_all
    audit
    assert_response :unprocessable_entity
    assert_equal "simplefin_unavailable", response.parsed_body.fetch("error")
  end

  test "upstream failures are sanitized and do not advance or import anything" do
    request = stub_request(:get, %r{\Ahttps://example\.com/audit/accounts\?}).to_return(status: 429, body: "secret")
    audit
    assert_response :too_many_requests
    assert_equal "provider_rate_limited", response.parsed_body.fetch("error")
    assert_not_includes response.body, "secret"
    remove_request_stub(request)
    stub_request(:get, %r{\Ahttps://example\.com/audit/accounts\?}).to_return(status: 200, body: "not json")
    audit
    assert_response :bad_gateway
    assert_equal "provider_error", response.parsed_body.fetch("error")
  end

  test "authentication scope role account permissions and family boundaries precede provider requests" do
    Provider::Simplefin.any_instance.expects(:get_accounts).never
    post api_v1_account_simplefin_history_audit_path(@account), params: {}, as: :json
    assert_response :unauthorized
    post api_v1_account_simplefin_history_audit_path(@account), params: {}, headers: api_headers(@read_key), as: :json
    assert_response :forbidden
    @user.update!(role: "member")
    audit
    assert_response :forbidden
    @user.update!(role: "admin")
    other_family = Family.create!(name: "Private", currency: "USD")
    private_account = other_family.accounts.create!(name: "Private card", currency: "USD", balance: 0, accountable: CreditCard.new)
    post api_v1_account_simplefin_history_audit_path(private_account), params: {}, headers: api_headers(@key), as: :json
    assert_response :not_found
    post api_v1_account_simplefin_history_audit_path("invalid-id"), params: {}, headers: api_headers(@key), as: :json
    assert_response :not_found
    @account.update!(owner: users(:family_member))
    @account.account_shares.create!(user: @user, permission: "read_only")
    audit
    assert_response :forbidden
  end

  private
    def audit(params = {})
      post api_v1_account_simplefin_history_audit_path(@account), params: params, headers: api_headers(@key), as: :json
    end

    def make_provider(id, **attrs)
      @item.simplefin_accounts.create!(name: id, account_id: id, account_type: "credit", currency: "USD", current_balance: -29.72, **attrs)
    end

    def make_entry(**attrs)
      @account.entries.create!(date: Date.new(2026, 9, 15), name: "Existing entry", amount: 144.81, currency: "USD", entryable: Transaction.new, **attrs)
    end

    def raw_transaction(id, amount: "-144.81", date: Date.new(2026, 9, 15))
      { id: id, posted: Time.utc(date.year, date.month, date.day, 12).to_i, amount: amount, description: "AUTOPAY", payee: "Card payment" }
    end

    def stub_history(rows, other_feeds = {}, errors: [], errlist: [])
      feeds = { @provider.account_id => rows }.merge(other_feeds).map { |id, transactions| { id: id, transactions: transactions } }
      stub_request(:get, %r{\Ahttps://example\.com/audit/accounts\?}).to_return(status: 200, body: { errors: errors, errlist: errlist, accounts: feeds }.to_json)
    end
end
