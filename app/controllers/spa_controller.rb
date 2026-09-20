class SpaController < ApplicationController
  layout "spa"

  def show
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
