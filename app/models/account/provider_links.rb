# Public identities of the actual provider associations, including old FK links.
class Account::ProviderLinks
  def initialize(account)
    @account = account
  end

  def as_json(*)
    links = @account.account_providers.map do |link|
      adapter = link.adapter
      { id: link.id, provider_type: link.provider_type, provider_id: link.provider_id,
        provider_key: adapter&.provider_name, item_id: adapter&.item&.id }
    end
    [ @account.plaid_account, @account.simplefin_account ].compact.each do |provider|
      next if links.any? { |link| link[:provider_type] == provider.class.name && link[:provider_id] == provider.id }

      adapter = Provider::Factory.create_adapter(provider, account: @account)
      links << { id: nil, provider_type: provider.class.name, provider_id: provider.id,
        provider_key: adapter&.provider_name, item_id: adapter&.item&.id }
    end
    links
  end
end
