# frozen_string_literal: true

# Server-rendered home dashboard payload for the SPA home page (`/`).
#
# Mirrors `PagesController#dashboard` widget-by-widget (same models, same
# scoping, same preview gating) so the SPA can reach full ERB parity without
# reimplementing financial math client-side. Money serializes via `Money#as_json`
# (`{amount, currency, formatted}`); dates serialize ISO8601.
#
# Session auth works for first-party GETs (read scope); external clients use
# API key / OAuth like every other v1 endpoint.
class Api::V1::HomeController < Api::V1::BaseController
  include InsightsHelper
  include Periodable

  before_action :ensure_read_scope

  # GET /api/v1/home
  #
  # Single payload for the SPA home page, covering the widgets the ERB
  # dashboard renders server-side: balance sheet, net-worth chart,
  # cashflow sankey, money-flow bars, spending trend, outflows donut, and
  # investment summary, plus the preview-gated insights feed.
  #
  # Response shape matches `app/javascript/spa/home/home-api.ts`
  # (HomeResponseSchema): Money serializes via `Money#as_json`
  # (`{amount, currency, formatted}`) and weights/percents arrive as
  # server-formatted strings ("42.0%"), so the SPA renders without
  # reimplementing financial math. Dates serialize ISO8601.
  #
  # Query params (all optional):
  # - period / start_date + end_date (Periodable): selects the period for
  #   sankey, outflows, investments, net-worth chart, and balance sheet.
  # - money_flow_month (YYYY-MM-DD): selected money-flow month (clamped to
  #   the current month, like the ERB dashboard).
  # - money_flow_account_ids[]: subset filter for the money-flow widget
  #   (intersected with the widget's eligible accounts; empty = default).
  # - spending_month (YYYY-MM-DD): selected spending-trend month (clamped).
  def show
    user = current_resource_owner
    family = user.family
    balance_sheet = family.balance_sheet(user: user)
    investment_statement = family.investment_statement(user: user)
    income_statement = family.income_statement(user: user)
    accounts = user.accessible_accounts.visible.with_attached_logo
    has_accounts = accounts.any?

    net_totals = income_statement.net_category_totals(period: @period)
    income_totals = income_statement.income_totals(period: @period)
    expense_totals = income_statement.expense_totals(period: @period)
    money_flow_month, money_flow_account_ids = money_flow_selection(income_statement)
    spending_trend_data = build_spending_trend_data(income_statement, spending_trend_selection)

    render json: {
      has_accounts: has_accounts,
      first_name: user.first_name.to_s,
      two_column: user.dashboard_two_column?,
      preview: user.preview_features_enabled?,
      period: {
        start_date: @period.start_date.iso8601,
        end_date: @period.end_date.iso8601,
        label: @period.label
      },
      sections: build_sections(user, net_totals, investment_statement, has_accounts),
      balance_sheet: balance_sheet_json(balance_sheet, user),
      net_worth: net_worth_json(balance_sheet),
      cashflow_sankey: build_cashflow_sankey_data(net_totals, income_totals, expense_totals, family.currency),
      cash_forecast: cash_forecast_json(user),
      money_flow: money_flow_json(income_statement, money_flow_month, money_flow_account_ids),
      spending_trend: spending_trend_json(spending_trend_data),
      outflows: outflows_json(net_totals),
      investment_summary: investment_summary_json(investment_statement),
      insights: insights_json(user)
    }
  end

  private
    LAYOUT_DEFAULTS = {
      "insights_feed" => { col_span: "full", grow: false, min_height: 0, width_toggle: true },
      "cashflow_sankey" => { col_span: "full", grow: false, min_height: 384, width_toggle: true },
      "cash_forecast" => { col_span: "single", grow: true, min_height: 208, width_toggle: true },
      "money_flow" => { col_span: "single", grow: false, min_height: 0, width_toggle: true },
      "spending_trend" => { col_span: "single", grow: true, min_height: 208, width_toggle: true },
      "outflows_donut" => { col_span: "single", grow: false, min_height: 0 },
      "investment_summary" => { col_span: "single", grow: false, min_height: 0, width_toggle: true },
      "net_worth_chart" => { col_span: "single", grow: true, min_height: 208, width_toggle: true },
      "balance_sheet" => { col_span: "single", grow: false, min_height: 0, width_toggle: true }
    }.freeze

    HEIGHT_PRESETS = { "compact" => 208, "auto" => 288, "tall" => 416 }.freeze
    DEFAULT_HEIGHT_PRESET = "auto"

    def feed_insights(user)
      return Insight.none unless user.preview_features_enabled?
      user.family.insights.visible.ordered.limit(Insight::FEED_LIMIT)
    end

    def section_layout(user, key)
      base = LAYOUT_DEFAULTS.fetch(key, { col_span: "single", grow: false, min_height: 0, width_toggle: false })
      preset = user.dashboard_section_height(key)
      preset = DEFAULT_HEIGHT_PRESET unless HEIGHT_PRESETS.key?(preset)
      col_span = base[:col_span]
      if base[:width_toggle]
        span = user.dashboard_section_width(key)
        col_span = span if %w[single full].include?(span)
      end
      {
        col_span: col_span,
        grow: base[:grow],
        min_height: base[:min_height],
        width_toggle: base.fetch(:width_toggle, false),
        height_preset: preset,
        height_px: HEIGHT_PRESETS.fetch(preset)
      }
    end

    # Ordered section registry mirroring PagesController#build_dashboard_sections
    # plus per-user order/collapse/width/height overrides. Insights feed leads
    # when newly present (same future-proofing rule as the ERB dashboard).
    def build_sections(user, net_totals, investment_statement, has_accounts)
      preview = user.preview_features_enabled?
      feed_visible = preview && feed_insights(user).any?

      all = [
        { key: "insights_feed", visible: feed_visible, collapsible: true, layout: section_layout(user, "insights_feed") },
        { key: "cashflow_sankey", visible: has_accounts, collapsible: true, layout: section_layout(user, "cashflow_sankey") },
        { key: "cash_forecast", visible: has_accounts, collapsible: true, layout: section_layout(user, "cash_forecast") },
        { key: "money_flow", visible: has_accounts, collapsible: true, layout: section_layout(user, "money_flow") },
        { key: "spending_trend", visible: has_accounts, collapsible: true, layout: section_layout(user, "spending_trend") },
        {
          key: "outflows_donut",
          visible: has_accounts && net_totals.net_expense_categories.reject { |ct| ct.total.zero? }.any?,
          collapsible: true,
          layout: section_layout(user, "outflows_donut")
        },
        {
          key: "investment_summary",
          visible: has_accounts && investment_statement.investment_accounts.any?,
          collapsible: true,
          layout: section_layout(user, "investment_summary")
        },
        { key: "net_worth_chart", visible: has_accounts, collapsible: true, layout: section_layout(user, "net_worth_chart") },
        { key: "balance_sheet", visible: has_accounts, collapsible: true, layout: section_layout(user, "balance_sheet") }
      ]
      all.reject! { |s| s[:key] == "insights_feed" } unless preview

      ordered = user.dashboard_section_order.filter_map do |key|
        all.find { |s| s[:key] == key }
      end
      all.each do |section|
        next if ordered.include?(section)
        section[:key] == "insights_feed" ? ordered.unshift(section) : ordered << section
      end
      ordered.each { |s| s[:collapsed] = user.dashboard_section_collapsed?(s[:key]) }
      ordered
    end

    # -- widgets (ported 1:1 from PagesController private builders) --

    def build_cashflow_sankey_data(net_totals, income_totals, expense_totals, currency)
      nodes = []
      links = []
      node_indices = {}

      add_node = ->(unique_key, display_name, value, percentage, color, filter_value = nil) {
        node_indices[unique_key] ||= begin
          nodes << { id: unique_key, name: display_name, filter_value: filter_value, value: value.to_f.round(2), percentage: percentage.to_f.round(1), color: color }
          nodes.size - 1
        end
      }

      total_income = net_totals.total_net_income.to_f.round(2)
      total_expense = net_totals.total_net_expense.to_f.round(2)

      cash_flow_idx = add_node.call("cash_flow_node", "Cash Flow", total_income, 100.0, "var(--color-success)")

      net_subcategories_by_parent = build_net_subcategories(expense_totals, income_totals)

      process_net_category_nodes(
        categories: net_totals.net_income_categories,
        total: total_income,
        prefix: "income",
        net_subcategories_by_parent: net_subcategories_by_parent,
        add_node: add_node,
        links: links,
        cash_flow_idx: cash_flow_idx,
        flow_direction: :inbound
      )

      process_net_category_nodes(
        categories: net_totals.net_expense_categories,
        total: total_expense,
        prefix: "expense",
        net_subcategories_by_parent: net_subcategories_by_parent,
        add_node: add_node,
        links: links,
        cash_flow_idx: cash_flow_idx,
        flow_direction: :outbound
      )

      net = (total_income - total_expense).round(2)
      if net.positive?
        percentage = total_income.zero? ? 0 : (net / total_income * 100).round(1)
        idx = add_node.call("surplus_node", "Surplus", net, percentage, "var(--color-success)")
        links << { source: cash_flow_idx, target: idx, value: net, color: "var(--color-success)", percentage: percentage }
      end

      { nodes: nodes, links: links, currency_symbol: Money::Currency.new(currency).symbol }
    end

    def build_net_subcategories(expense_totals, income_totals)
      expense_subs = expense_totals.category_totals
        .select { |ct| ct.category.parent_id.present? }
        .index_by { |ct| ct.category.id }

      income_subs = income_totals.category_totals
        .select { |ct| ct.category.parent_id.present? }
        .index_by { |ct| ct.category.id }

      all_sub_ids = (expense_subs.keys + income_subs.keys).uniq
      result = {}

      all_sub_ids.each do |sub_id|
        exp_ct = expense_subs[sub_id]
        inc_ct = income_subs[sub_id]
        exp_total = exp_ct&.total || 0
        inc_total = inc_ct&.total || 0
        net = exp_total - inc_total
        category = exp_ct&.category || inc_ct&.category

        next if net.zero?

        parent_id = category.parent_id
        result[parent_id] ||= []
        result[parent_id] << { category: category, total: net.abs, net_direction: net > 0 ? :expense : :income }
      end

      result
    end

    def process_net_category_nodes(categories:, total:, prefix:, net_subcategories_by_parent:, add_node:, links:, cash_flow_idx:, flow_direction:)
      matching_direction = flow_direction == :inbound ? :income : :expense

      categories.each do |ct|
        val = ct.total.to_f.round(2)
        next if val.zero?

        percentage = total.zero? ? 0 : (val / total * 100).round(1)
        color = ct.category.color.presence || Category::UNCATEGORIZED_COLOR
        node_key = "#{prefix}_#{ct.category.id || ct.category.name}"

        all_subs = ct.category.id ? (net_subcategories_by_parent[ct.category.id] || []) : []
        same_side_subs = all_subs.select { |s| s[:net_direction] == matching_direction }
        opposite_subs = all_subs.select { |s| s[:net_direction] != matching_direction }

        if same_side_subs.any?
          parent_idx = add_node.call(node_key, ct.category.name, val, percentage, color, ct.category.filter_value)

          if flow_direction == :inbound
            links << { source: parent_idx, target: cash_flow_idx, value: val, color: color, percentage: percentage }
          else
            links << { source: cash_flow_idx, target: parent_idx, value: val, color: color, percentage: percentage }
          end

          same_side_subs.each do |sub|
            sub_val = sub[:total].to_f.round(2)
            sub_pct = val.zero? ? 0 : (sub_val / val * 100).round(1)
            sub_color = sub[:category].color.presence || color
            sub_key = "#{prefix}_sub_#{sub[:category].id}"
            sub_idx = add_node.call(sub_key, sub[:category].name, sub_val, sub_pct, sub_color, sub[:category].filter_value)

            if flow_direction == :inbound
              links << { source: sub_idx, target: parent_idx, value: sub_val, color: sub_color, percentage: sub_pct }
            else
              links << { source: parent_idx, target: sub_idx, value: sub_val, color: sub_color, percentage: sub_pct }
            end
          end
        else
          idx = add_node.call(node_key, ct.category.name, val, percentage, color, ct.category.filter_value)

          if flow_direction == :inbound
            links << { source: idx, target: cash_flow_idx, value: val, color: color, percentage: percentage }
          else
            links << { source: cash_flow_idx, target: idx, value: val, color: color, percentage: percentage }
          end
        end

        opposite_prefix = flow_direction == :inbound ? "expense" : "income"
        opposite_subs.each do |sub|
          sub_val = sub[:total].to_f.round(2)
          sub_pct = total.zero? ? 0 : (sub_val / total * 100).round(1)
          sub_color = sub[:category].color.presence || color
          sub_key = "#{opposite_prefix}_sub_#{sub[:category].id}"
          sub_idx = add_node.call(sub_key, sub[:category].name, sub_val, sub_pct, sub_color, sub[:category].filter_value)

          if flow_direction == :inbound
            links << { source: cash_flow_idx, target: sub_idx, value: sub_val, color: sub_color, percentage: sub_pct }
          else
            links << { source: sub_idx, target: cash_flow_idx, value: sub_val, color: sub_color, percentage: sub_pct }
          end
        end
      end
    end

    def outflows_json(net_totals)
      total = net_totals.total_net_expense

      categories = net_totals.net_expense_categories
        .reject { |ct| ct.total.zero? }
        .sort_by { |ct| -ct.total }
        .map do |ct|
          {
            id: ct.category.id.to_s,
            name: ct.category.name,
            filter_value: ct.category.filter_value,
            amount: ct.total.to_f.round(2),
            currency: ct.currency,
            percentage: ct.weight.round(1),
            color: ct.category.color.presence || Category::UNCATEGORIZED_COLOR,
            icon: ct.category.lucide_icon,
            clickable: !ct.category.other_investments?
          }
        end

      {
        categories: categories,
        total: total.to_f.round(2),
        total_formatted: Money.new(total, net_totals.currency).format,
        currency: net_totals.currency,
        currency_symbol: Money::Currency.new(net_totals.currency).symbol,
        period: { start_date: @period.start_date.iso8601, end_date: @period.end_date.iso8601 }
      }
    end

    # -- money flow --

    def money_flow_selection(income_statement)
      eligible = income_statement.eligible_accounts
      eligible_ids = eligible.map { |a| a.id.to_s }

      current_month = Date.current.beginning_of_month
      month = parse_month_param(params[:money_flow_month]) || current_month
      month = current_month if month > current_month

      ids = Array(params[:money_flow_account_ids]).reject(&:blank?)
      ids &= eligible_ids
      [ month, ids.presence ]
    end

    def build_money_flow_data(income_statement, selected_month, account_ids)
      months = (PagesController::MONEY_FLOW_CHART_MONTHS - 1).downto(0).map { |i| selected_month - i.months }

      selected_period = nil
      selected_totals = nil

      bars = months.map do |month_start|
        end_date = [ month_start.end_of_month, Date.current ].min
        period = Period.custom(start_date: month_start, end_date: end_date)
        totals = income_statement.totals_for(period, account_ids: account_ids)

        if month_start == selected_month
          selected_period = period
          selected_totals = totals
        end

        {
          date: month_start,
          label: I18n.l(month_start, format: :short_month_year),
          short_label: I18n.l(month_start, format: "%b"),
          income: totals.income_money.amount.to_f.round(2),
          expense: totals.expense_money.amount.to_f.round(2),
          highlighted: month_start == selected_month,
          partial: end_date < month_start.end_of_month
        }
      end

      {
        bars: bars,
        period: selected_period,
        month: selected_month,
        income: selected_totals.income_money,
        expense: selected_totals.expense_money,
        balance: selected_totals.income_money - selected_totals.expense_money,
        account_ids: account_ids
      }
    end

    def money_flow_json(income_statement, selected_month, account_ids)
      data = build_money_flow_data(income_statement, selected_month, account_ids)
      user = current_resource_owner
      eligible = income_statement.eligible_accounts
      accessible_ids = user.accessible_accounts.pluck(:id).map(&:to_s)
      selected_ids = account_ids || eligible.map { |a| a.id.to_s }

      # TransactionsController's default (account_ids absent) scopes to the
      # broader accessible-accounts set, so the param is omitted only when the
      # widget selection matches it exactly — same rule as the ERB partial.
      drilldown_ids = selected_ids.sort == accessible_ids.sort ? nil : selected_ids
      period = data[:period]
      q = { status: [ "confirmed" ], start_date: period.date_range.begin, end_date: period.date_range.end, account_ids: drilldown_ids }.compact
      balance = data[:balance]

      {
        bars: data[:bars].map { |b| b.merge(date: b[:date].iso8601) },
        period: {
          start_date: period.date_range.begin.iso8601,
          end_date: period.date_range.end.iso8601,
          date_range_label: I18n.t("pages.dashboard.money_flow.date_range",
            start_date: I18n.l(period.date_range.begin, format: :long),
            end_date: I18n.l(period.date_range.end, format: :long))
        },
        month: data[:month].iso8601,
        month_label: I18n.l(data[:month], format: :month_year).capitalize,
        income: data[:income].as_json,
        expense: data[:expense].as_json,
        balance: balance.as_json,
        balance_tone: balance.negative? ? "negative" : (balance.zero? ? "neutral" : "positive"),
        account_ids: data[:account_ids],
        accounts: eligible.map { |a| { id: a.id.to_s, name: a.name } },
        accessible_account_ids: accessible_ids,
        all_accounts_selected: selected_ids.size == eligible.size,
        income_href: transactions_path(q: q.merge(types: [ "income" ])),
        expense_href: transactions_path(q: q.merge(types: [ "expense" ]))
      }
    end

    # -- spending trend --

    def spending_trend_selection
      current_month = Date.current.beginning_of_month
      month = parse_month_param(params[:spending_month]) || current_month
      month > current_month ? current_month : month
    end

    def parse_month_param(value)
      return nil if value.blank?
      Date.strptime(value.to_s, "%Y-%m-%d").beginning_of_month
    rescue ArgumentError, TypeError
      nil
    end

    def build_spending_trend_data(income_statement, selected_month)
      month_start = selected_month.beginning_of_month
      month_end = month_start.end_of_month
      current_period = Period.custom(start_date: month_start, end_date: [ month_end, Date.current ].min)

      previous_month_start = (month_start - 1.month).beginning_of_month
      previous_period = Period.custom(start_date: previous_month_start, end_date: previous_month_start.end_of_month)

      current_daily = income_statement.daily_expense_series(period: current_period).index_by(&:date)
      previous_daily = income_statement.daily_expense_series(period: previous_period).index_by(&:date)

      axis_days = month_end.day

      current_series = cumulative_spending_series(current_period, current_daily)
      previous_header_series = cumulative_spending_series(previous_period, previous_daily)
      previous_series = fold_extra_days(previous_header_series, axis_days)

      current_total = current_series.last&.fetch(:value) || 0
      comparison_days = if month_start == Date.current.beginning_of_month
        [ current_series.size, previous_header_series.size ].min
      else
        previous_header_series.size
      end
      previous_total = comparison_days.positive? ? previous_header_series[comparison_days - 1][:value] : 0
      previous_comparison_day = comparison_days if comparison_days.positive? && comparison_days < previous_header_series.size
      currency = income_statement.family.currency

      {
        month: month_start,
        current_period: current_period,
        previous_period: previous_period,
        days: axis_days,
        current_days: month_end.day,
        axis_labels: (1..axis_days).map { |day| I18n.l(month_start + (day - 1), format: :short) },
        current: current_series,
        previous: previous_series,
        current_total: Money.new(current_total, currency),
        previous_total: Money.new(previous_total, currency),
        delta: Money.new(current_total - previous_total, currency),
        previous_label: I18n.l(previous_month_start, format: :month_year).capitalize,
        previous_comparison_day: previous_comparison_day,
        date_range_short: spending_trend_compact_date_range(current_period)
      }
    end

    def spending_trend_compact_date_range(period)
      date_range = period.date_range

      if date_range.begin == date_range.end
        I18n.t("pages.dashboard.spending_trend.date_range_short_single",
          date: I18n.l(date_range.begin, format: :short),
          year: date_range.end.year)
      else
        I18n.t("pages.dashboard.spending_trend.date_range_short",
          start_date: I18n.l(date_range.begin, format: :short),
          end_day: date_range.end.day,
          year: date_range.end.year)
      end
    end

    def fold_extra_days(series, axis_days)
      return series if series.size <= axis_days

      series.first(axis_days).tap do |folded|
        folded[-1] = folded[-1].merge(
          value: series.last[:value],
          date: series.last[:date],
          date_formatted: series.last[:date_formatted]
        )
      end
    end

    def cumulative_spending_series(period, daily_totals)
      cumulative = 0.to_d
      period.date_range.map do |date|
        cumulative += daily_totals[date] ? daily_totals[date].total.to_d : 0
        {
          day: (date - period.start_date).to_i + 1,
          value: cumulative.to_f.round(2),
          date: date.iso8601,
          date_formatted: I18n.l(date, format: :short)
        }
      end
    end

    def spending_trend_json(data)
      period = data[:current_period]
      delta = data[:delta]
      {
        month: data[:month].iso8601,
        month_label: I18n.l(data[:month], format: :month_year).capitalize,
        period: {
          start_date: period.date_range.begin.iso8601,
          end_date: period.date_range.end.iso8601,
          date_range_label: I18n.t("pages.dashboard.spending_trend.date_range",
            start_date: I18n.l(period.date_range.begin, format: :long),
            end_date: I18n.l(period.date_range.end, format: :long))
        },
        previous_period: {
          start_date: data[:previous_period].start_date.iso8601,
          end_date: data[:previous_period].end_date.iso8601
        },
        days: data[:days],
        current_days: data[:current_days],
        axis_labels: data[:axis_labels],
        current: data[:current],
        previous: data[:previous],
        current_total: data[:current_total].as_json,
        previous_total: data[:previous_total].as_json,
        delta: delta.as_json,
        delta_tone: delta.negative? ? "down" : (delta.zero? ? "flat" : "up"),
        previous_label: data[:previous_label],
        previous_comparison_day: data[:previous_comparison_day],
        date_range_short: data[:date_range_short]
      }
    end

    # -- balance sheet + net worth --

    def balance_sheet_json(balance_sheet, user)
      {
        currency: balance_sheet.currency,
        net_worth: balance_sheet.net_worth_money.as_json,
        assets_total: balance_sheet.assets.total_money.as_json,
        liabilities_total: balance_sheet.liabilities.total_money.as_json,
        syncing: balance_sheet.syncing?,
        classification_groups: balance_sheet.classification_groups.map do |group|
          {
            key: group.classification,
            name: group.name,
            icon: group.icon,
            total: group.total_money.as_json,
            weight: "100%",
            syncing: group.syncing?,
            account_groups: group.account_groups.map do |account_group|
              {
                key: account_group.key,
                name: account_group.name,
                color: account_group.color,
                weight: "#{account_group.weight.round(0)}%",
                total: account_group.total_money.as_json,
                accounts: account_group.accounts.map do |account|
                  classification_total = group.total_money.amount
                  weight = classification_total.zero? ? 0 : account.converted_balance / classification_total * 100
                  {
                    id: account.id.to_s,
                    name: account.name,
                    path: account_path(account.to_param),
                    balance: account.balance_money.as_json,
                    currency: account.currency,
                    weight: "#{weight.round(0)}%",
                    logo_url: account.logo.attached? ? rails_blob_path(account.logo, only_path: true) : nil
                  }
                end
              }
            end,
          }
        end,
        always_expanded: user.always_expanded_account_groups.to_a
      }
    end

    def net_worth_json(balance_sheet)
      series = balance_sheet.net_worth_series(period: @period)
      trend = series.trend
      {
        series: series.map do |point|
          { date: point.date.iso8601, value: point.value.as_json }
        end,
        trend: trend.present? ? {
          current: trend.current.as_json,
          change: trend.value.as_json,
          percent: trend.percent.finite? ? "#{trend.percent.round(1)}%" : trend.percent_formatted,
          color: trend.color,
          direction: trend.direction.to_s
        } : nil,
        comparison_label: @period.comparison_label,
        syncing: balance_sheet.syncing?
      }
    end

    # -- cash forecast --

    # 30-day projection of cash on hand: starting Depository balance plus
    # every projected recurring inflow/outflow inside the window that touches
    # a cash (Depository) account. Mirrors the occurrence-level approach of
    # Insight::Generators::CashFlowWarningGenerator#upcoming_recurring_entries
    # (a weekly bill contributes every hit, partially paid occurrences
    # contribute only their remaining_amount) but stays a pure projection:
    # no statistical daily-spend baseline is layered on top.
    #
    # Overdue open occurrences (due_on < today) still need paying, so they
    # land whole on day 0 (today) rather than vanishing from the forecast.
    #
    # Scoping notes: family-scoped (not RecurringTransaction.accessible_by).
    # The Bills page uses accessible_by because it renders per-series rows a
    # user without access to an endpoint must not see; here each event carries
    # only a name/date/amount, and the starting balance is the viewer's own
    # accessible-account total, so the aggregate needs no per-endpoint gate.
    def cash_forecast_json(user)
      family = user.family
      accounts = user.accessible_accounts.visible.where(accountable_type: "Depository").to_a
      return nil if accounts.none? || accounts.none? { |a| a.currency == family.currency }

      HomeCashForecast.new(family: family, user: user).as_json
    end

    # -- investments --

    def investment_summary_json(statement)
      return { present: false } if statement.investment_accounts.none?

      trend = statement.unrealized_gains_trend
      totals = statement.totals(period: @period)

      {
        present: true,
        portfolio_value: statement.portfolio_value_money.as_json,
        total_return: trend ? {
          value: Money.new(trend.value, statement.family.currency).as_json,
          percent: trend.percent.finite? ? "#{trend.percent.round(1)}%" : trend.percent_formatted,
          percent_formatted: trend.percent_formatted,
          color: trend.color
        } : nil,
        holdings: statement.top_holdings(limit: 5).map do |holding|
          {
            ticker: holding.ticker,
            name: holding.name,
            logo_url: holding.security.logo_url,
            weight: "#{holding.weight.round(1)}%",
            value: holding.amount_money.as_json,
            return_percent: holding.trend&.percent_formatted,
            color: holding.trend&.color
          }
        end,
        activity: (totals.trades_count > 0 || totals.contributions.to_f > 0 || totals.withdrawals.to_f > 0) ? {
          label: @period.label,
          contributions: totals.contributions.as_json,
          withdrawals: totals.withdrawals.as_json,
          trades_count: totals.trades_count
        } : nil
      }
    end

    # -- insights --

    def insights_json(user)
      return { enabled: false, insights: [] } unless user.preview_features_enabled?

      insights = feed_insights(user)
      {
        enabled: true,
        insights: insights.map do |insight|
          figure = insight_key_figure(insight)
          {
            id: insight.id.to_s,
            type: insight.insight_type,
            title: insight.title,
            body: insight.body,
            priority: insight.priority,
            status: insight.status,
            generated_at: insight.generated_at&.iso8601,
            icon_key: insight_icon_key(insight),
            icon_css_color: insight_icon_css_color(insight),
            sentiment: insight_sentiment(insight).to_s,
            key_figure: figure ? { value: figure.first, caption: figure.last } : nil,
            acknowledge_path: acknowledge_insight_path(insight)
          }
        end
      }
    end
end
