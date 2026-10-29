class AccountsController < ApplicationController
  include StreamExtensions
  include AccountWorkspaceData

  before_action :set_account, only: %i[show sparkline sync set_default remove_default]
  before_action :set_manageable_account, only: %i[toggle_active toggle_exclude_from_reports destroy unlink confirm_unlink select_provider]
  before_action :ensure_linked_account, only: %i[confirm_unlink unlink]
  include Periodable

  def index
    return render("spa/show", layout: "spa") if request.format.html?

    build_index_workspace

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

    build_detail_workspace
  end

  def sync
    Account::Lifecycle.new(@account).request_sync

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
      Account::Lifecycle.new(@account).unlink!

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

    def ensure_linked_account
      return if @account.linked?

      redirect_to account_path(@account), alert: t("accounts.unlink.not_linked")
    end

    def family
      Current.family
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
end
