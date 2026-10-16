require "test_helper"

class WebNotificationTransactionSourceTest < ActiveSupport::TestCase
  setup do
    @account = Account.create!(family: families(:dylan_family), owner: users(:family_admin),
      name: "Fresh linked account", balance: 0, currency: "USD", accountable: Depository.new)
    item = SimplefinItem.create!(family: @account.family, name: "Baseline connection", access_url: "https://example.com/access")
    @provider_account = SimplefinAccount.create!(simplefin_item: item, name: "Checking",
      account_id: "baseline-account", account_type: "depository", currency: "USD", current_balance: 0, raw_transactions_payload: [])
    @account.update!(simplefin_account_id: @provider_account.id)
  end

  test "history completion baselines every first-batch row but not later arrivals" do
    @provider_account.update!(raw_transactions_payload: [ transaction_payload("old-one"), transaction_payload("old-two") ])
    SimplefinAccount::Transactions::Processor.new(@provider_account).process

    assert source.completed_at
    assert_equal 2, WebNotificationTransactionEvent.where(account: @account, baseline: true).count

    @provider_account.update!(raw_transactions_payload: [ transaction_payload("old-one"), transaction_payload("new") ])
    SimplefinAccount::Transactions::Processor.new(@provider_account).process

    assert_equal 1, WebNotificationTransactionEvent.where(account: @account, baseline: false).count
    assert_equal "simplefin_new", WebNotificationTransactionEvent.find_by!(account: @account, baseline: false).entry.external_id
  end

  test "processing failure cannot establish transaction-history readiness" do
    @provider_account.update!(raw_transactions_payload: [ transaction_payload("fails") ])
    SimplefinEntry::Processor.any_instance.expects(:process).raises(StandardError, "invalid history")

    SimplefinAccount::Transactions::Processor.new(@provider_account).process

    assert_nil source
    assert_equal 0, WebNotificationTransactionEvent.where(account: @account).count
  end

  test "a balance observation alone does not establish a transaction baseline" do
    Account::ProviderImportAdapter.new(@account).update_balance(balance: 100, source: "simplefin")

    assert_nil source
    assert_equal 0, WebNotificationTransactionEvent.where(account: @account).count
  end

  test "successful empty history establishes readiness for the next arrival" do
    SimplefinAccount::Transactions::Processor.new(@provider_account).process
    assert source.completed_at

    @provider_account.update!(raw_transactions_payload: [ transaction_payload("first-real-arrival") ])
    SimplefinAccount::Transactions::Processor.new(@provider_account).process

    assert_not WebNotificationTransactionEvent.find_by!(account: @account).baseline?
  end

  test "SimpleFIN importer preserves successful empty history before the first real arrival" do
    @provider_account.update!(raw_transactions_payload: nil)
    importer = SimplefinItem::Importer.new(@provider_account.simplefin_item, simplefin_provider: nil)
    importer.send(:import_account, {
      id: @provider_account.account_id, name: @provider_account.name, type: "depository",
      balance: 0, currency: "USD", transactions: []
    }.with_indifferent_access)

    assert_equal [], @provider_account.reload.raw_transactions_payload
    SimplefinAccount::Transactions::Processor.new(@provider_account).process
    assert source.completed_at

    @provider_account.update!(raw_transactions_payload: [ transaction_payload("after-empty-import") ])
    SimplefinAccount::Transactions::Processor.new(@provider_account).process
    assert_not WebNotificationTransactionEvent.find_by!(account: @account).baseline?
  end

  test "SimpleFIN balance-only and omitted history fields remain unbaselined" do
    @provider_account.update!(raw_transactions_payload: nil)
    importer = SimplefinItem::Importer.new(@provider_account.simplefin_item, simplefin_provider: nil)
    account_data = { id: @provider_account.account_id, name: @provider_account.name,
      type: "depository", balance: 0, currency: "USD" }.with_indifferent_access
    importer.send(:import_account_minimal_and_balance, account_data)
    SimplefinAccount::Transactions::Processor.new(@provider_account.reload).process
    assert_nil source

    importer.send(:import_account, account_data)
    SimplefinAccount::Transactions::Processor.new(@provider_account.reload).process
    assert_nil @provider_account.raw_transactions_payload
    assert_nil source
  end

  private
    def source
      WebNotificationTransactionSource.find_by(account: @account, source: "simplefin")
    end

    def transaction_payload(id)
      { "id" => id, "posted" => Time.current.to_i, "amount" => "-613.00",
        "description" => "Provider arrival", "transacted_at" => Time.current.to_i }
    end
end
