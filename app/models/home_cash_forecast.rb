# frozen_string_literal: true

# 30-day projection of checking cash on hand: the starting checking balance
# plus every projected recurring inflow/outflow inside the window that
# touches a checking account. Other depository subtypes never contribute.
#
# Occurrence-level, mirroring
# Insight::Generators::CashFlowWarningGenerator#upcoming_recurring_entries:
# a weekly bill contributes every hit inside the horizon (not one projected
# entry per series), and partially paid occurrences contribute only their
# remaining_amount.
#
# Inclusion rules per series shape:
# - Transfers (destination_account present) are excluded entirely, including
#   internal movements and debt payments the forecast does not model.
# - Income (typed_income? or negative amount) counts only when its `account`
#   is checking: a paycheck landing in checking is cash in.
# - Expenses count only when their `account` is checking: a bill paid from
#   checking is cash out; a bill charged to a credit card never touches cash.
# Only family-currency rows apply: cross-currency amounts need an FX lookup
# the forecast does not perform.
#
# Overdue open occurrences (due_on < today) are folded into day 0 (today):
# they are already owed, so the forecast treats them as due now rather than
# dropping them. Fully-past occurrences before today with zero remainder
# are skipped via the remaining-positivity check.
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

    balance = starting
    series = [ { date: today.iso8601, balance: Money.new(balance, currency).as_json } ]
    lowest_date = today
    lowest_balance = starting

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
      today = Date.current
      occurrences = family.recurring_occurrences
        .open_status
        .joins(:recurring_transaction)
        .where(recurring_transactions: { status: :active })
        .where(currency: currency)
        .where(due_on: ..(horizon.end))
        .includes(:recurring_transaction)
        .to_a

      preload_confirmed_sums(occurrences)

      checking_ids = family.accounts.visible
        .where(accountable_type: "Depository", accountable_id: Depository.where(subtype: "checking").select(:id))
        .pluck(:id).to_set

      entries = []
      occurrences.each do |occurrence|
        series = occurrence.recurring_transaction
        next if series.transfer?

        remaining = occurrence.remaining_amount
        next unless remaining.positive?

        if series.typed_income? || series.amount.negative?
          next unless series.account_id.present? && checking_ids.include?(series.account_id)
          amount = remaining
          direction = "inflow"
        else
          next unless series.account_id.present? && checking_ids.include?(series.account_id)
          next if series.destination_account_id.present? && !checking_ids.include?(series.destination_account_id)
          amount = -remaining
          direction = "outflow"
        end

        # Overdue open rows are already owed: charge them on day 0.
        date = [ occurrence.due_on, today ].max
        next if date > horizon.end

        entries << Event.new(date: date, name: series.display_name.to_s, amount: amount, direction: direction)
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
