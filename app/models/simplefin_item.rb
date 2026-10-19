require "digest"

class SimplefinItem < ApplicationRecord
  include Syncable, Provided, Encryptable, DestroyableLater
  include SimplefinItem::Unlinking

  enum :status, { good: "good", requires_update: "requires_update" }, default: :good

  # Virtual attribute for the setup token form field
  attr_accessor :setup_token

  # Runtime discovery evidence for guarded reconnection recovery.
  attr_accessor :upstream_account_ids

  # Encrypt sensitive credentials and raw payloads if ActiveRecord encryption is configured
  if encryption_ready?
    encrypts :access_url, deterministic: true
    encrypts :raw_payload
    encrypts :raw_institution_payload
  end

  validates :name, presence: true
  validates :access_url, presence: true, on: :create

  before_destroy :remove_simplefin_item

  belongs_to :family
  has_one_attached :logo, dependent: :purge_later

  has_many :simplefin_accounts, dependent: :destroy
  has_many :retired_simplefin_accounts, -> { unscope(where: :retired_at).where.not(retired_at: nil) },
    class_name: "SimplefinAccount", dependent: :destroy
  has_many :legacy_accounts, through: :simplefin_accounts, source: :account

  scope :active, -> { where(scheduled_for_deletion: false) }
  scope :syncable, -> { active }
  scope :ordered, -> { order(created_at: :desc) }
  scope :needs_update, -> { where(status: :requires_update) }

  # Get accounts from both new and legacy systems
  def accounts
    @accounts ||= simplefin_accounts
      .includes(:account, account_provider: :account)
      .map(&:current_account)
      .compact
      .uniq
  end

  def import_latest_simplefin_data(sync: nil)
    SimplefinItem::Importer.new(self, simplefin_provider: simplefin_provider, sync: sync).import
  end

  # Update the access_url by claiming a new setup token.
  # This is used when reconnecting an existing SimpleFIN connection.
  # Unlike create_simplefin_item!, this updates in-place, preserving all account linkages.
  def update_access_url!(setup_token:)
    new_access_url = simplefin_provider.claim_access_url(setup_token)

    update!(
      access_url: new_access_url,
      status: :good
    )

    self
  end

  def process_accounts
    # Process accounts linked via BOTH legacy FK and AccountProvider
    # Use direct query to ensure fresh data from DB, bypassing any association cache
    all_accounts = SimplefinAccount.where(simplefin_item_id: id).includes(:account, :linked_account, account_provider: :account).to_a

    Rails.logger.info "=" * 60
    Rails.logger.info "SimplefinItem#process_accounts START - Item #{id} (#{name})"
    Rails.logger.info "  Total SimplefinAccounts: #{all_accounts.count}"

    # Log all accounts for debugging
    all_accounts.each do |sfa|
      acct = sfa.current_account
      Rails.logger.info "  - SimplefinAccount id=#{sfa.id} sf_account_id=#{sfa.account_id} name='#{sfa.name}'"
      Rails.logger.info "    linked_account: #{sfa.linked_account&.id || 'nil'}, account: #{sfa.account&.id || 'nil'}, current_account: #{acct&.id || 'nil'}"
      Rails.logger.info "    raw_transactions_payload count: #{sfa.raw_transactions_payload.to_a.count}"
    end

    repair_stale_linkages(all_accounts)
    all_accounts = SimplefinAccount.where(simplefin_item_id: id).includes(:account, :linked_account, account_provider: :account).to_a

    linked = all_accounts.select { |sfa| sfa.current_account.present? }
    unlinked = all_accounts.reject { |sfa| sfa.current_account.present? }

    Rails.logger.info "SimplefinItem#process_accounts - #{linked.count} linked, #{unlinked.count} unlinked"

    # Log unlinked accounts with transactions for debugging
    unlinked_with_txns = unlinked.select { |sfa| sfa.raw_transactions_payload.to_a.any? }
    if unlinked_with_txns.any?
      Rails.logger.warn "SimplefinItem#process_accounts - #{unlinked_with_txns.count} UNLINKED account(s) have transactions that won't be processed:"
      unlinked_with_txns.each do |sfa|
        Rails.logger.warn "  - SimplefinAccount id=#{sfa.id} name='#{sfa.name}' sf_account_id=#{sfa.account_id} txn_count=#{sfa.raw_transactions_payload.to_a.count}"
      end
    end

    all_skipped_entries = []

    linked.each do |simplefin_account|
      acct = simplefin_account.current_account
      Rails.logger.info "SimplefinItem#process_accounts - Processing: SimplefinAccount id=#{simplefin_account.id} name='#{simplefin_account.name}' -> Account id=#{acct.id} name='#{acct.name}' type=#{acct.accountable_type}"
      processor = SimplefinAccount::Processor.new(simplefin_account)
      processor.process
      all_skipped_entries.concat(processor.skipped_entries)
    end

    Rails.logger.info "SimplefinItem#process_accounts END - #{all_skipped_entries.size} entries skipped (protected)"
    Rails.logger.info "=" * 60

    all_skipped_entries
  end

  # Recovery of an absent upstream identity remains automatic only when the
  # unlinked replacement is unambiguous and introduces no changed-ID overlap.
  # Populated-ledger ambiguity belongs in the explicit replacement review.
  def repair_stale_linkages(_all_accounts)
    transaction do
      Family.where(id: family_id).lock.pick(:id)
      providers = simplefin_accounts.includes(:account, :linked_account, account_provider: :account).to_a
      unlinked = providers.select { |provider| provider.current_account.nil? && provider.raw_transactions_payload.to_a.any? }
      if upstream_account_ids.nil?
        if unlinked.any?
          DebugLogEntry.capture(category: "provider_sync_warning", level: "warn",
            message: "Skipped stale-linkage repair: upstream_account_ids unavailable", source: self.class.name,
            provider_key: "simplefin", family: family, metadata: { simplefin_item_id: id, unlinked_with_data_count: unlinked.size })
        end
        next
      end
      linked = providers.select { |provider| provider.current_account }
      pairs = unlinked.filter_map do |fresh|
        stale = linked.select do |old|
          old.name.to_s.strip.casecmp?(fresh.name.to_s.strip) && old.account_id.present? &&
            upstream_account_ids.exclude?(old.account_id.to_s) && old.currency == fresh.currency
        end
        [ stale.first, fresh ] if stale.one?
      end
      pairs.each do |old, fresh|
        next unless pairs.count { |candidate, _| candidate.id == old.id } == 1
        account = old.current_account
        Account.where(id: account.id).lock.pick(:id)
        overlap = fresh.raw_transactions_payload.to_a.any? do |raw|
          data = raw.with_indifferent_access
          next true if data[:id].blank?
          external_id = "simplefin_#{data[:id]}"
          next false if account.entries.exists?(source: "simplefin", external_id: external_id)
          attrs = SimplefinEntry::Processor.new(raw, simplefin_account: fresh, normalization_account: account).import_attributes
          account.entries.where(entryable_type: "Transaction", amount: attrs[:amount], currency: attrs[:currency],
            date: (attrs[:date] - 4)..(attrs[:date] + 4)).exists?
        end
        if overlap
          DebugLogEntry.capture(category: "provider_sync_warning", level: "warn",
            message: "Stale-linkage recovery requires explicit duplicate review", source: self.class.name, provider_key: "simplefin",
            family: family, account: account, metadata: { old_simplefin_account_id: old.id, simplefin_account_id: fresh.id })
          next
        end
        audit = { provenance: "automatic_stale_recovery", account: account.attributes, old_provider: old.attributes,
          replacement: fresh.attributes, mapping: old.account_provider&.attributes }
        fresh.update!(raw_transactions_payload: merge_transactions(old.raw_transactions_payload.to_a, fresh.raw_transactions_payload.to_a))
        account.update!(simplefin_account_id: fresh.id) if account.simplefin_account_id == old.id
        if old.account_provider
          old.account_provider.update!(provider: fresh)
        else
          AccountProvider.create!(account: account, provider: fresh)
        end
        account.entries.where(source: "simplefin").where.not(external_id: nil).find_each do |entry|
          [ old, fresh ].each do |provider|
            SimplefinTransactionIdentity.find_or_create_by!(simplefin_account: provider, external_id: entry.external_id) { |identity| identity.entry = entry }
          end
        end
        old.update_columns(retired_at: Time.current, retired_account_id: account.id, raw_transactions_payload: [], raw_holdings_payload: [])
        key = "recovery:#{old.id}:#{fresh.id}"
        operation = ProviderReplacementOperation.find_or_create_by!(account: account, idempotency_key: key) do |record|
          record.simplefin_account = fresh
          record.request_digest = Digest::SHA256.hexdigest(key)
          record.audit = audit
        end
        operation.update!(result: { account_id: account.id, operation_id: operation.id })
      end
    end
  end

  # Only durable IDs prove identity. Keep unidentified rows separate for review.
  def merge_transactions(old_transactions, new_transactions)
    identified = {}
    unidentified = []
    (old_transactions + new_transactions).each do |raw|
      key = raw.with_indifferent_access[:id].presence || raw.with_indifferent_access[:fitid].presence
      key ? identified[key.to_s] = raw : unidentified << raw
    end
    identified.values + unidentified
  end

  def schedule_account_syncs(parent_sync: nil, window_start_date: nil, window_end_date: nil)
    accounts.each do |account|
      account.sync_later(
        parent_sync: parent_sync,
        window_start_date: window_start_date,
        window_end_date: window_end_date
      )
    end
  end

  def upsert_simplefin_snapshot!(accounts_snapshot)
    assign_attributes(
      raw_payload: accounts_snapshot,
    )

    # Do not populate item-level institution fields from account data.
    # Institution metadata belongs to each simplefin_account (in org_data).

    save!
  end

  def upsert_institution_data!(org_data)
    org = org_data.to_h.with_indifferent_access
    url = org[:url] || org[:"sfin-url"]
    domain = org[:domain]

    # Derive domain from URL if missing
    if domain.blank? && url.present?
      begin
        domain = URI.parse(url).host&.gsub(/^www\./, "")
      rescue URI::InvalidURIError
        Rails.logger.warn("Invalid SimpleFin institution URL: #{url.inspect}")
      end
    end

    assign_attributes(
      institution_id: org[:id],
      institution_name: org[:name],
      institution_domain: domain,
      institution_url: url,
      raw_institution_payload: org_data
    )
  end


  def has_completed_initial_setup?
    # Setup is complete if we have any linked accounts
    accounts.any?
  end

  def sync_status_summary
    latest = latest_sync
    return nil unless latest

    # If sync has statistics, use them
    stats = parse_sync_stats(latest.sync_stats)
    if stats.present?
      total = stats["total_accounts"] || 0
      linked = stats["linked_accounts"] || 0
      unlinked = stats["unlinked_accounts"] || 0
    else
      # Fallback to current account counts
      total = simplefin_accounts.count
      linked = accounts.count
      unlinked = total - linked
    end

    if total == 0
      I18n.t("simplefin_items.sync_status.no_accounts")
    elsif unlinked == 0
      I18n.t("simplefin_items.sync_status.synced", count: linked)
    else
      I18n.t("simplefin_items.sync_status.partial_setup", count: unlinked, linked: linked, unlinked: unlinked)
    end
  end

  def institution_display_name
    # Try to get institution name from stored metadata
    institution_name.presence || institution_domain.presence || name
  end

  def connected_institutions
    # Get unique institutions from all accounts
    simplefin_accounts.includes(:account)
                     .where.not(org_data: nil)
                     .map { |acc| acc.org_data }
                     .uniq { |org| org["domain"] || org["name"] }
  end

  def institution_summary
    institutions = connected_institutions
    case institutions.count
    when 0
      I18n.t("simplefin_items.institution_summary.none")
    when 1
      institutions.first["name"] || institutions.first["domain"] || I18n.t("simplefin_items.institution_summary.count", count: 1)
    else
      I18n.t("simplefin_items.institution_summary.count", count: institutions.count)
    end
  end



  # Detect a recent rate-limited sync and return a friendly message, else nil
  def rate_limited_message
    latest = latest_sync
    return nil unless latest

    # Some Sync records may not have a status_text column; guard with respond_to?
    parts = []
    parts << latest.error if latest.respond_to?(:error)
    parts << latest.status_text if latest.respond_to?(:status_text)
    msg = parts.compact.join(" — ")
    return nil if msg.blank?

    down = msg.downcase
    if down.include?("make fewer requests") || down.include?("only refreshed once every 24 hours") || down.include?("rate limit")
      I18n.t("simplefin_items.rate_limited.daily_refresh")
    else
      nil
    end
  end

  # Detect if sync data appears stale (no new transactions for extended period)
  # Returns a hash with :stale (boolean) and :message (string) if stale
  def stale_sync_status
    return { stale: false } unless last_synced_at.present?

    # Check if last sync was more than 3 days ago
    days_since_sync = (Date.current - last_synced_at.to_date).to_i
    if days_since_sync > 3
      return {
        stale: true,
        days_since_sync: days_since_sync,
        message: I18n.t("simplefin_items.stale_sync.last_successful", count: days_since_sync)
      }
    end

    # Check if linked accounts have recent transactions
    linked_accounts = accounts
    return { stale: false } if linked_accounts.empty?

    # Find the most recent transaction date across all linked accounts
    latest_transaction_date = Entry.where(account_id: linked_accounts.map(&:id))
                                   .where(entryable_type: "Transaction")
                                   .maximum(:date)

    if latest_transaction_date.present?
      days_since_transaction = (Date.current - latest_transaction_date).to_i
      if days_since_transaction > 14
        return {
          stale: true,
          days_since_transaction: days_since_transaction,
          message: I18n.t("simplefin_items.stale_sync.no_transactions", count: days_since_transaction)
        }
      end
    end

    { stale: false }
  end

  # Check if the SimpleFin connection needs user attention
  def needs_attention?
    setup_token_update_required? || stale_sync_status[:stale] || pending_account_setup?
  end

  # Get a summary of issues requiring attention
  def attention_summary
    issues = []
    issues << "Connection needs update" if setup_token_update_required?
    issues << stale_sync_status[:message] if stale_sync_status[:stale]
    issues << "Accounts need setup" if pending_account_setup?
    issues
  end

  # A SimpleFIN setup token is only needed when the bridge access URL appears
  # unusable. If the latest sync returned accounts, the access URL still works;
  # any auth warning in that response belongs to an individual institution.
  def setup_token_update_required?(latest_sync: nil)
    return false unless requires_update?

    latest = latest_sync || syncs.ordered.first
    return true unless latest
    return false if latest.in_progress?

    stats = parse_sync_stats(latest.sync_stats).to_h.stringify_keys
    stats["total_accounts"].to_i.zero?
  end

  def effective_status(latest_sync: nil)
    setup_token_update_required?(latest_sync: latest_sync) ? status : "good"
  end

  # Get reconciled duplicates count from the last sync
  # Returns { count: N, message: "..." } or { count: 0 } if none
  def last_sync_reconciled_status
    latest_sync = syncs.ordered.first
    return { count: 0 } unless latest_sync

    stats = parse_sync_stats(latest_sync.sync_stats)
    count = stats&.dig("pending_reconciled").to_i
    if count > 0
      {
        count: count,
        message: I18n.t("simplefin_items.reconciled_status.message", count: count)
      }
    else
      { count: 0 }
    end
  end

  # Count stale pending transactions (>8 days old) across all linked accounts
  # Returns { count: N, accounts: [names] } or { count: 0 } if none
  def stale_pending_status(days: 8)
    # Get all accounts linked to this SimpleFIN item
    # Eager-load both association paths to avoid N+1 on current_account method
    linked_accounts = simplefin_accounts.includes(:account, :linked_account).filter_map(&:current_account)
    return { count: 0 } if linked_accounts.empty?

    # Batch query to avoid N+1
    account_ids = linked_accounts.map(&:id)
    counts_by_account = Entry.stale_pending(days: days)
      .where(excluded: false)
      .where(account_id: account_ids)
      .group(:account_id)
      .count

    account_counts = linked_accounts
      .map { |account| { account: account, count: counts_by_account[account.id].to_i } }
      .select { |ac| ac[:count] > 0 }

    total = account_counts.sum { |ac| ac[:count] }
    if total > 0
      {
        count: total,
        accounts: account_counts.map { |ac| ac[:account].name },
        message: I18n.t("simplefin_items.stale_pending_status.message", count: total, days: days)
      }
    else
      { count: 0 }
    end
  end

  private
    # Parse sync_stats, handling cases where it might be a raw JSON string
    # (e.g., from console testing or bypassed serialization)
    def parse_sync_stats(sync_stats)
      return nil if sync_stats.blank?
      return sync_stats if sync_stats.is_a?(Hash)

      if sync_stats.is_a?(String)
        JSON.parse(sync_stats) rescue nil
      end
    end

    def remove_simplefin_item
      # SimpleFin doesn't require server-side cleanup like Plaid
      # The access URL just becomes inactive
    end
end
