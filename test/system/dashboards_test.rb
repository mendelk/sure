require "application_system_test_case"

class DashboardsTest < ApplicationSystemTestCase
  setup do
    sign_in @user = users(:family_admin)
    create_transaction("Dashboard Groceries Test", Date.current, 42.50)
  end

  test "previews a source draft and saves it without changing the layout" do
    visit dashboards_url
    assert_selector "table td", text: "Dashboard Groceries Test"
    original_layout = active_dashboard(dashboard_snapshot).fetch("layout")

    set_query("from accounts\ntake 5")
    within "#source-editor" do
      assert_button "Save source", disabled: true
      click_button "Run", exact: true
      assert_selector "table th", text: /balance/i, wait: 10
      click_button "Generated SQL"
      within "[role='application'][aria-label='Generated SQL']" do
        assert_text "SELECT", wait: 10
      end
      sql_editor = find("[role='application'][aria-label='Generated SQL'] .view-lines")
      generated_sql = sql_editor.text
      sql_editor.click
      page.driver.browser.action.send_keys("SQL_MUST_NOT_CHANGE").perform
      assert_equal generated_sql, sql_editor.text
      click_button "Preview", exact: true
      assert_selector "table th", text: /balance/i
      assert_button "Save source", disabled: false
      fill_in "Source name", with: "Account overview"
      click_button "Save source"
    end

    assert_selector "section[aria-label='Account overview results'] table th", text: /balance/i
    assert_equal original_layout, active_dashboard(dashboard_snapshot).fetch("layout")
    visit dashboards_url
    assert_selector "section[aria-label='Account overview results'] table th", text: /balance/i
    assert_saved_query("from accounts", source_name: "Account overview")
  end

  test "failed and canceled source previews preserve saved results and configuration" do
    visit dashboards_url
    saved_sources = dashboard_snapshot.fetch("sources")
    set_query("from secrets")
    within "#source-editor" do
      click_button "Run", exact: true
      assert_selector "[role='alert']", text: "unknown sureql source `secrets`", wait: 10
      assert_button "Save source", disabled: true
      click_button "Cancel"
    end
    assert_selector "table td", text: "Dashboard Groceries Test"
    assert_equal saved_sources, dashboard_snapshot.fetch("sources")

    set_query("from accounts\ntake 5")
    run_preview
    within("#source-editor") { click_button "Cancel" }
    assert_equal saved_sources, dashboard_snapshot.fetch("sources")
    assert_saved_query("from transactions")
  end

  test "an empty source preview does not replace the saved consumer until saved" do
    visit dashboards_url
    set_query("from transactions\nfilter amount == -999999")
    within "#source-editor" do
      click_button "Run", exact: true
      assert_button "Save source", disabled: false, wait: 10
      assert_no_selector "table tbody tr"
      click_button "Cancel"
    end
    assert_selector "table td", text: "Dashboard Groceries Test"
    assert_saved_query("from transactions")
  end

  test "SureQL preview requests pages beyond the non-paginated result cap" do
    51.times { |index| create_transaction(format("Paged Tx %02d", index + 1), Date.current, 809.25) }
    visit dashboards_url
    set_query("from transactions\nfilter amount == 809.25\nsort {name}\ntake 100")
    run_preview
    within "#source-editor" do
      assert_selector "table td", text: "Paged Tx 01"
      assert_no_selector "table td", text: "Paged Tx 51"
      select "50", from: "per page"
      assert_selector "table tbody tr", count: 50
      click_button "Next"
      assert_selector "table td", text: "Paged Tx 51"
      assert_button "Next", disabled: true
      click_button "Cancel"
    end
    assert_selector "section[aria-label='Recent transactions results'] table"
  end

  test "saved SureQL tables page beyond fifty rows while preserving take limits and pending rows" do
    52.times { |index| create_transaction(format("Saved page row %02d", index + 1), Date.current, 811.25) }
    visit dashboards_url
    set_query("from transactions\nfilter amount == 811.25\nsort {name}\nselect {name, amount, currency}\ntake 51")
    run_preview
    save_source
    truncation_warning = page.evaluate_script("JSON.parse(document.querySelector('#spa-bootstrap').textContent).reportBuilderText.source_truncated")

    within "section[aria-label='Recent transactions results']" do
      assert_selector "table tbody tr", count: 10
      select "50", from: "per page"
      assert_selector "table tbody tr", count: 50
      previous_rows = all("table tbody tr").map(&:text)
      pause_report_requests
      click_button "Next"
      assert_button "Next", disabled: true
      assert_button "Previous", disabled: true
      assert_selector "nav button[aria-busy='true'] .animate-spin", count: 2
      assert_equal previous_rows, all("table tbody tr").map(&:text)
      resume_report_requests
      assert_selector "table tbody tr", count: 1
      assert_selector "table td", text: "Saved page row 51"
      assert_no_selector "table td", text: "Saved page row 52"
      assert_button "Next", disabled: true
      assert_button "Previous", disabled: false
      assert_no_text truncation_warning
      click_button "Previous"
      assert_selector "table td", text: "Saved page row 01"
      select "100", from: "per page"
      assert_selector "table tbody tr", count: 51
      assert_selector "table td", text: "Saved page row 51"
      assert_no_selector "table td", text: "Saved page row 52"
      assert_button "Next", disabled: true
      assert_no_text truncation_warning
    end
  ensure
    resume_report_requests
  end

  test "SureQL charts do not reuse a table page as their complete source result" do
    103.times { |index| create_transaction(format("Chart cache row %03d", index + 1), Date.current, 812.25) }
    visit dashboards_url
    table_dashboard_id = active_dashboard(dashboard_snapshot).fetch("id")
    set_query("from transactions\nfilter amount == 812.25\nsort {name}\nselect {name, amount, currency}\ntake 102")
    run_preview
    save_source
    within "section[aria-label='Recent transactions results']" do
      assert_selector "table tbody tr", count: 10
      assert_no_selector "table td", text: "Chart cache row 102"
    end

    create_dashboard("Chart cache isolation")
    pause_report_requests(offset: 100)
    add_visualization("Chart", "Recent transactions")
    page.document.synchronize(10) do
      raise Capybara::ElementNotFound, "Waiting for the chart continuation page" unless page.evaluate_script("window.reportRequestResumes.length === 1")
    end
    assert_no_selector "[role='img'][aria-label^='Recent transactions chart']"
    resume_report_requests
    assert_selector "[role='img'][aria-label^='Recent transactions chart']", wait: 10
    assert_selector "ul[aria-label^='Recent transactions chart'] li", count: 102, visible: :all
    assert_selector "ul[aria-label^='Recent transactions chart'] li", text: "Chart cache row 102", visible: :all
    assert_no_selector "ul[aria-label^='Recent transactions chart'] li", text: "Chart cache row 103", visible: :all
    visit "#{dashboards_url}?dashboard=#{table_dashboard_id}"
    within "section[aria-label='Recent transactions results']" do
      assert_selector "table tbody tr", count: 10
      assert_no_selector "table td", text: "Chart cache row 102"
    end
  ensure
    resume_report_requests
  end

  test "SureQL preview paginates its results without replacing the saved source" do
    12.times { |index| create_transaction(format("Preview row %02d", index + 1), Date.current, 808.25) }
    visit dashboards_url
    saved_sources = dashboard_snapshot.fetch("sources")
    set_query("from transactions\nfilter amount == 808.25\nsort {name}\nselect {name, amount, currency}\ntake 11")
    run_preview
    within "#source-editor" do
      assert_selector "table td", text: "Preview row 01"
      assert_no_selector "table td", text: "Preview row 12"
      previous_rows = preview_rows
      pause_report_requests
      click_button "Next"
      assert_preview_loading(previous_rows)
      resume_report_requests
      assert_selector "table td", text: "Preview row 11"
      assert_no_selector "table td", text: "Preview row 12"
      assert_button "Next", disabled: true
      assert_no_selector "table td", text: "Preview row 01"
      select "50", from: "per page"
      assert_selector "table td", text: "Preview row 01"
      assert_selector "table td", text: "Preview row 11"
      assert_no_selector "table td", text: "Preview row 12"
      assert_button "Save source", disabled: false, wait: 10
    end
    previous_rows = preview_rows
    set_query("from secrets")
    within "#source-editor" do
      assert_text stale_preview_text
      pause_report_requests
      click_button "Run", exact: true
      assert_preview_loading(previous_rows)
      resume_report_requests
      assert_selector "[role='alert']", wait: 10
      assert_no_text stale_preview_text
      assert_equal previous_rows, preview_rows
      assert_button "Save source", disabled: true
      click_button "Cancel"
    end
    assert_equal saved_sources, dashboard_snapshot.fetch("sources")
  ensure
    resume_report_requests
  end

  test "structured preview retains rows while paging and suppresses stale warnings during errors" do
    12.times { |index| create_transaction(format("Structured row %02d", index + 1), Date.current, 808.25) }
    accounts(:depository).entries.create!(name: "Preview EUR", date: Date.current, amount: 809.25, currency: "EUR", entryable: Transaction.new)
    visit dashboards_url
    edit_source("Recent transactions")
    within "#source-editor" do
      select "Structured", from: "Source type"
      select "Details", from: "Mode"
      assert_button "Save source", disabled: false, wait: 10
      previous_rows = preview_rows
      pause_report_requests
      click_button "Next"
      assert_preview_loading(previous_rows)
      resume_report_requests
      assert_button "Previous", disabled: false, wait: 10
      assert_no_selector "nav button[aria-busy='true']"
      assert_not_equal previous_rows, preview_rows
      previous_rows = preview_rows
      select "Aggregate", from: "Mode"
      assert_selector "[role='alert']", wait: 10
      assert_no_text stale_preview_text
      assert_equal previous_rows, preview_rows
      assert_button "Save source", disabled: true
      click_button "Cancel"
    end
  ensure
    resume_report_requests
  end

  test "structured sources default to aggregate and switch modes without changing consumer settings" do
    visit dashboards_url
    layout = active_dashboard(dashboard_snapshot).fetch("layout")
    click_button "Create source", match: :first
    assert_source_page "/sources/new"
    within "#source-editor" do
      assert_select "Source type", selected: "Structured"
      assert_select "Mode", selected: "Aggregate"
      fill_in "Source name", with: "Structured transactions"
      select "Details", from: "Mode"
      assert_selector "table td", text: "Dashboard Groceries Test", wait: 10
      click_button "Save source"
    end
    assert_equal layout, active_dashboard(dashboard_snapshot).fetch("layout")
    source = source_named("Structured transactions")
    assert_equal "structured", source.fetch("configuration").fetch("kind")
    assert_equal "detail", source.fetch("configuration").fetch("definition").fetch("mode")
    add_visualization("Table", "Structured transactions")
    assert_selector "section[aria-label='Structured transactions results'] table td", text: "Dashboard Groceries Test"
    table_props = visualization("Table", source.fetch("id")).fetch("props").deep_dup

    edit_source("Structured transactions")
    within "#source-editor" do
      assert_select "Source type", selected: "Structured"
      assert_select "Mode", selected: "Details"
      select "Aggregate", from: "Mode"
      assert_button "Save source", disabled: false, wait: 10
      click_button "Save source"
    end
    assert_equal "aggregate", source_named("Structured transactions").fetch("configuration").fetch("definition").fetch("mode")
    assert_equal table_props, visualization("Table", source.fetch("id")).fetch("props")
    edit_source("Structured transactions")
    within "#source-editor" do
      assert_select "Mode", selected: "Aggregate"
      select "Details", from: "Mode"
      fill_in "Source name", with: "Renamed structured source"
      assert_selector "table td", text: "Dashboard Groceries Test", wait: 10
      click_button "Save source"
    end
    visit dashboards_url
    assert_selector "section[aria-label='Renamed structured source results'] table td", text: "Dashboard Groceries Test"
    assert_equal table_props, visualization("Table", source.fetch("id")).fetch("props")
  end

  test "structured aggregate category exclusions survive saving and editor reload" do
    [ [ categories(:one), 100 ], [ categories(:income), 7 ] ].each do |category, amount|
      accounts(:depository).entries.create!(name: "Category exclusion #{category.name}", date: Date.current, amount: amount, currency: "USD", entryable: Transaction.new(category: category))
    end
    visit dashboards_url
    click_button "Create source", match: :first
    within "#source-editor" do
      fill_in "Source name", with: "Category exclusions"
      click_button "Fields", exact: true
      find("button[aria-label='Add to Filters: Category']").click
      find("button[id$='-filters']").click
      select categories(:one).name, from: "Match value"
      assert_selector "tbody tr", count: 1
      assert_selector "tbody th", text: categories(:one).name, exact_text: true
      all(:select, "Condition").last.select("Not equals")
      assert_no_selector "tbody th", text: categories(:one).name, exact_text: true
      assert_selector "tbody th", text: categories(:income).name, exact_text: true
      assert_selector "tbody th", text: I18n.t("report_definition.uncategorized"), exact_text: true
      assert_button "Save source", disabled: false
      click_button "Save source"
    end
    # "Sources" is no longer a rail entry (nav parity with the Rails
    # sidebar); navigate directly like the other source tests.
    visit sources_url
    edit_source("Category exclusions")
    page.refresh
    within "#source-editor" do
      find("button[id$='-filters']").click
      assert_select "Match value", selected: categories(:one).name
      assert_select "Condition", selected: "Not equals"
      assert_no_selector "tbody th", text: categories(:one).name, exact_text: true
      assert_selector "tbody th", text: categories(:income).name, exact_text: true
      assert_selector "tbody th", text: I18n.t("report_definition.uncategorized"), exact_text: true
      click_button "Cancel"
    end
  end

  test "structured aggregate charts include all row groups beyond the first hundred" do
    account = @user.family.accounts.create!(name: "All aggregate groups", owner: @user, currency: "USD", balance: 0, accountable: Depository.new)
    105.times do |index|
      category = @user.family.categories.create!(name: format("Aggregate group %03d", index + 1))
      account.entries.create!(name: category.name, date: Date.current, amount: index + 1, currency: "USD", entryable: Transaction.new(category: category))
    end
    visit dashboards_url
    click_button "Create source", match: :first
    within "#source-editor" do
      fill_in "Source name", with: "All aggregate groups"
      click_button "Fields", exact: true
      find("button[aria-label='Add to Filters: Account']").click
      find("button[id$='-filters']").click
      select account.name, from: "Match value"
      assert_button "Save source", disabled: false, wait: 10
      click_button "Save source"
    end
    add_visualization("Table", "All aggregate groups")
    assert_selector "section[aria-label='All aggregate groups results'] table tbody tr", count: 10
    add_visualization("Chart", "All aggregate groups")
    assert_selector "ul[aria-label^='All aggregate groups chart'] li", count: 105, visible: :all
    within "ul[aria-label^='All aggregate groups chart'] li", text: "Aggregate group 001", visible: :all do
      assert_selector "span.tabular-nums", text: "1 USD", exact_text: true, visible: :all
    end
  end

  test "structured chart fields include column groups beyond the table limit" do
    account = @user.family.accounts.create!(name: "All chart columns", owner: @user, currency: "USD", balance: 0, accountable: Depository.new)
    today = Date.current
    25.times do |index|
      account.entries.create!(name: "Chart column #{index + 1}", date: today - 24 + index, amount: index + 1, currency: "USD", entryable: Transaction.new(category: categories(:one)))
    end
    visit dashboards_url
    click_button "Create source", match: :first
    within "#source-editor" do
      fill_in "Source name", with: "All chart columns"
      select "Day", from: "Date grouping"
      click_button "Fields", exact: true
      find("button[aria-label='Add to Filters: Account']").click
      find("button[id$='-filters']").click
      select account.name, from: "Match value"
      assert_button "Save source", disabled: false, wait: 10
      click_button "Save source"
    end
    add_visualization("Chart", "All chart columns")
    chart = visualization("Chart", source_named("All chart columns").fetch("id"))
    select_component(chart)
    find_field("Value field").find(:option, text: today.iso8601).select_option
    close_component_settings
    assert_selector "ul[aria-label^='All chart columns chart'] li span.tabular-nums", text: "25 USD", exact_text: true, visible: :all
  end

  test "sources can be created from the catalog without any dashboard" do
    visit dashboards_url
    click_button "Delete dashboard"
    within("#delete-dashboard-dialog") { click_button "Delete dashboard" }
    assert_empty dashboard_snapshot.fetch("dashboards")
    visit "/sources"
    click_on "Create source"
    assert_source_page "/sources/new"
    page.refresh
    assert_source_page "/sources/new"
    within "#source-editor" do
      assert_select "Source type", selected: "Structured"
      assert_select "Mode", selected: "Aggregate"
      fill_in "Source name", with: "Standalone aggregate"
      assert_button "Save source", disabled: false, wait: 10
      click_button "Save source"
    end
    assert_no_selector "#source-editor"
    assert_equal "/sources", URI.parse(page.current_url).path
    assert_text "Standalone aggregate"
    assert_empty dashboard_snapshot.fetch("dashboards")
    source = source_named("Standalone aggregate")
    assert_equal "aggregate", source.fetch("configuration").fetch("definition").fetch("mode")
    page.refresh
    assert_text "Standalone aggregate"
    assert_empty dashboard_snapshot.fetch("dashboards")
  end

  test "the source list edits an unused source and direct editor reload retains its saved configuration" do
    visit "/sources"
    layouts = dashboard_snapshot.fetch("dashboards").deep_dup
    create_source("Unused transactions", "from transactions\nfilter amount == 42.5\nselect {name, amount}")
    source_id = source_named("Unused transactions").fetch("id")
    assert_equal "/sources", URI.parse(page.current_url).path
    edit_source("Unused transactions")
    page.refresh
    assert_source_page "/sources/#{source_id}/edit"
    assert_field "Source name", with: "Unused transactions"
    assert_select "Source type", selected: "SureQL"
    assert_selector ".monaco-editor", wait: 10
    assert_includes page.evaluate_script("window.sureqlEditor.getValue()"), "amount == 42.5"
    set_query("from accounts\ntake 5")
    run_preview
    within("#source-editor") { fill_in "Source name", with: "Unused accounts" }
    save_source
    assert_equal "/sources", URI.parse(page.current_url).path
    assert_text "Unused accounts"
    assert_equal layouts, dashboard_snapshot.fetch("dashboards")
    visit "/sources/#{source_id}/edit"
    assert_source_page "/sources/#{source_id}/edit"
    assert_field "Source name", with: "Unused accounts"
    assert_selector ".monaco-editor", wait: 10
    assert_includes page.evaluate_script("window.sureqlEditor.getValue()"), "from accounts"
    within("#source-editor") { click_button "Cancel" }
    visit dashboards_url
    add_visualization("Table", "Unused accounts")
    assert_selector "section[aria-label='Unused accounts results'] table th", text: /balance/i
  end

  test "source page reload preserves saved block settings and selection on cancel and save" do
    visit dashboards_url
    snapshot = dashboard_snapshot
    dashboard_id = active_dashboard(snapshot).fetch("id")
    alternate_source = source_named("Spending by category (30 days)")
    resize_layout_item("transactions-table", columns: 6, rows: 7)
    select_layout_item("transactions-table")
    select alternate_source.fetch("name"), from: "Source"
    saved = dashboard_snapshot
    within("[data-dashboard-component-panel]") { click_button "Create source" }
    assert_source_page "/sources/new"
    page.refresh
    within("#source-editor") { click_button "Cancel" }
    assert_equal dashboard_id, dashboard_id_from_url
    assert_equal "transactions-table", Rack::Utils.parse_nested_query(URI.parse(page.current_url).query).fetch("component")
    assert_select "Source", selected: alternate_source.fetch("name")
    assert_equal saved, dashboard_snapshot
    assert_equal 6, component_by_id("transactions-table").fetch("position").fetch("w")
    assert_equal 7, component_by_id("transactions-table").fetch("position").fetch("h")

    within("[data-dashboard-component-panel]") { click_button "Create source" }
    assert_source_page "/sources/new"
    page.refresh
    fill_source("Reloaded accounts", "from accounts\ntake 5")
    run_preview
    save_source
    assert_select "Source", selected: "Reloaded accounts"
    expected = component_by_id("transactions-table")
    assert_equal({ "x" => 0, "y" => 0, "w" => 6, "h" => 7 }, expected.fetch("position"))
    assert_equal source_named("Reloaded accounts").fetch("id"), expected.fetch("props").fetch("sourceId")
    assert_equal snapshot.fetch("sources").length + 1, dashboard_snapshot.fetch("sources").length
    page.refresh
    assert_select "Source", selected: "Reloaded accounts"
    assert_selector "section[aria-label='Reloaded accounts results'] table th", text: /balance/i
    assert_equal expected, component_by_id("transactions-table")
  end

  test "shared sources update every consumer while visualization settings and source lifetime stay independent" do
    create_transaction("Dashboard Utilities Test", Date.current, 71.25)
    visit dashboards_url
    create_source("Shared transactions", "from transactions\nfilter amount == 42.5\nselect {name, amount, currency}")
    shared_id = source_named("Shared transactions").fetch("id")
    add_visualization("Table", "Shared transactions")
    table = visualization("Table", shared_id)
    select_component(table)
    uncheck "Show all columns"
    uncheck "amount"
    uncheck "currency"
    close_component_settings
    within "section[aria-label='Shared transactions results']" do
      assert_selector "table td", text: "Dashboard Groceries Test"
      assert_no_selector "table th", text: /amount/i
    end
    first_dashboard_id = active_dashboard(dashboard_snapshot).fetch("id")

    create_dashboard("Shared charts")
    add_visualization("Chart", "Shared transactions")
    chart = visualization("Chart", shared_id)
    select_component(chart)
    select "Bar", from: "Chart type"
    select "name", from: "Category field"
    select "amount", from: "Value field"
    close_component_settings
    assert_selector "[role='img'][aria-label^='Shared transactions chart']", wait: 10
    assert_text "Dashboard Groceries Test"
    second_dashboard_id = active_dashboard(dashboard_snapshot).fetch("id")
    chart_props = visualization("Chart", shared_id).fetch("props").deep_dup
    table_props = visualization("Table", shared_id, dashboard_id: first_dashboard_id).fetch("props").deep_dup
    assert_equal [ "name" ], table_props.fetch("visibleColumns")
    assert_equal "bar", chart_props.fetch("chartType")
    assert_equal "name", chart_props.fetch("categoryField")
    assert_equal "amount", chart_props.fetch("valueField")

    set_query("from transactions\nfilter amount == 71.25\nselect {name, amount, currency}", source_name: "Shared transactions")
    run_preview
    save_source
    assert_text "Dashboard Utilities Test"
    assert_no_text "Dashboard Groceries Test"
    visit "#{dashboards_url}?dashboard=#{first_dashboard_id}"
    within "section[aria-label='Shared transactions results']" do
      assert_selector "table td", text: "Dashboard Utilities Test"
      assert_no_selector "table td", text: "Dashboard Groceries Test"
      assert_no_selector "table th", text: /amount/i
    end
    assert_equal table_props, visualization("Table", shared_id).fetch("props")
    visit "#{dashboards_url}?dashboard=#{second_dashboard_id}"
    assert_selector "[role='img'][aria-label^='Shared transactions chart']", wait: 10
    assert_text "Dashboard Utilities Test"
    assert_equal chart_props, visualization("Chart", shared_id).fetch("props")

    sources = dashboard_snapshot.fetch("sources")
    select_component(visualization("Chart", shared_id))
    within("[data-dashboard-component-panel]") { click_button "Delete component" }
    assert_equal sources, dashboard_snapshot.fetch("sources")
    click_button "Delete dashboard"
    within("#delete-dashboard-dialog") { click_button "Delete dashboard" }
    assert_equal sources, dashboard_snapshot.fetch("sources")
    visit "#{dashboards_url}?dashboard=#{first_dashboard_id}"
    assert_selector "section[aria-label='Shared transactions results'] table td", text: "Dashboard Utilities Test"
  end

  test "component source fields return from source pages with new choices and preserve canceled choices" do
    visit dashboards_url
    snapshot = dashboard_snapshot
    source_id = source_named("Recent transactions").fetch("id")
    table = visualization("Table", source_id)
    chart = visualization("Chart", source_named("Spending by category (30 days)").fetch("id"))
    select_component(table)
    within("[data-dashboard-component-panel]") { click_button "Create source" }
    assert_source_page "/sources/new"
    within "#source-editor" do
      fill_in "Source name", with: "Canceled source"
      click_button "Cancel"
    end
    assert_select "Source", selected: "Recent transactions"
    close_component_settings
    assert_equal snapshot, dashboard_snapshot

    select_component(table)
    within("[data-dashboard-component-panel]") { click_button "Create source" }
    fill_source("Created accounts", "from accounts\ntake 5")
    run_preview
    save_source
    assert_select "Source", selected: "Created accounts"
    close_component_settings
    assert_selector "section[aria-label='Created accounts results'] table th", text: /balance/i
    created_id = source_named("Created accounts").fetch("id")
    assert_equal created_id, component_by_id(table.fetch("props").fetch("id")).fetch("props").fetch("sourceId")

    select_component(chart)
    select "Recent transactions", from: "Source"
    assert_select "Source", selected: "Recent transactions"
    within("[data-dashboard-component-panel]") { click_button "Create source" }
    fill_source("Created chart transactions", "from transactions\nselect {name, amount, currency}")
    run_preview
    save_source
    assert_select "Source", selected: "Created chart transactions"
    close_component_settings
    visit dashboards_url
    assert_equal source_named("Created chart transactions").fetch("id"), component_by_id(chart.fetch("props").fetch("id")).fetch("props").fetch("sourceId")
    assert_selector "section[aria-label='Created accounts results'] table th", text: /balance/i
  end

  test "a table added from the side panel selects a shared source through its settings" do
    visit dashboards_url
    existing_ids = components(active_dashboard(dashboard_snapshot).fetch("layout")).map { |item| item.fetch("props").fetch("id") }
    click_button "Add component"
    within("[data-dashboard-component-panel]") { click_button "Add table" }
    select "Recent transactions", from: "Source"
    close_component_settings
    added = components(active_dashboard(dashboard_snapshot).fetch("layout")).find { |item| !existing_ids.include?(item.fetch("props").fetch("id")) }
    assert_equal "Table", added.fetch("type")
    assert_equal source_named("Recent transactions").fetch("id"), added.fetch("props").fetch("sourceId")
    visit dashboards_url
    assert_selector "section[aria-label='Recent transactions results'] table td", text: "Dashboard Groceries Test", count: 2
  end

  test "corner sizing saves immediately without resetting component settings" do
    original_window_size = page.current_window.size
    page.current_window.resize_to(1600, 1600)
    visit dashboards_url
    original = component_by_id("transactions-table").fetch("props")
    sources = dashboard_snapshot.fetch("sources")
    [ 20, 1, 20 ].each do |rows|
      resize_layout_item("transactions-table", columns: 6, rows: rows)
      assert_equal 6, component_by_id("transactions-table").fetch("position").fetch("w")
      assert_equal rows, component_by_id("transactions-table").fetch("position").fetch("h")
      page.refresh
      assert_equal 6, component_by_id("transactions-table").fetch("position").fetch("w")
      assert_equal rows, component_by_id("transactions-table").fetch("position").fetch("h")
      assert_equal original, component_by_id("transactions-table").fetch("props")
      assert_equal sources, dashboard_snapshot.fetch("sources")
    end
  ensure
    page.current_window.resize_to(*original_window_size)
  end

  test "constrained tables scroll rows while keeping the header and pagination visible" do
    12.times { |index| create_transaction(format("Sticky table row %02d", index), Date.current, 816.25) }
    visit dashboards_url
    set_query("from transactions\nfilter amount == 816.25\nsort {name}\nselect {name, amount}\ntake 12")
    run_preview
    save_source
    close_component_settings
    resize_layout_item("transactions-table", columns: 12, rows: 7)
    card = find("[data-dashboard-grid-item='transactions-table']")
    assert_selector "[data-dashboard-grid-item='transactions-table'] table tbody tr", count: 10
    region = card.find("section[aria-label='Recent transactions table']")
    header = region.find("thead")
    first_row = region.find("tbody tr", match: :first)
    pager = card.find("nav")
    header_top = header.evaluate_script("this.getBoundingClientRect().top")
    row_top = first_row.evaluate_script("this.getBoundingClientRect().top")
    pager_top = pager.evaluate_script("this.getBoundingClientRect().top")
    region.execute_script("this.scrollTop = 120")
    assert_operator first_row.evaluate_script("this.getBoundingClientRect().top"), :<, row_top - 100
    assert_in_delta header_top, header.evaluate_script("this.getBoundingClientRect().top"), 1
    assert_in_delta pager_top, pager.evaluate_script("this.getBoundingClientRect().top"), 1
    within(card) { click_button "Next" }
    assert_selector "[data-dashboard-grid-item='transactions-table'] table td", text: "Sticky table row 10"
    assert_selector "[data-dashboard-grid-item='transactions-table'] table tbody tr", count: 2
  end

  test "hover movement persists without opening settings or resetting component settings" do
    visit dashboards_url
    snapshot = dashboard_snapshot
    content = active_dashboard(snapshot).fetch("layout").fetch("content")
    table = content.find { |item| item.fetch("type") == "Table" }
    table.fetch("position")["w"] = 6
    table.fetch("props")["visibleColumns"] = [ "name" ]
    chart = content.find { |item| item.fetch("type") == "Chart" }
    chart.fetch("position").merge!("x" => 6, "y" => 0)
    write_snapshot(snapshot)
    page.refresh

    card = find("[data-dashboard-grid-item='transactions-table']")
    card.hover
    card.find("[data-dashboard-drag-handle]").send_keys(:right)
    assert_no_selector "[data-dashboard-component-panel]"
    page.refresh

    assert_equal 1, component_by_id("transactions-table").fetch("position").fetch("x")
    assert_equal table.fetch("props"), component_by_id("transactions-table").fetch("props")
    assert_equal snapshot.fetch("sources"), dashboard_snapshot.fetch("sources")
  end

  test "auto height follows intrinsic content and persists across reloads" do
    original_window_size = page.current_window.size
    page.current_window.resize_to(1600, 1600)
    visit dashboards_url
    snapshot = dashboard_snapshot
    active_dashboard(snapshot).fetch("layout")["content"] = [ {
      "type" => "RichText", "props" => { "id" => "intrinsic-notes", "content" => "Short notes." },
      "position" => { "x" => 0, "y" => 0, "w" => 12, "h" => 20 }, "heightMode" => "fixed"
    } ]
    write_snapshot(snapshot)
    page.refresh
    assert_selector "[data-dashboard-richtext='intrinsic-notes']", text: "Short notes."
    fixed_height = grid_item_height("intrinsic-notes")

    select_layout_item("intrinsic-notes")
    find("[role='switch'][aria-label='Auto height']").click
    close_component_settings
    page.refresh
    assert_selector "[data-dashboard-richtext='intrinsic-notes']", text: "Short notes."
    short_height = grid_item_height("intrinsic-notes")
    assert_operator short_height, :<, fixed_height
    assert_equal "auto", component_by_id("intrinsic-notes").fetch("heightMode")

    expanded = dashboard_snapshot
    notes = components(active_dashboard(expanded).fetch("layout")).find { |item| item.fetch("props").fetch("id") == "intrinsic-notes" }
    notes.fetch("props")["content"] = 16.times.map { |index| "Extra paragraph #{index + 1}." }.join("\n\n")
    write_snapshot(expanded)
    page.refresh
    assert_selector "[data-dashboard-richtext='intrinsic-notes']", text: "Extra paragraph 16."
    expanded_height = grid_item_height("intrinsic-notes")
    assert_operator expanded_height, :>, short_height + 240

    select_layout_item("intrinsic-notes")
    find("[role='switch'][aria-label='Auto height']").click
    close_component_settings
    assert_equal 20, component_by_id("intrinsic-notes").fetch("position").fetch("h")
    resize_layout_item("intrinsic-notes", columns: 12, rows: 1)
    page.refresh
    assert_equal "fixed", component_by_id("intrinsic-notes").fetch("heightMode")
    assert_equal 1, component_by_id("intrinsic-notes").fetch("position").fetch("h")
    assert_operator grid_item_height("intrinsic-notes"), :<, expanded_height
  ensure
    page.current_window.resize_to(*original_window_size)
  end

  test "auto-height corner resizing changes width without stretching content height" do
    visit dashboards_url
    snapshot = dashboard_snapshot
    active_dashboard(snapshot).fetch("layout")["content"] = [ {
      "type" => "RichText", "props" => { "id" => "auto-notes", "content" => "Short notes." },
      "position" => { "x" => 0, "y" => 0, "w" => 8, "h" => 4 }, "heightMode" => "auto"
    } ]
    write_snapshot(snapshot)
    page.refresh
    assert_selector "[data-dashboard-richtext='auto-notes']", text: "Short notes."
    wait_for_grid_item("auto-notes")
    height = grid_item_height("auto-notes")
    resize_layout_item("auto-notes", columns: 6, vertical_delta: 176)
    assert_equal 6, component_by_id("auto-notes").fetch("position").fetch("w")
    assert_equal "auto", component_by_id("auto-notes").fetch("heightMode")
    wait_for_grid_item("auto-notes")
    assert_in_delta height, grid_item_height("auto-notes"), 1
    page.refresh
    assert_equal 6, component_by_id("auto-notes").fetch("position").fetch("w")
    wait_for_grid_item("auto-notes")
    assert_in_delta height, grid_item_height("auto-notes"), 1
  end

  test "root rich text persists without visualizations and survives adding a table" do
    visit dashboards_url
    snapshot = dashboard_snapshot
    layout = active_dashboard(snapshot).fetch("layout")
    layout["content"] = [ { "type" => "RichText", "props" => { "id" => "notes-editor", "content" => "" }, "position" => { "x" => 0, "y" => 0, "w" => 12, "h" => 4 }, "heightMode" => "fixed" } ]
    write_snapshot(snapshot)
    visit dashboards_url
    select_layout_item("notes-editor")
    editor = find("[data-dashboard-richtext='notes-editor'] .cm-content[contenteditable='true']")
    editor.click
    editor.send_keys("Dashboard notes saved without visualizations.")
    close_component_settings
    visit dashboards_url
    assert_selector "[data-dashboard-richtext]", text: "Dashboard notes saved without visualizations."
    add_visualization("Table", "Recent transactions")
    visit dashboards_url
    assert_selector "[data-dashboard-richtext]", text: "Dashboard notes saved without visualizations."
    assert_selector "table td", text: "Dashboard Groceries Test"
  end

  test "rich text resolves source paths across formatting without treating values as HTML" do
    name = 'Source value <img src=x onerror="window.richTextInjected=true">'
    create_transaction(name, Date.current, 813.25)
    template = 'Purchase: **{result[0].na**_me}_ / {result[0]["amount"]} / {result[0].zero} / {result[0].flag} / [{result[0].notes}] / {result[0].missing} / {result[0].__proto__}.'
    source = install_rich_text_source("from transactions\nfilter amount == 813.25\nderive {zero = 0, flag = false}\ntake 1", template, linked: false)
    assert_selector "[data-dashboard-richtext]", text: "{result[0].name}"

    select_layout_item("source-notes")
    find("[data-dashboard-richtext='source-notes'] .cm-content[contenteditable='true']").click
    within("[data-dashboard-component-panel]") { select source.fetch("name"), from: "Source" }
    within "[data-richtext-preview]" do
      assert_selector "strong", text: name
      assert_text "813.25 / 0 / false / [] / {result[0].missing} / {result[0].__proto__}."
      assert_no_selector "img, script"
    end
    close_component_settings
    page.refresh
    within "[data-dashboard-richtext='source-notes']" do
      assert_selector "strong", text: name
      assert_no_selector "img, script"
    end
    assert_nil page.evaluate_script("window.richTextInjected")
    props = component_by_id("source-notes").fetch("props")
    assert_equal source.fetch("id"), props.fetch("sourceId")
    assert_includes props.fetch("content"), "{result[0].missing}"
    assert_not_includes props.fetch("content"), name
  end

  test "rich text autocomplete saves expressions and replaces an existing variable suffix" do
    install_rich_text_source(%(from transactions\nfilter name == "Dashboard Groceries Test"\ntake 1), "")
    select_layout_item("source-notes")
    editor = find("[data-dashboard-richtext='source-notes'] .cm-content[contenteditable='true']")
    editor.click
    editor.send_keys("Latest {result[0].na")
    assert_selector "[role='option']", text: "{result[0].name}"
    editor.send_keys(:enter)
    assert_equal "Latest {result[0].name}", editor.text
    within("[data-richtext-preview]") { assert_text "Latest Dashboard Groceries Test" }
    close_component_settings
    page.refresh
    assert_selector "[data-dashboard-richtext='source-notes']", text: "Latest Dashboard Groceries Test"
    assert_includes component_by_id("source-notes").fetch("props").fetch("content"), "{result[0].name}"

    select_layout_item("source-notes")
    editor = find("[data-dashboard-richtext='source-notes'] .cm-content[contenteditable='true']")
    editor.click
    editor.send_keys(:end, :left, :left, :left)
    assert_selector "[role='option']", text: "{result[0].name}"
    editor.send_keys(:tab)
    assert_equal "Latest {result[0].name}", editor.text
    close_component_settings
  end

  test "a source created from rich text attaches to its block and shared edits update the value" do
    query = %(from transactions\nfilter name == "Dashboard Groceries Test"\ntake 1)
    source = install_rich_text_source(query, "Amount: {result[0].amount}", linked: false)
    snapshot = dashboard_snapshot
    content = active_dashboard(snapshot).fetch("layout").fetch("content")
    content.first.fetch("position")["y"] = 3
    content.unshift({
      "type" => "Table",
      "props" => { "id" => "other-table", "sourceId" => source.fetch("id"), "visibleColumns" => [] },
      "position" => { "x" => 0, "y" => 0, "w" => 6, "h" => 3 }, "heightMode" => "fixed"
    })
    write_snapshot(snapshot)
    page.refresh
    select_layout_item("source-notes")
    find("[data-dashboard-richtext='source-notes'] .cm-content[contenteditable='true']").click
    create_source("Notes amount", query)
    assert_field "Source", with: source_named("Notes amount").fetch("id")
    within("[data-richtext-preview]") { assert_text "Amount: 42.5" }
    click_button "Edit source"
    set_query(query.sub("take 1", "derive {amount = 99}\ntake 1"))
    run_preview
    save_source
    assert_field "Source", with: source_named("Notes amount").fetch("id")
    within("[data-richtext-preview]") { assert_text "Amount: 99" }
    close_component_settings
    page.refresh
    assert_selector "[data-dashboard-richtext='source-notes']", text: "Amount: 99"
    assert_equal source_named("Notes amount").fetch("id"), component_by_id("source-notes").fetch("props").fetch("sourceId")
    assert_equal "Amount: {result[0].amount}", component_by_id("source-notes").fetch("props").fetch("content")
  end

  test "rich text can address source rows beyond a table's first page" do
    51.times { |index| create_transaction(format("Rich text row %02d", index + 1), Date.current, 814.25) }
    install_rich_text_source("from transactions\nfilter amount == 814.25\nsort {name}\ntake 51", "Last: {result[50].name}; count: {result.length}")
    assert_selector "[data-dashboard-richtext='source-notes']", text: "Last: Rich text row 51; count: 51"
  end

  test "clearing a rich text source preserves its template and can be rebound after reload" do
    source = install_rich_text_source(%(from transactions\nfilter name == "Dashboard Groceries Test"\ntake 1), "Latest: {result[0].name}")
    assert_selector "[data-dashboard-richtext='source-notes']", text: "Latest: Dashboard Groceries Test"
    sources = dashboard_snapshot.fetch("sources")
    select_layout_item("source-notes")
    find("[data-dashboard-richtext='source-notes'] .cm-content[contenteditable='true']").click
    select I18n.t("report_builder.choose_source"), from: "Source"
    close_component_settings
    visit dashboards_url
    assert_selector "[data-dashboard-richtext='source-notes']", text: "Latest: {result[0].name}"
    refute component_by_id("source-notes").fetch("props").key?("sourceId")
    assert_equal sources, dashboard_snapshot.fetch("sources")

    select_layout_item("source-notes")
    find("[data-dashboard-richtext='source-notes'] .cm-content[contenteditable='true']").click
    select source.fetch("name"), from: "Source"
    close_component_settings
    visit dashboards_url
    assert_selector "[data-dashboard-richtext='source-notes']", text: "Latest: Dashboard Groceries Test"
    assert_equal source.fetch("id"), component_by_id("source-notes").fetch("props").fetch("sourceId")
  end

  test "rich text uses each aggregate row currency" do
    account = @user.family.accounts.create!(name: "Rich text currencies", owner: @user, currency: "USD", balance: 0, accountable: Depository.new)
    { "EUR" => 12.34, "JPY" => 100, "USD" => -58 }.each do |currency, amount|
      account.entries.create!(name: "Source currency", date: Date.current, amount: amount, currency: currency, entryable: Transaction.new)
    end
    definition = {
      version: 1, source: "transactions", mode: "aggregate",
      rows: [ { id: "row_currency", field: "currency" } ], columns: [],
      values: [ { id: "total", field: "amount", aggregation: "sum" } ],
      filters: [ { field: "account", operator: "equals", value: account.id } ], sort: []
    }
    install_rich_text_source(definition, "EUR {result[0].total}; JPY {result[1].total}; USD {result[2].total}")
    assert_selector "[data-dashboard-richtext='source-notes']", text: "EUR €12.34; JPY ¥100; USD -$58.00"
  end

  test "deleting a visualization preserves sibling rich text and its source" do
    visit dashboards_url
    snapshot = dashboard_snapshot
    table = visualization("Table", source_named("Recent transactions").fetch("id"))
    active_dashboard(snapshot).fetch("layout").fetch("content") << {
      "type" => "RichText", "props" => { "id" => "dashboard-notes", "content" => "Keep these **dashboard notes**." },
      "position" => { "x" => 0, "y" => 9, "w" => 12, "h" => 3 }, "heightMode" => "fixed"
    }
    write_snapshot(snapshot)
    visit dashboards_url
    select_component(table)
    within("[data-dashboard-component-panel]") { click_button "Delete component" }
    visit dashboards_url
    assert_selector "[data-dashboard-richtext] strong", text: "dashboard notes"
    assert_nil components(active_dashboard(dashboard_snapshot).fetch("layout")).find { |block| block.fetch("props").fetch("id") == table.fetch("props").fetch("id") }
    assert_equal snapshot.fetch("sources"), dashboard_snapshot.fetch("sources")
  end

  test "dashboards have independent layouts and retain sources after the final dashboard is deleted" do
    visit dashboards_url
    sources = dashboard_snapshot.fetch("sources")
    create_dashboard("Money review")
    second_id = active_dashboard(dashboard_snapshot).fetch("id")
    add_visualization("Table", "Recent transactions")
    select_dashboard("My dashboard")
    assert_equal 2, components(active_dashboard(dashboard_snapshot).fetch("layout")).count { |item| [ "Table", "Chart" ].include?(item.fetch("type")) }
    select_dashboard("Money review")
    assert_equal second_id, dashboard_id_from_url
    click_button "Rename dashboard"
    fill_in "dashboard-name", with: "Weekly money"
    click_button "Save dashboard name"
    visit "#{dashboards_url}?dashboard=#{second_id}"
    assert_selected_dashboard("Weekly money")
    2.times do
      click_button "Delete dashboard"
      within("#delete-dashboard-dialog") { click_button "Delete dashboard" }
    end
    assert_equal [], dashboard_snapshot.fetch("dashboards")
    assert_equal sources, dashboard_snapshot.fetch("sources")
    visit dashboards_url
    assert_equal [], dashboard_snapshot.fetch("dashboards")
    create_dashboard("Fresh start")
    add_visualization("Table", "Recent transactions")
    assert_selector "table td", text: "Dashboard Groceries Test"
  end

  test "older snapshots reset to a usable starter without migrating saved content" do
    visit dashboards_url
    snapshot = dashboard_snapshot
    snapshot["formatVersion"] = 6
    snapshot.fetch("dashboards").first["name"] = "Old dashboard"
    previous_source_ids = snapshot.fetch("sources").map { |source| source.fetch("id") }
    write_snapshot(snapshot)
    visit dashboards_url
    assert_selected_dashboard("My dashboard")
    assert_selector "table td", text: "Dashboard Groceries Test"
    assert_empty previous_source_ids & dashboard_snapshot.fetch("sources").map { |source| source.fetch("id") }
  end

  test "malformed snapshots reset to a usable starter" do
    visit dashboards_url
    write_snapshot("{not-json")
    visit dashboards_url
    assert_selector "table td", text: "Dashboard Groceries Test"
    assert_equal 2, dashboard_snapshot.fetch("sources").length
  end

  test "persisted sources are scoped to the signed in browser user" do
    visit dashboards_url
    set_query("from accounts\ntake 5")
    run_preview
    save_source
    assert_selector "table th", text: /classification/i
    find("button[aria-label='Open account menu']", match: :first, visible: :visible).click
    click_button "Log out", match: :first
    sign_in users(:family_member)
    visit dashboards_url
    assert_saved_query("from transactions")
  end

  test "confirmed starter reset replaces dashboards sources and saved layouts" do
    visit dashboards_url
    original_position = component_by_id("transactions-table").fetch("position")
    create_source("Custom accounts", "from accounts\ntake 5")
    set_query("from accounts\ntake 5")
    run_preview
    save_source
    resize_layout_item("transactions-table", columns: original_position.fetch("w"), rows: 7)
    visit dashboards_url
    create_dashboard("Custom dashboard")
    before_reset = dashboard_snapshot

    click_button "Reset starter dashboard"
    within("#reset-starter-dialog") { click_button "Cancel" }
    assert_equal before_reset, dashboard_snapshot

    click_button "Reset starter dashboard"
    within("#reset-starter-dialog") { click_button "Reset dashboards and sources" }
    assert_selector "table td", text: "Dashboard Groceries Test"
    reset = dashboard_snapshot
    assert_equal [ "My dashboard" ], reset.fetch("dashboards").map { |dashboard| dashboard.fetch("name") }
    assert_equal [ "Recent transactions", "Spending by category (30 days)" ], reset.fetch("sources").map { |source| source.fetch("name") }
    source_ids = reset.fetch("sources").map { |source| source.fetch("id") }
    assert_empty source_ids & before_reset.fetch("sources").map { |source| source.fetch("id") }
    references = components(active_dashboard(reset).fetch("layout")).filter_map { |item| item.fetch("props")["sourceId"] }
    assert_equal source_ids.sort, references.sort
    page.refresh
    assert_selector "table td", text: "Dashboard Groceries Test"
    assert_equal reset, dashboard_snapshot
    assert_equal original_position, component_by_id("transactions-table").fetch("position")
    assert_saved_query("from transactions")
    visit "/sources"
    assert_no_text "Custom accounts"
  end

  private
    def install_rich_text_source(query, template, linked: true)
      visit dashboards_url
      snapshot = dashboard_snapshot
      source = snapshot.fetch("sources").first
      source["configuration"] = query.is_a?(Hash) ? { "kind" => "structured", "definition" => query } : { "kind" => "sureql", "query" => query }
      layout = active_dashboard(snapshot).fetch("layout")
      layout["content"] = [ {
        "type" => "RichText",
        "props" => { "id" => "source-notes", "content" => template, **(linked ? { "sourceId" => source.fetch("id") } : {}) },
        "position" => { "x" => 0, "y" => 0, "w" => 12, "h" => 5 }, "heightMode" => "fixed"
      } ]
      write_snapshot(snapshot)
      visit dashboards_url
      source
    end

    def preview_rows
      page.evaluate_script("Array.from(document.querySelectorAll('#source-editor tbody tr'), row => row.textContent)")
    end

    def stale_preview_text
      page.evaluate_script("JSON.parse(document.querySelector('#spa-bootstrap').textContent).reportBuilderText.stale_preview")
    end

    def pause_report_requests(offset: nil)
      page.execute_script(<<~JS, offset)
        window.pauseReportRequests = true;
        window.pauseReportOffset = arguments[0];
        if (!window.reportRequestsFetch) {
          window.reportRequestsFetch = window.fetch;
          window.reportRequestResumes = [];
          window.fetch = async (...args) => {
            if (window.pauseReportRequests && String(args[0]).includes("/dashboard/monarch/run") && typeof args[1]?.body === "string") {
              const payload = JSON.parse(args[1].body);
              if ((payload.source !== undefined || payload.report !== undefined) && (window.pauseReportOffset === null || payload.pagination?.offset === window.pauseReportOffset)) {
                await new Promise(resolve => window.reportRequestResumes.push(resolve));
              }
            }
            return window.reportRequestsFetch(...args);
          };
        }
      JS
    end

    def resume_report_requests
      page.execute_script <<~JS
        window.pauseReportRequests = false;
        for (const resume of window.reportRequestResumes?.splice(0) ?? []) resume();
      JS
    end

    def assert_preview_loading(previous_rows)
      assert_button "Next", disabled: true
      assert_button "Previous", disabled: true
      assert_selector "nav button[aria-busy='true'] .animate-spin", count: 2
      assert_selector "section[aria-busy='true'] table"
      assert_equal previous_rows, preview_rows
      assert_no_text stale_preview_text
    end

    def assert_source_page(path)
      assert_selector "#source-editor"
      assert_equal path, URI.parse(page.current_url).path
    end

    def edit_source(name)
      source = source_named(name)
      if page.has_selector?("[data-dashboard-layout]", wait: 0)
        item = components(active_dashboard(dashboard_snapshot).fetch("layout")).find { |component| component.fetch("props")["sourceId"] == source.fetch("id") }
        select_component(item)
        within("[data-dashboard-component-panel]") { click_button "Edit source" }
      else
        find("[aria-label='Edit source #{name}']", match: :first).click
      end
      assert_source_page "/sources/#{source.fetch('id')}/edit"
    end

    def set_query(query, source_name: "Recent transactions")
      edit_source(source_name) unless page.has_selector?("#source-editor", wait: 0)
      assert_selector ".monaco-editor", wait: 10
      page.execute_script("window.sureqlEditor.setValue(arguments[0])", query)
    end

    def fill_source(name, query)
      within "#source-editor" do
        select "SureQL", from: "Source type"
        fill_in "Source name", with: name
      end
      set_query(query)
    end

    def create_source(name, query)
      if page.has_selector?("[data-dashboard-component-panel]", wait: 0)
        within("[data-dashboard-component-panel]") { click_on "Create source" }
      else
        click_on "Create source", match: :first
      end
      assert_source_page "/sources/new"
      fill_source(name, query)
      run_preview
      save_source
    end

    def run_preview
      within "#source-editor" do
        click_button "Run", exact: true
        assert_button "Save source", disabled: false, wait: 10
      end
    end

    def save_source
      within("#source-editor") { click_button "Save source" }
      assert_no_selector "#source-editor"
    end

    def assert_saved_query(query, source_name: "Recent transactions")
      edit_source(source_name)
      assert_selector ".monaco-editor", wait: 10
      assert_includes page.evaluate_script("window.sureqlEditor.getValue()"), query
      within("#source-editor") { click_button "Cancel" }
      assert_no_selector "#source-editor"
    end

    def add_visualization(type, name)
      click_button "Add component"
      within("[data-dashboard-component-panel]") { click_button "Add #{type.downcase}" }
      within("[data-dashboard-component-panel]") { select name, from: "Source" }
      close_component_settings
    end

    def source_named(name)
      snapshot = dashboard_snapshot
      dashboard = active_dashboard(snapshot)
      source_ids = dashboard ? components(dashboard.fetch("layout")).filter_map { |item| item.fetch("props")["sourceId"] } : []
      matches = snapshot.fetch("sources").select { |source| source.fetch("name") == name }
      matches.find { |source| source_ids.include?(source.fetch("id")) } || matches.first || flunk("Missing source #{name}")
    end

    def dashboard_snapshot
      snapshot = page.evaluate_script(<<~JS)
        (() => {
          const bootstrap = JSON.parse(document.querySelector("#spa-bootstrap").textContent);
          return JSON.parse(window.localStorage.getItem(`sure:dashboards:${bootstrap.currentUser.id}`));
        })()
      JS
      snapshot
    end

    def write_snapshot(snapshot)
      page.execute_script(<<~JS, snapshot.is_a?(String) ? snapshot : snapshot.to_json)
        const bootstrap = JSON.parse(document.querySelector("#spa-bootstrap").textContent);
        window.localStorage.setItem(`sure:dashboards:${bootstrap.currentUser.id}`, arguments[0]);
      JS
    end

    def grid_item_height(id)
      find("[data-dashboard-grid-item='#{id}']").evaluate_script("this.getBoundingClientRect().height")
    end

    def components(layout)
      layout.fetch("content")
    end

    def visualization(type, source_id, dashboard_id: nil)
      snapshot = dashboard_snapshot
      dashboard = dashboard_id ? snapshot.fetch("dashboards").find { |item| item.fetch("id") == dashboard_id } : active_dashboard(snapshot)
      components(dashboard.fetch("layout")).find { |item| item.fetch("type") == type && item.fetch("props")["sourceId"] == source_id } || flunk("Missing #{type} for #{source_id}")
    end

    def component_by_id(id)
      components(active_dashboard(dashboard_snapshot).fetch("layout")).find { |item| item.fetch("props").fetch("id") == id } || flunk("Missing component #{id}")
    end

    def resize_layout_item(id, columns:, rows: nil, vertical_delta: 0)
      close_component_settings if page.has_selector?("[data-dashboard-component-panel]", wait: 0)
      card = find("[data-dashboard-grid-item='#{id}']").find(:xpath, "..")
      card.hover
      wait_for_grid_item(id)
      board_width = find("[data-dashboard-board]").evaluate_script("this.getBoundingClientRect().width")
      target_width = (board_width + 16) * columns / 16 - 16
      delta = (target_width - card.evaluate_script("this.getBoundingClientRect().width")).round
      delta_y = rows ? (rows * 48 - 16 - grid_item_height(id)).round : vertical_delta
      handle = card.find(".react-resizable-handle-se")
      page.driver.browser.action.move_to(handle.native).click_and_hold.move_by(delta, delta_y).release.perform
    end

    def wait_for_grid_item(id)
      page.document.synchronize do
        settled = find("[data-dashboard-grid-item='#{id}']").evaluate_script(<<~JS)
          (() => {
            const item = this.parentElement;
            const rect = item.getBoundingClientRect();
            const content = this.querySelector("[data-dashboard-auto-height]");
            const naturalHeight = content?.getBoundingClientRect().height;
            return Math.abs(rect.width - parseFloat(item.style.width)) < 0.1 &&
              Math.abs(rect.height - parseFloat(item.style.height)) < 0.1 &&
              (naturalHeight === undefined || (rect.height >= naturalHeight && rect.height - naturalHeight < 48));
          })()
        JS
        raise Capybara::ElementNotFound, "Waiting for grid sizing to settle" unless settled
      end
    end

    def select_layout_item(id)
      card = find("[data-dashboard-grid-item='#{id}']")
      card.hover
      card.find("[data-dashboard-edit-item]").click
      assert_selector "[data-dashboard-component-panel]"
    end

    def select_component(component)
      select_layout_item(component.fetch("props").fetch("id"))
    end

    def close_component_settings
      within("[data-dashboard-component-panel]") { click_button "Close" }
      assert_no_selector "[data-dashboard-component-panel]"
    end

    def create_dashboard(name)
      click_button "New dashboard"
      fill_in "dashboard-name", with: name
      click_button "Save dashboard name"
      assert_selected_dashboard(name)
    end

    def assert_selected_dashboard(name)
      assert_selector "#dashboard-switcher", text: name
    end

    def select_dashboard(name)
      find("#dashboard-switcher").click
      fill_in "Search dashboards", with: name
      click_button name, exact: true
    end

    def active_dashboard(snapshot)
      snapshot.fetch("dashboards").find { |dashboard| dashboard.fetch("id") == dashboard_id_from_url } || snapshot.fetch("dashboards").first
    end

    def dashboard_id_from_url
      Rack::Utils.parse_nested_query(page.current_url.split("?", 2).last.to_s)["dashboard"]
    end

    def create_transaction(name, date, amount)
      accounts(:depository).entries.create!(name: name, date: date, amount: amount, currency: "USD", entryable: Transaction.new)
    end
end
