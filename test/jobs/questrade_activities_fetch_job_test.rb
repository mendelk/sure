require "test_helper"

class QuestradeActivitiesFetchJobTest < ActiveSupport::TestCase
  setup do
    family = families(:empty)
    @item = family.questrade_items.create!(name: "History completion", refresh_token: "dummy-token")
    @provider_account = @item.questrade_accounts.create!(questrade_account_id: "history-completion",
      name: "History account", currency: "CAD", current_balance: 0, activities_fetch_pending: true)
    @account = family.accounts.create!(name: "History account", balance: 0, currency: "CAD", accountable: Investment.new)
    @provider_account.ensure_account_provider!(@account)
    @provider_account.stubs(:questrade_item).returns(@item)
    @provider = mock
    @item.stubs(:questrade_provider).returns(@provider)
    @item.stubs(:broadcast_sync_complete)
  end

  test "pending empty upstream history does not establish readiness" do
    @provider.expects(:get_activities).returns([])

    QuestradeActivitiesFetchJob.perform_now(@provider_account, retry_count: 0)

    assert_not WebNotificationTransactionSource.exists?(account: @account, source: "questrade")
    assert_nil @provider_account.reload.last_activities_sync
    assert @provider_account.activities_fetch_pending?
  end

  test "terminal successful empty fetch establishes readiness for the first genuine arrival" do
    @provider.expects(:get_activities).returns([])

    QuestradeActivitiesFetchJob.perform_now(@provider_account, retry_count: QuestradeActivitiesFetchJob::MAX_RETRIES)

    assert WebNotificationTransactionSource.find_by!(account: @account, source: "questrade").completed_at
    assert @provider_account.reload.last_activities_sync
    assert_not @provider_account.activities_fetch_pending?
    entry = Account::ProviderImportAdapter.new(@account).import_transaction(external_id: "after-empty",
      source: "questrade", name: "New activity", date: Date.current, amount: 37, currency: "CAD")
    assert_not WebNotificationTransactionEvent.find_by!(entry: entry).baseline?
  end

  test "terminal failed fetch cannot masquerade as successful empty history" do
    @provider.expects(:get_activities).raises(StandardError, "upstream unavailable")

    QuestradeActivitiesFetchJob.perform_now(@provider_account, retry_count: QuestradeActivitiesFetchJob::MAX_RETRIES)

    assert_nil @provider_account.reload.last_activities_sync
    assert_not WebNotificationTransactionSource.exists?(account: @account, source: "questrade")
    QuestradeAccount::Processor.new(@provider_account).process
    assert_not WebNotificationTransactionSource.exists?(account: @account, source: "questrade")
  end
end
