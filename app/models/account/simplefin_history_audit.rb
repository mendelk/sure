require "digest"

class Account::SimplefinHistoryAudit
  # Match the importer's conservative request window, without its total-history
  # cap or empty-window stopping rule. One provider request per API page.
  WINDOW_DAYS = 60
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

  def call(start_date: nil, end_date: nil, cursor: nil)
    authorize!
    load_providers!
    load_page!(start_date, end_date, cursor)
    payload = fetch_page
    feeds, transactions, warnings = compare(payload)
    page_complete = warnings.empty?
    unless page_complete
      capture_diagnostic("partial_response", warning_codes: warnings.map { |warning| warning[:code] }.uniq)
    end

    {
      account_id: account.id, read_only: true,
      coverage: {
        requested_start_date: @start_date.iso8601, requested_end_date: @end_date.iso8601,
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
      @fingerprint = Digest::SHA256.hexdigest(providers.map { |provider| [ provider.id, provider.simplefin_item_id, provider.account_id, provider.retired_at ] }.to_json)
    end

    def load_page!(start_date, end_date, cursor)
      if cursor
        raise Error, "Send either cursor or date parameters, not both" unless start_date.nil? && end_date.nil?
        raise Error, "cursor must be a string" unless cursor.is_a?(String)
        page = verifier.verify(cursor, purpose: cursor_purpose)
        unless page.fetch("fingerprint") == @fingerprint
          raise Error.new("SimpleFIN feeds changed; restart the audit", code: "stale_cursor", status: :conflict)
        end
        @start_date = parse_date(page.fetch("start_date"))
        @end_date = parse_date(page.fetch("end_date"))
        @window_end = parse_date(page.fetch("window_end"))
        @item_id = page.fetch("item_id")
      else
        @start_date = start_date.nil? ? FIRST_DATE : parse_date(start_date)
        @end_date = end_date.nil? ? Date.current : parse_date(end_date)
        @window_end = @end_date
        @item_id = @groups.keys.first
      end
      unless @start_date >= FIRST_DATE && @start_date <= @end_date && @end_date <= Date.current &&
          @window_end.between?(@start_date, @end_date) && @groups.key?(@item_id)
        raise Error, "Dates must be between 1970-01-01 and today, with start_date on or before end_date"
      end
      @window_start = [ @start_date, @window_end - (WINDOW_DAYS - 1) ].max
    rescue ActiveSupport::MessageVerifier::InvalidSignature, KeyError, TypeError
      raise Error, "Invalid audit cursor"
    end

    def parse_date(value)
      raise Error, "Dates must use YYYY-MM-DD" unless value.is_a?(String) && value.match?(/\A\d{4}-\d{2}-\d{2}\z/)
      Date.iso8601(value)
    rescue Date::Error
      raise Error, "Invalid date"
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
        pending: SimplefinEntry::Processor.pending?(raw), status: nil)
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
      elsif @window_start > @start_date
        page_cursor(item_ids.first, @window_start - 1)
      end
    end

    def page_cursor(item_id, window_end)
      verifier.generate({ "start_date" => @start_date.iso8601, "end_date" => @end_date.iso8601,
        "window_end" => window_end.iso8601, "item_id" => item_id, "fingerprint" => @fingerprint }, purpose: cursor_purpose)
    end

    def verifier
      Rails.application.message_verifier("simplefin-history-audit")
    end

    def cursor_purpose
      "simplefin-history-audit/#{account.family_id}/#{account.id}"
    end

    def capture_diagnostic(code, **metadata)
      DebugLogEntry.capture(category: "simplefin_history_audit", level: "warn", source: self.class.name, provider_key: "simplefin",
        family: account.family, account: account, user: user,
        account_provider: @groups&.dig(@item_id)&.first&.account_provider,
        message: "SimpleFIN history audit could not establish complete page coverage",
        metadata: metadata.merge(code: code, simplefin_item_id: @item_id, window_start_date: @window_start&.iso8601, window_end_date: @window_end&.iso8601))
    end
end
