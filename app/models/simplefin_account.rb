class SimplefinAccount < ApplicationRecord
  include Encryptable

  # Encrypt raw payloads if ActiveRecord encryption is configured
  if encryption_ready?
    encrypts :raw_payload
    encrypts :raw_transactions_payload
    encrypts :raw_holdings_payload
  end

  belongs_to :simplefin_item
  belongs_to :retired_account, class_name: "Account", optional: true

  default_scope { where(retired_at: nil) }

  # SimpleFIN writers and replacement take this lock before account/entry locks.
  # The family row also serializes two connections replacing the same account.
  def with_ingestion_lock
    self.class.transaction do
      simplefin_item.family.class.where(id: simplefin_item.family_id).lock.pick(:id)
      reload if persisted?
      yield unless retired_at?
    end
  end

  def unreviewed_retired_transactions
    return [] unless retired_at? && retired_account
    known = SimplefinTransactionIdentity.where(simplefin_account: self).pluck(:external_id)
    known.concat(retired_account.entries.where(source: "simplefin").where.not(external_id: nil).pluck(:external_id))
    known = known.to_set
    raw_transactions_payload.to_a.select do |raw|
      raw.is_a?(Hash) && raw.with_indifferent_access[:id].present? &&
        !known.include?("simplefin_#{raw.with_indifferent_access[:id]}") &&
        SimplefinEntry::Processor.new(raw, simplefin_account: self).import_enabled?
    end
  end

  # Legacy association via foreign key (will be removed after migration)
  has_one :account, dependent: :nullify, foreign_key: :simplefin_account_id

  # New association through account_providers
  has_one :account_provider, as: :provider, dependent: :destroy
  has_one :linked_account, through: :account_provider, source: :account

  validates :name, :account_type, :currency, presence: true
  validates :account_id, uniqueness: { scope: :simplefin_item_id, allow_nil: true }
  validates :balance_sign_override, inclusion: { in: %w[credit debt], allow_nil: true }
  validate :has_balance

  # Helper to get account using new system first, falling back to legacy
  def current_account
    linked_account || account
  end

  # Summary of transaction activity derived from raw_transactions_payload.
  # Used by the setup UI and ReplacementDetector to distinguish live vs dormant
  # accounts without re-parsing the payload at every call site.
  def activity_summary
    ActivitySummary.new(raw_transactions_payload)
  end

  # Ensure there is an AccountProvider link for this SimpleFin account and its current Account.
  # Safe and idempotent; returns the AccountProvider or nil if no account is associated yet.
  def ensure_account_provider!
    with_ingestion_lock { ensure_account_provider_locked! }
  end

  def ensure_account_provider_locked!
    acct = current_account
    return nil unless acct

    provider = AccountProvider
      .find_or_initialize_by(provider_type: "SimplefinAccount", provider_id: id)
      .tap do |p|
        p.account = acct
        p.save!
      end

    # Reload the association so future accesses don't return stale/nil value
    reload_account_provider

    provider
  rescue => e
    Rails.logger.warn("SimplefinAccount##{id}: failed to ensure AccountProvider link: #{e.class} - #{e.message}")
    nil
  end

  def upsert_simplefin_snapshot!(account_snapshot)
    with_ingestion_lock { upsert_simplefin_snapshot_locked!(account_snapshot) }
  end

  def upsert_simplefin_snapshot_locked!(account_snapshot)
    # Convert to symbol keys or handle both string and symbol keys
    snapshot = account_snapshot.with_indifferent_access

    # Map SimpleFin field names to our field names
    update!(
      current_balance: parse_balance(snapshot[:balance]),
      available_balance: parse_balance(snapshot[:"available-balance"]),
      currency: parse_currency(snapshot[:currency]),
      account_type: snapshot["type"] || "unknown",
      account_subtype: snapshot["subtype"],
      name: snapshot[:name],
      account_id: snapshot[:id],
      balance_date: parse_balance_date(snapshot[:"balance-date"]),
      extra: snapshot[:extra],
      org_data: snapshot[:org],
      raw_payload: account_snapshot
    )
  end

  def upsert_simplefin_transactions_snapshot!(transactions_snapshot)
    with_ingestion_lock { update!(raw_transactions_payload: transactions_snapshot) }
  end

  private :ensure_account_provider_locked!, :upsert_simplefin_snapshot_locked!

  private

    def parse_balance(balance_value)
      return nil if balance_value.nil?

      case balance_value
      when String
        BigDecimal(balance_value)
      when Numeric
        BigDecimal(balance_value.to_s)
      else
        nil
      end
    rescue ArgumentError
      nil
    end

    def parse_currency(currency_value)
      return "USD" if currency_value.blank?

      # SimpleFin currency can be a 3-letter code or a URL for custom currencies
      if currency_value.start_with?("http")
        # For custom currency URLs, we'll just use the last part as currency code
        # This is a simplification - in production you might want to fetch the currency info
        begin
          URI.parse(currency_value).path.split("/").last.upcase
        rescue URI::InvalidURIError => e
          Rails.logger.warn("Invalid currency URI for SimpleFin account: #{currency_value}, error: #{e.message}")
          "USD"
        end
      else
        currency_value.upcase
      end
    end

    def parse_balance_date(balance_date_value)
      parsed = Simplefin::DateUtils.parse_provider_time(balance_date_value)
      return parsed if parsed.present?
      return nil if balance_date_value.nil?

      Rails.logger.warn("Invalid balance date for SimpleFin account: #{balance_date_value}")
      nil
    rescue ArgumentError, TypeError, NameError
      Rails.logger.warn("Invalid balance date for SimpleFin account: #{balance_date_value}")
      nil
    end
    def has_balance
      return if current_balance.present? || available_balance.present?
      errors.add(:base, :no_balance)
    end
end
