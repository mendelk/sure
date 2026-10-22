# frozen_string_literal: true

# 30-day projection of checking cash on hand: the starting checking balance
# plus recurring checking inflows/outflows and dynamic credit-card statement
# payments. Other depository subtypes never contribute.
#
# Occurrence-level, mirroring
# Insight::Generators::CashFlowWarningGenerator#upcoming_recurring_entries:
# a weekly bill contributes every hit inside the horizon (not one projected
# entry per series), and partially paid occurrences contribute only their
# remaining_amount.
#
# Inclusion rules per series shape:
# - Dynamic credit-card statement payments count as outflows using each open
#   occurrence's unpaid remainder, even though the series belongs to a card.
# - Other transfers are excluded, including internal movements.
# - Income (typed_income? or negative amount) counts only when its `account`
#   is checking: a paycheck landing in checking is cash in.
# - Expenses count only when their `account` is checking: a bill paid from
#   checking is cash out; a bill charged to a credit card never touches cash.
# Only family-currency rows apply: cross-currency amounts need an FX lookup
# the forecast does not perform.
#
# Only occurrences due today through the 30-day horizon contribute. Overdue
# rows are excluded, not moved onto today.
#
# Family-scoped by design (see cash_forecast_json in
# Api::V1::HomeController for the rationale): the widget renders an
# aggregate plus name/date/amount events, not per-series rows.
class HomeCashForecast
  HORIZON_DAYS = 30

  Event = Data.define(:date, :name, :amount, :direction)

  attr_reader :family, :user

  def initialize(family:, user:)
    @family = family
    @user = user
  end

  def as_json(*)
    today = Date.current
    horizon = today..(today + HORIZON_DAYS)
    currency = family.currency

    starting = starting_balance
    entries = projected_entries(horizon, currency)
    by_date = entries.group_by(&:date)

    balance = starting + by_date.fetch(today, []).sum(&:amount)
    series = [ { date: today.iso8601, balance: Money.new(balance, currency).as_json } ]
    lowest_date = today
    lowest_balance = balance

    (1..HORIZON_DAYS).each do |offset|
      date = today + offset
      by_date.fetch(date, []).each { |entry| balance += entry.amount }
      if balance < lowest_balance
        lowest_balance = balance
        lowest_date = date
      end
      series << { date: date.iso8601, balance: Money.new(balance, currency).as_json }
    end

    {
      starting_balance: Money.new(starting, currency).as_json,
      ending_balance: Money.new(balance, currency).as_json,
      lowest: (lowest_date == today && lowest_balance == starting) ? nil : { date: lowest_date.iso8601, balance: Money.new(lowest_balance, currency).as_json },
      below_zero: balance.negative? || lowest_balance.negative?,
      series: series,
      events: entries.map do |entry|
        {
          date: entry.date.iso8601,
          name: entry.name,
          amount: Money.new(entry.amount.abs, currency).as_json,
          direction: entry.direction
        }
      end
    }
  end

  private
    def starting_balance
      user.accessible_accounts.visible
        .where(accountable_type: "Depository", currency: family.currency)
        .where(accountable_id: Depository.where(subtype: "checking").select(:id))
        .sum(:balance).to_d
    end

    def projected_entries(horizon, currency)
      occurrences = family.recurring_occurrences
        .open_status
        .joins(:recurring_transaction)
        .where(recurring_transactions: { status: :active })
        .where(currency: currency)
        .where(due_on: horizon)
        .includes(:recurring_transaction)
        .to_a

      preload_confirmed_sums(occurrences)

      checking_ids = family.accounts.visible
        .where(accountable_type: "Depository", accountable_id: Depository.where(subtype: "checking").select(:id))
        .pluck(:id).to_set
      card_ids = family.accounts.visible
        .where(accountable_type: "CreditCard", accountable_id: CreditCard.where.not(payment_due_day: nil).select(:id))
        .pluck(:id).to_set

      entries = []
      occurrences.each do |occurrence|
        series = occurrence.recurring_transaction
        next if series.transfer?

        remaining = occurrence.remaining_amount
        next unless remaining.positive?

        if series.credit_card_payment?
          next unless card_ids.include?(series.account_id)
          amount = -remaining
          direction = "outflow"
        elsif series.typed_income? || series.amount.negative?
          next unless series.account_id.present? && checking_ids.include?(series.account_id)
          amount = remaining
          direction = "inflow"
        else
          next unless series.account_id.present? && checking_ids.include?(series.account_id)
          next if series.destination_account_id.present? && !checking_ids.include?(series.destination_account_id)
          amount = -remaining
          direction = "outflow"
        end

        entries << Event.new(date: occurrence.due_on, name: series.display_name.to_s, amount: amount, direction: direction)
      end
      entries.sort_by { |entry| [ entry.date, entry.name ] }
    end

    # Same grouped-sum pattern the warning generator and paycheck planner use:
    # one query for the horizon instead of one SUM per occurrence.
    def preload_confirmed_sums(occurrences)
      sums = RecurringAllocation.confirmed
        .where(recurring_occurrence_id: occurrences.map(&:id))
        .group(:recurring_occurrence_id)
        .sum(:allocated_amount)
      occurrences.each { |occurrence| occurrence.cached_confirmed_allocated = sums.fetch(occurrence.id, 0) }
    end
end
