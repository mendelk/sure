class WebNotificationTransactionEvent < ApplicationRecord
  belongs_to :account
  belongs_to :entry, optional: true
  has_many :receipts, class_name: "WebNotificationTransactionReceipt", foreign_key: :event_id, dependent: :delete_all

  # Explicit create-path hook, deliberately not an Entry/Transaction callback:
  # imports, restores, splits and ledger maintenance must never look like arrivals.
  def self.save_new(entry, origin:)
    transaction do
      Account.where(id: entry.account_id).lock.pick(:id)
      saved = entry.save
      if saved
        key = entry.external_id.present? ? [ entry.source, entry.external_id ].to_json : entry.id
        observe!(entry: entry, source: "create:#{origin}", external_id: key,
          pending: false, new_activity: true, baseline: false)
      end
      saved
    end
  end

  # Providers with deliberately separate cash/trade legs already own their
  # reconciliation. Keep that behavior while recording their cash leg atomically.
  def self.create_provider!(account:, source:, **attributes)
    transaction do
      Account.where(id: account.id).lock.pick(:id)
      WebNotificationTransactionSource.prepare!(account: account, source: source)
      entry = account.entries.create!(attributes.merge(source: source))
      observe!(entry: entry, source: source, external_id: entry.external_id, pending: false, new_activity: true)
      entry
    end
  end

  # Reconciliation joins identities, never manufactures an arrival or posting.
  # Keep per-user consumption when a pending/posted pair previously had two rows.
  def self.reconcile!(entry:, source:, external_ids:)
    transaction do
      Account.where(id: entry.account_id).lock.pick(:id)
      keys = external_ids.compact.map { |key| Digest::SHA256.hexdigest(key.to_s) }.uniq
      matches = where(account_id: entry.account_id, source: source)
        .where("identity_keys ?| ARRAY[:keys]::text[]", keys: keys).order(:first_observed_at, :id).to_a
      return if matches.empty?

      survivor = matches.shift
      posting = ([ survivor ] + matches).select(&:posted_at).min_by(&:posted_at)
      survivor.assign_attributes(entry: entry, identity_keys: ([ survivor.identity_keys, keys ] + matches.map(&:identity_keys)).flatten.uniq,
        baseline: survivor.baseline? || matches.any?(&:baseline?))
      survivor.assign_attributes(posted_at: posting.posted_at, amount: posting.amount, currency: posting.currency) if posting
      survivor.save!

      matches.each do |duplicate|
        rows = duplicate.receipts.map do |receipt|
          { user_id: receipt.user_id, event_id: survivor.id, web_notification_id: receipt.web_notification_id,
            created_at: receipt.created_at, updated_at: receipt.updated_at }
        end
        WebNotificationTransactionReceipt.insert_all(rows, unique_by: "idx_web_notification_transaction_receipts_once") if rows.any?
        duplicate.destroy!
      end
      survivor
    end
  end

  # The caller's ledger write and this fact share one transaction. No enqueue is
  # necessary: the periodic sweep recovers all committed, unconsumed observations.
  # Account locking also serializes aliases when a provider changes pending IDs.
  def self.observe!(entry:, source:, external_id:, pending:, new_activity:, aliases: [], baseline: nil, now: Time.current)
    transaction do
      Account.where(id: entry.account_id).lock.pick(:id)
      keys = ([ external_id ] + aliases).compact.map { |key| Digest::SHA256.hexdigest(key.to_s) }.uniq
      scope = where(account_id: entry.account_id, source: source)
      reconcile!(entry: entry, source: source, external_ids: [ external_id ] + aliases) if aliases.compact.any?
      event = scope.where("identity_keys ?| ARRAY[:keys]::text[]", keys: keys).first || scope.find_by(entry_id: entry.id)
      unless event
        source_baseline = WebNotificationTransactionSource.prepare!(account: entry.account, source: source) if baseline.nil?
        event = scope.new(identity_key: keys.first, first_observed_at: now, amount: entry.amount, currency: entry.currency,
          baseline: baseline.nil? ? (!source_baseline.completed_at || !new_activity) : baseline)
      end
      event.entry = entry if !pending || event.posted_at.nil?
      event.identity_keys = (event.identity_keys + keys).uniq
      if !pending && event.posted_at.nil?
        event.amount = entry.amount
        event.currency = entry.currency
      end
      event.posted_at ||= now unless pending
      event.save!
      event
    end
  end
end
