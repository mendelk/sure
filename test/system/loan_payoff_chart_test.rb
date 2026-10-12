require "application_system_test_case"

class LoanPayoffChartTest < ApplicationSystemTestCase
  # A loan halfway through its term has recorded history and a future payoff.
  TODAY = Date.new(2027, 1, 15)
  SERIES = %w[actual scheduled projected].freeze
  CHART_SELECTOR = "svg.ts-chart[role='img'][tabindex='0']".freeze

  setup do
    ensure_spa_build
    sign_in @user = users(:family_admin)
  end

  test "the chart paints recorded, scheduled and projected balances in both themes" do
    travel_to TODAY do
      account = on_contract_loan_account

      visit account_path(account, period: "all_time")
      chart_svg
      page.execute_script("document.documentElement.setAttribute('data-theme', 'light')")
      assert_series_painted
      strokes_in_light = SERIES.to_h { |key| [ key, stroke_of(key) ] }

      page.execute_script("document.documentElement.setAttribute('data-theme', 'dark')")
      wait_until { stroke_of("actual") != strokes_in_light["actual"] }
      assert_series_painted
      SERIES.each do |key|
        assert_not_equal strokes_in_light[key], stroke_of(key),
          "the #{key} line must repaint from the dark theme's token"
      end
    end
  end

  test "the accessible chart description gives the real balance and payoff dates" do
    travel_to TODAY do
      account = on_contract_loan_account
      schedule = account.loan.amortization_schedule
      projection = account.loan.payoff_projection(as_of: TODAY)

      visit account_path(account, period: "all_time")
      description = chart_svg["aria-label"]

      assert_includes description, account.balance_money.format
      assert_includes description, I18n.l(schedule.payoff_date, format: :long)
      assert_includes description, I18n.l(projection.payoff_date, format: :long)
      assert_no_selector "[role='slider']"
    end
  end

  test "keyboard navigation groups the figures by date and only keyboard focus announces" do
    travel_to TODAY do
      account = on_contract_loan_account
      payload = payoff_payload(account)
      dates = plotted_dates(payload)

      visit account_path(account, period: "all_time")
      svg = chart_svg
      svg.send_keys(:home)
      assert_tooltip_at_date(payload, dates.first, announcing: true)
      first = find(".ts-chart-tooltip").text

      svg.send_keys(:arrow_right)
      assert_tooltip_at_date(payload, dates.second, announcing: true)
      assert_not_equal first, find(".ts-chart-tooltip").text,
        "the arrow key must move to the next plotted date"

      # At today's date the recorded balance and projection start coincide.
      svg.send_keys(:home, *Array.new(dates.index(TODAY.iso8601), :arrow_right))
      assert_tooltip_at_date(payload, TODAY.iso8601, announcing: true)

      svg.send_keys(:escape)
      assert_no_selector ".ts-chart-tooltip"

      point_at_date(dates.first)
      assert_tooltip_at_date(payload, dates.first, announcing: false)
    end
  end

  test "the tooltip uses German dates and server-formatted currency for every series" do
    @user.update!(locale: "de")

    travel_to TODAY do
      account = on_contract_loan_account
      payload = I18n.with_locale(:de) { payoff_payload(account) }

      visit account_path(account, period: "all_time")
      assert_selector "html[lang='de']"
      chart_svg.send_keys(:home)
      assert_tooltip_at_date(payload, "2026-01-01", locale: "de", announcing: true)

      text = find(".ts-chart-tooltip").text
      assert_includes text, "500.000,00 $"
      assert_not_includes text, "$500,000"
      assert_not text.start_with?(formatted_date("2026-01-01", locale: "en")),
        "the date must not use the English locale"
    end
  end

  test "the axis labels its dates in German" do
    @user.update!(locale: "de")

    travel_to TODAY do
      account = on_contract_loan_account

      visit account_path(account, period: "last_365_days")
      svg = chart_svg
      ticks = svg.all("text[data-ts-key^='x-tick-label:number:']")
      assert ticks.any?, "the chart must show date ticks"

      ticks.each do |tick|
        timestamp = tick["data-ts-key"].split(":").last.to_i
        date = Time.at(timestamp / 1000.0).utc.to_date.iso8601
        assert_equal formatted_date(date, locale: "de"), tick.text,
          "an axis date must use the user's locale"
        assert_not_equal formatted_date(date, locale: "en"), tick.text
      end
    end
  end

  test "a pointer before a payment date names the date whose figures it shows" do
    travel_to TODAY do
      account = on_contract_loan_account
      payload = payoff_payload(account)
      payment = payload[:scheduled].find do |point|
        date = Date.iso8601(point[:date])
        date - 2 > TODAY && (date - 2).month != date.month
      end
      assert payment, "the schedule must include a future payment at the start of a month"
      payment_date = Date.iso8601(payment[:date])
      cursor = payment_date - 2

      visit account_path(account, period: "all_time")
      chart_svg
      point_at_date(cursor.iso8601)

      assert_tooltip_at_date(payload, payment[:date], announcing: false)
      assert_not find(".ts-chart-tooltip").text.start_with?(formatted_date(cursor.iso8601)),
        "the heading must name the plotted payment, not the cursor's date"
    end
  end

  private
    def chart_svg
      find(CHART_SELECTOR)
    end

    def series_path(key)
      chart_svg.find("g.ts-chart__line[data-ts-key^='#{key}:'] path")
    end

    def assert_series_painted
      SERIES.each do |key|
        path = series_path(key)
        assert path["d"].to_s.start_with?("M"), "the #{key} line must have geometry"
        assert page.evaluate_script("arguments[0].getTotalLength() > 0", path),
          "the #{key} line must have a visible length"
        assert_not_equal "none", stroke_of(key), "the #{key} line must have a resolved stroke"
        assert_not_equal "rgba(0, 0, 0, 0)", stroke_of(key),
          "the #{key} line must not be transparent"
      end
    end

    def stroke_of(key)
      page.evaluate_script("getComputedStyle(arguments[0]).stroke", series_path(key))
    end

    def payoff_payload(account)
      Loan::PayoffChart.new(account.loan, as_of: TODAY, period: all_time_period).payload
    end

    def plotted_dates(payload)
      SERIES.flat_map { |key| payload[key.to_sym].map { |point| point[:date] } }.uniq.sort
    end

    def formatted_date(date, locale: "en")
      page.evaluate_script(<<~JS)
        new Intl.DateTimeFormat(#{locale.to_json}, {
          year: "numeric", month: "short", day: "numeric", timeZone: "UTC"
        }).format(new Date(#{date.to_json} + "T00:00:00Z"))
      JS
    end

    def assert_tooltip_at_date(payload, date, locale: "en", announcing:)
      heading = formatted_date(date, locale: locale)
      assert_selector ".ts-chart-tooltip", text: heading
      tooltip = find(".ts-chart-tooltip")
      assert tooltip.text.start_with?(heading), "the grouped tooltip must open with its plotted date"

      SERIES.each do |key|
        point = payload[key.to_sym].find { |candidate| candidate[:date] == date }
        next unless point

        label = I18n.with_locale(locale) { I18n.t("UI.account.chart.loan.#{key}") }
        money = Money.new(point[:balance], payload[:currency]).format(locale: locale)
        assert_includes tooltip.text.gsub(/[[:space:]]/, " "), "#{label}: #{money}".gsub(/[[:space:]]/, " ")
      end
      if announcing
        assert_selector ".ts-chart-tooltip[role='status'][aria-live='polite']", text: heading
      else
        assert_no_selector ".ts-chart-tooltip[aria-live='polite']"
      end
    end

    # Use the rendered axis's linear mapping rather than assumed chart margins.
    def point_at_date(date)
      page.execute_script(<<~JS, chart_svg)
        const svg = arguments[0];
        const ticks = Array.from(svg.querySelectorAll("text[data-ts-key^='x-tick-label:number:']"));
        const first = ticks[0];
        const last = ticks[ticks.length - 1];
        const timeOf = (tick) => Number(tick.dataset.tsKey.split(":").at(-1));
        const date = Date.parse(#{date.to_json} + "T00:00:00Z");
        const point = svg.createSVGPoint();
        point.x = Number(first.getAttribute("x")) +
          ((date - timeOf(first)) / (timeOf(last) - timeOf(first))) *
          (Number(last.getAttribute("x")) - Number(first.getAttribute("x")));
        point.y = svg.viewBox.baseVal.height / 2;
        const client = point.matrixTransform(svg.getScreenCTM());
        svg.dispatchEvent(new PointerEvent("pointermove", {
          clientX: client.x, clientY: client.y, bubbles: true
        }));
      JS
    end

    # Capybara retries its own matchers; a value read through evaluate_script
    # gets no such patience, so give it the same budget.
    def wait_until(timeout: Capybara.default_max_wait_time)
      deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + timeout
      sleep 0.05 until yield || Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline
    end

    def all_time_period
      Period.new(key: "all_time", start_date: Date.new(2020, 1, 1), end_date: TODAY)
    end

    # Built the way the account form builds one: with an opening valuation
    # for the amount borrowed. Without it Loan#original_balance falls back to
    # the current balance, and a loan part-way through its term would appear
    # to have borrowed only what it still owes.
    def loan_account
      account = Account.create!(
        family: @user.family, name: "Payoff Chart Loan",
        balance: 500_000, currency: "USD",
        accountable: Loan.new(subtype: "mortgage", interest_rate: 6, term_months: 24,
                              rate_type: "fixed", start_date: Date.new(2026, 1, 1))
      )
      account.entries.create!(
        date: Date.new(2026, 1, 1), name: "Opening balance", amount: 500_000, currency: "USD",
        entryable: Valuation.new(kind: "opening_anchor")
      )
      account
    end

    # A borrower exactly on contract, with the balance history the chart's
    # recorded line is drawn from. The projection then has somewhere to go; a
    # loan whose balance has run away has no payoff date at all, which is a
    # different test.
    def on_contract_loan_account
      account = loan_account
      rows = account.loan.amortization_schedule.payments.select { |p| p.date <= TODAY }
      account.update!(balance: rows.last.ending_balance.amount)
      account.balances.delete_all
      account.balances.create!(date: Date.new(2026, 1, 1), balance: 500_000, currency: "USD",
                               start_cash_balance: 500_000, flows_factor: -1)
      rows.each do |row|
        account.balances.create!(date: row.date, balance: row.ending_balance.amount, currency: "USD",
                                 start_cash_balance: row.ending_balance.amount, flows_factor: -1)
      end
      account.reload
    end
end
