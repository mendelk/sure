require "test_helper"

class CreditCard::PaymentScheduleTest < ActiveSupport::TestCase
  setup do
    travel_to Time.zone.local(2026, 10, 12, 12)
    @account = users(:family_admin).family.accounts.create!(
      name: "Statement card", owner: users(:family_admin), balance: 0, currency: "USD", accountable: CreditCard.new
    )
    @card = @account.accountable
    @account.entries.create!(date: Date.new(2026, 9, 1), name: "Opening debt", amount: 100,
                             currency: "USD", entryable: Valuation.new(kind: "opening_anchor"))
  end

  teardown { travel_back }

  test "closed-cycle debt includes carry and posted charges but not pending or new purchases" do
    charge(400, Date.new(2026, 9, 5))
    charge(300, Date.new(2026, 10, 1))
    charge(900, Date.new(2026, 9, 10), extra: { plaid: { pending: true } })
    charge(800, Date.new(2026, 9, 10), currency: "EUR")
    configure_day(9)

    assert_equal Date.new(2026, 9, 14), occurrence.statement_end_on
    assert_equal Date.new(2026, 8, 16), occurrence.statement_start_on
    assert_equal 500, occurrence.statement_balance
    assert_equal 500, occurrence.remaining_amount
  end

  test "reconciled statement balance takes precedence over an incomplete opening-anchor ledger" do
    opening = @account.entries.find_by!(entryable_type: "Valuation")
    opening.update!(date: Date.new(2024, 8, 10), amount: 84.36)
    charge(-5533.20, Date.new(2026, 8, 12), name: "Autopay")
    charge(189.20, Date.new(2026, 9, 24))
    @account.update!(balance: 376.89)
    @account.balances.create!(date: Date.new(2026, 9, 17), balance: 187.69,
                              cash_balance: 187.69, currency: "USD", flows_factor: -1)
    @account.balances.create!(date: Date.new(2026, 9, 17), balance: 900,
                              cash_balance: 900, currency: "EUR", flows_factor: -1)
    configure_day(12)

    assert_equal Date.new(2026, 9, 17), occurrence.statement_end_on
    assert_equal BigDecimal("187.69"), occurrence.statement_balance
    assert_equal BigDecimal("187.69"), occurrence.remaining_amount
    assert occurrence.scheduled?
  end

  test "first payment is calculated on closing day and refreshes as posted charges arrive" do
    travel_to Time.zone.local(2026, 10, 16, 12)
    charge(40, Date.current)
    charge(900, Date.current, extra: { plaid: { pending: true } })
    charge(300, Date.current + 1)
    configure_day(10)

    assert_equal [ Date.new(2026, 11, 10) ], series.recurring_occurrences.pluck(:due_on)
    assert_equal Date.current, occurrence.statement_end_on
    assert_equal 140, occurrence.remaining_amount
    identity = occurrence.id

    charge(25, Date.current)
    refresh
    assert_equal identity, occurrence.id
    assert_equal 165, occurrence.remaining_amount

    travel_to Time.zone.local(2026, 10, 17, 12)
    refresh
    assert_equal 165, occurrence.remaining_amount
  end

  test "existing schedule calculates the next payment on closing day but not before" do
    travel_to Time.zone.local(2026, 10, 15, 12)
    charge(-100, Date.new(2026, 10, 10), name: "Autopay")
    charge(34.46, Date.new(2026, 10, 16))
    configure_day(10)
    assert_equal [ Date.new(2026, 10, 10) ], series.recurring_occurrences.pluck(:due_on)
    assert occurrence.paid?

    travel_to Time.zone.local(2026, 10, 16, 0)
    refresh
    current = series.next_open_occurrence
    assert_equal Date.new(2026, 11, 10), current.due_on
    assert_equal Date.current, current.statement_end_on
    assert_equal BigDecimal("34.46"), current.remaining_amount
  end

  test "post-close refund reduces the estimate and a repayment reduces only the remainder" do
    charge(400, Date.new(2026, 9, 5))
    configure_day(9)
    payment = charge(-200, Date.new(2026, 10, 9), name: "Automatic payment")
    charge(-50, Date.new(2026, 10, 10), name: "Merchant refund")
    refresh

    assert_equal 450, occurrence.expected_amount
    assert_equal 200, occurrence.confirmed_allocated
    assert_equal 250, occurrence.remaining_amount
    assert_equal [ payment.id ], occurrence.allocations.pluck(:entry_id)
    identity = occurrence.id
    refresh
    assert_equal identity, occurrence.id
    assert_equal 1, occurrence.allocations.count
    assert_equal 250, occurrence.remaining_amount
  end

  test "multiple statements do not claim carried debt or credits twice" do
    charge(400, Date.new(2026, 9, 5))
    charge(300, Date.new(2026, 10, 1))
    configure_day(9)
    travel_to Time.zone.local(2026, 10, 16, 12)
    refresh
    assert_equal [ 500, 300 ], series.recurring_occurrences.order(:due_on).map(&:remaining_amount)

    charge(-600, Date.new(2026, 10, 20), name: "Merchant refund")
    travel_to Time.zone.local(2026, 10, 21, 12)
    refresh
    rows = series.recurring_occurrences.order(:due_on).to_a
    assert_equal [ 0, 200 ], rows.map(&:remaining_amount)
    assert rows.first.paid?
    assert_equal 200, rows.sum(&:remaining_amount)
  end

  test "a repayment can cover two statements without exceeding the actual payment" do
    charge(400, Date.new(2026, 9, 5))
    charge(300, Date.new(2026, 10, 1))
    configure_day(9)
    travel_to Time.zone.local(2026, 10, 21, 12)
    payment = charge(-650, Date.new(2026, 10, 20), name: "Payment")
    refresh

    rows = series.recurring_occurrences.order(:due_on).to_a
    assert_equal [ 0, 150 ], rows.map(&:remaining_amount)
    assert_equal 650, RecurringAllocation.where(entry: payment).sum(:allocated_amount)
    assert_equal [ 500, 150 ], rows.map(&:confirmed_allocated)
  end

  test "paid history stays frozen and partial manual payments do not inflate the obligation" do
    charge(400, Date.new(2026, 9, 5))
    configure_day(9)
    RecurringTransaction::Allocator.new(occurrence).allocate!(amount: 200)
    refresh
    assert_equal 500, occurrence.expected_amount
    assert_equal 300, occurrence.remaining_amount

    RecurringTransaction::Allocator.new(occurrence).mark_paid!
    charge(-50, Date.new(2026, 10, 10), name: "Merchant refund")
    refresh
    assert occurrence.paid?
    assert_equal "user", occurrence.closed_source
    assert_equal 500, occurrence.expected_amount
    assert_equal 500, occurrence.confirmed_allocated
  end

  test "late corrections refresh an outstanding statement including a previously zero estimate" do
    configure_day(9)
    charge(75, Date.new(2026, 9, 5))
    refresh
    assert_equal 175, occurrence.expected_amount
    assert occurrence.scheduled?

    charge(-175, Date.new(2026, 10, 10), name: "Credit")
    refresh
    assert occurrence.paid?
    charge(25, Date.new(2026, 9, 6))
    refresh
    assert occurrence.scheduled?
    assert_equal 25, occurrence.remaining_amount
  end

  test "payment history never generates a statement without an explicit due day" do
    [ 7, 8, 9 ].each { |month| charge(-50, Date.new(2026, month, 10), name: "Autopay") }
    refresh

    assert_nil @card.payment_schedule.due_day
    assert_nil @card.payment_schedule.next_due_on
    refute @account.recurring_transactions.exists?(system_managed_kind: "credit_card_payment")
  end

  test "clearing the due day pauses payments and preserves allocations until reconfigured" do
    configure_day(20)
    original = occurrence
    allocation = RecurringTransaction::Allocator.new(original).allocate!(amount: 25)
    @card.update!(payment_due_day: nil)
    refresh

    assert series.reload.paused?
    assert_nil series.next_due_date
    refute RecurringTransaction.payable.exists?(id: series.id)
    assert_equal 75, original.reload.remaining_amount
    assert_equal original.id, allocation.reload.recurring_occurrence_id

    configure_day(20)
    assert series.reload.active?
    assert_equal original.id, occurrence.id
    assert_equal 75, occurrence.remaining_amount
  end

  test "changing the due day recalculates an upcoming statement and keeps its payments" do
    charge(400, Date.new(2026, 9, 5))
    charge(300, Date.new(2026, 9, 27))
    configure_day(20)
    original = occurrence
    allocation = RecurringTransaction::Allocator.new(original).allocate!(amount: 100)
    assert_equal 400, original.reload.remaining_amount

    configure_day(25)
    original.reload
    assert_equal Date.new(2026, 10, 25), original.due_on
    assert_equal Date.new(2026, 9, 30), original.statement_end_on
    assert_equal 800, original.expected_amount
    assert_equal 700, original.remaining_amount
    assert_equal original.id, allocation.reload.recurring_occurrence_id
    refresh
    assert_equal [ original.id ], series.recurring_occurrences.pluck(:id)
    assert_equal 700, original.reload.remaining_amount
  end

  test "moving today's payment to a later cycle waits for the new statement close" do
    configure_day(12)
    original = occurrence
    configure_day(10)

    assert_equal Date.new(2026, 11, 10), original.reload.due_on
    assert_equal Date.new(2026, 10, 16), original.statement_end_on
    assert_equal 0, original.remaining_amount
    charge(50, Date.new(2026, 10, 13))
    travel_to Time.zone.local(2026, 10, 16, 12)
    refresh
    assert_equal 150, original.reload.remaining_amount
  end

  test "due day changes recalculate zero estimates without changing paid history" do
    charge(-100, Date.new(2026, 9, 10), name: "Refund")
    charge(200, Date.new(2026, 9, 28))
    configure_day(20)
    zero_estimate = occurrence
    assert zero_estimate.paid?
    assert_equal 0, zero_estimate.remaining_amount

    configure_day(25)
    assert_equal Date.new(2026, 10, 25), zero_estimate.reload.due_on
    assert_equal 200, zero_estimate.remaining_amount
    assert zero_estimate.scheduled?

    RecurringTransaction::Allocator.new(zero_estimate).mark_paid!
    configure_day(26)
    assert_equal Date.new(2026, 10, 25), zero_estimate.reload.due_on
    assert zero_estimate.paid?
    assert_equal 200, zero_estimate.confirmed_allocated
  end

  test "due day changes preserve overdue statement dates" do
    configure_day(9)
    past = occurrence
    original_dates = past.attributes.slice("due_on", "statement_start_on", "statement_end_on")
    configure_day(20)
    assert_equal original_dates, past.reload.attributes.slice("due_on", "statement_start_on", "statement_end_on")
    assert past.scheduled?
  end

  test "due days clamp across leap years and year boundaries" do
    configure_day(31)
    travel_to Time.zone.local(2028, 2, 1, 12)
    assert_equal Date.new(2028, 2, 29), @card.payment_schedule.next_due_on
    travel_to Time.zone.local(2027, 2, 1, 12)
    assert_equal Date.new(2027, 2, 28), @card.payment_schedule.next_due_on
    configure_day(5)
    travel_to Time.zone.local(2027, 12, 20, 12)
    assert_equal Date.new(2028, 1, 5), @card.payment_schedule.next_due_on
  end

  test "system series cannot be changed or deleted but follows account deletion" do
    configure_day(9)
    assert_raises(ActiveRecord::ReadOnlyRecord) { series.update!(amount: 500) }
    refute series.destroy
    assert RecurringTransaction.exists?(series.id)
    assert_raises(ActiveRecord::ReadOnlyRecord) { occurrence.skip! }
    assert_raises(ActiveRecord::ReadOnlyRecord) { occurrence.override_amount!(500) }
    id = series.id
    @account.destroy!
    assert_nil RecurringTransaction.find_by(id: id)
  end

  test "disabled cards are not payable and do not generate new statements" do
    configure_day(9)
    @account.update!(status: "disabled")
    travel_to Time.zone.local(2026, 11, 21, 12)
    refresh
    assert_equal 1, series.recurring_occurrences.count
    refute RecurringTransaction.payable.exists?(id: series.id)
    @account.update!(status: "active")
    refresh
    assert_equal 3, series.recurring_occurrences.count
    assert RecurringTransaction.payable.exists?(id: series.id)
  end

  test "rejected automatic repayments are not reattached nightly" do
    charge(400, Date.new(2026, 9, 5))
    configure_day(9)
    charge(-200, Date.new(2026, 10, 9), name: "Payment")
    refresh
    RecurringTransaction::Allocator.new(occurrence).unallocate!(occurrence.allocations.first)
    refresh
    assert_empty occurrence.allocations
    assert_equal 500, occurrence.remaining_amount
  end

  test "provider-reposted payments restore allocations without counting the repayment twice" do
    charge(400, Date.new(2026, 9, 5))
    configure_day(9)
    payment = charge(-200, Date.new(2026, 10, 9), name: "Autopay")
    refresh
    allocation = occurrence.allocations.first
    payment.destroy!
    replacement = charge(-200, Date.new(2026, 10, 9), name: "Autopay POSTED")
    refresh
    assert_equal replacement.id, allocation.reload.entry_id
    assert_equal 1, occurrence.allocations.count
    assert_equal 200, occurrence.confirmed_allocated
    assert_equal 300, occurrence.remaining_amount
  end

  test "ambiguous reposted payments are not added on top of an orphaned repayment" do
    charge(400, Date.new(2026, 9, 5))
    configure_day(9)
    payment = charge(-200, Date.new(2026, 10, 9), name: "Autopay")
    refresh
    payment.destroy!
    2.times { charge(-200, Date.new(2026, 10, 9), name: "Autopay POSTED") }
    refresh
    assert_equal 1, occurrence.allocations.count
    assert_nil occurrence.allocations.first.entry_id
    assert_equal 300, occurrence.remaining_amount
  end

  test "cutover preserves old payment history and subtracts payments already allocated there" do
    charge(400, Date.new(2026, 9, 5))
    previous = @account.family.recurring_transactions.create!(
      name: "Card payment", amount: 200, currency: "USD", account: accounts(:depository),
      destination_account: @account, expected_day_of_month: 9,
      last_occurrence_date: Date.new(2026, 9, 9), next_expected_date: Date.new(2026, 10, 9)
    )
    old_cycle = previous.recurring_occurrences.find_or_create_by!(original_due_on: Date.new(2026, 10, 9)) do |row|
      row.assign_attributes(family: @account.family, due_on: Date.new(2026, 10, 9), expected_amount: 200, currency: "USD")
    end
    payment = charge(-200, Date.new(2026, 10, 9), name: "Payment")
    old_allocation = RecurringTransaction::Allocator.new(old_cycle).allocate!(entry: payment)
    configure_day(9)

    assert previous.reload.ended?
    assert old_cycle.reload.paid?
    assert_equal payment.id, old_allocation.reload.entry_id
    assert_equal previous.id, old_cycle.recurring_transaction_id
    assert_equal 300, occurrence.remaining_amount
    assert_empty occurrence.allocations
  end

  test "minimum payment uses the entire closing debt but excludes new and pending purchases" do
    charge(400, Date.new(2026, 9, 5))
    charge(300, Date.new(2026, 10, 1))
    charge(900, Date.new(2026, 9, 10), extra: { plaid: { pending: true } })
    @card.update!(minimum_payment_only: true)
    configure_day(9)

    assert_equal 500, occurrence.statement_balance
    assert_equal 5, occurrence.expected_amount
    assert_equal 5, occurrence.remaining_amount
  end

  test "minimum payment rounds to currency precision and never estimates negative debt" do
    charge(87.69, Date.new(2026, 9, 5))
    @card.update!(minimum_payment_only: true)
    configure_day(9)
    assert_equal BigDecimal("1.88"), occurrence.expected_amount

    charge(-300, Date.new(2026, 9, 6), name: "Refund")
    refresh
    assert_equal 0, occurrence.remaining_amount
    assert occurrence.paid?
  end

  test "minimum refunds reduce the principal base while payments satisfy the estimated obligation" do
    charge(400, Date.new(2026, 9, 5))
    @card.update!(minimum_payment_only: true)
    configure_day(9)
    payment = charge(-2, Date.new(2026, 10, 9), name: "Automatic payment")
    charge(-50, Date.new(2026, 10, 10), name: "Merchant refund")
    refresh

    assert_equal 500, occurrence.statement_balance
    assert_equal BigDecimal("4.50"), occurrence.expected_amount
    assert_equal 2, occurrence.confirmed_allocated
    assert_equal BigDecimal("2.50"), occurrence.remaining_amount
    assert_equal [ payment.id ], occurrence.allocations.pluck(:entry_id)
    refresh
    assert_equal BigDecimal("2.50"), occurrence.remaining_amount
  end

  test "each unpaid minimum includes carried principal without counting another cycle payment twice" do
    charge(400, Date.new(2026, 9, 5))
    charge(300, Date.new(2026, 10, 1))
    @card.update!(minimum_payment_only: true)
    configure_day(9)
    travel_to Time.zone.local(2026, 10, 21, 12)
    refresh
    rows = series.recurring_occurrences.order(:due_on).to_a
    assert_equal [ 5, 8 ], rows.map(&:remaining_amount)

    payment = charge(-7, Date.new(2026, 10, 20), name: "Payment")
    refresh
    rows.each(&:reload)
    assert_equal [ 0, 6 ], rows.map(&:remaining_amount)
    assert_equal [ 5, 2 ], rows.map(&:confirmed_allocated)
    assert_equal 7, RecurringAllocation.where(entry: payment).sum(:allocated_amount)
    refresh
    assert_equal [ 0, 6 ], rows.map { |row| row.reload.remaining_amount }
  end

  test "the next minimum includes debt carried after paying the previous minimum" do
    charge(400, Date.new(2026, 9, 5))
    @card.update!(minimum_payment_only: true)
    configure_day(9)
    charge(-5, Date.new(2026, 10, 9), name: "Autopay")
    refresh
    assert occurrence.paid?

    travel_to Time.zone.local(2026, 10, 16, 12)
    refresh
    current = series.next_open_occurrence
    assert_equal 495, current.statement_balance
    assert_equal BigDecimal("4.95"), current.remaining_amount
  end

  test "toggling minimum payment recalculates unpaid estimates and retains partial payments" do
    charge(400, Date.new(2026, 9, 5))
    configure_day(9)
    original = occurrence
    allocation = RecurringTransaction::Allocator.new(original).allocate!(amount: 2)

    @card.update!(minimum_payment_only: true)
    refresh
    assert_equal 5, original.reload.expected_amount
    assert_equal 3, original.remaining_amount
    assert_equal 500, original.statement_balance
    assert_equal original.id, allocation.reload.recurring_occurrence_id

    @card.update!(minimum_payment_only: false)
    refresh
    assert_equal 500, original.reload.expected_amount
    assert_equal 498, original.remaining_amount
  end

  private
    def charge(amount, date, name: "Purchase", currency: "USD", extra: {})
      @account.entries.create!(date: date, name: name, amount: amount, currency: currency, entryable: Transaction.new(extra: extra))
    end

    def configure_day(day)
      @card.update!(payment_due_day: day)
      refresh
    end

    def refresh
      @card.payment_schedule.refresh!
    end

    def series
      @account.recurring_transactions.find_by!(system_managed_kind: "credit_card_payment")
    end

    def occurrence
      series.recurring_occurrences.order(:due_on).first
    end
end
