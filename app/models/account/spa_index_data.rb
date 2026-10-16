# frozen_string_literal: true

# Session-authenticated presentation payloads for the SPA surfaces that share
# the accounts domain: the accounts index (manual + provider-connected
# accounts, in the ERB page's grouping), the sharing dialog, and the statement
# vault (standalone `/account_statements` plus the account's Statements tab
# sections, which already come from `Account::PageData`).
#
# Financial calculations stay in the existing account, statement, sync and
# balance-sheet objects; this PORO only shapes what the React pages consume,
# the same way `Account::PageData` does for `/accounts/:id`. All money and
# dates are formatted server-side so the SPA renders strings verbatim.
class Account::SpaIndexData
  attr_reader :groups

  # `item_specs` carries the ERB's per-provider cards:
  #   { kind: "provider" | "wallet" | "financekit", key: :plaid,
  #     item: <provider item>, accounts: [...] }
  # `groups` are `BalanceSheet::AccountGroup`s feeding summary totals.
  def initialize(item_specs:, manual_accounts: [], groups: [], family:, user:, sync_stats: {}, wallet_cards: {})
    @item_specs = item_specs
    @manual_accounts = manual_accounts
    @groups = groups
    @family = family
    @user = user
    @sync_stats = sync_stats
    @wallet_cards = wallet_cards
  end

  # `statement` (nil for the index payload) drives `statement_show_payload`;
  # `accounts` feeds the show page's account select.
  class << self
    def for_statement(statement, accounts: [])
      new(item_specs: [], groups: [], family: statement.family, user: Current.user).tap do |data|
        data.instance_variable_set(:@statement, statement)
        data.instance_variable_set(:@accounts, accounts)
      end
    end
  end

  # Path helpers throughout: the SPA fetches these with `credentials:
  # "same-origin"` and relative URLs, so every generated href is path-only
  # regardless of the request's host — absolute URLs would need a configured
  # host this PORO never sees.
  def routes
    Rails.application.routes.url_helpers
  end


  def accounts_index_payload
    {
      sync: sync_controls,
      new_account_path: routes.new_account_path(only_path: true),
      items: item_specs.map { |spec| item_payload(spec) },
      groups: group_payload_for_accounts(@manual_accounts)
    }
  end

  def sharing_payload
    owner = @account.owner
    share_for_viewer = @account.account_shares.find_by(user: @user)
    members = @family.users.where.not(id: @account.owner_id).where(active: true)

    {
      owned: @account.owned_by?(@user),
      owner: owner ? { name: owner.display_name, initials: owner.initials } : nil,
      viewer_permission: share_for_viewer&.permission,
      member: share_for_viewer ? {
        include_in_finances: share_for_viewer.include_in_finances?
      } : nil,
      permissions: AccountShare::PERMISSIONS.index_with { |p| I18n.t("account_sharings.show.permissions.#{p}") },
      members: members.map { |member| member_payload(member) },
      no_members: members.empty?,
      moniker: @family.moniker_label.downcase,
      update_href: routes.account_sharing_path(@account, only_path: true)
    }
  end

  def statements_index_payload(unmatched:, unmatched_pagy:, linked:, linked_pagy:, accounts:, total_storage_bytes:)
    {
      upload: {
        href: routes.account_statements_path(only_path: true),
        accounts: accounts.map { |account| { id: account.id, name: account.name } },
        accept: AccountStatement::ACCEPTED_FILE_EXTENSIONS.join(","),
        max_size_mb: AccountStatement::MAX_FILE_SIZE / 1.megabyte
      },
      storage_used: number_to_human_size(total_storage_bytes),
      unmatched: statement_group(unmatched, unmatched_pagy, with_suggestions: true),
      linked: statement_group(linked, linked_pagy, with_suggestions: false)
    }
  end

  def statement_show_payload(can_manage:, reconciliation_checks:)
    statement = @statement
    {
      can_manage: can_manage,
      id: statement.id,
      filename: statement.filename,
      status: statement.review_status,
      status_label: I18n.t("account_statements.status.#{statement.review_status}"),
      size: number_to_human_size(statement.byte_size),
      content_type: statement.content_type,
      download_href: statement.original_file.attached? ? download_href(statement) : nil,
      destroy_href: routes.account_statement_path(statement, only_path: true),
      confirm_delete: CustomConfirm.for_resource_deletion("statement").to_data_attribute,
      account: statement.account ? { id: statement.account.id, name: statement.account.name } : nil,
      suggested_account: statement.suggested_account ? {
        id: statement.suggested_account.id,
        name: statement.suggested_account.name,
        confidence: number_to_percentage(statement.match_confidence.to_d * 100, precision: 0)
      } : nil,
      period: period_label(statement),
      balances: {
        opening: balance_label(statement, :opening_balance),
        closing: balance_label(statement, :closing_balance)
      },
      metadata: {
        institution_name: statement.institution_name_hint,
        account_name: statement.account_name_hint,
        account_last4: statement.account_last4_hint,
        currency: statement.statement_currency,
        period_start_on: statement.period_start_on&.iso8601,
        period_end_on: statement.period_end_on&.iso8601,
        opening_balance: statement.opening_balance&.to_s,
        closing_balance: statement.closing_balance&.to_s
      },
      reconciliation: reconciliation_checks.map { |check| check_payload(check, statement) },
      actions: {
        link_href: routes.link_account_statement_path(statement, only_path: true),
        unlink_href: routes.unlink_account_statement_path(statement, only_path: true),
        reject_href: routes.reject_account_statement_path(statement, only_path: true)
      },
      accounts: @accounts.map { |account| { id: account.id, name: account.name } }
    }
  end

  private
    attr_reader :item_specs, :family, :user, :sync_stats, :wallet_cards

    # --- accounts index ---------------------------------------------------

    def sync_controls
      latest = family.syncs.visible.order(created_at: :desc).first
      {
        syncing: family.syncing?,
        sync_href: routes.sync_all_accounts_path(only_path: true),
        cancel_path: latest ? routes.cancel_sync_path(latest, only_path: true) : nil,
        syncing_label: I18n.t("accounts.index.sync"),
        cancel_label: I18n.t("accounts.index.cancel_sync")
      }
    end

    def item_payload(spec)
      status = item_status(spec)
      base = {
        kind: spec[:kind],
        provider_key: spec[:key].to_s,
        id: spec[:item].id,
        name: item_name(spec),
        logo_url: Provider::Metadata.logo_url(spec[:key]),
        logo_text: Provider::Metadata.for(spec[:key])[:logo_text],
        logo_icon: Provider::Metadata.for(spec[:key])[:logo_icon],
        logo_color: Provider::Metadata.for(spec[:key])[:logo_color]
      }
      base.merge(
        status: status,
        status_label: item_status_label(spec, status),
        syncing: spec[:item].syncing?,
        scheduled_for_deletion: item_scheduled_for_deletion?(spec),
        group: group_payload_for_accounts(spec[:accounts]),
        empty: empty_payload(spec),
        wallet: spec[:kind] == "wallet" ? wallet_payload(spec) : nil,
        setup_href: item_setup_href(spec),
        manage_href: item_manage_href(spec),
        manage_label: item_manage_label(spec),
        delete_href: item_delete_href(spec),
        confirm_delete: CustomConfirm.for_resource_deletion(item_name(spec), high_severity: true).to_data_attribute,
        stats: sync_stats.dig(spec[:key], spec[:item].id) || {},
        replacement_prompts: replacement_prompts(spec),
      )
    end

    def item_name(spec)
      case spec[:kind]
      when "wallet" then spec[:item].institution_display_name
      else spec[:item].name
      end
    end

    def item_scheduled_for_deletion?(spec)
      spec[:item].respond_to?(:scheduled_for_deletion) ? spec[:item].scheduled_for_deletion : spec[:item].scheduled_for_deletion?
    end

    def item_status(spec)
      item = spec[:item]
      return "syncing" if item.syncing?

      if requires_reconnect?(spec)
        "requires_update"
      elsif item.sync_error.present?
        "error"
      elsif item.last_synced_at.nil?
        "never"
      else
        "ok"
      end
    end

    def requires_reconnect?(spec)
      item = spec[:item]
      return true if spec[:key] == :plaid && item.status == "requires_update"
      return true if spec[:key] == :simplefin && item.setup_token_update_required?
      return true if spec[:key] == :snaptrade && item.status == "requires_update"
      false
    end

    def item_status_label(spec, status)
      item = spec[:item]
      case status
      when "syncing" then I18n.t("accounts.index.syncing_default", default: "Syncing")
      when "ok"
        time = item.last_synced_at ? concise_time_ago(item.last_synced_at) : nil
        time ? I18n.t("accounts.index.synced_ago", time: time, default: "Synced #{time} ago") : I18n.t("accounts.index.never_synced", default: "Not synced yet")
      when "never" then I18n.t("accounts.index.never_synced", default: "Not synced yet")
      when "requires_update" then I18n.t("accounts.index.requires_update", default: "Reconnection required")
      when "error" then item.sync_error.presence || I18n.t("accounts.index.sync_error", default: "Sync failed")
      else ""
      end
    end

    # Matches SettingsHelper#concise_time_ago: strips the "about " so copy
    # reads "Synced 6 hours ago".
    def concise_time_ago(time)
      ActionController::Base.helpers.time_ago_in_words(time).sub(/\Aabout /, "")
    end

    def item_manage_href(spec)
      item = spec[:item]
      return nil unless item.respond_to?(:manageable_by?) ? item.manageable_by?(user) : user.admin?

      case spec[:key]
      when :plaid
        if item.status == "requires_update"
          routes.edit_plaid_item_path(item, only_path: true)
        elsif item.respond_to?(:us?) && item.us?
          routes.edit_plaid_item_path(item, add_accounts: true, only_path: true)
        end
      when :simplefin
        routes.edit_simplefin_item_path(item, only_path: true) if item.setup_token_update_required?
      when :snaptrade
        if item.status == "requires_update"
          if Provider::Snaptrade.authorization_code_configured?
            routes.oauth_authorize_snaptrade_items_path(item_id: item.id, only_path: true)
          else
            routes.oauth_device_authorize_snaptrade_items_path(item_id: item.id, only_path: true)
          end
        end
      end
    end

    def item_manage_label(spec)
      return "Reconnect" if spec[:key] == :snaptrade && spec[:item].status == "requires_update"
      nil
    end
    def item_setup_href(spec)
      item = spec[:item]
      case spec[:key]
      when :simplefin
        unlinked = item.simplefin_accounts.left_joins(:account, :account_provider).where(accounts: { id: nil }, account_providers: { id: nil }).count
        routes.setup_accounts_simplefin_item_path(item, only_path: true) if unlinked > 0
      when :akahu
        routes.setup_accounts_akahu_item_path(item, only_path: true) if item.respond_to?(:unlinked_accounts_count) && item.unlinked_accounts_count > 0
      end
    rescue StandardError
      nil
    end

    # Eligible card-replacement prompts for a SimpleFIN item, mirroring
    # simplefin_items/_replacement_prompt eligibility: both SFAs and the
    # Sure account exist, the relink hasn't landed, and the pair isn't
    # dismissed. Computed server-side so the SPA renders strings verbatim.
    def replacement_prompts(spec)
      return [] unless spec[:key] == :simplefin

      item = spec[:item]
      stats = sync_stats.dig(:simplefin, item.id) || {}
      suggestions = stats["replacement_suggestions"]
      return [] unless suggestions.is_a?(Array) && suggestions.any?

      dismissed = Array(stats["dismissed_replacement_suggestions"])
      suggestions.filter_map do |suggestion|
        old_sfa = item.simplefin_accounts.find_by(id: suggestion["dormant_sfa_id"])
        new_sfa = item.simplefin_accounts.find_by(id: suggestion["active_sfa_id"])
        sure_account = family.accounts.find_by(id: suggestion["sure_account_id"])
        next unless old_sfa && new_sfa && sure_account
        next if new_sfa.current_account&.id == sure_account.id
        next if dismissed.include?("#{old_sfa.id}:#{new_sfa.id}")

        {
          title: I18n.t("simplefin_items.replacement_prompt.title",
            institution: suggestion["institution_name"].presence || item.name),
          description: I18n.t("simplefin_items.replacement_prompt.description",
            account_name: sure_account.name, old_name: old_sfa.name, new_name: new_sfa.name),
          relink_label: I18n.t("simplefin_items.replacement_prompt.relink"),
          relink_href: routes.link_existing_account_simplefin_items_path(
            account_id: sure_account.id, simplefin_account_id: new_sfa.id, only_path: true),
          dismiss_href: routes.dismiss_replacement_suggestion_simplefin_item_path(item, only_path: true),
          dormant_sfa_id: old_sfa.id,
          active_sfa_id: new_sfa.id
        }
      end
    end


    def item_delete_href(spec)
      item = spec[:item]
      can_manage = item.respond_to?(:manageable_by?) ? item.manageable_by?(user) : user.admin?
      return nil unless can_manage

      case spec[:key]
      when :plaid then routes.plaid_item_path(item, only_path: true)
      when :simplefin then routes.simplefin_item_path(item, only_path: true)
      else
        begin
          routes.polymorphic_path(item, only_path: true)
        rescue NoMethodError, ArgumentError
          nil
        end
      end
    end

    def empty_payload(spec)
      return nil unless spec[:accounts].empty?

      {
        title: I18n.t("accounts.index.no_accounts_title", default: "No accounts yet"),
        description: I18n.t("accounts.index.no_accounts_description", default: "")
      }
    end

    def wallet_payload(spec)
      card = wallet_cards.fetch(spec[:item].id, {})
      {
        address_count: card[:address_count],
        accounts: card[:accounts].map { |account| account_row(account) },
        sync_href: routes.sync_onchain_wallet_item_path(spec[:item], only_path: true),
        delete_href: routes.onchain_wallet_item_path(spec[:item], only_path: true)
      }
    end

    def group_payload(group)
      {
        key: group.key,
        name: group.name,
        color: group.color,
        total: group.total_money.format,
        syncing: group.syncing?,
        accounts: group.accounts.map { |row| account_row(row.account, converted: row.converted_balance) }
      }
    end

    def group_payload_for_accounts(accounts)
      grouped = accounts.group_by(&:accountable_type)
      grouped.sort_by { |type, _| Accountable::TYPES.index(type) || Float::INFINITY }.map do |type, group_accounts|
        accountability = Accountable.from_type(type)
        {
          key: accountability.name.underscore,
          name: accountability.display_name,
          color: accountability.color,
          total: totals_by_currency(group_accounts),
          syncing: group_accounts.any?(&:syncing?),
          accounts: group_accounts.sort_by(&:name).map { |account| account_row(account) }
        }
      end
    end

    def account_row(account, converted: nil)
      permission = account.permission_for(user)
      {
        id: account.id,
        name: account.name,
        accountable_type: account.accountable_type,
        subtype_label: account.long_subtype_label,
        currency: account.currency,
        balance: (converted || account.balance_money).then { |money| Money.new(money, account.currency).format },
        status: account.status,
        syncing: account.syncing?,
        draft: account.draft?,
        pending_deletion: account.pending_deletion?,
        active: account.active?,
        exclude_from_reports: account.exclude_from_reports?,
        shared: account.shared?,
        owned: account.owned_by?(user),
        owner_name: account.owned_by?(user) ? nil : account.owner&.display_name,
        institution_name: account.institution_name,
        logo_url: account.logo_url,
        color: account.accountable.color,
        is_default: user.default_account_id == account.id,
        set_default_eligible: account.eligible_for_transaction_default?,
        manageable: permission.in?([ :owner, :full_control ]),
        href: routes.account_path(account, only_path: true),
        edit_href: routes.edit_account_path(account, only_path: true),
        sharing_href: routes.account_sharing_path(account, only_path: true),
        actions: row_actions(account, permission)
      }
    end

    def row_actions(account, permission)
      actions = []
      if permission.in?([ :owner, :full_control ])
        actions << { key: "edit", label: I18n.t("accounts.account.edit"), href: routes.edit_account_path(account, only_path: true), method: "get" }
      end
      actions << { key: "sharing", label: I18n.t("accounts.account.sharing"), href: routes.account_sharing_path(account, only_path: true), method: "get" }
      if user.admin?
        if !account.linked? && %w[Depository CreditCard Investment Crypto].include?(account.accountable_type)
          actions << { key: "link_provider", label: I18n.t("accounts.account.link_provider"), href: routes.select_provider_account_path(account, only_path: true), method: "get" }
        elsif account.linked? && account.linked_to?("SimplefinAccount")
          actions << { key: "change_simplefin_account", label: I18n.t("accounts.account.change_simplefin_account"), href: routes.select_existing_account_simplefin_items_path(account_id: account.id, only_path: true), method: "get" }
        end
        actions << { key: "unlink_provider", label: I18n.t("accounts.account.unlink_provider"), href: routes.confirm_unlink_account_path(account, only_path: true), method: "get" } if account.linked?
      end
      if permission.in?([ :owner, :full_control ])
        if account.active?
          actions << { key: "disable", label: I18n.t("accounts.account.disable"), href: routes.toggle_active_account_path(account, only_path: true), method: "patch" }
        elsif account.disabled?
          actions << { key: "enable", label: I18n.t("accounts.account.enable"), href: routes.toggle_active_account_path(account, only_path: true), method: "patch" }
        end
        key = account.exclude_from_reports? ? "include_in_reports" : "exclude_from_reports"
        actions << { key: key, label: I18n.t("accounts.account.#{key}"), href: routes.toggle_exclude_from_reports_account_path(account, only_path: true), method: "patch" }
      end
      if user.default_account_id == account.id
        actions << { key: "remove_default", label: I18n.t("accounts.account.remove_default"), href: routes.remove_default_account_path(account, only_path: true), method: "patch" }
      elsif account.eligible_for_transaction_default?
        actions << { key: "set_default", label: I18n.t("accounts.account.set_default"), href: routes.set_default_account_path(account, only_path: true), method: "patch" }
      end
      if account.owned_by?(user) && !account.linked?
        actions << {
          key: "delete", label: I18n.t("accounts.account.delete"), href: routes.account_path(account, only_path: true), method: "delete",
          confirm: CustomConfirm.for_resource_deletion("account", high_severity: true).to_data_attribute
        }
      end
      if account.draft?
        actions.unshift({ key: "complete_setup", label: I18n.t("accounts.account.complete_setup"), href: routes.edit_account_path(account, only_path: true), method: "get" })
      end
      actions
    end

    def totals_by_currency(accounts)
      accounts.group_by(&:currency)
        .transform_values { |group| group.sum(&:balance_money) }
        .values
        .map { |money| money.format }
        .join(" | ")
    end

    # --- sharing ----------------------------------------------------------

    def member_payload(member)
      share = @account.account_shares.find_by(user: member)
      {
        id: member.id,
        name: member.display_name,
        initials: member.initials,
        shared: share.present?,
        permission: share&.permission || "read_only",
        include_in_finances: share&.include_in_finances?
      }
    end

    # --- statements -------------------------------------------------------

    def statement_group(statements, pagy, with_suggestions:)
      {
        count: pagy.count,
        items: statements.map { |statement| statement_row(statement, with_suggestions) },
        page: pagy.page,
        per_page: pagy.limit,
        total_pages: pagy.pages
      }
    end

    def statement_row(statement, with_suggestions)
      {
        id: statement.id,
        filename: statement.filename,
        size: number_to_human_size(statement.byte_size),
        icon: file_icon(statement),
        period: period_label(statement),
        review_status: statement.review_status,
        account: statement.account&.name,
        suggestion: with_suggestions && statement.suggested_account ? {
          id: statement.suggested_account.id,
          name: statement.suggested_account.name,
          confidence: number_to_percentage(statement.match_confidence.to_d * 100, precision: 0)
        } : nil,
        href: routes.account_statement_path(statement, only_path: true),
        download_href: statement.original_file.attached? ? download_href(statement) : nil,
        link_href: statement.suggested_account ? routes.link_account_statement_path(statement, account_id: statement.suggested_account_id, only_path: true) : nil,
        reject_href: routes.reject_account_statement_path(statement, only_path: true)
      }
    end

    def file_icon(statement)
      if statement.pdf?
        "file-text"
      elsif statement.xlsx?
        "sheet"
      else
        "file-spreadsheet"
      end
    end

    def period_label(statement)
      if statement.period_start_on.present? && statement.period_end_on.present?
        "#{I18n.l(statement.period_start_on, format: :long)} - #{I18n.l(statement.period_end_on, format: :long)}"
      else
        I18n.t("account_statements.period.unknown")
      end
    end

    def balance_label(statement, field)
      money = statement.public_send("#{field}_money")
      money ? money.format : I18n.t("account_statements.balance.unknown")
    end

    def check_payload(check, statement)
      {
        label: I18n.t("account_statements.reconciliation.checks.#{check[:key]}", default: I18n.t("account_statements.reconciliation.checks.unknown_check")),
        status: check[:status],
        status_label: I18n.t("account_statements.reconciliation.#{check[:status]}"),
        amounts: {
          statement: Money.new(check[:statement_amount], statement.statement_currency).format,
          ledger: Money.new(check[:ledger_amount], statement.statement_currency).format,
          difference: Money.new(check[:difference], statement.statement_currency).format
        }
      }
    end

    def download_href(statement)
      routes.rails_blob_path(statement.original_file, disposition: "attachment", only_path: true)
    end

    def number_to_human_size(bytes)
      ActionController::Base.helpers.number_to_human_size(bytes)
    end

    def number_to_percentage(value, precision:)
      ActionController::Base.helpers.number_to_percentage(value, precision: precision)
    end
end
