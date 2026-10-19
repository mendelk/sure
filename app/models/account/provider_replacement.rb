require "digest"

class Account::ProviderReplacement
  class Error < StandardError
    attr_reader :code, :status

    def initialize(message, code: "conflict", status: :unprocessable_entity)
      @code, @status = code, status
      super(message)
    end
  end

  def self.candidates(account:, user:)
    return [] unless user && user.family_id == account.family_id && account.family.accounts.writable_by(user).exists?(id: account.id)

    retired_activity = SimplefinAccount.unscoped.where(retired_account_id: account.id).any? { |old| old.unreviewed_retired_transactions.any? }
    SimplefinAccount.joins(:simplefin_item).where(simplefin_items: { family_id: account.family_id, scheduled_for_deletion: false })
      .includes(:account, :linked_account).filter_map do |provider|
      linked = provider.current_account
      next if linked&.id == account.id && !retired_activity
      next if linked && !account.family.accounts.writable_by(user).exists?(id: linked.id)

      { id: provider.id, name: provider.name, currency: provider.currency, balance: provider.current_balance&.to_s("F"),
        account_type: provider.account_type, linked_account: linked && { id: linked.id, name: linked.name } }
    end
  end

  def initialize(account:, simplefin_account:, user:)
    @account, @simplefin_account, @user = account, simplefin_account, user
  end

  def preview(matches: [])
    locked do
      authorize!
      load_state
      pairs = normalize_matches(matches)
      validate_matches!(pairs) if pairs.any?
      build_preview(pairs)
    end
  end

  def apply!(fingerprint:, matches:, idempotency_key:, accept_balance_difference: false)
    raise Error.new("An idempotency key is required", code: "invalid_replacement") if idempotency_key.blank? || idempotency_key.to_s.bytesize > 255
    pairs = normalize_matches(matches)
    accepted_difference = ActiveModel::Type::Boolean.new.cast(accept_balance_difference) == true
    digest = Digest::SHA256.hexdigest(JSON.generate([ simplefin_account.id, fingerprint, pairs.sort_by { |pair| pair[:incoming_id] }, accepted_difference ]))
    applied = false
    result = locked do
      authorize!
      existing = ProviderReplacementOperation.find_by(account: account, idempotency_key: idempotency_key)
      if existing
        raise Error, "This idempotency key was used with a different request" unless existing.request_digest == digest
        next existing.result.symbolize_keys
      end

      load_state
      raise Error.new("The account or feed changed; refresh the preview", code: "stale_preview", status: :conflict) unless build_preview[:fingerprint] == fingerprint
      raise Error, blockers.join("; ") if blockers.any?
      validate_matches!(pairs)
      review = balance_summary(pairs)
      raise Error, "A dated exchange rate is missing; refresh exchange rates before applying this replacement" if review[:discrepancy].nil?
      if review[:discrepancy].to_d.nonzero? && !accepted_difference
        raise Error, "The replacement balance differs from the expected ledger balance; review and explicitly acknowledge the difference"
      end
      operation = ProviderReplacementOperation.create!(account: account, simplefin_account: simplefin_account, actor: user,
        idempotency_key: idempotency_key, request_digest: digest,
        audit: audit_snapshot(fingerprint, pairs).merge(balance: review, accept_balance_difference: accepted_difference))
      consolidate!(pairs)
      relink!
      snapshot = SimplefinAccount::Processor.new(simplefin_account).balance_snapshot(account: account)
      account.reload
      balance_result = account.set_current_balance(snapshot[:balance], date: simplefin_account.balance_date&.to_date || Date.current, schedule_sync: false)
      raise Error, balance_result.error unless balance_result.success?
      account.update!(cash_balance: snapshot[:cash_balance]) unless balance_result.historical?
      Balance::Materializer.new(account, strategy: :reverse).materialize_balances
      result = { account_id: account.id, operation_id: operation.id }
      operation.update!(result: result)
      applied = true
      result
    end
    account.sync_later if applied
    result
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique => error
    raise Error, error.message
  end

  private
    attr_reader :account, :simplefin_account, :user, :source_account, :canonical, :incoming, :blockers

    def locked
      Account.transaction do
        Family.where(id: account.family_id).lock.pick(:id)
        account.reload
        # Retired rows remain addressable for idempotent retries.
        @simplefin_account = SimplefinAccount.unscoped.find(simplefin_account.id)
        yield
      end
    end

    def writable?(candidate)
      candidate && candidate.family_id == user.family_id && Account.writable_by(user).exists?(id: candidate.id)
    end

    def authorize!
      unless user && account.family_id == user.family_id && writable?(account) && simplefin_account.simplefin_item.family_id == account.family_id
        raise Error.new("You cannot replace this account's provider", code: "forbidden", status: :forbidden)
      end
      @source_account = simplefin_account.current_account
      if source_account && !writable?(source_account)
        raise Error.new("You cannot modify the provider's current account", code: "forbidden", status: :forbidden)
      end
    end

    def load_state
      # Import adapters already take canonical-account row locks. Taking them in
      # UUID order prevents replacement from racing any provider's entry writer.
      Account.where(id: [ account.id, source_account&.id ].compact).order(:id).lock.load
      @canonical = account.entries.where(parent_entry_id: nil).includes(:child_entries, :entryable).order(:id).to_a
      @mapping_only = source_account && source_account.id != account.id && (
        source_account.account_providers.where.not(provider_type: "SimplefinAccount").exists? || source_account.plaid_account_id.present?)
      @incoming = {}
      @archived_observations = []
      @blockers = []
      @warnings = []
      if account.account_providers.where.not(provider_type: "SimplefinAccount").exists? || account.plaid_account_id.present?
        @blockers << "Unlink the account's other provider before connecting SimpleFIN"
      end
      @blockers << "This provider has been retired" if simplefin_account.retired_at?
      if simplefin_account.account && simplefin_account.linked_account && simplefin_account.account.id != simplefin_account.linked_account.id
        @blockers << "Legacy and provider mappings disagree; resolve them before replacement"
      end
      if source_account&.id == account.id && SimplefinAccount.unscoped.where(retired_account_id: account.id).none? { |old| old.unreviewed_retired_transactions.any? }
        @blockers << "This provider is already linked to the canonical account"
      end
      @blockers << "The currencies must agree before linking" unless simplefin_account.currency == account.currency
      @blockers << "The connection is scheduled for deletion" if simplefin_account.simplefin_item.scheduled_for_deletion?
      if source_account && !@mapping_only && source_account.id != account.id
        @blockers << "Consolidation requires matching account types and currencies" unless source_account.accountable_type == account.accountable_type && source_account.currency == account.currency
        if source_account.holdings.exists? || source_account.trades.exists? || simplefin_account.raw_holdings_payload.to_a.any?
          @blockers << "Investment positions cannot be consolidated; retain their existing account"
        end
        source_account.entries.where(parent_entry_id: nil).includes(:child_entries, :entryable).order(:id).each do |entry|
          if entry.valuation?
            same_date = canonical.find { |candidate| candidate.valuation? && candidate.date == entry.date }
            generated_anchor = entry.valuation.opening_anchor? || entry.valuation.current_anchor?
            if generated_anchor || (same_date && same_date.amount == entry.amount && same_date.currency == entry.currency)
              @archived_observations << entry
              next
            end
            @blockers << "Conflicting reconciliation on #{entry.date}; resolve the differing statement values first" if same_date
          end
          @incoming[entry.id] = { entry: entry, summary: entry_summary(entry) }
        end
      end
      @warnings << "The previous account retains another provider: only its mapping moves; its ledger and balances remain unchanged" if @mapping_only
      @warnings << "Review possible duplicates explicitly; suggestions are not approved matches" if canonical.any?
      @warnings << "Source-generated anchors and equal balance observations will be archived; the canonical opening anchor is preserved" if @archived_observations.any?
      add_raw_incoming
      authorize_counterparts!
    end

    def add_raw_incoming
      providers = [ simplefin_account, *SimplefinAccount.unscoped.where(id: old_provider_ids).to_a ].uniq(&:id)
      providers.each do |provider|
        provider.raw_transactions_payload.to_a.each do |raw|
          unless raw.is_a?(Hash) && raw.with_indifferent_access[:id].present?
            @blockers << "The feed contains a transaction without a durable identity"
            next
          end
          external_id = "simplefin_#{raw.with_indifferent_access[:id]}"
          next if SimplefinTransactionIdentity.exists?(simplefin_account: provider, external_id: external_id)
          known_canonical_feed = provider.id != simplefin_account.id || source_account&.id == account.id
          next if known_canonical_feed && canonical.any? { |entry| entry.source == "simplefin" && entry.external_id == external_id }
          next if !@mapping_only && incoming.values.any? { |item| item[:entry]&.source == "simplefin" && item[:entry]&.external_id == external_id }
          processor = SimplefinEntry::Processor.new(raw, simplefin_account: provider, normalization_account: account)
          next unless processor.import_enabled?
          attrs = processor.import_attributes
          id = "raw:#{provider.id}:#{raw.with_indifferent_access[:id]}"
          @incoming[id] = { raw: raw, provider: provider, attributes: attrs, external_id: external_id,
            summary: { id: id, name: attrs[:name], date: attrs[:date].iso8601, amount: attrs[:amount].to_s("F"),
              currency: attrs[:currency], pending: SimplefinEntry::Processor.pending?(raw), split: false, transfer: false } }
        rescue ArgumentError, TypeError => error
          @blockers << "Invalid feed transaction: #{error.message}"
        end
      end
    end

    def entry_summary(entry)
      { id: entry.id, name: entry.name, date: entry.date.iso8601, amount: entry.amount.to_s("F"), currency: entry.currency,
        pending: entry.transaction? && entry.transaction.pending?, split: entry.child_entries.any?,
        transfer: entry.transaction? && entry.transaction.transfer.present?, entryable_type: entry.entryable_type }
    end

    def authorize_counterparts!
      entries = incoming.values.filter_map { |item| item[:entry] }
      entries.flat_map { |entry| [ entry, *entry.child_entries ] }.each do |entry|
        next unless entry.transaction?
        transfer = entry.transaction.transfer
        next unless transfer
        [ transfer.from_account, transfer.to_account ].each do |counterpart|
          raise Error.new("A transfer counterpart is not writable", code: "forbidden", status: :forbidden) unless writable?(counterpart)
        end
      end
    end

    def build_preview(pairs = [])
      suggestions = incoming.filter_map do |id, item|
        summary = item[:summary]
        candidates = canonical.select do |entry|
          entry.transaction? && entry.amount == summary[:amount].to_d && entry.currency == summary[:currency] &&
            (entry.date - Date.iso8601(summary[:date])).abs <= 4
        end
        next unless candidates.one?
        { incoming_id: id, survivor_id: candidates.first.id, reason: "Same amount and currency within four days; confirm identity" }
      end
      review = balance_summary(pairs)
      preview_blockers = blockers.dup
      preview_blockers << "A dated exchange rate is missing; refresh exchange rates before applying this replacement" if review[:discrepancy].nil?
      {
        fingerprint: fingerprint, account: account.slice(:id, :name, :currency), replacement: simplefin_account.slice(:id, :name, :currency),
        source_account: source_account&.slice(:id, :name), canonical_entries: canonical.map { |entry| entry_summary(entry) },
        incoming_entries: incoming.values.map { |item| item[:summary] }, suggested_matches: suggestions,
        blockers: preview_blockers.uniq, warnings: @warnings,
        balance: review,
        anchor_actions: @archived_observations.map { |entry| { id: entry.id, date: entry.date.iso8601, amount: entry.amount.to_s("F"), kind: entry.valuation.kind, action: "archive_source_observation" } },
        summary: { incoming_count: incoming.size, candidate_count: suggestions.size }
      }
    end

    def balance_summary(pairs)
      selected = pairs.to_h { |pair| [ pair[:incoming_id], pair[:survivor_id] ] }
      net = BigDecimal("0")
      missing_fx = false
      incoming.each do |id, item|
        if selected[id]
          survivor = canonical.find { |entry| entry.id == selected[id] }
          # A split moved onto an unsplit survivor replaces its financial detail.
          next unless item[:entry]&.child_entries&.any? && survivor.child_entries.empty?
          before, after = entry_effect(survivor), entry_effect(item[:entry])
          missing_fx ||= before.nil? || after.nil?
          net += after - before if before && after
        else
          effect = item[:entry] ? entry_effect(item[:entry]) : summary_effect(item[:summary])
          missing_fx ||= effect.nil?
          net += effect if effect
        end
      end
      expected = account.balance + (account.liability? ? net : -net) unless missing_fx
      observed = SimplefinAccount::Processor.new(simplefin_account).balance_snapshot(account: account).fetch(:balance)
      precision = Money::Currency.new(account.currency).default_precision
      { current: account.balance.to_s("F"), expected: expected&.round(precision)&.to_s("F"), replacement: observed.to_s("F"),
        currency: account.currency, discrepancy: expected && (observed - expected).round(precision).to_s("F"),
        date: (simplefin_account.balance_date&.to_date || Date.current).iso8601 }
    end

    def entry_effect(entry)
      rows = entry.child_entries.any? ? entry.child_entries : [ entry ]
      effects = rows.map do |row|
        next BigDecimal("0") unless row.transaction? && !row.excluded? && !row.transaction.pending?
        summary_effect(entry_summary(row), custom_rate: row.transaction.exchange_rate)
      end
      effects.any?(&:nil?) ? nil : effects.sum
    end

    def summary_effect(summary, custom_rate: nil)
      return BigDecimal("0") if summary[:pending]
      amount = summary[:amount].to_d
      return amount if summary[:currency] == account.currency
      # Preview never fetches rates or writes. Missing dated FX is an explicit
      # unknown balance, not a guessed 1:1 conversion.
      rate = custom_rate.presence&.to_d || ExchangeRate.find_by(from_currency: summary[:currency], to_currency: account.currency, date: summary[:date])&.rate
      rate && rate.positive? ? amount * rate : nil
    end

    def fingerprint
      records = canonical + @archived_observations + incoming.values.filter_map { |item| item[:entry] }
      entries = records.flat_map { |entry| [ entry, *entry.child_entries ] }.uniq(&:id)
      currencies = (entries.map(&:currency) + incoming.values.map { |item| item[:summary][:currency] }).uniq
      dates = (entries.map(&:date) + incoming.values.map { |item| item[:summary][:date] }).uniq
      state = [ account.attributes, simplefin_account.attributes, source_account&.attributes,
        AccountProvider.where(account_id: [ account.id, source_account&.id ].compact).order(:id).map(&:attributes),
        entries.sort_by(&:id).map { |entry| [ entry.attributes, entry.entryable.attributes,
          entry.entryable.respond_to?(:tags) ? entry.entryable.tag_ids.sort : [],
          entry.entryable.respond_to?(:attachments) ? entry.entryable.attachments.map(&:attributes) : [],
          entry.transaction? ? entry.transaction.transfer&.attributes : nil ] },
        SimplefinAccount.unscoped.where(id: old_provider_ids).order(:id).map(&:attributes),
        ExchangeRate.where(from_currency: currencies, to_currency: account.currency, date: dates).order(:id).map(&:attributes),
        SimplefinTransactionIdentity.where(simplefin_account: simplefin_account).order(:id).map(&:attributes) ]
      Digest::SHA256.hexdigest(JSON.generate(state))
    end

    def old_provider_ids
      (account.account_providers.where(provider_type: "SimplefinAccount").pluck(:provider_id) +
        [ account.simplefin_account_id ] + SimplefinAccount.unscoped.where(retired_account_id: account.id).pluck(:id)).compact.uniq
    end

    def audit_snapshot(fingerprint, pairs)
      entries = (canonical + @archived_observations + incoming.values.filter_map { |item| item[:entry] }).flat_map { |entry| [ entry, *entry.child_entries ] }.uniq(&:id)
      {
        fingerprint: fingerprint, matches: pairs, actor_id: user.id, family_id: account.family_id,
        source_account_id: source_account&.id, mapping_only: @mapping_only, recorded_at: Time.current.iso8601,
        accounts: [ account, source_account ].compact.uniq(&:id).map(&:attributes),
        providers: SimplefinAccount.unscoped.where(id: old_provider_ids + [ simplefin_account.id ]).map(&:attributes),
        mappings: AccountProvider.where(account_id: [ account.id, source_account&.id ].compact).map(&:attributes),
        statements: source_account && !@mapping_only ? source_account.account_statements.map(&:attributes) : [],
        entries: entries.map { |entry| { entry: entry.attributes, entryable: entry.entryable.attributes,
          enrichments: entry.data_enrichments.map(&:attributes) + entry.entryable.data_enrichments.map(&:attributes),
          tags: entry.transaction? ? entry.transaction.tag_ids : [],
          attachments: entry.transaction? ? entry.transaction.attachments.map(&:attributes) : [],
          transfer: entry.transaction? ? entry.transaction.transfer&.attributes : nil } }
      }
    end

    def normalize_matches(matches)
      Array(matches).map do |pair|
        pair = pair.to_h.symbolize_keys
        { incoming_id: pair[:incoming_id].to_s, survivor_id: pair[:survivor_id].to_s }
      end
    rescue NoMethodError, TypeError
      raise Error.new("Invalid duplicate matches", code: "invalid_replacement")
    end

    def validate_matches!(pairs)
      raise Error, "Each incoming transaction and survivor may be selected only once" unless pairs.map { |p| p[:incoming_id] }.uniq.size == pairs.size && pairs.map { |p| p[:survivor_id] }.uniq.size == pairs.size
      pairs.each do |pair|
        item = incoming[pair[:incoming_id]]
        survivor = canonical.find { |entry| entry.id == pair[:survivor_id] }
        raise Error, "A selected transaction is not in this preview" unless item && survivor
        summary = item[:summary]
        unless survivor.transaction? && (!item[:entry] || item[:entry].transaction?) && survivor.amount == summary[:amount].to_d && survivor.currency == summary[:currency]
          raise Error, "Matched transactions must have equal amounts and currencies"
        end
        # A pending row may be reconciled to a posted survivor, never the reverse.
        raise Error, "A posted transaction cannot be merged into a pending survivor" if !summary[:pending] && survivor.transaction.pending?
        validate_merge!(item[:entry], survivor) if item[:entry]
      end
      selected = pairs.to_h { |pair| [ pair[:incoming_id], pair[:survivor_id] ] }
      incoming.each do |id, item|
        next if selected.key?(id)
        entry = item[:entry]
        if entry&.valuation? && canonical.any? { |candidate| candidate.valuation? && candidate.date == entry.date }
          raise Error, "Conflicting valuation on #{entry.date}; resolve the account's balance anchors first"
        end
      end
    end

    def validate_merge!(entry, survivor)
      if entry.child_entries.any? && survivor.child_entries.any?
        raise Error, "Both transactions contain splits; consolidate their split structures first"
      end
      if entry.transaction.transfer && survivor.transaction.transfer
        raise Error, "Both transactions contain transfers; reconcile the transfer pairs first"
      end
      if entry.excluded? != survivor.excluded? && entry.child_entries.empty? && survivor.child_entries.empty?
        raise Error, "Matched transactions have conflicting exclusion decisions"
      end
      %i[category_id merchant_id investment_activity_label].each do |field|
        left, right = entry.transaction.public_send(field), survivor.transaction.public_send(field)
        raise Error, "Matched transactions have conflicting #{field.to_s.humanize.downcase}" if left.present? && right.present? && left != right
      end
      if entry.reconciled_by_statement_id && survivor.reconciled_by_statement_id && entry.reconciled_by_statement_id != survivor.reconciled_by_statement_id
        raise Error, "Matched transactions are reconciled to different statements"
      end
      if entry.transaction.extra["goal"].present? && survivor.transaction.extra["goal"].present? && entry.transaction.extra["goal"] != survivor.transaction.extra["goal"]
        raise Error, "Matched transactions belong to different goal pledges"
      end
    end

    def consolidate!(pairs)
      matched = pairs.to_h { |pair| [ pair[:incoming_id], pair[:survivor_id] ] }
      @archived_observations.each(&:destroy!)
      incoming.each do |id, item|
        survivor = matched[id] && canonical.find { |entry| entry.id == matched[id] }
        if item[:entry]
          entry = item[:entry]
          register_identity!(entry.external_id, survivor || entry, duplicate: survivor.present?) if entry.source == "simplefin" && entry.external_id.present?
          if survivor
            merge_entry!(entry, survivor)
          else
            move_entry!(entry)
          end
        elsif survivor
          register_identity!(item[:external_id], survivor, duplicate: true, provider: item[:provider])
        else
          # Explicit keep-separate must not be undone by the adapter's amount/date
          # heuristics. Provider-scoped identities distinguish reused upstream IDs.
          external_id = item[:external_id]
          external_id = "simplefin_#{item[:provider].id}_#{Digest::SHA256.hexdigest(external_id)}" if account.entries.exists?(source: "simplefin", external_id: external_id)
          entry = Account::ProviderImportAdapter.new(account).import_transaction(**item[:attributes], external_id: external_id,
            source: "simplefin", allow_heuristic_matching: false, notification_activity: false)
          register_identity!(item[:external_id], entry, provider: item[:provider])
        end
      end
      if source_account && !@mapping_only && source_account.id != account.id
        source_account.account_statements.update_all(account_id: account.id)
        source_account.update!(status: "disabled", disabled_at: Time.current, exclude_from_reports: true, balance: 0, cash_balance: 0)
      end
    end

    def register_identity!(external_id, entry, duplicate: false, provider: simplefin_account)
      identity = SimplefinTransactionIdentity.find_or_initialize_by(simplefin_account: provider, external_id: external_id)
      if identity.persisted? && identity.entry_id != entry.id && !incoming.key?(identity.entry_id)
        raise Error, "The provider identity is already assigned elsewhere"
      end
      identity.update!(entry: entry, duplicate: duplicate)
    end

    def move_entry!(entry)
      if entry.external_id.present? && entry.source.present? && account.entries.exists?(external_id: entry.external_id, source: entry.source)
        entry.update!(external_id: "#{entry.external_id}_#{entry.id}")
      end
      if entry.idempotency_key.present? && account.entries.exists?(idempotency_key: entry.idempotency_key)
        raise Error, "An incoming transaction has a conflicting idempotency key"
      end
      entry.update!(account: account)
      entry.child_entries.update_all(account_id: account.id)
      validate_transfers!(entry)
    end

    def merge_entry!(entry, survivor)
      transaction, target = entry.transaction, survivor.transaction
      extra = transaction.extra.deep_merge(target.extra)
      history = Array(extra.dig("provider_replacement", "merged_entries"))
      extra["provider_replacement"] = (extra["provider_replacement"] || {}).merge(
        "merged_entries" => history + [ { "entry" => entry.attributes.as_json, "transaction" => transaction.attributes.as_json } ])
      target.update!(category_id: target.category_id || transaction.category_id, merchant_id: target.merchant_id || transaction.merchant_id,
        investment_activity_label: target.investment_activity_label || transaction.investment_activity_label,
        extra: extra, locked_attributes: transaction.locked_attributes.merge(target.locked_attributes))
      target.tag_ids = (target.tag_ids + transaction.tag_ids).uniq
      transaction.attachments.each do |attachment|
        if target.attachments.exists?(blob_id: attachment.blob_id)
          attachment.delete
        else
          attachment.update!(record: target)
        end
      end
      if entry.child_entries.any?
        entry.child_entries.update_all(parent_entry_id: survivor.id, account_id: account.id, date: survivor.date)
      end
      if (transfer = transaction.transfer)
        column = transfer.inflow_transaction_id == transaction.id ? :inflow_transaction_id : :outflow_transaction_id
        transfer.update!(column => target.id)
        target.update!(kind: transaction.kind)
      end
      RejectedTransfer.where(inflow_transaction_id: transaction.id).update_all(inflow_transaction_id: target.id)
      RejectedTransfer.where(outflow_transaction_id: transaction.id).update_all(outflow_transaction_id: target.id)
      entry.recurring_allocations.update_all(entry_id: survivor.id)
      GoalPledge.where(matched_transaction_id: transaction.id).update_all(matched_transaction_id: target.id)
      CategorizationComparison.where(transaction_id: transaction.id).update_all(transaction_id: target.id)
      NotificationDelivery.where(transaction_id: transaction.id).each do |delivery|
        if NotificationDelivery.exists?(transaction_id: target.id, rule_id: delivery.rule_id)
          delivery.delete
        else
          delivery.update!(transaction_id: target.id)
        end
      end
      WebNotificationTransactionEvent.where(entry_id: entry.id).update_all(entry_id: survivor.id)
      SimplefinTransactionIdentity.where(entry: entry).update_all(entry_id: survivor.id, duplicate: true)
      survivor.update!(notes: [ survivor.notes, entry.notes ].compact_blank.uniq.join("\n\n").presence,
        user_modified: true, import_locked: survivor.import_locked || entry.import_locked,
        excluded: survivor.excluded || entry.excluded, reconciled_at: survivor.reconciled_at || entry.reconciled_at,
        reconciled_by_statement_id: survivor.reconciled_by_statement_id || entry.reconciled_by_statement_id,
        locked_attributes: entry.locked_attributes.merge(survivor.locked_attributes))
      # Enrichment history is user data too. Keep it with the surviving records.
      move_enrichments!(entry, survivor)
      move_enrichments!(transaction, target)
      # Reload dependents after reparenting them: stale has_one/has_many caches
      # would otherwise destroy the transfer or splits we just preserved.
      entry.reload
      transaction.reload
      target.reload
      entry.destroy!
      validate_transfers!(survivor)
    end

    def move_enrichments!(from, to)
      from.data_enrichments.each do |record|
        attrs = { enrichable_id: to.id }
        if to.data_enrichments.exists?(source: record.source, attribute_name: record.attribute_name)
          attrs[:source] = "#{record.source}:replacement:#{record.id}"
        end
        record.update!(attrs)
      end
    end

    def validate_transfers!(entry)
      [ entry, *entry.child_entries.reload ].each do |leg|
        next unless leg.transaction?
        transfer = leg.transaction.transfer
        next unless transfer
        transfer.reload
        raise Error, "Consolidation would invalidate a transfer or create a self-transfer" unless transfer.valid?
      end
    end

    def relink!
      old_ids = old_provider_ids - [ simplefin_account.id ]
      # Retire former feeds durably, retaining raw payloads and historical IDs.
      SimplefinAccount.unscoped.where(id: old_ids, retired_at: nil).update_all(retired_at: Time.current, retired_account_id: account.id)
      mappings = AccountProvider.where(account: account, provider_type: "SimplefinAccount").or(AccountProvider.where(provider: simplefin_account))
      holding_ids = Holding.where(account_provider_id: mappings.select(:id), account_id: account.id).pluck(:id)
      mappings.each(&:destroy!)
      Account.where(simplefin_account_id: simplefin_account.id).where.not(id: account.id).update_all(simplefin_account_id: nil)
      # Assign through the association, not just its FK: a loaded legacy
      # belongs_to must not autosave the former provider back onto this account.
      account.update!(simplefin_account: nil)
      source_account.reload if source_account && source_account.id != account.id
      mapping = AccountProvider.create!(account: account, provider: simplefin_account)
      Holding.where(id: holding_ids).update_all(account_provider_id: mapping.id)
      simplefin_account.reload
    end
end
