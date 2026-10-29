# Account-level provider actions shared by the browser and API controllers.
class Account::Lifecycle
  def initialize(account)
    @account = account
  end

  def request_sync
    return if account.syncing?

    if account.linked?
      adapters = account.account_providers.map(&:adapter)
      [ account.plaid_account, account.simplefin_account ].compact.each do |provider|
        adapters << Provider::Factory.create_adapter(provider, account: account)
      end
      adapters.filter_map { |adapter| adapter&.item }.uniq.each do |item|
        next if item.syncing?

        item.is_a?(PlaidItem) ? item.sync_later_with_provider_refresh : item.sync_later
      end
    else
      account.sync_later
    end
  end

  def unlink!
    # FinanceKit disconnect and SimpleFIN link callbacks lock the family first.
    # Match ingestion's family -> account order rather than reversing it here.
    account.family.with_lock do
      account.with_lock do
        account.provider_account_for("FinancekitAccountLineage")&.disconnect!
        # Holdings and all financial history survive unlinking. Provider callbacks
        # retain reconnectable records and clear disposable provider caches.
        provider_link_ids = account.account_providers.pluck(:id)
        Holding.where(account_provider_id: provider_link_ids).update_all(account_provider_id: nil) if provider_link_ids.any?
        simplefin_account = account.simplefin_account
        account.account_providers.reload.destroy_all
        account.update!(plaid_account_id: nil, simplefin_account_id: nil)
        simplefin_account&.destroy!
      end
    end
  end

  private
    attr_reader :account
end
