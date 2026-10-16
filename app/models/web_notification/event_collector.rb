# Periodic, read-only source scan. The small per-user snapshot is committed with
# publications under the user lock: an interrupted sweep can be retried safely.
class WebNotification::EventCollector
  STATE_KEY = "web_notification_event_state".freeze

  def initialize(user)
    @user = user
  end

  def call(now: Time.current)
    @user.with_lock do
      @preferences = WebNotification::Preferences.new(@user)
      return unless @user.active? && @user.preview_features_enabled? && @preferences.enabled? && @preferences.enabled_at

      @now = now
      @timezone = @preferences.timezone
      @today = now.in_time_zone(@timezone).to_date
      @accounts = @user.family.accounts.where(status: "active").accessible_by(@user)
      @accounts = @accounts.where(id: @preferences.account_ids) if @preferences.account_ids.any?
      @account_ids = @accounts.pluck(:id)
      previous = @user.preferences.fetch(STATE_KEY, {})
      @state = previous["enabled_at"] == @preferences.enabled_at.iso8601(6) ? previous.deep_dup : {}
      @initial_scan = @state.empty?
      @state["enabled_at"] = @preferences.enabled_at.iso8601(6)
      baseline_accounts
      collect_occurrences unless @user.family.recurring_transactions_disabled?
      collect_bank_attention
      collect_budgets
      @user.update!(preferences: @user.preferences.merge(STATE_KEY => @state)) if previous != @state
    end
  end

  private
    def baseline_accounts
      previous = @state.fetch("accounts", {})
      baseline = (@initial_scan ? @preferences.enabled_at : @now).iso8601(6)
      @state["accounts"] = @account_ids.index_with { |id| previous[id] || baseline }
      if @preferences.account_ids.empty?
        @state["unassigned_since"] ||= baseline
      else
        @state.delete("unassigned_since")
      end
    end

    def collect_occurrences
      series_scope = @user.family.recurring_transactions.payable
      series_scope = series_scope.where(account_id: @account_ids + [ nil ])
                                 .where(destination_account_id: @account_ids + [ nil ])
      occurrences = @user.family.recurring_occurrences.open_status
                         .joins(:recurring_transaction).merge(series_scope)
                         .includes(recurring_transaction: [ :account, :destination_account ])
                         .to_a
      sums = RecurringAllocation.confirmed.where(recurring_occurrence_id: occurrences.map(&:id))
                                .group(:recurring_occurrence_id).sum(:allocated_amount)
      occurrences.each do |occurrence|
        series = occurrence.recurring_transaction
        next if series.account_id.nil? && @preferences.account_ids.any?

        occurrence.cached_confirmed_allocated = sums.fetch(occurrence.id, 0.to_d)
        next unless occurrence.remaining_amount.positive?

        since = occurrence_baseline(series)
        if series.credit_card_payment? && occurrence.statement_end_on && occurrence.statement_end_on <= @today
          publish_occurrence("statement_ready", occurrence) if new_boundary?(occurrence.statement_end_on, since, occurrence)
        end

        due = occurrence.effective_due_on
        overdue_on = due + (series.overdue_grace_days || RecurringOccurrence::DEFAULT_GRACE_DAYS) + 1
        due_from = due - @preferences.bill_days_before
        if @today >= overdue_on
          publish_occurrence("payment_overdue", occurrence) if new_boundary?(overdue_on, since, occurrence)
        elsif @today >= due_from
          publish_occurrence("payment_due", occurrence) if new_boundary?(due_from, since, occurrence)
        end
      end
    end

    def occurrence_baseline(series)
      ids = [ series.account_id, series.destination_account_id ].compact
      timestamps = if ids.empty?
        [ @state.fetch("unassigned_since") ]
      else
        ids.map { |id| @state.fetch("accounts").fetch(id) }
      end
      timestamps.map { |timestamp| Time.iso8601(timestamp) }.push(@preferences.enabled_at).max
    end

    def new_boundary?(date, since, occurrence)
      return true if date.in_time_zone(@timezone) > since

      # Dates lack a time of day. A current-day obligation created or updated
      # after enrollment can become eligible after that day's midnight.
      date == since.in_time_zone(@timezone).to_date && occurrence.updated_at > since
    end

    def publish_occurrence(event_type, occurrence)
      publish(event_type, "#{event_type}:#{occurrence.id}", account: occurrence.recurring_transaction.account,
              data: { occurrence_id: occurrence.id, series_id: occurrence.recurring_transaction_id })
    end

    def collect_bank_attention
      previous = @state.fetch("providers", {})
      current = {}
      AccountProvider.where(account_id: @account_ids).includes(:account, :provider).find_each do |link|
        item = link.adapter&.item
        next unless item && item.family_id == @user.family_id
        next if item.respond_to?(:scheduled_for_deletion?) && item.scheduled_for_deletion?

        reason = attention_reason(item)
        old = previous[link.id]
        identity = [ link.provider_type, link.provider_id, item.id ]
        old = nil unless old && old["identity"] == identity
        generation = old ? old.fetch("generation") : SecureRandom.uuid
        episode = old ? old.fetch("episode", 0) : 0
        changed = old && old["reason"] != reason && reason.present?
        episode += 1 if changed
        current[link.id] = { "identity" => identity, "generation" => generation, "reason" => reason, "episode" => episode }
        next unless changed

        publish("bank_attention", "bank_attention:#{link.id}:#{generation}:#{episode}", account: link.account,
                data: { account_provider_id: link.id, reason: reason })
      end
      @state["providers"] = current
    end

    def attention_reason(item)
      # Do not use Sync#failed?, stale-sync warnings or broad needs_attention?:
      # those include transient outages and accounts that merely need mapping.
      if item.is_a?(EnableBankingItem)
        return "consent_expired" if item.session_expires_at && item.session_expires_at <= @now
        return "authorization_required" if item.needs_authorization?
      elsif item.is_a?(SimplefinItem)
        return "authorization_required" if item.setup_token_update_required?
      elsif item.respond_to?(:requires_update?) && item.requires_update?
        return "authorization_required"
      end
      nil
    end

    def collect_budgets
      previous = @state.fetch("budgets", {})
      current = {}
      scope = @user.family.budgets.where(user_id: [ nil, @user.id ])
                   .where("start_date <= ? AND end_date >= ?", @today, @today)
                   .where.not(budgeted_spending: nil)
                   .includes(budget_categories: :category)
      scope.each do |budget|
        next if budget.user_id.nil? && @user.family.personal_budgets? && !@user.family.household_budget_enabled?

        # Shared personal budgets intentionally do not participate: their model
        # uses every owner account, including accounts not shared with the viewer.
        accounts = @accounts.included_in_reports.merge(Account.included_in_finances_for(@user))
        accounts = accounts.where(owner_id: @user.id) if budget.user_id.present?
        budget.current_user = @user
        budget.income_statement_accounts = accounts
        # This association has a scope; do not rely on automatic inverse
        # detection to keep category calculations on this account-scoped instance.
        budget.budget_categories.each { |category| category.budget = budget }
        account_ids = accounts.pluck(:id).sort
        signature = [ @preferences.budget_threshold_pct, account_ids ]
        old_budget = previous[budget.id]
        old_categories = old_budget && old_budget["signature"] == signature ? old_budget.fetch("categories", {}) : {}
        categories = {}
        budget.budget_categories.each do |category|
          # An inheriting child is not an independently funded envelope; the
          # parent already measures its spending and shared rollover allocation.
          next if category.inherits_parent_budget? || !category.budgeted?

          reached = category.percent_of_budget_spent.to_d >= @preferences.budget_threshold_pct
          categories[category.id] = reached
          next unless reached && old_categories[category.id] == false

          publish("budget_threshold", "budget_threshold:#{budget.id}:#{category.id}:#{@preferences.budget_threshold_pct}",
                  data: { budget_id: budget.id, budget_category_id: category.id,
                          threshold_pct: @preferences.budget_threshold_pct, account_ids: account_ids })
        end
        current[budget.id] = { "signature" => signature, "categories" => categories }
      end
      @state["budgets"] = current
    end

    def publish(event_type, dedup_key, account: nil, data:)
      WebNotification.publish!(user: @user, event_type: event_type, dedup_key: dedup_key,
                               account: account, data: data, now: @now)
    end
end
