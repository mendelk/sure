# frozen_string_literal: true

# Returns the family's balance sheet data (net worth, assets, liabilities,
# net worth time series, and per-account rows) with all monetary values
# converted to the family's primary currency.
class Api::V1::BalanceSheetController < Api::V1::BaseController
  before_action :ensure_read_scope

  # GET /api/v1/balance_sheet
  # Returns net worth, total assets, and total liabilities as Money objects,
  # the net worth series, and a row per accessible account.
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
    # normalized to the family currency.
    def account_rows
      Current.user.accessible_accounts.map do |account|
        {
          id: account.id,
          name: account.name,
          classification: account.classification,
          account_type: account.accountable_type.underscore,
          balance: account.balance_money.as_json,
          currency: account.currency,
          path: account_path(account)
        }
      end
    end
end
