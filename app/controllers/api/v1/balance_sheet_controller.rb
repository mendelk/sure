# frozen_string_literal: true

# Returns the family's balance sheet data (net worth, assets, liabilities,
# net worth time series, and per-account rows) with all monetary values
# converted to the family's primary currency.
class Api::V1::BalanceSheetController < Api::V1::BaseController
  before_action :ensure_read_scope

  # GET /api/v1/balance_sheet
  # Returns net worth, total assets, and total liabilities as Money objects,
  # the net worth series, and a row per visible (draft + active) accessible account.
  def show
    family = current_resource_owner.family
    balance_sheet = family.balance_sheet
    render json: {
      currency: family.currency,
      net_worth: balance_sheet.net_worth_money.as_json,
      assets: balance_sheet.assets.total_money.as_json,
      liabilities: balance_sheet.liabilities.total_money.as_json,
      net_worth_series: net_worth_series(balance_sheet),
      accounts: account_rows
    }
  end

  private

    def ensure_read_scope
      authorize_scope!(:read)
    end

    def net_worth_series(balance_sheet)
      balance_sheet.net_worth_series.map do |point|
        { date: point.date.iso8601, value: point.value.as_json }
      end
    end

    # Every account the user can see, with its current balance already
    # normalized to the family currency. Matches the Rails sidebar scope
    # (`Account.visible`): draft + active only, so disabled and
    # pending-deletion accounts never appear as sidebar rows.
    # `logo_url` mirrors the Rails sidebar (`accounts/_logo`): Brandfetch
    # institution icon first, then provider logo, then attached logo.
    # Associations are eager-loaded so per-row resolution issues no queries.
    def account_rows
      current_resource_owner.accessible_accounts.visible.includes(account_providers: :provider).with_attached_logo.map do |account|
        {
          id: account.id,
          name: account.name,
          classification: account.classification,
          account_type: account.accountable_type.underscore,
          logo_url: account.logo_url,
          balance: account.balance_money.as_json,
          currency: account.currency,
          path: account_path(account)
        }
      end
    end
end
