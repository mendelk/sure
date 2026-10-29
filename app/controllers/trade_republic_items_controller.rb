class TradeRepublicItemsController < ApplicationController
  before_action :set_trade_republic_item, only: [ :show, :update, :destroy, :sync, :repair, :setup_accounts, :complete_account_setup, :initiate_login, :complete_login, :poll_login, :initiate_qr_login, :poll_qr_login, :cancel_qr_login ]
  before_action :require_admin!, only: [ :show, :create, :select_accounts, :select_existing_account, :link_existing_account, :update, :destroy, :sync, :repair, :setup_accounts, :complete_account_setup, :initiate_login, :complete_login, :poll_login, :initiate_qr_login, :poll_qr_login, :cancel_qr_login ]

  def show
    redirect_to settings_providers_path(anchor: "trade-republic")
  end

  def create
    qr_login_requested = params[:login_method] == "qr" || params.dig(:trade_republic_item, :login_method) == "qr"
    @trade_republic_item = Current.family.trade_republic_items.build(trade_republic_item_params)
    login_pin = @trade_republic_item.pin
    @trade_republic_item.name ||= t("trade_republic_items.defaults.name")
    @trade_republic_item.currency ||= Current.family.currency
    @trade_republic_item.status = :requires_update if qr_login_requested

    if !qr_login_requested && login_pin.blank?
      render_panel_error(t("trade_republic_items.initiate_login.pin_required"))
      return
    end

    if @trade_republic_item.save
      if qr_login_requested
        initiate_qr_login_for(@trade_republic_item)
      else
        initiate_login_for(@trade_republic_item, pin: login_pin)
      end

      if turbo_panel_request?
        if @error_message.present?
          flash.now[:alert] = @error_message
        else
          flash.now[:notice] = t(".success")
        end
        render turbo_stream: [
          turbo_stream.replace(
            "trade-republic-providers-panel",
            partial: "settings/providers/trade_republic_panel",
            locals: {
              qr_code_svg: @qr_code_svg,
              qr_login_auto_poll_item: (@trade_republic_item if qr_login_requested && @error_message.blank?)
            }
          ),
          *flash_notification_stream_items
        ]
      elsif @error_message.present?
        redirect_to settings_providers_path(anchor: "trade-republic"), alert: @error_message, status: :see_other
      else
        redirect_to accounts_path, **redirect_flash_options(t(".success")), status: :see_other
      end
    else
      render_panel_error(@trade_republic_item.errors.full_messages.join(", "))
    end
  end

  # Step 1 of authentication: starts a Trade Republic web login and stores the
  # in-flight login state (encrypted) on the item. The user then confirms via
  # push notification or authenticator code; no web request blocks on that.
  def initiate_login
    provider = @trade_republic_item.trade_republic_provider
    unless provider
      redirect_to settings_providers_path, alert: t(".not_configured"), status: :see_other
      return
    end

    if @trade_republic_item.pin.blank?
      @trade_republic_item.update!(pending_login_state: nil, status: :requires_update) if @trade_republic_item.pending_login_state.present?
      return render_login_panel(alert: t(".pin_required")) if turbo_panel_request?

      respond_to do |format|
        format.html { redirect_to settings_providers_path(anchor: "trade-republic"), alert: t(".pin_required"), status: :see_other }
        format.json { render json: { error: t(".pin_required") }, status: :unprocessable_entity }
      end
      return
    end

    result = @trade_republic_item.start_configuration_login!(pin: @trade_republic_item.pin)

    respond_to do |format|
      format.html { redirect_to settings_providers_path(anchor: "trade-republic"), notice: t(".verification_required", method: result["method"]) }
      format.json { head :ok }
    end
  rescue Provider::TradeRepublicClient::Error => e
    redirect_to settings_providers_path(anchor: "trade-republic"), alert: e.message, status: :see_other
  end

  # Step 2 of authentication: completes the started login. For push accounts
  # this is retried until Trade Republic reports CONFIRMED (status "pending");
  # authenticator accounts submit their code here. Success replaces the stored
  # session blob and clears the pending login state.
  def complete_login
    result = @trade_republic_item.complete_configuration_login!(code: trade_republic_login_params[:code])
    if result["status"] == "pending"
      if turbo_panel_request?
        render_login_panel(notice: t(".approval_pending"))
      else
        redirect_to settings_providers_path(anchor: "trade-republic"), notice: t(".approval_pending")
      end
    elsif turbo_panel_request?
      render_login_panel(success: true)
    else
      redirect_to settings_providers_path(anchor: "trade-republic"), notice: t(".success")
    end
  rescue TradeRepublicItem::Configuration::DuplicateConnection
    if turbo_panel_request?
      render_login_panel(alert: t("trade_republic_items.duplicate_connection"), whole_panel: true)
    else
      redirect_to settings_providers_path(anchor: "trade-republic"), alert: t("trade_republic_items.duplicate_connection"), status: :see_other
    end
  rescue TradeRepublicItem::Configuration::SupersededLogin
    render_superseded_push_login
  rescue ProviderConnection::Invalid
    redirect_to settings_providers_path(anchor: "trade-republic"), alert: t(".no_pending_login"), status: :see_other
  rescue Provider::TradeRepublicClient::LoginExpired, Provider::TradeRepublicClient::AuthenticationRequired
    redirect_to settings_providers_path(anchor: "trade-republic"), alert: t(".login_expired"), status: :see_other
  rescue Provider::TradeRepublicClient::Error => e
    redirect_to settings_providers_path(anchor: "trade-republic"), alert: e.message, status: :see_other
  end

  # Push approvals are asynchronous. The browser polls this endpoint while
  # the user approves the login in the Trade Republic app (maximum two minutes).
  def poll_login
    result = @trade_republic_item.complete_configuration_login!(poll: true)
    if result["status"] == "pending"
      login_poll_response(:no_content) { render_login_panel }
    else
      render_login_panel(success: true)
    end
  rescue TradeRepublicItem::Configuration::DuplicateConnection
    render_login_panel(alert: t("trade_republic_items.duplicate_connection"), whole_panel: true)
  rescue TradeRepublicItem::Configuration::SupersededLogin => e
    capture_login_poll_error(e.cause, login: "push", retryable: false) if e.cause.is_a?(Provider::TradeRepublicClient::Error)
    render_superseded_push_login
  rescue ProviderConnection::Invalid
    render_login_panel(alert: t(".no_pending_login"))
  rescue Provider::TradeRepublicClient::LoginExpired, Provider::TradeRepublicClient::AuthenticationRequired
    render_login_panel(alert: t(".login_expired"))
  rescue Provider::TradeRepublicClient::RateLimited => e
    capture_login_poll_error(e, login: "push", retryable: true)
    login_poll_response(:too_many_requests) { render_login_panel(alert: e.message) }
  rescue Provider::TradeRepublicClient::Timeout,
         Provider::TradeRepublicClient::TransientProviderError => e
    capture_login_poll_error(e, login: "push", retryable: true)
    login_poll_response(:service_unavailable) { render_login_panel(alert: e.message) }
  rescue Provider::TradeRepublicClient::Error => e
    capture_login_poll_error(e, login: "push", retryable: false)
    render_login_panel(alert: e.message)
  end

  def initiate_qr_login
    response_data = @trade_republic_item.start_configuration_login!(qr: true)
    response_data["qr_code_svg"] = view_context.generate_mfa_qr_code(response_data["qr_code_payload"]) if response_data["qr_code_payload"].present?
    render json: response_data, status: :accepted
  rescue Provider::TradeRepublicClient::Error, ProviderConnection::Invalid => e
    render json: { error: e.message }, status: :unprocessable_entity
  end

  def poll_qr_login
    response_data = @trade_republic_item.complete_configuration_login!(qr: true, poll: true)
    response_data["qr_code_svg"] = view_context.generate_mfa_qr_code(response_data["qr_code_payload"]) if response_data["qr_code_payload"].present?
    flash[:notice] = t(".success") unless response_data["status"] == "pending"
    render json: response_data
  rescue TradeRepublicItem::Configuration::DuplicateConnection
    flash[:alert] = t("trade_republic_items.duplicate_connection")
    render json: { status: "duplicate_connection" }
  rescue TradeRepublicItem::Configuration::SupersededLogin
    render_superseded_qr_login
  rescue Provider::TradeRepublicClient::LoginExpired, Provider::TradeRepublicClient::AuthenticationRequired, ProviderConnection::Invalid => e
    render json: { error: e.message }, status: :unprocessable_entity
  rescue Provider::TradeRepublicClient::RateLimited => e
    render_qr_login_error(e, status: :too_many_requests, retryable: true)
  rescue Provider::TradeRepublicClient::Timeout,
         Provider::TradeRepublicClient::TransientProviderError => e
    render_qr_login_error(e, status: :service_unavailable, retryable: true)
  rescue Provider::TradeRepublicClient::Error => e
    render_qr_login_error(e)
  end

  def cancel_qr_login
    @trade_republic_item.update!(pending_login_state: nil, status: :requires_update)
    respond_to do |format|
      format.turbo_stream { render turbo_stream: replace_card_stream }
      format.json { render json: { status: "cancelled" } }
    end
  end

  def update
    attrs = trade_republic_item_params.to_h
    login_pin = attrs["pin"]
    reauthentication_required = reauthentication_needed?(attrs)

    if reauthentication_required && login_pin.blank?
      render_panel_error(t(".pin_required"))
      return
    end

    if @trade_republic_item.update(attrs)
      initiate_login_for(@trade_republic_item, pin: login_pin) if reauthentication_required

      if turbo_panel_request?
        if @error_message.present?
          flash.now[:alert] = @error_message
        else
          flash.now[:notice] = t(".success")
        end
        render turbo_stream: [
          replace_card_stream,
          *flash_notification_stream_items
        ]
      elsif @error_message.present?
        redirect_to settings_providers_path(anchor: "trade-republic"), alert: @error_message, status: :see_other
      else
        redirect_to accounts_path, **redirect_flash_options(t(".success")), status: :see_other
      end
    else
      render_panel_error(@trade_republic_item.errors.full_messages.join(", "))
    end
  end

  def destroy
    unlink_results = @trade_republic_item.unlink_all!(dry_run: false)
    if unlink_results.any? { |result| result[:error].present? }
      redirect_to settings_providers_path, alert: t(".unlink_failed"), status: :see_other
      return
    end

    @trade_republic_item.destroy_later
    redirect_to settings_providers_path, notice: t(".success"), status: :see_other
  end

  def sync
    @trade_republic_item.sync_later unless @trade_republic_item.syncing?

    respond_to do |format|
      format.html { redirect_back_or_to accounts_path }
      format.json { head :ok }
    end
  end

  def repair
    TradeRepublicRepairJob.perform_later(@trade_republic_item)
    redirect_back_or_to accounts_path, notice: t("trade_republic_items.repair.scheduled"), status: :see_other
  end

  def select_accounts
    item = current_trade_republic_item
    unless item
      redirect_to settings_providers_path, alert: t(".not_configured")
      return
    end

    redirect_to setup_accounts_trade_republic_item_path(item)
  end

  def select_existing_account
    @account = Current.family.accounts.find(params[:account_id])
    @available_trade_republic_accounts = Current.family.trade_republic_items
      .active
      .includes(trade_republic_accounts: { account_provider: :account })
      .flat_map(&:trade_republic_accounts)
      .select { |tr_account| tr_account.account_provider.nil? && tr_account.linkable_to?(@account) }
      .sort_by { |tr_account| tr_account.updated_at || tr_account.created_at }
      .reverse

    render :select_existing_account, layout: false
  end

  def link_existing_account
    account = Current.family.accounts.find_by(id: params[:account_id])
    item = Current.family.trade_republic_items.active.joins(:trade_republic_accounts)
                  .where(trade_republic_accounts: { id: params[:trade_republic_account_id] })
                  .first
    tr_account = item&.trade_republic_accounts&.find_by(id: params[:trade_republic_account_id])

    if account.blank? || tr_account.blank?
      redirect_to settings_providers_path, alert: t(".not_found")
      return
    end

    unless tr_account.linkable_to?(account) &&
        account.account_providers.none? &&
        account.plaid_account_id.blank? &&
        account.simplefin_account_id.blank?
      redirect_to account_path(account), alert: t(".only_manual_investment")
      return
    end

    provider = nil

    tr_account.with_lock do
      if tr_account.current_account.present?
        redirect_to account_path(account), alert: t(".already_linked")
        return
      end

      provider = tr_account.ensure_account_provider!(account)
    end

    raise "Failed to create AccountProvider link" unless provider

    processing_failed = false
    begin
      TradeRepublicAccount::Processor.new(tr_account.reload).process
    rescue => e
      processing_failed = true
      DebugLogEntry.capture(
        category: "sync",
        level: "error",
        message: "Failed to process linked Trade Republic account #{tr_account.id}: #{e.class} - #{e.message}",
        source: "trade_republic",
        family: Current.family,
        provider_key: "trade_republic"
      )
    end

    tr_account.trade_republic_item.sync_later unless tr_account.trade_republic_item.syncing?
    if processing_failed
      redirect_to account_path(account), notice: t(".success"), alert: t(".processing_failed"), status: :see_other
    else
      redirect_to account_path(account), notice: t(".success"), status: :see_other
    end
  rescue => e
    DebugLogEntry.capture(
      category: "sync",
      level: "error",
      message: "Failed to link existing Trade Republic account: #{e.class} - #{e.message}",
      source: "trade_republic",
      family: Current.family,
      provider_key: "trade_republic"
    )
    redirect_to settings_providers_path, alert: t(".failed"), status: :see_other
  end

  def setup_accounts
    @trade_republic_accounts = @trade_republic_item.trade_republic_accounts.includes(account_provider: :account)
    @linked_accounts = @trade_republic_accounts.select { |a| a.current_account.present? }
    @unlinked_accounts = @trade_republic_accounts.reject { |a| a.current_account.present? }

    no_accounts = @linked_accounts.blank? && @unlinked_accounts.blank?
    latest_sync = @trade_republic_item.syncs.ordered.first
    should_sync = latest_sync.nil? || !latest_sync.completed?

    if no_accounts && !@trade_republic_item.syncing? && should_sync && @trade_republic_item.session_configured?
      @trade_republic_item.sync_later
    end

    linkable_accounts = Current.family.accounts
      .visible
      .where(accountable_type: %w[Investment Depository Crypto])
      .left_joins(:account_providers)
      .where(account_providers: { id: nil })
      .includes(:accountable)
      .order(:name)
      .to_a
    @linkable_accounts_by_tr_account = @unlinked_accounts.index_with do |tr_account|
      linkable_accounts.select { |linkable| tr_account.linkable_to?(linkable) }
    end

    @syncing = @trade_republic_item.syncing?
    @waiting_for_sync = no_accounts && @syncing
    @no_accounts_found = no_accounts && !@syncing && @trade_republic_item.last_synced_at.present?
  end

  def complete_account_setup
    selected_accounts = Array(params[:account_ids]).reject(&:blank?)
    created_accounts = []
    failed_accounts = 0
    failed_processing = 0

    selected_accounts.each do |tr_account_id|
      tr_account = @trade_republic_item.trade_republic_accounts.find_by(id: tr_account_id)
      next unless tr_account

      begin
        tr_account.with_lock do
          next if tr_account.current_account.present?

          account = Account.create_from_trade_republic_account(tr_account)
          provider = tr_account.ensure_account_provider!(account)
          raise ActiveRecord::RecordNotSaved, "Failed to link Trade Republic account" unless provider

          created_accounts << account
        end
      rescue => e
        failed_accounts += 1
        DebugLogEntry.capture(
          category: "sync",
          level: "error",
          message: "Failed to create Trade Republic account #{tr_account.id}: #{e.class} - #{e.message}",
          source: "trade_republic",
          family: Current.family,
          provider_key: "trade_republic"
        )
        next
      end

      begin
        TradeRepublicAccount::Processor.new(tr_account.reload).process
      rescue => e
        failed_processing += 1
        DebugLogEntry.capture(
          category: "sync",
          level: "error",
          message: "Failed to process Trade Republic account #{tr_account.id} after setup: #{e.class} - #{e.message}",
          source: "trade_republic",
          family: Current.family,
          provider_key: "trade_republic"
        )
      end
    end

    @trade_republic_item.update!(pending_account_setup: @trade_republic_item.unlinked_accounts_count.positive?)
    @trade_republic_item.sync_later if created_accounts.any?

    if created_accounts.any?
      options = { notice: t(".success", count: created_accounts.count), status: :see_other }
      failed_count = failed_accounts + failed_processing
      options[:alert] = t(".partial_failure", count: failed_count) if failed_count.positive?
      redirect_to accounts_path, **options
    elsif selected_accounts.empty?
      redirect_to setup_accounts_trade_republic_item_path(@trade_republic_item), alert: t(".none_selected"), status: :see_other
    else
      message = failed_accounts.positive? ? t(".partial_failure", count: failed_accounts) : t(".none_created")
      redirect_to setup_accounts_trade_republic_item_path(@trade_republic_item), alert: message, status: :see_other
    end
  end

  private

    def initiate_qr_login_for(item)
      data = item.start_configuration_login!(qr: true)
      @qr_code_svg = view_context.generate_mfa_qr_code(data["qr_code_payload"]) if data["qr_code_payload"].present?
    rescue Provider::TradeRepublicClient::Error => e
      @error_message = e.message
    end

    def set_trade_republic_item
      @trade_republic_item = Current.family.trade_republic_items.find(params[:id])
    end

    def current_trade_republic_item
      active_items = Current.family.trade_republic_items.active
      active_items.syncable.ordered.first || active_items.ordered.first
    end

    def trade_republic_item_params
      params.require(:trade_republic_item).permit(:phone_number, :pin, :currency)
    end

    # Credentials changed → the stored session belongs to the old login.
    def reauthentication_needed?(attrs)
      (attrs["phone_number"].present? && attrs["phone_number"] != @trade_republic_item.phone_number) || attrs["pin"].present?
    end

    def initiate_login_for(item, pin: nil)
      item.start_configuration_login!(pin: pin)
    rescue Provider::TradeRepublicClient::Error => e
      @error_message = e.message
      DebugLogEntry.capture(
        category: "sync",
        level: "warn",
        message: "Trade Republic login initiation failed for item #{item.id}: #{e.message}",
        source: "trade_republic",
        family: item.family,
        provider_key: "trade_republic"
      )
    end


    def redirect_flash_options(success_message)
      @error_message.present? ? { alert: @error_message } : { notice: success_message }
    end

    def trade_republic_login_params
      params.fetch(:trade_republic_login, {}).permit(:code)
    end

    def render_login_panel(alert: nil, notice: nil, success: false, whole_panel: false)
      if success
        return render turbo_stream: [
          turbo_stream.replace("drawer", view_context.turbo_frame_tag("drawer")),
          turbo_stream.replace(
            "modal",
            render_to_string(partial: "trade_republic_items/connection_success", formats: [ :html ])
          )
        ]
      end

      flash.now[:alert] = alert if alert
      flash.now[:notice] = notice if notice
      render turbo_stream: [
        whole_panel ? replace_panel_stream : replace_card_stream,
        *flash_notification_stream_items
      ]
    end

    # Push-login polling re-renders about once per second; replacing only this
    # item's card keeps other cards (open state, typed credentials, running QR
    # logins) intact.
    def replace_card_stream(item = @trade_republic_item)
      turbo_stream.replace(
        TradeRepublic::ConnectionCardComponent.dom_id_for(item),
        TradeRepublic::ConnectionCardComponent.new(item: item, qr_active: item.login_stage == "qr_pending")
      )
    end

    def replace_panel_stream
      turbo_stream.replace("trade-republic-providers-panel", partial: "settings/providers/trade_republic_panel")
    end


    def turbo_panel_request?
      turbo_frame_request? || request.format.turbo_stream?
    end

    def render_panel_error(message)
      @error_message = message

      if turbo_panel_request?
        render turbo_stream: turbo_stream.replace(
          "trade-republic-providers-panel",
          partial: "settings/providers/trade_republic_panel",
          locals: {
            error_message: @error_message,
            # Only the add-connection form's own unsaved item should replace
            # its blank default; an existing item failing update/login keeps
            # the add form blank.
            new_item: (@trade_republic_item if @trade_republic_item&.new_record?)
          }
        ), status: :unprocessable_entity
      else
        redirect_to settings_providers_path(anchor: "trade-republic"), alert: @error_message, status: :see_other
      end
    end

    def render_qr_login_error(error, status: :unprocessable_entity, retryable: false)
      capture_login_poll_error(error, login: "QR", retryable: retryable)


      render json: { error: error.message, retryable: retryable }, status: status
    end

    # The background poller lives on the card, so re-rendering the card for it
    # would reconnect it, restart its timeout and poll again without waiting.
    # The manual status button submits a Turbo form (no XHR header) and needs
    # the card back as feedback.
    def login_poll_response(poller_status)
      request.xhr? ? head(poller_status) : yield
    end

    def capture_login_poll_error(error, login:, retryable:)
      # Malformed-response messages can quote the provider response body.
      detail = error.is_a?(Provider::TradeRepublicClient::MalformedResponse) ? error.class.name : "#{error.class} - #{error.message}"
      DebugLogEntry.capture(
        category: "sync",
        level: retryable ? "info" : "warn",
        message: "Trade Republic #{login} login poll failed for item #{@trade_republic_item.id} " \
                 "(#{retryable ? "retryable" : "fatal"}): #{detail}",
        source: "trade_republic",
        family: Current.family,
        provider_key: "trade_republic"
      )
    end


    # A newer login owns the card now; leave its state and poller alone.
    def render_superseded_push_login
      login_poll_response(:no_content) { render_login_panel }
    end

    def render_superseded_qr_login
      render json: { error: t("trade_republic_items.poll_qr_login.no_pending_login"), retryable: false }, status: :conflict
    end
end
