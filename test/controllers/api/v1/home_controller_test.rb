# frozen_string_literal: true

require "test_helper"

class Api::V1::HomeControllerTest < ActionDispatch::IntegrationTest
  include EntriesTestHelper

  setup do
    @user = users(:family_admin)
    @family = @user.family
    accounts(:depository).accountable.update!(subtype: "checking")
    @user.api_keys.active.destroy_all

    @read_key = ApiKey.create!(
      user: @user,
      name: "Home Read Key",
      scopes: [ "read" ],
      display_key: "test_home_ro_#{SecureRandom.hex(8)}",
      source: "mobile"
    )
    @write_key = ApiKey.create!(
      user: @user,
      name: "Home Write Key",
      scopes: [ "read_write" ],
      display_key: "test_home_rw_#{SecureRandom.hex(8)}",
      source: "mobile"
    )

    Redis.new.del("api_rate_limit:#{@read_key.id}")
    Redis.new.del("api_rate_limit:#{@write_key.id}")
  end

  test "requires authentication" do
    get "/api/v1/home"
    assert_response :unauthorized
  end

  test "read and read_write keys return the full home payload" do
    [ @read_key, @write_key ].each do |key|
      get "/api/v1/home", headers: api_headers(key)
      assert_response :success, "expected success for #{key.scopes.inspect}"

      payload = response.parsed_body
      %w[
        has_accounts first_name two_column preview period sections
        balance_sheet net_worth cashflow_sankey cash_forecast money_flow spending_trend
        outflows investment_summary insights
      ].each do |top_key|
        assert payload.key?(top_key), "expected payload to include #{top_key}"
      end

      assert_equal true, payload["has_accounts"]
      assert_equal @user.first_name, payload["first_name"]
      assert_equal @user.dashboard_two_column?, payload["two_column"]
      assert_equal @user.preview_features_enabled?, payload["preview"]
      assert_equal @family.currency, payload.dig("balance_sheet", "currency")

      sections = payload["sections"]
      assert sections.is_a?(Array)
      assert_equal sections.map { |s| s["key"] }.uniq.size, sections.size
      sections.each do |section|
        assert section["layout"].key?("col_span")
        assert_includes [ true, false ], section["collapsed"]
      end
    end
  end

  test "payload covers all eight dashboard widgets" do
    account = @family.accounts.create!(name: "Home Checking", currency: @family.currency, balance: 0, accountable: Depository.new)
    create_transaction(account: account, name: "Paycheck", amount: -1000, date: Date.current.beginning_of_month)
    create_transaction(account: account, name: "Groceries", amount: 40, date: Date.current.beginning_of_month)
    @family.accounts.create!(name: "Home Brokerage", currency: @family.currency, balance: 0, accountable: Investment.new)

    get "/api/v1/home", headers: api_headers(@read_key)
    assert_response :success
    payload = response.parsed_body

    section_keys = payload["sections"].map { |s| s["key"] }
    %w[
      cashflow_sankey cash_forecast money_flow spending_trend outflows_donut
      investment_summary net_worth_chart balance_sheet
    ].each do |key|
      assert_includes section_keys, key
    end

    sankey = payload["cashflow_sankey"]
    assert sankey["nodes"].any?
    assert sankey["links"].any?
    assert sankey["currency_symbol"].present?

    money_flow = payload["money_flow"]
    assert_equal 6, money_flow["bars"].size
    assert money_flow["month_label"].present?
    assert money_flow["income_href"].include?("q%5Btypes%5D%5B%5D=income")
    assert money_flow["expense_href"].include?("q%5Btypes%5D%5B%5D=expense")
    assert_includes %w[positive negative neutral], money_flow["balance_tone"]
    assert money_flow["period"]["date_range_label"].present?

    spending = payload["spending_trend"]
    assert spending["current"].any?
    assert spending["axis_labels"].any?
    assert spending["period"]["date_range_label"].present?
    assert_includes %w[up down flat], spending["delta_tone"]

    outflows = payload["outflows"]
    assert outflows["categories"].any?
    assert outflows["total_formatted"].present?
    assert outflows["period"]["start_date"].present?

    net_worth = payload["net_worth"]
    assert net_worth["series"].is_a?(Array)
    assert net_worth["comparison_label"].present?

    groups = payload.dig("balance_sheet", "classification_groups")
    assert groups.any?
    assert groups.flat_map { |g| g["account_groups"] }.any?

    investments = payload["investment_summary"]
    assert_equal true, investments["present"]
  end

  test "sections include insights feed first when preview features enabled with visible insights" do
    @user.update!(preferences: @user.preferences.merge("preview_features_enabled" => true))
    @family.insights.create!(
      insight_type: "idle_cash",
      priority: "high",
      status: "active",
      title: "Put idle cash to work",
      body: "One account has more cash than usual.",
      generated_at: Time.current,
      dedup_key: "home-feed-test"
    )

    get "/api/v1/home", headers: api_headers(@read_key)
    assert_response :success
    payload = response.parsed_body

    assert_equal true, payload["preview"]
    assert_equal "insights_feed", payload["sections"].first["key"]
    assert_equal true, payload["sections"].first["visible"]

    insights = payload["insights"]
    assert_equal true, insights["enabled"]
    assert insights["insights"].any?
    row = insights["insights"].first
    %w[id type title body priority status icon_key icon_css_color sentiment acknowledge_path].each do |key|
      assert row.key?(key), "expected insight to include #{key}"
    end
  end

  test "insights hidden without preview features" do
    @user.update!(preferences: @user.preferences.merge("preview_features_enabled" => false))

    get "/api/v1/home", headers: api_headers(@read_key)
    assert_response :success
    payload = response.parsed_body

    assert_equal false, payload["insights"]["enabled"]
    assert_equal [], payload["insights"]["insights"]
    assert_not payload["sections"].map { |s| s["key"] }.include?("insights_feed")
  end

  test "money flow honors month and account filter params" do
    account = @family.accounts.create!(name: "Home Filter Checking", currency: @family.currency, balance: 0, accountable: Depository.new)
    other = @family.accounts.create!(name: "Home Filter Savings", currency: @family.currency, balance: 0, accountable: Depository.new)
    selected_month = 2.months.ago.beginning_of_month.to_date
    create_transaction(account: account, name: "Filtered", amount: 25, date: selected_month)

    get "/api/v1/home",
      params: { money_flow_month: selected_month.iso8601, money_flow_account_ids: [ account.id ] },
      headers: api_headers(@read_key)
    assert_response :success
    money_flow = response.parsed_body["money_flow"]

    assert_equal selected_month.iso8601, money_flow["month"]
    assert_equal [ account.id.to_s ], money_flow["account_ids"]
    assert_equal false, money_flow["all_accounts_selected"]
    assert_includes money_flow["accounts"].map { |a| a["name"] }, account.name
    assert money_flow["expense_href"].include?("account_ids")
  end

  test "money flow excludes tax advantaged accounts from totals and drill downs" do
    retirement = @family.accounts.create!(
      name: "Home Retirement", owner: @user, currency: @family.currency,
      balance: 0, accountable: Investment.new(subtype: "401k")
    )
    create_transaction(account: retirement, amount: 999, date: Date.current)

    get "/api/v1/home", headers: api_headers(@read_key)
    assert_response :success
    default_flow = response.parsed_body.fetch("money_flow")
    assert_not_includes default_flow.fetch("accounts").map { |account| account.fetch("id") }, retirement.id
    %w[income_href expense_href].each do |key|
      query = Rack::Utils.parse_nested_query(URI.parse(default_flow.fetch(key)).query).fetch("q")
      assert_not_includes query.fetch("account_ids"), retirement.id
    end

    get "/api/v1/home", params: { money_flow_account_ids: [ retirement.id ] }, headers: api_headers(@read_key)
    assert_response :success
    filtered_flow = response.parsed_body.fetch("money_flow")
    assert_nil filtered_flow.fetch("account_ids")
    assert_equal default_flow.fetch("bars"), filtered_flow.fetch("bars")
  end

  test "money flow clamps a future month instead of erroring" do
    get "/api/v1/home",
      params: { money_flow_month: 1.month.from_now.beginning_of_month.iso8601 },
      headers: api_headers(@read_key)
    assert_response :success
    money_flow = response.parsed_body["money_flow"]
    assert_equal Date.current.beginning_of_month.iso8601, money_flow["month"]
  end

  test "money flow omits account ids from drill-down links when selection matches accessible accounts" do
    get "/api/v1/home", headers: api_headers(@read_key)
    assert_response :success
    money_flow = response.parsed_body["money_flow"]

    assert_nil money_flow["account_ids"]
    assert_not money_flow["income_href"].include?("account_ids")
    assert_not money_flow["expense_href"].include?("account_ids")
  end

  test "spending trend honors the spending month param and clamps invalid input" do
    account = @family.accounts.create!(name: "Home Spending Checking", currency: @family.currency, balance: 0, accountable: Depository.new)
    selected_month = 2.months.ago.beginning_of_month.to_date
    create_transaction(account: account, name: "Spend", amount: 10, date: selected_month)

    get "/api/v1/home", params: { spending_month: selected_month.iso8601 }, headers: api_headers(@read_key)
    assert_response :success
    assert_equal selected_month.iso8601, response.parsed_body.dig("spending_trend", "month")

    get "/api/v1/home", params: { spending_month: "not-a-date" }, headers: api_headers(@read_key)
    assert_response :success
    assert_equal Date.current.beginning_of_month.iso8601, response.parsed_body.dig("spending_trend", "month")
  end

  test "period params scope the home payload" do
    get "/api/v1/home",
      params: { start_date: 7.days.ago.to_date.iso8601, end_date: Date.current.iso8601 },
      headers: api_headers(@read_key)
    assert_response :success
    assert_equal 7.days.ago.to_date.iso8601, response.parsed_body.dig("period", "start_date")
  end
  test "investment summary reports holdings and activity when present" do
    investment = @family.accounts.create!(
      name: "Home Brokerage", currency: @family.currency, balance: 0, accountable: Investment.new
    )
    investment.holdings.create!(
      security: securities(:msft),
      date: Date.current,
      qty: 10,
      price: 100,
      amount: 1000,
      currency: @family.currency
    )

    get "/api/v1/home", headers: api_headers(@read_key)
    assert_response :success
    summary = response.parsed_body["investment_summary"]

    assert_equal true, summary["present"]
    assert summary["portfolio_value"].key?("formatted")
    assert summary["holdings"].any?
    assert_includes summary["holdings"].map { |h| h["ticker"] }, "MSFT"
  end

  test "browser session authenticates read access" do
    sign_in @user
    get "/api/v1/home"
    assert_response :success
    assert response.parsed_body.key?("balance_sheet")
  end
  test "cash forecast projects checking occurrences over 30 days" do
    set_cash(5000)
    create_series(name: "Rent", amount: 1500, due: Date.current + 10)
    create_series(name: "Paycheck", amount: -2000, due: Date.current + 5, income: true)

    get "/api/v1/home", headers: api_headers(@read_key)
    assert_response :success
    forecast = response.parsed_body["cash_forecast"]

    assert_equal @family.currency, forecast["starting_balance"]["currency"]
    assert forecast["starting_balance"]["formatted"].present?
    assert_equal 31, forecast["series"].size, "today plus 30 days"
    assert_equal Date.current.iso8601, forecast["series"].first["date"]
    assert_equal (Date.current + 30).iso8601, forecast["series"].last["date"]
    assert_equal forecast["series"].last["balance"], forecast["ending_balance"]

    events = forecast["events"]
    assert_equal 2, events.size
    rent = events.find { |e| e["name"] == "Rent" }
    paycheck = events.find { |e| e["name"] == "Paycheck" }
    assert_equal "outflow", rent["direction"]
    assert_equal "inflow", paycheck["direction"]
    assert_equal (Date.current + 10).iso8601, rent["date"]
    assert_equal (Date.current + 5).iso8601, paycheck["date"]
  end

  test "cash forecast excludes savings balances and recurring activity" do
    set_cash(5000)
    savings = @family.accounts.create!(
      name: "Mortgage Escrow", currency: @family.currency, balance: 16_605.29,
      accountable: Depository.new(subtype: "savings")
    )
    create_series(name: "Escrow Deposit", amount: -800, due: Date.current + 5, account: savings, income: true)
    create_series(name: "Escrow Disbursement", amount: 1200, due: Date.current + 10, account: savings)
    create_series(name: "Rent", amount: 1500, due: Date.current + 10)
    create_series(name: "Paycheck", amount: -2000, due: Date.current + 5, income: true)

    get "/api/v1/home", headers: api_headers(@read_key)
    assert_response :success
    forecast = response.parsed_body["cash_forecast"]

    assert_equal Money.new(5000, @family.currency).as_json, forecast["starting_balance"]
    assert_equal Money.new(5500, @family.currency).as_json, forecast["ending_balance"]
    assert_equal [ "Paycheck", "Rent" ], forecast["events"].map { |event| event["name"] }
  end

  test "cash forecast is null when only savings accounts remain" do
    Depository.where(id: @family.accounts.where(accountable_type: "Depository").select(:accountable_id))
      .update_all(subtype: "savings")

    get "/api/v1/home", headers: api_headers(@read_key)
    assert_response :success
    assert_nil response.parsed_body["cash_forecast"]
  end

  test "cash forecast excludes credit-card series and transfers" do
    set_cash(5000)
    create_series(name: "Card Bill", amount: 300, due: Date.current + 7, account: accounts(:credit_card))
    checking = accounts(:depository)
    savings = @family.accounts.create!(name: "Forecast Savings", currency: @family.currency, balance: 0, accountable: Depository.new(subtype: "savings"))
    create_series(name: "Vault Sweep", amount: 400, due: Date.current + 6, account: checking, destination_account: savings)
    create_series(name: "Rent", amount: 1500, due: Date.current + 10)

    get "/api/v1/home", headers: api_headers(@read_key)
    assert_response :success
    names = response.parsed_body["cash_forecast"]["events"].map { |e| e["name"] }

    assert_equal [ "Rent" ], names
  end

  test "cash forecast includes every visible dynamic statement payment remainder" do
    travel_to Time.zone.local(2026, 10, 12, 12) do
      set_cash(5000)
      card = create_statement_card(name: "Statement Card", amount: 600, due_day: 20)
      occurrence = card.recurring_transactions.find_by!(system_managed_kind: "credit_card_payment")
        .recurring_occurrences.open_status.first!
      RecurringTransaction::Allocator.new(occurrence).allocate!(amount: 100)
      create_statement_card(name: "Second Statement Card", amount: 250, due_day: 25)
      create_statement_card(name: "Paid Statement Card", amount: 300, due_day: 22).tap do |paid_card|
        paid_occurrence = paid_card.recurring_transactions.find_by!(system_managed_kind: "credit_card_payment")
          .recurring_occurrences.open_status.first!
        RecurringTransaction::Allocator.new(paid_occurrence).mark_paid!
      end
      create_statement_card(name: "Hidden Statement Card", amount: 400, due_day: 23).update!(status: "disabled")
      create_statement_card(name: "Unconfigured Statement Card", amount: 600, due_day: 24)
        .accountable.update_column(:payment_due_day, nil)
      create_statement_card(name: "Foreign Statement Card", amount: 900, due_day: 24, currency: "EUR")
      create_series(name: "Card Purchase", amount: 75, due: Date.current + 2, account: card)
      create_series(name: "Savings Sweep", amount: 200, due: Date.current + 3,
        destination_account: card)

      get "/api/v1/home", headers: api_headers(@read_key)
      assert_response :success
      forecast = response.parsed_body["cash_forecast"]

      assert_equal Money.new(5000, "USD").as_json, forecast["starting_balance"]
      assert_equal Money.new(4250, "USD").as_json, forecast["ending_balance"]
      assert_equal [
        { "date" => "2026-10-20", "name" => "Statement Card", "amount" => Money.new(500, "USD").as_json, "direction" => "outflow" },
        { "date" => "2026-10-25", "name" => "Second Statement Card", "amount" => Money.new(250, "USD").as_json, "direction" => "outflow" }
      ], forecast["events"]
    end
  end

  test "cash forecast includes due today statement payments but excludes overdue statements" do
    travel_to Time.zone.local(2026, 10, 12, 12) do
      set_cash(5000)
      create_statement_card(name: "Overdue Statement Card", amount: 200, due_day: 10)
      create_statement_card(name: "Due Today Statement Card", amount: 300, due_day: 12)

      get "/api/v1/home", headers: api_headers(@read_key)
      assert_response :success
      forecast = response.parsed_body["cash_forecast"]

      assert_equal Money.new(4700, "USD").as_json, forecast["ending_balance"]
      assert_equal Money.new(4700, "USD").as_json, forecast["series"].first["balance"]
      assert_equal [
        { "date" => Date.current.iso8601, "name" => "Due Today Statement Card", "amount" => Money.new(300, "USD").as_json, "direction" => "outflow" }
      ], forecast["events"]
      assert_equal({ "date" => Date.current.iso8601, "balance" => Money.new(4700, "USD").as_json }, forecast["lowest"])
    end
  end

  test "cash forecast excludes foreign-currency occurrences" do
    set_cash(5000)
    create_series(name: "Tokyo Storage", amount: 10_000, due: Date.current + 4, currency: "JPY")
    create_series(name: "Rent", amount: 1500, due: Date.current + 10)

    get "/api/v1/home", headers: api_headers(@read_key)
    assert_response :success
    names = response.parsed_body["cash_forecast"]["events"].map { |e| e["name"] }

    assert_equal [ "Rent" ], names
  end

  test "cash forecast counts every weekly hit and partial-payment remainder" do
    set_cash(5000)
    weekly = create_series(name: "Groceries", amount: 200, due: Date.current + 2, preset: "weekly")
    first = weekly.recurring_occurrences.order(:due_on).first
    RecurringTransaction::Allocator.new(first).allocate!(amount: "50")

    get "/api/v1/home", headers: api_headers(@read_key)
    assert_response :success
    forecast = response.parsed_body["cash_forecast"]
    hits = forecast["events"].select { |e| e["name"] == "Groceries" }

    assert hits.size >= 4, "weekly series contributes every hit in the window, got #{hits.size}"
    assert_includes hits.map { |e| e["amount"]["amount"] }, Money.new(150, @family.currency).as_json["amount"],
      "partially paid first hit contributes only its remainder"
    assert hits.all? { |e| e["direction"] == "outflow" }
  end

  test "cash forecast limits income and expenses to today through day thirty" do
    travel_to Time.zone.local(2026, 10, 12, 12) do
      set_cash(5000)
      [
        create_series(name: "Paycheck", amount: -1000, due: Date.current, income: true),
        create_series(name: "Power", amount: 120, due: Date.current)
      ].each do |series|
        series.recurring_occurrences.delete_all
        [ -1, 0, 30, 31 ].each do |offset|
          due = Date.current + offset
          series.recurring_occurrences.create!(
            family: @family, original_due_on: due, due_on: due, currency: @family.currency
          )
        end
      end

      get "/api/v1/home", headers: api_headers(@read_key)
      assert_response :success
      forecast = response.parsed_body["cash_forecast"]

      assert_equal [
        [ Date.current.iso8601, "Paycheck" ],
        [ Date.current.iso8601, "Power" ],
        [ (Date.current + 30).iso8601, "Paycheck" ],
        [ (Date.current + 30).iso8601, "Power" ]
      ], forecast["events"].map { |event| [ event["date"], event["name"] ] }
      assert_equal Money.new(5880, "USD").as_json, forecast["series"].first["balance"]
      assert_equal Money.new(6760, "USD").as_json, forecast["ending_balance"]
    end
  end

  test "cash forecast surfaces an overdraft floor" do
    set_cash(100)
    create_series(name: "Rent", amount: 1500, due: Date.current + 10)

    get "/api/v1/home", headers: api_headers(@read_key)
    assert_response :success
    forecast = response.parsed_body["cash_forecast"]

    assert_equal true, forecast["below_zero"]
    assert forecast["lowest"].present?
    assert_equal (Date.current + 10).iso8601, forecast["lowest"]["date"]
  end

  test "cash forecast is null without family-currency checking accounts" do
    @family.accounts.where(accountable_type: "Depository").update_all(currency: "EUR")

    get "/api/v1/home", headers: api_headers(@read_key)
    assert_response :success
    payload = response.parsed_body

    assert payload.key?("cash_forecast"), "key always present (object-or-null)"
    assert_nil payload["cash_forecast"]
  end


  private
    def api_headers(auth)
      { "X-Api-Key" => auth.display_key }
    end

    # Pin cash in the primary checking account; leave other deposit balances at zero.
    def set_cash(amount)
      @family.accounts.where(accountable_type: "Depository").update_all(balance: 0)
      accounts(:depository).update_column(:balance, amount)
    end

    def create_statement_card(name:, amount:, due_day:, currency: "USD")
      account = @family.accounts.create!(
        name: name, owner: @user, currency: currency, balance: amount,
        accountable: CreditCard.new(payment_due_day: due_day)
      )
      account.accountable.payment_schedule.refresh!
      account
    end

    def create_series(name:, amount:, due:, preset: "monthly", income: false, account: accounts(:depository), destination_account: nil, currency: "USD")
      series = @family.recurring_transactions.create!(
        name: name,
        account: account,
        destination_account: destination_account,
        amount: amount,
        currency: currency,
        bill_type: income ? "income" : "bill",
        expected_day_of_month: due.day,
        anchor_date: due,
        last_occurrence_date: due,
        next_expected_date: due,
        status: "active",
        manual: true
      )

      if preset != "monthly"
        RecurringTransaction::FrequencyPreset.apply(series, preset: preset, weekday: due.wday)
        series.save!
      end

      series
    end
end
