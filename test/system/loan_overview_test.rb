require "application_system_test_case"

class LoanOverviewTest < ApplicationSystemTestCase
  setup do
    ensure_spa_build
    sign_in @user = users(:family_admin)
    @account = accounts(:loan)
    @account.loan.update!(
      subtype: "mortgage", rate_type: "fixed", interest_rate: 5.25, term_months: 360,
      start_date: 3.years.ago.to_date, down_payment: 100_000,
      insurance_rate: 0.36, insurance_rate_type: "level_term"
    )
    @account.entries.create!(
      name: "Drawdown", date: 3.years.ago.to_date, amount: 500_000, currency: "USD",
      entryable: Valuation.new(kind: "opening_anchor")
    )
    @account.update_column(:balance, 415_000)
  end

  test "the repayment ring shows the repaid principal in both themes" do
    visit account_url(@account)
    click_on "Overview"

    label = I18n.t("loans.tabs.repayment_progress.repaid")
    assert_text "17%"
    assert_text Money.new(500_000, "USD").format
    progress = find("progress[aria-label='#{label}']", visible: :all)
    assert_in_delta 17, progress["value"].to_f
    assert_equal "100", progress["max"]

    svg = find("svg.ts-chart[role='img'][aria-label='#{label}']")
    arc = svg.find("g.ts-chart__arc path[data-ts-key$=':paid']")
    assert arc["d"].to_s.start_with?("M"), "the paid arc must have geometry"
    assert page.evaluate_script("arguments[0].getTotalLength() > 0", arc)

    page.execute_script("document.documentElement.setAttribute('data-theme', 'light')")
    light_fill = page.evaluate_script("getComputedStyle(arguments[0]).fill", arc)
    assert_not_equal "none", light_fill, "the paid arc must be painted in light mode"
    assert_not_equal "rgba(0, 0, 0, 0)", light_fill

    page.execute_script("document.documentElement.setAttribute('data-theme', 'dark')")
    dark_fill = page.evaluate_script("getComputedStyle(arguments[0]).fill", arc)
    assert_not_equal "none", dark_fill, "the paid arc must be painted in dark mode"
    assert_not_equal "rgba(0, 0, 0, 0)", dark_fill
    assert_not_equal light_fill, dark_fill, "the arc must repaint from the dark palette"
  end
end
