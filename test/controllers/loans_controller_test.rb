require "test_helper"

class LoansControllerTest < ActionDispatch::IntegrationTest
  include AccountableResourceInterfaceTest

  setup do
    sign_in @user = users(:family_admin)
    @account = accounts(:loan)
  end

  test "overview preserves leverage insurance and repayment data" do
    get account_path(@account, format: :json, tab: "overview")
    assert_response :success
    assert_empty card_values("Leverage")
    assert_empty card_values("Insurance")

    @account.loan.update!(down_payment: 100_000, interest_rate: 5, term_months: 120, rate_type: "fixed",
      start_date: 2.years.ago.to_date, insurance_rate: 0.36, insurance_rate_type: "level_term")
    get account_path(@account, format: :json, tab: "overview")

    assert_response :success
    assert_equal [ "5.0x" ], card_values("Leverage")
    leverage = response.parsed_body["sections"].first["cards"].find { |card| card["label"] == "Leverage" }
    assert_equal "Moderate", leverage["description"]
    progress = response.parsed_body["sections"].find { |section| section["key"] == "repayment" }["progress"]
    assert_equal @account.loan.balance_paid_ratio * 100, progress["percent"]
    assert_includes progress["description"], "$500,000"
  end

  test "overview total cost matches the schedule and names the insurance premium it adds" do
    loan = @account.loan
    loan.update!(interest_rate: 5, term_months: 120, rate_type: "fixed", start_date: 2.years.ago.to_date)
    get account_path(@account, format: :json, tab: "overview")
    overview_cost = card_values("Total Cost")
    get account_path(@account, format: :json, tab: "schedule")
    assert_equal overview_cost, card_values("Total Cost")

    loan.update!(insurance_rate: 0.36, insurance_rate_type: "level_term")
    get account_path(@account, format: :json, tab: "overview")
    assert_empty card_values("Total Cost")
    assert_equal [ format_money(loan.reload.amortization_schedule.total_paid + loan.total_insurance) ], card_values("Total Cost incl. Insurance")
    get account_path(@account, format: :json, tab: "schedule")
    assert_equal overview_cost, card_values("Total Cost")
  end

  test "a recorded insurance rate is presented without a projectable premium" do
    @account.loan.update!(term_months: nil, insurance_rate: 0.36, insurance_rate_type: "level_term")
    get account_path(@account, format: :json, tab: "overview")
    assert_response :success
    assert_equal [ "0.36% a year" ], card_values("Insurance")
  end

  test "a negative opening balance has no leverage presentation" do
    @account.loan.update!(down_payment: 100_000)
    @account.entries.create!(date: Date.current - 2.years, name: "Opening balance", amount: -500_000,
      currency: @account.currency, entryable: Valuation.new(kind: "opening_anchor"))
    get account_path(@account, format: :json, tab: "overview")
    assert_response :success
    assert_empty card_values("Leverage")
  end

  # The form renders these fields, so a save must keep them. Measured against
  # the loan's own state before the request: all three start blank.
  test "updates the down payment and insurance terms from the form" do
    loan = @account.loan
    assert_nil loan.down_payment
    assert_nil loan.insurance_rate
    assert_nil loan.insurance_rate_type

    patch loan_path(@account), params: {
      account: {
        accountable_type: "Loan",
        accountable_attributes: {
          id: @account.accountable_id,
          down_payment: "100000", insurance_rate: "0.36", insurance_rate_type: "level_term"
        }
      }
    }

    assert_redirected_to @account
    loan.reload
    assert_equal BigDecimal("100000"), loan.down_payment
    assert_equal BigDecimal("0.36"), loan.insurance_rate
    assert_equal "level_term", loan.insurance_rate_type
  end

  # The type select's blank option is the form's "None": no type recorded, read
  # as decreasing. It submits an empty string, which must clear the type rather
  # than fail validation (and the column's check constraint, which admits NULL
  # but not '').
  test "the insurance type's blank option clears a recorded type" do
    @account.loan.update!(insurance_rate: 0.36, insurance_rate_type: "level_term")

    patch loan_path(@account), params: {
      account: {
        accountable_type: "Loan",
        accountable_attributes: { id: @account.accountable_id, insurance_rate_type: "" }
      }
    }

    assert_redirected_to @account
    assert_nil @account.loan.reload.insurance_rate_type
  end

  test "creates with loan details" do
    assert_difference -> { Account.count } => 1,
      -> { Loan.count } => 1,
      -> { Valuation.count } => 1,
      -> { Entry.count } => 1 do
      post loans_path, params: {
        account: {
          name: "New Loan",
          balance: 50000,
          currency: "USD",
          institution_name: "Local Bank",
          institution_domain: "localbank.example",
          notes: "Mortgage notes",
          accountable_type: "Loan",
          accountable_attributes: {
            subtype: "mortgage",
            interest_rate: 5.5,
            term_months: 60,
            rate_type: "fixed",
            initial_balance: 50000
          }
        }
      }
    end

    created_account = Account.order(:created_at).last

    assert_equal "New Loan", created_account.name
    assert_equal 50000, created_account.balance
    assert_equal "USD", created_account.currency
    assert_equal "Local Bank", created_account[:institution_name]
    assert_equal "localbank.example", created_account[:institution_domain]
    assert_equal "Mortgage notes", created_account[:notes]
    assert_equal "mortgage", created_account.accountable.subtype
    assert_equal 5.5, created_account.accountable.interest_rate
    assert_equal 60, created_account.accountable.term_months
    assert_equal "fixed", created_account.accountable.rate_type
    assert_equal 50000, created_account.accountable.initial_balance

    assert_redirected_to created_account
    assert_equal "Loan account created", flash[:notice]
    assert_enqueued_with(job: SyncJob)
  end

  test "updates with loan details" do
    assert_no_difference [ "Account.count", "Loan.count" ] do
      patch loan_path(@account), params: {
        account: {
          name: "Updated Loan",
          balance: 45000,
          currency: "USD",
          institution_name: "Updated Bank",
          institution_domain: "updatedbank.example",
          notes: "Updated loan notes",
          accountable_type: "Loan",
          accountable_attributes: {
            id: @account.accountable_id,
            subtype: "auto",
            interest_rate: 4.5,
            term_months: 48,
            rate_type: "fixed",
            initial_balance: 48000
          }
        }
      }
    end

    @account.reload

    assert_equal "Updated Loan", @account.name
    assert_equal 45000, @account.balance
    assert_equal "Updated Bank", @account[:institution_name]
    assert_equal "updatedbank.example", @account[:institution_domain]
    assert_equal "Updated loan notes", @account[:notes]
    assert_equal "auto", @account.accountable.subtype
    assert_equal 4.5, @account.accountable.interest_rate
    assert_equal 48, @account.accountable.term_months
    assert_equal "fixed", @account.accountable.rate_type
    assert_equal 48000, @account.accountable.initial_balance

    assert_redirected_to @account
    assert_equal "Loan account updated", flash[:notice]
    assert_enqueued_with(job: SyncJob)
  end

  test "schedule contains every contractual payment" do
    get account_path(@account, format: :json, tab: "schedule")

    assert_response :success
    rows = response.parsed_body["sections"].first.dig("table", "rows")
    assert_equal @account.loan.term_months, rows.size
    assert_equal @account.loan.amortization_schedule.payments.last.ending_balance.format, rows.last.dig("cells", "remaining_balance", "text")
    assert_equal @account.loan.amortization_schedule.payments.map { |payment| payment.date <= Date.current }, rows.map { |row| row["past"] }
  end

  test "a nonamortizable loan rejects the schedule tab and retains activity" do
    @account.loan.update!(rate_type: "")
    get account_path(@account, format: :json, tab: "schedule")

    assert_response :success
    assert_equal "activity", response.parsed_body["active_tab"]
    assert_not_includes response.parsed_body["tabs"].map { |tab| tab["id"] }, "schedule"
  end

  test "records rate changes and an origination date submitted through the form" do
    patch loan_path(@account), params: {
      account: {
        accountable_attributes: {
          id: @account.loan.id,
          rate_type: "variable",
          start_date: "2024-03-15",
          rate_changes: [
            { effective_date: "2026-04-01", rate: "7.25" },
            { effective_date: "2026-10-01", rate: "6.5" },
            { effective_date: "", rate: "" }
          ]
        }
      }
    }

    @account.loan.reload
    assert_equal({ "2026-04-01" => "7.25", "2026-10-01" => "6.5" }, @account.loan.variable_rate_schedule,
      "the wholly blank sentinel row must be dropped rather than persisted or raising")
    assert_equal Date.new(2024, 3, 15), @account.loan.start_date
    assert_equal Date.new(2024, 3, 15), @account.loan.origination_date
  end

  test "the schedule reflects a recorded rate change" do
    @account.loan.update!(rate_type: "variable", interest_rate: 6, term_months: 24)
    get account_path(@account, format: :json, tab: "schedule")
    flat_payments = schedule_table_cells

    change_date = @account.loan.origination_date >> 12
    @account.loan.update!(variable_rate_schedule: { change_date.iso8601 => "18.0" })
    get account_path(@account, format: :json, tab: "schedule")

    assert_response :success
    assert_equal flat_payments.length, schedule_table_cells.length
    assert_not_equal flat_payments, schedule_table_cells
    assert response.parsed_body["sections"].first["notices"].any?
    assert_equal 1, card_values(I18n.t("loans.tabs.schedule.opening_payment")).size
  end

  # #100 decision 8: a provider writes rate types the form never offers. The
  # select must still carry the loan's own value, or the browser submits the
  # first option and saving any other field turns an "arm" loan into a fixed
  # one without anyone choosing that.
  test "the edit form keeps a provider-written rate type as the selected option" do
    @account.loan.update!(rate_type: "arm")

    get edit_loan_path(@account)

    assert_response :success
    assert_select "select[name='account[accountable_attributes][rate_type]'] option[value='arm'][selected]", { count: 1 },
      "the provider's rate type must be the selected option"
    assert_select "select[name='account[accountable_attributes][rate_type]'] option[value='fixed']", count: 1
    assert_select "[data-loan-rate-changes-fixed-type-value='fixed']", count: 1
  end

  # A term the simulator will not walk leaves the loan without a schedule
  # (see Loan#amortizable?). The model stays tolerant because a provider writes
  # this column too; the form is where a person typing it is told the limit.
  test "the term input declares the range a schedule can be built for" do
    get edit_loan_path(@account)

    assert_response :success
    assert_select "input[name='account[accountable_attributes][term_months]'][min='1'][max='#{Loan::Simulator::MAX_PERIODS}']", count: 1
  end

  # A row with one half filled in is a typo, not a blank. Dropping it silently
  # loses what the user typed between submit and redisplay and never tells them
  # which row went.
  test "a half-filled rate change is rejected rather than silently dropped" do
    @account.loan.update!(rate_type: "variable", start_date: Date.new(2026, 1, 1),
                          variable_rate_schedule: { "2026-04-01" => "7.25" })

    patch loan_path(@account), params: {
      account: { accountable_attributes: {
        id: @account.loan.id, rate_type: "variable",
        rate_changes: [ { effective_date: "", rate: "9" } ]
      } }
    }

    # Asserted on the response, not on a Loan rebuilt in the test: a redirect
    # with the schedule untouched would otherwise pass.
    assert_response :unprocessable_entity
    assert_equal({ "2026-04-01" => "7.25" }, @account.loan.reload.variable_rate_schedule,
      "a rejected submission must not alter the persisted schedule")
    assert_select "input[name='account[accountable_attributes][rate_changes][][rate]'][value='9']", { count: 1 },
      "the typed row comes back so the form can redisplay it"
  end

  # Removing every row must clear the schedule. Without the form's blank
  # sentinel the PATCH carries no rate_changes key at all, nested assignment
  # never calls the writer, and the removed rows stay persisted.
  test "submitting only the blank sentinel clears the schedule" do
    @account.loan.update!(rate_type: "variable", start_date: Date.new(2026, 1, 1),
                          variable_rate_schedule: { "2026-04-01" => "7.25" })

    # The sentinel is a bare `rate_changes[]=` with no value, which Rack parses
    # as "" and strong parameters drop, so the writer receives an empty array.
    patch loan_path(@account), params: {
      account: { accountable_attributes: {
        id: @account.loan.id, rate_type: "variable", rate_changes: [ "" ]
      } }
    }

    assert_empty @account.loan.reload.variable_rate_schedule
  end

  test "the loan chart exposes recorded scheduled and projected lines with independent styles" do
    origination = Date.current.prev_year
    @account.loan.update!(start_date: origination)
    @account.balances.create!(date: origination, balance: 500_000, currency: "USD", start_cash_balance: 500_000, flows_factor: -1)
    @account.balances.create!(date: Date.current, balance: 490_000, currency: "USD", start_cash_balance: 490_000, flows_factor: -1)
    get account_path(@account, format: :json, period: "all_time")

    assert_response :success
    series = response.parsed_body.dig("chart", "series")
    assert_equal %w[actual projected scheduled], series.map { |line| line["key"] }.sort
    assert series.all? { |line| line["points"].size > 1 }
    assert_not series.find { |line| line["key"] == "actual" }["dashed"]
    assert series.find { |line| line["key"] == "projected" }["dashed"]
    assert_equal "destructive", series.find { |line| line["key"] == "scheduled" }["tone"]
    assert response.parsed_body.dig("chart", "aria_description").present?
  end

  test "an extra-payment parameter leaves the contracted loan chart unchanged" do
    get account_path(@account, format: :json)
    baseline = response.parsed_body["chart"]
    get account_path(@account, format: :json, extra_payment: { amount: "2000", frequency: "monthly" })

    assert_response :success
    assert_equal baseline, response.parsed_body["chart"]
  end

  test "a loan without a schedule uses the ordinary balance chart" do
    @account.loan.update!(rate_type: "")
    get account_path(@account, format: :json)

    assert_response :success
    assert_equal [ "balance" ], response.parsed_body.dig("chart", "series").map { |line| line["key"] }
    assert_nil response.parsed_body.dig("chart", "aria_description")
  end
  # The validation lives on Loan and is reached through nested attributes, which
  # validate the nested record only when it has changes. Resubmitting the stored
  # rows plus a typo'd one leaves the column equal to its stored value, so
  # without `Loan#changed_for_autosave?` the account saved with a 302 and the
  # typo'd row vanished.
  test "an invalid row is rejected even when nothing else on the loan changed" do
    @account.loan.update!(rate_type: "variable", start_date: Date.new(2026, 1, 1),
                          variable_rate_schedule: { "2026-04-01" => "7.25" })

    patch loan_path(@account), params: { account: { accountable_attributes: {
      id: @account.loan.id, rate_type: "variable",
      rate_changes: [ "", { effective_date: "2026-04-01", rate: "7.25" }, { effective_date: "", rate: "9" } ]
    } } }

    assert_response :unprocessable_entity
    assert_select "input[name='account[accountable_attributes][rate_changes][][rate]'][value='9']", { count: 1 },
      "the typed row must come back for correction"
    assert_equal({ "2026-04-01" => "7.25" }, @account.loan.reload.variable_rate_schedule)
  end

  # Retained rows are rendered for a fixed loan too, hidden and disabled, so
  # switching the select to variable reveals them and a save keeps them.
  # Before this, `rate_change_rows` was empty for a fixed loan, the revealed
  # section was empty, and saving sent only the sentinel, which cleared them.
  test "a fixed loan's retained rate changes survive switching to variable and saving" do
    @account.loan.update!(rate_type: "fixed", start_date: Date.new(2026, 1, 1),
                          variable_rate_schedule: { "2026-04-01" => "7.25" })

    get edit_loan_path(@account)

    assert_response :success
    assert_select "[data-loan-rate-changes-target=rows] [data-rate-change-row]", count: 1
    assert_select "[data-loan-rate-changes-target=rows] input[disabled][value='2026-04-01']", { count: 1 },
      "retained rows are disabled while the loan is fixed, so they are not submitted"

    # What the browser sends after the select is flipped to variable and the
    # inputs are enabled: the sentinel and the row it rendered.
    patch loan_path(@account), params: { account: { accountable_attributes: {
      id: @account.loan.id, rate_type: "variable",
      rate_changes: [ "", { effective_date: "2026-04-01", rate: "7.25" } ]
    } } }

    assert_equal({ "2026-04-01" => "7.25" }, @account.loan.reload.variable_rate_schedule)
    assert_equal "variable", @account.loan.rate_type
  end

  # `disabled` used to be applied only by Stimulus, so without JavaScript the
  # sentinel submitted and the writer read it as "remove them all".
  test "the edit form of a fixed loan disables the whole rate-change section server-side" do
    @account.loan.update!(rate_type: "fixed", start_date: Date.new(2026, 1, 1),
                          variable_rate_schedule: { "2026-04-01" => "7.25" })

    get edit_loan_path(@account)

    assert_select "[data-loan-rate-changes-target=section][hidden]", count: 1
    assert_select "[data-loan-rate-changes-target=section] input[name='account[accountable_attributes][rate_changes][]'][disabled]", { count: 1 },
      "the sentinel must be disabled too, or a no-JS save clears the schedule"
    # The <template> clone is inert and is left enabled; only rendered rows and
    # the add button are submittable.
    assert_select "[data-loan-rate-changes-target=rows] input:not([disabled])", count: 0
    assert_select "[data-loan-rate-changes-target=rows] button:not([disabled])", count: 0
    assert_select "[data-loan-rate-changes-target=section] button[data-action='loan-rate-changes#add']:not([disabled])", count: 0
  end

  test "a variable loan's edit form enables the rate-change section server-side" do
    @account.loan.update!(rate_type: "variable", start_date: Date.new(2026, 1, 1),
                          variable_rate_schedule: { "2026-04-01" => "7.25" })

    get edit_loan_path(@account)

    assert_select "[data-loan-rate-changes-target=section][hidden]", count: 0
    assert_select "[data-loan-rate-changes-target=rows] input[disabled]", count: 0
    assert_select "[data-loan-rate-changes-target=section] input[name='account[accountable_attributes][rate_changes][]']:not([disabled])", count: 1
  end

  # The payload runs the schedule, the projection and a balance query on every
  # loan page view, from provider-written and user-written inputs. A raise in
  # any of them must cost the chart, not the page: before this guard the whole
  # account page was a 500 for a loan that rendered fine without the chart.
  test "a chart payload that raises degrades to the time-series chart instead of a 500" do
    Loan::PayoffChart.any_instance.stubs(:payload).raises(ArgumentError, "boom")

    get account_path(@account, format: :json, tab: "schedule")

    assert_response :success
    assert_equal [ "balance" ], response.parsed_body.dig("chart", "series").map { |series| series["key"] }
    assert_equal "schedule", response.parsed_body["active_tab"]
    assert_equal "$0.00", response.parsed_body["sections"].first.dig("table", "rows").last.dig("cells", "remaining_balance", "text")
  end

  # Owner review of #3474: the rate changes open from a collapsed disclosure,
  # as Additional details does, and the loan's fields keep the form's spacing
  # instead of stacking flush against each other.
  test "the rate changes sit in a collapsed disclosure and the loan fields are spaced" do
    @account.loan.update!(rate_type: "variable", start_date: Date.new(2026, 1, 1),
                          variable_rate_schedule: { "2026-04-01" => "7.25" })

    get edit_loan_path(@account)

    assert_select "[data-loan-rate-changes-target=section] details:not([open]) > summary", text: /#{I18n.t("loans.form.rate_changes")}/
    assert_select "[data-loan-rate-changes-target=section] details [data-loan-rate-changes-target=rows] input[name$='[rate]'][value='7.25']", count: 1
    assert_select "[data-controller='loan-rate-changes'].space-y-2", count: 1
  end

  # Owner review of #3474: what kind of loan it is belongs with the account's
  # own fields, straight after the balance, before the loan's terms.
  test "the subtype sits under the balance, above the loan's terms" do
    get edit_loan_path(@account)

    body = response.body
    balance = body.index('name="account[balance]"')
    subtype = body.index('name="account[accountable_attributes][subtype]"')
    terms = body.index('name="account[accountable_attributes][initial_balance]"')
    assert balance && subtype && terms, "the balance, subtype and original balance fields must all render"
    assert_operator balance, :<, subtype, "the subtype comes after the balance"
    assert_operator subtype, :<, terms, "the subtype comes before the loan's terms"
  end

  # `Account.create_and_sync` saves with `save!`, and this is the first Loan
  # validation a user can trip from the create form. Without a rescue the
  # request ended on the generic 422 error page and the form was gone.
  test "a half-filled rate change on create re-renders the form instead of the error page" do
    assert_no_difference [ "Account.count", "Loan.count" ] do
      post loans_path, params: { account: {
        name: "Bad Loan", balance: 50_000, currency: "USD", accountable_type: "Loan",
        accountable_attributes: {
          rate_type: "variable", interest_rate: 6, term_months: 12, initial_balance: 50_000,
          rate_changes: [ "", { effective_date: "", rate: "9" } ]
        }
      } }
    end

    assert_response :unprocessable_entity
    assert_select "form[action='#{loans_path}']", count: 1, message: "the new-loan form comes back"
    assert_select "input[name='account[accountable_attributes][rate_changes][][rate]'][value='9']", count: 1
    assert_match "effective date and a rate", response.body
  end

  test "variable overview quotes the rate and repayment in force today" do
    @account.loan.update!(rate_type: "variable", interest_rate: 6, start_date: Date.current - 2.years,
      variable_rate_schedule: { (Date.current - 1.month).iso8601 => "7.25" })
    get account_path(@account, format: :json, tab: "overview")

    assert_response :success
    assert_equal [ "7.250%" ], card_values(I18n.t("loans.tabs.overview.interest_rate"))
    payment = @account.loan.amortization_schedule.payment_in_force(Date.current)
    assert_equal [ format_money(payment) ], card_values(I18n.t("loans.tabs.overview.monthly_payment"))
  end

  test "fixed overview retains its contracted rate and repayment" do
    @account.loan.update!(rate_type: "fixed", interest_rate: 6, term_months: 360)
    get account_path(@account, format: :json, tab: "overview")

    assert_response :success
    assert_equal [ "6.000%" ], card_values(I18n.t("loans.tabs.overview.interest_rate"))
    assert_equal [ format_money(@account.loan.monthly_payment) ], card_values(I18n.t("loans.tabs.overview.monthly_payment"))
  end

  test "loan HTML requests including obsolete frames never run the payoff chart" do
    Loan::PayoffChart.any_instance.expects(:payload).never
    Loan.any_instance.expects(:payoff_projection).never
    get account_path(@account, period: "all_time"), headers: { "Turbo-Frame" => ActionView::RecordIdentifier.dom_id(@account, :chart_details) }

    assert_response :success
    assert_select "#spa-root"
  end

  test "overview exposes the original contractual payoff date independently of the forecast" do
    get account_path(@account, format: :json, tab: "overview")

    assert_response :success
    assert_equal [ I18n.l(@account.loan.amortization_schedule.payoff_date, format: :long) ], card_values("Original Payoff Date")
    assert_equal 1, card_values("Original Loan Amount").size
    assert_equal 1, card_values("Remaining Loan Amount").size
    get account_path(@account, format: :json, tab: "schedule")
    assert_empty card_values("Original Payoff Date")
  end

  test "schedule forecasts payoff from today's recorded balance" do
    draw_down_loan_two_years_ago
    schedule = @account.loan.amortization_schedule
    scheduled_today = schedule.payments.select { |payment| payment.date <= Date.current }.last
    @account.update!(balance: scheduled_today.ending_balance.amount / 2)
    forecast = @account.loan.reload.payoff_projection(as_of: Date.current).payoff_date
    assert_operator forecast, :<, schedule.payoff_date
    get account_path(@account, format: :json, tab: "schedule")

    assert_response :success
    assert_equal [ I18n.l(forecast, format: :long) ], card_values("Forecasted Payoff Date")
  end

  test "schedule presents nonconvergence instead of an invented payoff date" do
    draw_down_loan_two_years_ago
    @account.update!(balance: @account.loan.original_balance.amount * 10)
    assert_not @account.loan.reload.payoff_projection(as_of: Date.current).converged?
    get account_path(@account, format: :json, tab: "schedule")

    assert_response :success
    assert_equal [ "Not paid off on the current repayment" ], card_values("Forecasted Payoff Date")
    assert response.parsed_body.dig("chart", "notices").any?
    assert_empty response.parsed_body.dig("chart", "cards")
  end


  # Codex on we-promise/sure#3473: `update` persisted the balance change (a
  # valuation and the account's cached balance) before the loan's validation
  # ran, so a rejected form had committed half of itself.
  test "a rejected update does not persist the balance change submitted with it" do
    @account.loan.update!(rate_type: "variable", start_date: Date.new(2026, 1, 1),
                          variable_rate_schedule: { "2026-04-01" => "7.25" })
    balance_before = @account.reload.balance

    assert_no_difference "Entry.count" do
      patch loan_path(@account), params: { account: {
        balance: balance_before - 10_000,
        accountable_attributes: {
          id: @account.loan.id, rate_type: "variable",
          rate_changes: [ "", { effective_date: "2026-04-01", rate: "7.25" }, { effective_date: "", rate: "9" } ]
        }
      } }
    end

    assert_response :unprocessable_entity
    assert_equal balance_before, @account.reload.balance, "the balance half of a rejected form must not commit"
  end

  # CodeRabbit on we-promise/sure#3474: `lock_saved_attributes!` saves with
  # `update!`. Run after the transaction had committed, a raise there left the
  # balance change and the attribute update in place behind a failed request.
  test "an update whose attribute lock fails commits neither the balance nor the attributes" do
    balance_before = @account.reload.balance
    name_before = @account.name
    Account.any_instance.stubs(:lock_saved_attributes!).raises(ActiveRecord::RecordInvalid.new(@account))

    assert_no_difference "Entry.count" do
      patch loan_path(@account), params: { account: { name: "Renamed Loan", balance: balance_before - 10_000 } }
    end

    assert_response :unprocessable_entity
    assert_select "form[action='#{loan_path(@account)}']", count: 1
    assert_equal balance_before, @account.reload.balance, "the balance must roll back with the failed lock"
    assert_equal name_before, @account.name, "the attribute update must roll back with the failed lock"
  end

  test "a successful balance update saves the other submitted values" do
    balance_before = @account.reload.balance
    updated_balance = balance_before - 10_000

    patch loan_path(@account), params: { account: {
      name: "Updated loan name",
      balance: updated_balance,
      accountable_attributes: { id: @account.loan.id, interest_rate: "7.25" }
    } }

    assert_redirected_to account_path(@account)
    assert_equal updated_balance, @account.reload.balance
    assert_equal "Updated loan name", @account.name
    assert_equal BigDecimal("7.25"), @account.loan.reload.interest_rate
  end

  # CodeRabbit on we-promise/sure#3473: a failed balance result exits before
  # the ordinary update path, so the 422 form must still receive the other
  # values the user submitted.
  test "a failed balance update keeps the other submitted values in the form" do
    balance_before = @account.reload.balance
    name_before = @account.name
    rate_before = @account.loan.interest_rate
    failed_balance = Account::CurrentBalanceManager::Result.new(
      success?: false, changes_made?: false, error: "Balance update failed"
    )
    Account.any_instance.stubs(:set_current_balance).returns(failed_balance)

    assert_no_difference "Entry.count" do
      patch loan_path(@account), params: { account: {
        name: "Unsaved loan name",
        notes: "Unsaved loan notes",
        balance: balance_before - 10_000,
        accountable_attributes: { id: @account.loan.id, interest_rate: "7.25" }
      } }
    end

    assert_response :unprocessable_entity
    assert_select "input[name='account[name]'][value='Unsaved loan name']", count: 1
    assert_select "input[name='account[accountable_attributes][interest_rate]'][value='7.25']", count: 1
    assert_match "Balance update failed", response.body
    assert_equal balance_before, @account.reload.balance
    assert_equal name_before, @account.name
    assert_equal rate_before, @account.loan.reload.interest_rate
  end

  # CodeRabbit on we-promise/sure#3473: `loans/new` renders the method
  # selector when `step=method_select`, which reads `@provider_configs`; the
  # rescue path must set it up as `new` does.
  test "a rejected create with the method-select step still renders" do
    post loans_path(step: "method_select"), params: { account: {
      name: "Bad Loan", balance: 50_000, currency: "USD", accountable_type: "Loan",
      accountable_attributes: { rate_type: "variable", interest_rate: 6, term_months: 12, initial_balance: 50_000,
                                rate_changes: [ "", { effective_date: "", rate: "9" } ] }
    } }

    assert_response :unprocessable_entity
  end

  test "the rate-change controls are design-system buttons" do
    @account.loan.update!(rate_type: "variable", start_date: Date.new(2026, 1, 1),
                          variable_rate_schedule: { "2026-04-01" => "7.25" })

    get edit_loan_path(@account)

    assert_select "button[data-action='loan-rate-changes#add'] span", text: I18n.t("loans.form.rate_change_add")
    assert_select "[data-rate-change-row] button[data-action='loan-rate-changes#remove'] span", text: I18n.t("loans.form.rate_change_remove")
  end

  # The design-system guide asks inputs to take the form's field shape. The rows
  # were bare inputs outside any .form-field, so they rendered with no field
  # border and no visible label. The partial is also the Stimulus clone
  # template, so each label wraps its input rather than pointing at an id that
  # every cloned row would repeat.
  test "each rate-change input is a labelled form field without an id" do
    @account.loan.update!(rate_type: "variable", start_date: Date.new(2026, 1, 1),
                          variable_rate_schedule: { "2026-04-01" => "7.25" })

    get edit_loan_path(@account)

    assert_response :success
    rows = "[data-loan-rate-changes-target=rows] [data-rate-change-row]"
    assert_select "#{rows} .form-field label", count: 2
    assert_select "#{rows} .form-field label input[type=date][value='2026-04-01']", count: 1
    assert_select "#{rows} .form-field label input[type=number][value='7.25']", count: 1
    assert_select "#{rows} .form-field__label", text: I18n.t("loans.form.rate_change_effective_date")
    assert_select "#{rows} .form-field__label", text: I18n.t("loans.form.rate_change_rate")
    # Unscoped on purpose: the <template> copy is the one every added row clones.
    assert_select "[data-rate-change-row] input[id]", count: 0
  end

  # CodeRabbit on we-promise/sure#3473: `create_and_sync` can raise RecordInvalid
  # from the opening valuation's `entries.create!` or from `lock_saved_attributes!`,
  # and then `e.record` is an Entry or the accountable, not the account the form
  # renders.
  test "a create that fails on the opening valuation still re-renders the form" do
    invalid_entry = Entry.new.tap(&:validate)
    Account::OpeningBalanceManager.any_instance.stubs(:set_opening_balance)
      .raises(ActiveRecord::RecordInvalid.new(invalid_entry))

    assert_no_difference "Account.count" do
      post loans_path, params: { account: {
        name: "Loan With Bad Anchor", balance: 50_000, currency: "USD", accountable_type: "Loan",
        accountable_attributes: { rate_type: "fixed", interest_rate: 6, term_months: 12, initial_balance: 50_000 }
      } }
    end

    assert_response :unprocessable_entity
    assert_select "form[action='#{loans_path}']", count: 1
    # Rebuilt from the submission, not a blank account: what was typed comes
    # back for correction.
  end

  private
    def schedule_table_cells
      response.parsed_body["sections"].find { |section| section["key"] == "schedule" }.dig("table", "rows").flat_map do |row|
        row["cells"].values.map { |cell| cell["text"] }
      end
    end

    # The fixture loan starts today with no opening valuation. Drawn down two
    # years ago, it has payments behind it; with the valuation the account form
    # records, its principal stays the amount borrowed when a test then moves
    # the balance -- without one the schedule would amortise the new balance.
    def draw_down_loan_two_years_ago
      start_date = Date.current - 2.years
      @account.loan.update!(start_date: start_date)
      @account.entries.create!(
        date: start_date, name: "Opening balance", amount: @account.balance, currency: @account.currency,
        entryable: Valuation.new(kind: "opening_anchor")
      )
    end

    def card_values(title)
      response.parsed_body["sections"].flat_map { |section| section["cards"] }.select { |card| card["label"] == title }.map { |card| card["value"] }
    end

    def format_money(money)
      ApplicationController.helpers.format_money(money)
    end
end
