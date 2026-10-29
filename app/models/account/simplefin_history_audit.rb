require "digest"

class Account::SimplefinHistoryAudit
  # Stay within the bridge's recommended date range. One provider request per
  # page, without a total-history cap or empty-window stopping rule.
  MAX_PERIOD_DAYS = 45
  FIRST_DATE = Date.new(1970, 1, 1)
  STATUSES = %w[recorded intentionally_deleted possible_match missing pending invalid identity_conflict].freeze

  class Error < StandardError
    attr_reader :code, :status

    def initialize(message, code: "invalid_parameters", status: :unprocessable_entity)
      @code, @status = code, status
      super(message)
    end
  end

  def initialize(account:, user:)
    @account, @user = account, user
  end

  def metadata
    authorize!
    {
      account: account.slice(:id, :name, :currency),
      default_period_days: MAX_PERIOD_DAYS,
      max_period_days: MAX_PERIOD_DAYS,
      text: I18n.t("accounts.simplefin_history_audit")
    }
  end

  def call(period_days: nil, cursor: nil)
    authorize!
    load_providers!
    load_page!(period_days, cursor)
    payload = fetch_page
    feeds, transactions, warnings = compare(payload)
    page_complete = warnings.empty?
    unless page_complete
      capture_diagnostic("partial_response", warning_codes: warnings.map { |warning| warning[:code] }.uniq,
        provider_errors: sanitized_provider_errors(payload))
    end

    {
      account_id: account.id, read_only: true,
      coverage: {
        period_days: @period_days, has_more_connections: @item_id != @groups.keys.last,
        window_start_date: @window_start.iso8601, window_end_date: @window_end.iso8601,
        simplefin_item_id: @item_id, page_complete: page_complete,
        provider_history_complete: false
      },
      feeds: feeds, transactions: transactions,
      summary: STATUSES.index_with { |status| transactions.count { |transaction| transaction[:status] == status } },
      warnings: warnings,
      next_cursor: next_cursor,
      retry_cursor: page_complete ? nil : page_cursor(@item_id, @window_end)
    }
  end

  def import!(decisions:)
    authorize!
    decisions = normalize_decisions(decisions)
    imported_dates = []
    result = Account.transaction do
      # Match ingestion/replacement lock order, but do not skip retired feeds.
      Family.where(id: account.family_id).lock.pick(:id)
      Account.where(id: account.id).lock.pick(:id)
      account.reload
      user.reload
      authorize!
      load_import_providers!
      reviewed = decisions.map { |decision| [ verify_import_token(decision[:token]), decision[:entry_id] ] }
      identities = reviewed.map { |payload, _| [ payload.fetch("simplefin_account_id"), payload.fetch("external_id") ] }
      if identities.uniq.size != identities.size
        raise Error.new("Send each provider transaction only once", code: "invalid_decisions")
      end
      transactions = reviewed.map do |payload, entry_id|
        apply_decision!(payload, entry_id, imported_dates)
      end
      { transactions: transactions }
    end
    account.sync_later(window_start_date: imported_dates.min) if imported_dates.any?
    result
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique, ArgumentError => error
    capture_diagnostic("import_failed", error_class: error.class.name)
    raise Error.new("Unable to import the reviewed transactions; refresh the audit and try again", code: "import_conflict", status: :conflict)
  end

  private
    attr_reader :account, :user, :providers

    def authorize!
      unless user&.admin? && user.family_id == account.family_id && account.family.accounts.writable_by(user).exists?(id: account.id)
        raise Error.new("Administrator and account write permission required", code: "forbidden", status: :forbidden)
      end
    end

    def load_providers!
      ids = account.account_providers.where(provider_type: "SimplefinAccount").pluck(:provider_id)
      ids << account.simplefin_account_id if account.simplefin_account_id
      scope = SimplefinAccount.unscoped.joins(:simplefin_item)
        .where(simplefin_items: { family_id: account.family_id, scheduled_for_deletion: false })
      @providers = scope.where(id: ids).or(scope.where(retired_account_id: account.id))
        .includes(:simplefin_item, :account, :linked_account, :account_provider).order(:simplefin_item_id, :id).to_a
      raise Error.new("This account has no available SimpleFIN feeds", code: "simplefin_unavailable") if providers.empty?
      if providers.any? { |provider| provider.account_id.blank? }
        raise Error.new("A SimpleFIN feed has no upstream account ID", code: "simplefin_unavailable")
      end
      if providers.any? { |provider| [ provider.account, provider.linked_account ].compact.any? { |linked| linked.id != account.id } }
        raise Error.new("SimpleFIN mappings changed; resolve the conflicting account links first", code: "mapping_conflict", status: :conflict)
      end
      @groups = providers.group_by(&:simplefin_item_id)
      state = providers.map do |provider|
        [ provider.id, provider.simplefin_item_id, provider.account_id, provider.retired_at, provider.retired_account_id,
          provider.account&.id, provider.linked_account&.id, provider.account_type, provider.currency ]
      end
      @fingerprint = Digest::SHA256.hexdigest([ account.currency, account.accountable_type, state ].to_json)
    end

    def load_page!(period_days, cursor)
      if cursor
        raise Error, "Send either cursor or period_days, not both" unless period_days.nil?
        raise Error, "cursor must be a string" unless cursor.is_a?(String)
        page = verifier.verify(cursor, purpose: cursor_purpose)
        unless page.key?("period_days")
          raise Error.new("Audit period format changed; restart the audit", code: "stale_cursor", status: :conflict)
        end
        unless page.fetch("fingerprint") == @fingerprint
          raise Error.new("SimpleFIN feeds changed; restart the audit", code: "stale_cursor", status: :conflict)
        end
        @period_days = parse_period_days(page.fetch("period_days"))
        @window_end = Date.iso8601(page.fetch("window_end"))
        @item_id = page.fetch("item_id")
      else
        @period_days = parse_period_days(period_days.nil? ? MAX_PERIOD_DAYS : period_days)
        @window_end = Date.current
        @item_id = @groups.keys.first
      end
      unless @window_end.between?(FIRST_DATE, Date.current) && @groups.key?(@item_id)
        raise Error, "Invalid audit cursor"
      end
      @window_start = [ FIRST_DATE, @window_end - (@period_days - 1) ].max
    rescue ActiveSupport::MessageVerifier::InvalidSignature, KeyError, TypeError, Date::Error
      raise Error, "Invalid audit cursor"
    end

    def parse_period_days(value)
      unless value.is_a?(Integer) && value.between?(1, MAX_PERIOD_DAYS)
        raise Error, "period_days must be a whole number between 1 and #{MAX_PERIOD_DAYS}"
      end
      value
    end

    def normalize_decisions(decisions)
      unless decisions.is_a?(Array) && decisions.any?
        raise Error.new("decisions must be a nonempty array", code: "invalid_decisions")
      end
      decisions.map do |decision|
        unless decision.is_a?(Hash)
          raise Error.new("Each decision must contain a token and an explicit entry_id", code: "invalid_decisions")
        end
        decision = decision.to_h.with_indifferent_access
        unless decision[:token].is_a?(String) && decision[:token].present? && decision.key?(:entry_id) &&
            (decision[:entry_id].nil? || UuidFormat.valid?(decision[:entry_id]))
          raise Error.new("Each decision needs a token and entry_id (null imports a separate transaction)", code: "invalid_decisions")
        end
        { token: decision[:token], entry_id: decision[:entry_id]&.downcase }
      end
    end

    def load_import_providers!
      load_providers!
    rescue Error => error
      raise unless error.code == "simplefin_unavailable"
      raise Error.new("SimpleFIN feeds changed; restart the audit", code: "stale_import", status: :conflict)
    end

    def verify_import_token(token)
      payload = verifier.verify(token, purpose: import_purpose)
      unless payload.fetch("fingerprint") == @fingerprint &&
          providers.any? { |provider| provider.id == payload.fetch("simplefin_account_id") }
        raise Error.new("SimpleFIN feeds changed; restart the audit", code: "stale_import", status: :conflict)
      end
      payload
    rescue ActiveSupport::MessageVerifier::InvalidSignature, KeyError, TypeError
      raise Error.new("The import token is invalid or expired; restart the audit", code: "invalid_import_token")
    end

    def apply_decision!(payload, entry_id, imported_dates)
      provider = providers.find { |feed| feed.id == payload.fetch("simplefin_account_id") }
      external_id = payload.fetch("external_id")
      identity = SimplefinTransactionIdentity.find_by(simplefin_account: provider, external_id: external_id)
      if identity
        entry = identity.entry
        unless entry && entry.account_id == account.id && entry.transaction? &&
            identity.duplicate? == entry_id.present? && (entry_id.nil? || entry.id == entry_id)
          raise Error.new("This provider transaction was deleted or reviewed differently", code: "import_conflict", status: :conflict)
        end
        reviewed_candidate!(payload, entry_id) if entry_id
      elsif entry_id
        entry = reviewed_candidate!(payload, entry_id)
        SimplefinTransactionIdentity.create!(simplefin_account: provider, external_id: external_id, entry: entry, duplicate: true)
      else
        # A legacy single-feed sync may have recorded the row after review.
        entry = providers.one? && account.entries.find_by(source: "simplefin", external_id: external_id)
        if entry && !entry.transaction?
          raise Error.new("This provider identity conflicts with another entry", code: "import_conflict", status: :conflict)
        end
        unless entry
          attrs = payload.fetch("attributes").symbolize_keys
          attrs[:amount] = BigDecimal(attrs.fetch(:amount))
          attrs[:date] = Date.iso8601(attrs.fetch(:date))
          # Always scope new ledger IDs, even when no collision exists yet.
          import_id = "simplefin_#{provider.id}_#{Digest::SHA256.hexdigest(external_id)}"
          if account.entries.exists?(source: "simplefin", external_id: import_id)
            raise Error.new("The imported entry lost its provider identity; review it again", code: "import_conflict", status: :conflict)
          end
          entry = Account::ProviderImportAdapter.new(account).import_transaction(**attrs, external_id: import_id,
            source: "simplefin", allow_heuristic_matching: false, notification_activity: false)
          imported_dates << entry.date
        end
        SimplefinTransactionIdentity.create!(simplefin_account: provider, external_id: external_id, entry: entry)
      end
      { simplefin_account_id: provider.id, provider_transaction_id: payload.fetch("provider_transaction_id"),
        entry_id: entry.id, transaction_id: entry.entryable_id }
    end

    def reviewed_candidate!(payload, entry_id)
      attrs = payload.fetch("attributes")
      entry = account.entries.lock.find_by(id: entry_id, entryable_type: "Transaction")
      unless payload.fetch("candidate_entry_ids").include?(entry_id) && entry &&
          entry.amount == BigDecimal(attrs.fetch("amount")) && entry.currency == attrs.fetch("currency") && entry.date &&
          (entry.date - Date.iso8601(attrs.fetch("date"))).abs <= 4 && entry.transaction && !entry.transaction.pending?
        raise Error.new("The selected transaction changed or was not a reviewed candidate; restart the audit", code: "stale_import", status: :conflict)
      end
      entry
    end

    def fetch_page
      group = @groups.fetch(@item_id)
      item = group.first.simplefin_item
      item.simplefin_provider.get_accounts(item.access_url,
        account_ids: group.map(&:account_id), pending: false,
        start_date: utc_midnight(@window_start), end_date: utc_midnight(@window_end + 1))
    rescue Provider::Simplefin::SimplefinError => error
      capture_diagnostic(error.error_type.to_s)
      limited = error.error_type == :rate_limited
      raise Error.new(limited ? "SimpleFIN rate limit reached; retry this page later" : "Unable to fetch SimpleFIN history; retry this page later",
        code: limited ? "provider_rate_limited" : "provider_error", status: limited ? :too_many_requests : :bad_gateway)
    rescue JSON::ParserError
      capture_diagnostic("invalid_response")
      raise Error.new("SimpleFIN returned an invalid account response", code: "provider_error", status: :bad_gateway)
    end

    def utc_midnight(date)
      Time.utc(date.year, date.month, date.day)
    end

    def compare(payload)
      unless payload.is_a?(Hash) && payload[:accounts].is_a?(Array) && payload[:accounts].all? { |feed| feed.is_a?(Hash) }
        capture_diagnostic("invalid_response")
        raise Error.new("SimpleFIN returned an invalid account response", code: "provider_error", status: :bad_gateway)
      end
      returned = payload[:accounts].map(&:with_indifferent_access).group_by { |feed| feed[:id] }
      warnings = []
      if payload[:errors].present? || payload[:errlist].present?
        warnings << { code: "provider_errors", message: "SimpleFIN reported errors; this page may be incomplete" }
      end
      transactions = []
      feeds = @groups.fetch(@item_id).map do |provider|
        snapshots = returned.fetch(provider.account_id, [])
        rows = snapshots.one? && snapshots.first[:transactions]
        complete = rows.is_a?(Array)
        unless complete
          warnings << { code: "feed_unavailable", simplefin_account_id: provider.id,
            message: "SimpleFIN did not return an unambiguous transaction list for this feed" }
        end
        if complete
          transactions.concat(compare_transactions(provider, rows))
        end
        { simplefin_account_id: provider.id, provider_account_id: provider.account_id, name: provider.name,
          retired: provider.retired_at?, returned: complete, transaction_count: complete ? rows.size : 0 }
      end
      if transactions.any? { |transaction| %w[invalid identity_conflict].include?(transaction[:status]) }
        warnings << { code: "unresolved_transactions", message: "Some transactions could not be compared safely" }
      end
      transactions.sort_by! { |transaction| [ transaction[:date].to_s, transaction[:simplefin_account_id], transaction[:provider_transaction_id].to_s ] }
      [ feeds, transactions.reverse, warnings ]
    end

    def compare_transactions(provider, rows)
      external_ids = rows.filter_map { |row| "simplefin_#{row.with_indifferent_access[:id]}" if row.is_a?(Hash) }
      identities = SimplefinTransactionIdentity.where(simplefin_account: provider, external_id: external_ids).includes(:entry).index_by(&:external_id)
      legacy = if providers.one?
        account.entries.where(entryable_type: "Transaction", source: "simplefin", external_id: external_ids).index_by(&:external_id)
      else
        {}
      end
      normalized = rows.map { |row| normalize(provider, row) }
      dates = normalized.filter_map { |transaction| transaction[:date] && Date.iso8601(transaction[:date]) }
      candidates = if dates.any?
        account.entries.where(entryable_type: "Transaction", date: (dates.min - 4)..(dates.max + 4))
          .includes(:entryable).reject { |entry| entry.transaction.pending? }.group_by { |entry| [ entry.amount, entry.currency ] }
      else
        {}
      end
      seen = {}
      result = []
      normalized.each_with_index do |transaction, index|
        id = transaction[:provider_transaction_id]
        if id && seen.key?(id)
          if seen[id].first != rows[index]
            seen[id].last.merge!(status: "invalid", possible_matches: [], entry_id: nil, transaction_id: nil)
          end
          next
        end
        seen[id] = [ rows[index], transaction ] if id
        result << transaction
        next if transaction[:status] == "invalid"

        identity = identities[transaction[:external_id]]
        entry = identity ? identity.entry : legacy[transaction[:external_id]]
        if identity && entry.nil?
          transaction[:status] = "intentionally_deleted"
        elsif entry
          if entry.account_id == account.id && entry.entryable_type == "Transaction"
            transaction[:status] = "recorded"
            transaction[:entry_id] = entry.id
            transaction[:transaction_id] = entry.entryable_id
          else
            transaction[:status] = "identity_conflict"
          end
        elsif transaction.delete(:pending)
          transaction[:status] = "pending"
        else
          matches = candidates.fetch([ transaction[:amount].to_d, transaction[:currency] ], [])
            .select { |candidate| (candidate.date - Date.iso8601(transaction[:date])).abs <= 4 }
            .sort_by { |candidate| [ (candidate.date - Date.iso8601(transaction[:date])).abs, candidate.date, candidate.id ] }
          transaction[:possible_matches] = matches.map { |candidate| entry_summary(candidate) }
          transaction[:status] = matches.any? ? "possible_match" : "missing"
        end
        transaction.delete(:pending)
      end
      # Conflicting duplicate rows can change an earlier result to invalid.
      # Issue tokens only after every row's final comparison status is known.
      result.each do |transaction|
        attrs = transaction.delete(:import_attributes)
        transaction[:import_token] = if %w[missing possible_match].include?(transaction[:status])
          verifier.generate({ "fingerprint" => @fingerprint, "simplefin_account_id" => provider.id,
            "provider_transaction_id" => transaction[:provider_transaction_id], "external_id" => transaction[:external_id],
            "candidate_entry_ids" => transaction[:possible_matches].map { |candidate| candidate[:entry_id] },
            "attributes" => attrs.merge(amount: attrs[:amount].to_s("F"), date: attrs[:date].iso8601).deep_stringify_keys },
            purpose: import_purpose, expires_in: 1.hour)
        end
      end
      result
    end

    def normalize(provider, raw)
      transaction = { simplefin_account_id: provider.id, provider_transaction_id: nil, external_id: nil,
        date: nil, name: nil, amount: nil, currency: nil, entry_id: nil, transaction_id: nil, possible_matches: [], status: "invalid" }
      return transaction unless raw.is_a?(Hash)
      raw = raw.with_indifferent_access
      return transaction unless raw[:id].is_a?(String) && raw[:id].present?
      transaction[:provider_transaction_id] = raw[:id]
      transaction[:external_id] = "simplefin_#{raw[:id]}"
      return transaction unless (raw[:amount].is_a?(String) || raw[:amount].is_a?(Numeric)) && BigDecimal(raw[:amount].to_s).finite?
      attrs = SimplefinEntry::Processor.new(raw, simplefin_account: provider, normalization_account: account).import_attributes
      transaction.merge(date: attrs[:date].iso8601, name: attrs[:name], amount: attrs[:amount].to_s("F"), currency: attrs[:currency],
        pending: SimplefinEntry::Processor.pending?(raw), import_attributes: attrs, status: nil)
    rescue ArgumentError, TypeError
      transaction
    end

    def entry_summary(entry)
      { entry_id: entry.id, transaction_id: entry.entryable_id, name: entry.name, date: entry.date.iso8601,
        amount: entry.amount.to_s("F"), currency: entry.currency, source: entry.source, parent_entry_id: entry.parent_entry_id }
    end

    def next_cursor
      item_ids = @groups.keys
      next_item = item_ids[item_ids.index(@item_id) + 1]
      if next_item
        page_cursor(next_item, @window_end)
      elsif @window_start > FIRST_DATE
        page_cursor(item_ids.first, @window_start - 1)
      end
    end

    def page_cursor(item_id, window_end)
      verifier.generate({ "period_days" => @period_days, "window_end" => window_end.iso8601,
        "item_id" => item_id, "fingerprint" => @fingerprint }, purpose: cursor_purpose)
    end

    def verifier
      Rails.application.message_verifier("simplefin-history-audit")
    end

    def cursor_purpose
      "simplefin-history-audit/#{account.family_id}/#{account.id}"
    end

    def import_purpose
      "simplefin-history-audit-import/#{account.family_id}/#{account.id}"
    end

    # Keep explanations, not arbitrary provider payloads. SimpleFIN v1 uses
    # string errors; v2 errlist adds codes and connection/account identifiers.
    def sanitized_provider_errors(payload)
      access_url = @groups.fetch(@item_id).first.simplefin_item.access_url
      uri = URI.parse(access_url)
      secrets = [ access_url, uri.user, uri.password ].compact.flat_map do |value|
        [ value, URI::DEFAULT_PARSER.unescape(value) ]
      end
      if uri.userinfo
        secrets.concat([ uri.userinfo, URI::DEFAULT_PARSER.unescape(uri.userinfo) ].map { |value| Base64.strict_encode64(value) })
      end
      secret_pattern = Regexp.union(secrets.reject(&:empty?).sort_by { |value| -value.length })

      %i[errors errlist].each_with_object({}) do |field, details|
        next if payload[field].blank?

        details[field] = Array.wrap(payload[field]).first(20).filter_map do |error|
          if error.is_a?(String)
            sanitized_error_text(error, secret_pattern)
          elsif error.is_a?(Hash)
            error.slice(:code, :msg, :message, :description, :error, :conn_id, :account_id)
              .each_with_object({}) do |(key, value), fields|
                fields[key] = sanitized_error_text(value, secret_pattern) if value.is_a?(String)
              end
          end
        end
      end
    end

    def sanitized_error_text(value, secret_pattern)
      value.gsub(secret_pattern, "[FILTERED]")
        .gsub(%r{https?://[^\s<>"']+}i, "[FILTERED]")
        .gsub(/\b(?:Basic|Bearer)\s+[A-Za-z0-9+\/=_\-.]+/i, "[FILTERED]")
        .gsub(/\b(?:(?:[a-z0-9]+[_-])*(?:password|token|secret|key)|access[_-]?url)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/i, "[FILTERED]")
        .first(1_000)
    end

    def capture_diagnostic(code, **metadata)
      DebugLogEntry.capture(category: "simplefin_history_audit", level: "warn", source: self.class.name, provider_key: "simplefin",
        family: account.family, account: account, user: user,
        account_provider: @groups&.dig(@item_id)&.first&.account_provider,
        message: "SimpleFIN history audit could not establish complete page coverage",
        metadata: metadata.merge(code: code, simplefin_item_id: @item_id, window_start_date: @window_start&.iso8601, window_end_date: @window_end&.iso8601))
    end
end
