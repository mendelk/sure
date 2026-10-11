require "test_helper"

class Sureql::ReportDefinitionTest < ActiveSupport::TestCase
  include EntriesTestHelper

  setup do
    @user = users(:family_admin)
    @account = @user.family.accounts.create!(name: "Report checking", owner: @user, currency: "USD", balance: 0, accountable: Depository.new)
    @reports = Sureql::ReportDefinition.new(@user)
    @january = Date.new(2025, 1, 15)
    @february = Date.new(2025, 2, 15)
  end

  test "monthly sums retain signed amounts uncategorized and sparse missing versus zero" do
    add(10, category: categories(:one))
    add(-10, category: categories(:one))
    add(7, category: categories(:income), date: @february)
    add(3)
    add(1000, excluded: true)
    create_valuation(account: @account, date: @january, amount: 10000)

    result = @reports.call(definition)
    assert_equal "aggregate", result.fetch("mode")
    rows = result.fetch("metadata").fetch("rows")
    assert_equal [ categories(:one).id, categories(:income).id, nil ].sort_by(&:to_s), rows.map { |row| row.fetch("values").first }.sort_by(&:to_s)
    assert_equal [ "2025-01", "2025-02" ], result.fetch("metadata").fetch("columns").map { |column| column.fetch("labels").first }
    uncategorized = rows.find { |row| row.fetch("values") == [ nil ] }
    assert_equal [ I18n.t("report_definition.uncategorized") ], uncategorized.fetch("labels")
    assert_equal 3, result.fetch("result")[rows.index(uncategorized)].fetch("sum").to_d
    zero_index = rows.index { |row| row.fetch("values") == [ categories(:one).id ] }
    zero_row = result.fetch("result")[zero_index]
    fields = result.fetch("metadata").fetch("fields").select { |field| field["role"] == "value" }
    assert_equal [ 0, nil ], fields.map { |field| zero_row.fetch(field.fetch("key"))&.to_d }
    assert_not result.fetch("truncated")
  end

  test "identical display labels cannot merge a real category with uncategorized" do
    category = @user.family.categories.create!(name: I18n.t("report_definition.uncategorized"), color: "#6172F3")
    add(11, category: category)
    add(19)
    result = @reports.call(definition)
    assert_equal 2, result.fetch("metadata").fetch("rows").size
    assert_equal 1, result.fetch("metadata").fetch("rows").map { |row| row.fetch("labels") }.uniq.size
    assert_equal 2, result.fetch("metadata").fetch("rows").map { |row| row.fetch("key") }.uniq.size
    assert_equal [ 11, 19 ], result.fetch("result").map { |row| row.fetch("sum").to_d }.sort
  end

  test "category rename preserves stable identity" do
    category = categories(:one)
    add(11, category: category)
    before = @reports.call(definition).fetch("metadata").fetch("rows").first
    category.update!(name: "Renamed report category")
    after = @reports.call(definition).fetch("metadata").fetch("rows").first
    assert_equal before.fetch("key"), after.fetch("key")
    assert_equal [ "Renamed report category" ], after.fetch("labels")
  end

  test "full source sums and nonadditive row totals are independent of the preview" do
    60.times { add(1, category: categories(:one)) }
    add(100, category: categories(:one), date: @february)
    result = @reports.call(definition(values: [
      { id: "average", field: "amount", aggregation: "average" },
      { id: "distinct_categories", field: "category", aggregation: "count_distinct" },
      { id: "sum", field: "amount", aggregation: "sum" }
    ]))
    total = result.fetch("result").first
    assert_in_delta 160.0 / 61, total.fetch("average").to_d, 0.000001
    assert_equal 1, total.fetch("distinct_categories").to_i
    assert_equal 160, total.fetch("sum").to_d
    fields = result.fetch("metadata").fetch("fields").select { |field| field["role"] == "value" && field["measureId"] == "distinct_categories" }
    assert_equal [ 1, 1 ], fields.map { |field| total.fetch(field.fetch("key")).to_i }
  end

  test "row measure ordering ranks complete row totals rather than individual cells" do
    add(60, category: categories(:one))
    add(60, category: categories(:one), date: @february)
    add(100, category: categories(:income))
    result = @reports.call(definition(sort: [ { axis: "rows", measure: "sum", direction: "desc" } ]))
    assert_equal [ categories(:one).id, categories(:income).id ], result.fetch("metadata").fetch("rows").map { |row| row.fetch("values").first }
    assert_equal [ 120, 100 ], result.fetch("result").map { |row| row.fetch("sum").to_d }
  end

  test "row ordering uses the actual average over all matching transactions" do
    9.times { add(0, category: categories(:one)) }
    add(100, category: categories(:one), date: @february)
    add(20, category: categories(:income))
    result = @reports.call(definition(
      values: [ { id: "average", field: "amount", aggregation: "average" } ],
      sort: [ { axis: "rows", measure: "average", direction: "desc" } ]
    ))
    assert_equal [ categories(:income).id, categories(:one).id ], result.fetch("metadata").fetch("rows").map { |row| row.fetch("values").first }
    assert_equal [ 20, 10 ], result.fetch("result").map { |row| row.fetch("average").to_d }
  end

  test "authorization scopes source filters catalog and grand totals including shared accounts" do
    private_account = @user.family.accounts.create!(name: "Private report", owner: users(:family_member), currency: "EUR", balance: 0, accountable: Depository.new)
    shared_account = @user.family.accounts.create!(name: "Shared report", owner: users(:family_member), currency: "USD", balance: 0, accountable: Depository.new)
    shared_account.account_shares.create!(user: @user, permission: "read_only")
    private_category = @user.family.categories.create!(name: "Private category", color: "#6172F3")
    add(13)
    add(17, account: shared_account)
    add(900, account: private_account, currency: "EUR", category: private_category)
    create_transaction(account: @account, amount: 1000, excluded: true, currency: "GBP")
    account_options = @reports.catalog.fetch(:fields).find { |field| field[:key] == "account" }.fetch(:options).map { |option| option[:value] }
    assert_includes account_options, @account.id
    assert_includes account_options, shared_account.id
    assert_not_includes account_options, private_account.id
    category_options = @reports.catalog.fetch(:fields).find { |field| field[:key] == "category" }.fetch(:options).map { |option| option[:value] }
    assert_not_includes category_options, private_category.id
    currency_options = @reports.catalog.fetch(:fields).find { |field| field[:key] == "currency" }.fetch(:options).map { |option| option[:value] }
    assert_not_includes currency_options, "EUR"
    assert_not_includes currency_options, "GBP"
    # Catalog authorization is not sufficient: a hand-written private filter
    # must still yield no data, and owned/shared rows both reach execution.
    private_result = @reports.call(definition(filters: [ { field: "account", operator: "equals", value: private_account.id } ]))
    assert_empty private_result.fetch("metadata").fetch("rows")
    shared_result = @reports.call(definition(filters: [ { field: "account", operator: "equals", value: shared_account.id } ]))
    assert_equal 17, shared_result.fetch("result").first.fetch("sum").to_d
    own_result = @reports.call(definition(rows: [], columns: []))
    assert_equal 13, own_result.fetch("result").first.fetch("sum").to_d
  end

  test "a user without accessible accounts sees neither catalog options nor financial data" do
    add(100)
    reports = Sureql::ReportDefinition.new(users(:empty))
    assert reports.catalog.fetch(:fields).all? { |field| field.fetch(:options).empty? }
    assert_empty reports.call(definition(filters: [])).fetch("metadata").fetch("rows")
  end

  test "mixed money requires row currency or a single currency source filter" do
    add(10, currency: "USD")
    add(20, currency: "EUR")
    error = assert_raises(Sureql::ReportDefinition::InvalidError) { @reports.call(definition) }
    assert_equal "rows", error.field
    error = assert_raises(Sureql::ReportDefinition::InvalidError) do
      @reports.call(definition(columns: [ { id: "currency", field: "currency" } ]))
    end
    assert_equal "rows", error.field
    result = @reports.call(definition(rows: [ { id: "currency", field: "currency" } ]))
    assert_equal [ "EUR", "USD" ], result.fetch("metadata").fetch("rows").map { |row| row.fetch("values").first }
    assert_equal [ 20, 10 ], result.fetch("result").map { |row| row.fetch("sum").to_d }
    assert_nil result.fetch("metadata").fetch("measures").first.fetch("currency")
    result = @reports.call(definition(filters: account_filter + [ { field: "currency", operator: "equals", value: "USD" } ]))
    assert_equal 10, result.fetch("result").first.fetch("sum").to_d
    assert_equal "USD", result.fetch("metadata").fetch("measures").first.fetch("currency")
    result = @reports.call(definition(values: [ { id: "count", field: "transaction_count", aggregation: "count" } ]))
    assert_equal 2, result.fetch("result").first.fetch("count").to_i
  end

  test "last days includes both boundaries and excludes earlier and future dates" do
    today = connection_current_date
    add(1, date: today - 2)
    add(10, date: today - 1)
    add(100, date: today)
    add(1000, date: today + 1)
    result = @reports.call(definition(rows: [], columns: [], filters: account_filter + [ { field: "date", operator: "last", unit: "days", value: 2 } ]))
    assert_equal 110, result.fetch("result").first.fetch("sum").to_d
  end

  test "empty grand totals preserve null aggregates and zero counts" do
    result = @reports.call(definition(rows: [], columns: [], values: [
      { id: "sum", field: "amount", aggregation: "sum" },
      { id: "count", field: "transaction_count", aggregation: "count" }
    ]))
    assert_equal [ { "sum" => nil, "count" => "0" } ], result.fetch("result")
    assert_not result.fetch("truncated")
  end

  test "scalar aggregates expose named decimal values and their currency" do
    add(-58)
    result = @reports.call(definition(
      rows: [], columns: [], values: [ { id: "total", field: "amount", aggregation: "sum" } ]
    ))
    assert_equal [ "total" ], result.fetch("result").sole.keys
    assert_kind_of String, result.fetch("result").sole.fetch("total")
    assert_equal(-58, result.fetch("result").sole.fetch("total").to_d)
    field = result.fetch("metadata").fetch("fields").sole
    assert_equal "total", field.fetch("key")
    assert_equal "currency", field.fetch("kind")
    assert_equal "USD", field.fetch("currency")
    assert_not result.key?("cells")
  end

  test "flat dimension fields cannot overwrite a measure with the same source field name" do
    add(12, category: categories(:one))
    result = @reports.call(definition(
      rows: [ { id: "row_category", field: "category" } ], columns: [],
      values: [ { id: "category", field: "amount", aggregation: "sum" } ]
    ))
    assert_equal categories(:one).name, result.fetch("result").sole.fetch("row_category")
    assert_equal 12, result.fetch("result").sole.fetch("category").to_d
  end

  test "pivot pages retain complete cells and totals include omitted columns" do
    now = Time.current
    categories = 51.times.map do |index|
      { id: SecureRandom.uuid, name: format("Report category %02d", index), family_id: @user.family_id, created_at: now, updated_at: now }
    end
    Category.insert_all!(categories)
    transactions = []
    entries = []
    categories.each_with_index do |category, row|
      25.times do |column|
        transaction_id = SecureRandom.uuid
        transactions << { id: transaction_id, category_id: category[:id], created_at: now, updated_at: now }
        entries << { id: SecureRandom.uuid, account_id: @account.id, entryable_type: "Transaction", entryable_id: transaction_id, name: "Bounded report", currency: "USD", amount: row + 1, date: Date.new(2023, 1, 1) >> column, created_at: now, updated_at: now }
      end
    end
    Transaction.insert_all!(transactions)
    Entry.insert_all!(entries)
    result = @reports.call(definition(sort: [ { axis: "rows", measure: "sum", direction: "desc" } ]))
    assert_equal 10, result.fetch("metadata").fetch("rows").size
    assert_equal 24, result.fetch("metadata").fetch("columns").size
    fields = result.fetch("metadata").fetch("fields").select { |field| field["role"] == "value" }
    assert result.fetch("result").all? { |row| fields.all? { |field| row.fetch(field.fetch("key")).to_d == row.fetch("sum").to_d / 25 } }
    assert result.fetch("truncated")
    assert_equal [ categories.last.fetch(:id) ], result.fetch("metadata").fetch("rows").first.fetch("values")
    assert_equal 51 * 25, result.fetch("result").first.fetch("sum").to_d
    assert_equal [ categories.fetch(41).fetch(:id) ], result.fetch("metadata").fetch("rows").last.fetch("values")
    assert_equal "2024-12", result.fetch("metadata").fetch("columns").last.fetch("labels").first

    complete = @reports.call(definition(sort: [ { axis: "rows", measure: "sum", direction: "desc" } ]), pagination: { limit: 100, offset: 0 }, all_columns: true)
    assert_equal 51, complete.fetch("metadata").fetch("rows").size
    assert_equal 25, complete.fetch("metadata").fetch("columns").size
    assert_not complete.fetch("truncated")
    assert_equal "2025-01", complete.fetch("metadata").fetch("columns").last.fetch("labels").first
    field = complete.fetch("metadata").fetch("fields").find { |item| item["columnKey"] == complete.fetch("metadata").fetch("columns").last.fetch("key") }
    assert_equal 51, complete.fetch("result").first.fetch(field.fetch("key")).to_d
  end

  test "pivot offsets page ranked whole groups without changing totals or column groups" do
    6.times do |index|
      category = @user.family.categories.create!(name: "Paged category #{index}", color: "#6172F3")
      add(index + 1, category: category)
      add((index + 1) * 100, category: category, date: @february)
    end
    spec = definition(sort: [ { axis: "rows", measure: "sum", direction: "desc" } ])
    first = @reports.call(spec, pagination: { limit: 2, offset: 0 })
    second = @reports.call(spec, pagination: { limit: 2, offset: 2 })
    last = @reports.call(spec, pagination: { limit: 2, offset: 4 })
    empty = @reports.call(spec, pagination: { limit: 2, offset: 6 })

    assert_equal [ 606, 505 ], first.fetch("result").map { |row| row.fetch("sum").to_d }
    assert_equal [ 404, 303 ], second.fetch("result").map { |row| row.fetch("sum").to_d }
    assert_equal [ 202, 101 ], last.fetch("result").map { |row| row.fetch("sum").to_d }
    assert first.fetch("pagination").fetch("hasNext")
    assert second.fetch("pagination").fetch("hasNext")
    assert_not last.fetch("pagination").fetch("hasNext")
    assert_equal first.fetch("metadata").fetch("columns"), second.fetch("metadata").fetch("columns")
    assert_equal first.fetch("metadata").fetch("columns"), last.fetch("metadata").fetch("columns")
    fields = second.fetch("metadata").fetch("fields").select { |field| field["role"] == "value" }
    assert_equal [ [ 4, 400 ], [ 3, 300 ] ], second.fetch("result").map { |row| fields.map { |field| row.fetch(field.fetch("key")).to_d } }
    assert_not second.fetch("truncated")
    assert_empty empty.fetch("metadata").fetch("rows")
    assert_empty empty.fetch("result")
    assert_equal first.fetch("metadata").fetch("columns"), empty.fetch("metadata").fetch("columns")
    assert_not empty.fetch("pagination").fetch("hasNext")
  end

  test "date dimensions on rows bucket boundary dates and support descending dimensional order" do
    add(10, date: Date.new(2025, 1, 31))
    add(20, date: Date.new(2025, 2, 1))
    result = @reports.call(definition(
      rows: [ { id: "month", field: "date", dateBucket: "month" } ], columns: [],
      sort: [ { axis: "rows", dimension: "month", direction: "desc" } ]
    ))
    assert_equal [ "2025-02", "2025-01" ], result.fetch("metadata").fetch("rows").map { |row| row.fetch("labels").first }
    assert_equal [ "2025-02-01", "2025-01-01" ], result.fetch("metadata").fetch("rows").map { |row| row.fetch("values").first }
    assert_equal [ 20, 10 ], result.fetch("result").map { |row| row.fetch("sum").to_d }
  end

  test "execution errors do not expose database or compiler details" do
    Sureql::Compiler.any_instance.stubs(:call).raises(Sureql::CompileError, "secret_table contains private_column")
    [ definition, detail_definition ].each do |spec|
      error = assert_raises(Sureql::ReportDefinition::InvalidError) { @reports.call(spec) }
      assert_equal "report", error.field
      assert_not_includes error.message, "secret_table"
      assert_not_includes error.message, "private_column"
    end
    error = assert_raises(Sureql::ReportDefinition::InvalidError) { @reports.catalog }
    assert_equal "catalog", error.field
    assert_not_includes error.message, "secret_table"
    assert_not_includes error.message, "private_column"
  end

  test "malformed definitions and SQL-like input return stable validation paths" do
    invalid = [
      [ nil, "report" ], [ false, "report" ], [ [], "report" ],
      [ definition(version: 2), "version" ],
      [ definition(rows: "category"), "rows" ],
      [ definition(rows: [ nil ]), "rows.0" ],
      [ definition(values: [ { id: "x", field: "amount; DROP TABLE entries", aggregation: "sum" } ]), "values.0.field" ],
      [ definition(rows: [ { id: "x", field: "amount" } ]), "rows.0.field" ],
      [ definition(rows: [ { id: "x", field: "category", dateBucket: "month" } ]), "rows.0.dateBucket" ],
      [ definition(values: [ { id: "category", field: "amount", aggregation: "sum" } ]), "values.0.id" ],
      [ definition(filters: [ { field: "currency", operator: "equals", value: "USD' OR TRUE--" } ]), "filters.0.value" ],
      [ definition(filters: [ { field: "account", operator: "equals", value: [] } ]), "filters.0.value" ],
      [ definition(filters: [ { field: "category", operator: "not_equals", value: "not-a-uuid" } ]), "filters.0.value" ],
      [ definition(filters: [ { field: "account", operator: "not_equals", value: @account.id } ]), "filters.0.operator" ],
      [ definition(filters: [ { field: "date", operator: "last", unit: "days", value: "2" } ]), "filters.0.value" ],
      [ definition(filters: [ { field: "date", operator: "last", unit: "days", value: 0 } ]), "filters.0.value" ],
      [ definition(filters: [ { field: "date", operator: "last", unit: "days", value: 3661 } ]), "filters.0.value" ],
      [ definition(sort: [ { axis: "columns", measure: "sum", direction: "desc" } ]), "sort.0.measure" ],
      [ definition(sort: [ { axis: "rows", measure: "missing", direction: "asc" } ]), "sort.0.measure" ]
    ]
    invalid.each do |input, expected_field|
      error = assert_raises(Sureql::ReportDefinition::InvalidError) { @reports.call(input) }
      assert_equal expected_field, error.field
    end
  end

  test "uncategorized equals filter uses a null predicate not a display label" do
    add(12)
    add(100, category: categories(:one))
    result = @reports.call(definition(filters: account_filter + [ { field: "category", operator: "equals", value: "" } ]))
    assert_equal [ nil ], result.fetch("metadata").fetch("rows").first.fetch("values")
    assert_equal 12, result.fetch("result").first.fetch("sum").to_d
  end

  test "category not equals retains other categories and uncategorized transactions" do
    add(100, category: categories(:one))
    add(7, category: categories(:income))
    add(12)
    add(1000, category: categories(:income), excluded: true)
    result = @reports.call(definition(filters: account_filter + [ { field: "category", operator: "not_equals", value: categories(:one).id } ]))
    totals = result.fetch("metadata").fetch("rows").each_with_index.to_h { |row, index| [ row.fetch("values").first, result.fetch("result")[index].fetch("sum").to_d ] }
    assert_equal({ categories(:income).id => 7, nil => 12 }, totals)
  end

  test "category not equals uncategorized retains only categorized transactions" do
    add(100, category: categories(:one))
    add(7, category: categories(:income))
    add(12)
    result = @reports.call(definition(filters: account_filter + [ { field: "category", operator: "not_equals", value: "" } ]))
    totals = result.fetch("metadata").fetch("rows").each_with_index.to_h { |row, index| [ row.fetch("values").first, result.fetch("result")[index].fetch("sum").to_d ] }
    assert_equal({ categories(:one).id => 100, categories(:income).id => 7 }, totals)
  end

  test "detail keeps duplicate looking entries separate and preserves selected field order" do
    first = add("-900719925474099.1234", name: "Duplicate", currency: "EUR", category: categories(:one))
    second = add("-900719925474099.1234", name: "Duplicate", currency: "EUR", category: categories(:one))
    usd = add("900719925474099.1234", name: "USD entry", currency: "USD", date: @february)
    result = @reports.call(detail_definition(columns: %w[amount category account name date].map { |field| { field: field } }))

    assert_equal "detail", result.fetch("mode")
    assert_equal %w[amount category account name date], result.fetch("metadata").fetch("fields").map { |column| column.fetch("key") }
    assert_equal %w[currency text text text date], result.fetch("metadata").fetch("fields").map { |column| column.fetch("kind") }
    assert_equal [ usd.id, *[ first.id, second.id ].sort ], result.fetch("metadata").fetch("rows").map { |row| row.fetch("id") }
    assert_equal({ "amount" => "900719925474099.1234", "category" => I18n.t("report_definition.uncategorized"), "account" => @account.name, "name" => "USD entry", "date" => "2025-02-15" }, result.fetch("result").first)
    duplicate_rows = result.fetch("result").last(2)
    assert_equal({ "amount" => "-900719925474099.1234", "category" => categories(:one).name, "account" => @account.name, "name" => "Duplicate", "date" => "2025-01-15" }, duplicate_rows.first)
    assert_equal duplicate_rows.first, duplicate_rows.last
    assert_equal [ "USD", "EUR", "EUR" ], result.fetch("metadata").fetch("rows").map { |row| row.fetch("currency") }
    assert_not result.fetch("truncated")
  end

  test "detail sorting uses numeric amounts multiple selected fields and entry identity for ties" do
    small = add(2, name: "A")
    large = add(10, name: "A")
    tie = add(2, name: "A")
    named = add(2, name: "Z")
    negative = add(-3, name: "A")
    latest = add(100, date: @february)
    result = @reports.call(detail_definition(sort: [
      { field: "date", direction: "desc" },
      { field: "amount", direction: "asc" },
      { field: "name", direction: "desc" }
    ]))

    assert_equal [ latest.id, negative.id, named.id, *[ small.id, tie.id ].sort, large.id ], result.fetch("metadata").fetch("rows").map { |row| row.fetch("id") }
    ascending = @reports.call(detail_definition(sort: [ { field: "date", direction: "asc" } ]))
    assert_equal [ *[ small.id, large.id, tie.id, named.id, negative.id ].sort, latest.id ], ascending.fetch("metadata").fetch("rows").map { |row| row.fetch("id") }
  end

  test "detail sorts category and account by displayed labels rather than ids" do
    category = @user.family.categories.create!(id: "00000000-0000-0000-0000-000000000001", name: "Zulu", color: "#6172F3")
    other = @user.family.accounts.create!(name: "Aardvark", owner: @user, currency: "USD", balance: 0, accountable: Depository.new)
    categorized = add(1, category: category)
    uncategorized = add(1)
    other_entry = add(1, account: other)
    result = @reports.call(detail_definition(filters: [], sort: [
      { field: "account", direction: "asc" }, { field: "category", direction: "asc" }
    ]))
    matching = result.fetch("metadata").fetch("rows").select { |row| [ categorized.id, uncategorized.id, other_entry.id ].include?(row.fetch("id")) }
    assert_equal [ other_entry.id, uncategorized.id, categorized.id ], matching.map { |row| row.fetch("id") }
  end

  test "detail pagination retains tied entries across offsets custom limits and the last page" do
    entries = 21.times.map { |index| add(1, id: format("00000000-0000-0000-0000-%012d", index + 1)) }
    add(99, excluded: true, date: @february)
    spec = detail_definition(columns: [ { field: "name" } ], sort: [])
    first = @reports.call(spec)
    second = @reports.call(spec, pagination: { limit: 10, offset: 10 })
    last = @reports.call(spec, pagination: { limit: 10, offset: 20 })
    custom = @reports.call(spec, pagination: { limit: 7, offset: 7 })
    empty = @reports.call(spec, pagination: { limit: 10, offset: 21 })

    assert_equal entries.first(10).map(&:id), first.fetch("metadata").fetch("rows").map { |row| row.fetch("id") }
    assert_equal entries.slice(10, 10).map(&:id), second.fetch("metadata").fetch("rows").map { |row| row.fetch("id") }
    assert_equal [ entries.last.id ], last.fetch("metadata").fetch("rows").map { |row| row.fetch("id") }
    assert_equal entries.slice(7, 7).map(&:id), custom.fetch("metadata").fetch("rows").map { |row| row.fetch("id") }
    assert first.fetch("pagination").fetch("hasNext")
    assert second.fetch("pagination").fetch("hasNext")
    assert_not last.fetch("pagination").fetch("hasNext")
    assert_not first.fetch("truncated")
    assert_equal first.fetch("metadata").fetch("rows"), @reports.call(spec).fetch("metadata").fetch("rows")
    assert_empty empty.fetch("metadata").fetch("rows")
    assert_not empty.fetch("pagination").fetch("hasNext")
  end

  test "pagination rejects noninteger unsafe and negative limits or offsets" do
    invalid = [
      [ { limit: 0 }, "pagination.limit" ],
      [ { limit: -1 }, "pagination.limit" ],
      [ { limit: 1.5 }, "pagination.limit" ],
      [ { limit: "10" }, "pagination.limit" ],
      [ { offset: -1 }, "pagination.offset" ],
      [ { offset: 0.5 }, "pagination.offset" ],
      [ { offset: "0; DROP TABLE entries" }, "pagination.offset" ],
      [ { take: 10 }, "pagination" ],
      [ [], "pagination" ]
    ]
    invalid.each do |pagination, field|
      error = assert_raises(Sureql::ReportDefinition::InvalidError) { @reports.call(detail_definition, pagination: pagination) }
      assert_equal field, error.field
    end
  end

  test "detail filters apply before sorting and clipping with inclusive dates and null categories" do
    today = connection_current_date
    earlier = add(1, date: today - 1, currency: "EUR")
    add(2, date: today, currency: "EUR")
    6.times { add(10, category: categories(:one), date: today, currency: "EUR") }
    add(100, date: today - 2, currency: "EUR")
    add(1000, date: today + 1, currency: "EUR")
    add(10000, date: today, currency: "USD")
    result = @reports.call(detail_definition(filters: account_filter + [
      { field: "date", operator: "last", unit: "days", value: 2 },
      { field: "category", operator: "equals", value: "" },
      { field: "currency", operator: "equals", value: "EUR" }
    ]), pagination: { limit: 1, offset: 1 })

    assert_equal [ earlier.id ], result.fetch("metadata").fetch("rows").map { |row| row.fetch("id") }
    assert_not result.fetch("truncated")
    assert_not result.fetch("pagination").fetch("hasNext")
  end

  test "detail retains ordered column metadata without matching transactions" do
    result = @reports.call(detail_definition(columns: [ { field: "currency" }, { field: "amount" } ], sort: []))
    fields = result.fetch("metadata").fetch("fields")
    assert_equal %w[currency amount], fields.map { |field| field.fetch("key") }
    assert_equal %w[text currency], fields.map { |field| field.fetch("kind") }
    assert_empty result.fetch("metadata").fetch("rows")
    assert_not result.fetch("truncated")
  end

  test "detail authorization includes shared accounts but excludes private foreign and excluded entries" do
    private_account = @user.family.accounts.create!(name: "Private detail", owner: users(:family_member), currency: "USD", balance: 0, accountable: Depository.new)
    shared_account = @user.family.accounts.create!(name: "Shared detail", owner: users(:family_member), currency: "USD", balance: 0, accountable: Depository.new)
    shared_account.account_shares.create!(user: @user, permission: "read_only")
    foreign_account = users(:empty).family.accounts.create!(name: "Foreign detail", owner: users(:empty), currency: "USD", balance: 0, accountable: Depository.new)
    owned = add(13)
    shared = add(17, account: shared_account)
    private_entry = add(900, account: private_account)
    foreign_entry = add(901, account: foreign_account)
    excluded = add(902, excluded: true)
    valuation = create_valuation(account: @account, amount: 903, date: @january)
    result = @reports.call(detail_definition(filters: []))
    ids = result.fetch("metadata").fetch("rows").map { |row| row.fetch("id") }
    assert_includes ids, owned.id
    assert_includes ids, shared.id
    [ private_entry, foreign_entry, excluded, valuation ].each { |entry| assert_not_includes ids, entry.id }
    [ private_account, foreign_account ].each do |account|
      filtered = @reports.call(detail_definition(filters: [ { field: "account", operator: "equals", value: account.id } ]))
      assert_empty filtered.fetch("metadata").fetch("rows")
      assert_not filtered.fetch("truncated")
    end
    assert_empty Sureql::ReportDefinition.new(users(:empty)).call(detail_definition).fetch("metadata").fetch("rows")
  end

  test "detail rejects aggregate shapes duplicate fields unselected sorts and unsupported capabilities" do
    invalid = [
      [ detail_definition(rows: []), "report" ],
      [ detail_definition(values: []), "report" ],
      [ detail_definition(columns: []), "columns" ],
      [ detail_definition(columns: Array.new(7) { { field: "name" } }), "columns" ],
      [ detail_definition(columns: [ nil ]), "columns.0" ],
      [ detail_definition(columns: [ { field: "name", id: "name" } ]), "columns.0" ],
      [ detail_definition(columns: [ { field: "date", dateBucket: "month" } ]), "columns.0" ],
      [ detail_definition(columns: [ { field: "transaction_count" } ]), "columns.0.field" ],
      [ detail_definition(columns: [ { field: "name" }, { field: "name" } ]), "columns.1.field" ],
      [ detail_definition(columns: [ { field: "amount; DROP TABLE entries" } ]), "columns.0.field" ],
      [ detail_definition(sort: [ { axis: "rows", dimension: "date", direction: "desc" } ]), "sort.0" ],
      [ detail_definition(columns: [ { field: "name" } ], sort: [ { field: "date", direction: "desc" } ]), "sort.0.field" ],
      [ detail_definition(sort: [ { field: "date", direction: "desc" }, { field: "date", direction: "asc" } ]), "sort.1.field" ],
      [ detail_definition(sort: [ { field: "date", direction: "random" } ]), "sort.0.direction" ],
      [ detail_definition(sort: Array.new(7) { { field: "date", direction: "asc" } }), "sort" ],
      [ detail_definition(filters: [ { field: "name", operator: "equals", value: "Transaction" } ]), "filters.0.operator" ],
      [ definition(rows: [ { id: "name", field: "name" } ]), "rows.0.field" ],
      [ definition(values: [ { id: "names", field: "name", aggregation: "count_distinct" } ]), "values.0.aggregation" ]
    ]
    invalid.each do |input, expected_field|
      error = assert_raises(Sureql::ReportDefinition::InvalidError) { @reports.call(input) }
      assert_equal expected_field, error.field
    end
    entry = add(1)
    full_sort = %w[date name account category amount currency].map { |field| { field: field, direction: "asc" } }
    assert_equal [ entry.id ], @reports.call(detail_definition(sort: full_sort)).fetch("metadata").fetch("rows").map { |row| row.fetch("id") }
  end

  private
    def connection_current_date
      ActiveRecord::Base.connection.select_value("SELECT CURRENT_DATE").to_date
    end

    def account_filter
      [ { field: "account", operator: "equals", value: @account.id } ]
    end

    def definition(**overrides)
      {
        version: 1, source: "transactions", mode: "aggregate",
        rows: [ { id: "category", field: "category" } ],
        columns: [ { id: "month", field: "date", dateBucket: "month" } ],
        values: [ { id: "sum", field: "amount", aggregation: "sum" } ],
        filters: account_filter, sort: []
      }.merge(overrides)
    end

    def detail_definition(**overrides)
      {
        version: 1, source: "transactions", mode: "detail",
        columns: %w[date name account category amount currency].map { |field| { field: field } },
        filters: account_filter, sort: [ { field: "date", direction: "desc" } ]
      }.merge(overrides)
    end

    def add(amount, **attributes)
      create_transaction({ account: @account, amount: amount, date: @january }.merge(attributes))
    end
end
