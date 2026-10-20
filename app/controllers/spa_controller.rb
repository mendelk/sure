class SpaController < ApplicationController
  layout "spa"

  def show
    account_id = request.path_parameters[:account_id]
    @account = accessible_accounts.find(account_id) if account_id

    @uncategorized_count = Rails.cache.fetch(uncategorized_count_cache_key) do
      Current.accessible_entries.uncategorized_transactions.count
    end
  end

  private
    def uncategorized_count_cache_key
      "transactions_uncategorized_count/v3/#{Current.family.id}/#{Current.user.id}/" \
        "#{Current.family.entries_version}/#{Current.family.accounts_status_version}/#{Current.account_share_version}"
    end
end
