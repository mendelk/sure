# frozen_string_literal: true

module ProviderConnection::WalletActions
  def configure_wallet_action!(action, attributes)
    authorize_manage!
    attributes = attributes.to_h.stringify_keys
    case key
    when "onchain_wallet" then configure_onchain!(action.to_s, attributes)
    when "coinstats" then configure_coinstats!(action.to_s, attributes)
    else raise ProviderConnection::Invalid, "Unsupported wallet provider"
    end
  end

  private
    def configure_onchain!(action, attributes)
      if action == "enable_crypto_prices"
        raise ProviderConnection::Forbidden, "This setting is only available on self-hosted installations" unless Rails.application.config.app_mode.to_s == "self_hosted"
        Onchain::SecurityResolver.enable_price_provider!
        return { enabled: true }
      end
      if action == "disconnect_asset"
        require_item!
        raise ProviderConnection::Invalid, "Invalid provider account" unless UuidFormat.valid?(attributes.fetch("provider_account_id"))
        record = item.onchain_wallet_accounts.find(attributes.fetch("provider_account_id"))
        authorize_account!(record.account_provider.account) if record.account_provider
        record.destroy!
        return { removed: true }
      end
      address = attributes["address"].to_s.strip
      chain = attributes["chain"].to_s
      raise ProviderConnection::Invalid, "A wallet address is required" if address.blank?
      preview_item = item || family.onchain_wallet_item || family.onchain_wallet_items.new(name: I18n.t("onchain.institution_name"))
      unless Onchain::Chains.exists?(chain)
        raise ProviderConnection::Invalid, "Choose a supported chain" unless chain.blank? && action == "preview_wallet"
        detection = OnchainWalletItem::ChainDetector.new(preview_item, address).detect
        raise ProviderConnection::Invalid, "Wallet address was not recognized" if detection.unrecognized?
        if detection.ambiguous?
          return { address: address, chains: detection.candidates.map { |candidate| { value: candidate.key, label: candidate.label, detected: detection.detected?(candidate) } } }
        end
        chain = detection.chain
      end
      address = Onchain::Chains.canonical_address(chain, address)
      if %w[review_tokens update_tokens disconnect_wallet].include?(action)
        require_item!
        raise ActiveRecord::RecordNotFound unless item.tracks_address?(chain, address)
        item.accounts_for_wallet(chain, address).includes(account_provider: :account).each do |record|
          authorize_account!(record.account_provider.account) if record.account_provider
        end
      elsif %w[preview_wallet link_wallet].include?(action)
        raise ProviderConnection::Conflict, "This wallet is already linked" if family.onchain_address_linked?(chain, address)
      else
        raise ProviderConnection::Invalid, "Unsupported wallet action"
      end
      if action == "disconnect_wallet"
        return { removed_count: item.disconnect_wallet!(chain: chain, address: address) }
      end
      snapshot = OnchainWalletItem::Importer.new(preview_item).fetch_snapshot(chain: chain, address: address)
      if %w[preview_wallet review_tokens].include?(action)
        tracked = item && action == "review_tokens" ? item.accounts_for_wallet(chain, address).to_a : []
        review = OnchainWalletItem::TokenReview.new(snapshot: snapshot, tracked_accounts: tracked)
        return {
          address: address, chain: chain, assets_truncated: snapshot.assets_truncated?,
          assets: review.rows.map { |row| { key: row.key, name: row.asset.name, symbol: row.asset.symbol, quantity: row.asset.quantity.to_s, preselected: row.preselected?, tracked: row.tracked } }
        }
      end
      @item ||= family.onchain_wallet_item!
      linker = OnchainWalletItem::WalletLinker.new(item, chain: chain, address: address)
      result = if action == "update_tokens"
        linker.revise(snapshot: snapshot, selected_keys: Array(attributes["assets"]))
      else
        linker.link(snapshot: snapshot, selected_keys: Array(attributes["assets"]))
      end
      raise ProviderConnection::Invalid, "No assets could be tracked" unless action == "update_tokens" ? result.changed? : result.success?
      { id: item.id, created_count: result.created, removed_count: result.respond_to?(:removed) ? result.removed : 0, warnings: result.errors.any? ? [ "Some selected assets could not be tracked" ] : [] }
    rescue Onchain::Chains::Error
      raise ProviderConnection::Invalid, "The wallet provider could not complete the request"
    end

    def configure_coinstats!(action, attributes)
      require_item!
      remote = Provider::Coinstats.new(item.api_key)
      case action
      when "options"
        { blockchains: remote.blockchain_options, exchanges: remote.exchange_options }
      when "link_wallet"
        address = attributes["address"].to_s.strip
        blockchain = attributes["blockchain"].to_s.strip
        raise ProviderConnection::Invalid, "Address and blockchain are required" if address.blank? || blockchain.blank?
        result = CoinstatsItem::WalletLinker.new(item, address: address, blockchain: blockchain).link
        raise ProviderConnection::Invalid, "The wallet could not be linked" unless result.success?
        { created_count: result.created_count }
      when "link_exchange"
        exchange = remote.exchange_options.find { |entry| entry[:connection_id].to_s == attributes["exchange_connection_id"].to_s }
        raise ProviderConnection::Invalid, "Choose a supported exchange" unless exchange
        allowed = Array(exchange[:connection_fields]).filter_map { |field| field[:key].presence&.to_s }
        fields = attributes.fetch("connection_fields", {}).to_h.stringify_keys.slice(*allowed).transform_values { |value| value.to_s.strip }.compact_blank
        raise ProviderConnection::Invalid, "Exchange connection fields are required" if fields.empty?
        result = CoinstatsItem::ExchangeLinker.new(item, connection_id: exchange[:connection_id], connection_fields: fields, name: attributes["exchange_connection_name"].presence || exchange[:name]).link
        raise ProviderConnection::Invalid, "The exchange could not be linked" unless result.success?
        { created_count: result.created_count }
      else
        raise ProviderConnection::Invalid, "Unsupported wallet action"
      end
    rescue Provider::Coinstats::Error
      raise ProviderConnection::Invalid, "The wallet provider could not complete the request"
    end
end
