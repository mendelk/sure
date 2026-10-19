require "test_helper"

class Account::ProviderReplacementTest < ActiveSupport::TestCase
  setup do
    @user = users(:family_admin)
    @family = @user.family
    @account = make_account("Continuous history")
    @old = make_provider("old")
    AccountProvider.create!(account: @account, provider: @old)
    @replacement = make_provider("replacement")
  end

  test "preview is read only and includes unlinked raw overlap without approving it" do
    existing = make_entry(@account, "Original", external_id: "simplefin_old-purchase")
    @replacement.update!(raw_transactions_payload: [ raw_transaction("new-purchase") ])

    assert_no_difference [ "Entry.count", "AccountProvider.count", "SimplefinTransactionIdentity.count", "ProviderReplacementOperation.count" ] do
      preview = replacement.preview
      assert_equal existing.id, preview[:suggested_matches].sole[:survivor_id]
      assert_equal "raw:#{@replacement.id}:new-purchase", preview[:incoming_entries].sole[:id]
      assert_equal "100.0", preview[:balance][:replacement]
    end
    assert_equal @old.id, @account.account_providers.find_by!(provider_type: "SimplefinAccount").provider_id
  end

  test "explicit raw alias preserves canonical edits and never resurrects a deleted survivor" do
    existing = make_entry(@account, "My edited merchant", external_id: "simplefin_old-purchase", notes: "Keep this note", user_modified: true)
    @replacement.update!(raw_transactions_payload: [ raw_transaction("new-purchase") ])
    preview = replacement.preview
    pair = { incoming_id: preview[:incoming_entries].sole[:id], survivor_id: existing.id }

    result = replacement.apply!(fingerprint: preview[:fingerprint], matches: [ pair ], idempotency_key: "raw-overlap")
    assert_equal @account.id, result[:account_id]
    SimplefinAccount::Transactions::Processor.new(@replacement.reload).process
    assert_equal [ existing.id ], @account.entries.where(entryable_type: "Transaction").pluck(:id)
    assert_equal "My edited merchant", existing.reload.name
    assert_equal "Keep this note", existing.notes
    assert SimplefinAccount.unscoped.find(@old.id).retired_at?

    existing.destroy!
    SimplefinAccount::Transactions::Processor.new(@replacement.reload).process
    assert_empty @account.entries.where(entryable_type: "Transaction")
    assert_nil SimplefinTransactionIdentity.find_by!(simplefin_account: @replacement, external_id: "simplefin_new-purchase").entry_id
  end

  test "keep separate survives normal feed replay even when amount and date match" do
    existing = make_entry(@account, "Separate legitimate purchase", external_id: "simplefin_same-id")
    @replacement.update!(raw_transactions_payload: [ raw_transaction("same-id") ])
    preview = replacement.preview
    replacement.apply!(fingerprint: preview[:fingerprint], matches: [], idempotency_key: "separate", accept_balance_difference: true)
    identity = SimplefinTransactionIdentity.find_by!(simplefin_account: @replacement, external_id: "simplefin_same-id")
    refute_equal existing.id, identity.entry_id
    assert_equal 20.to_d, @account.entries.where(entryable_type: "Transaction").sum(:amount)

    SimplefinAccount::Transactions::Processor.new(@replacement.reload).process
    assert_equal 20.to_d, @account.entries.where(entryable_type: "Transaction").sum(:amount)
    assert_equal [ existing.id, identity.entry_id ].sort, @account.entries.where(entryable_type: "Transaction").pluck(:id).sort
  end

  test "consolidates unique ledger rows and retires source without deleting its relationships" do
    source = make_account("Redundant account")
    AccountProvider.create!(account: source, provider: @replacement)
    historical = make_entry(source, "Unique history", external_id: "simplefin_unique")
    original_id, original_name, original_owner = @account.id, @account.name, @account.owner_id
    preview = replacement.preview
    replacement.apply!(fingerprint: preview[:fingerprint], matches: [], idempotency_key: "move", accept_balance_difference: true)

    assert_equal @account.id, historical.reload.account_id
    assert_equal [ original_id, original_name, original_owner ], @account.reload.attributes.values_at("id", "name", "owner_id")
    assert source.reload.disabled?
    assert source.exclude_from_reports?
    assert_equal 0.to_d, source.balance
    assert_empty source.entries
    assert_equal @account.id, @replacement.reload.current_account.id
  end

  test "merges split children tags receipts and reconciled statements onto explicit survivor" do
    source = make_account("Duplicate")
    AccountProvider.create!(account: source, provider: @replacement)
    survivor = make_entry(@account, "Canonical name", external_id: "simplefin_canonical")
    incoming = make_entry(source, "Incoming", external_id: "simplefin_incoming", notes: "Incoming note")
    incoming.split!([ { amount: 4, name: "First part" }, { amount: 6, name: "Second part" } ])
    child_ids = incoming.child_entries.pluck(:id)
    tag = @family.tags.create!(name: "Reviewed replacement")
    incoming.transaction.tags << tag
    blob = ActiveStorage::Blob.create_and_upload!(io: StringIO.new("receipt"), filename: "receipt.pdf", content_type: "application/pdf")
    incoming.transaction.attachments.attach(blob)
    statement = AccountStatement.new(family: @family, account: source, currency: "USD")
    statement.original_file.attach(blob)
    statement.save!
    incoming.update!(reconciled_at: Time.current, reconciled_by_statement: statement)
    SimplefinTransactionIdentity.create!(simplefin_account: @replacement, external_id: incoming.external_id, entry: incoming)
    preview = replacement.preview

    replacement.apply!(fingerprint: preview[:fingerprint], matches: [ { incoming_id: incoming.id, survivor_id: survivor.id } ], idempotency_key: "split")
    assert_equal child_ids.sort, survivor.child_entries.reload.pluck(:id).sort
    assert_equal [ @account.id ], survivor.child_entries.pluck(:account_id).uniq
    assert_equal [ tag.id ], survivor.transaction.reload.tag_ids
    assert_equal [ blob.id ], survivor.transaction.attachments.pluck(:blob_id)
    assert_equal "Incoming note", survivor.reload.notes
    assert survivor.excluded?
    refute Entry.exists?(incoming.id)
    assert_equal survivor.id, SimplefinTransactionIdentity.find_by!(simplefin_account: @replacement, external_id: "simplefin_incoming").entry_id
    assert_equal statement.id, survivor.reload.reconciled_by_statement_id
    assert_equal @account.id, statement.reload.account_id
  end

  test "rewires transfer leg rather than deleting its counterpart or confirmed status" do
    source = make_account("Duplicate")
    AccountProvider.create!(account: source, provider: @replacement)
    survivor = make_entry(@account, "Canonical payment", external_id: "simplefin_canonical", amount: -10)
    incoming = make_entry(source, "New payment", external_id: "simplefin_incoming", amount: -10)
    bank = make_account("Bank", accountable: Depository.create!(subtype: "checking"))
    outflow = make_entry(bank, "Payment", amount: 10)
    incoming.transaction.update!(kind: "funds_movement")
    outflow.transaction.update!(kind: "cc_payment")
    transfer = Transfer.create!(inflow_transaction: incoming.transaction, outflow_transaction: outflow.transaction, status: "confirmed")
    preview = replacement.preview
    replacement.apply!(fingerprint: preview[:fingerprint], matches: [ { incoming_id: incoming.id, survivor_id: survivor.id } ], idempotency_key: "transfer")

    assert_equal survivor.entryable_id, transfer.reload.inflow_transaction_id
    assert_equal outflow.entryable_id, transfer.outflow_transaction_id
    assert transfer.confirmed?
    assert transfer.valid?
    assert Entry.exists?(outflow.id)
    assert_equal "funds_movement", survivor.transaction.reload.kind
    assert_equal "cc_payment", outflow.transaction.reload.kind
  end

  test "rejects self transfer atomically" do
    source = make_account("Duplicate")
    AccountProvider.create!(account: source, provider: @replacement)
    incoming = make_entry(source, "Payment", amount: -10)
    outflow = make_entry(@account, "Payment out", amount: 10)
    transfer = Transfer.create!(inflow_transaction: incoming.transaction, outflow_transaction: outflow.transaction, status: "confirmed")
    preview = replacement.preview
    assert_raises(Account::ProviderReplacement::Error) do
      replacement.apply!(fingerprint: preview[:fingerprint], matches: [], idempotency_key: "self-transfer", accept_balance_difference: true)
    end
    assert_equal source.id, incoming.reload.account_id
    assert_equal incoming.entryable_id, transfer.reload.inflow_transaction_id
    assert_equal source.id, @replacement.reload.current_account.id
    refute ProviderReplacementOperation.exists?(account: @account, idempotency_key: "self-transfer")
  end

  test "idempotency replays only the exact request and stale preview makes no financial writes" do
    preview = replacement.preview
    result = replacement.apply!(fingerprint: preview[:fingerprint], matches: [], idempotency_key: "retry")
    assert_equal result, replacement.apply!(fingerprint: preview[:fingerprint], matches: [], idempotency_key: "retry")
    assert_raises(Account::ProviderReplacement::Error) do
      replacement.apply!(fingerprint: "different", matches: [], idempotency_key: "retry")
    end

    next_provider = make_provider("third")
    command = Account::ProviderReplacement.new(account: @account, simplefin_account: next_provider, user: @user)
    stale = command.preview
    @account.update!(name: "Changed after preview")
    error = assert_raises(Account::ProviderReplacement::Error) do
      command.apply!(fingerprint: stale[:fingerprint], matches: [], idempotency_key: "stale")
    end
    assert_equal "stale_preview", error.code
    assert_nil @account.reload.simplefin_account_id
    assert_equal @replacement.id, @account.account_providers.find_by!(provider_type: "SimplefinAccount").provider_id
  end

  test "same family membership alone does not authorize source or counterpart writes" do
    inaccessible = @family.accounts.create!(name: "Private", currency: "USD", balance: 100,
      accountable: CreditCard.create!, owner: users(:family_member))
    AccountProvider.create!(account: inaccessible, provider: @replacement)
    assert_not_includes Account::ProviderReplacement.candidates(account: @account, user: @user).map { |candidate| candidate[:id] }, @replacement.id
    error = assert_raises(Account::ProviderReplacement::Error) { replacement.preview }
    assert_equal "forbidden", error.code
  end

  test "manual linking remains available for every existing account type" do
    Accountable::TYPES.each do |type|
      manual = make_account("Manual #{type}", accountable: type.constantize.new)
      provider = make_provider("manual-#{type}")
      provider.update!(current_balance: 100) unless %w[CreditCard Loan].include?(type)
      command = Account::ProviderReplacement.new(account: manual, simplefin_account: provider, user: @user)
      preview = command.preview
      command.apply!(fingerprint: preview[:fingerprint], matches: [], idempotency_key: "manual-#{type}")
      assert_equal manual.id, provider.reload.current_account.id
      assert_equal type, manual.reload.accountable_type
    end
  end

  test "mapping-only move leaves a retained provider ledger untouched" do
    source = accounts(:connected)
    source.update!(owner: @user)
    AccountProvider.create!(account: source, provider: @replacement)
    other_provider = plaid_accounts(:one)
    AccountProvider.find_or_create_by!(account: source, provider: other_provider)
    original = source.entries.pluck(:id)
    original_balance = source.balance
    preview = replacement.preview
    assert_nil preview[:incoming_entries].find { |item| original.include?(item[:id]) }
    replacement.apply!(fingerprint: preview[:fingerprint], matches: [], idempotency_key: "mapping-only")
    assert_equal original.sort, source.entries.pluck(:id).sort
    assert_equal original_balance, source.reload.balance
    refute source.disabled?
    assert_equal source.id, other_provider.reload.current_account.id
  end

  test "posted incoming cannot claim pending survivor" do
    survivor = make_entry(@account, "Pending", amount: 10)
    survivor.transaction.update!(extra: { "simplefin" => { "pending" => true } })
    @replacement.update!(raw_transactions_payload: [ raw_transaction("posted") ])
    preview = replacement.preview
    pair = { incoming_id: preview[:incoming_entries].sole[:id], survivor_id: survivor.id }
    assert_raises(Account::ProviderReplacement::Error) do
      replacement.apply!(fingerprint: preview[:fingerprint], matches: [ pair ], idempotency_key: "pending")
    end
    assert_nil @replacement.reload.current_account
    assert_equal @old.id, @account.account_providers.find_by!(provider_type: "SimplefinAccount").provider_id
  end

  test "balance review recomputes after pairs and requires an audited acknowledgement" do
    survivor = make_entry(@account, "Original purchase", external_id: "simplefin_original")
    @replacement.update!(raw_transactions_payload: [ raw_transaction("new") ])
    preview = replacement.preview
    assert_equal "110.0", preview[:balance][:expected]
    assert_equal "-10.0", preview[:balance][:discrepancy]
    pair = { incoming_id: preview[:incoming_entries].sole[:id], survivor_id: survivor.id }
    matched = replacement.preview(matches: [ pair ])
    assert_equal "100.0", matched[:balance][:expected]
    assert_equal "0.0", matched[:balance][:discrepancy]
    assert_equal preview[:fingerprint], matched[:fingerprint]
    assert_raises(Account::ProviderReplacement::Error) do
      replacement.apply!(fingerprint: preview[:fingerprint], matches: [], idempotency_key: "difference")
    end
    result = replacement.apply!(fingerprint: preview[:fingerprint], matches: [], idempotency_key: "difference", accept_balance_difference: true)
    journal = ProviderReplacementOperation.find(result[:operation_id])
    assert_equal @user.id, journal.actor_id
    assert_equal true, journal.audit["accept_balance_difference"]
    assert_equal "-10.0", journal.audit.dig("balance", "discrepancy")
    assert_equal @account.id, journal.audit.dig("accounts", 0, "id")
  end

  test "generated source anchors are archived while canonical opening history remains" do
    opening = @account.entries.create!(name: "Original opening", date: Date.current - 30, amount: 100, currency: "USD", entryable: Valuation.new(kind: "opening_anchor"))
    @account.entries.create!(name: "Old current", date: Date.current - 1, amount: 100, currency: "USD", entryable: Valuation.new(kind: "current_anchor"))
    source = make_account("Duplicate")
    AccountProvider.create!(account: source, provider: @replacement)
    source_opening = source.entries.create!(name: "Duplicate opening", date: opening.date, amount: 40, currency: "USD", entryable: Valuation.new(kind: "opening_anchor"))
    source_current = source.entries.create!(name: "Duplicate current", date: Date.current - 1, amount: 100, currency: "USD", entryable: Valuation.new(kind: "current_anchor"))
    preview = replacement.preview
    assert_empty preview[:blockers]
    assert_equal [ source_opening.id, source_current.id ].sort, preview[:anchor_actions].map { |row| row[:id] }.sort
    result = replacement.apply!(fingerprint: preview[:fingerprint], matches: [], idempotency_key: "anchors")
    assert_equal opening.id, @account.valuations.opening_anchor.sole.entry.id
    assert_equal 100.to_d, opening.reload.amount
    assert_equal Date.current, @account.valuations.current_anchor.sole.entry.date
    assert_equal 100.to_d, @account.balances.find_by!(date: Date.current, currency: "USD").end_balance
    journal = ProviderReplacementOperation.find(result[:operation_id])
    archived_ids = journal.audit["entries"].map { |row| row.dig("entry", "id") }
    assert_includes archived_ids, source_opening.id
    assert_includes archived_ids, source_current.id
    assert_empty source.entries.reload
  end

  test "late retired activity is retained for explicit review without importing into the ledger" do
    preview = replacement.preview
    replacement.apply!(fingerprint: preview[:fingerprint], matches: [], idempotency_key: "first")
    importer = SimplefinItem::Importer.new(@old.simplefin_item, simplefin_provider: mock())
    importer.send(:import_account, { id: @old.account_id, name: @old.name, balance: -999, currency: "USD", transactions: [ raw_transaction("late") ] })
    assert_empty @account.entries.where(entryable_type: "Transaction")
    assert_equal 100.to_d, @account.reload.balance
    assert_equal [ "late" ], @old.reload.unreviewed_retired_transactions.map { |row| row["id"] }
    assert_includes Account::ProviderReplacement.candidates(account: @account, user: @user).map { |candidate| candidate[:id] }, @replacement.id
    review = replacement.preview
    assert_equal [ "raw:#{@old.id}:late" ], review[:incoming_entries].map { |entry| entry[:id] }
    replacement.apply!(fingerprint: review[:fingerprint], matches: [], idempotency_key: "late", accept_balance_difference: true)
    assert_equal [ "simplefin_late" ], @account.entries.where(entryable_type: "Transaction").pluck(:external_id)
    assert_empty @old.reload.unreviewed_retired_transactions
  end

  test "connection deletion removes retired feeds and identities while retaining operation audit" do
    @replacement.update!(raw_transactions_payload: [ raw_transaction("retained") ])
    preview = replacement.preview
    result = replacement.apply!(fingerprint: preview[:fingerprint], matches: [], idempotency_key: "delete-connection", accept_balance_difference: true)
    ids = [ @old.id, @replacement.id ]
    @replacement.simplefin_item.destroy!
    assert_empty SimplefinAccount.unscoped.where(id: ids)
    assert_empty SimplefinTransactionIdentity.where(simplefin_account_id: ids)
    operation = ProviderReplacementOperation.find(result[:operation_id])
    assert_nil operation.simplefin_account_id
    assert_equal @user.id, operation.audit["actor_id"]
    assert_equal @account.id, @account.reload.id
    assert_equal [ "simplefin_retained" ], @account.entries.where(entryable_type: "Transaction").pluck(:external_id)
  end

  test "future reused upstream ids cannot overwrite history from the former feed" do
    original = make_entry(@account, "Old-feed history", external_id: "simplefin_reused", notes: "Keep")
    preview = replacement.preview
    replacement.apply!(fingerprint: preview[:fingerprint], matches: [], idempotency_key: "install")
    @replacement.update!(raw_transactions_payload: [ raw_transaction("reused") ])
    SimplefinAccount::Transactions::Processor.new(@replacement).process
    identity = SimplefinTransactionIdentity.find_by!(simplefin_account: @replacement, external_id: "simplefin_reused")
    refute_equal original.id, identity.entry_id
    assert_equal "Old-feed history", original.reload.name
    assert_equal "Keep", original.notes
    assert_equal [ original.id, identity.entry_id ].sort, @account.entries.where(entryable_type: "Transaction").pluck(:id).sort
  end

  test "missing dated FX cannot be acknowledged as a numeric balance difference" do
    raw = raw_transaction("foreign").merge("currency" => "EUR")
    @replacement.update!(raw_transactions_payload: [ raw ])
    ExchangeRate.where(from_currency: "EUR", to_currency: "USD", date: Date.current - 2).delete_all
    preview = replacement.preview
    assert_nil preview[:balance][:expected]
    assert_nil preview[:balance][:discrepancy]
    assert preview[:blockers].any? { |message| message.include?("exchange rate") }
    assert_raises(Account::ProviderReplacement::Error) do
      replacement.apply!(fingerprint: preview[:fingerprint], matches: [], idempotency_key: "missing-fx", accept_balance_difference: true)
    end
    assert_nil @replacement.reload.current_account
  end

  test "account deletion clears operation ownership and keeps feed identity tombstones" do
    @replacement.update!(raw_transactions_payload: [ raw_transaction("delete-account") ])
    preview = replacement.preview
    result = replacement.apply!(fingerprint: preview[:fingerprint], matches: [], idempotency_key: "delete-account", accept_balance_difference: true)
    @account.destroy!
    refute ProviderReplacementOperation.exists?(result[:operation_id])
    identity = SimplefinTransactionIdentity.find_by!(simplefin_account: @replacement, external_id: "simplefin_delete-account")
    assert_nil identity.entry_id
    assert_nil @replacement.reload.current_account
  end

  private
    def replacement
      Account::ProviderReplacement.new(account: @account, simplefin_account: @replacement, user: @user)
    end

    def make_account(name, accountable: CreditCard.create!)
      @family.accounts.create!(name: name, currency: "USD", balance: 100, cash_balance: 100, owner: @user, accountable: accountable)
    end

    def make_provider(id)
      @item ||= SimplefinItem.create!(family: @family, name: "SimpleFIN", access_url: "https://example.com/access")
      @item.simplefin_accounts.create!(name: id, account_id: id, account_type: "credit", currency: "USD",
        current_balance: -100, balance_sign_override: "debt", raw_transactions_payload: [])
    end

    def make_entry(account, name, amount: 10, **attributes)
      account.entries.create!(name: name, date: Date.current - 2, amount: amount, currency: "USD", source: "simplefin",
        entryable: Transaction.new, **attributes)
    end

    def raw_transaction(id)
      { "id" => id, "posted" => (Date.current - 2).to_time.to_i, "amount" => "-10.00", "description" => "Purchase" }
    end
end
