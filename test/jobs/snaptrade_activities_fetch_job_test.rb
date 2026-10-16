require "test_helper"

class SnaptradeActivitiesFetchJobTest < ActiveSupport::TestCase
  setup do
    @item = snaptrade_items(:configured_item)
    @provider_account = snaptrade_accounts(:fidelity_401k)
    @provider_account.update!(raw_activities_payload: [], last_activities_sync: nil, activities_fetch_pending: true)
    @account = @item.family.accounts.create!(name: "Empty history account", balance: 0,
      currency: "USD", accountable: Investment.new)
    @provider_account.ensure_account_provider!(@account)
    @provider_account.stubs(:snaptrade_item).returns(@item)
    @provider = mock
    @item.stubs(:snaptrade_provider).returns(@provider)
    @item.stubs(:broadcast_sync_complete)
  end

  test "pending empty upstream history does not establish readiness" do
    @provider.expects(:get_account_activities).returns([])

    SnaptradeActivitiesFetchJob.perform_now(@provider_account, start_date: 1.year.ago.to_date, retry_count: 0)

    assert_not WebNotificationTransactionSource.exists?(account: @account, source: "snaptrade")
    assert_nil @provider_account.reload.last_activities_sync
    assert @provider_account.activities_fetch_pending?
  end

  test "terminal successful empty fetch establishes readiness for the first genuine arrival" do
    @provider.expects(:get_account_activities).returns([])

    SnaptradeActivitiesFetchJob.perform_now(@provider_account, start_date: 1.year.ago.to_date,
      retry_count: SnaptradeActivitiesFetchJob::MAX_RETRIES)

    assert WebNotificationTransactionSource.find_by!(account: @account, source: "snaptrade").completed_at
    assert @provider_account.reload.last_activities_sync
    assert_not @provider_account.activities_fetch_pending?
    entry = Account::ProviderImportAdapter.new(@account).import_transaction(external_id: "after-empty",
      source: "snaptrade", name: "New activity", date: Date.current, amount: 41, currency: "USD")
    assert_not WebNotificationTransactionEvent.find_by!(entry: entry).baseline?
  end

  test "terminal failed fetch cannot masquerade as successful empty history" do
    @provider.expects(:get_account_activities).raises(StandardError, "upstream unavailable")

    SnaptradeActivitiesFetchJob.perform_now(@provider_account, start_date: 1.year.ago.to_date,
      retry_count: SnaptradeActivitiesFetchJob::MAX_RETRIES)

    assert_nil @provider_account.reload.last_activities_sync
    assert_not WebNotificationTransactionSource.exists?(account: @account, source: "snaptrade")
  end
end
