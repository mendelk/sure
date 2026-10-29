require "test_helper"

class AccountsControllerTest < ActionDispatch::IntegrationTest
  include ActionView::RecordIdentifier
  include OnchainTestHelper
  include EntriesTestHelper

  setup do
    sign_in @user = users(:family_admin)
    @account = accounts(:depository)
  end

  test "should get index" do
    get accounts_url
    assert_response :success
    assert_select "#spa-root"

    get accounts_url(format: :json)
    assert_response :success
    assert response.parsed_body.key?("items")
    assert response.parsed_body.key?("groups")
  end

  test "show filters account activity with legacy and SPA query parameters" do
    uncategorized = create_transaction(account: @account, name: "Uncategorized Filter Target", category: nil)
    categorized = create_transaction(account: @account, name: "Categorized Filter Decoy", category: categories(:food_and_drink))

    [ { q: { uncategorized: "1" } }, { uncategorized: true, search: "Filter" } ].each do |query|
      get account_url(@account, format: :json), params: query
      assert_response :success
      entries = response.parsed_body.dig("activity", "groups").flat_map { |group| group["entries"] }
      assert_includes entries.map { |entry| entry["id"] }, uncategorized.id
      assert_not_includes entries.map { |entry| entry["id"] }, categorized.id
    end
  end

  test "show filters account activity by category, tag, type, amount, date, and exclusions" do
    tag = @user.family.tags.create!(name: "Vacation", color: "#3b82f6")
    cat1 = categories(:food_and_drink)
    cat2 = categories(:income)

    t1 = create_transaction(account: @account, name: "Restaurant Dinner", amount: 85.50, date: Date.current, category: cat1)
    t1.entryable.tags << tag

    t2 = create_transaction(account: @account, name: "Consulting Gig", amount: -500.00, date: 5.days.ago.to_date, category: cat2)

    # Filter by category
    get account_url(@account, format: :json), params: { categories: [ cat1.name ] }
    assert_response :success
    ids = response.parsed_body.dig("activity", "groups").flat_map { |g| g["entries"] }.map { |e| e["id"] }
    assert_includes ids, t1.id
    assert_not_includes ids, t2.id

    # Filter by excluded category
    get account_url(@account, format: :json), params: { excluded_categories: [ cat1.name ] }
    assert_response :success
    ids = response.parsed_body.dig("activity", "groups").flat_map { |g| g["entries"] }.map { |e| e["id"] }
    assert_not_includes ids, t1.id
    assert_includes ids, t2.id

    # Filter by tag
    get account_url(@account, format: :json), params: { tags: [ "Vacation" ] }
    assert_response :success
    ids = response.parsed_body.dig("activity", "groups").flat_map { |g| g["entries"] }.map { |e| e["id"] }
    assert_includes ids, t1.id
    assert_not_includes ids, t2.id

    # Filter by type: income
    get account_url(@account, format: :json), params: { types: [ "income" ] }
    assert_response :success
    ids = response.parsed_body.dig("activity", "groups").flat_map { |g| g["entries"] }.map { |e| e["id"] }
    assert_not_includes ids, t1.id
    assert_includes ids, t2.id

    # Filter by amount greater than
    get account_url(@account, format: :json), params: { amount: 100, amount_operator: "greater" }
    assert_response :success
    ids = response.parsed_body.dig("activity", "groups").flat_map { |g| g["entries"] }.map { |e| e["id"] }
    assert_not_includes ids, t1.id
    assert_includes ids, t2.id
  end

  test "account activity keeps merchant logos when no investment security is present" do
    merchant = @user.family.merchants.create!(
      name: "Activity Logo Merchant", logo_url: "https://example.com/merchant.png"
    )
    entry = create_transaction(account: @account, name: "Logo activity", merchant: merchant)

    get account_url(@account, format: :json), params: { search: "Logo activity" }

    assert_response :success
    row = response.parsed_body.dig("activity", "groups").flat_map { |group| group["entries"] }.find { |item| item["id"] == entry.id }
    assert_equal "https://example.com/merchant.png", row["logo_url"]
    assert_equal row["logo_url"], row.dig("transaction", "logo_url")
  end

  test "index includes the account link in row payload" do
    get accounts_url(format: :json)

    assert_response :success
    row = response.parsed_body["groups"].flat_map { |g| g["accounts"] }.find { |a| a["id"] == @account.id }
    assert_equal account_path(@account), row["href"]
  end


  test "index renders kraken items" do
    kraken_item = kraken_items(:one)
    get accounts_url(format: :json)
    assert_response :success
    assert response.parsed_body["items"].any? { |it| it["id"] == kraken_item.id }
  end

  test "index renders on-chain wallet items" do
    register_fake_chain!
    item = create_onchain_wallet_item(family: @user.family)
    onchain_account = create_onchain_wallet_account(item: item)
    onchain_account.ensure_account_provider!(accounts(:investment))

    get accounts_url(format: :json)

    assert_response :success
    wallet = response.parsed_body["items"].find { |it| it["id"] == item.id && it["kind"] == "wallet" }
    assert_not_nil wallet
  ensure
    unregister_fake_chain!
  end

  test "index does not leak wallet accounts a member was never given" do
    register_fake_chain!
    admin = users(:family_admin)
    member = users(:family_member)
    item = create_onchain_wallet_item(family: admin.family)

    shared = accounts(:investment)
    unshared = accounts(:credit_card)
    [ shared, unshared ].each_with_index do |account, index|
      account.update!(owner: admin)
      account.account_shares.destroy_all
      row = create_onchain_wallet_account(
        item: item,
        address: "#{OnchainTestHelper::FAKE_ADDRESS}#{index}"
      )
      row.ensure_account_provider!(account)
    end
    shared.account_shares.create!(user: member, permission: "read_only")

    sign_in member
    get accounts_url(format: :json)

    assert_response :success
    wallet = response.parsed_body["items"].find { |it| it["id"] == item.id }
    account_names = wallet.dig("wallet", "accounts").map { |a| a["name"] }
    assert_includes account_names, shared.name
    assert_not_includes account_names, unshared.name
  ensure
    unregister_fake_chain!
  end

  test "index renders trading212 items" do
    trading212_item = trading212_items(:configured_item)
    get accounts_url(format: :json)
    assert_response :success
    assert response.parsed_body["items"].any? { |it| it["id"] == trading212_item.id }
  end

  test "index renders only accessible accounts for a visible trading212 item" do
    accessible_account = accounts(:depository)
    inaccessible_account = accounts(:investment)
    trading212_item = trading212_items(:configured_item)
    trading212_accounts(:main_account).ensure_account_provider!(accessible_account)
    trading212_item.trading212_accounts.create!(
      name: "Private Trading 212 Account",
      trading212_account_id: "t212_private_123",
      currency: "USD",
      current_balance: 1000,
      cash_balance: 100,
      raw_positions_payload: [],
      raw_orders_payload: [],
      raw_dividends_payload: [],
      raw_transactions_payload: []
    ).ensure_account_provider!(inaccessible_account)
    sign_in users(:family_member)

    get accounts_url(format: :json)

    assert_response :success
    t212 = response.parsed_body["items"].find { |it| it["id"] == trading212_item.id }
    account_ids = t212["group"].flat_map { |g| g["accounts"] }.map { |a| a["id"] }
    assert_includes account_ids, accessible_account.id
    assert_not_includes account_ids, inaccessible_account.id
  end

  test "index renders only trading212 items with accessible accounts for members" do
    shared_account = accounts(:credit_card)
    trading212_accounts(:main_account).ensure_account_provider!(shared_account)
    sign_in users(:family_member)

    get accounts_url(format: :json)

    assert_response :success
    item_ids = response.parsed_body["items"].map { |it| it["id"] }
    assert_includes item_ids, trading212_items(:configured_item).id
    assert_not_includes item_ids, trading212_items(:pending_setup_item).id
  end

  test "should get show" do
    get account_url(@account)
    assert_response :success
  end

  test "HTML show renders the SPA without computing financial presentation" do
    Account::PageData.expects(:new).never
    Loan.any_instance.expects(:payoff_projection).never
    AccountStatement::Coverage.expects(:for_year).never

    get account_url(accounts(:loan), tab: "statements")

    assert_response :success
    assert_select "#spa-root"
  end

  test "show honors a custom start_date/end_date range and safely rejects a backwards range" do
    start_date = 15.days.ago.to_date
    get account_url(@account, format: :json), params: { start_date: start_date.iso8601, end_date: Date.current.iso8601 }

    assert_response :success
    period = response.parsed_body.dig("chart", "period")
    assert_nil period["key"]
    assert_equal start_date.iso8601, period["start_date"]
    assert_equal Date.current.iso8601, period["end_date"]

    get account_url(@account, format: :json), params: { start_date: Date.tomorrow.iso8601, end_date: Date.yesterday.iso8601 }
    assert_response :success
    assert_equal "last_30_days", response.parsed_body.dig("chart", "period", "key")
  end

  test "sync all requests fresh Plaid transactions before syncing the family" do
    sequence = sequence("manual sync all")
    Family.any_instance
      .expects(:request_plaid_transactions_refreshes_later)
      .with(source: "AccountsController#sync_all")
      .in_sequence(sequence)
    Family.any_instance.expects(:sync_later).once.in_sequence(sequence)

    post sync_all_accounts_url

    assert_redirected_to accounts_url
  end

  test "sync all continues when Plaid refresh orchestration cannot be enqueued" do
    PlaidTransactionsRefreshAllJob.stubs(:perform_later).raises(RedisClient::Error, "Redis unavailable")
    Family.any_instance.expects(:sync_later).once

    post sync_all_accounts_url

    assert_redirected_to accounts_url
  end

  test "investment transfers retain category controls instead of activity editing" do
    investment = accounts(:investment)
    cash = create_transaction(account: investment, name: "Cash contribution",
      entryable: Transaction.new(investment_activity_label: "Contribution"))
    transfer = create_transaction(account: investment, name: "Transfer contribution",
      entryable: Transaction.new(kind: "investment_contribution", investment_activity_label: "Contribution"))

    get account_url(investment, format: :json)

    assert_response :success
    rows = response.parsed_body.dig("activity", "groups").flat_map { |group| group["entries"] }.index_by { |row| row["id"] }
    assert_not_nil rows[cash.id]["activity_edit"]
    assert_includes rows[cash.id]["activity_options"].map { |option| option["value"] }, "Sell"
    assert_nil rows[transfer.id]["activity_edit"]
    assert_nil rows[transfer.id]["activity_label"]
    assert_nil rows[transfer.id]["description"]
    assert_empty rows[transfer.id]["activity_options"]
  end

  test "income trades keep their activity labels without exposing relabeling" do
    trade = entries(:trade)
    %w[Buy Dividend Interest].each do |label|
      trade.entryable.update!(investment_activity_label: label)

      get account_url(trade.account, format: :json)

      assert_response :success
      row = response.parsed_body.dig("activity", "groups").flat_map { |group| group["entries"] }.find { |item| item["id"] == trade.id }
      assert_equal label, row["activity_label"]
      if label == "Buy"
        assert_not_nil row["activity_edit"]
      else
        assert_nil row["activity_edit"]
        assert_empty row["activity_options"]
      end
    end
  end

  test "read only account activity keeps labels but cannot edit them" do
    investment = accounts(:investment)
    investment.update!(owner: @user)
    investment.account_shares.destroy_all
    member = users(:family_member)
    investment.account_shares.create!(user: member, permission: "read_only")
    entry = create_transaction(account: investment, name: "Readonly dividend",
      entryable: Transaction.new(investment_activity_label: "Dividend"))
    sign_in member

    get account_url(investment, format: :json)

    assert_response :success
    row = response.parsed_body.dig("activity", "groups").flat_map { |group| group["entries"] }.find { |item| item["id"] == entry.id }
    assert_equal "Dividend", row["activity_label"]
    assert_nil row["activity_edit"]
    assert_empty row["activity_options"]
  end

  test "show serializes mixed activity with account-context movement signs and excludes split parents" do
    investment = accounts(:investment)
    trade = entries(:trade)
    valuation = investment.entries.create!(date: Date.current, name: "Opening value", amount: 123, currency: investment.currency, entryable: Valuation.new(kind: "opening_anchor"))
    transaction = create_transaction(account: investment, name: "Split source", amount: 100)
    transaction.split!([ { name: "One", amount: 60 }, { name: "Two", amount: 40 } ])
    @user.update!(preferences: { "show_split_grouped" => true })

    get account_url(investment, format: :json)

    assert_response :success
    rows = response.parsed_body.dig("activity", "groups").flat_map { |group| group["entries"] }
    assert_not_includes rows.map { |row| row["id"] }, transaction.id
    assert_equal (-trade.amount_money).format, rows.find { |row| row["id"] == trade.id }["amount"]
    assert_equal valuation.amount_money.format, rows.find { |row| row["id"] == valuation.id }["amount"]
    children = rows.select { |row| row.dig("split_parent", "id") == transaction.id }
    assert_equal 2, children.size
    assert children.all? { |row| row["transaction"].present? }

    @user.update!(preferences: { "show_split_grouped" => false })
    get account_url(investment, format: :json)
    assert_response :success
    assert response.parsed_body.dig("activity", "groups").flat_map { |group| group["entries"] }.all? { |row| row["split_parent"].nil? }
  end

  test "show keeps excluded entries and supports search on nontransaction activity" do
    trade = entries(:trade)
    trade.update!(excluded: true)
    get account_url(accounts(:investment), format: :json), params: { search: trade.name }

    assert_response :success
    rows = response.parsed_body.dig("activity", "groups").flat_map { |group| group["entries"] }
    row = rows.find { |entry| entry["id"] == trade.id }
    assert row
    assert row["excluded"]
    assert_equal "trade", row["type"]
  end

  test "show keeps transfer and split parent queries batched across activity" do
    @user.update!(preferences: { "show_split_grouped" => true })
    3.times do |index|
      create_transaction(account: @account, name: "Split #{index}", amount: 100).split!([ { name: "One", amount: 60 }, { name: "Two", amount: 40 } ])
    end
    queries = capture_sql_queries { get account_url(@account, format: :json) }

    assert_response :success
    per_row_transfer = queries.count { |query| query.match?(/FROM "transfers".*WHERE.*"(inflow|outflow)_transaction_id"/) && !query.include?(" IN (") }
    assert_equal 0, per_row_transfer
    per_row_parent = queries.count { |query| query.match?(/FROM "entries".*WHERE.*"entries"\."id" = \$?\d+/) && !query.include?(" IN (") }
    assert_equal 0, per_row_parent
  end

  test "show scopes both formats to accessible accounts" do
    sign_in users(:family_member)
    hidden = accounts(:investment)
    hidden.update!(owner: users(:family_admin))
    hidden.account_shares.destroy_all

    [ :html, :json ].each do |format|
      get account_url(hidden, format: format)
      assert_response :not_found
    end
  end

  test "show does not expose an inaccessible transfer counterpart" do
    member = users(:family_member)
    transfer = transfers(:one)
    visible = transfer.outflow_transaction.entry.account
    hidden = transfer.inflow_transaction.entry.account
    [ visible, hidden ].each do |account|
      account.update!(owner: @user)
      account.account_shares.destroy_all
    end
    visible.account_shares.create!(user: member, permission: "read_only")
    sign_in member

    get account_url(visible, format: :json)

    assert_response :success
    assert_not_includes response.body, hidden.id
    assert_not_includes response.body, hidden.name
    payload = response.parsed_body
    assert payload.dig("activity", "groups").flat_map { |group| group["entries"] }.none? { |row| row["selectable"] }
    assert_empty payload.dig("activity", "new_actions")
    assert_not_includes payload["actions"].map { |action| action["key"] }, "edit"
    assert_nil payload["sync_action"]
  end

  test "only the selected tab is computed and legacy transactions tab normalizes to activity" do
    AccountStatement::Coverage.expects(:for_year).never
    AccountStatement.expects(:reconciliation_statuses_for).never
    Account.any_instance.expects(:current_holdings).never

    get account_url(accounts(:investment), format: :json), params: { tab: "transactions" }
    assert_response :success
    assert_equal "activity", response.parsed_body["active_tab"]
    assert response.parsed_body["activity"]
    assert_empty response.parsed_body["sections"]
  end

  test "holdings tab uses current holdings without loading activity" do
    Account::ActivityFeedData.expects(:new).never
    get account_url(accounts(:investment), format: :json), params: { tab: "holdings" }

    assert_response :success
    payload = response.parsed_body
    assert_nil payload["activity"]
    rows = payload["sections"].first.dig("table", "rows")
    expected = accounts(:investment).current_holdings.map(&:id)
    assert_equal expected.sort, rows.reject { |row| row["id"] == "cash" }.map { |row| row["id"] }.sort
  end

  test "statement managers receive coverage uploads and file actions" do
    statement = AccountStatement.create_from_upload!(family: @account.family, account: @account,
      file: uploaded_file(filename: "statement.pdf", content_type: "application/pdf", content: "%PDF-1.4 test content"))
    Account::ActivityFeedData.expects(:new).never

    get account_url(@account, format: :json), params: { tab: "statements" }

    assert_response :success
    sections = response.parsed_body["sections"]
    upload = sections.first["upload"]
    assert_equal ".pdf,.csv,.xlsx", upload["accept"]
    assert_equal @account.id, upload["account_id"]
    assert_equal 12, sections.first.dig("coverage", "months").size
    row = sections.last.dig("table", "rows").find { |item| item["id"] == statement.id }
    assert_equal %w[download edit unlink view], row["actions"].map { |action| action["key"] }.sort
    assert_equal "patch", row["actions"].find { |action| action["key"] == "unlink" }["method"]
  end

  test "statement coverage honors selected years and preserves the complete file list" do
    statement = AccountStatement.create_from_upload!(family: @account.family, account: @account,
      file: uploaded_file(filename: "historical.csv", content_type: "text/csv"))
    statement.update!(period_start_on: Date.new(2024, 2, 1), period_end_on: Date.new(2024, 2, 29))

    travel_to Date.new(2026, 5, 6) do
      get account_url(@account, format: :json), params: { tab: "statements", statement_year: 2024 }
      assert_response :success
      sections = response.parsed_body["sections"]
      assert_equal 2024, sections.first.dig("coverage", "selected_year")
      february = sections.first.dig("coverage", "months").find { |month| month["key"] == "2024-02-01" }
      assert_equal "covered", february["status"]
      assert_includes sections.last.dig("table", "rows").map { |row| row["id"] }, statement.id

      get account_url(@account, format: :json), params: { tab: "statements", statement_year: 1900 }
      assert_response :success
      assert_equal 2026, response.parsed_body["sections"].first.dig("coverage", "selected_year")
    end
  end

  test "statement uploads require both account write permission and document manager role" do
    member = users(:family_member)
    sign_in member
    get account_url(accounts(:credit_card), format: :json), params: { tab: "statements" }
    assert_response :success
    assert_nil response.parsed_body["sections"].first["upload"]

    member.update!(role: "guest")
    owned = accounts(:credit_card)
    owned.update!(owner: member)
    get account_url(owned, format: :json), params: { tab: "statements" }
    assert_response :success
    assert_nil response.parsed_body["sections"].first["upload"]
  end

  test "investment chart views normalize unsupported values" do
    get account_url(accounts(:investment), format: :json), params: { chart_view: "gains" }
    assert_response :success
    assert_equal "gains", response.parsed_body.dig("chart", "view")
    assert_equal I18n.t("UI.account.chart.title.total_gains"), response.parsed_body.dig("chart", "title")

    get account_url(@account, format: :json), params: { chart_view: "gains", tab: "holdings" }
    assert_response :success
    assert_equal "balance", response.parsed_body.dig("chart", "view")
    assert_equal "activity", response.parsed_body["active_tab"]
  end

  test "loan chart and schedule share one payoff projection" do
    account = accounts(:loan)
    projection = account.loan.payoff_projection(as_of: Date.current)
    Loan.any_instance.expects(:payoff_projection).once.returns(projection)

    get account_url(account, format: :json), params: { tab: "schedule" }

    assert_response :success
    assert_equal account.loan.term_months, response.parsed_body["sections"].first.dig("table", "rows").size
  end

  test "all account types advertise their supported tabs and only return the active section" do
    expected = {
      depository: %w[activity statements], investment: %w[activity holdings statements],
      crypto: %w[activity holdings statements], loan: %w[activity overview schedule statements],
      property: %w[activity overview statements], vehicle: %w[activity overview statements],
      credit_card: %w[activity statements], other_asset: %w[activity statements], other_liability: %w[activity statements]
    }
    expected.each do |fixture, tabs|
      get account_url(accounts(fixture), format: :json), params: { tab: "unknown" }
      assert_response :success
      payload = response.parsed_body
      assert_equal tabs, payload["tabs"].map { |tab| tab["id"] }
      assert_equal "activity", payload["active_tab"]
      assert_empty payload["sections"]
      assert_empty response.body.scan(/translation missing: [\w.]+/)
      %w[select_entry selected_entries loading unavailable retry].each { |key| assert payload["text"][key].is_a?(String) }
    end
  end

  test "pending filters preserve nontransaction activity under confirmed and combined statuses" do
    investment = accounts(:investment)
    pending = create_transaction(account: investment, name: "Pending activity", amount: 20)
    pending.entryable.update!(extra: { "enable_banking" => { "pending" => true } })
    trade = entries(:trade)

    get account_url(investment, format: :json), params: { status: [ "pending" ] }
    assert_response :success
    rows = response.parsed_body.dig("activity", "groups").flat_map { |group| group["entries"] }
    assert_equal [ pending.id ], rows.map { |row| row["id"] }
    assert rows.first.dig("transaction", "pending")

    get account_url(investment, format: :json), params: { q: { status: [ "confirmed" ] } }
    assert_response :success
    rows = response.parsed_body.dig("activity", "groups").flat_map { |group| group["entries"] }
    assert_includes rows.map { |row| row["id"] }, trade.id
    assert_not_includes rows.map { |row| row["id"] }, pending.id

    get account_url(investment, format: :json), params: { status: [ "confirmed", "pending" ] }
    assert_response :success
    rows = response.parsed_body.dig("activity", "groups").flat_map { |group| group["entries"] }
    assert_includes rows.map { |row| row["id"] }, trade.id
    assert_includes rows.map { |row| row["id"] }, pending.id
  end

  test "property and vehicle overview return typed details without activity data" do
    Account::ActivityFeedData.expects(:new).never
    %i[property vehicle].each do |fixture|
      get account_url(accounts(fixture), format: :json), params: { tab: "overview" }
      assert_response :success
      payload = response.parsed_body
      assert_nil payload["activity"]
      assert payload["sections"].first["cards"].any?
      assert payload["sections"].first["actions"].any? { |action| action["key"] == "edit" }
    end
  end

  test "activity groups serialize account-currency balances and reconciliation values" do
    get account_url(@account, format: :json)

    assert_response :success
    balance = balances(:two)
    group = response.parsed_body.dig("activity", "groups").find { |item| item["date"] == balance.date.iso8601 }
    assert group
    assert_equal balance.end_balance_money.format, group["balance"]
    expected = UI::Account::BalanceReconciliation.new(balance: balance, account: @account).reconciliation_items
    assert_equal expected.map { |item| item[:label] }, group["reconciliation"].map { |item| item["label"] }
    assert_equal expected.map { |item| item[:value].format }, group["reconciliation"].map { |item| item["value"] }
    assert group["reconciliation"].all? { |item| item["tooltip"].present? && item["style"].present? }
  end

  test "remembers supported per_page and normalizes invalid page sizes" do
    get account_url(@account, format: :json), params: { per_page: 50 }
    assert_response :success
    assert_equal 50, response.parsed_body.dig("activity", "pagination", "per_page")
    get account_url(accounts(:credit_card), format: :json)
    assert_response :success
    assert_equal 50, response.parsed_body.dig("activity", "pagination", "per_page")
    get account_url(@account, format: :json), params: { per_page: 999, page: -5 }
    assert_response :success
    assert_equal 100, response.parsed_body.dig("activity", "pagination", "per_page")
    assert_equal 1, response.parsed_body.dig("activity", "pagination", "page")
  end


  test "should sync account" do
    post sync_account_url(@account)
    assert_redirected_to account_url(@account)
  end

  test "should get sparkline" do
    get sparkline_account_url(@account)
    assert_response :success
  end

  test "sparkline renders an empty series without a trend" do
    empty_series = Series.new(
      start_date: 1.day.ago.to_date,
      end_date: Date.current,
      interval: "1 day",
      values: []
    )
    Account.any_instance.expects(:sparkline_series).returns(empty_series)

    get sparkline_account_url(@account)

    assert_response :success
    assert_select "p.font-mono", count: 0
  end

  test "destroys account" do
    delete account_url(@account)
    assert_redirected_to accounts_path
    assert_enqueued_with job: DestroyJob
    assert_equal "Depository account scheduled for deletion", flash[:notice]
  end

  test "syncing linked account triggers sync for all provider items" do
    plaid_account = plaid_accounts(:one)
    AccountProvider.create!(account: @account, provider: plaid_account)

    # Reload to ensure the account has the provider association loaded
    @account.reload

    # Mock at the class level since controller loads account from DB
    Account.any_instance.expects(:syncing?).returns(false)
    PlaidItem.any_instance.expects(:syncing?).returns(false)
    PlaidItem.any_instance.expects(:sync_later_with_provider_refresh).once

    post sync_account_url(@account)
    assert_redirected_to account_url(@account)
  end

  test "syncing unlinked account calls account sync_later" do
    Account.any_instance.expects(:syncing?).returns(false)
    Account.any_instance.expects(:sync_later).once

    post sync_account_url(@account)
    assert_redirected_to account_url(@account)
  end

  test "confirms unlink for linked account" do
    plaid_account = plaid_accounts(:one)
    AccountProvider.create!(account: @account, provider: plaid_account)

    get confirm_unlink_account_url(@account)
    assert_response :success
  end

  test "redirects when confirming unlink for unlinked account" do
    get confirm_unlink_account_url(@account)
    assert_redirected_to account_url(@account)
    assert_equal "Account is not linked to a provider", flash[:alert]
  end

  test "unlinks linked account successfully with new system" do
    plaid_account = plaid_accounts(:one)
    AccountProvider.create!(account: @account, provider: plaid_account)
    @account.reload

    assert @account.linked?

    delete unlink_account_url(@account)
    @account.reload

    assert_not @account.linked?
    assert_redirected_to accounts_path
    assert_equal "Account unlinked successfully. It is now a manual account.", flash[:notice]
  end

  test "unlinks linked account successfully with legacy system" do
    plaid_account = plaid_accounts(:one)
    @account.update!(plaid_account_id: plaid_account.id)
    @account.reload

    assert @account.linked?

    delete unlink_account_url(@account)
    @account.reload

    assert_not @account.linked?
    assert_nil @account.plaid_account_id
    assert_redirected_to accounts_path
    assert_equal "Account unlinked successfully. It is now a manual account.", flash[:notice]
  end

  test "redirects when unlinking unlinked account" do
    delete unlink_account_url(@account)
    assert_redirected_to account_url(@account)
    assert_equal "Account is not linked to a provider", flash[:alert]
  end

  test "unlinked account can be deleted" do
    plaid_account = plaid_accounts(:one)
    AccountProvider.create!(account: @account, provider: plaid_account)
    @account.reload

    # Cannot delete while linked
    delete account_url(@account)
    assert_redirected_to account_url(@account)
    assert_equal "Cannot delete a linked account. Please unlink it first.", flash[:alert]

    # Unlink the account
    delete unlink_account_url(@account)
    @account.reload

    # Now can delete
    delete account_url(@account)
    assert_redirected_to accounts_path
    assert_enqueued_with job: DestroyJob
    assert_equal "Depository account scheduled for deletion", flash[:notice]
  end

  test "disabling an account keeps it visible on index" do
    @account.disable!

    get accounts_path(format: :json)

    assert_response :success
    account_ids = response.parsed_body["groups"].flat_map { |g| g["accounts"] }.map { |a| a["id"] }
    assert_includes account_ids, @account.id
  end

  test "toggle_active disables and re-enables an account" do
    patch toggle_active_account_url(@account)
    assert_redirected_to accounts_path
    @account.reload
    assert @account.disabled?

    patch toggle_active_account_url(@account)
    assert_redirected_to accounts_path
    @account.reload
    assert @account.active?
  end

  test "toggle_exclude_from_reports toggles the flag on an account" do
    assert_not @account.exclude_from_reports?

    patch toggle_exclude_from_reports_account_url(@account)
    assert_redirected_to accounts_path
    @account.reload
    assert @account.exclude_from_reports?

    patch toggle_exclude_from_reports_account_url(@account)
    assert_redirected_to accounts_path
    @account.reload
    assert_not @account.exclude_from_reports?
  end

  test "toggle_exclude_from_reports requires write permission" do
    sign_in users(:family_member)

    patch toggle_exclude_from_reports_account_url(accounts(:credit_card))
    assert_redirected_to account_url(accounts(:credit_card))
  end

  test "select_provider shows available providers" do
    get select_provider_account_url(@account)
    assert_response :success
  end

  test "set_default sets user default account" do
    patch set_default_account_url(@account)
    assert_redirected_to accounts_path
    @user.reload
    assert_equal @account.id, @user.default_account_id
  end

  test "set_default rejects ineligible account type" do
    investment = accounts(:investment)

    patch set_default_account_url(investment)
    assert_redirected_to accounts_path
    assert_equal I18n.t("accounts.set_default.depository_only"), flash[:alert]

    @user.reload
    assert_not_equal investment.id, @user.default_account_id
  end

  test "remove_default clears user default account" do
    @user.update!(default_account: @account)

    patch remove_default_account_url(@account)
    assert_redirected_to accounts_path

    @user.reload
    assert_nil @user.default_account_id
  end

  test "select_provider redirects for already linked account" do
    plaid_account = plaid_accounts(:one)
    AccountProvider.create!(account: @account, provider: plaid_account)

    get select_provider_account_url(@account)
    assert_redirected_to account_url(@account)
    assert_equal "Account is already linked to a provider", flash[:alert]
  end

  test "unlink preserves SnaptradeAccount record" do
    snaptrade_account = snaptrade_accounts(:fidelity_401k)
    investment = accounts(:investment)
    AccountProvider.create!(account: investment, provider: snaptrade_account)
    investment.reload

    assert investment.linked?

    delete unlink_account_url(investment)
    investment.reload

    assert_not investment.linked?
    assert_redirected_to accounts_path
    # SnaptradeAccount should still exist (not destroyed)
    assert SnaptradeAccount.exists?(snaptrade_account.id), "SnaptradeAccount should be preserved after unlink"
    # But AccountProvider should be gone
    assert_not AccountProvider.exists?(provider_type: "SnaptradeAccount", provider_id: snaptrade_account.id)
  end

  test "unlink does not enqueue SnapTrade cleanup job" do
    snaptrade_account = snaptrade_accounts(:fidelity_401k)
    investment = accounts(:investment)
    AccountProvider.create!(account: investment, provider: snaptrade_account)
    investment.reload

    assert_no_enqueued_jobs(only: SnaptradeConnectionCleanupJob) do
      delete unlink_account_url(investment)
    end
  end

  test "unlink detaches holdings from SnapTrade provider" do
    snaptrade_account = snaptrade_accounts(:fidelity_401k)
    investment = accounts(:investment)
    ap = AccountProvider.create!(account: investment, provider: snaptrade_account)

    # Assign a holding to this provider
    holding = holdings(:one)
    holding.update!(account_provider: ap)

    delete unlink_account_url(investment)
    holding.reload

    assert_nil holding.account_provider_id, "Holding should be detached from provider after unlink"
  end

  # Regression for #2516: the account sidebar fragment cache renders DS::* view
  # components, which Rails' ERB dependency tracker mis-parses as a bogus "Ds/D"
  # template dependency. With automatic digesting enabled that logged
  # "Couldn't find template for digesting: Ds/D" on every cache miss. The
  # fragment is manually versioned and opts out of digesting via skip_digest.
  test "sidebar fragment cache does not log a bogus template digest error" do
    log = StringIO.new
    logger = ActiveSupport::Logger.new(log)

    original_perform_caching = ActionController::Base.perform_caching
    original_view_logger = ActionView::Base.logger
    original_rails_logger = Rails.logger

    ActionController::Base.perform_caching = true
    ActionView::Base.logger = logger
    Rails.logger = logger

    get accounts_path
    assert_response :success
    assert_no_match(/Couldn't find template for digesting/, log.string)
  ensure
    ActionController::Base.perform_caching = original_perform_caching
    ActionView::Base.logger = original_view_logger
    Rails.logger = original_rails_logger
  end

  # --- member-owned connections (issue #3579) ------------------------------

  test "an owner is not shown a connection carrying an account they cannot see" do
    # Ownership must not widen exposure: the card renders the item's accounts
    # unfiltered (and is re-rendered by a viewer-less broadcast), so the whole
    # card is withheld rather than shown with a filtered list.
    member = users(:family_member)
    family = families(:dylan_family)
    item = PlaidItem.create!(
      family: family, plaid_id: "item_card_#{SecureRandom.hex(4)}",
      access_token: "token", name: "Owned Bank", owner: member
    )
    hidden = Account.create!(
      family: family, owner: users(:family_admin), name: "Not Shared With Member",
      balance: 100, currency: "USD", accountable: Depository.new
    )
    hidden.account_shares.destroy_all
    plaid_account = PlaidAccount.create!(
      plaid_item: item, name: "Hidden Feed", plaid_id: "acct_card_#{SecureRandom.hex(4)}",
      plaid_type: "depository", plaid_subtype: "checking", currency: "USD",
      current_balance: 100, available_balance: 100
    )
    AccountProvider.create!(account: hidden, provider: plaid_account)

    sign_in member
    get accounts_url

    assert_response :success
    assert_select "##{ActionView::RecordIdentifier.dom_id(item)}", count: 0
    assert_no_match(/Not Shared With Member/, response.body)
  end

  test "an owner is shown their freshly connected item before it has any accounts" do
    # The case ownership visibility exists for: just connected, nothing synced.
    member = users(:family_member)
    item = PlaidItem.create!(
      family: families(:dylan_family), plaid_id: "item_fresh_#{SecureRandom.hex(4)}",
      access_token: "token", name: "Fresh Bank", owner: member
    )

    sign_in member
    get accounts_url(format: :json)

    assert_response :success
    assert response.parsed_body["items"].any? { |it| it["id"] == item.id }
  end


  test "an owner sees the management controls on their own connection card" do
    member = users(:family_member)
    item = PlaidItem.create!(
      family: families(:dylan_family), plaid_id: "item_ctrl_#{SecureRandom.hex(4)}",
      access_token: "token", name: "Controls Bank", owner: member
    )

    sign_in member
    get accounts_url(format: :json)

    assert_response :success
    target = response.parsed_body["items"].find { |it| it["id"] == item.id }
    assert target["manage_href"].present?
  end

  test "a member demoted to guest loses the controls on a connection they own" do
    member = users(:family_member)
    item = PlaidItem.create!(
      family: families(:dylan_family), plaid_id: "item_demote_#{SecureRandom.hex(4)}",
      access_token: "token", name: "Demoted Bank", owner: member
    )
    member.update!(role: :guest)

    sign_in member
    get accounts_url(format: :json)

    assert_response :success
    target = response.parsed_body["items"].find { |it| it["id"] == item.id }
    assert_nil target["manage_href"]
  end

  test "a member sees no controls on a connection someone else owns" do
    item = PlaidItem.create!(
      family: families(:dylan_family), plaid_id: "item_noctrl_#{SecureRandom.hex(4)}",
      access_token: "token", name: "Admin Bank", owner: users(:family_admin)
    )

    sign_in users(:family_member)
    get accounts_url(format: :json)

    assert_response :success
    target = response.parsed_body["items"].find { |it| it["id"] == item.id }
    assert_nil target&.[]("manage_href")
  end
end

class AccountsControllerSimplefinCtaTest < ActionDispatch::IntegrationTest
  fixtures :users, :families

  setup do
    sign_in users(:family_admin)
    @family = families(:dylan_family)
  end


  test "when SFAs exist and none unlinked and manuals exist, no relink modal is shown (unified flow)" do
    item = SimplefinItem.create!(family: @family, name: "Conn2", access_url: "https://example.com/access")
    # Create a manual linked to SFA so unlinked count == 0
    sfa = item.simplefin_accounts.create!(name: "B", account_id: "sf_b", currency: "USD", current_balance: 1, account_type: "depository")
    linked = Account.create!(family: @family, name: "Linked", currency: "USD", balance: 0, accountable_type: "Depository", accountable: Depository.create!(subtype: "savings"))
    # Legacy association sufficient to count as linked
    sfa.update!(account: linked)

    # Also create another manual account to make manuals_exist true
    Account.create!(family: @family, name: "Manual B", currency: "USD", balance: 0, accountable_type: "Depository", accountable: Depository.create!(subtype: "checking"))

    get accounts_path(format: :json)
    assert_response :success
    item_data = response.parsed_body["items"].find { |it| it["id"] == item.id }
    assert_nil item_data["setup_href"]
  end

  test "when no SFAs exist, shows neither CTA" do
    item = SimplefinItem.create!(family: @family, name: "Conn3", access_url: "https://example.com/access")

    get accounts_path(format: :json)
    assert_response :success
    item_data = response.parsed_body["items"].find { |it| it["id"] == item.id }
    assert_nil item_data["setup_href"]
  end


  test "member does not receive setup href" do
    member = users(:family_member)
    item = SimplefinItem.create!(family: @family, name: "Conn Member", access_url: "https://example.com/access")
    item.simplefin_accounts.create!(name: "M", account_id: "sf_m_#{SecureRandom.hex(4)}", currency: "USD", current_balance: 1, account_type: "depository")

    sign_in member
    get accounts_path(format: :json)
    assert_response :success
    item_data = response.parsed_body["items"].find { |it| it["id"] == item.id }
    # Members either don't see the card or see it without the admin-gated setup action.
    assert item_data.nil? || item_data["setup_href"].nil?
  end
end
