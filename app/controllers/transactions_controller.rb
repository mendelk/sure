class TransactionsController < ApplicationController
  include EntryableResource

  before_action :set_entry_for_unlock, only: :unlock
  before_action :set_entry_for_tags, only: :update_tags

  def show
    super
    assign_mark_recurring_state
  end

  def create
    account = Current.user.accessible_accounts.find_by(id: params.dig(:entry, :account_id))

    if account.nil?
      @entry = Current.family.entries.new(entry_params)
      @entry.valid?
      respond_with_creation_errors
      return
    end

    return unless require_account_permission!(account)

    idempotency_key = submitted_idempotency_key

    # Sequential double-submit guard: the form was already submitted
    # successfully once (double-click, browser retry, user reopening the
    # dialog after a slow response) and the first request already committed
    # by the time this one runs. Treat it as a success instead of creating a
    # second, identical entry.
    if idempotency_key && (existing_entry = find_duplicate_manual_entry(account, idempotency_key))
      respond_with_created_entry(existing_entry, status: :ok)
      return
    end

    @entry = account.entries.new(entry_params_with_idempotency_key(idempotency_key))

    if WebNotificationTransactionEvent.save_new(@entry, origin: "manual")
      @entry.sync_account_later
      @entry.lock_saved_attributes!
      @entry.mark_user_modified!
      @entry.transaction.lock_attr!(:tag_ids) if @entry.transaction.tags.any?

      respond_with_created_entry(@entry)
    else
      respond_with_creation_errors
    end
  rescue ActiveRecord::RecordNotUnique
    # Concurrent-request backstop: two near-simultaneous submissions both
    # passed the pre-check above (neither saw the other's row yet) and both
    # reached #save. The partial unique index on
    # entries(account_id, idempotency_key) lets exactly one INSERT win;
    # this rescues the loser and redirects it to the winning entry instead of
    # creating a duplicate or surfacing a 500 to the user.
    existing_entry = idempotency_key && find_duplicate_manual_entry(account, idempotency_key)
    raise unless existing_entry

    respond_with_created_entry(existing_entry, status: :ok)
  end

  def update
    if @entry.update(permitted_entry_params)
      transaction = @entry.transaction
      transaction.record_category_usage!

      if needs_rule_notification?(transaction)
        flash[:cta] = {
          type: "category_rule",
          category_id: transaction.category_id,
          category_name: transaction.category.name
        }
      end

      @entry.lock_saved_attributes!
      @entry.mark_user_modified!
      @entry.transaction.lock_attr!(:tag_ids) if @entry.transaction.tags.any?
      @entry.sync_account_later

      notes_changed = @entry.saved_change_to_notes?

      # Reload to ensure fresh state for turbo stream rendering
      @entry.reload

      assign_mark_recurring_state

      respond_to do |format|
        format.html { redirect_back_or_to account_path(@entry.account), notice: t(".updated") }
        format.turbo_stream do
          in_split_group = helpers.in_split_group?(@entry, params[:grouped])
          render turbo_stream: [
            turbo_stream.replace(
              dom_id(@entry, :header),
              partial: "transactions/header",
              locals: { entry: @entry }
            ),
            turbo_stream.replace(
              dom_id(@entry, :protection),
              partial: "entries/protection_indicator",
              locals: { entry: @entry, unlock_path: unlock_transaction_path(@entry.transaction) }
            ),
            (turbo_stream.replace(
              dom_id(@entry, :notes),
              partial: "transactions/notes",
              locals: { entry: @entry, can_annotate: can_annotate_entry? }
            ) if params[:entry]&.key?(:notes) && notes_changed),
            (turbo_stream.replace(
              dom_id(@entry, :mark_recurring),
              partial: "transactions/mark_recurring",
              locals: { entry: @entry }
            ) if can_edit_entry? && !@entry.split_child?),
            turbo_stream.replace(
              dom_id(@entry),
              partial: "entries/entry",
              locals: { entry: @entry, in_split_group: in_split_group }
            ),
            *flash_notification_stream_items
          ].compact
        end
      end
    else
      assign_mark_recurring_state
      render :show, status: :unprocessable_entity
    end
  end

  def update_tags
    return unless require_account_permission!(@entry.account, :annotate, redirect_path: transaction_path(@entry))

    # The transaction-row tag picker toggles one tag at a time; the drawer's
    # multiselect sends the full set.
    if params[:toggle_tag_id].present?
      @toggled_tag = Current.family.tags.find(params[:toggle_tag_id])
      @entry.transaction.toggle_tag!(@toggled_tag)
    else
      @entry.transaction.tag_ids = Current.family.tags.where(id: tag_ids_param).pluck(:id)
    end

    @entry.lock_saved_attributes!
    @entry.mark_user_modified!
    @entry.transaction.lock_attr!(:tag_ids)
    @entry.sync_account_later

    respond_to do |format|
      # JSON stays first so Accept: */* callers keep the original response.
      format.json { render json: { tag_ids: @entry.transaction.tag_ids } }
      # Without Turbo the row picker's button_to posts as plain HTML.
      format.html { redirect_back_or_to transaction_path(@entry) }
      format.turbo_stream do
        transaction = @entry.transaction
        streams = [
          turbo_stream.replace(
            dom_id(transaction, "tag_summary_mobile"),
            partial: "tags/summary",
            locals: { transaction: transaction, variant: :mobile }
          )
        ]
        if @toggled_tag
          streams << turbo_stream.replace(
            dom_id(transaction, :inline_tags),
            partial: "transactions/inline_tags",
            locals: { entry: @entry, transaction: transaction }
          )
          # autofocus hands keyboard focus back to the re-rendered option,
          # which Turbo focuses after the stream renders.
          streams << turbo_stream.replace(
            "#{dom_id(@entry, :tag_option)}_#{@toggled_tag.id}",
            partial: "tag/dropdowns/row",
            locals: { tag: @toggled_tag, entry: @entry, selected: transaction.tag_ids.include?(@toggled_tag.id), autofocus: true }
          )
        end
        render turbo_stream: streams
      end
    end
  end

  def merge_duplicate
    transaction = accessible_transactions.includes(entry: :account).find(params[:id])

    return unless require_account_permission!(transaction.entry.account)

    if transaction.merge_with_duplicate!
      flash[:notice] = t("transactions.merge_duplicate.success")
    else
      flash[:alert] = t("transactions.merge_duplicate.failure")
    end

    redirect_to transactions_path
  rescue ActiveRecord::RecordNotFound, ActiveRecord::RecordInvalid,
         ActiveRecord::RecordNotDestroyed, ActiveRecord::Deadlocked,
         ActiveRecord::LockWaitTimeout => e
    Rails.logger.error("Failed to merge duplicate transaction #{params[:id]}: #{e.message}")
    flash[:alert] = t("transactions.merge_duplicate.failure")
    redirect_to transactions_path
  end

  def dismiss_duplicate
    transaction = accessible_transactions.includes(entry: :account).find(params[:id])

    return unless require_account_permission!(transaction.entry.account)

    if transaction.dismiss_duplicate_suggestion!
      flash[:notice] = t("transactions.dismiss_duplicate.success")
    else
      flash[:alert] = t("transactions.dismiss_duplicate.failure")
    end

    redirect_back_or_to transactions_path
  rescue ActiveRecord::RecordInvalid => e
    Rails.logger.error("Failed to dismiss duplicate suggestion for transaction #{params[:id]}: #{e.message}")
    flash[:alert] = t("transactions.dismiss_duplicate.failure")
    redirect_back_or_to transactions_path
  end

  def convert_to_trade
    @transaction = accessible_transactions.includes(entry: :account).find(params[:id])
    @entry = @transaction.entry

    return unless require_account_permission!(@entry.account)

    unless @entry.account.investment?
      flash[:alert] = t("transactions.convert_to_trade.errors.not_investment_account")
      redirect_back_or_to transactions_path
      return
    end

    render :convert_to_trade
  end

  def create_trade_from_transaction
    @transaction = accessible_transactions.includes(entry: :account).find(params[:id])
    @entry = @transaction.entry

    return unless require_account_permission!(@entry.account)

    Transaction::TradeConversion.new(@transaction, params.permit(
      :security_id, :ticker, :custom_ticker, :exchange_operating_mic, :qty, :price,
      :investment_activity_label, :trade_name
    ), family: Current.family).create!
    flash[:notice] = t("transactions.convert_to_trade.success")
    redirect_to account_path(@entry.account), status: :see_other
  rescue Transaction::TradeConversion::Invalid, ActiveRecord::RecordInvalid, ActiveRecord::RecordNotSaved => e
    flash[:alert] = e.message
    redirect_back_or_to transactions_path, status: :see_other
  end

  def unlock
    return unless require_account_permission!(@entry.account)

    @entry.unlock_for_sync!
    flash[:notice] = t("entries.unlock.success")

    redirect_back_or_to transactions_path
  end

  def mark_as_recurring
    transaction = accessible_transactions.includes(entry: :account).find(params[:id])

    return unless require_account_permission!(transaction.entry.account)

    # Check if a recurring transaction already exists for this pattern.
    # The UI disables the button ahead of time using the same lookup, but this
    # guard remains as the authoritative check (e.g. stale page, direct POST).
    existing = transaction.existing_manual_recurring_transaction

    if existing
      flash[:alert] = t("recurring_transactions.already_exists")
      redirect_back_or_to transactions_path
      return
    end

    begin
      recurring_transaction = RecurringTransaction.create_from_transaction(transaction)

      respond_to do |format|
        format.html do
          flash[:notice] = t("recurring_transactions.marked_as_recurring")
          redirect_back_or_to transactions_path
        end
      end
    rescue ActiveRecord::RecordInvalid => e
      respond_to do |format|
        format.html do
          flash[:alert] = t("recurring_transactions.creation_failed")
          redirect_back_or_to transactions_path
        end
      end
    rescue ActiveRecord::RecordNotUnique
      # Another request created the same (account, name/merchant, amount,
      # currency) pattern between the check above and this create — the DB
      # unique index is the authoritative backstop for that race.
      respond_to do |format|
        format.html do
          flash[:alert] = t("recurring_transactions.already_exists")
          redirect_back_or_to transactions_path
        end
      end
    rescue StandardError => e
      respond_to do |format|
        format.html do
          flash[:alert] = t("recurring_transactions.unexpected_error")
          redirect_back_or_to transactions_path
        end
      end
    end
  end

  def exchange_rate
    account = Current.family.accounts.find(params[:account_id])
    currency_from = params[:currency]
    date = params[:date]&.to_date || Date.current

    if account.currency == currency_from
      render json: { same_currency: true, rate: 1.0 }
    else
      rate_obj = ExchangeRate.find_or_fetch_rate(
        from: currency_from,
        to: account.currency,
        date: date
      )

      if rate_obj.nil?
        return render json: { error: "Exchange rate not found" }, status: :not_found
      end

      rate_value = rate_obj.is_a?(Numeric) ? rate_obj : rate_obj.rate

      render json: { rate: rate_value.to_f, account_currency: account.currency }
    end
  end

  private


    # The "Mark as Recurring" block is only ever rendered under these same
    # conditions (see transactions/show.html.erb), so skip the extra query
    # entirely when it won't be used — this runs on every show/failed-update
    # render, including read-only viewers and split-child transactions.
    def assign_mark_recurring_state
      return unless can_edit_entry? && !@entry.split_child?

      existing = @entry.transaction.existing_manual_recurring_transaction

      @mark_recurring_href = mark_as_recurring_transaction_path(@entry.transaction)
      @mark_recurring_subtitle_class = existing ? "text-subdued" : "text-secondary"
      @mark_recurring_subtitle = existing ? t("recurring_transactions.already_exists") : t("transactions.show.mark_recurring_subtitle")
      @mark_recurring_disabled = existing.present?
      @mark_recurring_title = existing ? t("recurring_transactions.already_exists") : nil
      @mark_recurring_button_class = existing ? "disabled:opacity-50" : nil
    end

    def accessible_transactions
      Current.family.transactions
        .joins(entry: :account)
        .merge(Account.accessible_by(Current.user))
    end


    def set_entry_for_unlock
      transaction = accessible_transactions.find(params[:id])
      @entry = transaction.entry
    end

    def needs_rule_notification?(transaction)
      return false if Current.user.rule_prompts_disabled

      if Current.user.rule_prompt_dismissed_at.present?
        time_since_last_rule_prompt = Time.current - Current.user.rule_prompt_dismissed_at
        return false if time_since_last_rule_prompt < 1.day
      end

      transaction.saved_change_to_category_id? && transaction.category_id.present? &&
      transaction.eligible_for_category_rule?
    end

    def entry_params
      entry_params = params.require(:entry).permit(
        :name, :date, :amount, :currency, :excluded, :notes, :nature, :entryable_type,
        entryable_attributes: [ :id, :category_id, :merchant_id, :kind, :investment_activity_label, :exchange_rate, { tag_ids: [] } ]
      )

      nature = entry_params.delete(:nature)

      entry_params.delete(:amount) if entry_params[:amount].blank?
      entry_params.delete(:date) if entry_params[:date].blank?

      if nature.present? && entry_params[:amount].present?
        signed_amount = nature == "inflow" ? -entry_params[:amount].to_d : entry_params[:amount].to_d
        entry_params = entry_params.merge(amount: signed_amount)
      end

      entry_params
    end

    def entry_params_with_idempotency_key(idempotency_key)
      return entry_params unless idempotency_key

      # A dedicated column, deliberately not external_id/source: those are
      # provider-linkage fields (Entry#linked? = external_id.present?), and
      # reusing them here would make a manual entry look provider-synced -
      # disabling its date/nature/amount/currency fields in the editor, and
      # hiding it from future provider dedup matching.
      entry_params.merge(idempotency_key: idempotency_key)
    end

    def find_duplicate_manual_entry(account, idempotency_key)
      account.entries.find_by(idempotency_key: idempotency_key)
    end

    # Clients generate a UUID for each creation attempt and reuse it on
    # retries. Only UUID-shaped strings participate in account-scoped
    # de-duplication; other values preserve the existing keyless behavior.
    UUID_FORMAT = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i
    private_constant :UUID_FORMAT

    def submitted_idempotency_key
      key = params.dig(:entry, :idempotency_key)
      key if key.is_a?(String) && key.match?(UUID_FORMAT)
    end

    def respond_with_created_entry(entry, status: :created)
      respond_to do |format|
        format.json do
          render json: { id: entry.entryable_id, entry_id: entry.id, account_id: entry.account_id }, status: status
        end
        format.html { redirect_back_or_to account_path(entry.account), notice: t(".created") }
        format.turbo_stream do
          flash[:notice] = t(".created")
          stream_redirect_back_or_to(account_path(entry.account))
        end
      end
    end

    def respond_with_creation_errors
      errors = @entry.errors.full_messages
      render json: { error: errors.to_sentence, errors: errors }, status: :unprocessable_entity
    end

    def tag_ids_param
      Array(params[:tag_ids]).reject(&:blank?)
    end

    def set_entry_for_tags
      set_entry
    end


    # Filters entry_params based on the user's permission on the account.
    # read_write users can only annotate (category, tags, notes, merchant).
    # read_only users cannot update anything.
    def permitted_entry_params
      case entry_permission
      when :owner, :full_control
        entry_params
      when :read_write
        # Annotate only: category, tags, merchant, notes
        ep = entry_params.slice(:notes)
        if entry_params[:entryable_attributes].present?
          ep[:entryable_attributes] = entry_params[:entryable_attributes].slice(:id, :category_id, :merchant_id, :tag_ids)
        end
        ep
      else
        {} # read_only — no edits allowed
      end
    end
end
