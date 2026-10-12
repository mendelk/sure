require "application_system_test_case"

class AccountChartDragSelectTest < ApplicationSystemTestCase
  setup do
    ensure_spa_build
    @user = users(:family_admin)
    @account = accounts(:depository)
  end

  test "dragging across the balance chart navigates to the dragged date range" do
    sign_in @user

    visit account_url(@account, period: "last_30_days")
    assert_text @account.name
    assert_selector "svg.ts-chart[role='img'][tabindex='0'] g.ts-chart__line"

    start_handle = find("[role='slider'][aria-label='#{I18n.t('accounts.show.spa.start_date')}']")
    end_handle = find("[role='slider'][aria-label='#{I18n.t('accounts.show.spa.end_date')}']")
    initial_end = end_handle["aria-valuetext"]
    brush = start_handle.ancestor("svg")

    page.driver.browser.action
      .move_to(start_handle.native)
      .click_and_hold
      .move_by((brush.native.rect.width / 3).round, 0)
      .release
      .perform

    assert_current_path(%r{/accounts/#{@account.id}\?.*start_date=.*end_date=})
    query = Rack::Utils.parse_query(URI.parse(page.current_url).query)
    start_date = Date.iso8601(query.fetch("start_date"))
    end_date = Date.iso8601(query.fetch("end_date"))
    assert start_date > Period.last_30_days.start_date, "dragging the start handle must narrow the range"
    assert start_date < end_date
    assert_nil query["period"], "the dragged dates must replace the preset period"
    assert_selector "#account-chart-period option[value='custom']:checked"
    assert_equal initial_end, find("[role='slider'][aria-label='#{I18n.t('accounts.show.spa.end_date')}']")["aria-valuetext"]
  end
end
