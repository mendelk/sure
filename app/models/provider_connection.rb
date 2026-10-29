# frozen_string_literal: true

# Family-scoped provider management shared by first-party and external clients.
# The registry is a whitelist: request data never becomes a constant or association.
class ProviderConnection
  class Invalid < StandardError; end
  class Forbidden < StandardError; end
  class Conflict < Invalid; end

  include Configuration
  include AccountSetup
  include WalletActions

  attr_reader :family, :user, :provider, :item

  def initialize(family:, user:, provider:, id: nil)
    @family = family
    @user = user
    @provider = ProviderConnectionStatus::PROVIDERS.find { |entry| entry[:key] == provider.to_s }
    raise ActiveRecord::RecordNotFound unless @provider
    if id.present?
      raise ActiveRecord::RecordNotFound unless UuidFormat.valid?(id)
      @item = items.find(id)
    end
  end

  def key
    provider[:key]
  end

  def items
    family.public_send(provider[:association])
  end

  def authorize_manage!
    raise Forbidden, "You cannot manage this provider connection" unless user&.active? && user.family_id == family.id
    allowed = if key == "plaid"
      item ? item.manageable_by?(user) : user.admin? || (PlaidItem.member_connectable? && user.member?)
    elsif key == "financekit"
      user.admin? && (!item || item.user_id == user.id)
    else
      user.admin?
    end
    raise Forbidden, "You cannot manage this provider connection" unless allowed
  end

  def authorize_account!(account)
    raise Forbidden, "You cannot modify this account" unless account.family_id == family.id && family.accounts.writable_by(user).where(id: account.id).exists?
  end

  def status
    authorize_manage!
    require_item!
    ProviderConnectionStatus.new(provider, item, {
      latest_sync: item.respond_to?(:syncs) ? item.syncs.ordered.first : nil,
      latest_completed_sync: item.respond_to?(:syncs) ? item.syncs.completed.ordered.first : nil
    }).to_h
  end

  def sync!(balances_only: false)
    authorize_manage!
    require_item!
    raise Invalid, "Wallet publisher connections do not support server sync" if key == "financekit"
    if balances_only
      raise Invalid, "Balances-only sync is only available for SimpleFIN" unless key == "simplefin"
      sync = item.syncs.create!(status: :pending)
      SyncJob.perform_later(sync, balances_only: true)
    elsif key == "plaid"
      item.sync_later_with_provider_refresh
    elsif key == "sophtron" && item.manual_sync_required?
      return SophtronItem::ManualSync.new(item).start!
    else
      item.update!(history_unlock_required_at: nil) if key == "fio" && item.history_unlock_required_at.present?
      item.sync_later unless item.syncing?
    end
    { accepted: true }
  end

  def cancel_sync!
    authorize_manage!
    require_item!
    raise Invalid, "This connection does not support server sync" unless item.respond_to?(:syncs)
    results = item.syncs.incomplete.map do |sync|
      pending = sync.pending?
      accepted = sync.request_cancel!
      { id: sync.id, status: accepted ? (pending ? "cancelled_before_start" : "cancel_requested") : "not_cancellable" }
    end
    { syncs: results }
  end

  def remove!
    authorize_manage!
    require_item!
    linked_accounts.each { |account| authorize_account!(account) }
    if key == "financekit"
      item.disconnect!
    else
      if unlink_before_delete?
        results = item.unlink_all!(dry_run: false)
        raise Conflict, "Some accounts could not be unlinked; the connection was not removed" if Array(results).any? { |result| result[:error].present? }
      end
      item.revoke_session if key == "enable_banking"
      item.destroy_later
    end
    { scheduled_for_deletion: true }
  end

  def dismiss_replacement_suggestion!(attributes)
    authorize_manage!
    require_item!
    raise Invalid, "Replacement suggestions are only available for SimpleFIN" unless key == "simplefin"
    %w[dormant_sfa_id active_sfa_id].each do |field|
      raise Invalid, "Invalid provider account" unless UuidFormat.valid?(attributes.fetch(field))
    end
    dormant = item.simplefin_accounts.find(attributes.fetch("dormant_sfa_id"))
    active = item.simplefin_accounts.find(attributes.fetch("active_sfa_id"))
    sync = item.syncs.ordered.first
    if sync
      sync.with_lock do
        stats = sync.sync_stats.is_a?(Hash) ? sync.sync_stats.dup : {}
        stats["dismissed_replacement_suggestions"] = (Array(stats["dismissed_replacement_suggestions"]) + [ "#{dormant.id}:#{active.id}" ]).uniq
        sync.update!(sync_stats: stats)
      end
    end
    { dismissed: true }
  end

  def connections
    authorize_manage!
    require_item!
    return [] unless key == "snaptrade"
    local = item.snaptrade_accounts.includes(:account_provider).group_by(&:snaptrade_authorization_id)
    item.fetch_connections.map do |connection|
      id = connection.fetch("id")
      {
        authorization_id: id,
        brokerage_name: connection.dig("brokerage", "name"),
        brokerage_slug: connection.dig("brokerage", "slug"),
        disabled: connection["disabled"] == true,
        accounts: Array(local[id]).map { |account| { id: account.id, name: account.name, linked: account.account_provider.present? } }
      }
    end
  end

  def remove_connection!(authorization_id)
    authorize_manage!
    require_item!
    raise Invalid, "Brokerage removal is only available for SnapTrade" unless key == "snaptrade"
    raise Invalid, "Authorization is required" if authorization_id.blank?
    # Even an orphan authorization must belong to this item's authenticated user.
    raise ActiveRecord::RecordNotFound unless item.fetch_connections.any? { |connection| connection["id"] == authorization_id }
    records = item.snaptrade_accounts.where(snaptrade_authorization_id: authorization_id)
    records.includes(account_provider: :account).each do |record|
      authorize_account!(record.account_provider.account) if record.account_provider
    end
    if records.exists?
      records.destroy_all
    else
      remote = item.snaptrade_provider
      raise Conflict, "The connection must be authorized before it can be removed" unless remote
      remote.delete_connection(authorization_id: authorization_id)
    end
    { removed: true }
  end

  private
    def require_item!
      raise ActiveRecord::RecordNotFound unless item
    end

    def linked_accounts
      records = item.public_send(provider[:accounts])
      records.filter_map do |record|
        if record.respond_to?(:current_account)
          record.current_account
        elsif record.respond_to?(:account_provider) && record.account_provider
          record.account_provider.account
        elsif record.respond_to?(:account)
          record.account
        end
      end.uniq
    end

    def unlink_before_delete?
      %w[akahu up monobank fio simplefin lunchflow enable_banking kraken coinspot ibkr mercury brex sophtron trading212 trade_republic redbark wise].include?(key)
    end
end
