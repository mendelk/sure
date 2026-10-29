require "test_helper"

class Api::V1::SimplefinHistoryAuditsControllerTest < ActionDispatch::IntegrationTest
  setup do
    travel_to Time.utc(2026, 9, 30, 12)
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

  test "metadata is readable with a read key without contacting SimpleFIN or changing financial data" do
    assert_no_difference [ "Entry.count", "Sync.count", "AccountProvider.count" ] do
      get "/api/v1/accounts/#{@account.id}/simplefin_history_audit", headers: api_headers(@read_key)
    end
    assert_response :success
    assert_equal @account.id, response.parsed_body.dig("account", "id")
    assert_equal 45, response.parsed_body["max_period_days"]
    assert response.parsed_body["text"].present?
  end

  test "metadata enforces administrator writable account tenancy and authentication" do
    path = "/api/v1/accounts/#{@account.id}/simplefin_history_audit"
    get path
    assert_response :unauthorized
    @user.update!(role: "member")
    get path, headers: api_headers(@read_key)
    assert_response :forbidden
    @user.update!(role: "admin")
    get "/api/v1/accounts/#{SecureRandom.uuid}/simplefin_history_audit", headers: api_headers(@read_key)
    assert_response :not_found
  end

  test "reports fresh missing activity without changing financial data or normal sync state" do
    stub_history([ raw_transaction("missing") ])
    before = [ @account.attributes, @provider.attributes, @item.attributes, @item.last_synced_at ]

    assert_no_difference [ "Entry.count", "Transaction.count", "Valuation.count", "Transfer.count", "AccountProvider.count", "SimplefinTransactionIdentity.count", "Sync.count" ] do
      audit(period_days: 30)
      assert_response :success
    end

    assert_equal before, [ @account.reload.attributes, @provider.reload.attributes, @item.reload.attributes, @item.last_synced_at ]
    transaction = response.parsed_body.fetch("transactions").sole
    assert_equal "missing", transaction.fetch("status")
    assert_equal "144.81", transaction.fetch("amount")
    assert_equal "2026-09-15", transaction.fetch("date")
    assert_equal "USD", transaction.fetch("currency")
    assert_equal "Card payment - AUTOPAY", transaction.fetch("name")
    assert transaction.fetch("import_token").present?
    assert_equal 30, response.parsed_body.dig("coverage", "period_days")
    assert_equal "2026-09-01", response.parsed_body.dig("coverage", "window_start_date")
    assert_equal "2026-09-30", response.parsed_body.dig("coverage", "window_end_date")
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
      audit(period_days: 30)
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

    audit(period_days: 30)
    assert_response :success
    rows = response.parsed_body.fetch("transactions")
    retired_row = rows.find { |row| row["simplefin_account_id"] == old.id }
    current_row = rows.find { |row| row["simplefin_account_id"] == @provider.id && row["provider_transaction_id"] == "shared" }
    assert_equal "recorded", retired_row.fetch("status")
    assert_equal existing.id, retired_row.fetch("entry_id")
    assert_equal "possible_match", current_row.fetch("status"), "The old feed's alias must not claim a new feed's same ID"
    assert_equal "intentionally_deleted", rows.find { |row| row["provider_transaction_id"] == "deleted" }.fetch("status")
    assert_nil retired_row.fetch("import_token")
    assert_nil rows.find { |row| row["provider_transaction_id"] == "deleted" }.fetch("import_token")
    assert_equal [ old.id, @provider.id ].sort, response.parsed_body.fetch("feeds").map { |feed| feed.fetch("simplefin_account_id") }.sort
  end

  test "legacy external IDs are recognized for an unreplaced feed" do
    travel_to Time.utc(2026, 9, 15, 12)
    existing = make_entry(source: "simplefin", external_id: "simplefin_legacy")
    stub_history([ raw_transaction("legacy") ])
    audit(period_days: 1)
    row = response.parsed_body.fetch("transactions").sole
    assert_equal "recorded", row.fetch("status")
    assert_equal existing.id, row.fetch("entry_id")
  end

  test "continues beyond empty windows and a year with inclusive date boundaries" do
    travel_to Time.utc(2026, 10, 19, 12)
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
      audit(cursor ? { cursor: cursor } : {})
      assert_response :success
      found.concat(response.parsed_body.fetch("transactions").map { |row| row.fetch("provider_transaction_id") })
      cursor = response.parsed_body.fetch("next_cursor")
      break if cursor.nil? || found.include?("old-missing")
    end

    assert_equal [ "old-missing" ], found
    assert_operator requested.last.first, :<=, historical[:posted]
    assert_equal Time.utc(2026, 10, 20).to_i, requested.first.last
    requested.each_cons(2) { |newer, older| assert_equal newer.first, older.last, "History pages must have no boundary gaps" }
    assert requested.all? { |start_time, end_time| end_time - start_time <= 45.days }
  end

  test "queries only associated feeds even if the bridge returns unrelated accounts" do
    unrelated = make_provider("unrelated")
    request = stub_history([ raw_transaction("ours") ], { unrelated.account_id => [ raw_transaction("private") ] }).with do |outbound|
      pairs = URI.decode_www_form(outbound.uri.query)
      pairs.select { |name, _| name == "account" }.map(&:last) == [ @provider.account_id ] &&
        pairs.none? { |name, _| name == "pending" }
    end
    audit(period_days: 30)
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
    2.times do |index|
      audit(cursor ? { cursor: cursor } : { period_days: 30 })
      assert_response :success
      windows << response.parsed_body.fetch("coverage").slice("window_start_date", "window_end_date")
      assert_equal index.zero?, response.parsed_body.dig("coverage", "has_more_connections")
      ids.concat(response.parsed_body.fetch("transactions").map { |row| row.fetch("provider_transaction_id") })
      cursor = response.parsed_body.fetch("next_cursor")
    end
    assert_equal windows.first, windows.last
    assert_equal [ "old-feed-missing" ], ids
    audit(cursor: cursor)
    assert_response :success
    assert_equal "2026-08-02", response.parsed_body.dig("coverage", "window_start_date")
    assert_equal "2026-08-31", response.parsed_body.dig("coverage", "window_end_date")
  end

  test "partial errors unavailable feeds and malformed transactions provide retry coverage" do
    old = make_provider("unavailable", retired_at: Time.current, retired_account: @account)
    stub_history([ raw_transaction("bad", amount: "not-money"), { description: "No identity" }, raw_transaction("pending").merge(pending: true) ], {}, errors: [ "Private upstream details" ])
    audit(period_days: 30)
    assert_response :success
    body = response.parsed_body
    refute body.dig("coverage", "page_complete")
    assert_equal 2, body.dig("summary", "invalid")
    assert_equal 1, body.dig("summary", "pending")
    assert_equal 0, body.dig("summary", "missing")
    assert body.fetch("transactions").all? { |row| row.fetch("import_token").nil? }
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

    audit(period_days: 30)

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
    audit(period_days: 30)
    assert_equal 1, response.parsed_body.dig("summary", "missing")
    assert_equal 1, response.parsed_body.dig("summary", "invalid")
    refute response.parsed_body.dig("coverage", "page_complete")
    assert response.parsed_body.fetch("transactions").find { |row| row["status"] == "missing" }.fetch("import_token").present?
    assert_nil response.parsed_body.fetch("transactions").find { |row| row["status"] == "invalid" }.fetch("import_token")
  end

  test "selected periods page backward without gaps and retries stay anchored across midnight" do
    stub_history([], errors: [ "Temporary bank error" ])
    audit(period_days: 7)
    assert_response :success
    first = response.parsed_body
    assert_equal "2026-09-24", first.dig("coverage", "window_start_date")
    assert_equal "2026-09-30", first.dig("coverage", "window_end_date")

    stub_history([])
    travel_to Time.utc(2026, 10, 2, 12)
    audit(cursor: first.fetch("next_cursor"))
    assert_response :success
    assert_equal 7, response.parsed_body.dig("coverage", "period_days")
    assert_equal "2026-09-17", response.parsed_body.dig("coverage", "window_start_date")
    assert_equal "2026-09-23", response.parsed_body.dig("coverage", "window_end_date")

    audit(cursor: first.fetch("retry_cursor"))
    assert_response :success
    assert_equal first.fetch("coverage").slice("period_days", "window_start_date", "window_end_date"),
      response.parsed_body.fetch("coverage").slice("period_days", "window_start_date", "window_end_date")
    assert response.parsed_body.dig("coverage", "page_complete")
  end

  test "one day periods stop at the historical boundary and longer final periods are clipped" do
    travel_to Time.utc(1970, 1, 2, 12)
    stub_history([])
    audit(period_days: 1)
    assert_response :success
    assert_equal "1970-01-02", response.parsed_body.dig("coverage", "window_start_date")
    assert_equal "1970-01-02", response.parsed_body.dig("coverage", "window_end_date")
    audit(cursor: response.parsed_body.fetch("next_cursor"))
    assert_response :success
    assert_equal "1970-01-01", response.parsed_body.dig("coverage", "window_start_date")
    assert_equal "1970-01-01", response.parsed_body.dig("coverage", "window_end_date")
    assert_nil response.parsed_body.fetch("next_cursor")

    audit
    assert_response :success
    assert_equal 45, response.parsed_body.dig("coverage", "period_days")
    assert_equal "1970-01-01", response.parsed_body.dig("coverage", "window_start_date")
    assert_equal "1970-01-02", response.parsed_body.dig("coverage", "window_end_date")
    assert_nil response.parsed_body.fetch("next_cursor")
  end

  test "cursors from a different request window require restarting before fetching history" do
    stub_history([])
    audit
    assert_response :success
    verifier = Rails.application.message_verifier("simplefin-history-audit")
    purpose = "simplefin-history-audit/#{@family.id}/#{@account.id}"
    page = verifier.verify(response.parsed_body.fetch("next_cursor"), purpose: purpose)
    Provider::Simplefin.any_instance.expects(:get_accounts).never

    [ page.except("period_days"), page.except("period_days").merge("window_days" => 45) ].each do |old_page|
      audit(cursor: verifier.generate(old_page, purpose: purpose))
      assert_response :conflict
      assert_equal "stale_cursor", response.parsed_body.fetch("error")
    end
  end

  test "cursors reject tampering cross account replay changed feeds and mixed parameters" do
    stub_history([])
    audit
    assert_response :success
    cursor = response.parsed_body.fetch("next_cursor")
    audit(cursor: cursor + "tampered")
    assert_response :unprocessable_entity
    audit(cursor: cursor, period_days: 30)
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

  test "invalid periods malformed scalars retired date parameters and unavailable SimpleFIN return actionable errors" do
    [ { period_days: 0 }, { period_days: 46 }, { period_days: -1 }, { period_days: 1.5 },
      { period_days: "30" }, { period_days: [ 30 ] }, { period_days: {} }, { cursor: {} },
      { start_date: "2026-09-01" }, { end_date: "2026-09-30" } ].each do |params|
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

  test "explicit import handles current and retired feeds with colliding IDs without adopting provider state" do
    old = make_provider("old-card", retired_at: Time.current, retired_account: @account)
    raw = raw_transaction("shared").merge(currency: "EUR", memo: "Historical memo", extra: { "reference" => "kept" })
    stub_history([ raw ], { old.account_id => [ raw ] })
    audit
    rows = response.parsed_body.fetch("transactions")
    before = [ @account.reload.attributes, @provider.reload.attributes, old.reload.attributes, @item.reload.attributes, @item.last_synced_at ]
    Provider::Simplefin.any_instance.expects(:get_accounts).never
    Account.any_instance.expects(:sync_later).with(window_start_date: Date.new(2026, 9, 15)).once

    assert_difference [ "Entry.count", "Transaction.count", "SimplefinTransactionIdentity.count" ], 2 do
      apply_decisions(rows.map { |row| { token: row.fetch("import_token"), entry_id: nil } })
      assert_response :success
    end
    result = response.parsed_body.fetch("transactions")
    assert_equal [ old.id, @provider.id ].sort, result.map { |row| row.fetch("simplefin_account_id") }.sort
    assert_equal 2, result.map { |row| row.fetch("entry_id") }.uniq.size
    result.each do |row|
      entry = Entry.find(row.fetch("entry_id"))
      assert_equal row.fetch("transaction_id"), entry.entryable_id
      assert_equal "simplefin", entry.source
      assert_includes entry.external_id, row.fetch("simplefin_account_id")
      assert_equal BigDecimal("144.81"), entry.amount
      assert_equal "EUR", entry.currency
      assert_equal "Historical memo", entry.transaction.extra.dig("simplefin", "memo")
      assert_equal "kept", entry.transaction.extra.dig("simplefin", "extra", "reference")
      assert_equal "EUR", entry.transaction.extra.dig("simplefin", "fx_from")
      assert_equal "2026-09-15", entry.transaction.extra.dig("simplefin", "fx_date")
      assert_equal false, entry.transaction.extra.dig("simplefin", "pending")
      refute SimplefinTransactionIdentity.find_by!(entry: entry).duplicate?
    end
    assert_equal before, [ @account.reload.attributes, @provider.reload.attributes, old.reload.attributes, @item.reload.attributes, @item.last_synced_at ]
  end

  test "linking aliases preserves manual CSV splits transfers and future processor replay" do
    old = make_provider("old-card", retired_at: Time.current, retired_account: @account)
    parent = make_entry(source: "mfs_v2", external_id: "csv-parent", notes: "User notes", user_modified: true, import_locked: true)
    parent.split!([ { amount: 100, name: "Transfer part" }, { amount: 44.81, name: "Spending part" } ])
    child = parent.child_entries.find_by!(amount: 100)
    child.transaction.update!(kind: "funds_movement", extra: { "manual" => { "preserve" => true } })
    checking = @family.accounts.create!(owner: @user, name: "Checking", currency: "USD", balance: 0, accountable: Depository.new)
    counterpart = checking.entries.create!(date: child.date, name: "Counterpart", amount: -100, currency: "USD",
      entryable: Transaction.new(kind: "funds_movement"))
    transfer = Transfer.create!(inflow_transaction: counterpart.transaction, outflow_transaction: child.transaction, status: "confirmed")
    manual = make_entry(amount: 20, notes: "Manual repair")
    stub_history([ raw_transaction("parent"), raw_transaction("manual", amount: "-20") ],
      { old.account_id => [ raw_transaction("child", amount: "-100") ] })
    audit
    rows = response.parsed_body.fetch("transactions").index_by { |row| row.fetch("provider_transaction_id") }
    snapshots = [ parent, child, counterpart, manual, parent.transaction, child.transaction, manual.transaction, transfer ].map { |record| record.reload.attributes }
    Account.any_instance.expects(:sync_later).never
    decisions = { "parent" => parent, "child" => child, "manual" => manual }.map do |id, entry|
      assert_nil rows.fetch(id).fetch("entry_id"), "Candidates must never be selected automatically"
      { token: rows.fetch(id).fetch("import_token"), entry_id: entry.id }
    end

    assert_no_difference [ "Entry.count", "Transaction.count", "Transfer.count" ] do
      assert_difference "SimplefinTransactionIdentity.count", 3 do
        apply_decisions(decisions)
        assert_response :success
      end
      result = response.parsed_body
      apply_decisions(decisions)
      assert_response :success
      assert_equal result, response.parsed_body
      SimplefinEntry::Processor.new(raw_transaction("parent"), simplefin_account: @provider).process
    end
    assert_equal snapshots, [ parent, child, counterpart, manual, parent.transaction, child.transaction, manual.transaction, transfer ].map { |record| record.reload.attributes }
    assert SimplefinTransactionIdentity.where(entry: [ parent, child, manual ]).all?(&:duplicate?)

    apply_decisions([ { token: rows.fetch("manual").fetch("import_token"), entry_id: nil } ])
    assert_response :conflict
    assert_equal "import_conflict", response.parsed_body.fetch("error")
  end

  test "keep separate is explicit and never heuristically claims manual or pending transactions" do
    manual = make_entry
    pending = make_entry(source: "simplefin", external_id: "simplefin_pending",
      entryable: Transaction.new(extra: { "simplefin" => { "pending" => true } }))
    before = [ manual.attributes, pending.attributes, pending.transaction.attributes ]
    stub_history([ raw_transaction("separate") ])
    audit
    row = response.parsed_body.fetch("transactions").sole
    assert_equal "possible_match", row.fetch("status")
    assert_equal [ manual.id ], row.fetch("possible_matches").map { |candidate| candidate.fetch("entry_id") }
    Account.any_instance.expects(:sync_later).with(window_start_date: Date.new(2026, 9, 15)).once
    apply_decisions([ { token: row.fetch("import_token") } ])
    assert_response :unprocessable_entity
    assert_equal "invalid_decisions", response.parsed_body.fetch("error")

    decisions = [ { token: row.fetch("import_token"), entry_id: nil } ]
    assert_difference [ "Entry.count", "Transaction.count", "SimplefinTransactionIdentity.count" ], 1 do
      apply_decisions(decisions)
      assert_response :success
    end
    result = response.parsed_body
    refute_includes [ manual.id, pending.id ], result.fetch("transactions").sole.fetch("entry_id")
    assert_no_difference [ "Entry.count", "Transaction.count", "SimplefinTransactionIdentity.count" ] do
      apply_decisions(decisions)
      assert_response :success
      assert_equal result, response.parsed_body
    end
    assert_equal before, [ manual.reload.attributes, pending.reload.attributes, pending.transaction.reload.attributes ]
    apply_decisions([ { token: row.fetch("import_token"), entry_id: manual.id } ])
    assert_response :conflict
    Entry.find(result.fetch("transactions").sole.fetch("entry_id")).destroy!
    assert_no_difference [ "Entry.count", "Transaction.count", "SimplefinTransactionIdentity.count" ] do
      apply_decisions(decisions)
      assert_response :conflict
      assert_equal "import_conflict", response.parsed_body.fetch("error")
    end
  end

  test "import rejects tampering expiry wrong account and audit cursors without provider requests" do
    stub_history([ raw_transaction("missing") ])
    audit
    token = response.parsed_body.fetch("transactions").sole.fetch("import_token")
    cursor = response.parsed_body.fetch("next_cursor")
    another = @family.accounts.create!(owner: @user, name: "Other", currency: "USD", balance: 0, accountable: CreditCard.new)
    AccountProvider.create!(account: another, provider: make_provider("other-card"))
    Provider::Simplefin.any_instance.expects(:get_accounts).never
    assert_no_difference [ "Entry.count", "SimplefinTransactionIdentity.count" ] do
      [ token + "tampered", cursor ].each do |invalid|
        apply_decisions([ { token: invalid, entry_id: nil } ])
        assert_response :unprocessable_entity
        assert_equal "invalid_import_token", response.parsed_body.fetch("error")
      end
      post import_api_v1_account_simplefin_history_audit_path(another),
        params: { decisions: [ { token: token, entry_id: nil } ] }, headers: api_headers(@key), as: :json
      assert_response :unprocessable_entity
      travel 61.minutes
      apply_decisions([ { token: token, entry_id: nil } ])
      assert_response :unprocessable_entity
      assert_equal "invalid_import_token", response.parsed_body.fetch("error")
    end
  end

  test "import reloads feed mappings and authorization before applying a reviewed token" do
    stub_history([ raw_transaction("missing") ])
    audit
    token = response.parsed_body.fetch("transactions").sole.fetch("import_token")
    Provider::Simplefin.any_instance.expects(:get_accounts).never
    Account.any_instance.expects(:sync_later).never
    assert_no_difference [ "Entry.count", "SimplefinTransactionIdentity.count" ] do
      @provider.update!(account_id: "remapped")
      apply_decisions([ { token: token, entry_id: nil } ])
      assert_response :conflict
      assert_equal "stale_import", response.parsed_body.fetch("error")
      @provider.update!(account_id: "new-card")
      @account.update!(currency: "EUR")
      apply_decisions([ { token: token, entry_id: nil } ])
      assert_response :conflict
      @account.update!(currency: "USD")
      @account.account_providers.destroy_all
      apply_decisions([ { token: token, entry_id: nil } ])
      assert_response :conflict
      assert_equal "stale_import", response.parsed_body.fetch("error")
    end
  end

  test "candidate links are restricted to reviewed account type amount currency date and posted state" do
    candidate = make_entry
    stub_history([ raw_transaction("link") ])
    audit
    token = response.parsed_body.fetch("transactions").sole.fetch("import_token")
    unreviewed = make_entry
    other = @family.accounts.create!(owner: @user, name: "Other", currency: "USD", balance: 0, accountable: Depository.new)
    foreign_entry = other.entries.create!(date: candidate.date, amount: candidate.amount, currency: "USD", name: "Other", entryable: Transaction.new)
    Account.any_instance.expects(:sync_later).never
    assert_no_difference "SimplefinTransactionIdentity.count" do
      [ unreviewed.id, foreign_entry.id ].each do |id|
        apply_decisions([ { token: token, entry_id: id } ])
        assert_response :conflict
        assert_equal "stale_import", response.parsed_body.fetch("error")
      end
      [ { amount: -144.81 }, { currency: "EUR" }, { date: Date.new(2026, 9, 10) },
        { entryable: Valuation.new }, { entryable: Transaction.new(extra: { "simplefin" => { "pending" => true } }) } ].each do |attrs|
        before = candidate.attributes
        candidate.update!(attrs)
        apply_decisions([ { token: token, entry_id: candidate.id } ])
        assert_response :conflict
        candidate.update!(before.except("id", "created_at", "updated_at"))
      end
    end
  end

  test "tombstones and changed decisions roll back the entire batch" do
    candidate = make_entry
    stub_history([ raw_transaction("first"), raw_transaction("deleted") ])
    audit
    rows = response.parsed_body.fetch("transactions").index_by { |row| row.fetch("provider_transaction_id") }
    identity = SimplefinTransactionIdentity.create!(simplefin_account: @provider, external_id: "simplefin_deleted", entry: nil)
    Account.any_instance.expects(:sync_later).never
    assert_no_difference [ "Entry.count", "Transaction.count", "SimplefinTransactionIdentity.count" ] do
      apply_decisions([ { token: rows.fetch("first").fetch("import_token"), entry_id: nil },
        { token: rows.fetch("deleted").fetch("import_token"), entry_id: candidate.id } ])
      assert_response :conflict
      assert_equal "import_conflict", response.parsed_body.fetch("error")
    end
    assert_nil identity.reload.entry_id
  end

  test "single feed legacy and normal sync races do not duplicate reviewed activity" do
    stub_history([ raw_transaction("legacy-race"), raw_transaction("normal-race") ])
    audit
    rows = response.parsed_body.fetch("transactions")
    legacy = make_entry(source: "simplefin", external_id: "simplefin_legacy-race")
    normal = SimplefinEntry::Processor.new(raw_transaction("normal-race"), simplefin_account: @provider).process
    Account.any_instance.expects(:sync_later).never
    assert_no_difference [ "Entry.count", "Transaction.count" ] do
      assert_difference "SimplefinTransactionIdentity.count", 1 do
        apply_decisions(rows.map { |row| { token: row.fetch("import_token"), entry_id: nil } })
        assert_response :success
      end
    end
    assert_equal [ legacy.id, normal.id ].sort, response.parsed_body.fetch("transactions").map { |row| row.fetch("entry_id") }.sort
  end

  test "identity conflicts cannot issue import tokens" do
    other = @family.accounts.create!(owner: @user, name: "Other", currency: "USD", balance: 0, accountable: Depository.new)
    entry = other.entries.create!(date: Date.new(2026, 9, 15), amount: 144.81, name: "Other transaction", currency: "USD", entryable: Transaction.new)
    SimplefinTransactionIdentity.create!(simplefin_account: @provider, external_id: "simplefin_conflict", entry: entry)
    stub_history([ raw_transaction("conflict") ])
    audit
    assert_response :success
    row = response.parsed_body.fetch("transactions").sole
    assert_equal "identity_conflict", row.fetch("status")
    assert_nil row.fetch("import_token")
  end

  test "import failures roll back and record credential free support diagnostics" do
    stub_history([ raw_transaction("missing") ])
    audit
    token = response.parsed_body.fetch("transactions").sole.fetch("import_token")
    Account::ProviderImportAdapter.any_instance.expects(:import_transaction).raises(ArgumentError, "secret provider payload")
    Account.any_instance.expects(:sync_later).never
    assert_no_difference [ "Entry.count", "Transaction.count", "SimplefinTransactionIdentity.count" ] do
      apply_decisions([ { token: token, entry_id: nil } ])
      assert_response :conflict
    end
    diagnostic = DebugLogEntry.where(account: @account, category: "simplefin_history_audit").sole
    assert_equal "import_failed", diagnostic.metadata.fetch("code")
    assert_equal "ArgumentError", diagnostic.metadata.fetch("error_class")
    assert_not_includes diagnostic.metadata.to_json, "secret"
    assert_not_includes diagnostic.metadata.to_json, token
    assert_not_includes response.body, "secret"
  end

  test "malformed decisions and repeated provider identities do not write" do
    stub_history([ raw_transaction("missing") ])
    audit
    token = response.parsed_body.fetch("transactions").sole.fetch("import_token")
    invalid = [ nil, {}, [], [ nil ], [ "token" ], [ { token: token } ], [ { token: token, entry_id: false } ],
      [ { token: {}, entry_id: nil } ], [ { token: token, entry_id: "bad-id" } ],
      [ { token: token, entry_id: nil }, { token: token, entry_id: nil } ] ]
    assert_no_difference [ "Entry.count", "SimplefinTransactionIdentity.count" ] do
      invalid.each do |decisions|
        apply_decisions(decisions)
        assert_response :unprocessable_entity
        assert_equal "invalid_decisions", response.parsed_body.fetch("error")
      end
    end
  end

  test "import requires authentication read write administrator writable account and family access" do
    Provider::Simplefin.any_instance.expects(:get_accounts).never
    body = { decisions: [ { token: "not-reviewed", entry_id: nil } ] }
    post import_api_v1_account_simplefin_history_audit_path(@account), params: body, as: :json
    assert_response :unauthorized
    post import_api_v1_account_simplefin_history_audit_path(@account), params: body, headers: api_headers(@read_key), as: :json
    assert_response :forbidden
    @user.update!(role: "member")
    apply_decisions(body[:decisions])
    assert_response :forbidden
    @user.update!(role: "admin")
    @account.update!(owner: users(:family_member))
    @account.account_shares.create!(user: @user, permission: "read_only")
    apply_decisions(body[:decisions])
    assert_response :forbidden
    private_account = Family.create!(name: "Private family", currency: "USD").accounts.create!(
      name: "Private", currency: "USD", balance: 0, accountable: CreditCard.new)
    post import_api_v1_account_simplefin_history_audit_path(private_account), params: body, headers: api_headers(@key), as: :json
    assert_response :not_found
    post import_api_v1_account_simplefin_history_audit_path("invalid-id"), params: body, headers: api_headers(@key), as: :json
    assert_response :not_found
  end

  test "browser session imports retain CSRF protection" do
    sign_in @user
    original = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    assert_no_difference [ "Entry.count", "SimplefinTransactionIdentity.count" ] do
      post import_api_v1_account_simplefin_history_audit_path(@account),
        params: { decisions: [ { token: "not-reviewed", entry_id: nil } ] }, as: :json
      assert_response :unprocessable_content
    end
  ensure
    ActionController::Base.allow_forgery_protection = original
  end

  private
    def audit(params = {})
      post api_v1_account_simplefin_history_audit_path(@account), params: params, headers: api_headers(@key), as: :json
    end

    def apply_decisions(decisions)
      post import_api_v1_account_simplefin_history_audit_path(@account),
        params: { decisions: decisions }, headers: api_headers(@key), as: :json
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
