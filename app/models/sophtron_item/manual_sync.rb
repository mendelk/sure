# frozen_string_literal: true

# An interactive refresh has the same import/processing pipeline as a background
# sync, but pauses at the provider's MFA challenge instead of losing the job.
class SophtronItem::ManualSync
  include SyncStats::Collector

  PROCESSED_IDS_KEY = "manual_sync_processed_sophtron_account_ids"

  def initialize(item)
    @item = item
  end

  def start!
    raise ProviderConnection::Conflict, "A manual sync is already running" if item.current_job_sophtron_account_id.present?
    raise ProviderConnection::Invalid, "There are no linked accounts to sync" unless item.manual_sync_sophtron_accounts.exists?
    @sync = item.syncs.create!(sync_stats: { PROCESSED_IDS_KEY => [] })
    sync.start!
    advance!
  rescue Provider::Sophtron::Error
    fail_sync!
    raise ProviderConnection::Invalid, "The provider could not start the manual sync"
  rescue StandardError
    fail_sync! if @sync
    raise
  end

  def poll!
    raise ProviderConnection::Invalid, "No manual sync is running" unless sync
    if sync.cancel_requested? || !sync.syncing?
      item.update!(current_job_id: nil, current_job_sophtron_account_id: nil)
      sync.mark_stale! if sync.may_mark_stale?
      return { sync_id: sync.id, status: "cancelled" }
    end
    if item.current_job_id.present?
      job = response_data!(remote.get_job_information(item.current_job_id))
      item.upsert_job_snapshot!(job)
      return pending_result(job) if Provider::Sophtron.job_requires_input?(job)
      if Provider::Sophtron.job_failed?(job)
        fail_sync!
        raise ProviderConnection::Invalid, "The manual sync failed"
      end
      return pending_result(job) unless Provider::Sophtron.job_success?(job) || Provider::Sophtron.job_completed?(job)
      account = item.current_job_sophtron_account
      raise ProviderConnection::Invalid, "The manual sync account is no longer available" unless account
      complete_account!(account)
    end
    advance!
  rescue Provider::Sophtron::Error
    fail_sync!
    raise ProviderConnection::Invalid, "The provider could not complete the manual sync"
  rescue StandardError
    fail_sync! if @sync
    raise
  end

  private
    attr_reader :item

    def sync
      @sync ||= item.syncs.incomplete.ordered.detect { |record| record.sync_stats.to_h.key?(PROCESSED_IDS_KEY) }
    end

    def remote
      @remote ||= item.sophtron_provider || raise(ProviderConnection::Invalid, "The provider is not configured")
    end

    def response_data!(response)
      Provider::Sophtron.response_data!(response)
    end

    def advance!
      processed = Array(sync.sync_stats.to_h[PROCESSED_IDS_KEY])
      item.manual_sync_sophtron_accounts.each do |account|
        next if processed.include?(account.id.to_s)
        result = response_data!(remote.refresh_account(account.account_id)).with_indifferent_access
        job_id = result[:JobID] || result[:job_id]
        if job_id.present?
          item.update!(current_job_id: job_id, current_job_sophtron_account_id: account.id, raw_job_payload: result, job_status: nil, last_connection_error: nil, status: :good)
          return poll!
        end
        complete_account!(account)
      end
      item.update!(current_job_id: nil, current_job_sophtron_account_id: nil, last_connection_error: nil, status: :good)
      sync.finalize_if_all_children_finalized
      { sync_id: sync.id, status: "completed" }
    end

    def complete_account!(account)
      result = SophtronItem::Importer.new(item, sophtron_provider: remote, sync: sync).import_transactions_after_refresh(account)
      unless result[:success]
        fail_sync!
        raise ProviderConnection::Invalid, "The provider could not import the refreshed transactions"
      end
      processing = SophtronAccount::Processor.new(account.reload).process
      mark_import_started(sync)
      stats = sync.sync_stats.to_h
      ids = (Array(stats[PROCESSED_IDS_KEY]) + [ account.id.to_s ]).uniq
      sync.update!(sync_stats: stats.merge(PROCESSED_IDS_KEY => ids))
      collect_setup_stats(sync, provider_accounts: item.sophtron_accounts.includes(:account_provider, :account))
      account_ids = item.sophtron_accounts.where(id: ids).includes(:account_provider).filter_map { |record| record.current_account&.id }
      collect_transaction_stats(sync, account_ids: account_ids, source: "sophtron", window_start: sync.syncing_at || sync.created_at, window_end: Time.current)
      errors = processing.is_a?(Hash) && processing[:success] == false ? processing[:errors] : nil
      collect_health_stats(sync, errors: errors)
      item.update!(current_job_id: nil, current_job_sophtron_account_id: nil, last_connection_error: nil, status: :good)
      account.current_account&.sync_later(parent_sync: sync, window_start_date: sync.window_start_date, window_end_date: sync.window_end_date)
    rescue StandardError
      fail_sync!
      raise
    end

    def pending_result(job)
      result = { sync_id: sync.id, status: "pending" }
      result[:challenge] = item.build_mfa_challenge(job) if Provider::Sophtron.job_requires_input?(job)
      result
    end

    def fail_sync!
      item.update!(current_job_id: nil, current_job_sophtron_account_id: nil, last_connection_error: "Manual sync failed", status: :requires_update)
      return unless sync
      sync.fail! if sync.may_fail?
      sync.update!(error: "Manual sync failed")
    end
end
