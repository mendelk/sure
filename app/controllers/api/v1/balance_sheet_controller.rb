# frozen_string_literal: true

# Returns the family's balance sheet data (net worth, assets, liabilities)
# with all monetary values converted to the family's primary currency,
# plus the bounded dashboard payload: net-worth trend series, grouped
# account summaries, and current sync state.
#
# Dashboard contract (see docs/api/dashboard.md):
# - Currency semantics: every money object is { amount, currency, formatted }
#   in the family's primary currency; per-account entries also carry the
#   account's native currency and converted balance.
# - Date semantics: `as_of` and trend dates are ISO 8601 calendar dates in
#   the server timezone; sync timestamps are ISO 8601 datetimes.
# - Bounded ranges: `period` accepts only the documented enum (default
#   last_30_days); the trend series is capped by the period interval.
# - Empty/stale/syncing states are representable without errors:
#   empty families return zeroed totals, empty groups, and a null latest sync.
class Api::V1::BalanceSheetController < Api::V1::BaseController
  before_action :ensure_read_scope

  # Bounded set of trend periods served by this endpoint. Kept small so the
  # generated series stays within a few hundred points: every served period
  # is daily (Period#interval aggregates weekly only past one calendar
  # year), and the 400-item values cap bounds the ~366-point maximum.
  DASHBOARD_PERIODS = %w[
    last_7_days
    last_30_days
    last_90_days
    last_365_days
    current_month
    current_year
  ].freeze
  DEFAULT_DASHBOARD_PERIOD = "last_30_days".freeze

  # A family whose last completed sync is older than this is reported as stale.
  SYNC_STALE_AFTER = 24.hours

  # GET /api/v1/balance_sheet?period=last_30_days
  # Returns net worth, total assets, and total liabilities as Money objects,
  # plus trend, grouped account summaries, and sync state for the dashboard.
  def show
    period_key = params[:period].presence || DEFAULT_DASHBOARD_PERIOD
    unless DASHBOARD_PERIODS.include?(period_key)
      return render_validation_error(
        "period must be one of: #{DASHBOARD_PERIODS.join(", ")}"
      )
    end

    user = current_resource_owner
    family = user.family
    balance_sheet = family.balance_sheet(user: user)
    period = Period.from_key(period_key)
    series = balance_sheet.net_worth_series(period: period)
    latest_sync = latest_family_sync(family)
    family_currency = family.currency
    groups = groups_payload(balance_sheet, family_currency)

    render json: {
      currency: family.currency,
      as_of: Time.zone.today.iso8601,
      accounts_count: groups.sum do |group|
        group[:account_groups].sum { |ag| ag[:accounts_count] }
      end,
      net_worth: balance_sheet.net_worth_money.as_json,
      assets: balance_sheet.assets.total_money.as_json,
      liabilities: balance_sheet.liabilities.total_money.as_json,
      trend: trend_payload(series, period_key),
      groups: groups,
      sync: sync_payload(family, latest_sync)
    }
  end

  private

    def ensure_read_scope
      authorize_scope!(:read)
    end

    def trend_payload(series, period_key)
      {
        period: period_key,
        start_date: series.start_date.iso8601,
        end_date: series.end_date.iso8601,
        interval: series.interval,
        trend: trend_json(series.trend),
        values: series.values.map do |point|
          {
            date: point.date.iso8601,
            value: point.value.as_json,
            trend: trend_json(point.trend)
          }
        end
      }
    end

    # Explicit serialization: Trend#as_json embeds raw Money objects for
    # current/previous, so serialize each field to keep the payload plain JSON.
    # percent is nil when non-finite (division from a zero base); the formatted
    # string still carries the ±∞ display value.
    def trend_json(trend)
      return nil if trend.nil?

      percent = trend.percent
      {
        value: trend.value.as_json,
        percent: percent.finite? ? percent : nil,
        percent_formatted: trend.percent_formatted,
        current: trend.current.as_json,
        previous: trend.previous.as_json,
        direction: trend.direction.to_s,
        color: trend.color,
        icon: trend.icon
      }
    end

    def groups_payload(balance_sheet, family_currency)
      balance_sheet.classification_groups.map do |group|
        {
          classification: group.classification,
          name: group.name,
          total: group.total_money.as_json,
          syncing: group.syncing?,
          accounts_count: group.account_groups.sum { |g| g.accounts.size },
          account_groups: group.account_groups.map do |account_group|
            {
              key: account_group.key,
              name: account_group.name,
              total: account_group.total_money.as_json,
              accounts_count: account_group.accounts.size,
              accounts: account_group.accounts.map { |row| account_row_payload(row, family_currency) }
            }
          end
        }
      end
    end

    def account_row_payload(row, family_currency)
      account = row.account
      {
        id: account.id,
        name: account.name,
        currency: account.currency,
        balance: account.balance_money.as_json,
        converted_balance: Money.new(row.converted_balance, family_currency).as_json,
        classification: account.classification,
        account_type: account.accountable_type&.underscore,
        syncing: row.syncing?
      }
    end

    def latest_family_sync(family)
      Sync.for_family(family, resource_owner: current_resource_owner)
          .preload(:syncable, :children)
          .ordered
          .first
    end

    def sync_payload(family, latest_sync)
      last_completed_at = family.latest_sync_completed_at
      {
        syncing: latest_sync&.visible? || false,
        stale: last_completed_at.present? && last_completed_at < SYNC_STALE_AFTER.ago,
        last_completed_at: last_completed_at&.iso8601,
        last_activity_at: family.latest_sync_activity_at&.iso8601,
        latest: latest_sync ? sync_summary_payload(latest_sync) : nil
      }
    end

    def sync_summary_payload(sync)
      {
        id: sync.id,
        status: sync.status,
        in_progress: sync.in_progress?,
        syncable_type: sync.syncable_type,
        syncable_id: sync.syncable_id,
        created_at: sync.created_at.iso8601,
        updated_at: sync.updated_at.iso8601,
        completed_at: sync.completed_at&.iso8601
      }
    end
end
