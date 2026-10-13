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

  test "no occurrence exists for a statement on its closing day" do
    travel_to Time.zone.local(2026, 10, 2, 12)
    configure_day(27)
    assert_nil series.recurring_occurrences.find_by(original_due_on: Date.new(2026, 10, 27))

    travel_to Time.zone.local(2026, 10, 3, 0)
    refresh
    assert_equal Date.new(2026, 10, 2), series.recurring_occurrences.find_by!(original_due_on: Date.new(2026, 10, 27)).statement_end_on
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

  test "inference requires three distinct stable months and manual day takes precedence" do
    [ 7, 8 ].each { |month| charge(-50, Date.new(2026, month, 10), name: "Autopay") }
    assert_nil @card.payment_schedule.inferred_due_day
    charge(-900, Date.new(2026, 9, 11), name: "Autopay")
    # A fresh read is how the account editor requests an inference.
    @card.reload
    assert_equal 10, CreditCard::PaymentSchedule.new(@card).inferred_due_day
    configure_day(20)
    assert_equal 20, @card.payment_schedule.due_day
    assert_equal "manual", @card.payment_schedule.due_day_source
    @card.update!(payment_due_day: nil)
    assert_equal 10, @card.payment_schedule.due_day
    assert_equal "estimated", @card.payment_schedule.due_day_source
  end

  test "spiky manual payments and refunds do not fabricate a due day" do
    [ [ 7, 2 ], [ 8, 15 ], [ 9, 27 ] ].each { |month, day| charge(-100, Date.new(2026, month, day), name: "Payment") }
    charge(-50, Date.new(2026, 10, 10), name: "Refund")
    refresh
    assert_nil @card.payment_schedule.due_day
    assert_nil series.next_due_date
    refute series.overdue?
    assert_empty series.recurring_occurrences
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
