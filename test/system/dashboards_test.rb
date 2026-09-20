require "application_system_test_case"

class DashboardsTest < ApplicationSystemTestCase
  setup do
    sign_in @user = users(:family_admin)
    @entry = create_transaction("Dashboard Groceries Test", Date.current, 42.50)
  end

  test "renders /dashboards with a configured report and hides the editor by default" do
    visit dashboards_url

    assert_selector "h1", text: "My dashboard"
    assert_selector "h2", text: /Recent transactions/i
    assert_no_selector "[role='application'][aria-label='SureQL Query Editor']"
    assert_selector "table th", text: /name/i
    assert_selector "table td", text: "Dashboard Groceries Test"

    click_button "Configure"

    within "#configure-report-dialog" do
      assert_selector "label", text: "Report name"
      assert_selector "label", text: "Language"
      assert_selector "select#query-language-select"
      assert_selector "[role='application'][aria-label='SureQL Query Editor']"
      assert_selector ".monaco-editor", text: "from transactions", wait: 10
    end
  end

  test "persists dashboard and report names configured in dialogs" do
    visit dashboards_url

    click_button "Rename dashboard"
    within "[aria-labelledby='rename-dashboard-title']" do
      fill_in "Name", with: "Monthly review"
      click_button "Save name"
    end
    assert_selector "h1", text: "Monthly review"

    click_button "Configure"
    within "#configure-report-dialog" do
      fill_in "Report name", with: "Account overview"
      click_button "Save and run"
    end

    assert_selector "h2", text: /Account overview/i
    assert_no_selector "[role='application'][aria-label='SureQL Query Editor']"

    visit dashboards_url

    assert_selector "h1", text: "Monthly review"
    assert_selector "h2", text: /Account overview/i
  end

  test "edits SureQL query in Monaco and runs it to display updated results" do
    visit dashboards_url

    assert_selector "h1", text: "My dashboard"
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

    assert_selector "h1", text: "My dashboard"
    set_query("from secrets")
    click_button "Run"

    assert_selector "[role='alert']", text: "Query error"
    assert_selector "[role='alert']", text: "unknown sureql source `secrets`"
  end

  test "displays empty state when query returns no rows" do
    visit dashboards_url

    assert_selector "h1", text: "My dashboard"
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

    assert_saved_query("from accounts")
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
    find("button[aria-label='Open account menu']", match: :first, visible: :visible).click
    click_button "Log out", match: :first
    sign_in users(:family_member)
    visit dashboards_url

    assert_saved_query("from transactions")
  end

  test "installs the starter on first use and restores it after confirmed reset" do
    visit dashboards_url

    assert_selector "table td", text: "Dashboard Groceries Test"

    set_query("from accounts\ntake 5")
    click_button "Run"
    assert_selector "table th", text: /classification/i

    visit dashboards_url
    assert_saved_query("from accounts")

    click_button "Reset starter dashboard"
    within "#reset-starter-dialog" do
      click_button "Reset dashboard"
    end

    assert_saved_query("from transactions")
    assert_selector "table td", text: "Dashboard Groceries Test"
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
      click_button "Configure" unless page.has_selector?("#configure-report-dialog", visible: :visible)
      assert_selector ".monaco-editor", wait: 10
      page.execute_script(<<~JS, query_text)
        const editor = window.sureqlEditor || (window.monaco && window.monaco.editor.getModels()[0]);
        if (editor) {
          editor.setValue(arguments[0]);
        }
      JS
    end

    def assert_saved_query(query_text)
      click_button "Configure"
      assert_selector ".monaco-editor", wait: 10
      assert_includes page.evaluate_script("window.sureqlEditor.getValue()"), query_text
      find("button[aria-label='Close report configuration']").click
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
