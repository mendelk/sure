require "test_helper"

class PagesControllerTest < ActionDispatch::IntegrationTest
  include EntriesTestHelper

  setup do
    sign_in @user = users(:family_admin)
    @intro_user = users(:intro_user)
    @family = @user.family
  end

  test "SureQL preview pages preserve take limits and authorization beyond fifty rows" do
    account = @family.accounts.create!(name: "SureQL pages", owner: @user, balance: 0, currency: "USD", accountable: Depository.new)
    entries = 105.times.map do |index|
      create_transaction(account: account, name: format("SureQL page %03d", index + 1), amount: 809.25)
    end
    private_account = @family.accounts.create!(name: "Private SureQL pages", owner: users(:family_member), balance: 0, currency: "USD", accountable: Depository.new)
    create_transaction(account: private_account, name: "SureQL page 000", amount: 809.25)
    source = "from transactions\nfilter amount == 809.25\nsort {name}\nselect {id, name, amount}\ntake 100"

    [ 0, 10, 50, 90 ].each do |offset|
      post dashboard_monarch_run_path, params: { source: source, pagination: { limit: 10, offset: offset } }, as: :json
      assert_response :ok
      result = response.parsed_body
      assert_equal entries.slice(offset, 10).map(&:id), result.fetch("rows").map { |row| row.fetch("id") }
      assert_equal 10, result.fetch("row_count")
      assert_equal({ "limit" => 10, "offset" => offset, "hasNext" => offset < 90 }, result.fetch("pagination"))
      assert_not result.fetch("truncated")
    end

    post dashboard_monarch_run_path, params: { source: source, pagination: { limit: 10, offset: 100 } }, as: :json
    assert_response :ok
    exhausted = response.parsed_body
    assert_empty exhausted.fetch("rows")
    assert_equal [ "id", "name", "amount" ], exhausted.fetch("columns")
    assert_not exhausted.fetch("pagination").fetch("hasNext")
  end

  test "SureQL preview rejects unsafe page bounds" do
    [ { limit: 101, offset: 0 }, { limit: 10, offset: -1 }, { limit: "10.5", offset: 0 }, "invalid" ].each do |pagination|
      post dashboard_monarch_run_path, params: { source: "from transactions", pagination: pagination }, as: :json
      assert_response :unprocessable_entity
      assert response.parsed_body.key?("error")
      assert_not response.parsed_body.key?("rows")
    end
  end

  test "structured report catalog is authorized without requiring raw source" do
    private_account = @family.accounts.create!(name: "Private catalog account", owner: users(:family_member), balance: 0, currency: "EUR", accountable: Depository.new)
    create_transaction(account: private_account, currency: "EUR", amount: 123)

    post dashboard_monarch_run_path, params: { catalog: true }, as: :json

    assert_response :ok
    catalog = response.parsed_body
    assert_equal "transactions", catalog.fetch("source")
    account_options = catalog.fetch("fields").find { |field| field.fetch("key") == "account" }.fetch("options")
    assert_not_includes account_options.map { |option| option.fetch("value") }, private_account.id
  end

  test "structured reports execute signed monthly totals without requiring raw source" do
    account = @family.accounts.create!(name: "Report endpoint account", owner: @user, balance: 0, currency: "USD", accountable: Depository.new)
    create_transaction(account: account, amount: 20, date: Date.new(2025, 1, 2))
    create_transaction(account: account, amount: -7, date: Date.new(2025, 1, 3))
    report = {
      version: 1, source: "transactions", mode: "aggregate",
      rows: [ { id: "category", field: "category" } ],
      columns: [ { id: "month", field: "date", dateBucket: "month" } ],
      values: [ { id: "total", field: "amount", aggregation: "sum" } ],
      filters: [ { field: "account", operator: "equals", value: account.id } ], sort: []
    }

    post dashboard_monarch_run_path, params: { report: report }, as: :json

    assert_response :ok
    result = response.parsed_body
    assert_equal "aggregate", result.fetch("mode")
    assert_equal [ nil ], result.fetch("metadata").fetch("rows").first.fetch("values")
    assert_equal 13, result.fetch("result").first.fetch("total").to_d
    assert_equal [ "2025-01" ], result.fetch("metadata").fetch("columns").first.fetch("labels")
    field = result.fetch("metadata").fetch("fields").find { |item| item["role"] == "value" }
    assert_equal 13, result.fetch("result").first.fetch(field.fetch("key")).to_d
    assert_equal "currency", field.fetch("kind")
    assert_equal "USD", field.fetch("currency")
    assert_not result.fetch("truncated")
  end

  test "detail report pages preserve duplicate mixed currency transactions across offsets" do
    account = @family.accounts.create!(name: "Detail endpoint account", owner: @user, balance: 0, currency: "USD", accountable: Depository.new)
    entries = 51.times.map do |index|
      create_transaction(account: account, name: "Duplicate", amount: "-900719925474099.1234", date: Date.new(2025, 1, 2),
        currency: index.even? ? "USD" : "EUR", id: format("00000000-0000-0000-0000-%012d", index + 1))
    end
    create_transaction(account: account, amount: 999, excluded: true, date: Date.new(2025, 1, 3))
    report = {
      version: 1, source: "transactions", mode: "detail",
      columns: [ { field: "amount" }, { field: "name" } ],
      filters: [ { field: "account", operator: "equals", value: account.id } ], sort: []
    }

    post dashboard_monarch_run_path, params: { report: report }, as: :json
    assert_response :ok
    first = response.parsed_body
    assert_equal "detail", first.fetch("mode")
    assert_equal [ "amount", "name" ], first.fetch("metadata").fetch("fields").map { |column| column.fetch("key") }
    assert_equal entries.first(10).map(&:id), first.fetch("metadata").fetch("rows").map { |row| row.fetch("id") }
    assert_equal [ "USD", "EUR" ] * 5, first.fetch("metadata").fetch("rows").map { |row| row.fetch("currency") }
    assert first.fetch("result").all? { |row| row == { "amount" => "-900719925474099.1234", "name" => "Duplicate" } }
    assert first.fetch("pagination").fetch("hasNext")
    assert_not first.fetch("truncated")

    post dashboard_monarch_run_path, params: { report: report, pagination: { limit: 25, offset: 25 } }, as: :json
    assert_response :ok
    custom = response.parsed_body
    assert_equal entries.slice(25, 25).map(&:id), custom.fetch("metadata").fetch("rows").map { |row| row.fetch("id") }
    assert_equal({ "limit" => 25, "offset" => 25, "hasNext" => true }, custom.fetch("pagination"))

    post dashboard_monarch_run_path, params: { report: report, pagination: { limit: 25, offset: 50 } }, as: :json
    assert_response :ok
    last = response.parsed_body
    assert_equal [ entries.last.id ], last.fetch("metadata").fetch("rows").map { |row| row.fetch("id") }
    assert_not last.fetch("pagination").fetch("hasNext")
  end

  test "detail endpoint scopes explicit account filters to accessible accounts and retains empty metadata" do
    private_account = @family.accounts.create!(name: "Private detail endpoint", owner: users(:family_member), balance: 0, currency: "USD", accountable: Depository.new)
    shared_account = @family.accounts.create!(name: "Shared detail endpoint", owner: users(:family_member), balance: 0, currency: "USD", accountable: Depository.new)
    shared_account.account_shares.create!(user: @user, permission: "read_only")
    create_transaction(account: private_account, amount: 900)
    shared = create_transaction(account: shared_account, amount: -17)
    report = {
      version: 1, source: "transactions", mode: "detail",
      columns: [ { field: "account" }, { field: "amount" } ],
      filters: [ { field: "account", operator: "equals", value: private_account.id } ], sort: []
    }

    post dashboard_monarch_run_path, params: { report: report }, as: :json
    assert_response :ok
    empty = response.parsed_body
    assert_equal [ "account", "amount" ], empty.fetch("metadata").fetch("fields").map { |column| column.fetch("key") }
    assert_empty empty.fetch("result")
    assert_not empty.fetch("truncated")

    report[:filters].first[:value] = shared_account.id
    post dashboard_monarch_run_path, params: { report: report }, as: :json
    assert_response :ok
    response_data = response.parsed_body
    row = response_data.fetch("result").sole
    assert_equal shared.id, response_data.fetch("metadata").fetch("rows").sole.fetch("id")
    assert_equal shared_account.name, row.fetch("account")
    assert_kind_of String, row.fetch("amount")
    assert_equal(-17, row.fetch("amount").to_d)
    assert_equal "USD", response_data.fetch("metadata").fetch("rows").sole.fetch("currency")
  end

  test "detail endpoint rejects aggregate shape and unselected sort fields" do
    report = { version: 1, source: "transactions", mode: "detail", columns: [ { field: "name" } ], filters: [], sort: [] }
    post dashboard_monarch_run_path, params: { report: report.merge(rows: []) }, as: :json
    assert_response :unprocessable_entity
    assert_equal "report", response.parsed_body.fetch("field")

    post dashboard_monarch_run_path, params: { report: report.merge(sort: [ { field: "amount", direction: "asc" } ]) }, as: :json
    assert_response :unprocessable_entity
    assert_equal "sort.0.field", response.parsed_body.fetch("field")
  end

  test "malformed structured request bodies fail with stable JSON fields" do
    [ nil, false, "", [], {} ].each do |report|
      post dashboard_monarch_run_path, params: { report: report }, as: :json
      assert_response :unprocessable_entity
      expected_field = report == {} ? "version" : "report"
      assert_equal expected_field, response.parsed_body.fetch("field")
      assert response.parsed_body.fetch("error").is_a?(String)
    end
    [ false, nil, "true", {} ].each do |catalog|
      post dashboard_monarch_run_path, params: { catalog: catalog }, as: :json
      assert_response :unprocessable_entity
      assert_equal "catalog", response.parsed_body.fetch("field")
    end
  end

  test "dashboard" do
    get root_path
    assert_response :ok
  end

  test "inactive user's existing session is revoked" do
    session_record = @user.sessions.order(:created_at).last
    @user.update_column(:active, false)

    get root_path

    assert_redirected_to new_session_path
    assert_not Session.exists?(session_record.id)
  end

  test "update_preferences persists dashboard section layout height" do
    patch "/dashboard/preferences", params: {
      preferences: { dashboard_section_layout: { net_worth_chart: { height: "compact" } } }
    }, as: :json

    assert_response :ok
    assert_equal "compact", @user.reload.dashboard_section_height("net_worth_chart")
  end

  test "update_preferences persists dashboard section width" do
    patch "/dashboard/preferences", params: {
      preferences: { dashboard_section_layout: { cashflow_sankey: { col_span: "single" } } }
    }, as: :json

    assert_response :ok
    assert_equal "single", @user.reload.dashboard_section_width("cashflow_sankey")
  end

  test "update_preferences ignores malformed dashboard_section_layout without erroring" do
    previous_height = @user.reload.dashboard_section_height("net_worth_chart")

    patch "/dashboard/preferences", params: {
      preferences: { dashboard_section_layout: "not-a-hash" }
    }, as: :json

    assert_response :ok
    assert_equal previous_height, @user.reload.dashboard_section_height("net_worth_chart")
  end

  test "intro page requires guest role" do
    get intro_path

    assert_redirected_to root_path
    assert_equal "Intro is only available to guest users.", flash[:alert]
  end

  test "intro page is accessible for guest users" do
    sign_in @intro_user

    get intro_path

    assert_response :ok
  end

  test "dashboard sankey nodes carry a stable filter_value, including opposite-direction subcategories" do
    parent_category = @family.categories.create!(name: "Shopping", color: "#FF5733")
    subcategory = @family.categories.create!(name: "Rebate Program", parent: parent_category, color: "#33FF57")

    # Parent nets as an expense; the subcategory nets as income (more refunded than spent),
    # which routes it into the "opposite_subs" branch as its own standalone node.
    create_transaction(account: @family.accounts.first, name: "Shopping trip", amount: 100, category: parent_category)
    create_transaction(account: @family.accounts.first, name: "Rebate refund", amount: -30, category: subcategory)

    get_home
    assert_response :ok

    sankey_data = response.parsed_body.fetch("cashflow_sankey")
    nodes = sankey_data.fetch("nodes")

    opposite_node = nodes.find { |node| node.fetch("id").start_with?("income_sub_") }
    assert_not_nil opposite_node, "expected an opposite-direction subcategory node"
    assert_equal subcategory.name, opposite_node["filter_value"]

    parent_node = nodes.find { |node| node.fetch("id") == "expense_#{parent_category.id}" }
    assert_equal parent_category.name, parent_node["filter_value"]
  end

  test "dashboard scopes money flow widget to selected month and accounts" do
    # Dedicated account (rather than @family.accounts.first) so fixture
    # transactions on other accounts can't skew the computed totals.
    account = @family.accounts.create!(name: "Money Flow Test Checking", currency: @family.currency, balance: 0, accountable: Depository.new)
    selected_month = 1.month.ago.beginning_of_month.to_date
    create_transaction(account: account, name: "Groceries", amount: 50, date: selected_month + 1.day)
    create_transaction(account: account, name: "Paycheck", amount: -200, date: selected_month + 2.days)

    get_home money_flow_month: selected_month.iso8601, money_flow_account_ids: [ account.id ]

    assert_response :ok
    bars = money_flow_bars

    assert_equal 6, bars.size
    highlighted = bars.find { |bar| bar["highlighted"] }
    assert_equal selected_month.iso8601, highlighted["date"]
    assert_equal 50.0, highlighted["expense"]
    assert_equal 200.0, highlighted["income"]
  end

  test "dashboard money flow widget ignores account ids not accessible to the current user" do
    other_family = Family.create!(name: "Other Family", currency: "USD")
    other_account = other_family.accounts.create!(name: "Other Family Checking", currency: "USD", balance: 0, accountable: Depository.new)
    create_transaction(account: other_account, name: "Not mine", amount: 999)
    private_account = @family.accounts.create!(name: "Private Checking", owner: users(:family_member), currency: "USD", balance: 0, accountable: Depository.new)
    create_transaction(account: private_account, name: "Private spending", amount: 777)

    get_home
    default_bars = money_flow_bars

    get_home money_flow_account_ids: [ other_account.id, private_account.id ]

    assert_response :ok
    filtered_bars = money_flow_bars

    # An id outside the current user's accessible accounts is dropped entirely
    # (money_flow_account_ids_param intersects against accessible ids), so the
    # widget falls back to its unfiltered "all accessible accounts" state
    # rather than scoping to a foreign account or erroring.
    assert_equal default_bars, filtered_bars
  end

  test "dashboard money flow widget excludes accounts ineligible for cashflow totals from its account filter" do
    excluded_account = @family.accounts.create!(
      name: "Excluded From Reports",
      currency: @family.currency,
      balance: 0,
      exclude_from_reports: true,
      accountable: Depository.new
    )

    get_home

    assert_response :ok
    assert_not_includes response.parsed_body.fetch("money_flow").fetch("accounts").map { |account| account.fetch("id") }, excluded_account.id.to_s
  end

  test "dashboard money flow widget ignores account ids excluded from cashflow totals" do
    excluded_account = @family.accounts.create!(
      name: "Excluded From Reports",
      currency: @family.currency,
      balance: 0,
      exclude_from_reports: true,
      accountable: Depository.new
    )
    create_transaction(account: excluded_account, name: "Not counted", amount: 999)

    get_home
    default_bars = money_flow_bars

    get_home money_flow_account_ids: [ excluded_account.id ]

    assert_response :ok
    filtered_bars = money_flow_bars

    # An account excluded from reports is visible/accessible but not eligible
    # for cashflow totals, so selecting only it must fall back to the
    # unfiltered state instead of silently computing to zero.
    assert_equal default_bars, filtered_bars
  end

  test "dashboard money flow income/expense links exclude pending transactions" do
    get_home

    assert_response :ok
    %w[income_href expense_href].each do |key|
      query = Rack::Utils.parse_nested_query(URI.parse(response.parsed_body.fetch("money_flow").fetch(key)).query)
      assert_equal [ "confirmed" ], query.fetch("q").fetch("status")
    end
  end

  test "dashboard money flow income/expense links stay scoped to eligible accounts by default" do
    excluded_account = @family.accounts.create!(
      name: "Excluded From Reports",
      currency: @family.currency,
      balance: 0,
      exclude_from_reports: true,
      accountable: Depository.new
    )

    get_home

    assert_response :ok
    income_href = response.parsed_body.fetch("money_flow").fetch("income_href")
    expense_href = response.parsed_body.fetch("money_flow").fetch("expense_href")

    # The default (unfiltered) state must still pin the drill-down links to
    # the eligible accounts backing the displayed totals, not the broader
    # accessible-accounts set transactions_path defaults to when account_ids
    # is absent.
    assert_includes income_href, "q%5Baccount_ids%5D%5B%5D="
    assert_not_includes income_href, excluded_account.id.to_s
    assert_includes expense_href, "q%5Baccount_ids%5D%5B%5D="
    assert_not_includes expense_href, excluded_account.id.to_s
  end

  test "dashboard money flow income/expense links keep account_ids when a subset of accounts is explicitly selected" do
    account = @family.accounts.first

    get_home money_flow_account_ids: [ account.id ]

    assert_response :ok
    income_href = response.parsed_body.fetch("money_flow").fetch("income_href")
    expense_href = response.parsed_body.fetch("money_flow").fetch("expense_href")

    # A deliberate, narrower selection never matches the full
    # accessible-accounts set, so the links must keep scoping to it instead
    # of silently falling back to "all accounts".
    assert_includes income_href, "q%5Baccount_ids%5D%5B%5D=#{account.id}"
    assert_includes expense_href, "q%5Baccount_ids%5D%5B%5D=#{account.id}"

    account_filter = "q%5Baccount_ids%5D%5B%5D="
    assert_equal 1, income_href.scan(account_filter).length
    assert_equal 1, expense_href.scan(account_filter).length
  end

  test "changelog" do
    VCR.use_cassette("git_repository_provider/fetch_latest_release_notes") do
      get changelog_path
      assert_response :ok
      assert_select "[data-breadcrumbs]", text: /What's new/
    end
  end

  test "changelog with nil release notes" do
    # Mock the GitHub provider to return nil (simulating API failure or no releases)
    github_provider = mock
    github_provider.expects(:fetch_latest_release_notes).returns(nil)
    Provider::Registry.stubs(:get_provider).with(:github).returns(github_provider)

    get changelog_path
    assert_response :ok
    assert_select "h2", text: "Release notes unavailable"
    assert_select "a[href='https://github.com/we-promise/sure/releases']"
  end

  test "changelog with incomplete release notes" do
    # Mock the GitHub provider to return incomplete data (missing some fields)
    github_provider = mock
    incomplete_data = {
      avatar: nil,
      username: "maybe-finance",
      name: "Test Release",
      published_at: nil,
      body: nil
    }
    github_provider.expects(:fetch_latest_release_notes).returns(incomplete_data)
    Provider::Registry.stubs(:get_provider).with(:github).returns(github_provider)

    get changelog_path
    assert_response :ok
    assert_select "h2", text: "Test Release"
    # Should not crash even with nil values
  end

  test "feedback" do
    get feedback_path
    assert_response :ok
    assert_select "[data-breadcrumbs]", text: /Feedback/
  end

  test "dashboard spending trend widget accumulates the selected month against the previous one" do
    account = @family.accounts.create!(name: "Spending Trend Test Checking", currency: @family.currency, balance: 0, accountable: Depository.new)
    # A fully past month: fixture transactions are dated relative to today and
    # would otherwise leak into the expected totals.
    selected_month = 2.months.ago.beginning_of_month.to_date
    previous_month = 3.months.ago.beginning_of_month.to_date

    create_transaction(account: account, name: "Selected month", amount: 50, date: selected_month)
    create_transaction(account: account, name: "Selected month again", amount: 25, date: selected_month + 1.day)
    create_transaction(account: account, name: "Previous month", amount: 200, date: previous_month)

    get_home spending_month: selected_month.iso8601

    assert_response :ok
    chart = spending_trend_chart_data

    current = chart.fetch("current")
    previous = chart.fetch("previous")

    # Both months are past, so the selected month's curve runs its full
    # length; the previous curve runs its own length unless folded to the
    # shorter axis.
    assert_equal selected_month.end_of_month.day, current.size

    # Cumulative: each month's final point carries the month's total. When the
    # previous month is longer its curve is folded, but the final visible
    # point still carries the full-month total.
    assert_equal 75.0, current.last.fetch("value")
    assert_equal 200.0, previous.last.fetch("value")
    assert_equal selected_month.end_of_month.day, chart.fetch("days")
    assert_equal [ previous_month.end_of_month.day, selected_month.end_of_month.day ].min, previous.size
    # The chart needs the selected month's own length to label only its days
    # on narrow (mobile) widths.
    assert_equal selected_month.end_of_month.day, chart.fetch("current_days")
  end

  test "dashboard spending trend widget caps an in-progress month at today" do
    account = @family.accounts.create!(name: "Spending Trend Current Checking", currency: @family.currency, balance: 0, accountable: Depository.new)
    create_transaction(account: account, name: "Today", amount: 10, date: Date.current)

    get_home spending_month: Date.current.beginning_of_month.iso8601

    assert_response :ok
    chart = spending_trend_chart_data

    assert_equal Date.current.day, chart.fetch("current").size
    assert chart.fetch("days") >= Date.current.day
  end

  test "dashboard spending trend axis labels stay inside the selected month when the previous month is longer" do
    account = @family.accounts.create!(name: "Spending Trend Axis Checking", currency: @family.currency, balance: 0, accountable: Depository.new)

    # Find a recent past month whose previous month is longer (e.g. February
    # after January), so the previous curve has days beyond the axis.
    selected_month = (1..11).map { |i| i.months.ago.beginning_of_month.to_date }
      .find { |m| (m - 1.month).end_of_month.day > m.end_of_month.day }
    previous_month = (selected_month - 1.month).beginning_of_month

    # Spending in both months so the widget renders the chart, not the empty state.
    create_transaction(account: account, name: "Spend", amount: 10, date: selected_month)
    create_transaction(account: account, name: "Prior spend", amount: 10, date: previous_month)

    get_home spending_month: selected_month.iso8601

    assert_response :ok
    chart = spending_trend_chart_data
    labels = chart.fetch("axis_labels")

    # The selected month always owns the axis, so no tick can roll into the
    # previous month's dates (e.g. a September view ends at "Sep 30", not
    # "Aug 31").
    assert_equal selected_month.end_of_month.day, chart.fetch("days")
    assert_equal chart.fetch("days"), labels.size
    assert_equal I18n.l(selected_month, format: :short), labels.first
    assert_equal I18n.l(selected_month.end_of_month, format: :short), labels.last
    expected_labels = (1..selected_month.end_of_month.day).map { |d| I18n.l(selected_month + (d - 1), format: :short) }
    assert_equal expected_labels, labels
  end

  test "dashboard spending trend folds a longer previous month into the final axis point (February)" do
    account = @family.accounts.create!(name: "Spending Trend Fold Feb Checking", currency: @family.currency, balance: 0, accountable: Depository.new)

    selected_month = Date.new(2026, 2, 1)  # 28 days, previous January has 31
    create_transaction(account: account, name: "Jan mid", amount: 100, date: Date.new(2026, 1, 15))
    create_transaction(account: account, name: "Jan extra day", amount: 40, date: Date.new(2026, 1, 31))
    create_transaction(account: account, name: "Feb spend", amount: 25, date: Date.new(2026, 2, 10))

    get_home spending_month: selected_month.iso8601

    assert_response :ok
    chart = spending_trend_chart_data
    previous = chart.fetch("previous")

    # The January curve is clipped to February's 28-day axis, with day 31's
    # spend folded into the final visible point so it still lands on the
    # full-month total.
    assert_equal 28, chart.fetch("days")
    assert_equal 28, previous.size
    assert_equal 140.0, previous.last.fetch("value")
    assert_equal "2026-01-31", previous.last.fetch("date")
    assert_equal I18n.l(Date.new(2026, 1, 31), format: :short), previous.last.fetch("date_formatted")
    assert_equal 25.0, chart.fetch("current").last.fetch("value")

    labels = chart.fetch("axis_labels")
    assert_equal 28, labels.size
    assert_equal I18n.l(Date.new(2026, 2, 28), format: :short), labels.last
    assert_equal (1..28).map { |d| I18n.l(Date.new(2026, 2, d), format: :short) }, labels
  end

  test "dashboard spending trend folds a longer previous month into the final axis point (30-day month)" do
    account = @family.accounts.create!(name: "Spending Trend Fold Jun Checking", currency: @family.currency, balance: 0, accountable: Depository.new)

    selected_month = Date.new(2026, 6, 1)  # 30 days, previous May has 31
    create_transaction(account: account, name: "May mid", amount: 90, date: Date.new(2026, 5, 10))
    create_transaction(account: account, name: "May extra day", amount: 60, date: Date.new(2026, 5, 31))
    create_transaction(account: account, name: "Jun spend", amount: 15, date: Date.new(2026, 6, 5))

    get_home spending_month: selected_month.iso8601

    assert_response :ok
    chart = spending_trend_chart_data
    previous = chart.fetch("previous")

    assert_equal 30, chart.fetch("days")
    assert_equal 30, previous.size
    assert_equal 150.0, previous.last.fetch("value")

    labels = chart.fetch("axis_labels")
    assert_equal I18n.l(Date.new(2026, 6, 30), format: :short), labels.last
    assert_equal (1..30).map { |d| I18n.l(Date.new(2026, 6, d), format: :short) }, labels
  end

  test "dashboard spending trend names the compared month in the comparison header" do
    account = @family.accounts.create!(name: "Spending Trend Label Checking", currency: @family.currency, balance: 0, accountable: Depository.new)
    selected_month = 2.months.ago.beginning_of_month.to_date
    previous_month = 3.months.ago.beginning_of_month.to_date
    create_transaction(account: account, name: "Spend", amount: 10, date: selected_month)

    get_home spending_month: selected_month.iso8601

    assert_response :ok
    expected_label = I18n.l(previous_month, format: :month_year).capitalize
    assert_equal expected_label, spending_trend_chart_data.fetch("previous_label")
  end

  test "dashboard spending trend renders a compact date range for mobile" do
    account = @family.accounts.create!(name: "Spending Trend Range Checking", currency: @family.currency, balance: 0, accountable: Depository.new)
    selected_month = 2.months.ago.beginning_of_month.to_date
    create_transaction(account: account, name: "Spend", amount: 10, date: selected_month)

    get_home spending_month: selected_month.iso8601

    assert_response :ok
    chart = spending_trend_chart_data
    assert_equal I18n.t("pages.dashboard.spending_trend.date_range",
      start_date: I18n.l(selected_month, format: :long),
      end_date: I18n.l(selected_month.end_of_month, format: :long)),
      chart.fetch("period").fetch("date_range_label")
    assert_equal "#{I18n.l(selected_month, format: :short)} - #{selected_month.end_of_month.day}, #{selected_month.year}",
      chart.fetch("date_range_short")
  end

  test "dashboard spending trend widget clamps future month params" do
    account = @family.accounts.create!(name: "Spending Trend Clamp Checking", currency: @family.currency, balance: 0, accountable: Depository.new)
    create_transaction(account: account, name: "Today", amount: 10, date: Date.current)

    get_home spending_month: 2.months.from_now.to_date.iso8601
    assert_response :ok

    chart = spending_trend_chart_data
    assert_equal Date.current.beginning_of_month.iso8601, chart.fetch("current").first.fetch("date")
  end

  test "dashboard spending trend header compares the same elapsed days in both months" do
    # Mid-month so the previous month always has spending both on or before and
    # after the current day-of-month, whatever day the suite runs on.
    travel_to Date.current.beginning_of_month + 14.days do
      account = @family.accounts.create!(name: "Spending Trend Aligned Checking", currency: @family.currency, balance: 0, accountable: Depository.new)
      previous_month = (Date.current.beginning_of_month - 1.month).beginning_of_month

      create_transaction(account: account, name: "Prev early", amount: 111, date: previous_month)
      create_transaction(account: account, name: "Prev late", amount: 999, date: previous_month.end_of_month)
      create_transaction(account: account, name: "Current", amount: 7, date: Date.current)

      get_home spending_month: Date.current.beginning_of_month.iso8601
      assert_response :ok

      chart = spending_trend_chart_data
      previous_series = chart.fetch("previous")
      aligned = previous_series.fetch(Date.current.day - 1).fetch("value")
      full_month = previous_series.last.fetch("value")
      current_value = chart.fetch("current").last.fetch("value")

      # The late transaction guarantees the two figures differ, so this pins
      # which one the header reads.
      assert_operator full_month, :>, aligned

      _current_total, previous_total = spending_trend_header_totals
      assert_equal money_text(aligned), previous_total
      refute_equal money_text(full_month), previous_total

      # The delta must be built from the same day-aligned figure.
      assert_equal money_text(current_value - aligned), spending_trend_header_delta
    end
  end

  test "dashboard spending trend header labels the days it compares while the month is in progress" do
    travel_to Date.current.beginning_of_month + 14.days do
      account = @family.accounts.create!(name: "Spending Trend Label Days Checking", currency: @family.currency, balance: 0, accountable: Depository.new)
      create_transaction(account: account, name: "Spend", amount: 10, date: Date.current)

      get_home spending_month: Date.current.beginning_of_month.iso8601
      assert_response :ok

      assert_equal Date.current.day, spending_trend_chart_data.fetch("previous_comparison_day")
    end
  end

  test "dashboard spending trend header treats current month final day as in progress" do
    selected_month = (0..24).map { |i| i.months.ago.beginning_of_month.to_date }
      .find { |m| (m - 1.month).end_of_month.day > m.end_of_month.day }
    previous_month = (selected_month - 1.month).beginning_of_month

    travel_to selected_month.end_of_month do
      account = @family.accounts.create!(name: "Spending Trend Final Day Checking", currency: @family.currency, balance: 0, accountable: Depository.new)

      create_transaction(account: account, name: "Prev early", amount: 111, date: previous_month)
      create_transaction(account: account, name: "Prev extra day", amount: 999, date: previous_month.end_of_month)
      create_transaction(account: account, name: "Current", amount: 7, date: Date.current)

      get_home spending_month: selected_month.iso8601
      assert_response :ok

      previous_series = spending_trend_chart_data.fetch("previous")
      _current_total, previous_total = spending_trend_header_totals

      assert_equal previous_month.end_of_month.iso8601, previous_series.last.fetch("date")
      assert_equal money_text(111), previous_total
      refute_equal money_text(previous_series.last.fetch("value")), previous_total
      assert_equal Date.current.day, spending_trend_chart_data.fetch("previous_comparison_day")
    end
  end

  test "dashboard spending trend header compares complete months once the month is over" do
    account = @family.accounts.create!(name: "Spending Trend Past Checking", currency: @family.currency, balance: 0, accountable: Depository.new)
    selected_month = 2.months.ago.beginning_of_month.to_date
    previous_month = 3.months.ago.beginning_of_month.to_date

    create_transaction(account: account, name: "Selected", amount: 50, date: selected_month)
    create_transaction(account: account, name: "Previous early", amount: 111, date: previous_month)
    create_transaction(account: account, name: "Previous late", amount: 999, date: previous_month.end_of_month)

    get_home spending_month: selected_month.iso8601
    assert_response :ok

    previous_series = spending_trend_chart_data.fetch("previous")
    _current_total, previous_total = spending_trend_header_totals

    # A month that has fully elapsed is still compared whole-to-whole.
    assert_equal money_text(previous_series.last.fetch("value")), previous_total
    assert_nil spending_trend_chart_data.fetch("previous_comparison_day")
  end

  test "dashboard spending trend header compares complete months when the selected month is the shorter one" do
    account = @family.accounts.create!(name: "Spending Trend Short Month Checking", currency: @family.currency, balance: 0, accountable: Depository.new)
    # A past month shorter than the one before it (e.g. February after January),
    # where clamping to the shorter series would truncate the previous month.
    selected_month = (1..11).map { |i| i.months.ago.beginning_of_month.to_date }
      .find { |m| (m - 1.month).end_of_month.day > m.end_of_month.day }
    previous_month = (selected_month - 1.month).beginning_of_month

    create_transaction(account: account, name: "Selected", amount: 50, date: selected_month)
    create_transaction(account: account, name: "Previous early", amount: 111, date: previous_month)
    create_transaction(account: account, name: "Previous last day", amount: 999, date: previous_month.end_of_month)

    get_home spending_month: selected_month.iso8601
    assert_response :ok

    previous_series = spending_trend_chart_data.fetch("previous")
    _current_total, previous_total = spending_trend_header_totals

    # Both months are over, so both are compared whole - the selected month
    # being shorter must not truncate the previous month's total.
    assert_equal previous_month.end_of_month.iso8601, previous_series.last.fetch("date")
    assert_equal 1110.0, previous_series.last.fetch("value")
    assert_equal money_text(previous_series.last.fetch("value")), previous_total
    assert_nil spending_trend_chart_data.fetch("previous_comparison_day")
  end

  test "dashboard spending trend header clamps to a previous month shorter than today" do
    # A month longer than the one before it (e.g. March after February), frozen
    # to a day that the previous month never reaches.
    selected_month = (1..24).map { |i| i.months.ago.beginning_of_month.to_date }
      .find { |m| (m - 1.month).end_of_month.day < m.end_of_month.day - 1 }
    previous_month = (selected_month - 1.month).beginning_of_month

    # The day after the previous month's last day, which the selected month
    # always reaches because it is the longer of the two.
    travel_to selected_month + previous_month.end_of_month.day.days do
      account = @family.accounts.create!(name: "Spending Trend Clamp Checking 2", currency: @family.currency, balance: 0, accountable: Depository.new)
      create_transaction(account: account, name: "Prev", amount: 40, date: previous_month.end_of_month)
      create_transaction(account: account, name: "Current", amount: 5, date: selected_month)

      assert_operator Date.current.day, :>, previous_month.end_of_month.day
      assert_operator Date.current, :<, selected_month.end_of_month

      get_home spending_month: selected_month.iso8601
      assert_response :ok

      previous_series = spending_trend_chart_data.fetch("previous")
      _current_total, previous_total = spending_trend_header_totals

      # There is no day 30 in February: the previous month has fully elapsed, so
      # its complete total is the comparison. Without the clamp this read past
      # the end of the series and showed zero.
      assert_equal money_text(previous_series.last.fetch("value")), previous_total
      refute_equal money_text(0), previous_total
    end
  end

  private
    def get_home(**params)
      @home_api_key ||= ApiKey.create!(
        user: @user, name: "Dashboard Read Key", scopes: [ "read" ],
        display_key: "test_dashboard_ro_#{SecureRandom.hex(8)}", source: "mobile"
      )
      get "/api/v1/home", params: params, headers: { "X-Api-Key" => @home_api_key.display_key }
    end

    def money_flow_bars
      response.parsed_body.fetch("money_flow").fetch("bars")
    end

    def spending_trend_chart_data
      response.parsed_body.fetch("spending_trend")
    end

    def spending_trend_header_totals
      spending_trend_chart_data.values_at("current_total", "previous_total").map { |money| money.fetch("formatted") }
    end

    def spending_trend_header_delta
      spending_trend_chart_data.fetch("delta").fetch("formatted")
    end

    def money_text(amount)
      ApplicationController.helpers.format_money(Money.new(amount, @family.currency))
    end
end
