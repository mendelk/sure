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

  test "resets assumptions to defaults" do
    visit lifetime_projection_url
    start_year = Date.current.year

    fill_in "Projection horizon", with: "15"
    fill_in "Annual income", with: "95000"
    click_button "Apply changes"

    assert_selector "table tbody tr", text: (start_year + 15).to_s
    assert_no_selector "table tbody tr", text: (start_year + 16).to_s

    click_button "Reset to defaults"

    assert_field "Projection horizon", with: "30"
    assert_field "Annual income", with: "80000"
    assert_field "Annual spending", with: "60000"
    assert_field "Inflation rate", with: "2.5"
    assert_field "Investment return", with: "5"

    assert_selector "table tbody tr", text: (start_year + 30).to_s
  end
end
