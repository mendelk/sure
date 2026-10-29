# frozen_string_literal: true

require "test_helper"

class Api::V1::ReportsControllerTest < ActionDispatch::IntegrationTest
  include EntriesTestHelper

  setup do
    @user = users(:family_admin)
    @family = @user.family
    @key = ApiKey.create!(user: @user, name: "Report read key", scopes: [ "read" ],
      display_key: "test_reports_#{SecureRandom.hex(8)}", source: "web")
    @account = @family.accounts.create!(name: "Report account", owner: @user, balance: 0,
      currency: "USD", accountable: Depository.new)
  end

  test "all report operations require authentication" do
    get "/api/v1/reports/catalog"
    assert_response :unauthorized
    post "/api/v1/reports/run", params: { source: "from transactions" }, as: :json
    assert_response :unauthorized
    post "/api/v1/reports/compile", params: { source: "from transactions" }, as: :json
    assert_response :unauthorized
  end

  test "read keys compile authorized sources but cannot select unknown tables" do
    post "/api/v1/reports/compile", params: { source: "from transactions\ntake 5" }, headers: api_headers(@key), as: :json
    assert_response :success
    assert response.parsed_body.fetch("sql").present?

    post "/api/v1/reports/compile", params: { source: "from users" }, headers: api_headers(@key), as: :json
    assert_response :unprocessable_entity
    assert_match(/unknown sureql source/, response.parsed_body.fetch("error"))
  end

  test "catalog excludes inaccessible accounts including accounts in another family" do
    private_account = @family.accounts.create!(name: "Private report account", owner: users(:family_member),
      currency: "USD", balance: 0, accountable: Depository.new)
    create_transaction(account: private_account, amount: 123)
    create_transaction(account: @account, amount: 456)

    get "/api/v1/reports/catalog", headers: api_headers(@key)
    assert_response :success
    catalog = response.parsed_body
    assert_equal "transactions", catalog.fetch("source")
    ids = catalog.fetch("fields").find { |field| field.fetch("key") == "account" }.fetch("options").pluck("value")
    assert_includes ids, @account.id
    assert_not_includes ids, private_account.id
    assert (ids - @user.accessible_accounts.pluck(:id)).empty?

    post "/api/v1/reports/run", params: { catalog: true }, headers: api_headers(@key), as: :json
    assert_response :success
    assert_equal catalog, response.parsed_body
  end

  test "SureQL pages preserve explicit take and account authorization after fifty rows" do
    entries = 61.times.map do |index|
      create_transaction(account: @account, name: format("API page %03d", index), amount: 809.25)
    end
    private_account = @family.accounts.create!(name: "Private API report", owner: users(:family_member),
      balance: 0, currency: "USD", accountable: Depository.new)
    create_transaction(account: private_account, name: "API page 000", amount: 809.25)
    source = "from transactions\nfilter amount == 809.25\nsort {name}\nselect {id, name, amount}\ntake 60"

    post "/api/v1/reports/run", params: { source: source, pagination: { limit: 10, offset: 50 } }, headers: api_headers(@key), as: :json
    assert_response :success
    result = response.parsed_body
    assert_equal entries.slice(50, 10).map(&:id), result.fetch("rows").pluck("id")
    assert_equal({ "limit" => 10, "offset" => 50, "hasNext" => false }, result.fetch("pagination"))
    assert_not result.fetch("truncated")
    assert_equal [ "id", "name", "amount" ], result.fetch("fields").pluck("name")

    post "/api/v1/reports/run", params: { source: source }, headers: api_headers(@key), as: :json
    assert_response :success
    assert_equal entries.first(50).map(&:id), response.parsed_body.fetch("rows").pluck("id")
    assert response.parsed_body.fetch("truncated")
    assert_nil response.parsed_body.fetch("pagination")
  end

  test "SureQL rejects unsafe pagination and unregistered sources as JSON" do
    [ { limit: 101, offset: 0 }, { limit: 10, offset: -1 }, "invalid" ].each do |pagination|
      post "/api/v1/reports/run", params: { source: "from transactions", pagination: pagination }, headers: api_headers(@key), as: :json
      assert_response :unprocessable_entity
      assert response.parsed_body.fetch("error").present?
      assert_not response.parsed_body.key?("rows")
    end
    post "/api/v1/reports/run", params: { source: "from users" }, headers: api_headers(@key), as: :json
    assert_response :unprocessable_entity
  end

  test "SureQL cannot execute mutating compiled SQL" do
    Sureql::Compiler.any_instance.stubs(:call).returns("DELETE FROM entries")
    assert_no_difference "Entry.count" do
      post "/api/v1/reports/run", params: { source: "from transactions" }, headers: api_headers(@key), as: :json
    end
    assert_response :unprocessable_entity
    assert_match(/read-only/, response.parsed_body.fetch("error"))
  end

  test "structured aggregate preserves signed amounts and monthly chart metadata" do
    create_transaction(account: @account, amount: 20, date: Date.new(2025, 1, 2))
    create_transaction(account: @account, amount: -7, date: Date.new(2025, 1, 3))
    report = {
      version: 1, source: "transactions", mode: "aggregate",
      rows: [ { id: "category", field: "category" } ],
      columns: [ { id: "month", field: "date", dateBucket: "month" } ],
      values: [ { id: "total", field: "amount", aggregation: "sum" } ],
      filters: [ { field: "account", operator: "equals", value: @account.id } ], sort: []
    }
    post "/api/v1/reports/run", params: { report: report }, headers: api_headers(@key), as: :json
    assert_response :success
    result = response.parsed_body
    assert_equal "aggregate", result.fetch("mode")
    assert_equal 13, result.fetch("result").sole.fetch("total").to_d
    assert_equal [ "2025-01" ], result.fetch("metadata").fetch("columns").sole.fetch("labels")
    assert_equal "USD", result.fetch("metadata").fetch("fields").find { |field| field["role"] == "value" }.fetch("currency")
  end

  test "detail pages preserve exact signed decimals and duplicate row identities" do
    entries = 3.times.map do
      create_transaction(account: @account, name: "Duplicate", amount: "-900719925474099.1234", date: Date.new(2025, 1, 2))
    end.sort_by(&:id)
    report = detail_report
    post "/api/v1/reports/run", params: { report: report, pagination: { limit: 2, offset: 0 } }, headers: api_headers(@key), as: :json
    assert_response :success
    first = response.parsed_body
    assert_equal entries.first(2).map(&:id), first.fetch("metadata").fetch("rows").pluck("id")
    assert first.fetch("result").all? { |row| row.fetch("amount") == "-900719925474099.1234" }
    assert first.fetch("pagination").fetch("hasNext")

    post "/api/v1/reports/run", params: { report: report, pagination: { limit: 2, offset: 2 } }, headers: api_headers(@key), as: :json
    assert_response :success
    assert_equal [ entries.last.id ], response.parsed_body.fetch("metadata").fetch("rows").pluck("id")
    assert_not response.parsed_body.fetch("pagination").fetch("hasNext")
  end

  test "structured reports cannot widen explicit account access and return field errors" do
    private_account = @family.accounts.create!(name: "Private detail account", owner: users(:family_member),
      balance: 0, currency: "USD", accountable: Depository.new)
    create_transaction(account: private_account, amount: 123)
    report = detail_report
    report[:filters].first[:value] = private_account.id
    post "/api/v1/reports/run", params: { report: report }, headers: api_headers(@key), as: :json
    assert_response :success
    assert_empty response.parsed_body.fetch("result")

    post "/api/v1/reports/run", params: { report: report.merge(source: "users") }, headers: api_headers(@key), as: :json
    assert_response :unprocessable_entity
    assert_equal "source", response.parsed_body.fetch("field")
  end

  test "pivot aggregates authorized rows before the preview limit and validates fields" do
    51.times { create_transaction(account: @account, amount: 2) }
    pivot = { version: 1, category: { field: "account_id", limit: 24 },
      measures: [ { field: "amount", aggregation: "sum" } ], sort: "category_asc", chartType: "grouped_bar" }
    source = "from transactions\nfilter account_id == \"#{@account.id}\"\nselect {account_id, amount}"
    post "/api/v1/reports/run", params: { source: source, pivot: pivot }, headers: api_headers(@key), as: :json
    assert_response :success
    result = response.parsed_body
    assert_equal 102, result.fetch("rows").sole.fetch("measure_0").to_d
    assert_includes result.fetch("columns"), "measure_0"
    assert result.fetch("fields").present?

    pivot[:category][:field] = "unknown_column"
    post "/api/v1/reports/run", params: { source: source, pivot: pivot }, headers: api_headers(@key), as: :json
    assert_response :unprocessable_entity
    assert_equal "category.field", response.parsed_body.fetch("field")
  end

  test "missing source and malformed catalog are JSON errors" do
    post "/api/v1/reports/run", params: {}, headers: api_headers(@key), as: :json
    assert_response :bad_request
    post "/api/v1/reports/run", params: { catalog: "true" }, headers: api_headers(@key), as: :json
    assert_response :unprocessable_entity
    assert_equal "catalog", response.parsed_body.fetch("field")
  end

  test "malformed source and pivot payloads return actionable JSON errors" do
    post "/api/v1/reports/run", params: { source: 123 }, headers: api_headers(@key), as: :json
    assert_response :unprocessable_entity
    assert_match(/Source/, response.parsed_body.fetch("error"))
    post "/api/v1/reports/run", params: { source: "from transactions", pivot: "invalid" }, headers: api_headers(@key), as: :json
    assert_response :unprocessable_entity
    assert_equal "pivot", response.parsed_body.fetch("field")
  end

  private
    def detail_report
      { version: 1, source: "transactions", mode: "detail",
        columns: [ { field: "amount" }, { field: "name" } ],
        filters: [ { field: "account", operator: "equals", value: @account.id } ], sort: [] }
    end
end
