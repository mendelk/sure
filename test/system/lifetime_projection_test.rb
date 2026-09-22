require "application_system_test_case"

class LifetimeProjectionTest < ApplicationSystemTestCase
  setup do
    sign_in @user = users(:family_admin)
  end

  test "renders lifetime projection with labelled inputs and default assumptions" do
    visit lifetime_projection_url

    assert_selector "h1", text: "Lifetime projection"
    assert_selector "span", text: "Preview"
    assert_text(/Current net worth/i)

    assert_field "Projection horizon", with: "30"
    assert_field "Annual income", with: "80000"
    assert_field "Annual spending", with: "60000"
    assert_field "Inflation rate", with: "2.5"
    assert_field "Investment return", with: "5"

    assert_text "today's dollars"
    assert_selector "th", text: /Income \(adjusted\)/i
    assert_selector "th", text: /Spending \(adjusted\)/i
    assert_selector "th", text: /Projected net worth/i

    start_year = Date.current.year
    assert_selector "table tbody tr", text: start_year.to_s
    assert_selector "table tbody tr", text: (start_year + 30).to_s
  end

  test "edits assumptions, applies changes without reload, and recalculates table and chart" do
    visit lifetime_projection_url
    start_year = Date.current.year

    # Mark window to verify no page reload occurs
    page.execute_script("window.__test_no_reload = true")

    fill_in "Projection horizon", with: "10"
    fill_in "Annual income", with: "120000"
    fill_in "Annual spending", with: "50000"
    fill_in "Inflation rate", with: "3.0"
    fill_in "Investment return", with: "8.0"

    assert_text "You have unapplied assumption changes."

    click_button "Apply changes"

    # Confirmed no page reload
    assert_equal true, page.evaluate_script("window.__test_no_reload")

    # Horizon recalculated to 10 years
    assert_selector "table tbody tr", text: (start_year + 10).to_s
    assert_no_selector "table tbody tr", text: (start_year + 11).to_s
    assert_text "10-year horizon"
    assert_text "Plan saved in this browser."
  end

  test "preserves edited plan across page reloads" do
    visit lifetime_projection_url
    fill_in "Projection horizon", with: "20"
    fill_in "Annual income", with: "135000"
    fill_in "Annual spending", with: "55000"
    fill_in "Inflation rate", with: "3.5"
    fill_in "Investment return", with: "6.5"
    click_button "Apply changes"

    assert_text "20-year horizon"
    assert_text "Plan saved in this browser."

    # Reload page
    visit lifetime_projection_url

    assert_field "Projection horizon", with: "20"
    assert_field "Annual income", with: "135000"
    assert_field "Annual spending", with: "55000"
    assert_field "Inflation rate", with: "3.5"
    assert_field "Investment return", with: "6.5"
    assert_text "20-year horizon"
    assert_text "Plan saved in this browser."
  end

  test "isolates saved plans across users in localStorage" do
    visit lifetime_projection_url
    fill_in "Projection horizon", with: "12"
    fill_in "Annual income", with: "110000"
    click_button "Apply changes"
    assert_text "12-year horizon"

    # Switch user to family_member
    find("button[aria-label='Open account menu']", match: :first, visible: :visible).click
    click_button "Log out", match: :first
    sign_in users(:family_member)
    visit lifetime_projection_url

    # Second user sees default 30-year horizon, NOT the first user's 12-year horizon
    assert_field "Projection horizon", with: "30"
    assert_field "Annual income", with: "80000"
    assert_text "30-year horizon"

    # Switch back to first user
    find("button[aria-label='Open account menu']", match: :first, visible: :visible).click
    click_button "Log out", match: :first
    sign_in @user
    visit lifetime_projection_url

    # First user's saved plan is restored
    assert_field "Projection horizon", with: "12"
    assert_field "Annual income", with: "110000"
    assert_text "12-year horizon"
  end

  test "recovers safely to defaults when local storage contains malformed or corrupt data" do
    visit lifetime_projection_url
    key = "sure:lifetime-projection:#{@user.id}"

    # Corrupt with invalid JSON string
    page.execute_script("window.localStorage.setItem('#{key}', 'INVALID_CORRUPTED_JSON{{{')")
    visit lifetime_projection_url

    assert_field "Projection horizon", with: "30"
    assert_field "Annual income", with: "80000"
    assert_text "30-year horizon"

    # Corrupt with invalid schema payload (negative income, invalid horizon)
    corrupted_data = {
      baseline: { netWorth: 10000, capturedAt: "now" },
      assumptions: { annualIncome: -500, horizonYears: 999 }
    }.to_json
    page.execute_script("window.localStorage.setItem('#{key}', '#{corrupted_data}')")
    visit lifetime_projection_url

    assert_field "Projection horizon", with: "30"
    assert_field "Annual income", with: "80000"
    assert_text "30-year horizon"
  end

  test "never writes projection values back to accounts, transactions, or family records" do
    accounts_before = @user.family.accounts.order(:id).pluck(:updated_at, :balance)
    transactions_count_before = @user.family.transactions.count

    visit lifetime_projection_url
    fill_in "Projection horizon", with: "15"
    fill_in "Annual income", with: "250000"
    click_button "Apply changes"

    accounts_after = @user.family.accounts.order(:id).pluck(:updated_at, :balance)
    transactions_count_after = @user.family.transactions.count

    assert_equal accounts_before, accounts_after
    assert_equal transactions_count_before, transactions_count_after
  end

  test "displays inline validation beside invalid inputs without recalculating" do
    visit lifetime_projection_url
    start_year = Date.current.year

    fill_in "Projection horizon", with: "0"
    fill_in "Annual income", with: "-500"
    fill_in "Annual spending", with: "-100"
    fill_in "Inflation rate", with: "-150"
    fill_in "Investment return", with: "-120"

    click_button "Apply changes"

    # Validation messages appear beside each affected input
    assert_selector "[role='alert']", text: "Horizon must be a whole number between 1 and 100 years."
    assert_selector "[role='alert']", text: "Annual income cannot be negative."
    assert_selector "[role='alert']", text: "Annual spending cannot be negative."
    assert_selector "[role='alert']", text: "Inflation rate must be greater than -100%."
    assert_selector "[role='alert']", text: "Investment return must be greater than -100%."

    assert_selector "input#projection-horizon-years[aria-invalid='true']"
    assert_selector "input#projection-annual-income[aria-invalid='true']"
    assert_selector "input#projection-annual-spending[aria-invalid='true']"
    assert_selector "input#projection-inflation-percent[aria-invalid='true']"
    assert_selector "input#projection-annual-return-percent[aria-invalid='true']"

    # Previous valid projection remains in place
    assert_selector "table tbody tr", text: (start_year + 30).to_s
  end

  test "requires confirmation before resetting and explains what local data will be replaced" do
    visit lifetime_projection_url
    start_year = Date.current.year

    fill_in "Projection horizon", with: "15"
    fill_in "Annual income", with: "95000"
    click_button "Apply changes"

    assert_selector "table tbody tr", text: (start_year + 15).to_s
    assert_no_selector "table tbody tr", text: (start_year + 16).to_s
    assert_text "Plan saved in this browser."

    click_button "Reset to defaults"

    assert_selector "[role='dialog']", text: "Reset to starter plan?"
    assert_text "This will replace your custom assumptions saved in this browser with the standard starter plan."
    assert_text "Horizon (reset to 30 years)"
    assert_text "Saved baseline balance and any unapplied edits in this browser"
    assert_text "Your live accounts, transactions, and family finances will remain unchanged."

    # Cancel leaves the custom plan untouched
    click_button "Cancel"
    assert_no_selector "[role='dialog']"
    assert_field "Projection horizon", with: "15"
    assert_field "Annual income", with: "95000"
    assert_selector "table tbody tr", text: (start_year + 15).to_s
    assert_text "Plan saved in this browser."

    # Reopen and confirm reset
    click_button "Reset to defaults"
    within "[role='dialog']" do
      click_button "Reset plan"
    end

    assert_no_selector "[role='dialog']"
    assert_field "Projection horizon", with: "30"
    assert_field "Annual income", with: "80000"
    assert_field "Annual spending", with: "60000"
    assert_field "Inflation rate", with: "2.5"
    assert_field "Investment return", with: "5"

    assert_selector "table tbody tr", text: (start_year + 30).to_s
    assert_text "Starter plan saved in this browser."
  end

  test "creates starter plan in local storage on first visit without overwriting" do
    visit lifetime_projection_url
    assert_text "Starter plan saved in this browser."

    key = "sure:lifetime-projection:#{@user.id}"
    raw_stored = page.evaluate_script("window.localStorage.getItem('#{key}')")
    assert raw_stored.present?
    stored = JSON.parse(raw_stored)
    assert_equal "starter", stored["planType"]
    assert_equal 30, stored["assumptions"]["horizonYears"]
    assert_equal 80_000, stored["assumptions"]["annualIncome"]
  end

  test "never overwrites a locally edited plan during an application update or reload" do
    visit lifetime_projection_url
    key = "sure:lifetime-projection:#{@user.id}"

    # Edit and save custom plan
    fill_in "Projection horizon", with: "25"
    fill_in "Annual income", with: "140000"
    fill_in "Annual spending", with: "70000"
    click_button "Apply changes"

    assert_text "Plan saved in this browser."
    raw_stored = page.evaluate_script("window.localStorage.getItem('#{key}')")
    stored = JSON.parse(raw_stored)
    assert_equal "custom", stored["planType"]
    assert_equal 25, stored["assumptions"]["horizonYears"]
    assert_equal 140_000, stored["assumptions"]["annualIncome"]

    # Simulate application update/reload
    visit lifetime_projection_url

    # Saved custom plan is preserved and not overwritten with starter defaults
    assert_field "Projection horizon", with: "25"
    assert_field "Annual income", with: "140000"
    assert_field "Annual spending", with: "70000"
    assert_text "Plan saved in this browser."

    raw_after = page.evaluate_script("window.localStorage.getItem('#{key}')")
    stored_after = JSON.parse(raw_after)
    assert_equal "custom", stored_after["planType"]
    assert_equal 25, stored_after["assumptions"]["horizonYears"]
    assert_equal 140_000, stored_after["assumptions"]["annualIncome"]
  end

  test "explains selected early and middle projected years with reconciled components" do
    visit lifetime_projection_url
    start_year = Date.current.year
    year_1 = start_year + 1
    year_15 = start_year + 15

    within "[data-testid='projection-year-breakdown']" do
      assert_selector "h3", text: "Year #{year_1} breakdown"
      assert_text(/Starting value/i)
      assert_text(/Investment growth/i)
      assert_text(/Annual income/i)
      assert_text(/Annual spending/i)
      assert_text(/Inflation effect/i)
      assert_text(/Ending value/i)
      assert_text "Ledger reconciliation formula:"
    end

    find("table tbody tr", text: year_15.to_s).click

    within "[data-testid='projection-year-breakdown']" do
      assert_selector "h3", text: "Year #{year_15} breakdown"
      assert_text "Year 15 of 30"
      assert_text(/Starting value/i)
      assert_text(/Ending value/i)
      assert_text "Ledger reconciliation formula:"
    end
  end

  test "explains negative balances and depleted plans without hiding or clamping them" do
    visit lifetime_projection_url
    start_year = Date.current.year

    fill_in "Annual income", with: "10000"
    fill_in "Annual spending", with: "150000"
    click_button "Apply changes"

    year_5 = start_year + 5
    find("table tbody tr", text: year_5.to_s).click

    within "[data-testid='projection-year-breakdown']" do
      assert_selector "h3", text: "Year #{year_5} breakdown"
      assert_text "Plan depleted"
      assert_text(/Plan depleted in #{year_5}/i)
      assert_selector "span", text: /-\$/
      assert_text "Annual spending has exceeded cumulative income and starting assets"
      assert_text "Ledger reconciliation formula:"
    end
  end

  test "reconciles final projected year exactly with chart and table" do
    visit lifetime_projection_url
    start_year = Date.current.year
    final_year = start_year + 30

    select "#{final_year} (Year 30)", from: "projection-year-select"

    within "[data-testid='projection-year-breakdown']" do
      assert_selector "h3", text: "Year #{final_year} breakdown"
      assert_text "Year 30 of 30"
      assert_text "Dec 31 balance"
    end

    final_row = find("table tbody tr", text: final_year.to_s)
    within final_row do
      assert_text "$2,200,241"
    end
    within "[data-testid='projection-year-breakdown']" do
      assert_text "$2,200,241"
    end
  end

  test "shows baseline capture date and synced badge when current finances match baseline" do
    visit lifetime_projection_url

    assert_text "Saved baseline captured"
    assert_selector "span", text: "Synced"
    assert_no_selector "button", text: "Review changes"
  end

  test "detects when current finances differ, previews additions removals and balance changes, rejects once, and accepts once preserving assumptions" do
    visit lifetime_projection_url
    key = "sure:lifetime-projection:#{@user.id}"

    # Customize assumptions and save
    fill_in "Projection horizon", with: "20"
    fill_in "Annual income", with: "115000"
    fill_in "Annual spending", with: "55000"
    click_button "Apply changes"
    assert_text "Plan saved in this browser."

    # Modify accounts in the database:
    # 1. Change existing depository account balance by +$10,000
    depository = accounts(:depository)
    depository.update!(balance: depository.balance + 10_000)

    # 2. Add a new account with $3,000
    @user.family.accounts.create!(
      name: "High Yield Growth",
      accountable_type: "Depository",
      accountable: depository.accountable,
      balance: 3000,
      currency: "USD",
      status: "active"
    )

    # Revisit the projection page
    visit lifetime_projection_url

    # Baseline difference detected!
    assert_selector "span", text: "Differs"
    assert_text "Current live balance:"
    assert_text "Difference:"
    assert_selector "button", text: "Review changes"

    # The projection still uses the saved assumptions
    assert_field "Projection horizon", with: "20"
    assert_field "Annual income", with: "115000"
    assert_field "Annual spending", with: "55000"

    # Open preview modal
    click_button "Review changes"

    within "[role='dialog']" do
      assert_selector "h2", text: "Refresh projection baseline?"
      assert_text(/Saved baseline/i)
      assert_text(/Current live finances/i)
      assert_text "High Yield Growth"
      assert_text "Checking Account"
      assert_text "Your projection horizon, annual income, annual spending, inflation, and return rate assumptions will be preserved."

      # Reject once: Keep current baseline
      click_button "Keep current baseline"
    end

    assert_no_selector "[role='dialog']"
    # Unchanged: still differs, still 20-year horizon
    assert_selector "span", text: "Differs"
    assert_field "Projection horizon", with: "20"
    assert_field "Annual income", with: "115000"

    # Re-open preview and accept this time
    click_button "Review changes"
    within "[role='dialog']" do
      click_button "Update baseline"
    end

    assert_no_selector "[role='dialog']"

    # Now synced with updated baseline
    assert_selector "span", text: "Synced"
    assert_no_selector "button", text: "Review changes"

    # Assumptions are preserved!
    assert_field "Projection horizon", with: "20"
    assert_field "Annual income", with: "115000"
    assert_field "Annual spending", with: "55000"

    # Check localStorage updated baseline
    raw_stored = page.evaluate_script("window.localStorage.getItem('#{key}')")
    stored = JSON.parse(raw_stored)
    assert_equal 20, stored["assumptions"]["horizonYears"]
    assert_equal 115_000, stored["assumptions"]["annualIncome"]
    assert stored["baseline"]["netWorth"] > 0
  end

  test "previews removed accounts when an account is closed or deleted" do
    visit lifetime_projection_url

    # Ensure starter plan is seeded with current accounts
    assert_selector "span", text: "Synced"

    # Delete an account
    accounts(:other_asset).destroy!

    # Revisit page
    visit lifetime_projection_url
    assert_selector "span", text: "Differs"

    click_button "Review changes"

    within "[role='dialog']" do
      assert_text(/Removed or closed accounts/i)
      assert_text "Collectable Account"
    end
  end

  test "renders projection for an empty family with zero accounts using starter baseline" do
    find("button[aria-label='Open account menu']", match: :first, visible: :visible).click
    click_button "Log out", match: :first
    sign_in users(:empty)

    visit lifetime_projection_url

    assert_selector "h1", text: "Lifetime projection"
    assert_text "No accounts connected yet"
    assert_text "Modeling scenarios with a starter baseline ($0)."

    # Inputs and table are fully functional
    assert_field "Projection horizon", with: "30"
    assert_field "Annual income", with: "80000"
    assert_field "Annual spending", with: "60000"

    start_year = Date.current.year
    assert_selector "table tbody tr", text: start_year.to_s
    assert_selector "table tbody tr", text: (start_year + 30).to_s
  end

  test "renders default single-person household with birth year, retirement age, and longevity, showing ages in table and breakdown" do
    visit lifetime_projection_url
    start_year = Date.current.year

    assert_text "Household planning horizon"
    assert_selector "button[aria-pressed='true']", text: "Single"
    assert_field "member-primary-name", with: "You"
    assert_field "member-primary-birth-year", with: (start_year - 35).to_s
    assert_field "member-primary-retirement-age", with: "65"
    assert_field "member-primary-end-age", with: "85"

    assert_selector "th", text: /Age\(s\)/i

    # Base year row has age 35
    row_0 = find("table tbody tr", text: start_year.to_s)
    within row_0 do
      assert_text "35"
    end

    # Year 30 row has age 65 and retirement badge
    row_30 = find("table tbody tr", text: (start_year + 30).to_s)
    within row_30 do
      assert_text "65"
      assert_text "Retirement"
    end

    # Clicking year 30 shows retirement breakdown
    row_30.click
    within "[data-testid='projection-year-breakdown']" do
      assert_text(/Household in #{start_year + 30}/i)
      assert_text "You"
      assert_text "(Age 65)"
      assert_text "Retiring this year (Age 65)"
      assert_text "Transitions to retirement in #{start_year + 30}"
    end
  end

  test "configures couple household with different retirement and longevity assumptions per person" do
    visit lifetime_projection_url
    start_year = Date.current.year

    click_button "Couple"

    fill_in "member-primary-birth-year", with: (start_year - 36).to_s
    fill_in "member-primary-retirement-age", with: "60"
    fill_in "member-primary-end-age", with: "80"

    fill_in "member-partner-name", with: "Jordan"
    fill_in "member-partner-birth-year", with: (start_year - 34).to_s
    fill_in "member-partner-retirement-age", with: "66"
    fill_in "member-partner-end-age", with: "90"

    click_button "Apply changes"

    # Year 0 has ages 36 / 34
    row_0 = find("table tbody tr", text: start_year.to_s)
    within row_0 do
      assert_text "36 / 34"
    end

    # Primary retires in start_year + 24 (age 60)
    primary_retire_year = start_year + 24
    row_retire = find("table tbody tr", text: primary_retire_year.to_s)
    within row_retire do
      assert_text "60 / 58"
      assert_text "Retirement"
    end

    row_retire.click
    within "[data-testid='projection-year-breakdown']" do
      assert_text "You"
      assert_text "(Age 60)"
      assert_text "Retiring this year (Age 60)"
      assert_text "Jordan"
      assert_text "(Age 58)"
      assert_text "Working"
    end
  end

  test "explains household milestones that fall outside the projection horizon and allows extending horizon" do
    visit lifetime_projection_url
    start_year = Date.current.year

    fill_in "Projection horizon", with: "10"
    click_button "Apply changes"

    # Banner explains milestones outside horizon
    assert_selector "[aria-label='Milestones outside projection horizon']"
    assert_text "Milestones outside the 10-year projection horizon"
    assert_text "You reaches retirement age (65) in #{start_year + 30} (20 years beyond the 10-year horizon)."
    assert_text "You reaches planning end age (85) in #{start_year + 50} (40 years beyond the 10-year horizon)."

    # Extend horizon button sets horizon to cover all milestones (50 years)
    click_button "Extend horizon to 50 years to cover all milestones"
    assert_field "Projection horizon", with: "50"

    click_button "Apply changes"
    assert_no_selector "[aria-label='Milestones outside projection horizon']"
    assert_selector "table tbody tr", text: (start_year + 50).to_s
  end

  test "preserves household configuration across reload and resets to starter plan defaults" do
    visit lifetime_projection_url

    click_button "Couple"
    fill_in "member-primary-name", with: "Alex"
    fill_in "member-partner-name", with: "Sam"
    click_button "Apply changes"

    assert_text "Plan saved in this browser."

    # Reload page
    visit lifetime_projection_url
    assert_field "member-primary-name", with: "Alex"
    assert_field "member-partner-name", with: "Sam"

    # Reset to defaults
    click_button "Reset to defaults"
    within "[role='dialog']" do
      assert_text "Household planning horizon (reset to single member, age 35, retirement at 65)"
      click_button "Reset plan"
    end

    assert_field "member-primary-name", with: "You"
    assert_no_field "member-partner-name"
  end

  test "schedules recurring income, living costs, retirement, and one-time expense events, and verifies first, last, and inactive years" do
    visit lifetime_projection_url
    start_year = Date.current.year

    click_button "Scheduled life events"
    assert_text "Scheduled life events (0)"

    # 1. Add recurring salary (start_year + 1 to start_year + 10)
    click_button "Add event"
    within "[aria-label='Life event form']" do
      fill_in "Event name", with: "Tech Salary"
      fill_in "Amount", with: "120000"
      fill_in "Start year", with: (start_year + 1).to_s
      fill_in "End year", with: (start_year + 10).to_s
      click_button "Add event"
    end

    within "[data-testid='scheduled-events-table']" do
      assert_text "Tech Salary"
      assert_text "Income"
      assert_text "#{start_year + 1} – #{start_year + 10} (10 yrs)"
      assert_text "$120,000 / yr"
      assert_text "Enabled"
    end

    # 2. Add recurring living cost (start_year + 1 to start_year + 30)
    click_button "Add event"
    within "[aria-label='Life event form']" do
      fill_in "Event name", with: "Living Costs"
      click_button "Spending"
      fill_in "Amount", with: "60000"
      fill_in "Start year", with: (start_year + 1).to_s
      fill_in "End year", with: (start_year + 30).to_s
      click_button "Add event"
    end

    # 3. Add retirement pension (start_year + 11 to start_year + 30)
    click_button "Add event"
    within "[aria-label='Life event form']" do
      fill_in "Event name", with: "Retirement Pension"
      click_button "Income"
      fill_in "Amount", with: "40000"
      fill_in "Start year", with: (start_year + 11).to_s
      fill_in "End year", with: (start_year + 30).to_s
      click_button "Add event"
    end

    # 4. Add one-time home remodel expense (in start_year + 5)
    click_button "Add event"
    within "[aria-label='Life event form']" do
      fill_in "Event name", with: "Home Remodel"
      click_button "Spending"
      click_button "One-time"
      fill_in "Amount", with: "35000"
      fill_in "Calendar year", with: (start_year + 5).to_s
      click_button "Add event"
    end

    # Verify Year 1 (start_year + 1):
    # - Tech Salary: Active (First year)
    # - Living Costs: Active (First year)
    # - Home Remodel: Inactive (Starts in start_year + 5)
    # - Retirement Pension: Inactive (Starts in start_year + 11)
    find("[data-testid='projection-results-table'] tbody tr", text: (start_year + 1).to_s).click
    within "[data-testid='projection-year-breakdown']" do
      assert_text(/Scheduled cash flow events in #{start_year + 1}/i)
      assert_text "Tech Salary"
      assert_text "First year"
      assert_text "Living Costs"
      assert_text "Home Remodel"
      assert_text "Starts in #{start_year + 5}"
      assert_text "Retirement Pension"
      assert_text "Starts in #{start_year + 11}"
    end

    # Verify Year 5 (start_year + 5):
    # - Home Remodel: Active (One-time)
    # - Tech Salary: Active
    # - Living Costs: Active
    # - Retirement Pension: Inactive (Starts in start_year + 11)
    find("[data-testid='projection-results-table'] tbody tr", text: (start_year + 5).to_s).click
    within "[data-testid='projection-year-breakdown']" do
      assert_text "Home Remodel"
      assert_text "One-time"
      assert_text "Tech Salary"
      assert_text "Living Costs"
      assert_text "Retirement Pension"
      assert_text "Starts in #{start_year + 11}"
    end

    # Verify Year 6 (start_year + 6):
    # - Home Remodel: Inactive (Ended in start_year + 5)
    find("[data-testid='projection-results-table'] tbody tr", text: (start_year + 6).to_s).click
    within "[data-testid='projection-year-breakdown']" do
      assert_text "Home Remodel"
      assert_text "Ended in #{start_year + 5}"
    end

    # Verify Year 10 (start_year + 10):
    # - Tech Salary: Active (Last year)
    find("[data-testid='projection-results-table'] tbody tr", text: (start_year + 10).to_s).click
    within "[data-testid='projection-year-breakdown']" do
      assert_text "Tech Salary"
      assert_text "Last year"
    end

    # Verify Year 11 (start_year + 11):
    # - Tech Salary: Inactive (Ended in start_year + 10)
    # - Retirement Pension: Active (First year)
    find("[data-testid='projection-results-table'] tbody tr", text: (start_year + 11).to_s).click
    within "[data-testid='projection-year-breakdown']" do
      assert_text "Tech Salary"
      assert_text "Ended in #{start_year + 10}"
      assert_text "Retirement Pension"
      assert_text "First year"
    end

    # Verify Year 30 (start_year + 30):
    # - Living Costs: Active (Last year)
    # - Retirement Pension: Active (Last year)
    find("[data-testid='projection-results-table'] tbody tr", text: (start_year + 30).to_s).click
    within "[data-testid='projection-year-breakdown']" do
      assert_text "Living Costs"
      assert_text "Last year"
      assert_text "Retirement Pension"
      assert_text "Last year"
    end
  end

  test "edits, disables, and deletes scheduled life events, recalculating projection immediately" do
    visit lifetime_projection_url
    start_year = Date.current.year

    click_button "Scheduled life events"
    click_button "Pre-fill starter events"

    within "[data-testid='scheduled-events-table']" do
      assert_text "Salary"
      assert_text "$80,000 / yr"
      assert_text "Living costs"
      assert_text "$60,000 / yr"
    end

    # Disable Salary event
    find("button[aria-label='Disable Salary']").click
    within "[data-testid='scheduled-events-table']" do
      assert_text "Disabled"
    end

    # Breakdown reflects disabled Salary
    find("[data-testid='projection-results-table'] tbody tr", text: (start_year + 1).to_s).click
    within "[data-testid='projection-year-breakdown']" do
      assert_text "Salary"
      assert_text "Disabled"
      # Income is now 0 without Salary
      assert_text "+$0"
    end

    # Re-enable Salary
    find("button[aria-label='Enable Salary']").click
    within "[data-testid='scheduled-events-table']" do
      assert_text "Enabled"
    end

    find("[data-testid='projection-results-table'] tbody tr", text: (start_year + 1).to_s).click
    within "[data-testid='projection-year-breakdown']" do
      assert_text "Salary"
      assert_text "+$80,000"
    end

    # Edit Salary amount and annual change
    find("button[aria-label='Edit Salary']").click
    within "[aria-label='Life event form']" do
      fill_in "Amount", with: "95000"
      fill_in "Annual change rate", with: "3"
      click_button "Save changes"
    end

    within "[data-testid='scheduled-events-table']" do
      assert_text "$95,000 / yr"
      assert_text "+3% / yr"
    end

    # Delete Salary
    find("button[aria-label='Delete Salary']").click
    within "[data-testid='scheduled-events-table']" do
      assert_no_text "Salary"
      assert_text "Living costs"
    end
  end

  test "preserves scheduled events plan across reload and resets to flat starter plan defaults" do
    visit lifetime_projection_url

    click_button "Scheduled life events"
    click_button "Add event"
    within "[aria-label='Life event form']" do
      fill_in "Event name", with: "Consulting Bonus"
      fill_in "Amount", with: "25000"
      click_button "Add event"
    end

    within "[data-testid='scheduled-events-table']" do
      assert_text "Consulting Bonus"
    end

    # Reload page
    visit lifetime_projection_url
    assert_selector "button[aria-pressed='true']", text: "Scheduled life events"
    within "[data-testid='scheduled-events-table']" do
      assert_text "Consulting Bonus"
    end

    # Reset to defaults
    click_button "Reset to defaults"
    within "[role='dialog']" do
      assert_text "Scheduled life events and cash flow timeline (reset to flat assumptions)"
      click_button "Reset plan"
    end

    # Returns to flat cash flow mode with starter defaults
    assert_selector "button[aria-pressed='true']", text: "Flat annual amounts"
    assert_field "Annual income", with: "80000"
    assert_field "Annual spending", with: "60000"
  end

  test "adds dated spending goals and target balance milestones and evaluates funded, partially funded, missed, and not yet evaluable states" do
    visit lifetime_projection_url
    start_year = Date.current.year

    # Verify initial goals section empty state
    within "[data-testid='goals-milestones-section']" do
      assert_text "Goals and milestones (0)"
      assert_text "No goals or milestones added yet"
    end

    # 1. Add an achievable Target-balance milestone in year start_year + 15 ($500,000) -> Funded
    click_button "Add goal", match: :first
    within "[aria-label='Goal and milestone form']" do
      fill_in "Name", with: "Mid-career nest egg"
      fill_in "Target year", with: (start_year + 15).to_s
      fill_in "Target net worth", with: "500000"
      click_button "Add goal"
    end

    within "[data-testid='goals-milestones-section']" do
      assert_text "Mid-career nest egg"
      assert_text "Target balance milestone"
      assert_text "Funded"
      assert_text(/Year #{start_year + 15} ending net worth:/)
      find("button", text: "Inspect year #{start_year + 15}").click
    end

    within "[data-testid='projection-year-breakdown']" do
      assert_text "Year #{start_year + 15} breakdown"
      within "[data-testid='year-goals-breakdown']" do
        assert_text(/Goals and milestones evaluated in #{start_year + 15}/i)
        assert_text "Mid-career nest egg"
        assert_text "Target balance"
        assert_text "Funded"
      end
    end

    # 2. Add an out-of-horizon Target-balance milestone in start_year + 45 -> Not yet evaluable
    click_button "Add goal", match: :first
    within "[aria-label='Goal and milestone form']" do
      fill_in "Name", with: "Centennial legacy"
      fill_in "Target year", with: (start_year + 45).to_s
      fill_in "Target net worth", with: "2000000"
      click_button "Add goal"
    end

    within "[data-testid='goals-milestones-section']" do
      assert_text "Centennial legacy"
      assert_text "Not yet evaluable"
      assert_text "Target year #{start_year + 45} is beyond the 30-year projection horizon"
    end

    # 3. Add a large dated spending goal in year start_year + 2 ($400,000) that exceeds available funds -> Partially funded or Missed
    click_button "Add goal", match: :first
    within "[aria-label='Goal and milestone form']" do
      fill_in "Name", with: "Dream Vacation Villa"
      click_button "Dated spending goal"
      fill_in "Target year", with: (start_year + 2).to_s
      fill_in "Target spending amount", with: "400000"
      click_button "Add goal"
    end

    within "[data-testid='goals-milestones-section']" do
      assert_text "Dream Vacation Villa"
      assert_text "Dated spending goal"
      assert_selector "[data-testid^='goal-card-']", text: /Partially funded|Missed/
      find("button", text: "Inspect year #{start_year + 2}").click
    end

    within "[data-testid='projection-year-breakdown']" do
      assert_text "Year #{start_year + 2} breakdown"
      within "[data-testid='year-goals-breakdown']" do
        assert_text(/Goals and milestones evaluated in #{start_year + 2}/i)
        assert_text "Dream Vacation Villa"
        assert_text "Dated spending"
      end
    end
  end

  test "runs explicit shortfall experiments on flexible goals to defer timing or reduce amount and verifies linked yearly explanation" do
    visit lifetime_projection_url
    start_year = Date.current.year

    # Add a flexible dated spending goal in year start_year + 3 ($350,000) that triggers a shortfall
    click_button "Add goal", match: :first
    within "[aria-label='Goal and milestone form']" do
      fill_in "Name", with: "Luxury Motorhome"
      click_button "Dated spending goal"
      fill_in "Target year", with: (start_year + 3).to_s
      fill_in "Target spending amount", with: "350000"
      click_button "Add goal"
    end

    # Goal is initially underfunded / partially funded
    within "[data-testid='goals-milestones-section']" do
      assert_text "Luxury Motorhome"
      assert_selector "[data-testid^='goal-card-']", text: /Partially funded|Missed/
      assert_selector "[data-testid^='shortfall-experiment-']"
      assert_text "Shortfall experiment"

      # Experiment 1: Defer timing by +2 years
      click_button "Defer +2 years (#{start_year + 5})"
      assert_text "Experiment active"
      assert_text "Deferred to #{start_year + 5}"

      # Inspect deferred year breakdown
      find("button", text: "Inspect year #{start_year + 5}").click
    end

    within "[data-testid='projection-year-breakdown']" do
      assert_text "Year #{start_year + 5} breakdown"
      within "[data-testid='year-goals-breakdown']" do
        assert_text "Luxury Motorhome"
        assert_text "Dated spending"
      end
    end

    # Experiment 2: Reduce target amount
    within "[data-testid='goals-milestones-section']" do
      click_button "Reduce target amount", match: :first
      assert_text "Experiment active"
      assert_text(/Reduced to \$[0-9,]+/)

      # Revert back to original target
      click_button "Original target"
      assert_no_text "Experiment active"
    end
  end

  test "preserves goals across page reload and resets goals on reset to defaults" do
    visit lifetime_projection_url
    start_year = Date.current.year

    within "[data-testid='goals-milestones-section']" do
      click_button "Pre-fill starter goals"
      assert_text "Retirement nest egg"
      assert_text "College fund"
    end

    # Reload page to verify persistence
    visit lifetime_projection_url
    within "[data-testid='goals-milestones-section']" do
      assert_text "Retirement nest egg"
      assert_text "College fund"
    end

    # Reset to defaults
    click_button "Reset to defaults"
    within "[role='dialog']" do
      assert_text "Goals and milestones (reset to empty)"
      click_button "Reset plan"
    end

    # Goals reset to empty
    within "[data-testid='goals-milestones-section']" do
      assert_text "Goals and milestones (0)"
      assert_text "No goals or milestones added yet"
    end
  end
end
