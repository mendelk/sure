require "test_helper"

class WebNotification::TransactionsTest < ActiveSupport::TestCase
  setup do
    @user = users(:family_admin)
    @account = accounts(:depository)
    @now = Time.utc(2026, 10, 16, 12)
    travel_to @now
    @user.update!(preferences: @user.preferences.merge("preview_features_enabled" => true))
    preferences.update!(enabled: true)
  end

  teardown do
    travel_back
  end

  test "first history ingestion is silent and subsequent arrivals form one account batch" do
    first = import("historical-one")
    second = import("historical-two", amount: 71)
    WebNotificationTransactionSource.complete!(account: @account, source: "plaid")

    assert_empty collect
    assert WebNotificationTransactionEvent.find_by!(entry: first).baseline?
    assert WebNotificationTransactionEvent.find_by!(entry: second).baseline?

    third = import("new-one", amount: 83)
    fourth = import("new-two", amount: 97)
    notifications = collect

    assert_equal 1, notifications.size
    assert_equal @account.id, notifications.first.account_id
    assert_equal 2, notifications.first.data["count"]
    assert_equal [ third.id, fourth.id ].sort, notifications.first.data["entry_ids"].sort
    assert_empty collect
  end

  test "already populated accounts accept new arrivals without treating balance-only accounts as ready" do
    old = @account.entries.create!(name: "Existing source history", date: Date.current - 20,
      amount: 713, currency: "USD", source: "plaid", external_id: "existing",
      entryable: Transaction.new)
    arrived = import("arrived", amount: 719)

    assert_equal [ arrived.id ], collect.first.data["entry_ids"]
    assert_not WebNotificationTransactionEvent.exists?(entry: old)

    other = accounts(:credit_card)
    Account::ProviderImportAdapter.new(other).update_balance(balance: 100, source: "plaid")
    historical = import("new-account-history", account: other, amount: 727)
    WebNotificationTransactionSource.complete!(account: other, source: "plaid")

    assert WebNotificationTransactionEvent.find_by!(entry: historical).baseline?
    assert_empty collect
  end

  test "posted-only observes settlement of a protected pending entry with a changed provider id" do
    ready_source
    pending = import("hold", pending: true)
    assert_empty collect
    pending.update!(user_modified: true)

    posted = import("booked", pending_transaction_id: "hold")

    assert_equal pending.id, posted.id
    assert_equal [ posted.id ], collect.first.data["entry_ids"]
    import("booked")
    assert_empty collect
    assert_equal 1, WebNotificationTransactionReceipt.where(user: @user).count
  end

  test "including pending sends once and never repeats on posting or replaying an old alias" do
    ready_source
    preferences.update!(include_pending: true)
    pending = import("authorization", pending: true)
    assert_equal [ pending.id ], collect.first.data["entry_ids"]

    import("settlement", pending_transaction_id: "authorization")
    import("authorization", pending: true)

    assert_empty collect
    assert_equal 1, WebNotificationTransactionEvent.where(account: @account, source: "plaid").count
    assert_equal "settlement", WebNotificationTransactionEvent.find_by!(source: "plaid").entry.external_id
  end

  test "same-id protected settlement is explicit evidence but pending cleanup is not" do
    ready_source
    pending = import("same-id", pending: true)
    pending.update!(user_modified: true)
    pending.transaction.update!(extra: { "plaid" => { "pending" => false } })

    assert_empty collect
    import("same-id")

    assert_equal [ pending.id ], collect.first.data["entry_ids"]
    assert_empty collect
  end

  test "initial historical pending activity stays suppressed when it posts" do
    pending = import("historical-pending", pending: true)
    ready_source
    import("historical-posted", pending_transaction_id: "historical-pending")

    assert_empty collect
    assert WebNotificationTransactionEvent.find_by!(entry: pending).baseline?
  end

  test "stable source identity survives ledger removal and provider repost" do
    ready_source
    entry = import("stable")
    assert_equal 1, collect.size
    event = WebNotificationTransactionEvent.find_by!(entry: entry)
    entry.destroy!
    assert_nil event.reload.entry_id

    replacement = import("stable")

    assert_equal replacement.id, event.reload.entry_id
    assert_equal 1, WebNotificationTransactionEvent.where(account: @account, source: "plaid").count
    assert_empty collect
  end

  test "source facts and ledger writes roll back together" do
    ready_source
    WebNotificationTransactionEvent.expects(:observe!).raises(ActiveRecord::Rollback)

    assert_no_difference [ "Entry.count", "WebNotificationTransactionEvent.count" ] do
      import("rolled-back")
    end
  end

  test "failed publication leaves observations recoverable without an enqueue dependency" do
    ready_source
    entry = import("recoverable")
    WebNotification.stub(:publish!, ->(**_attributes) { raise StandardError, "publication unavailable" }) do
      assert_raises(StandardError) { collect }
    end
    assert_equal 0, WebNotificationTransactionReceipt.where(user: @user).count
    assert_equal [ entry.id ], collect.first.data["entry_ids"]
  end

  test "inbox insertion and event consumption are one transaction" do
    ready_source
    import("atomic-publication")
    WebNotificationTransactionReceipt.stub(:insert_all!, ->(*) { raise StandardError, "receipt unavailable" }) do
      assert_no_difference "WebNotification.count" do
        assert_raises(StandardError) { collect }
      end
    end
    assert_equal 1, collect.size
    assert_empty collect
  end

  test "opt-in and re-enable boundaries do not replay previously observed data" do
    ready_source
    before_opt_in = import("before-opt-in")
    travel 1.minute
    preferences.update!(enabled: false)
    preferences.update!(enabled: true)
    after_opt_in = import("after-opt-in", amount: 151)

    assert_equal [ after_opt_in.id ], collect.first.data["entry_ids"]
    assert_not WebNotificationTransactionReceipt.where(user: @user, event: WebNotificationTransactionEvent.find_by!(entry: before_opt_in)).exists?
  end

  test "currency minimums and selected accounts apply without family-private leakage" do
    ready_source
    other = accounts(:credit_card)
    WebNotificationTransactionSource.complete!(account: other, source: "plaid")
    private_account = accounts(:other_asset)
    private_account.update!(owner: users(:family_member))
    private_account.account_shares.destroy_all
    WebNotificationTransactionSource.complete!(account: private_account, source: "plaid")
    preferences.update!(account_ids: [ @account.id ], minimum_amounts: { "USD" => "100", "EUR" => "10" })

    import("below-usd", amount: 99)
    euro = import("above-euro", amount: -11, currency: "EUR")
    import("unselected", amount: 200, account: other)
    import("private", amount: 300, account: private_account)

    assert_equal [ euro.id ], collect.first.data["entry_ids"]
    assert_empty collect
  end

  test "historical imports and general ledger edits do not manufacture facts" do
    entry = @account.entries.create!(name: "Historical CSV row", date: Date.current - 400,
      amount: 131, currency: "USD", import_locked: true, entryable: Transaction.new)
    entry.update!(name: "Edited category/name")
    entry.transaction.update!(category: categories(:income))

    assert_not WebNotificationTransactionEvent.exists?(entry: entry)
    assert_empty collect
  end

  test "manual create hook is atomic and applies no provider-history baseline" do
    entry = @account.entries.new(name: "Manual arrival", date: Date.current, amount: 109,
      currency: "USD", entryable: Transaction.new)
    assert WebNotificationTransactionEvent.save_new(entry, origin: "manual")
    assert_equal [ entry.id ], collect.first.data["entry_ids"]

    failed = @account.entries.new(name: "Rollback manual", date: Date.current, amount: 113,
      currency: "USD", entryable: Transaction.new)
    WebNotificationTransactionEvent.expects(:observe!).raises(StandardError, "observation unavailable")
    assert_no_difference "Entry.count" do
      assert_raises(StandardError) { WebNotificationTransactionEvent.save_new(failed, origin: "manual") }
    end
  end

  test "synthetic settlement reconstruction is not newly arriving activity" do
    ready_source
    entry = Account::ProviderImportAdapter.new(@account).import_transaction(external_id: "synthetic-counterpart",
      source: "plaid", name: "Reconstructed counterpart", date: Date.current, amount: 173,
      currency: "USD", notification_activity: false)

    assert WebNotificationTransactionEvent.find_by!(entry: entry).baseline?
    assert_empty collect
  end

  test "entry ids moved away from the observed account cannot leak into its notification" do
    ready_source
    entry = import("moved-entry")
    entry.update!(account: accounts(:credit_card))

    assert_empty collect
  end

  test "manual duplicate reconciliation preserves pending consumption across merge and repost" do
    ready_source
    preferences.update!(include_pending: true)
    pending = import("merge-pending", pending: true, amount: 100)
    assert_equal [ pending.id ], collect.first.data["entry_ids"]
    posted = import("merge-posted", amount: 110)
    pending.transaction.update!(extra: pending.transaction.extra.merge(
      "potential_posted_match" => { "entry_id" => posted.id, "reason" => "fuzzy_amount_match" }))

    assert pending.transaction.merge_with_duplicate!
    assert_equal 1, WebNotificationTransactionEvent.where(account: @account).count
    assert_empty collect

    import("merge-pending", pending: true, amount: 100)
    assert_empty collect
  end

  test "one shared account observation is consumed independently by each opted-in user" do
    member = users(:family_member)
    member.update!(preferences: member.preferences.merge("preview_features_enabled" => true))
    WebNotification::Preferences.new(member).update!(enabled: true)
    ready_source
    entry = import("shared-arrival")

    assert_equal [ entry.id ], collect.first.data["entry_ids"]
    assert_equal [ entry.id ], WebNotification::Transactions.new(member).call.sole.data["entry_ids"]
    assert_empty collect
    assert_empty WebNotification::Transactions.new(member).call
  end

  private
    def preferences
      WebNotification::Preferences.new(@user)
    end

    def collect
      WebNotification::Transactions.new(@user).call(now: Time.current)
    end

    def ready_source
      WebNotificationTransactionSource.complete!(account: @account, source: "plaid")
    end

    def import(id, account: @account, amount: 67, currency: "USD", pending: false, pending_transaction_id: nil)
      Account::ProviderImportAdapter.new(account).import_transaction(external_id: id, source: "plaid",
        name: "Provider transaction", date: Date.current, amount: amount, currency: currency,
        pending_transaction_id: pending_transaction_id, allow_heuristic_matching: false,
        extra: { "plaid" => { "pending" => pending } })
    end
end
