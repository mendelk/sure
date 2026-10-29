# frozen_string_literal: true

module ProviderConnection::AccountSetup
  extend ActiveSupport::Concern

  SETUP_CONSTRUCTORS = %w[wise coinbase binance coinspot kraken ibkr trading212 trade_republic onchain_wallet].freeze
  EXCHANGE_PROVIDERS = %w[coinbase binance coinspot kraken].freeze
  CACHED_PROCESSORS = %w[coinbase binance coinspot kraken ibkr trading212 trade_republic].freeze

  def account_setup
    authorize_manage!
    relation = setup_provider_accounts.includes(account_provider: { account: :accountable })
    relation = relation.includes(:account) if relation.klass.reflect_on_association(:account)
    records = relation.to_a
    # A connection may contain mappings to private accounts. Family administration
    # does not confer permission to inspect or change those accounts.
    writable_ids = family.accounts.writable_by(user).pluck(:id).to_set
    records.select! { |record| setup_current_account(record).nil? || writable_ids.include?(setup_current_account(record).id) }
    candidates = family.accounts.writable_by(user).visible_manual.includes(:accountable, :account_providers).order(:name).to_a
    accounts = records.map { |record| setup_account_payload(record, candidates) }
    {
      provider: key,
      accounts: accounts,
      linked_accounts: accounts.select { |account| account[:linked_account_id].present? },
      unlinked_accounts: accounts.reject { |account| account[:linked_account_id].present? || account[:ignored] },
      account_types: setup_account_types.map { |type| { value: type, label: type.constantize.model_name.human, subtypes: setup_subtypes(type) } },
      linkable_accounts: candidates.filter_map do |account|
        next unless records.any? { |record| setup_link_compatible?(record, account) }
        { id: account.id, name: account.name, accountable_type: account.accountable_type, subtype: account.accountable.try(:subtype), currency: account.currency }
      end,
      owners: setup_owner_choices.order(:first_name, :last_name).map { |owner| { id: owner.id, name: owner.display_name } },
      default_owner_id: setup_default_owner.id,
      sync_start_date: item.try(:sync_start_date),
      supports_account_sync_start_date: setup_provider_accounts.klass.column_names.include?("sync_start_date"),
      supports_sync_start_date: item.has_attribute?(:sync_start_date),
      supports_setup: key != "financekit",
      syncing: item.respond_to?(:syncing?) && item.syncing?,
      stale_accounts: setup_stale_accounts.filter_map do |record|
        account = setup_current_account(record)
        next unless writable_ids.include?(account.id)
        { id: record.id, name: record.name, linked_account_id: account.id, linked_account_name: account.name }
      end
    }
  end

  def complete_setup!(attributes)
    authorize_manage!
    require_item!
    raise ProviderConnection::Invalid, "FinanceKit account mappings are managed by Wallet enrollment" if key == "financekit"
    attributes = attributes.to_h.with_indifferent_access
    selections = attributes.fetch(:selections, [])
    raise ProviderConnection::Invalid, "selections must be an array" unless selections.is_a?(Array)
    selections = selections.map do |selection|
      raise ProviderConnection::Invalid, "Each selection must be an object" unless selection.is_a?(Hash)
      selection.to_h.with_indifferent_access
    end
    raise ProviderConnection::Invalid, "Select each provider account only once" unless selections.map { |selection| selection[:id].to_s }.uniq.length == selections.length
    selections.each do |selection|
      setup_validate_uuid!(selection[:id], "selection.id")
      setup_validate_uuid!(selection[:account_id], "selection.account_id", optional: true)
      setup_validate_uuid!(selection[:owner_id], "selection.owner_id", optional: true)
    end

    created = []
    linked = []
    skipped = []
    existing = []
    processed = []
    stale_targets = []
    # Same family-first order as SimpleFIN ingestion/replacement and FinanceKit.
    # This also serializes setup from two connections into one manual account.
    family.with_lock do
      item.lock!
      authorize_manage!
      setup_update_date!(item, attributes[:sync_start_date]) if attributes[:sync_start_date].present?
      stale_targets = setup_apply_stale_actions!(attributes[:stale_account_actions])
      selections.each do |selection|
        record = setup_provider_accounts.lock.find(selection[:id])
        current = setup_current_account(record)
        if current
          authorize_account!(current)
          if selection[:account_id].present? && selection[:account_id].to_s != current.id.to_s
            raise ProviderConnection::Conflict, "Provider account is already linked"
          end
          existing << current.id
          next
        end
        account = selection[:account_id].present? ? family.accounts.lock.find(selection[:account_id]) : nil
        authorize_account!(account) if account
        type = selection[:accountable_type].presence || account&.accountable_type || setup_default_type(record)
        if type.blank? || type == "skip"
          record.update!(ignored: true) if record.has_attribute?(:ignored)
          skipped << record.id
          next
        end
        setup_validate_type!(type)
        subtype = setup_selected_subtype(record, type, selection[:subtype])
        setup_update_date!(record, selection[:sync_start_date]) if selection[:sync_start_date].present?
        if account
          setup_validate_manual_link!(record, account)
          setup_create_link!(record, account)
          linked << account.id
        else
          owner = selection[:owner_id].present? ? setup_owner_choices.find(selection[:owner_id]) : setup_default_owner
          account = setup_create_account!(record, type, subtype, selection, owner)
          unless account.owner_id == owner.id
            account.update!(owner: owner)
            if family.share_all_by_default?
              account.account_shares.where(user_id: owner.id).destroy_all
              account.auto_share_with_family!
            end
          end
          setup_create_link!(record, account)
          created << account.id
        end
        record.update!(ignored: false) if record.has_attribute?(:ignored)
        processed << record
      end
      setup_update_pending!(completed: true)
    end
    warnings = setup_process_cached_accounts(processed)
    stale_targets.each do |target|
      target.sync_later
    rescue StandardError => error
      setup_capture_failure(error, "schedule_stale_target")
      warnings << { code: "sync_schedule_failed", account_id: target.id, message: "The entries were moved, but recalculation could not be scheduled. Retry syncing the account." }
    end
    warnings.concat(setup_schedule_sync) if created.any? || linked.any?
    { created_account_ids: created, linked_account_ids: linked, existing_account_ids: existing,
      skipped_provider_account_ids: skipped, warnings: warnings, account_setup: account_setup }
  end

  def link_existing!(attributes)
    authorize_manage!
    require_item!
    raise ProviderConnection::Invalid, "FinanceKit account mappings are managed by Wallet enrollment" if key == "financekit"
    attributes = attributes.to_h.with_indifferent_access
    provider_account_id = attributes[:provider_account_id].presence || attributes["#{key}_account_id"]
    raise ProviderConnection::Invalid, "provider_account_id is required" if provider_account_id.blank?
    setup_validate_uuid!(provider_account_id, "provider_account_id")
    setup_validate_uuid!(attributes[:account_id], "account_id")
    linked = false
    record = nil
    account = nil
    family.with_lock do
      item.lock!
      authorize_manage!
      account = family.accounts.lock.find(attributes[:account_id])
      authorize_account!(account)
      record = setup_provider_accounts.lock.find(provider_account_id)
      current = setup_current_account(record)
      if current&.id == account.id
        next
      end
      # Coinbase/Binance historically allow choosing a manual destination for an
      # already-mapped feed. Both the displaced and destination accounts require
      # write permission; other providers never silently replace a mapping.
      if current
        raise ProviderConnection::Conflict, "Provider account is already linked" unless %w[coinbase binance].include?(key)
        authorize_account!(current)
        current.lock!
      end
      setup_validate_manual_link!(record, account)
      setup_update_date!(record, attributes[:sync_start_date]) if attributes[:sync_start_date].present?
      setup_create_link!(record, account)
      record.update!(ignored: false) if record.has_attribute?(:ignored)
      if key == "coinbase" && current && current.reload.account_providers.none? && current.may_mark_for_deletion?
        current.destroy_later
      end
      setup_update_pending!
      linked = true
    end
    warnings = linked ? setup_process_cached_accounts([ record ]) + setup_schedule_sync : []
    { account_id: account.id, provider_account_id: record.id, already_linked: !linked, warnings: warnings }
  end

  private
    def setup_validate_uuid!(value, field, optional: false)
      return if optional && value.blank?
      raise ProviderConnection::Invalid, "#{field} must be a UUID" unless UuidFormat.valid?(value)
    end

    def setup_provider_accounts
      raise ActiveRecord::RecordNotFound unless item
      item.public_send(provider.fetch(:accounts))
    end

    def setup_current_account(record)
      record.account_provider&.account || record.try(:account)
    end

    def setup_default_owner
      item.try(:owner) || user
    end

    def setup_owner_choices
      user.admin? ? family.users : family.users.where(id: user.id)
    end

    def setup_account_types
      types = "Provider::#{provider.fetch(:type).delete_suffix('Item')}Adapter".constantize.supported_account_types
      case key
      when "simplefin" then (types + %w[Crypto OtherAsset]).uniq
      when "snaptrade" then %w[Depository CreditCard Investment Crypto Loan OtherAsset]
      when "questrade" then %w[Investment Depository]
      when "trade_republic" then %w[Investment Depository Crypto]
      when "plaid" then (types + [ "OtherAsset" ]).uniq
      else types
      end
    end

    def setup_subtypes(type)
      klass = type.constantize
      return [] unless klass.const_defined?(:SUBTYPES, false)
      klass::SUBTYPES.map { |value, labels| { value: value, label: labels[:long] } }
    end

    def setup_validate_type!(type)
      raise ProviderConnection::Invalid, "Unsupported account type" unless setup_account_types.include?(type)
    end

    def setup_suggestion(record)
      if key == "simplefin"
        inferred = Simplefin::AccountTypeMapper.infer(
          name: record.name, holdings: record.raw_holdings_payload.presence || record.raw_payload.to_h["holdings"],
          extra: record.extra, balance: record.current_balance, available_balance: record.available_balance,
          institution: record.org_data.is_a?(Hash) ? record.org_data["name"] : nil
        )
        return { accountable_type: inferred.accountable_type, subtype: inferred.subtype, confidence: inferred.confidence }
      end
      if key == "plaid"
        mapping = PlaidAccount::TypeMappable::TYPE_MAPPING[record.plaid_type.to_s.to_sym]
        return { accountable_type: mapping&.dig(:accountable)&.name, subtype: mapping&.dig(:subtype_mapping, record.plaid_subtype) }
      end
      if key == "trade_republic"
        type, subtype = case record.kind
        when "cash" then [ "Depository", "checking" ]
        when "crypto" then [ "Crypto", "exchange" ]
        else [ "Investment", "brokerage" ]
        end
        return { accountable_type: type, subtype: subtype }
      end
      type = record.try(:suggested_account_type)
      type ||= BrexAccount.default_account_type_for(record) if key == "brex"
      type ||= setup_account_types.first if setup_account_types.one? || %w[questrade redbark mercury wise].include?(key)
      subtype = record.try(:suggested_subtype)
      subtype ||= record.account_subtype if key == "wise"
      subtype ||= "exchange" if EXCHANGE_PROVIDERS.include?(key)
      subtype ||= "wallet" if key == "onchain_wallet"
      subtype ||= record.exchange_source? ? "exchange" : "wallet" if key == "coinstats"
      subtype ||= "brokerage" if %w[ibkr trading212].include?(key)
      { accountable_type: type, subtype: subtype }
    end

    def setup_default_type(record, suggestion = setup_suggestion(record))
      if key == "simplefin"
        return "skip" unless suggestion[:confidence] == :high
        return "skip" if setup_simplefin_likely_closed?(record)
      end
      suggestion[:accountable_type].presence || "skip"
    end

    def setup_simplefin_likely_closed?(record)
      activity = record.activity_summary
      activity.last_transacted_at.present? && activity.dormant? && (record.current_balance || 0).to_d.abs <= 1
    end

    def setup_selected_subtype(record, type, subtype)
      suggestion = setup_suggestion(record)
      subtype = subtype.presence || (suggestion[:subtype] if suggestion[:accountable_type] == type)
      subtype ||= "credit_card" if type == "CreditCard"
      options = setup_subtypes(type)
      raise ProviderConnection::Invalid, "Unsupported account subtype" if subtype.present? && options.none? { |option| option[:value] == subtype }
      if (EXCHANGE_PROVIDERS.include?(key) || (key == "trade_republic" && record.crypto?)) && subtype != "exchange"
        raise ProviderConnection::Invalid, "This provider requires a crypto exchange account"
      end
      raise ProviderConnection::Invalid, "On-chain assets require a crypto wallet account" if key == "onchain_wallet" && subtype != "wallet"
      subtype
    end

    def setup_account_payload(record, candidates)
      account = setup_current_account(record)
      suggestion = setup_suggestion(record)
      {
        id: record.id, name: record.try(:name).presence || record.try(:display_name),
        currency: record.try(:currency), balance: record.try(:current_balance) || record.try(:balance),
        linked_account_id: account&.id, linked_account_name: account&.name,
        accountable_type: account&.accountable_type || setup_default_type(record, suggestion),
        subtype: account&.accountable.try(:subtype) || suggestion[:subtype],
        suggested_accountable_type: suggestion[:accountable_type], suggested_subtype: suggestion[:subtype],
        suggestion_confidence: suggestion[:confidence], ignored: record.has_attribute?(:ignored) && record.ignored?,
        sync_start_date: record.try(:sync_start_date),
        allowed_accountable_types: SETUP_CONSTRUCTORS.include?(key) ? [ suggestion[:accountable_type] ] : setup_account_types,
        likely_closed: key == "simplefin" && setup_simplefin_likely_closed?(record),
        linkable_account_ids: candidates.filter_map { |candidate| candidate.id if setup_link_compatible?(record, candidate) }
      }
    end

    def setup_link_compatible?(record, account)
      return record.linkable_to?(account) if key == "trade_republic"
      return account.manual_crypto_exchange? if %w[coinspot kraken].include?(key)
      return account.accountable_type == "Crypto" if %w[coinbase binance].include?(key)
      return account.accountable_type == "Crypto" && account.accountable.subtype == (record.exchange_source? ? "exchange" : "wallet") if key == "coinstats"
      return account.accountable_type == "Crypto" && account.accountable.subtype == "wallet" if key == "onchain_wallet"
      return %w[Investment Crypto].include?(account.accountable_type) if key == "snaptrade"
      setup_account_types.include?(account.accountable_type)
    end

    def setup_validate_manual_link!(record, account)
      raise ProviderConnection::Conflict, "Only an unlinked manual account can be linked" if account.account_providers.exists? || account.plaid_account_id.present? || account.simplefin_account_id.present?
      raise ProviderConnection::Invalid, "Account type is incompatible with this provider account" unless setup_link_compatible?(record, account)
    end

    def setup_create_link!(record, account)
      link = AccountProvider.find_or_initialize_by(provider: record)
      link.account = account
      link.save!
      # SimpleFIN still reads its legacy FK in a few ingestion paths.
      account.update!(simplefin_account_id: record.id) if key == "simplefin" && account.simplefin_account_id != record.id
      record.reload
      link
    end

    def setup_create_account!(record, type, subtype, selection, owner)
      if key == "simplefin"
        return Account.create_from_simplefin_account(record, type, subtype)
      elsif key == "enable_banking"
        return Account.create_from_enable_banking_account(record, type, subtype)
      elsif SETUP_CONSTRUCTORS.include?(key)
        account = Account.public_send("create_from_#{key}_account", record)
        raise ProviderConnection::Invalid, "This provider account has a fixed account type" unless account.accountable_type == type
        account.accountable.update!(subtype: subtype) if subtype.present? && account.accountable.respond_to?(:subtype)
        return account
      end
      balance = record.try(:current_balance) || record.try(:balance) || 0
      balance = selection[:balance].to_d if %w[questrade redbark indexa_capital].include?(key) && selection[:balance].present?
      balance = balance.abs if %w[CreditCard Loan].include?(type)
      cash_balance = type == "Crypto" || (key == "akahu" && type == "Investment") ? 0 : balance
      cash_balance = record.cash_balance || 0 if key == "snaptrade"
      attributes = { family: family, owner: owner, name: record.try(:name).presence || record.try(:display_name),
        balance: balance, cash_balance: cash_balance, currency: key == "mercury" ? "USD" : record.try(:currency).presence || family.currency,
        accountable_type: type, accountable_attributes: subtype.present? ? { subtype: subtype } : {} }
      Account.create_and_sync(attributes, skip_initial_sync: true)
    end

    def setup_update_date!(record, value)
      raise ProviderConnection::Invalid, "Sync start date is not supported" unless record.has_attribute?(:sync_start_date)
      date = Date.iso8601(value.to_s)
      raise ProviderConnection::Invalid, "Sync start date cannot be in the future" if date > Date.current
      record.update!(sync_start_date: date)
    rescue Date::Error
      raise ProviderConnection::Invalid, "Invalid sync start date"
    end

    def setup_update_pending!(completed: false)
      return unless item.has_attribute?(:pending_account_setup)
      pending = if completed && %w[simplefin enable_banking].include?(key)
        false
      else
        setup_provider_accounts.to_a.any? { |record| setup_current_account(record).nil? && !(record.has_attribute?(:ignored) && record.ignored?) }
      end
      item.update!(pending_account_setup: pending)
    end

    def setup_process_cached_accounts(records)
      return [] unless CACHED_PROCESSORS.include?(key)
      records.filter_map do |record|
        "#{record.class.name}::Processor".constantize.new(record.reload).process
        nil
      rescue StandardError => error
        setup_capture_failure(error, "cached_processing", record.id)
        { code: "processing_failed", provider_account_id: record.id, message: "The account was linked, but cached activity could not be processed. Retry syncing the connection." }
      end
    end

    def setup_schedule_sync
      result = if key == "sophtron"
        item.start_initial_load_later
      elsif key == "snaptrade"
        item.sync_later_with_follow_up
      else
        item.sync_later
      end
      raise ProviderConnection::Invalid, "Sync could not be scheduled" if result == false
      []
    rescue StandardError => error
      setup_capture_failure(error, "schedule_sync")
      [ { code: "sync_schedule_failed", message: "The accounts were linked, but syncing could not be scheduled. Retry syncing the connection." } ]
    end

    def setup_capture_failure(error, operation, provider_account_id = nil)
      DebugLogEntry.capture(category: "provider_sync_error", level: "error", source: self.class.name,
        provider_key: key, family: family, message: "Provider account setup #{operation} failed",
        metadata: { item_id: item.id, provider_account_id: provider_account_id, error_class: error.class.name })
    end

    def setup_stale_accounts
      return [] unless key == "simplefin" && item.raw_payload.present?
      upstream_ids = Array(item.raw_payload.with_indifferent_access[:accounts]).map { |record| record.with_indifferent_access[:id].to_s }
      return [] if upstream_ids.empty?
      setup_provider_accounts.includes(:account, account_provider: :account).select { |record| setup_current_account(record).present? && !upstream_ids.include?(record.account_id.to_s) }
    end

    def setup_apply_stale_actions!(actions)
      return [] if actions.blank?
      raise ProviderConnection::Invalid, "Stale account actions are only supported for SimpleFIN" unless key == "simplefin"
      raise ProviderConnection::Invalid, "stale_account_actions must be an object" unless actions.is_a?(Hash)
      normalized = actions.to_h.map do |id, raw_action|
        setup_validate_uuid!(id, "stale_account_actions.id")
        raise ProviderConnection::Invalid, "Each stale account action must be an object" unless raw_action.is_a?(Hash)
        action = raw_action.to_h.with_indifferent_access
        setup_validate_uuid!(action[:target_account_id], "target_account_id", optional: action[:action] != "move")
        [ id.to_s, action ]
      end
      stale = setup_stale_accounts.index_by { |record| record.id.to_s }
      targets = []
      normalized.each do |id, action|
        next if action[:action].blank? || action[:action] == "skip"
        record = stale.fetch(id.to_s) { raise ProviderConnection::Invalid, "Account is not stale" }
        source = setup_current_account(record)
        authorize_account!(source)
        source.lock!
        # Deletion and moving entries also change transfer counterparts through
        # Account cleanup callbacks; check every affected account first.
        transaction_ids = source.entries.where(entryable_type: "Transaction").pluck(:entryable_id)
        transfers = Transfer.where(inflow_transaction_id: transaction_ids).or(Transfer.where(outflow_transaction_id: transaction_ids))
        transfers.includes(inflow_transaction: { entry: :account }, outflow_transaction: { entry: :account }).each do |transfer|
          authorize_account!(transfer.inflow_transaction.entry.account)
          authorize_account!(transfer.outflow_transaction.entry.account)
        end
        case action[:action]
        when "delete"
          source.destroy!
        when "move"
          target_record = setup_provider_accounts.includes(account_provider: :account).detect { |candidate| setup_current_account(candidate)&.id.to_s == action[:target_account_id].to_s }
          target = target_record && setup_current_account(target_record)
          raise ProviderConnection::Invalid, "Select a current account on this connection" unless target && target.id != source.id && !stale.values.include?(target_record)
          authorize_account!(target)
          target.lock!
          transfers.each do |transfer|
            if [ transfer.inflow_transaction.entry.account_id, transfer.outflow_transaction.entry.account_id ].include?(target.id)
              transfer.destroy!
            end
          end
          source.entries.update_all(account_id: target.id)
          source.destroy!
          targets << target
        else
          raise ProviderConnection::Invalid, "Unsupported stale account action"
        end
        record.destroy!
      end
      targets.uniq
    end
end
