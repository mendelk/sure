require "test_helper"

class SimplefinAccount::Transactions::ProcessorInvestmentTest < ActiveSupport::TestCase
  setup do
    @family = families(:dylan_family)

    # Create SimpleFIN connection
    @simplefin_item = SimplefinItem.create!(
      family: @family,
      name: "Test SimpleFIN",
      access_url: "https://example.com/access"
    )

    # Create an Investment account
    @account = Account.create!(
      family: @family,
      name: "Retirement - Roth IRA",
      currency: "USD",
      balance: 12199.06,
      accountable: Investment.create!(subtype: :roth_ira)
    )

    # Create SimpleFIN account linked to the Investment account
    @simplefin_account = SimplefinAccount.create!(
      simplefin_item: @simplefin_item,
      name: "Roth IRA",
      account_id: "ACT-investment-123",
      currency: "USD",
      account_type: "investment",
      current_balance: 12199.06,
      raw_transactions_payload: [
        {
          "id" => "TRN-921a8cdb-f331-48ee-9de2-b0b9ff1d316a",
          "posted" => 1766417520,
          "amount" => "1.49",
          "description" => "Dividend Reinvestment",
          "payee" => "Dividend",
          "memo" => "Dividend Reinvestment",
          "transacted_at" => 1766417520
        },
        {
          "id" => "TRN-881f2417-29e3-43f9-bd1b-013e60ba7a4b",
          "posted" => 1766113200,
          "amount" => "1.49",
          "description" => "Sweep of dividend payouts",
          "payee" => "Dividend",
          "memo" => "Dividend Payment - IEMG",
          "transacted_at" => 1766113200
        },
        {
          "id" => "TRN-e52f1326-bbb6-42a7-8148-be48c8a81832",
          "posted" => 1765985220,
          "amount" => "0.05",
          "description" => "Dividend Reinvestment",
          "payee" => "Dividend",
          "memo" => "Dividend Reinvestment",
          "transacted_at" => 1765985220
        }
      ]
    )

    # Link the account via legacy FK
    @account.update!(simplefin_account_id: @simplefin_account.id)
  end

  test "processes dividend transactions for investment accounts" do
    assert_equal 0, @account.entries.count, "Should start with no entries"

    # Process transactions
    processor = SimplefinAccount::Transactions::Processor.new(@simplefin_account)
    processor.process

    # Verify all 3 dividend transactions were created
    assert_equal 3, @account.entries.count, "Should create 3 entries for dividend transactions"

    # Verify entries are Transaction type (not Trade)
    @account.entries.each do |entry|
      assert_equal "Transaction", entry.entryable_type
    end

    # Verify external_ids are set correctly
    external_ids = @account.entries.pluck(:external_id).sort
    expected_ids = [
      "simplefin_TRN-921a8cdb-f331-48ee-9de2-b0b9ff1d316a",
      "simplefin_TRN-881f2417-29e3-43f9-bd1b-013e60ba7a4b",
      "simplefin_TRN-e52f1326-bbb6-42a7-8148-be48c8a81832"
    ].sort
    assert_equal expected_ids, external_ids

    # Verify source is simplefin
    @account.entries.each do |entry|
      assert_equal "simplefin", entry.source
    end
  end

  test "investment transactions processor is no-op to avoid duplicate processing" do
    # First, process with regular processor
    SimplefinAccount::Transactions::Processor.new(@simplefin_account).process
    initial_count = @account.entries.count
    assert_equal 3, initial_count

    # Get the first entry's updated_at before running investment processor
    first_entry = @account.entries.first
    original_updated_at = first_entry.updated_at

    # Run the investment transactions processor - should be a no-op
    SimplefinAccount::Investments::TransactionsProcessor.new(@simplefin_account).process

    # Entry count should be unchanged
    assert_equal initial_count, @account.entries.reload.count

    # Entries should not have been modified
    first_entry.reload
    assert_equal original_updated_at, first_entry.updated_at
  end

  test "processes transactions correctly via SimplefinAccount::Processor for investment accounts" do
    # Verify the full processor flow works for investment accounts
    processor = SimplefinAccount::Processor.new(@simplefin_account)
    processor.process

    # Should create transaction entries
    assert_equal 3, @account.entries.where(entryable_type: "Transaction").count

    # Verify amounts are correctly negated (SimpleFIN positive = income = negative in Sure)
    entry = @account.entries.find_by(external_id: "simplefin_TRN-921a8cdb-f331-48ee-9de2-b0b9ff1d316a")
    assert_not_nil entry
    assert_equal BigDecimal("-1.49"), entry.amount
  end

  test "logs appropriate messages during processing" do
    # Capture log output
    log_output = StringIO.new
    original_logger = Rails.logger
    Rails.logger = Logger.new(log_output)

    SimplefinAccount::Transactions::Processor.new(@simplefin_account).process

    Rails.logger = original_logger
    log_content = log_output.string

    # Should log start message with transaction count
    assert_match(/Processing 3 transactions/, log_content)

    # Should log completion message
    assert_match(/Completed.*3 processed, 0 errors/, log_content)
  end

  test "handles empty raw_transactions_payload gracefully" do
    @simplefin_account.update!(raw_transactions_payload: [])

    # Should not raise an error
    processor = SimplefinAccount::Transactions::Processor.new(@simplefin_account)
    processor.process

    assert_equal 0, @account.entries.count
  end

  test "handles nil raw_transactions_payload gracefully" do
    @simplefin_account.update!(raw_transactions_payload: nil)

    # Should not raise an error
    processor = SimplefinAccount::Transactions::Processor.new(@simplefin_account)
    processor.process

    assert_equal 0, @account.entries.count
  end

  test "does not repair linkage when names dont match" do
    # Make original stale
    @simplefin_account.update!(raw_transactions_payload: [])

    # Create new with DIFFERENT name
    new_simplefin_account = SimplefinAccount.create!(
      simplefin_item: @simplefin_item,
      name: "Different Account Name",  # Different name
      account_id: "ACT-different-456",
      currency: "USD",
      account_type: "investment",
      current_balance: 1000.00,
      raw_transactions_payload: [
        { "id" => "TRN-different", "posted" => 1766417520, "amount" => "10.00", "description" => "Test" }
      ]
    )

    original_linkage = @account.simplefin_account_id

    @simplefin_item.process_accounts

    # Should NOT have transferred linkage because names don't match
    @account.reload
    assert_equal original_linkage, @account.simplefin_account_id
    assert_equal 0, @account.entries.count
  end

  test "repairs stale linkage when user re-adds institution in SimpleFIN" do
    @simplefin_account.update!(raw_transactions_payload: [])
    fresh = @simplefin_item.simplefin_accounts.create!(name: @simplefin_account.name, account_id: "new-investment",
      currency: "USD", account_type: "investment", current_balance: 12199.06,
      raw_transactions_payload: [ { "id" => "TRN-new", "posted" => 1766417520, "amount" => "5.00", "description" => "New Dividend" } ])
    @simplefin_item.upstream_account_ids = [ fresh.account_id ]
    @simplefin_item.process_accounts
    assert_equal fresh.id, @account.reload.simplefin_account_id
    assert_equal [ "simplefin_TRN-new" ], @account.entries.pluck(:external_id)
    assert_equal BigDecimal("-5.00"), @account.entries.sole.amount
    assert_empty @simplefin_account.reload.raw_transactions_payload
  end

  test "repairs linkage and merges transactions when both old and new have data" do
    fresh = @simplefin_item.simplefin_accounts.create!(name: @simplefin_account.name, account_id: "new-investment",
      currency: "USD", account_type: "investment", current_balance: 12199.06,
      raw_transactions_payload: [ { "id" => "TRN-new", "posted" => 1766417520, "amount" => "5.00", "description" => "New Dividend" } ])
    @simplefin_item.upstream_account_ids = [ fresh.account_id ]
    old_ids = @simplefin_account.raw_transactions_payload.map { |row| "simplefin_#{row["id"]}" }
    @simplefin_item.process_accounts
    assert_equal fresh.id, @account.reload.simplefin_account_id
    assert_equal (old_ids + [ "simplefin_TRN-new" ]).sort, @account.entries.pluck(:external_id).sort
    assert_empty @simplefin_account.reload.raw_transactions_payload
  end

end
