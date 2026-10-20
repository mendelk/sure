# Session-authenticated account-detail presentation. Financial calculations stay in
# the existing account, loan, holding and reconciliation objects.
class Account::PageData
  def self.tabs_for(account)
    tabs = case account.accountable_type
    when "Investment", "Crypto" then %w[activity holdings]
    when "Loan" then account.loan.amortizable? ? %w[activity overview schedule] : %w[activity overview]
    when "Property", "Vehicle" then %w[activity overview]
    else %w[activity]
    end
    tabs + [ "statements" ]
  end

  def initialize(account:, view:, period:, chart_view:, active_tab:, tabs:, as_of:, loan_chart:, projection:,
                 feed:, pagination:, accessible_account_ids:, coverage:, statements:, reconciliation_statuses:, can_manage_statements:)
    @account, @view, @period, @chart_view = account, view, period, chart_view
    @active_tab, @tabs, @as_of = active_tab, tabs, as_of
    @loan_chart, @projection, @feed, @pagination = loan_chart, projection, feed, pagination
    @accessible_account_ids, @coverage = accessible_account_ids, coverage
    @statements, @reconciliation_statuses, @can_manage_statements = statements, reconciliation_statuses, can_manage_statements
    @managed = account.permission_for(Current.user).in?([ :owner, :full_control ])
  end

  def as_json(*)
    {
      id: account.id, name: account.name, account_type: account.accountable_type.underscore,
      currency: account.currency, subtitle: account.property? ? account.property.address&.to_s : nil,
      logo_url: account.logo_url,
      color: account.accountable.color, syncing: account.syncing?, shared: account.shared?,
      owner_name: account.owned_by?(Current.user) ? nil : account.owner&.display_name,
      tax_treatment: account.tax_treatment.present? ? t("accounts.tax_treatments.#{account.tax_treatment}") : nil,
      draft: account.draft?, actions: header_actions, sync_action: sync_action,
      tabs: @tabs.map { |tab| { id: tab.to_s, label: t("accounts.show.tabs.#{tab}") } },
      active_tab: @active_tab, chart: chart_data, fx_warning: fx_warning,
      activity: @active_tab == "activity" ? activity_data : nil,
      sections: sections, text: text,
      balance: account.balance.to_f,
      linked: account.linked?,
      subtype: account.subtype,
      institution_name: account.institution_name,
      institution_domain: account.institution_domain,
      notes: account.notes,
      exclude_from_reports: account.exclude_from_reports?,
      accountable: accountable_prefill,
      loan: (
        if account.loan?
          loan = account.loan
          {
            subtype: loan.subtype,
            initial_balance: loan.initial_balance&.to_f,
            interest_rate: loan.interest_rate&.to_f,
            rate_type: loan.rate_type,
            down_payment: loan.down_payment&.to_f,
            start_date: loan.start_date&.iso8601,
            term_months: loan.term_months,
            insurance_rate: loan.insurance_rate&.to_f,
            insurance_rate_type: loan.insurance_rate_type
          }
        end
      )
    }
  end

  private
    attr_reader :account, :view

    def t(key, **options)
      I18n.t(key, **options)
    end

    def managed?
      @managed
    end
    # Manual-account edit prefill for the SPA drawers. Mirrors the API
    # jbuilder's accountable serialization so HTML and API prefill agree.
    def accountable_prefill
      accountable = account.accountable
      base = { subtype: accountable.try(:subtype) }
      case accountable
      when Vehicle
        base.merge(make: accountable.make, model: accountable.model, year: accountable.year,
          mileage_value: accountable.mileage_value, mileage_unit: accountable.mileage_unit)
      when CreditCard
        base.merge(available_credit: accountable.available_credit&.to_f,
          minimum_payment: accountable.minimum_payment&.to_f, apr: accountable.apr&.to_f,
          annual_fee: accountable.annual_fee&.to_f,
          expiration_date: accountable.expiration_date&.iso8601,
          payment_due_day: accountable.payment_due_day,
          estimated_payment_due_day: accountable.payment_schedule.inferred_due_day,
          payment_due_day_source: accountable.payment_schedule.due_day_source,
          statement_gap_days: CreditCard::PaymentSchedule::STATEMENT_GAP_DAYS)
      when Property
        base.merge(year_built: accountable.year_built, area_value: accountable.area_value,
          area_unit: accountable.area_unit, address: address_prefill(accountable.address))
      when Crypto
        base.merge(tax_treatment: accountable.tax_treatment)
      else
        base
      end
    end

    def address_prefill(address)
      return nil if address.nil?

      {
        line1: address.line1, line2: address.line2, locality: address.locality,
        region: address.region, country: address.country, postal_code: address.postal_code,
        county: address.county
      }
    end


    def action(key, label, href, icon, method: "get", confirm: nil, params: {})
      { key: key.to_s, label: label, href: href, icon: icon, method: method, confirm: confirm, params: params }
    end

    def card(label, value, description: nil, tone: "primary")
      { label: label, value: value.to_s, description: description, tone: tone }
    end

    def section(key, title: nil, description: nil, cards: [], notices: [], fields: [], table: nil, actions: [], progress: nil, coverage: nil, upload: nil)
      { key: key, title: title, description: description, cards: cards, notices: notices, fields: fields,
        table: table, actions: actions, progress: progress, coverage: coverage, upload: upload }
    end
    def cell(text, secondary: nil, href: nil, tone: "primary", privacy: false, logo: nil)
      { text: text.to_s, secondary: secondary, href: href, tone: tone, privacy: privacy, logo: logo }
    end

    def money(value)
      value&.format || "—"
    end


    def date(value)
      value ? I18n.l(value.to_date, format: :long) : "—"
    end

    def favorable?(trend)
      trend.direction == "flat" || trend.direction == trend.favorable_direction
    end

    def header_actions
      prefix = "accounts.show.menu"
      result = []
      result << action(:edit, t("#{prefix}.edit"), view.edit_account_path(account), "pencil-line") if managed?
      result << action(:complete_setup, t("accounts.show.header.complete_setup"), view.edit_account_path(account), "pencil-line") if account.draft? && managed?
      result << action(:sharing, t("#{prefix}.sharing"), view.account_sharing_path(account), "users")
      result << action(:statements, t("#{prefix}.statements"), view.account_path(account, tab: "statements"), "archive", params: { "tab" => "statements" })
      if managed?
        key = account.exclude_from_reports? ? "include_in_reports" : "exclude_from_reports"
        result << action(key, t("#{prefix}.#{key}"), view.toggle_exclude_from_reports_account_path(account), account.exclude_from_reports? ? "eye" : "eye-off", method: "patch")
        if account.supports_trades? || !account.crypto?
          trade = account.supports_trades?
          result << action(:import, t("#{prefix}.#{trade ? 'import_trades' : 'import_transactions'}"), view.imports_path(import: { type: trade ? "TradeImport" : "TransactionImport", account_id: account.id }), "download")
        end
        if !account.linked? && %w[Depository CreditCard Investment Crypto].include?(account.accountable_type)
          result << action(:link_simplefin_account, t("simplefin_items.provider_replacement.link_simplefin"),
            view.account_provider_replacement_path(account), "link")
        elsif account.linked_to?("SimplefinAccount")
          result << action(:change_simplefin_account, t("accounts.account.change_simplefin_account"),
            view.account_provider_replacement_path(account), "arrow-left-right")
        end
      end
      if account.owned_by?(Current.user) && !account.linked?
        result << action(:delete, t("#{prefix}.delete_account"), view.account_path(account), "trash-2", method: "delete", confirm: t("accounts.show.spa.delete_account_confirm", name: account.name))
      end
      result
    end

    def sync_action
      return nil unless managed? && (Rails.env.development? || view.self_hosted?)
      return nil if account.syncing?

      action(:sync, t("accounts.show.spa.refresh"), view.sync_account_path(account), "refresh-cw", method: "post")
    end

    def chart_data
      chart = UI::Account::Chart.new(account: account, period: @period, view: @chart_view, loan_chart: @loan_chart)
      trend = chart.trend || Trend.new(current: account.balance_money, previous: account.balance_money, favorable_direction: account.favorable_direction)
      period = chart.period
      keys = @loan_chart ? Loan::PayoffChart::WINDOW_KEYS : Period::PERIODS.keys
      cards, notices = [], []
      if @loan_chart
        if chart.loan_projected_payoff_date
          cards << card(t("UI.account.chart.loan.projected_payoff"), date(chart.loan_projected_payoff_date), description: chart.loan_schedule_comparison)
          cards << card(t("UI.account.chart.loan.interest_saved"), money(chart.loan_interest_saved_money))
          notices << t("UI.account.chart.loan.projection_basis")
        elsif chart.loan_projection_not_converged?
          notices << t("UI.account.chart.loan.not_converged", balloon: money(chart.loan_balloon_money))
        end
      end
      series = if @loan_chart
        @loan_chart[:visible].map do |key|
          { key: key.to_s, label: @loan_chart[:labels][key.to_sym], tone: key.to_s == "scheduled" ? "destructive" : "success",
            dashed: key.to_s != "actual", points: @loan_chart[key.to_sym].map { |point| { date: point[:date], value: point[:balance].to_f, formatted: Money.new(point[:balance], account.currency).format } } }
        end
      else
        [ { key: "balance", label: chart.title, tone: trend.direction == "flat" ? "primary" : favorable?(trend) ? "success" : "destructive", dashed: false,
           points: chart.series.as_json[:values].map { |point| { date: point[:date].iso8601, value: point[:value].amount.to_f, formatted: point[:value].format } } } ]
      end
      selected_key = @loan_chart ? chart.period_picker_selected : period.key
      {
        title: chart.title, value: chart.view_balance_display, converted_value: chart.converted_balance_display,
        currency: account.currency, view: @chart_view,
        views: (account.supports_trades? ? { "balance" => "total_value", "holdings_balance" => "holdings", "cash_balance" => "cash", "gains" => "gains" } : { "balance" => "total_value" }).map { |key, label| { key: key, label: t("UI.account.chart.views.#{label}") } },
        period: { key: selected_key, label: selected_key ? Period.from_key(selected_key).label_short : "#{date(period.start_date)} – #{date(period.end_date)}", start_date: (@loan_chart ? @loan_chart[:domain_start] : period.start_date.iso8601), end_date: (@loan_chart ? @loan_chart[:domain_end] : period.end_date.iso8601) },
        periods: keys.map { |key| { key: key, label: Period.from_key(key).label_short } },
        trend: { value: money(trend.value), percent: trend.percent_formatted, direction: trend.direction.to_s, favorable: favorable?(trend), comparison_label: chart.comparison_label },
        series: series, markers: @loan_chart ? [ { date: @as_of.iso8601, label: t("UI.account.chart.loan.today") } ] : [],
        breakdown: account.supports_trades? ? [
          card(t("investments.value_tooltip.cash"), money(account.cash_balance_money)),
          card(t("investments.value_tooltip.holdings"), money(chart.holdings_value_money)),
          card(t("investments.value_tooltip.total"), money(account.balance_money), description: t("investments.value_tooltip.total_value_tooltip"))
        ] : [],
        aria_description: @loan_chart&.dig(:aria_description), no_data_label: t("UI.account.chart.no_data_available"), cards: cards, notices: notices
      }
    end

    def fx_warning
      return nil if account.currency == account.family.currency

      start = ExchangeRatePair.for_pair(from: account.currency, to: account.family.currency).first_provider_rate_on
      oldest = account.entries.minimum(:date) if start
      t("accounts.show.limited_fx_history_warning", date: date(start)) if oldest && oldest < start
    end

    def activity_data
      {
        groups: @feed.entries_by_date.map do |group|
          { date: group.date.iso8601, label: date(group.date), balance: money(group.balance&.end_balance_money || Money.new(0, account.currency)),
            reconciliation: group.balance ? UI::Account::BalanceReconciliation.new(balance: group.balance, account: account).reconciliation_items.map { |item| item.merge(value: money(item[:value]), style: item[:style].to_s) } : [],
            entries: group.entries.map { |entry| activity_entry(entry) } }
        end,
        pagination: { page: @pagination.page, per_page: @pagination.limit, total_pages: @pagination.pages, total_count: @pagination.count },
        new_actions: new_actions,
        bulk_actions: { edit: view.new_transactions_bulk_update_path, delete: view.transactions_bulk_deletion_path, duplicate: view.new_transaction_path }
      }
    end

    def transaction_data(transaction)
      builder = JbuilderTemplate.new(view)
      builder.partial!("api/v1/transactions/transaction", transaction: transaction)
      data = builder.attributes!
      transfer = transaction.transfer
      if transfer
        other = transfer.inflow_transaction_id == transaction.id ? transfer.outflow_transaction : transfer.inflow_transaction
        unless other && @accessible_account_ids.include?(other.entry.account_id)
          data["transfer"].delete("other_account")
          data["transfer"]["amount"] = transaction.entry.amount_money.abs.format
          data["transfer"]["currency"] = transaction.entry.currency
        end
      end
      data
    end

    def activity_entry(entry)
      entryable = entry.entryable
      transaction = entry.transaction? ? entryable : nil
      parent = @feed.split_parents[entry.parent_entry_id]
      amount = entry.valuation? ? entry.amount_money : -entry.amount_money
      label = entryable.respond_to?(:investment_activity_label) ? entryable.investment_activity_label : nil
      editable_activity = managed? && account.supports_trades? && !entry.valuation? && !(entry.trade? && label.in?(%w[Dividend Interest]))
      badges = []
      badges << { label: t("entries.protection.tooltip"), tooltip: t("entries.protection.tooltip"), icon: "lock" } if entry.protected_from_sync?
      if transaction&.has_potential_duplicate?
        badges << { label: t(transaction.low_confidence_duplicate? ? "transactions.transaction.review_recommended" : "transactions.transaction.possible_duplicate"), tooltip: t("transactions.transaction.potential_duplicate_tooltip"), icon: "alert-triangle" }
      end
      if entry.valuation? && entry.valuation.kind == "opening_anchor"
        badges << { label: t("valuations.show.opening_balance"), tooltip: nil, icon: "circle-dollar-sign" }
      end
      actions = []
      if transaction && managed? && account.investment?
        actions << action(:convert, t("accounts.show.spa.convert_to_trade"), view.convert_to_trade_transaction_path(transaction), "arrow-left-right")
      end
      {
        id: entry.id, type: entry.entryable_type.underscore, name: entry.name,
        href: entry.valuation? ? view.valuation_path(entry, return_to: valuation_return_to) : view.entry_path(entry, grouped: parent.present? ? true : nil), amount: amount.format,
        positive: amount.amount.positive?, excluded: entry.excluded?, notes: entry.notes,
        description: label.present? ? t("transactions.activity_labels.#{label.parameterize(separator: '_')}", default: label) : nil,
        selectable: managed? && !(transaction && transaction.transfer.present?),
        transaction: transaction ? transaction_data(transaction) : nil,
        split_parent: parent ? { id: parent.id, name: parent.name, amount: (-parent.amount_money).format } : nil,
        badges: badges, actions: actions,
        activity_options: editable_activity ? (entry.trade? ? Trade::ACTIVITY_LABELS : Transaction::ACTIVITY_LABELS).map { |option| { label: t("transactions.activity_labels.#{option.parameterize(separator: '_')}", default: option), value: option } } : [],
        activity_edit: editable_activity ? { href: entry.trade? ? view.trade_path(entry) : view.transaction_path(entry), method: "patch", param: "entry[entryable_attributes][investment_activity_label]", value: label.to_s } : nil,
        logo_url: entry.trade? ? entryable.security.display_logo_url : transaction&.display_logo_url
      }
    end

    def valuation_return_to
      [ view.account_path(account), view.request.query_string.presence ].compact.join("?")
    end

    def new_actions
      return [] unless managed? && (!account.linked? || !account.crypto?)

      result = []
      result << action(:balance, t("accounts.show.activity.new_balance"), view.new_valuation_path(account_id: account.id, return_to: valuation_return_to), "circle-dollar-sign") unless account.linked?
      unless account.crypto?
        result << if account.investment?
          action(:activity, t("accounts.show.activity.new_activity"), view.new_trade_path(account_id: account.id), "arrow-left-right")
        else
          action(:transaction, t("accounts.show.activity.new_transaction"), "#{view.account_path(account)}/transactions/new", "credit-card")
        end
      end
      result << action(:transfer, t("accounts.show.activity.new_transfer"), view.new_transfer_path(from_account_id: account.id), "arrow-right-left")
      result
    end

    def sections
      case @active_tab
      when "overview" then overview_sections
      when "schedule" then schedule_sections
      when "holdings" then holdings_sections
      when "statements" then statement_sections
      else []
      end
    end

    def overview_sections
      return loan_overview if account.loan?

      type = account.accountable_type.downcase.pluralize
      object = account.accountable
      prefix = "#{type}.tabs.overview"
      unknown = t("#{prefix}.unknown")
      values = if account.property?
        { market_value: money(account.balance_money), purchase_price: money(object.purchase_price),
          trend: "#{money(object.trend.value)} (#{object.trend.percent_formatted})", year_built: object.year_built || unknown, living_area: object.area || unknown }
      else
        { make_model: [ object.make, object.model ].compact.join(" ").presence || unknown, year: object.year || unknown, mileage: object.mileage || unknown,
          purchase_price: money(object.purchase_price), current_price: money(account.balance_money), trend: "#{money(object.trend.value)} (#{object.trend.percent_formatted})" }
      end
      [ section("overview", cards: values.map { |key, value| card(t("#{prefix}.#{key}"), value) },
        actions: managed? ? [ action(:edit, t("#{prefix}.edit_account_details"), view.edit_account_path(account), "pencil-line") ] : []) ]
    end

    def loan_overview
      loan = account.loan
      prefix = "loans.tabs.overview"
      unknown = t("#{prefix}.unknown")
      schedule = loan.amortization_schedule
      rate = loan.current_variable_rate(@as_of)
      payment = loan.variable_rate_type? ? schedule&.payment_in_force(@as_of) : loan.monthly_payment
      values = {
        original_principal: money(loan.original_balance), remaining_principal: money(account.balance_money),
        interest_rate: rate ? view.number_to_percentage(rate, precision: 3) : unknown,
        monthly_payment: payment ? money(payment) : t("#{prefix}.#{loan.variable_rate_type? ? 'not_applicable' : 'unknown'}"),
        term: loan.term_months ? t("accounts.show.#{loan.term_months < 12 ? 'term_months' : 'term_years'}", count: loan.term_months < 12 ? loan.term_months : loan.term_months / 12) : unknown,
        original_payoff_date: schedule&.payoff_date ? date(schedule.payoff_date) : unknown,
        type: view.loan_rate_type_options(loan).find { |_, value| value == loan.rate_type }&.first || unknown,
        (loan.insurance.present? ? :total_cost_with_insurance : :total_cost) => loan.total_cost ? money(loan.total_cost) : unknown
      }
      cards = values.map { |key, value| card(t("#{prefix}.#{key}"), value) }
      if loan.insurance.present?
        cards << card(t("#{prefix}.total_insurance"), money(loan.total_insurance))
      elsif loan.insurance_rate&.positive?
        cards << card(t("#{prefix}.total_insurance"), t("#{prefix}.insurance_rate_only", rate: view.number_to_percentage(loan.insurance_rate, strip_insignificant_zeros: true)))
      end
      if loan.initial_leverage_ratio
        cards << card(t("#{prefix}.leverage"), t("#{prefix}.leverage_multiple", ratio: view.number_with_precision(loan.initial_leverage_ratio, precision: 1)), description: t("#{prefix}.leverage_band_#{loan.leverage_band}"), tone: { "high" => "destructive", "moderate" => "warning" }.fetch(loan.leverage_band.to_s, "success"))
      end
      result = [ section("overview", cards: cards, actions: managed? ? [ action(:edit, t("#{prefix}.edit_loan_details"), view.edit_loan_path(account), "pencil-line") ] : []) ]
      if loan.balance_paid_ratio
        result << section("repayment", progress: { label: t("loans.tabs.repayment_progress.repaid"), percent: (loan.balance_paid_ratio * 100).to_f,
          description: t("loans.tabs.repayment_progress.of_original", amount: money(loan.original_balance)) })
      end
      if (breakdown = loan.payment_breakdown(as_of: @as_of))
        prefix = "loans.tabs.repayment_progress"
        parts = [ :principal, :interest, :insurance ].reject { |part| part == :insurance && breakdown[part].zero? }
        result << section("instalment", title: t("#{prefix}.instalment", number: breakdown[:number], date: date(breakdown[:date])),
          cards: parts.map { |part| card(t("#{prefix}.#{part}"), money(breakdown[part]), description: view.number_to_percentage(breakdown[:ratios][part] * 100, precision: 0)) } + [ card(t("#{prefix}.total"), money(breakdown[:total])) ])
      end
      result
    end

    def schedule_sections
      loan = account.loan
      schedule = loan.amortization_schedule
      prefix = "loans.tabs.schedule"
      columns = [ :number, :date, :payment, :principal, :interest, :remaining_balance ].map { |key| { key: key.to_s, label: t("#{prefix}.#{key}"), numeric: !key.in?([ :number, :date ]) } }
      rows = schedule.payments.map do |payment|
        { id: payment.number.to_s, past: payment.date <= @as_of, actions: [], cells: {
          "number" => cell(payment.number), "date" => cell(date(payment.date)), "payment" => cell(money(payment.payment), privacy: true),
          "principal" => cell(money(payment.principal), privacy: true), "interest" => cell(money(payment.interest), privacy: true), "remaining_balance" => cell(money(payment.ending_balance), privacy: true) } }
      end
      payoff = @projection.payoff_date ? date(@projection.payoff_date) : t("#{prefix}.#{@projection.applicable? ? 'forecasted_payoff_not_converged' : 'not_applicable'}")
      [ section("schedule", description: t("#{prefix}.description", start_date: date(loan.origination_date)),
        cards: [ card(t("#{prefix}.#{schedule.re_amortising? ? 'opening_payment' : 'monthly_payment'}"), money(schedule.periodic_payment)), card(t("#{prefix}.total_interest"), money(schedule.total_interest)), card(t("#{prefix}.total_cost"), money(schedule.total_paid)), card(t("#{prefix}.forecasted_payoff_date"), payoff) ],
        notices: loan.variable_rate_type? ? [ t("#{prefix}.variable_rate_notice") ] : [],
        table: { label: t("accounts.show.tabs.schedule"), columns: columns, rows: rows, empty_message: t("accounts.show.activity.no_entries") }) ]
    end

    def holdings_sections
      columns = [ :name, :weight, :average_cost, :holdings, :return ].map { |key| { key: key.to_s, label: t("holdings.index.#{key}"), numeric: key != :name } }
      rows = account.current_holdings.includes(:security, :account).map do |holding|
        trend = holding.trend
        { id: holding.id, past: false, actions: [ action(:view, t("account_statements.table.view"), view.holding_path(holding), "eye") ], cells: {
          "name" => cell(holding.name, secondary: holding.ticker, href: view.holding_path(holding), logo: { url: holding.security.display_logo_url, text: holding.name }),
          "weight" => cell(holding.weight ? view.number_to_percentage(holding.weight, precision: 1) : "—"),
          "average_cost" => cell(money(holding.avg_cost), secondary: holding.cost_basis_source_label, href: view.holding_path(holding), privacy: true),
          "holdings" => cell(money(holding.amount_money), secondary: t("holdings.holding.shares", qty: view.format_quantity(holding.qty, exact: account.crypto?)), privacy: true),
          "return" => cell(trend ? money(trend.value) : "—", secondary: trend ? trend.percent_formatted : t("holdings.holding.no_cost_basis"), tone: trend ? (favorable?(trend) ? "success" : "destructive") : "primary", privacy: true) } }
      end
      if account.cash_balance.to_d.positive?
        rows.unshift({ id: "cash", past: false, actions: [], cells: {
          "name" => cell(t("holdings.cash.brokerage_cash"), secondary: account.currency),
          "weight" => cell(account.balance.to_d.positive? ? view.number_to_percentage(account.cash_balance.to_d / account.balance.to_d * 100, precision: 1) : "—"),
          "average_cost" => cell("—"), "holdings" => cell(money(account.cash_balance_money), privacy: true), "return" => cell("—") } })
      end
      [ section("holdings", title: t("holdings.index.holdings"), cards: trade_republic_cards,
        actions: managed? ? [ action(:new_holding, t("holdings.index.new_holding"), view.new_trade_path(account_id: account.id), "plus") ] : [],
        table: { label: t("holdings.index.holdings"), columns: columns, rows: rows, empty_message: t("accounts.show.activity.no_entries") }) ]
    end

    def trade_republic_cards
      account.trade_republic_categories.map do |category, summary|
        card(t("trade_republic_items.portfolio_categories.#{category}"), money(Money.new(summary[:value].round(2), account.currency)), description: t("holdings.index.positions", count: summary[:count]))
      end
    end

    def statement_sections
      coverage = {
        years: @coverage.available_years, selected_year: @coverage.selected_year, range: view.account_statement_coverage_range(@coverage),
        months: @coverage.months.map { |month| { key: month.date.iso8601, label: view.account_statement_coverage_label(month), status: month.status,
          status_label: t("account_statements.coverage.status.#{month.status}"), tone: { "covered" => "success", "duplicate" => "warning", "ambiguous" => "warning", "mismatched" => "destructive" }.fetch(month.status, "primary") } }
      }
      upload = if @can_manage_statements
        { href: view.account_statements_path, account_id: account.id, accept: AccountStatement::ACCEPTED_FILE_EXTENSIONS.join(","), label: t("account_statements.form.files_label"),
          hint: t("account_statements.form.files_hint", max_size: AccountStatement::MAX_FILE_SIZE / 1.megabyte), submit_label: t("account_statements.form.account_upload") }
      end
      columns = [ :file, :period, :reconciliation ].map { |key| { key: key.to_s, label: t("account_statements.table.#{key}"), numeric: false } }
      rows = @statements.map do |statement|
        attached = statement.original_file.attached?
        href = attached ? view.rails_blob_path(statement.original_file, disposition: "inline") : view.account_statement_path(statement)
        actions = []
        actions << action(:view, t("account_statements.table.view"), href, "eye") if attached
        actions << action(:edit, t("account_statements.table.edit"), view.account_statement_path(statement), "pencil-line") if @can_manage_statements
        actions << action(:download, t("account_statements.table.download"), view.rails_blob_path(statement.original_file, disposition: "attachment"), "download") if attached
        actions << action(:unlink, t("account_statements.table.unlink"), view.unlink_account_statement_path(statement), "unlink", method: "patch") if @can_manage_statements
        status = @reconciliation_statuses[statement.id].presence || "unavailable"
        { id: statement.id, past: false, actions: actions, cells: {
          "file" => cell(statement.filename, secondary: view.number_to_human_size(statement.byte_size), href: href),
          "period" => cell(view.account_statement_period(statement)),
          "reconciliation" => cell(t("account_statements.reconciliation.#{status}"), tone: { "matched" => "success", "mismatched" => "destructive" }.fetch(status, "primary")) } }
      end
      [ section("coverage", title: t("account_statements.account_tab.coverage_title"), description: t("account_statements.account_tab.coverage_description"), coverage: coverage,
        actions: [ action(:inbox, t("account_statements.account_tab.open_inbox"), view.account_statements_path, "inbox") ], upload: upload),
       section("statements", title: t("account_statements.account_tab.statements_title"),
        table: { label: t("account_statements.account_tab.statements_title"), columns: columns, rows: rows, empty_message: t("account_statements.account_tab.empty") }) ]
    end

    def text
      keys = %w[activity new search_placeholder filter status confirmed pending uncategorized_only columns merchant notes tags category date amount no_entries previous_page next_page per_page select_all select_entry selected_entries edit_selected delete_selected duplicate_selected delete_confirm account_menu refresh period chart_view reset_zoom reconciliation close retry unavailable year loading cancel]
      keys.index_with do |key|
        if key.in?(%w[activity new search_placeholder filter status confirmed pending uncategorized_only category date amount no_entries])
          t("accounts.show.activity.#{key == 'activity' ? 'title' : key}")
        else
          t("accounts.show.spa.#{key}")
        end
      end
    end
end
