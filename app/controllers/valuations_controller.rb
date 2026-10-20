class ValuationsController < ApplicationController
  include EntryableResource, StreamExtensions

  before_action :set_entry, only: %i[show update destroy confirm_update]

  rescue_from ActiveRecord::RecordNotFound do |error|
    raise error unless request.format.json?
    render_errors([ t("valuations.errors.not_found") ], status: :not_found)
  end

  rescue_from ActionController::ParameterMissing do
    render_errors([ t("valuations.errors.invalid_entry") ])
  end

  rescue_from ActiveRecord::RecordInvalid, ActiveRecord::RecordNotDestroyed do |error|
    render_errors(error.record.errors.full_messages)
  end

  def new
    account = accessible_accounts.find(params[:account_id]) if params[:account_id].present?
    return if account && !require_valuation_permission!(account)

    accounts = accessible_accounts.writable_by(Current.user).alphabetically.includes(:account_providers)
    entry = Entry.new(
      account: account, entryable: Valuation.new,
      name: account ? Valuation.build_reconciliation_name(account.accountable_type) : "",
      date: Date.current, currency: account&.currency || Current.family.currency
    )
    render json: Valuation::PageData.new(entry: entry, accounts: accounts, permissions: {
      can_edit: accounts.any?, can_annotate: accounts.any?
    })
  end

  def show
    render json: Valuation::PageData.new(
      entry: @entry, accounts: [ @entry.account ], permissions: account_permissions(@entry.account)
    )
  end

  def confirm_create
    account = accessible_accounts.find(params.require(:entry).require(:account_id))
    return unless require_valuation_permission!(account)
    return unless prepare_reconciliation(account)

    result = account.create_reconciliation(**@reconciliation_params, dry_run: true)
    render_confirmation(account, result, is_update: false)
  end

  def confirm_update
    return unless require_valuation_permission!(@entry.account)
    return unless prepare_reconciliation(@entry.account, existing_entry: @entry)

    result = @entry.account.update_reconciliation(@entry, **@reconciliation_params, dry_run: true)
    render_confirmation(@entry.account, result, is_update: true)
  end

  def create
    account = accessible_accounts.find(params.require(:entry).require(:account_id))
    return unless require_valuation_permission!(account)
    return unless prepare_reconciliation(account)

    result = account.create_reconciliation(**@reconciliation_params)
    return render_errors([ result.error_message ]) unless result.success?

    entry = account.entries.valuations.find_by!(date: @reconciliation_params[:date])
    render_success(entry, notice: t("valuations.create.account_updated"), status: :created)
  end

  def update
    financial_update = entry_params.key?(:date) || entry_params.key?(:amount)
    return unless require_valuation_permission!(@entry.account, financial_update ? :write : :annotate)

    if financial_update
      return unless prepare_reconciliation(@entry.account, existing_entry: @entry)

      result = @entry.account.update_reconciliation(@entry, **@reconciliation_params)
      return render_errors([ result.error_message ]) unless result.success?
    elsif !entry_params.key?(:notes)
      return render_errors([ t("valuations.errors.invalid_entry") ])
    end

    # Presence of the key, rather than its value, permits clearing notes.
    @entry.update!(notes: entry_params[:notes]) if entry_params.key?(:notes)
    render_success(@entry, notice: t("valuations.update.entry_updated"))
  end

  def destroy
    return unless require_valuation_permission!(@entry.account)

    @entry.destroy!
    @entry.sync_account_later
    respond_to do |format|
      format.json { head :no_content }
      format.html { redirect_back_or_to account_path(@entry.account), notice: t("account.entries.destroy.success") }
      format.turbo_stream { stream_redirect_back_or_to(account_path(@entry.account), notice: t("account.entries.destroy.success")) }
    end
  end

  private
    def set_entry
      @entry = Current.accessible_entries.valuations.find(params[:id])
    end

    def entry_params
      @entry_params ||= params.require(:entry).permit(:date, :amount, :notes)
    end

    def require_valuation_permission!(account, level = :write)
      return require_account_permission!(account, level) unless request.format.json?

      permissions = account_permissions(account)
      return true if permissions.fetch(level == :annotate ? :can_annotate : :can_edit)

      render_errors([ t("accounts.not_authorized") ], status: :forbidden)
      false
    end

    def prepare_reconciliation(account, existing_entry: nil)
      amount = entry_params[:amount]
      if amount.blank?
        render_errors([ t("valuations.errors.amount_required") ])
        return false
      end

      begin
        balance = BigDecimal(amount.to_s)
        raise ArgumentError unless balance.finite?
      rescue ArgumentError, TypeError
        render_errors([ t("valuations.errors.amount_invalid") ])
        return false
      end

      begin
        date = Date.iso8601(entry_params[:date].to_s)
      rescue Date::Error
        render_errors([ t("valuations.errors.date_invalid") ])
        return false
      end

      unless date > Entry.min_supported_date && date <= Date.current
        render_errors([ t("valuations.errors.date_out_of_range",
          min: I18n.l(Entry.min_supported_date.next_day), max: I18n.l(Date.current)) ])
        return false
      end

      candidate = existing_entry || account.entries.valuations.find_by(date: date) || account.entries.build(
        name: Valuation.build_reconciliation_name(account.accountable_type), entryable: Valuation.new
      )
      original_attributes = candidate.attributes.slice("date", "amount", "currency")
      candidate.assign_attributes(date: date, amount: balance, currency: account.currency)
      valid = candidate.valid?
      errors = candidate.errors.full_messages
      # The manager needs the original date to resolve the pre-update balance.
      candidate.assign_attributes(original_attributes)
      unless valid
        render_errors(errors)
        return false
      end

      @reconciliation_params = { balance: balance, date: date }
      true
    end

    def render_confirmation(account, result, is_update:)
      return render_errors([ result.error_message ]) unless result.success?

      render json: { confirmation: Valuation::PageData.confirmation(
        account: account, date: @reconciliation_params[:date], result: result, is_update: is_update
      ) }
    end

    def render_success(entry, notice:, status: :ok)
      respond_to do |format|
        format.json { render json: { entry_id: entry.id, account_id: entry.account_id }, status: status }
        format.html { redirect_back_or_to account_path(entry.account), notice: notice }
        format.turbo_stream { stream_redirect_back_or_to(account_path(entry.account), notice: notice) }
      end
    end

    def render_errors(errors, status: :unprocessable_entity)
      render json: { errors: errors }, status: status
    end
end
