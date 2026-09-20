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

  test "suggests SureQL sources while typing" do
    visit dashboards_url
    click_button "Configure"
    assert_selector ".monaco-editor", wait: 10

    page.execute_script(<<~JS)
      const editor = window.sureqlEditor;
      editor.setValue("from tran");
      editor.setPosition({ lineNumber: 1, column: 10 });
      editor.focus();
      editor.getAction("editor.action.triggerSuggest").run();
    JS

    assert_selector ".suggest-widget.visible .monaco-list-row", text: /transactions/i
  end

  test "moves the SureQL cursor by word with Option and arrow keys" do
    visit dashboards_url
    click_button "Configure"
    assert_selector ".monaco-editor", wait: 10

    page.execute_script(<<~JS)
      const editor = window.sureqlEditor;
      editor.setValue("from transactions");
      editor.setPosition({ lineNumber: 1, column: 18 });
      editor.focus();
    JS

    page.driver.browser.action.key_down(:alt).send_keys(:left).key_up(:alt).perform
    assert_equal 6, page.evaluate_script("window.sureqlEditor.getPosition().column")

    page.driver.browser.action.key_down(:alt).send_keys(:right).key_up(:alt).perform
    assert_equal 18, page.evaluate_script("window.sureqlEditor.getPosition().column")
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

  test "adds independent report cards and removes one without altering the other" do
    visit dashboards_url

    click_button "Add report"
    within "#configure-report-dialog" do
      fill_in "Report name", with: "Account overview"
    end
    set_query("from accounts\ntake 5")
    within "#configure-report-dialog" do
      click_button "Save and run"
    end

    assert_selector "h2", text: /Recent transactions/i
    assert_selector "h2", text: /Account overview/i
    within "section[aria-label='Account overview results']" do
      assert_selector "table th", text: /balance/i
    end

    snapshot = dashboard_snapshot
    added_report = snapshot.fetch("reports").find { |report| report.fetch("name") == "Account overview" }
    assert_match(/\Areport-[0-9a-f-]+\z/, added_report.fetch("id"))
    starter_layout = snapshot.fetch("layout").find { |item| item.fetch("i") == "sureql-report" }
    added_layout = snapshot.fetch("layout").find { |item| item.fetch("i") == added_report.fetch("id") }
    assert_operator added_layout.fetch("y"), :>=, starter_layout.fetch("y") + starter_layout.fetch("h")

    set_query("from secrets", report_name: "Recent transactions")
    within "#configure-report-dialog" do
      click_button "Save and run"
    end

    within "section[aria-label='Recent transactions results']" do
      assert_selector "[role='alert']", text: "unknown sureql source `secrets`"
    end
    within "section[aria-label='Account overview results']" do
      assert_selector "table th", text: /balance/i
    end

    find("button[aria-label='Configure Recent transactions']").click
    within "#configure-report-dialog" do
      click_button "Remove report"
    end
    within "#remove-report-dialog" do
      click_button "Remove report"
    end

    assert_no_selector "h2", text: /Recent transactions/i
    assert_selector "h2", text: /Account overview/i
    surviving_snapshot = dashboard_snapshot
    surviving_layout = surviving_snapshot.fetch("layout")

    visit dashboards_url

    assert_no_selector "h2", text: /Recent transactions/i
    assert_selector "h2", text: /Account overview/i
    within "section[aria-label='Account overview results']" do
      assert_selector "table th", text: /balance/i
    end
    assert_equal added_report.fetch("id"), dashboard_snapshot.fetch("reports").sole.fetch("id")
    assert_equal surviving_layout, dashboard_snapshot.fetch("layout")
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

    def set_query(query_text, report_name: nil)
      unless page.has_selector?("#configure-report-dialog", visible: :visible)
        if report_name
          find("button[aria-label='Configure #{report_name}']").click
        else
          click_button "Configure"
        end
      end
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

    def dashboard_snapshot
      page.evaluate_script(<<~JS)
        (() => {
          const bootstrap = JSON.parse(document.querySelector("#spa-bootstrap").textContent);
          return JSON.parse(window.localStorage.getItem(`sure:dashboards:${bootstrap.currentUser.id}`));
        })()
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
