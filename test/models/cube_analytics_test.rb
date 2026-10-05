require "test_helper"

class CubeAnalyticsTest < ActiveSupport::TestCase
  include EntriesTestHelper

  setup do
    @user = users(:family_member)
    @analytics = CubeAnalytics.new(@user)
    @query = {
      "measures" => [ "cash_flow.income", "cash_flow.expenses" ],
      "timeDimensions" => [ { "dimension" => "cash_flow.date", "dateRange" => [ "2025-01-01", "2025-01-31" ] } ],
      "order" => {},
      "limit" => 500
    }
  end

  test "untrusted query members and security context never reach the engine" do
    [
      { "filters" => [ { "member" => "cash_flow.family_id", "operator" => "equals", "values" => [ families(:empty).id ] } ] },
      { "securityContext" => { "familyId" => families(:empty).id } },
      { "sql" => "SELECT * FROM users" },
      { "url" => "https://attacker.example/load" },
      { "measures" => [ "cash_flow.family_id" ] },
      { "dimensions" => [ "cash_flow.account_id" ] },
      { "order" => { "cash_flow.account_id" => "asc" } },
      { "order" => { "cash_flow.income" => "DROP TABLE" } },
      { "limit" => 501 },
      { "limit" => 0 },
      { "limit" => "500" }
    ].each do |change|
      assert_raises(CubeAnalytics::InvalidQuery) { @analytics.call(@query.merge(change)) }
    end
    assert_not_requested :post, CubeAnalytics.api_url + "/load"
  end

  test "malformed and reversed date ranges and unsupported granularity are rejected" do
    [
      { "dateRange" => [ "2025-02-30", "2025-03-01" ] },
      { "dateRange" => [ "2025-02-01", "2025-01-01" ] },
      { "dateRange" => [ "2025-01-01' OR 1=1", "2025-01-31" ] },
      { "dateRange" => "last month" },
      { "dateRange" => [ "2025-01-01" ] },
      { "granularity" => "hour" },
      { "dimension" => "cash_flow.account_id" },
      { "filters" => [] }
    ].each do |change|
      query = @query.merge("timeDimensions" => [ @query["timeDimensions"].first.merge(change) ])
      assert_raises(CubeAnalytics::InvalidQuery) { @analytics.call(query) }
    end
  end

  test "invalid queries take precedence over unavailable configuration" do
    with_env_overrides("CUBE_API_URL" => "file:///etc/passwd") do
      assert_raises(CubeAnalytics::InvalidQuery) { @analytics.call(@query.merge("filters" => [])) }
      assert_raises(CubeAnalytics::Unavailable) { @analytics.call(@query) }
    end
  end

  test "connection failures and engine error details produce safe unavailable errors" do
    with_env_overrides("CUBE_API_URL" => "http://cube.example/cubejs-api/v1") do
      stub_request(:post, CubeAnalytics.api_url + "/load").to_raise(Faraday::ConnectionFailed.new("private database host"))
      error = assert_raises(CubeAnalytics::Unavailable) { @analytics.call(@query) }
      assert_equal :unavailable, error.code
      refute_includes error.message, "private database host"

      stub_request(:post, CubeAnalytics.api_url + "/load").to_return(status: 500, body: "SELECT secret FROM users")
      error = assert_raises(CubeAnalytics::Unavailable) { @analytics.call(@query) }
      refute_includes error.message, "SELECT"
    end
  end

  test "a continue wait cycle is bounded and never becomes a successful empty result" do
    with_env_overrides("CUBE_API_URL" => "http://cube.example/cubejs-api/v1") do
      stub_request(:post, CubeAnalytics.api_url + "/load").to_return(status: 200, body: { error: "Continue wait" }.to_json)
      @analytics.stubs(:monotonic_time).returns(0, 0, CubeAnalytics::LOAD_TIMEOUT, CubeAnalytics::LOAD_TIMEOUT)
      error = assert_raises(CubeAnalytics::Unavailable) { @analytics.call(@query) }
      assert_equal :unavailable, error.code
      assert_requested :post, CubeAnalytics.api_url + "/load", times: 1
    end
  end

  test "server signed scopes track report inclusion and revoked shares on every call" do
    claims = []
    with_env_overrides("CUBE_API_URL" => "http://cube.example/cubejs-api/v1") do
      stub_request(:post, CubeAnalytics.api_url + "/load").to_return do |request|
        claims << JWT.decode(request.headers.fetch("Authorization").delete_prefix("Bearer "), CubeAnalytics.api_secret, true,
                             algorithm: "HS256", iss: "sure", verify_iss: true, aud: "sure-cube", verify_aud: true).first
        { status: 200, body: { data: [], annotation: {} }.to_json }
      end

      @analytics.call(@query)
      assert_equal [ accounts(:credit_card).id, accounts(:depository).id ].sort, claims.last.fetch("accountIds")
      assert_equal @user.id, claims.last.fetch("userId")
      assert_equal @user.family_id, claims.last.fetch("familyId")
      assert_operator claims.last.fetch("exp") - claims.last.fetch("iat"), :<=, 60

      accounts(:depository).update!(exclude_from_reports: true)
      account_shares(:credit_card_shared_with_member).destroy!
      @analytics.call(@query)
      assert_equal [], claims.last.fetch("accountIds"), "empty eligibility must remain an explicit deny scope"
      refute_equal claims.first.fetch("scopeVersion"), claims.last.fetch("scopeVersion")
    end
  end

  test "row limit distinguishes an exactly full result from truncation" do
    with_env_overrides("CUBE_API_URL" => "http://cube.example/cubejs-api/v1") do
      query = @query.merge("dimensions" => [ "cash_flow.category" ], "limit" => 1)
      rows = [ { "cash_flow.category" => "Food", "cash_flow.expenses" => "9007199254740993.25" } ]
      request = stub_request(:post, CubeAnalytics.api_url + "/load")
      request.to_return(status: 200, body: { data: rows, annotation: {} }.to_json)
      result = @analytics.call(query)
      assert_equal "9007199254740993.25", result[:data].first["cash_flow.expenses"]
      assert_equal false, result[:truncated]

      request.to_return(status: 200, body: { data: rows + [ { "cash_flow.category" => "Travel", "cash_flow.expenses" => "10.10" } ], annotation: {} }.to_json)
      result = @analytics.call(query)
      assert_equal rows, result[:data]
      assert_equal true, result[:truncated]
    end
  end

  test "canonical dataset preserves FX signs contributions and transaction exclusions" do
    family = families(:empty)
    account = family.accounts.create!(name: "EUR checking", currency: "EUR", balance: 1000, accountable: Depository.new)
    date = Date.new(2025, 2, 10)
    ExchangeRate.create!(from_currency: "EUR", to_currency: family.currency, date: date, rate: 2)
    income = create_transaction(account: account, amount: -100, currency: "EUR", date: date)
    expense = create_transaction(account: account, amount: 20, currency: "EUR", date: date)
    loan = create_transaction(account: account, amount: -30, currency: "EUR", date: date, kind: "loan_payment")
    missing_fx = create_transaction(account: account, amount: 5, currency: "EUR", date: date + 1)
    create_transaction(account: account, amount: 40, currency: "EUR", date: date, kind: "funds_movement")
    create_transaction(account: account, amount: 40, currency: "EUR", date: date, excluded: true)
    pending = create_transaction(account: account, amount: 40, currency: "EUR", date: date)
    pending.entryable.update!(extra: { "simplefin" => { "pending" => true } })
    sweep = create_transaction(account: account, amount: 40, currency: "EUR", date: date)
    sweep.entryable.update!(investment_activity_label: "Sweep Out")
    create_trade(securities(:aapl), account: account, qty: 1, price: 50, date: date, currency: "EUR")

    sql = ActiveRecord::Base.sanitize_sql_array([ "SELECT * FROM (#{CubeAnalytics.dataset_sql}) source WHERE source.account_id = ?", account.id ])
    rows = ActiveRecord::Base.connection.select_all(sql).to_a.index_by { |row| row.fetch("id") }
    assert_equal [ income.id, expense.id, loan.id, missing_fx.id ].sort, rows.keys.sort
    assert_equal "income", rows[income.id]["classification"]
    assert_equal BigDecimal("-200"), rows[income.id]["amount"]
    assert_equal BigDecimal("40"), rows[expense.id]["amount"]
    assert_equal "expense", rows[loan.id]["classification"]
    assert_equal BigDecimal("60"), rows[loan.id]["amount"]
    assert_equal BigDecimal("5"), rows[missing_fx.id]["amount"]
    assert_equal family.currency, rows[expense.id]["reporting_currency"]
  end
end
