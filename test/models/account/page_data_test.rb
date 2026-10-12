require "test_helper"

# Date-sensitive account sections use the page's reference date, not render time.
class Account::PageDataTest < ActiveSupport::TestCase
  setup do
    Current.session = Session.create!(user: users(:family_admin))
    @account = Account.create!(
      family: families(:dylan_family),
      name: "Overview Loan",
      balance: 12_000,
      currency: "USD",
      accountable: Loan.create!(
        subtype: "auto", interest_rate: 0, term_months: 12,
        rate_type: "fixed", start_date: Date.new(2026, 1, 15)
      )
    )
  end

  test "the current instalment is the one for the page's date, not the clock's" do
    page = travel_to(Date.new(2026, 9, 28)) do
      controller = ApplicationController.new
      controller.request = ActionDispatch::TestRequest.create
      Account::PageData.new(
        account: @account, view: controller.view_context,
        period: Period.last_30_days, chart_view: "balance", active_tab: "overview",
        tabs: Account::PageData.tabs_for(@account), as_of: Date.new(2026, 4, 20),
        loan_chart: nil, projection: nil, feed: nil, pagination: nil,
        accessible_account_ids: [ @account.id ], coverage: nil, statements: [],
        reconciliation_statuses: {}, can_manage_statements: false
      ).as_json
    end

    instalment = page[:sections].find { |section| section[:key] == "instalment" }
    expected_title = I18n.t("loans.tabs.repayment_progress.instalment",
                           number: 4, date: I18n.l(Date.new(2026, 5, 15), format: :long))
    assert_equal expected_title, instalment[:title]
  end
end
