require "application_system_test_case"

class AccountChartZoomPanTest < ApplicationSystemTestCase
  setup do
    ensure_spa_build
    @user = users(:family_admin)
    @account = accounts(:depository)
  end

  test "dragging across the balance chart pans locally and disables the preset dropdown" do
    sign_in @user

    visit account_url(@account, period: "last_30_days")
    assert_text @account.name
    assert_selector "svg.ts-chart[role='img'][tabindex='0'] g.ts-chart__line"
    assert_no_selector "[role='slider']"
    assert_no_selector "#account-chart-period option[value='custom']"
    assert_selector "#account-chart-period:not([disabled])"
    zoom_surface = find("[data-chart-zoom-surface]")
    path_before = page.current_url

    page.driver.browser.action
      .move_to(zoom_surface.native)
      .click_and_hold
      .move_by((zoom_surface.native.rect.width / 3).round, 0)
      .release
      .perform

    assert_equal path_before, page.current_url, "panning must stay local, not refetch"
    assert_selector "#account-chart-period[disabled]"
    assert_text I18n.t("accounts.show.spa.reset_zoom")

    click_button I18n.t("accounts.show.spa.reset_zoom")

    assert_selector "#account-chart-period:not([disabled])"
    assert_equal path_before, page.current_url, "resetting the zoom must stay local too"
  end

  test "choosing a preset period from the dropdown applies immediately" do
    sign_in @user

    visit account_url(@account, period: "last_30_days")
    assert_text @account.name
    assert_selector "#account-chart-period"

    select "90D", from: "account-chart-period"

    assert_current_path(%r{/accounts/#{@account.id}\?.*period=last_90_days})
  end
end
