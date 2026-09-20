require "application_system_test_case"

class DashboardsTest < ApplicationSystemTestCase
  setup do
    sign_in @user = users(:family_admin)
    @entry = create_transaction("Dashboard Groceries Test", Date.current, 42.50)
  end

  test "renders /dashboards with Monaco SureQL editor and live query results" do
    visit dashboards_url

    assert_selector "h1", text: "Dashboards"
    assert_selector "label", text: "Language"
    assert_selector "select#query-language-select"
    assert_selector "select#query-theme-select"

    assert_selector "[role='application'][aria-label='SureQL Query Editor']"
    assert_selector ".monaco-editor", text: "from transactions", wait: 10

    assert_selector "table th", text: /name/i
    assert_selector "table td", text: "Dashboard Groceries Test"
  end

  test "edits SureQL query in Monaco and runs it to display updated results" do
    visit dashboards_url

    assert_selector "h1", text: "Dashboards"
    assert_selector "table td", text: "Dashboard Groceries Test"

    set_query("from accounts\ntake 5")
    click_button "Run"

    assert_selector "table th", text: /balance/i
    assert_selector "table th", text: /classification/i
    assert_no_selector "table th", text: /entryable_type/i
  end

  test "resets query to default using Reset button" do
    visit dashboards_url

    set_query("from accounts\ntake 2")
    assert_includes page.evaluate_script("window.sureqlEditor.getValue()"), "from accounts"

    click_button "Reset"
    assert_includes page.evaluate_script("window.sureqlEditor.getValue()"), "from transactions"
  end

  test "displays server error for invalid SureQL query" do
    visit dashboards_url

    assert_selector "h1", text: "Dashboards"
    set_query("from secrets")
    click_button "Run"

    assert_selector "[role='alert']", text: "Query error"
    assert_selector "[role='alert']", text: "unknown sureql source `secrets`"
  end

  test "displays empty state when query returns no rows" do
    visit dashboards_url

    assert_selector "h1", text: "Dashboards"
    set_query("from transactions\nfilter amount == -999999")
    click_button "Run"

    assert_selector "p", text: "No results found for this query."
  end

  test "displays truncation warning when query results are truncated" do
    51.times do |i|
      create_transaction("Truncated Tx #{i}", Date.current, 10 + i)
    end

    visit dashboards_url

    set_query("from transactions")
    click_button "Run"

    assert_selector "output", text: "Results truncated: showing first 50 rows."
  end

  private
    def set_query(query_text)
      assert_selector ".monaco-editor", wait: 10
      page.execute_script(<<~JS, query_text)
        const editor = window.sureqlEditor || (window.monaco && window.monaco.editor.getModels()[0]);
        if (editor) {
          editor.setValue(arguments[0]);
        }
      JS
    end

    def create_transaction(name, date, amount)
      accounts(:depository).entries.create!(
        name: name,
        date: date,
        amount: amount,
        currency: "USD",
        entryable: Transaction.new
      )
    end
end
