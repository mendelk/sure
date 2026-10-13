require "test_helper"

class GenerateRecurringOccurrencesJobTest < ActiveSupport::TestCase
  setup do
    travel_to Time.zone.local(2026, 10, 12, 12)
    @family = families(:empty)
    @card = @family.accounts.create!(name: "Nightly card", balance: 0, currency: "USD", accountable: CreditCard.new(payment_due_day: 9))
    @card.entries.create!(date: Date.new(2026, 9, 1), name: "Opening debt", amount: 0,
                          currency: "USD", entryable: Valuation.new(kind: "opening_anchor"))
    @card.entries.create!(date: Date.new(2026, 9, 5), name: "Purchase", amount: 500,
                          currency: "USD", entryable: Transaction.new)
  end

  teardown { travel_back }

  test "nightly sweep refreshes late credits and matches actual payments without duplicate cycles" do
    job = GenerateRecurringOccurrencesJob.new
    job.perform(@family.id)
    series = @card.recurring_transactions.find_by!(system_managed_kind: "credit_card_payment")
    occurrence = series.current_occurrence
    assert_equal 500, occurrence.remaining_amount
    @card.entries.create!(date: Date.new(2026, 10, 11), name: "Merchant refund", amount: -50,
                          currency: "USD", entryable: Transaction.new)
    @card.entries.create!(date: Date.new(2026, 10, 10), name: "Payment", amount: -200,
                          currency: "USD", entryable: Transaction.new)
    job.perform(@family.id)
    assert_equal 450, occurrence.reload.expected_amount
    assert_equal 200, occurrence.confirmed_allocated
    assert_equal 250, occurrence.remaining_amount
    job.perform(@family.id)
    assert_equal [ occurrence.id ], series.recurring_occurrences.pluck(:id)
    assert_equal 1, occurrence.allocations.count
  end

  test "nightly sweep creates series for existing credit cards but not ordinary loans" do
    @card.recurring_transactions.delete_all
    loan = @family.accounts.create!(name: "Loan", balance: 1000, currency: "USD", accountable: Loan.new(subtype: "other"))
    GenerateRecurringOccurrencesJob.new.perform(@family.id)
    assert @card.recurring_transactions.exists?(system_managed_kind: "credit_card_payment")
    refute loan.recurring_transactions.exists?(system_managed_kind: "credit_card_payment")
  end
end
