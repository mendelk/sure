class AccountsController < ApplicationController
  include StreamExtensions

  before_action :set_account, only: %i[show sparkline sync set_default remove_default]
  before_action :set_manageable_account, only: %i[toggle_active toggle_exclude_from_reports destroy unlink confirm_unlink select_provider]
  before_action :ensure_linked_account, only: %i[confirm_unlink unlink]
  include Periodable

  def index
    return render("spa/show", layout: "spa") if request.format.html?

    @accessible_account_ids = Current.user.accessible_accounts.pluck(:id)
    @manual_accounts = family.accounts
          .listable_manual
          .where(id: @accessible_account_ids)
          .with_attached_logo
          .includes(:accountable, :account_providers, :plaid_account, :simplefin_account)
          .order(:name)
    @financekit_accounts = Current.family.accounts
      .where(id: @accessible_account_ids).where.not(status: :pending_deletion)
      .joins(:account_providers).where(account_providers: { provider_type: "FinancekitAccountLineage" })
      .distinct.with_attached_logo.includes(:accountable, account_providers: :provider).order(:name)
    @plaid_items = visible_provider_items(family.plaid_items.ordered.with_attached_logo.includes(:plaid_accounts))
    @simplefin_items = visible_provider_items(family.simplefin_items.ordered.with_attached_logo)
    @lunchflow_items = visible_provider_items(family.lunchflow_items.ordered.with_attached_logo.includes(:lunchflow_accounts))
    @redbark_items = visible_provider_items(family.redbark_items.ordered.with_attached_logo.includes(:redbark_accounts))
    @akahu_items = visible_provider_items(family.akahu_items.ordered.with_attached_logo.includes(:akahu_accounts))
    @up_items = visible_provider_items(family.up_items.ordered.with_attached_logo.includes(:up_accounts))
    @monobank_items = visible_provider_items(family.monobank_items.ordered.with_attached_logo.includes(:monobank_accounts))
    @fio_items = visible_provider_items(family.fio_items.active.ordered.with_attached_logo.includes(:fio_accounts))
    @enable_banking_items = visible_provider_items(family.enable_banking_items.ordered.with_attached_logo)
    @coinstats_items = visible_provider_items(family.coinstats_items.ordered.with_attached_logo.includes(:coinstats_accounts, :accounts))
    @mercury_items = visible_provider_items(family.mercury_items.ordered.with_attached_logo.includes(:mercury_accounts))
    @brex_items = visible_provider_items(family.brex_items.ordered.with_attached_logo.includes(:accounts, brex_accounts: :account_provider))
    @coinbase_items = visible_provider_items(family.coinbase_items.ordered.with_attached_logo.includes(:coinbase_accounts, :accounts))
    @snaptrade_items = visible_provider_items(family.snaptrade_items.ordered.with_attached_logo.includes(:snaptrade_accounts))
    @ibkr_items = visible_provider_items(family.ibkr_items.ordered.with_attached_logo.includes(:ibkr_accounts))
    @indexa_capital_items = visible_provider_items(family.indexa_capital_items.ordered.with_attached_logo.includes(:indexa_capital_accounts))
    @sophtron_items = visible_provider_items(family.sophtron_items.ordered.with_attached_logo.includes(:sophtron_accounts))
    @onchain_wallet_items = visible_provider_items(
      family.onchain_wallet_items.ordered.includes(:accounts, onchain_wallet_accounts: { account_provider: :account })
    )
    @binance_items = visible_provider_items(family.binance_items.ordered.with_attached_logo.includes(:binance_accounts, :accounts))
    @kraken_items = visible_provider_items(family.kraken_items.ordered.with_attached_logo.includes(:kraken_accounts, :accounts))
    @coinspot_items = visible_provider_items(family.coinspot_items.ordered.with_attached_logo.includes(:coinspot_accounts, :accounts))
    @trading212_items = visible_provider_items(family.trading212_items.ordered.with_attached_logo.includes(:trading212_accounts)).sort_by(&:created_at)
    @questrade_items = visible_provider_items(family.questrade_items.ordered.with_attached_logo.includes(:accounts, questrade_accounts: :account_provider))
    @wise_items = visible_provider_items(family.wise_items.ordered.includes(:wise_accounts, :accounts))
    @trade_republic_items = visible_provider_items(
      family.trade_republic_items.ordered.includes(trade_republic_accounts: { account_provider: :account })
    )

    # An on-chain item is admitted as soon as ONE of its accounts is accessible,
    # so the card is told which of them this viewer may actually see. nil is the
    # admin case, which visible_provider_items already lets through whole.
    allowed_ids = Current.user&.admin? ? nil : @accessible_account_ids
    @onchain_wallet_cards = @onchain_wallet_items.to_h do |item|
      visible = item.accounts_visible_to(allowed_ids)
      [ item.id, { accounts: visible, address_count: item.address_count_for(visible) } ]
    end

    preload_latest_sync_metadata_for_index!

    # Build sync stats maps for all providers
    build_sync_stats_maps

    # SPA payload: provider cards (ERB order), manual/FinanceKit groups and the
    # sync toolbar in one document, so the React page renders the whole index
    # from a single fetch.
    render json: index_spa_payload.to_json
  end

  def new
    return render("spa/show", layout: "spa") if request.format.html?

    # Get all registered providers with any credentials configured
    @provider_configs = Provider::Factory.registered_adapters.flat_map do |adapter_class|
      adapter_class.connection_configs(family: family)
    end
  end

  def sync_all
    family.request_plaid_transactions_refreshes_later(source: "AccountsController#sync_all")
    family.sync_later
    redirect_to accounts_path, notice: t("accounts.sync_all.syncing")
  end

  def show
    return render("spa/show", layout: "spa") if request.format.html?

    @as_of = Date.current
    @accessible_account_ids = Current.user.accessible_accounts.pluck(:id).to_set
    @tabs = Account::PageData.tabs_for(@account)
    @tab = (params[:tab] == "transactions" ? "activity" : params[:tab]).presence_in(@tabs) || @tabs.first
    @chart_view = params[:chart_view].presence_in(@account.supports_trades? ? %w[balance holdings_balance cash_balance gains] : %w[balance]) || "balance"
    if @account.loan?
      @loan_projection = @account.loan.payoff_projection(as_of: @as_of)
      @loan_chart = loan_payoff_chart(@account, as_of: @as_of, period: @period, projection: @loan_projection)
    end
    build_activity_data if @tab == "activity"
    build_statement_tab_data if @tab == "statements"
    @account_page_data = Account::PageData.new(
      account: @account, view: view_context, period: @period, chart_view: @chart_view,
      active_tab: @tab, tabs: @tabs, as_of: @as_of, loan_chart: @loan_chart,
      projection: @loan_projection, feed: @activity_feed_data, pagination: @pagy,
      accessible_account_ids: @accessible_account_ids, coverage: @statement_coverage,
      statements: @account_statements || [], reconciliation_statuses: @statement_reconciliation_statuses || {},
      can_manage_statements: @can_manage_statements
    )
  end

  def sync
    unless @account.syncing?
      if @account.linked?
        # Sync all provider items for this account
        # Each provider item will trigger an account sync when complete
        @account.account_providers.each do |account_provider|
          item = account_provider.adapter&.item
          next unless item && !item.syncing?

          if item.is_a?(PlaidItem)
            item.sync_later_with_provider_refresh
          else
            item.sync_later
          end
        end
      else
        # Manual accounts just need balance materialization
        @account.sync_later
      end
    end

    redirect_to account_path(@account)
  end

  def sparkline
    etag_key = @account.family.build_cache_key("#{@account.id}_sparkline_#{Account::Chartable::SPARKLINE_CACHE_VERSION}", invalidate_on_data_updates: true)

    # Short-circuit with 304 Not Modified when the client already has the latest version.
    # We defer the expensive series computation until we know the content is stale.
    if stale?(etag: etag_key, last_modified: @account.family.latest_sync_completed_at)
      @sparkline_series = @account.sparkline_series
      render layout: false
    end
  end

  def toggle_active
    if @account.active?
      @account.disable!
    elsif @account.disabled?
      @account.enable!
    end
    redirect_to accounts_path
  end

  # Toggles the exclude_from_reports flag on the account and redirects to the
  # account list. The flag controls whether the account's data appears in
  # financial reports, dashboards, and exports.
  def toggle_exclude_from_reports
    @account.update!(exclude_from_reports: !@account.exclude_from_reports?)
    redirect_to accounts_path
  end

  def set_default
    unless @account.eligible_for_transaction_default?
      redirect_to accounts_path, alert: t("accounts.set_default.depository_only")
      return
    end

    Current.user.update!(default_account: @account)
    redirect_to accounts_path
  end

  def remove_default
    Current.user.update!(default_account: nil)
    redirect_to accounts_path
  end

  def destroy
    if @account.linked?
      redirect_to account_path(@account), alert: t("accounts.destroy.cannot_delete_linked")
    else
      begin
        @account.destroy_later
        redirect_to accounts_path, notice: t("accounts.destroy.success", type: @account.accountable_type)
      rescue => e
        Rails.logger.error "Failed to schedule account #{@account.id} for deletion: #{e.message}"
        redirect_to accounts_path, alert: t("accounts.destroy.failed")
      end
    end
  end

  def confirm_unlink
  end

  def unlink
    begin
      Account.transaction do
        @account.provider_account_for("FinancekitAccountLineage")&.disconnect!

        # Detach holdings from provider links before destroying them
        provider_link_ids = @account.account_providers.pluck(:id)
        if provider_link_ids.any?
          Holding.where(account_provider_id: provider_link_ids).update_all(account_provider_id: nil)
        end

        # Capture provider accounts before clearing links (so we can destroy them)
        simplefin_account_to_destroy = @account.simplefin_account

        # Remove new system links (account_providers join table)
        # SnaptradeAccount records are preserved (not destroyed) so users can relink later.
        # This follows the Plaid pattern where the provider account survives as "unlinked".
        # SnapTrade has limited connection slots (5 free), so preserving the record avoids
        # wasting a slot on reconnect.
        @account.account_providers.reload.destroy_all

        # Remove legacy system links (foreign keys)
        @account.update!(plaid_account_id: nil, simplefin_account_id: nil)

        # Destroy the SimplefinAccount record so it doesn't cause stale account issues
        # This is safe because:
        # - Account data (transactions, holdings, balances) lives on the Account, not SimplefinAccount
        # - SimplefinAccount only caches API data which is regenerated on reconnect
        # - If user reconnects SimpleFin later, a new SimplefinAccount will be created
        simplefin_account_to_destroy&.destroy!
      end

      redirect_to accounts_path, notice: t("accounts.unlink.success")
    rescue ActiveRecord::RecordInvalid => e
      redirect_to account_path(@account), alert: t("accounts.unlink.error", error: e.message)
    rescue StandardError => e
      Rails.logger.error "Failed to unlink account #{@account.id}: #{e.message}"
      redirect_to account_path(@account), alert: t("accounts.unlink.error", error: t("accounts.unlink.generic_error"))
    end
  end

  def select_provider
    if @account.linked?
      redirect_to account_path(@account), alert: t("accounts.select_provider.already_linked")
      return
    end

    account_type_name = @account.accountable_type

    # Get all available provider configs dynamically for this account type
    provider_configs = Provider::Factory.connection_configs_for_account_type(
      account_type: account_type_name,
      family: family
    )

    # Build available providers list with paths resolved for this specific account
    # Filter out providers that don't support linking to existing accounts
    @available_providers = provider_configs.filter_map do |config|
      next unless config[:existing_account_path].present?
      {
        name: config[:name],
        key: config[:key],
        description: config[:description],
        path: config[:existing_account_path].call(@account.id)
      }
    end

    if @available_providers.empty?
      redirect_to account_path(@account), alert: t("accounts.select_provider.no_providers")
    end
  end

  private
    # Built here rather than in the template: assembling a chart payload is
    # domain work, and `show` asks for it exactly once per request, so there
    # is nothing to memoise.
    #
    # The payload runs the schedule, the projection and a balance query from
    # inputs this app does not fully control: `term_months` and `rate_type`
    # arrive from providers, `start_date` and the rate schedule from the form,
    # balances from sync. A raise in any of them costs the chart, not the page:
    # nil is what the component already takes as "no chart", and the account
    # page then renders exactly as it did before the chart existed. Reported,
    # because a loan silently losing its chart is a bug someone has to see.
    def loan_payoff_chart(account, as_of:, period:, projection: nil)
      return nil unless account.accountable.is_a?(Loan)

      Loan::PayoffChart.new(account.loan, as_of: as_of, period: period, projection: projection).payload
    rescue StandardError => e
      Rails.logger.error("Loan payoff chart failed for account #{account.id}: #{e.class} - #{e.message}")
      Sentry.capture_exception(e) { |scope| scope.set_tags(record_type: "Account", record_id: account.id) } if defined?(Sentry)
      nil
    end

    # Shapes the accounts index for the SPA. Card list, order and each card's
    # visibility mirror `accounts/index.html.erb` and
    # `AccountsController#visible_provider_items`; account rows and totals come
    # from the same balance-sheet grouping the sidebar/dashboard use.
    def index_spa_payload
      Account::SpaIndexData.new(
        item_specs: index_item_specs,
        manual_accounts: @manual_accounts,
        family: family,
        user: Current.user,
        sync_stats: sync_stats_by_item_id,
        wallet_cards: @onchain_wallet_cards
      ).accounts_index_payload
    end

    # Provider cards in the exact order the ERB template renders them. The
    # on-chain card re-uses the viewer-filtered accounts the ERB cards get.
    def index_item_specs
      item_spec = ->(kind, key, items, accounts_by_item = nil) do
        items.filter_map do |item|
          accounts = if accounts_by_item
            accounts_by_item.fetch(item.id, [])
          elsif Current.user&.admin?
            item.accounts
          else
            item.accounts.select { |a| @accessible_account_ids.include?(a.id) }
          end
          { kind: kind, key: key, item: item, accounts: accounts }
        end
      end
      financekit_specs = if @financekit_accounts.present?
        item = OpenStruct.new(
          id: "financekit",
          name: I18n.t("accounts.index.financekit_accounts.title", default: "Apple Wallet & Apple Card"),
          syncing?: false,
          scheduled_for_deletion?: false,
          last_synced_at: nil,
          sync_error: nil
        )
        [{ kind: "financekit", key: :financekit, item: item, accounts: @financekit_accounts.to_a }]
      else
        []
      end

      [
        *financekit_specs,
        *item_spec.call("provider", :plaid, @plaid_items),
        *item_spec.call("provider", :simplefin, @simplefin_items),
        *item_spec.call("provider", :lunchflow, @lunchflow_items),
        *item_spec.call("provider", :redbark, @redbark_items),
        *item_spec.call("provider", :akahu, @akahu_items),
        *item_spec.call("provider", :up, @up_items),
        *item_spec.call("provider", :monobank, @monobank_items),
        *item_spec.call("provider", :enable_banking, @enable_banking_items),
        *item_spec.call("provider", :coinstats, @coinstats_items),
        *item_spec.call("wallet", :onchain_wallet, @onchain_wallet_items, wallet_accounts_by_item),
        *item_spec.call("provider", :sophtron, @sophtron_items),
        *item_spec.call("provider", :mercury, @mercury_items),
        *item_spec.call("provider", :brex, @brex_items),
        *item_spec.call("provider", :coinbase, @coinbase_items),
        *item_spec.call("provider", :binance, @binance_items),
        *item_spec.call("provider", :kraken, @kraken_items),
        *item_spec.call("provider", :coinspot, @coinspot_items),
        *item_spec.call("provider", :trading212, @trading212_items),
        *item_spec.call("provider", :wise, @wise_items),
        *item_spec.call("provider", :trade_republic, @trade_republic_items),
        *item_spec.call("provider", :snaptrade, @snaptrade_items),
        *item_spec.call("provider", :ibkr, @ibkr_items),
        *item_spec.call("provider", :indexa_capital, @indexa_capital_items),
        *item_spec.call("provider", :questrade, @questrade_items),
        *item_spec.call("provider", :fio, @fio_items)
      ]
    end

    def wallet_accounts_by_item
      @onchain_wallet_items.to_h do |item|
        card = @onchain_wallet_cards.fetch(item.id, {})
        [ item.id, card[:accounts] ]
      end
    end

    def sync_stats_by_item_id
      {
        plaid: @plaid_sync_stats_map, simplefin: @simplefin_sync_stats_map,
        lunchflow: @lunchflow_sync_stats_map, akahu: @akahu_sync_stats_map,
        up: @up_sync_stats_map, monobank: @monobank_sync_stats_map,
        enable_banking: @enable_banking_sync_stats_map, coinstats: @coinstats_sync_stats_map,
        sophtron: @sophtron_sync_stats_map, redbark: @redbark_sync_stats_map,
        mercury: @mercury_sync_stats_map, brex: @brex_sync_stats_map,
        coinbase: @coinbase_sync_stats_map, indexa_capital: @indexa_capital_sync_stats_map,
        binance: @binance_sync_stats_map, questrade: @questrade_sync_stats_map,
        wise: @wise_sync_stats_map, fio: @fio_sync_stats_map
      }.compact_blank
    end

    def build_activity_data
      legacy = params[:q].is_a?(ActionController::Parameters) ? params[:q].permit(:search, :uncategorized, status: []) : {}
      @q = legacy.to_h.symbolize_keys
      @q[:search] = params[:search] if params.key?(:search) && params[:search].is_a?(String)
      if params.key?(:status)
        statuses = params[:status].is_a?(Array) ? params[:status] : [ params[:status] ]
        @q[:status] = statuses.select { |status| status.is_a?(String) && status.in?(%w[confirmed pending]) }
      end
      @q[:uncategorized] = ActiveModel::Type::Boolean.new.cast(params[:uncategorized]) if params.key?(:uncategorized)
      entries = @account.entries.excluding_split_parents.search(@q).reverse_chronological.preload(:account, :entryable)
      per_page = safe_per_page(stored_per_page_default)
      store_per_page!(per_page) if params[:per_page].present?
      @pagy, @entries = pagy(entries, limit: per_page, page: [ params[:page].to_i, 1 ].max)
      transactions = @entries.filter_map { |entry| entry.entryable if entry.transaction? }
      ActiveRecord::Associations::Preloader.new(
        records: transactions,
        associations: [
          :category, :merchant, :tags,
          { transfer_as_outflow: { inflow_transaction: { entry: :account }, outflow_transaction: { entry: :account } },
            transfer_as_inflow: { inflow_transaction: { entry: :account }, outflow_transaction: { entry: :account } } }
        ]
      ).call if transactions.any?
      Transaction::ActivitySecurityPreloader.new(@entries).preload
      trades = @entries.filter_map { |entry| entry.entryable if entry.trade? }
      ActiveRecord::Associations::Preloader.new(records: trades, associations: :security).call if trades.any?
      @split_parents = if Current.user.show_split_grouped?
        @account.entries.where(id: @entries.filter_map(&:parent_entry_id).uniq).includes(:account, :entryable).index_by(&:id)
      else
        {}
      end
      @activity_feed_data = Account::ActivityFeedData.new(@account, @entries, split_parents: @split_parents)
    end

    def ensure_linked_account
      return if @account.linked?

      redirect_to account_path(@account), alert: t("accounts.unlink.not_linked")
    end

    def family
      Current.family
    end

    # Stores the account activity page size in the existing session payload.
    def store_per_page!(value)
      Current.session.update!(
        prev_transaction_page_params: Current.session.prev_transaction_page_params.merge("per_page" => value)
      )
    end

    def stored_per_page_default
      Current.session.prev_transaction_page_params["per_page"].presence || 10
    end

    def set_account
      @account = Current.user.accessible_accounts.find(params[:id])
    end

    def set_manageable_account
      @account = Current.user.accessible_accounts.find(params[:id])
      permission = @account.permission_for(Current.user)
      unless permission.in?([ :owner, :full_control ])
        respond_to do |format|
          format.html { redirect_to account_path(@account), alert: t("accounts.not_authorized") }
          format.turbo_stream { stream_redirect_to(account_path(@account), alert: t("accounts.not_authorized")) }
        end
        nil
      end
    end

    def visible_provider_items(items)
      accessible_ids = @accessible_account_ids.to_a

      items.select do |item|
        next true if Current.user.admin?

        account_ids = item.respond_to?(:accounts) ? item.accounts.map(&:id) : []

        # Ownership shows a member their own connection, importantly including
        # one just created that has not synced any accounts yet. It must not
        # widen what they can see: the card renders the item's accounts
        # unfiltered, and is re-rendered by a family-wide broadcast with no
        # viewer, so an owner is shown the card only while every account on it
        # is already accessible to them.
        if item.respond_to?(:owned_by?) && item.owned_by?(Current.user)
          next true if (account_ids - accessible_ids).empty?
        end

        (account_ids & accessible_ids).any?
      end
    end

    def preload_latest_sync_metadata_for_index!
      items = [
        @plaid_items,
        @simplefin_items,
        @lunchflow_items,
        @redbark_items,
        @akahu_items,
        @up_items,
        @monobank_items,
        @fio_items,
        @enable_banking_items,
        @coinstats_items,
        @mercury_items,
        @brex_items,
        @coinbase_items,
        @snaptrade_items,
        @ibkr_items,
        @indexa_capital_items,
        @sophtron_items,
        @binance_items,
        @kraken_items,
        @coinspot_items,
        @trading212_items,
        @questrade_items,
        @wise_items,
        @trade_republic_items,
        @onchain_wallet_items
      ].flatten.compact

      accounts = @manual_accounts.to_a + @financekit_accounts.to_a
      items.each do |item|
        next unless item.respond_to?(:accounts)
        accounts.concat(item.accounts)
      end
      accounts = accounts.uniq { |account| account.id }

      syncables = items + accounts

      Current.latest_sync_by_syncable = Sync.latest_by_syncable(syncables)
      Current.latest_completed_sync_by_syncable = Sync.latest_completed_by_syncable(syncables)
      Current.syncing_by_syncable = Sync.syncing_by_syncable(syncables)
    end

    def build_statement_tab_data
      @statement_coverage = AccountStatement::Coverage.for_year(@account, params[:statement_year])
      @account_statements = @account.account_statements.with_attached_original_file.ordered.to_a
      @statement_reconciliation_statuses = AccountStatement.reconciliation_statuses_for(@account_statements, account: @account)
      permission = @account.permission_for(Current.user)
      @can_manage_statements = AccountStatement.statement_manager?(Current.user) &&
        permission.in?([ :owner, :full_control ])
    end


    # Builds sync stats maps for all provider types to avoid N+1 queries in views
    def build_sync_stats_maps
      manual_accounts_exist = @manual_accounts.any?

      # SimpleFIN sync stats
      @simplefin_sync_stats_map = {}
      @simplefin_has_unlinked_map = {}
      @simplefin_unlinked_count_map = {}
      @simplefin_show_relink_map = {}
      @simplefin_duplicate_only_map = {}

      simplefin_item_ids = @simplefin_items.map(&:id)
      simplefin_accounts_counts_by_item_id =
        if simplefin_item_ids.any?
          SimplefinAccount.where(simplefin_item_id: simplefin_item_ids).group(:simplefin_item_id).count
        else
          {}
        end
      simplefin_unlinked_counts_by_item_id =
        if simplefin_item_ids.any?
          SimplefinAccount.where(simplefin_item_id: simplefin_item_ids)
            .left_joins(:account, :account_provider)
            .where(accounts: { id: nil }, account_providers: { id: nil })
            .group(:simplefin_item_id)
            .count
        else
          {}
        end

      @simplefin_items.each do |item|
        latest_sync = item.latest_sync_record
        stats = latest_sync&.sync_stats || {}
        @simplefin_sync_stats_map[item.id] = stats
        @simplefin_has_unlinked_map[item.id] = manual_accounts_exist

        # Count unlinked accounts
        count = simplefin_unlinked_counts_by_item_id[item.id].to_i
        @simplefin_unlinked_count_map[item.id] = count

        # CTA visibility
        manuals_exist = @simplefin_has_unlinked_map[item.id]
        sfa_any = simplefin_accounts_counts_by_item_id[item.id].to_i > 0
        @simplefin_show_relink_map[item.id] = (count.to_i == 0 && manuals_exist && sfa_any)

        # Check if all errors are duplicate-skips
        errors = Array(stats["errors"]).map { |e| e.is_a?(Hash) ? e["message"] || e[:message] : e.to_s }
        @simplefin_duplicate_only_map[item.id] = errors.present? && errors.all? { |m| m.to_s.downcase.include?("duplicate upstream account detected") }
      rescue => e
        Rails.logger.warn("SimpleFin stats map build failed for item #{item.id}: #{e.class} - #{e.message}")
        @simplefin_sync_stats_map[item.id] = {}
        @simplefin_show_relink_map[item.id] = false
        @simplefin_duplicate_only_map[item.id] = false
      end

      # Plaid sync stats
      @plaid_sync_stats_map = {}
      @plaid_items.each do |item|
        latest_sync = item.latest_sync_record
        @plaid_sync_stats_map[item.id] = latest_sync&.sync_stats || {}
      end

      # Lunchflow sync stats
      @lunchflow_sync_stats_map = {}
      @lunchflow_items.each do |item|
        latest_sync = item.latest_sync_record
        @lunchflow_sync_stats_map[item.id] = latest_sync&.sync_stats || {}
      end

      # Akahu sync stats
      @akahu_sync_stats_map = {}
      @akahu_items.each do |item|
        latest_sync = item.latest_sync_record
        @akahu_sync_stats_map[item.id] = latest_sync&.sync_stats || {}
      end

      # Up sync stats
      @up_sync_stats_map = {}
      @up_items.each do |item|
        latest_sync = item.latest_sync_record
        @up_sync_stats_map[item.id] = latest_sync&.sync_stats || {}
      end

      # Monobank sync stats
      @monobank_sync_stats_map = {}
      @monobank_items.each do |item|
        latest_sync = item.latest_sync_record
        @monobank_sync_stats_map[item.id] = latest_sync&.sync_stats || {}
      end

      # Enable Banking sync stats
      @enable_banking_sync_stats_map = {}
      @enable_banking_latest_sync_error_map = {}
      @enable_banking_items.each do |item|
        latest_sync = item.latest_sync_record
        @enable_banking_sync_stats_map[item.id] = latest_sync&.sync_stats || {}
        @enable_banking_latest_sync_error_map[item.id] = latest_sync&.error
      end

      # CoinStats sync stats
      @coinstats_sync_stats_map = {}
      @coinstats_items.each do |item|
        latest_sync = item.latest_sync_record
        @coinstats_sync_stats_map[item.id] = latest_sync&.sync_stats || {}
      end

      # Sophtron sync stats
      @sophtron_sync_stats_map = {}
      @sophtron_items.each do |item|
        latest_sync = item.latest_sync_record
        @sophtron_sync_stats_map[item.id] = latest_sync&.sync_stats || {}
      end

      # Redbark sync stats
      @redbark_sync_stats_map = {}
      @redbark_items.each do |item|
        latest_sync = item.latest_sync_record
        @redbark_sync_stats_map[item.id] = latest_sync&.sync_stats || {}
      end

      # Mercury sync stats
      @mercury_sync_stats_map = {}
      @mercury_items.each do |item|
        latest_sync = item.latest_sync_record
        @mercury_sync_stats_map[item.id] = latest_sync&.sync_stats || {}
      end

      # Brex sync stats
      @brex_sync_stats_map = {}
      @brex_account_counts_map = {}
      @brex_institutions_count_map = {}
      @brex_items.each do |item|
        latest_sync = item.latest_sync_record
        @brex_sync_stats_map[item.id] = latest_sync&.sync_stats || {}
        brex_accounts = item.brex_accounts.to_a
        linked_count = brex_accounts.count { |brex_account| brex_account.account_provider.present? }
        total_count = brex_accounts.count
        @brex_account_counts_map[item.id] = {
          linked: linked_count,
          unlinked: total_count - linked_count,
          total: total_count
        }
        @brex_institutions_count_map[item.id] = brex_accounts
          .filter_map(&:institution_metadata)
          .uniq { |institution| institution["name"] || institution["institution_name"] }
          .count
      end

      # Coinbase sync stats
      @coinbase_sync_stats_map = {}
      @coinbase_unlinked_count_map = {}

      coinbase_item_ids = @coinbase_items.map(&:id)
      coinbase_unlinked_counts_by_item_id =
        if coinbase_item_ids.any?
          CoinbaseAccount.where(coinbase_item_id: coinbase_item_ids)
            .left_joins(:account_provider)
            .where(account_providers: { id: nil })
            .group(:coinbase_item_id)
            .count
        else
          {}
        end

      @coinbase_items.each do |item|
        latest_sync = item.latest_sync_record
        @coinbase_sync_stats_map[item.id] = latest_sync&.sync_stats || {}

        # Count unlinked accounts
        @coinbase_unlinked_count_map[item.id] = coinbase_unlinked_counts_by_item_id[item.id].to_i
      end

      # IndexaCapital sync stats
      @indexa_capital_sync_stats_map = {}
      @indexa_capital_items.each do |item|
        latest_sync = item.latest_sync_record
        @indexa_capital_sync_stats_map[item.id] = latest_sync&.sync_stats || {}
      end

      # Binance sync stats
      @binance_sync_stats_map = {}
      @binance_unlinked_count_map = {}
      @binance_items.each do |item|
        latest_sync = item.latest_sync_record
        @binance_sync_stats_map[item.id] = latest_sync&.sync_stats || {}

        # Count unlinked accounts
        count = item.binance_accounts
          .left_joins(:account_provider)
          .where(account_providers: { id: nil })
          .count
        @binance_unlinked_count_map[item.id] = count
      end

      # Questrade sync stats and account counts
      @questrade_sync_stats_map = {}
      @questrade_account_counts_map = {}
      @questrade_items.each do |item|
        latest_sync = item.latest_sync_record
        @questrade_sync_stats_map[item.id] = latest_sync&.sync_stats || {}
        accounts = item.questrade_accounts.to_a
        linked = accounts.count { |a| a.account_provider.present? }
        @questrade_account_counts_map[item.id] = {
          linked: linked, unlinked: accounts.size - linked, total: accounts.size
        }
      end

      # Wise sync stats
      @wise_sync_stats_map = {}
      @wise_items.each do |item|
        latest_sync = item.latest_sync_record
        @wise_sync_stats_map[item.id] = latest_sync&.sync_stats || {}
      end

      # Fio sync stats
      @fio_sync_stats_map = {}
      @fio_items.each do |item|
        latest_sync = item.latest_sync_record
        @fio_sync_stats_map[item.id] = latest_sync&.sync_stats || {}
      end
    end
end
