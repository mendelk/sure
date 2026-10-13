class CreditCard
  # Statement boundaries are estimates, not bank-issued bills. Payment dates
  # supply a cadence, never an amount; posted debt supplies the obligation.
  class PaymentSchedule
    STATEMENT_GAP_DAYS = 25
    PAYMENT_NAME = /autopay|automatic payment|auto[ -]?pmt|payment.*thank|payment received|online payment|electronic payment|\Apayment\z/i

    attr_reader :card, :account

    def initialize(card)
      @card = card
      @account = card.account || (card.reload_account if card.persisted?)
    end

    def self.refresh_family!(family)
      return if family.recurring_transactions_disabled?

      family.accounts.visible.where(accountable_type: "CreditCard").includes(:accountable).find_each do |account|
        account.accountable.payment_schedule.refresh!
      end
    end

    def self.payment?(entry)
      return false unless entry.amount.negative? && entry.transaction?

      transaction = entry.transaction
      typed_payment = transaction.kind == "cc_payment" && (transaction.transfer.nil? || transaction.transfer.confirmed?)
      typed_payment || entry.name.match?(PAYMENT_NAME)
    end

    def inferred_due_day
      months = posted_entries.select { |entry| self.class.payment?(entry) && entry.date >= Date.current - 12.months }
                             .group_by { |entry| entry.date.beginning_of_month }
      # Multiple payments in a month are not evidence of a fixed deadline.
      days = months.values.filter_map { |entries| entries.first.date.day if entries.one? }
      return nil if days.size < 3

      day, count = days.tally.max_by { |candidate, frequency| [ frequency, candidate ] }
      stable = days.count { |candidate| (candidate - day).abs <= 2 || (candidate >= 28 && day >= 28) }
      return nil unless count >= 2 && stable >= 3 && stable.fdiv(days.size) >= 0.8

      day
    end

    def due_day
      card.payment_due_day || inferred_due_day
    end

    def due_day_source
      return "manual" if card.payment_due_day

      "estimated" if inferred_due_day
    end

    def next_due_on
      return nil unless due_day

      due = date_in_month(Date.current, due_day)
      due < Date.current ? date_in_month(Date.current.next_month, due_day) : due
    end

    def refresh!
      @posted_entries = nil
      @account = card.reload_account if account.nil? && card.persisted?
      return 0 unless account

      added = 0
      account.with_lock do
        return 0 unless Account::VISIBLE_STATUSES.include?(account.status)
        return 0 if account.family.recurring_transactions_disabled?

        series = ensure_series!
        retire_previous_payment_series!(series)
        if due_day
          update_series!(series)
          RecurringTransaction::Matcher.new(account.family).repair_orphans!(series: series)
          added = generate_closed_cycles!(series)
          refresh_estimates!(series)
          allocate_payments!(series)
          refresh_estimates!(series)
        end
      end
      added
    end

    private
      def posted_entries
        return [] unless account

        @posted_entries ||= account.entries.where(entryable_type: "Transaction", currency: account.currency)
                                  .where("entries.date <= ?", Date.current)
                                  .excluding_pending.excluding_split_parents
                                  .includes(entryable: :transfer).order(:date, :id).to_a
      end

      def date_in_month(month, day)
        Date.new(month.year, month.month, [ day, month.end_of_month.day ].min)
      end

      def latest_closed_due
        due = date_in_month(Date.current + STATEMENT_GAP_DAYS, due_day)
        due - STATEMENT_GAP_DAYS >= Date.current ? date_in_month(due.prev_month, due_day) : due
      end

      def ensure_series!
        account.recurring_transactions.find_or_create_by!(system_managed_kind: "credit_card_payment") do |series|
          series.assign_attributes(family: account.family, name: account.name, amount: 0, currency: account.currency,
                                   expected_day_of_month: due_day || 1, last_occurrence_date: Date.current,
                                   next_expected_date: next_due_on || Date.current, amount_tolerance_pct: 0,
                                   manual: true, anchor_date: due_day ? latest_closed_due : nil)
        end
      end

      def update_series!(series)
        series.system_update!(name: account.name, currency: account.currency, expected_day_of_month: due_day,
                              next_expected_date: next_due_on, anchor_date: series.anchor_date || latest_closed_due)
      end

      def retire_previous_payment_series!(series)
        account.family.recurring_transactions.where(system_managed_kind: nil).where.not(status: "ended")
               .where("destination_account_id = :id OR (account_id = :id AND amount < 0)", id: account.id)
               .find_each do |previous|
          next unless previous.destination_account_id == account.id || previous.name.to_s.match?(PAYMENT_NAME)

          previous.update!(status: "ended", replaced_by: series)
        end
      end

      def generate_closed_cycles!(series)
        added = 0
        month = series.recurring_occurrences.maximum(:original_due_on)&.next_month || series.anchor_date
        last_end = series.recurring_occurrences.maximum(:statement_end_on)
        while month && month.beginning_of_month <= latest_closed_due.beginning_of_month
          due = date_in_month(month, due_day)
          ending = due - STATEMENT_GAP_DAYS
          break if ending >= Date.current

          starting = last_end ? last_end + 1 : date_in_month(due.prev_month, due_day) - STATEMENT_GAP_DAYS + 1
          occurrence = series.recurring_occurrences.find_or_initialize_by(original_due_on: due)
          if occurrence.new_record?
            occurrence.assign_attributes(family: account.family, due_on: due, currency: account.currency,
                                         statement_start_on: starting, statement_end_on: ending,
                                         due_date_source: due_day_source, expected_amount: 0)
            occurrence.save!
            added += 1
          end
          last_end = ending
          month = due.next_month
        end
        added
      end

      def balance_on(date)
        # Linked accounts are reconciled backwards from provider balances; an
        # opening valuation can predate the imported ledger by months or years.
        materialized = account.balances.find_by(date: date, currency: account.currency)
        return materialized.balance if materialized

        valuations = account.entries.where(entryable_type: "Valuation", currency: account.currency)
        anchor = valuations.where("date <= ?", date).order(date: :desc).first
        anchor ||= valuations.where("date > ?", date).order(:date).first
        amount = anchor ? anchor.amount : account.balance
        anchor_date = anchor ? anchor.date : Date.current
        if anchor_date <= date
          amount + posted_entries.sum { |entry| entry.date > anchor_date && entry.date <= date ? entry.amount : 0 }
        else
          amount - posted_entries.sum { |entry| entry.date > date && entry.date <= anchor_date ? entry.amount : 0 }
        end
      end

      # Subtract payments only once they have an allocation, then add this
      # occurrence's own allocations back to its obligation. The second pass
      # incorporates payments just matched by the first pass. Unallocated
      # repayments remain available to the oldest unpaid statement first.
      def refresh_estimates!(series)
        occurrences = series.recurring_occurrences.order(:statement_end_on).includes(:allocations).to_a
        payment_ids = posted_entries.filter_map { |entry| entry.id if self.class.payment?(entry) }
        payment_amounts = RecurringAllocation.confirmed.where(entry_id: payment_ids).group(:entry_id).sum(:source_amount)
        prior_remaining = 0.to_d
        occurrences.each do |occurrence|
          next unless occurrence.currency == account.currency
          next unless occurrence.scheduled? || (occurrence.closed_source == "auto" && occurrence.allocations.empty?)

          occurrence.with_lock do
            closing = balance_on(occurrence.statement_end_on)
            subsequent = posted_entries.select { |entry| entry.date > occurrence.statement_end_on && entry.amount.negative? }
            credits = subsequent.sum { |entry| self.class.payment?(entry) ? 0 : -entry.amount }
            payments = subsequent.sum { |entry| self.class.payment?(entry) ? payment_amounts.fetch(entry.id, 0) : 0 }
            allocated = occurrence.confirmed_allocated
            payments += occurrence.allocations.confirmed.where(entry_id: nil).sum(:allocated_amount)
            remaining = [ closing - payments - credits - prior_remaining, 0 ].max
            expected = remaining + allocated
            occurrence.update!(statement_balance: closing,
                               post_statement_credits: credits,
                               expected_amount: expected)
            if remaining.zero?
              occurrence.close!("paid", source: "auto") if occurrence.scheduled?
            elsif occurrence.paid?
              occurrence.reopen!
            end
            prior_remaining += remaining
          end
        end
      end

      def allocate_payments!(series)
        rejected = series.recurring_match_rejections.pluck(:entry_id).to_set
        orphan_dates = RecurringAllocation.joins(:recurring_occurrence)
                                        .where(recurring_occurrences: { recurring_transaction_id: series.id }, entry_id: nil,
                                               source: %w[auto_matched user_confirmed]).pluck(:paid_on).to_set
        posted_entries.each do |entry|
          next unless self.class.payment?(entry) && !rejected.include?(entry.id) && !orphan_dates.include?(entry.date)

          series.recurring_occurrences.open_status.where("statement_end_on < ?", entry.date).order(:statement_end_on).each do |occurrence|
            next if occurrence.allocations.where(entry_id: entry.id).exists?

            RecurringTransaction::Allocator.new(occurrence).allocate_matched!(entry: entry, state: "confirmed", confidence: 1,
                                                                            signals: { credit_card_payment: true, entry_amount: entry.amount.abs.to_s })
          end
        end
      end
  end
end
