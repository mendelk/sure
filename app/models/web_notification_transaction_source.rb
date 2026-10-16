class WebNotificationTransactionSource < ApplicationRecord
  belongs_to :account

  # Called before writing an incoming row. Existing ledger history establishes a
  # baseline for installations enabling the feature on already-linked accounts.
  # A source first seen during this ingestion stays unready until history succeeds.
  def self.prepare!(account:, source:)
    find_or_create_by!(account: account, source: source) do |baseline|
      baseline.completed_at = Time.current if account.entries.where(source: source, entryable_type: "Transaction").exists?
    end
  end

  def self.complete!(account:, source:)
    return unless account

    transaction do
      Account.where(id: account.id).lock.pick(:id)
      baseline = prepare!(account: account, source: source)
      baseline.update!(completed_at: Time.current) unless baseline.completed_at
    end
  end
end
