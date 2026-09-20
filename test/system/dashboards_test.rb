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

  test "persists the saved query across reload for continued experimentation" do
    visit dashboards_url

    assert_selector "table td", text: "Dashboard Groceries Test"
    set_query("from accounts\ntake 5")
    click_button "Run"
    assert_selector "table th", text: /classification/i

    visit dashboards_url

    assert_includes page.evaluate_script("window.sureqlEditor.getValue()"), "from accounts"
    assert_selector "table th", text: /classification/i
  end

  test "falls back to the starter screen when stored snapshot is malformed" do
    visit dashboards_url

    write_malformed_dashboard_snapshot

    visit dashboards_url

    assert_selector "table td", text: "Dashboard Groceries Test"
  end

  test "isolates persisted dashboards between users sharing one browser" do
    visit dashboards_url

    set_query("from accounts\ntake 5")
    click_button "Run"
    assert_selector "table th", text: /classification/i
    user_menu = find("div[data-testid=user-menu]", match: :first, visible: :visible)
    within user_menu do
      find("[data-DS--popover-target='button']", match: :first).click
      click_on "Log out", match: :first
    end
    sign_in users(:family_member)
    visit dashboards_url

    assert_includes page.evaluate_script("window.sureqlEditor.getValue()"), "from transactions"
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
    def write_malformed_dashboard_snapshot
      page.execute_script(<<~JS)
        (() => {
          const bootstrap = JSON.parse(document.querySelector("#spa-bootstrap").textContent);
          window.localStorage.setItem(`sure:dashboards:${bootstrap.currentUser.id}`, "{not-json");
        })()
      JS
    end

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
