# frozen_string_literal: true

class Api::V1::AccountStatementsController < Api::V1::BaseController
  include ActiveStorage::Streaming

  before_action -> { authorize_scope!(:read) }, only: %i[index show coverage download]
  before_action -> { authorize_scope!(:write) }, only: %i[create update destroy link unlink reject]
  before_action :ensure_statement_manager!, except: %i[show download]
  before_action :set_statement, only: %i[show update destroy link unlink reject download]
  before_action :ensure_manageable!, only: %i[update destroy link unlink reject]

  rescue_from ActiveRecord::RecordInvalid, with: :render_invalid_record

  def index
    scope = visible_statements.ordered
    if params[:account_id].present?
      account = accessible_account(params[:account_id])
      scope = scope.where(account: account)
    end
    page, statements = pagy(scope, limit: safe_per_page)
    payload = { account_statements: statements.map { |statement| statement_payload(statement) }, pagination: pagination_payload(page) }
    payload[:workspace] = index_workspace if workspace_requested?
    render json: payload
  end

  def show
    payload = { account_statement: statement_payload(@statement) }
    payload[:workspace] = detail_workspace if workspace_requested?
    render json: payload
  end

  def create
    upload = params.fetch(:account_statement, ActionController::Parameters.new).permit(:account_id, files: [])
    account = accessible_account(upload[:account_id]) if upload[:account_id].present?
    return unless account.nil? || writable_account!(account)

    files = Array(upload[:files]).reject(&:blank?).select { |file| file.respond_to?(:read) }
    return validation_error(t("account_statements.create.no_files")) if files.empty?

    result = AccountStatement::UploadBatch.call(family: Current.family, account: account, files: files)
    visible_duplicates, unavailable_files = result.duplicates.partition { |statement| statement.viewable_by?(Current.user) }
    errors = result.validation_errors + unavailable_files.map { "Statement file is unavailable." }
    payload = {
      account_statements: result.created.map { |statement| statement_payload(statement) },
      duplicates: visible_duplicates.map { |statement| statement_payload(statement) },
      duplicate_count: visible_duplicates.size,
      errors: errors
    }
    if result.created.empty? && visible_duplicates.empty?
      payload.merge!(error: "validation_failed", message: errors.to_sentence)
      render json: payload, status: :unprocessable_entity
    else
      render json: payload, status: result.created.any? ? :created : :ok
    end
  end

  def update
    attrs = params.require(:account_statement).permit(
      :account_id, :institution_name_hint, :account_name_hint, :account_last4_hint,
      :period_start_on, :period_end_on, :opening_balance, :closing_balance, :currency
    ).to_h
    %w[period_start_on period_end_on].each do |key|
      value = attrs[key]
      next if value.blank?
      unless value.is_a?(String) && value.match?(/\A\d{4}-\d{2}-\d{2}\z/)
        return validation_error("#{key} must be a valid ISO 8601 date")
      end
      Date.iso8601(value)
    end
    if attrs.key?("account_id")
      account_id = attrs.delete("account_id")
      target = accessible_account(account_id) if account_id.present?
      return unless target.nil? || writable_account!(target)
      attrs[:account] = target
    end
    @statement.assign_attributes(attrs)
    @statement.assign_account_match if @statement.account.nil? && !@statement.rejected?
    @statement.save!
    render json: { account_statement: statement_payload(@statement) }
  rescue Date::Error, ArgumentError
    validation_error("Statement dates must be valid ISO 8601 dates")
  end

  def link
    account_id = params[:account_id].presence || @statement.suggested_account_id
    return validation_error(t("account_statements.link.no_account")) if account_id.blank?

    account = accessible_account(account_id)
    return unless writable_account!(account)

    @statement.link_to_account!(account)
    render json: { account_statement: statement_payload(@statement) }
  end

  def unlink
    @statement.unlink!
    render json: { account_statement: statement_payload(@statement) }
  end

  def reject
    @statement.reject_match!
    render json: { account_statement: statement_payload(@statement) }
  end

  def destroy
    if @statement.destroy
      head :no_content
    else
      validation_error(@statement.errors.full_messages.to_sentence)
    end
  end

  def coverage
    account = accessible_account(params[:account_id])
    if params[:year].present? && !params[:year].to_s.match?(/\A\d{4}\z/)
      return validation_error("year must be a four-digit calendar year")
    end
    coverage = AccountStatement::Coverage.for_year(account, params[:year])
    statuses = AccountStatement.reconciliation_statuses_for(coverage.months.flat_map(&:statements).uniq, account: account)
    render json: {
      account_id: account.id, year: coverage.selected_year, available_years: coverage.available_years,
      summary: coverage.summary_counts,
      months: coverage.months.map do |month|
        reconciliation = month.statements.map { |statement| statuses.fetch(statement.id) }
        {
          month: month.date.strftime("%Y-%m"), status: month.status,
          reconciliation_status: reconciliation.empty? ? nil : (reconciliation.include?("mismatched") ? "mismatched" : (reconciliation.include?("unavailable") ? "unavailable" : "matched")),
          statement_ids: month.statements.map(&:id), unconfirmed_statement_ids: month.ambiguous_statements.map(&:id)
        }
      end
    }
  end

  def download
    raise ActiveRecord::RecordNotFound unless @statement.original_file.attached?

    send_blob_stream(@statement.original_file.blob, disposition: "attachment")
  end

  private
    def visible_statements
      scope = Current.family.account_statements.with_attached_original_file.includes(:account, :suggested_account)
      scope.where(account_id: nil).or(scope.where(account_id: Current.user.accessible_accounts.select(:id)))
    end

    def accessible_account(id)
      raise ActiveRecord::RecordNotFound unless self.class.valid_uuid?(id)

      Current.user.accessible_accounts.find(id)
    end

    def set_statement
      raise ActiveRecord::RecordNotFound unless self.class.valid_uuid?(params[:id])

      @statement = Current.family.account_statements.with_attached_original_file.includes(:account, :suggested_account).find(params[:id])
      raise ActiveRecord::RecordNotFound unless @statement.viewable_by?(Current.user)
    end

    def ensure_statement_manager!
      forbidden unless AccountStatement.statement_manager?(Current.user)
    end

    def ensure_manageable!
      forbidden unless @statement.manageable_by?(Current.user)
    end

    def writable_account!(account)
      return true if account.permission_for(Current.user).in?([ :owner, :full_control ])

      forbidden
      false
    end

    def forbidden
      render json: { error: "forbidden", message: t("accounts.not_authorized") }, status: :forbidden
    end

    def validation_error(message)
      render json: { error: "validation_failed", message: message }, status: :unprocessable_entity
    end

    def render_invalid_record(error)
      validation_error(error.record.errors.full_messages.to_sentence)
    end

    def workspace_requested?
      params[:include].to_s.split(",").include?("workspace")
    end

    def pagination_payload(page)
      { page: page.page, per_page: page.limit, total_count: page.count, total_pages: page.pages }
    end

    def index_workspace
      scope = visible_statements.ordered
      unmatched_page, unmatched = pagy(scope.unmatched, limit: safe_per_page, page_param: :unmatched_page)
      linked_page, linked = pagy(scope.with_account, limit: safe_per_page, page_param: :linked_page)
      Account::SpaIndexData.new(item_specs: [], groups: [], family: Current.family, user: Current.user).statements_index_payload(
        unmatched: unmatched, unmatched_pagy: unmatched_page, linked: linked, linked_pagy: linked_page,
        accounts: Current.user.accessible_accounts.visible.alphabetically, total_storage_bytes: visible_statements.sum(:byte_size)
      )
    end

    def detail_workspace
      Account::SpaIndexData.for_statement(@statement, accounts: Current.user.accessible_accounts.visible.alphabetically)
        .statement_show_payload(can_manage: @statement.manageable_by?(Current.user), reconciliation_checks: @statement.reconciliation_checks)
    end

    def statement_payload(statement)
      suggestion = statement.suggested_account
      suggestion = nil unless suggestion&.shared_with?(Current.user)
      {
        id: statement.id, filename: statement.filename, content_type: statement.content_type, byte_size: statement.byte_size,
        source: statement.source, upload_status: statement.upload_status, review_status: statement.review_status,
        account_id: statement.account_id, suggested_account_id: suggestion&.id,
        match_confidence: suggestion ? statement.match_confidence : nil,
        institution_name_hint: statement.institution_name_hint, account_name_hint: statement.account_name_hint,
        account_last4_hint: statement.account_last4_hint, period_start_on: statement.period_start_on,
        period_end_on: statement.period_end_on, opening_balance: statement.opening_balance,
        closing_balance: statement.closing_balance, currency: statement.statement_currency,
        can_manage: statement.manageable_by?(Current.user), reconciliation_status: statement.reconciliation_status,
        reconciliation_checks: statement.reconciliation_checks,
        download_url: statement.original_file.attached? ? download_api_v1_account_statement_path(statement) : nil,
        created_at: statement.created_at
      }
    end
end
