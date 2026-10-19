require "test_helper"

class SimplefinItem::RepairStaleLinkagesTest < ActiveSupport::TestCase
  setup do
    @family = families(:dylan_family)
    @item = SimplefinItem.create!(family: @family, name: "SF Conn", access_url: "https://example.com/access")
    @account = @family.accounts.create!(name: "Business Checking", currency: "USD", balance: 100, accountable: Depository.create!(subtype: "checking"))
    @old = make_provider("old")
    AccountProvider.create!(account: @account, provider: @old)
    @fresh = make_provider("fresh", transactions: [ raw("fresh-transaction", -10) ])
  end

  test "does not hijack a linked account when an unlinked account merely shares its name (GH #2852)" do
    @item.upstream_account_ids = [ @old.account_id, @fresh.account_id ]
    @item.repair_stale_linkages([ @old, @fresh ])
    assert_equal @account.id, @old.reload.current_account.id
    assert_nil @fresh.reload.current_account
  end

  test "still repairs a genuinely stale linkage when the old account_id is absent upstream" do
    @old.update!(raw_transactions_payload: [ raw("old-transaction", -5) ])
    @item.upstream_account_ids = [ @fresh.account_id ]
    @item.repair_stale_linkages([ @old, @fresh ])
    assert_equal @account.id, @fresh.reload.current_account.id
    assert_nil @old.reload.current_account
    assert_equal %w[fresh-transaction old-transaction], @fresh.raw_transactions_payload.map { |row| row["id"] }.sort
    assert @old.retired_at?
    assert_equal @account.id, @old.retired_account_id
  end

  test "skips repair when upstream_account_ids is unavailable" do
    assert_difference "DebugLogEntry.count", 1 do
      @item.repair_stale_linkages([ @old, @fresh ])
    end
    assert_equal @account.id, @old.reload.current_account.id
    assert_nil @fresh.reload.current_account
    assert_equal "provider_sync_warning", DebugLogEntry.last.category
  end

  test "does not act on an ambiguous multi-way name match" do
    other = make_provider("other")
    other_account = @family.accounts.create!(name: "Other Checking", currency: "USD", balance: 100, accountable: Depository.create!)
    AccountProvider.create!(account: other_account, provider: other)
    @item.upstream_account_ids = [ @fresh.account_id ]
    @item.repair_stale_linkages([ @old, other, @fresh ])
    assert_equal @account.id, @old.reload.current_account.id
    assert_equal other_account.id, other.reload.current_account.id
    assert_nil @fresh.reload.current_account
  end

  test "changed upstream transaction ids with overlapping ledger activity require explicit review" do
    @account.entries.create!(name: "Existing coffee", date: Date.current - 2, amount: 10, currency: "USD", source: "simplefin",
      external_id: "simplefin_old-coffee", entryable: Transaction.new)
    @item.upstream_account_ids = [ @fresh.account_id ]
    @item.repair_stale_linkages([ @old, @fresh ])
    assert_equal @account.id, @old.reload.current_account.id
    assert_nil @fresh.reload.current_account
    assert_nil @old.retired_at
  end

  test "one absent provider cannot automatically claim two same-named replacements" do
    second = make_provider("second", transactions: [ raw("another", -20) ])
    @item.upstream_account_ids = [ @fresh.account_id, second.account_id ]
    @item.repair_stale_linkages([ @old, @fresh, second ])
    assert_equal @account.id, @old.reload.current_account.id
    assert_nil @fresh.reload.current_account
    assert_nil second.reload.current_account
  end

  private
    def make_provider(id, transactions: [])
      @item.simplefin_accounts.create!(account_id: id, name: "Business", currency: "USD", account_type: "checking",
        current_balance: 100, raw_transactions_payload: transactions)
    end

    def raw(id, amount)
      { "id" => id, "posted" => (Date.current - 2).to_time.to_i, "amount" => amount.to_s, "description" => "Business transaction" }
    end
end
