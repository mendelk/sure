require "test_helper"

class TransactionsControllerTest < ActionDispatch::IntegrationTest
  include EntryableResourceInterfaceTest, EntriesTestHelper
  include ActionView::RecordIdentifier

  setup do
    sign_in @user = users(:family_admin)
    @entry = entries(:transaction)
  end

  # Bills has always linked out to transactions. Until now nothing linked back,
  # so a transaction that settled a bill was a dead end. The link-back is part
  # of the preview-gated bills surface, so the viewer needs the flag.
  test "a German transaction shows the bill it paid with localized copy" do
    @user.update!(locale: "de")
    @user.update!(preferences: (@user.preferences || {}).merge("preview_features_enabled" => true))
    series = @user.family.recurring_transactions.create!(
      account: accounts(:depository), name: "Watson Property", amount: 2000,
      currency: "USD", expected_day_of_month: 9, status: "active", manual: true,
      bill_type: "bill", last_occurrence_date: Date.current,
      next_expected_date: Date.current
    )
    series.recurring_occurrences.destroy_all
    due = Date.current.beginning_of_month + 8
    occurrence = series.recurring_occurrences.create!(
      family: @user.family, original_due_on: due, due_on: due,
      currency: "USD", expected_amount: 2000, status: "scheduled"
    )
    RecurringTransaction::Allocator.new(occurrence).allocate!(entry: @entry)

    get transaction_url(@entry), headers: { "Turbo-Frame" => "drawer" }

    assert_response :success
    assert_match "Watson Property", response.body
    assert_match bill_path(series), response.body, "the bill must be reachable from the transaction"

    translations = {
      "transactions.show.create_bill" => "Rechnung hinzufügen",
      "transactions.show.applied_to_title" => "Damit bezahlte Rechnungen",
      "transactions.show.applied_to_detail" => "%{amount} für die am %{date} fällige Rechnung",
      "transactions.show.applied_to_unreviewed" => "Prüfung erforderlich"
    }
    translations.each do |key, text|
      assert_equal text, I18n.t(key, locale: :de, fallback: false)
    end

    assert_match translations.fetch("transactions.show.create_bill"), response.body
    assert_match translations.fetch("transactions.show.applied_to_title"), response.body
    assert_match(/für die am .* fällige Rechnung/, response.body)
  end

  test "the bill link-back stays hidden without preview access" do
    series = @user.family.recurring_transactions.create!(
      account: accounts(:depository), name: "Watson Property", amount: 2000,
      currency: "USD", expected_day_of_month: 9, status: "active", manual: true,
      bill_type: "bill", last_occurrence_date: Date.current,
      next_expected_date: Date.current
    )
    series.recurring_occurrences.destroy_all
    due = Date.current.beginning_of_month + 8
    occurrence = series.recurring_occurrences.create!(
      family: @user.family, original_due_on: due, due_on: due,
      currency: "USD", expected_amount: 2000, status: "scheduled"
    )
    RecurringTransaction::Allocator.new(occurrence).allocate!(entry: @entry)

    get transaction_url(@entry), headers: { "Turbo-Frame" => "drawer" }

    assert_response :success
    assert_no_match bill_path(series), response.body,
      "the preview-gated bill link must not render for a user without the flag"
  end


  test "creates with transaction details" do
    assert_difference [ "Entry.count", "Transaction.count" ], 1 do
      post transactions_url, params: {
        entry: {
          account_id: @entry.account_id,
          name: "New transaction",
          date: Date.current,
          currency: "USD",
          amount: 100,
          nature: "inflow",
          entryable_type: @entry.entryable_type,
          entryable_attributes: {
            tag_ids: [ tags(:one).id, tags(:two).id ],
            category_id: Category.first.id,
            merchant_id: Merchant.first.id
          }
        }
      }
    end

    created_entry = Entry.order(:created_at).last

    assert_redirected_to account_url(created_entry.account)
    assert_equal "Transaction created", flash[:notice]
    assert_enqueued_with(job: SyncJob)
  end

  test "resubmitting the same idempotency key does not create a duplicate transaction" do
    idempotency_key = SecureRandom.uuid
    params = {
      entry: {
        account_id: @entry.account_id,
        name: "New transaction",
        date: Date.current,
        currency: "USD",
        amount: 100,
        nature: "inflow",
        entryable_type: @entry.entryable_type,
        entryable_attributes: { category_id: Category.first.id },
        idempotency_key: idempotency_key
      }
    }

    assert_difference [ "Entry.count", "Transaction.count" ], 1 do
      post transactions_url, params: params
    end
    assert_response :redirect
    first_entry = Entry.order(:created_at).last

    # Simulates a double-click or a browser retry: same form, same
    # idempotency key, submitted again after the first request already
    # completed and committed.
    assert_no_difference [ "Entry.count", "Transaction.count" ] do
      post transactions_url, params: params
    end
    assert_response :redirect
    assert_equal "Transaction created", flash[:notice]
    assert_redirected_to account_url(first_entry.account)
  end

  test "the idempotency key does not mark the created transaction as provider-linked" do
    # Regression test: the idempotency key must not be stored in
    # external_id/source (Entry#linked? = external_id.present?), or a plain
    # manual entry would incorrectly look provider-synced - disabling its
    # editable fields in the UI and hiding it from future provider dedup.
    post transactions_url, params: {
      entry: {
        account_id: @entry.account_id,
        name: "New transaction",
        date: Date.current,
        currency: "USD",
        amount: 100,
        nature: "inflow",
        entryable_type: @entry.entryable_type,
        entryable_attributes: { category_id: Category.first.id },
        idempotency_key: SecureRandom.uuid
      }
    }

    created_entry = Entry.order(:created_at).last
    assert_not created_entry.linked?
    assert_nil created_entry.external_id
    assert_nil created_entry.source
  end

  test "handles a genuine concurrent double-submit without raising or duplicating" do
    idempotency_key = SecureRandom.uuid

    # Simulates the race: another request with the same idempotency key wins
    # and commits its INSERT in the window between our pre-check (which
    # therefore still sees nothing, hence the first `nil`) and our own
    # #save (which then hits the real partial unique index on
    # entries(account_id, idempotency_key) and raises RecordNotUnique,
    # exactly like the DB would under real concurrent requests). The rescue
    # then re-runs the same lookup, this time finding the winner.
    winning_entry = @entry.account.entries.create!(
      name: "New transaction", date: Date.current, currency: "USD", amount: 100,
      idempotency_key: idempotency_key,
      entryable: Transaction.new
    )
    TransactionsController.any_instance.stubs(:find_duplicate_manual_entry).returns(nil, winning_entry)
    Entry.any_instance.stubs(:save).raises(ActiveRecord::RecordNotUnique.new("duplicate key value violates unique constraint"))

    assert_no_difference [ "Entry.count", "Transaction.count" ] do
      post transactions_url, params: {
        entry: {
          account_id: @entry.account_id,
          name: "New transaction",
          date: Date.current,
          currency: "USD",
          amount: 100,
          nature: "inflow",
          entryable_type: "Transaction",
          idempotency_key: idempotency_key
        }
      }
    end

    assert_response :redirect
    assert_redirected_to account_url(winning_entry.account)
    assert_equal "Transaction created", flash[:notice]
  end

  test "a RecordNotUnique with no matching entry is not silently swallowed" do
    idempotency_key = SecureRandom.uuid

    # Defensive-branch coverage: if the unique index ever rejects an insert
    # for a reason other than "another request with this exact idempotency
    # key already won" (e.g. a different constraint), we must not pretend it
    # succeeded - the error should propagate instead of being hidden behind
    # a fake success redirect.
    TransactionsController.any_instance.stubs(:find_duplicate_manual_entry).returns(nil)
    Entry.any_instance.stubs(:save).raises(ActiveRecord::RecordNotUnique.new("duplicate key value violates unique constraint"))

    assert_raises(ActiveRecord::RecordNotUnique) do
      post transactions_url, params: {
        entry: {
          account_id: @entry.account_id,
          name: "New transaction",
          date: Date.current,
          currency: "USD",
          amount: 100,
          nature: "inflow",
          entryable_type: "Transaction",
          idempotency_key: idempotency_key
        }
      }
    end
  end

  test "create without an idempotency key still creates a transaction as before" do
    # A raw POST that doesn't go through the rendered form (e.g. a script)
    # simply skips the idempotency check rather than being rejected - the
    # form always supplies a key in normal browser usage.
    assert_difference [ "Entry.count", "Transaction.count" ], 2 do
      2.times do
        post transactions_url, params: {
          entry: {
            account_id: @entry.account_id,
            name: "New transaction",
            date: Date.current,
            currency: "USD",
            amount: 100,
            nature: "inflow",
            entryable_type: "Transaction",
            entryable_attributes: { category_id: Category.first.id }
          }
        }
      end
    end
  end

  test "create without an account re-renders the form instead of raising" do
    assert_no_difference [ "Entry.count", "Transaction.count" ] do
      post transactions_url, params: {
        entry: {
          account_id: "",
          name: "New transaction",
          date: Date.current,
          currency: "USD",
          amount: 100,
          nature: "inflow",
          entryable_type: "Transaction",
          entryable_attributes: {
            category_id: Category.first.id
          }
        }
      }
    end

    assert_response :unprocessable_entity
  end

  test "updates with transaction details" do
    assert_no_difference [ "Entry.count", "Transaction.count" ] do
      patch transaction_url(@entry), params: {
        entry: {
          name: "Updated name",
          date: Date.current,
          currency: "USD",
          amount: 100,
          nature: "inflow",
          entryable_type: @entry.entryable_type,
          notes: "test notes",
          excluded: false,
          entryable_attributes: {
            id: @entry.entryable_id,
            tag_ids: [ tags(:one).id, tags(:two).id ],
            category_id: Category.first.id,
            merchant_id: Merchant.first.id
          }
        }
      }
    end

    @entry.reload

    assert_equal "Updated name", @entry.name
    assert_equal Date.current, @entry.date
    assert_equal "USD", @entry.currency
    assert_equal -100, @entry.amount
    assert_equal [ tags(:one).id, tags(:two).id ].sort, @entry.entryable.tag_ids.sort
    assert_equal Category.first.id, @entry.entryable.category_id
    assert_equal Merchant.first.id, @entry.entryable.merchant_id
    assert_equal "test notes", @entry.notes
    assert_equal false, @entry.excluded

    assert_equal "Transaction updated", flash[:notice]
    assert_redirected_to account_url(@entry.account)
    assert_enqueued_with(job: SyncJob)
  end

  test "show links a transfer leg to its matching transaction" do
    transfer = create_transfer(
      from_account: accounts(:depository),
      to_account: accounts(:credit_card),
      amount: 100
    )
    # create_transfer queries transaction entries during build, leaving a
    # stale nil cached on the in-memory objects — reload before use.
    outflow_entry = transfer.outflow_transaction.reload.entry
    inflow_entry = transfer.inflow_transaction.reload.entry

    get transaction_url(outflow_entry)
    assert_response :success

    assert_select "a[href=?][data-turbo-frame=?][data-turbo-action=?]",
      entry_path(inflow_entry), "drawer", "advance"
  end

  test "re-renders show with mark-recurring state when update fails validation" do
    family = families(:empty)
    sign_in users(:empty)
    account = family.accounts.create! name: "Test", balance: 0, currency: "USD", accountable: Depository.new
    merchant = family.merchants.create! name: "Test Merchant"
    entry = create_transaction(account: account, amount: 100, merchant: merchant)

    family.recurring_transactions.create!(
      account: account,
      merchant: merchant,
      amount: entry.amount,
      currency: entry.currency,
      expected_day_of_month: entry.date.day,
      last_occurrence_date: entry.date,
      next_expected_date: 1.month.from_now,
      status: "active",
      manual: true,
      occurrence_count: 1
    )

    patch transaction_url(entry), params: {
      entry: {
        name: "",
        date: entry.date,
        currency: entry.currency,
        amount: entry.amount.abs,
        nature: "outflow",
        entryable_type: entry.entryable_type,
        entryable_attributes: { id: entry.entryable_id }
      }
    }

    assert_response :unprocessable_entity
    assert_includes response.body, "A manual recurring transaction already exists for this pattern"
    assert_select "button[disabled]", text: /Mark as Recurring/
  end

  test "turbo_stream update refreshes mark-recurring state when it newly matches" do
    family = families(:empty)
    sign_in users(:empty)
    account = family.accounts.create! name: "Test", balance: 0, currency: "USD", accountable: Depository.new
    merchant = family.merchants.create! name: "Test Merchant"
    entry = create_transaction(account: account, amount: 100, name: "Other Name")

    family.recurring_transactions.create!(
      account: account,
      merchant: merchant,
      amount: entry.amount,
      currency: entry.currency,
      expected_day_of_month: entry.date.day,
      last_occurrence_date: entry.date,
      next_expected_date: 1.month.from_now,
      status: "active",
      manual: true,
      occurrence_count: 1
    )

    patch transaction_url(entry), params: {
      entry: {
        date: entry.date,
        currency: entry.currency,
        amount: entry.amount.abs,
        nature: "outflow",
        entryable_type: entry.entryable_type,
        entryable_attributes: { id: entry.entryable_id, merchant_id: merchant.id }
      }
    }, as: :turbo_stream

    assert_response :success
    assert_select "turbo-stream[target='#{dom_id(entry, :mark_recurring)}'] button[disabled]", text: /Mark as Recurring/
  end


  test "can update notes on split child transaction" do
    parent = create_transaction(account: accounts(:depository), amount: 100)
    parent.split!([ { name: "Part 1", amount: 60, category_id: nil }, { name: "Part 2", amount: 40, category_id: nil } ])
    child = parent.child_entries.first

    patch transaction_url(child), params: {
      entry: { notes: "split child note", entryable_attributes: { id: child.entryable_id } }
    }

    assert_response :redirect
    assert_equal "split child note", child.reload.notes
  end

  test "can update tags on split child transaction" do
    parent = create_transaction(account: accounts(:depository), amount: 100)
    parent.split!([ { name: "Part 1", amount: 60, category_id: nil }, { name: "Part 2", amount: 40, category_id: nil } ])
    child = parent.child_entries.first
    tag = tags(:one)

    patch transaction_url(child), params: {
      entry: { entryable_attributes: { id: child.entryable_id, tag_ids: [ tag.id ] } }
    }

    assert_response :redirect
    assert_equal [ tag.id ], child.reload.entryable.tag_ids
  end

  test "can update tags through tag-only endpoint" do
    patch tags_transaction_url(@entry, format: :json), params: {
      tag_ids: [ tags(:one).id, tags(:two).id ]
    }

    assert_response :success
    assert_equal [ tags(:one).id, tags(:two).id ].sort, @entry.reload.entryable.tag_ids.sort
    assert_equal @entry.entryable.tag_ids.sort, JSON.parse(response.body)["tag_ids"].sort
  end

  test "tag-only endpoint ignores tags from another family" do
    other_tag = users(:empty).family.tags.create!(name: "Other family")

    patch tags_transaction_url(@entry, format: :json), params: {
      tag_ids: [ tags(:one).id, other_tag.id ]
    }

    assert_response :success
    assert_equal [ tags(:one).id ], @entry.reload.entryable.tag_ids
  end

  test "tag-only endpoint locks tags when clearing all tags" do
    @entry.entryable.update!(tag_ids: [ tags(:one).id ], locked_attributes: {})

    patch tags_transaction_url(@entry, format: :json), params: {
      tag_ids: []
    }, as: :json

    assert_response :success
    assert_empty @entry.reload.entryable.tag_ids
    assert @entry.entryable.locked?(:tag_ids)
  end

  test "tag-only endpoint returns forbidden json for read-only users" do
    sign_in users(:family_member)
    read_only_entry = entries(:transfer_in)
    original_tag_ids = read_only_entry.entryable.tag_ids

    patch tags_transaction_url(read_only_entry), params: {
      tag_ids: [ tags(:one).id ]
    }, headers: {
      "Accept" => "application/json"
    }

    assert_response :forbidden
    assert_equal "application/json", response.media_type
    assert_equal I18n.t("accounts.not_authorized"), JSON.parse(response.body)["error"]
    assert_equal original_tag_ids, read_only_entry.reload.entryable.tag_ids
  end

  test "tag-only endpoint toggles a single tag and streams the row's tag UI" do
    @entry.entryable.update!(tag_ids: [ tags(:one).id ], locked_attributes: {})

    patch tags_transaction_url(@entry), params: { toggle_tag_id: tags(:two).id }, as: :turbo_stream

    assert_response :success
    assert_equal [ tags(:one).id, tags(:two).id ].sort, @entry.reload.entryable.tag_ids.sort
    assert @entry.entryable.locked?(:tag_ids)

    patch tags_transaction_url(@entry), params: { toggle_tag_id: tags(:one).id }, as: :turbo_stream

    assert_response :success
    assert_equal [ tags(:two).id ], @entry.reload.entryable.tag_ids
  end

  test "tag-only endpoint falls back to a redirect for plain HTML toggles" do
    @entry.entryable.update!(tag_ids: [], locked_attributes: {})

    patch tags_transaction_url(@entry), params: { toggle_tag_id: tags(:one).id }

    assert_redirected_to transaction_path(@entry)
    assert_equal [ tags(:one).id ], @entry.reload.entryable.tag_ids
  end

  test "tag-only endpoint does not toggle tags from another family" do
    other_tag = users(:empty).family.tags.create!(name: "Other family")
    original_tag_ids = @entry.entryable.tag_ids

    patch tags_transaction_url(@entry), params: { toggle_tag_id: other_tag.id }, as: :turbo_stream

    assert_response :not_found
    assert_equal original_tag_ids, @entry.reload.entryable.tag_ids
  end

  test "tag-only endpoint does not toggle tags for read-only users" do
    sign_in users(:family_member)
    read_only_entry = entries(:transfer_in)
    original_tag_ids = read_only_entry.entryable.tag_ids

    patch tags_transaction_url(read_only_entry), params: { toggle_tag_id: tags(:one).id }, as: :turbo_stream

    assert_equal original_tag_ids, read_only_entry.reload.entryable.tag_ids
  end








  test "mark_as_recurring creates a manual recurring transaction" do
    family = families(:empty)
    sign_in users(:empty)
    account = family.accounts.create! name: "Test", balance: 0, currency: "USD", accountable: Depository.new
    merchant = family.merchants.create! name: "Test Merchant"
    entry = create_transaction(account: account, amount: 100, merchant: merchant)
    transaction = entry.entryable

    assert_difference "family.recurring_transactions.count", 1 do
      post mark_as_recurring_transaction_path(transaction)
    end

    assert_redirected_to transactions_path
    assert_equal "Transaction marked as recurring", flash[:notice]

    recurring = family.recurring_transactions.last
    assert_equal true, recurring.manual, "Expected recurring transaction to be manual"
    assert_equal merchant.id, recurring.merchant_id
    assert_equal entry.currency, recurring.currency
    assert_equal entry.date.day, recurring.expected_day_of_month
  end

  test "mark_as_recurring shows alert if recurring transaction already exists" do
    family = families(:empty)
    sign_in users(:empty)
    account = family.accounts.create! name: "Test", balance: 0, currency: "USD", accountable: Depository.new
    merchant = family.merchants.create! name: "Test Merchant"
    entry = create_transaction(account: account, amount: 100, merchant: merchant)
    transaction = entry.entryable

    # Create existing recurring transaction
    family.recurring_transactions.create!(
      account: account,
      merchant: merchant,
      amount: entry.amount,
      currency: entry.currency,
      expected_day_of_month: entry.date.day,
      last_occurrence_date: entry.date,
      next_expected_date: 1.month.from_now,
      status: "active",
      manual: true,
      occurrence_count: 1
    )

    assert_no_difference "RecurringTransaction.count" do
      post mark_as_recurring_transaction_path(transaction)
    end

    assert_redirected_to transactions_path
    assert_equal "A manual recurring transaction already exists for this pattern", flash[:alert]
  end

  test "mark_as_recurring allows a second manual recurring transaction with same merchant but different amount" do
    family = families(:empty)
    sign_in users(:empty)
    account = family.accounts.create! name: "Test", balance: 0, currency: "USD", accountable: Depository.new
    merchant = family.merchants.create! name: "Test Merchant"
    entry = create_transaction(account: account, amount: 34, merchant: merchant)
    transaction = entry.entryable

    # Existing manual recurring row for the same merchant, but a different amount
    family.recurring_transactions.create!(
      account: account,
      merchant: merchant,
      amount: 12,
      currency: entry.currency,
      expected_day_of_month: entry.date.day,
      last_occurrence_date: entry.date,
      next_expected_date: 1.month.from_now,
      status: "active",
      manual: true,
      occurrence_count: 1
    )

    assert_difference "family.recurring_transactions.count", 1 do
      post mark_as_recurring_transaction_path(transaction)
    end

    assert_redirected_to transactions_path
    assert_equal "Transaction marked as recurring", flash[:notice]
  end

  test "mark_as_recurring allows a second manual recurring transaction with same name but different amount" do
    family = families(:empty)
    sign_in users(:empty)
    account = family.accounts.create! name: "Test", balance: 0, currency: "USD", accountable: Depository.new
    entry = create_transaction(account: account, name: "Example Payee", amount: 34)
    transaction = entry.entryable

    # Existing manual recurring row for the same payee name, but a different amount
    family.recurring_transactions.create!(
      account: account,
      name: "Example Payee",
      amount: 12,
      currency: entry.currency,
      expected_day_of_month: entry.date.day,
      last_occurrence_date: entry.date,
      next_expected_date: 1.month.from_now,
      status: "active",
      manual: true,
      occurrence_count: 1
    )

    assert_difference "family.recurring_transactions.count", 1 do
      post mark_as_recurring_transaction_path(transaction)
    end

    assert_redirected_to transactions_path
    assert_equal "Transaction marked as recurring", flash[:notice]
  end

  test "mark_as_recurring shows alert if recurring transaction with same name and amount already exists" do
    family = families(:empty)
    sign_in users(:empty)
    account = family.accounts.create! name: "Test", balance: 0, currency: "USD", accountable: Depository.new
    entry = create_transaction(account: account, name: "Example Payee", amount: 100)
    transaction = entry.entryable

    family.recurring_transactions.create!(
      account: account,
      name: "Example Payee",
      amount: entry.amount,
      currency: entry.currency,
      expected_day_of_month: entry.date.day,
      last_occurrence_date: entry.date,
      next_expected_date: 1.month.from_now,
      status: "active",
      manual: true,
      occurrence_count: 1
    )

    assert_no_difference "RecurringTransaction.count" do
      post mark_as_recurring_transaction_path(transaction)
    end

    assert_redirected_to transactions_path
    assert_equal "A manual recurring transaction already exists for this pattern", flash[:alert]
  end

  test "mark_as_recurring shows already-exists alert when a concurrent request wins the race" do
    family = families(:empty)
    sign_in users(:empty)
    account = family.accounts.create! name: "Test", balance: 0, currency: "USD", accountable: Depository.new
    merchant = family.merchants.create! name: "Test Merchant"
    entry = create_transaction(account: account, amount: 100, merchant: merchant)
    transaction = entry.entryable

    # Simulate another request creating the identical pattern between our
    # pre-check and our create call.
    RecurringTransaction.expects(:create_from_transaction).raises(
      ActiveRecord::RecordNotUnique.new("duplicate key value violates unique constraint")
    )

    assert_no_difference "RecurringTransaction.count" do
      post mark_as_recurring_transaction_path(transaction)
    end

    assert_redirected_to transactions_path
    assert_equal "A manual recurring transaction already exists for this pattern", flash[:alert]
  end

  test "mark_as_recurring handles validation errors gracefully" do
    family = families(:empty)
    sign_in users(:empty)
    account = family.accounts.create! name: "Test", balance: 0, currency: "USD", accountable: Depository.new
    merchant = family.merchants.create! name: "Test Merchant"
    entry = create_transaction(account: account, amount: 100, merchant: merchant)
    transaction = entry.entryable

    # Stub create_from_transaction to raise a validation error
    RecurringTransaction.expects(:create_from_transaction).raises(
      ActiveRecord::RecordInvalid.new(
        RecurringTransaction.new.tap { |rt| rt.errors.add(:base, "Test validation error") }
      )
    )

    assert_no_difference "RecurringTransaction.count" do
      post mark_as_recurring_transaction_path(transaction)
    end

    assert_redirected_to transactions_path
    assert_equal "Failed to create recurring transaction. Please check the transaction details and try again.", flash[:alert]
  end

  test "mark_as_recurring handles unexpected errors gracefully" do
    family = families(:empty)
    sign_in users(:empty)
    account = family.accounts.create! name: "Test", balance: 0, currency: "USD", accountable: Depository.new
    merchant = family.merchants.create! name: "Test Merchant"
    entry = create_transaction(account: account, amount: 100, merchant: merchant)
    transaction = entry.entryable

    # Stub create_from_transaction to raise an unexpected error
    RecurringTransaction.expects(:create_from_transaction).raises(StandardError.new("Unexpected error"))

    assert_no_difference "RecurringTransaction.count" do
      post mark_as_recurring_transaction_path(transaction)
    end

    assert_redirected_to transactions_path
    assert_equal "An unexpected error occurred while creating the recurring transaction", flash[:alert]
  end

  test "unlock clears protection flags on user-modified entry" do
    family = families(:empty)
    sign_in users(:empty)
    account = family.accounts.create! name: "Test", balance: 0, currency: "USD", accountable: Depository.new
    entry = create_transaction(account: account, amount: 100)
    transaction = entry.entryable

    # Mark as protected with locked_attributes on both entry and entryable
    entry.update!(user_modified: true, locked_attributes: { "date" => Time.current.iso8601 })
    transaction.update!(locked_attributes: { "category_id" => Time.current.iso8601 })

    assert entry.reload.protected_from_sync?

    post unlock_transaction_path(transaction)

    assert_redirected_to transactions_path
    assert_equal "Entry unlocked. It may be updated on next sync.", flash[:notice]

    entry.reload
    assert_not entry.user_modified?
    assert_empty entry.locked_attributes, "Entry locked_attributes should be cleared"
    assert_empty entry.entryable.locked_attributes, "Transaction locked_attributes should be cleared"
    assert_not entry.protected_from_sync?
  end

  test "new renders category and merchant selectors in German" do
    get new_transaction_url(locale: "de")

    assert_response :success

    assert_select "[data-controller='category-select']" do
      assert_select "input[type='search'][placeholder=?]", "Kategorien suchen"
      assert_select "[data-category-select-create-label-value=?]", "„__CATEGORY_NAME__“ erstellen"
      assert_select "[data-category-select-create-error-message-value=?]", "Kategorie konnte nicht erstellt werden"
    end

    assert_select "[data-controller='merchant-select']" do
      assert_select "input[type='search'][placeholder=?]", "Händler suchen oder erstellen"
      assert_select "[data-merchant-select-error-message-value=?]", "Händler konnte nicht erstellt werden"
      assert_select "[data-merchant-select-target='createForm']", text: /Erstellen/
    end
  end

  test "new groups subcategories immediately after their parent in the category select" do
    get new_transaction_url
    assert_response :success

    doc = Nokogiri::HTML::Document.parse(response.body)
    trigger = doc.at_css("#category_id_trigger")
    assert_not_nil trigger, "expected the category select trigger button to render"

    wrapper = trigger.ancestors(".relative").first
    category_values = wrapper.css("[data-value]").map { |node| node["data-value"] }

    parent_index = category_values.index(categories(:food_and_drink).id)
    child_index = category_values.index(categories(:subcategory).id)

    assert_not_nil parent_index
    assert_not_nil child_index
    assert_equal parent_index + 1, child_index

    child_option = wrapper.at_css("[data-category-id='#{categories(:subcategory).id}']")
    assert_not_nil child_option, "expected the subcategory option to render"
    assert child_option.at_css("[data-testid='category-select-subcategory-indicator']"),
           "expected the subcategory option to show the hierarchy indicator used in Settings"
  end

  test "new renders a search box for account selection" do
    get new_transaction_url
    assert_response :success

    doc = Nokogiri::HTML::Document.parse(response.body)
    trigger = doc.at_css("#account_id_trigger")
    assert_not_nil trigger, "expected the account select trigger button to render"

    wrapper = trigger.ancestors(".relative").first
    assert_not_nil wrapper.at_css("input[type='search']"), "expected a search input inside the account select"
  end

  test "new with duplicate_entry_id pre-fills form from source transaction" do
    @entry.reload

    get new_transaction_url(duplicate_entry_id: @entry.id)
    assert_response :success
    assert_select "input[name='entry[name]'][value=?]", @entry.name
    assert_select "input[type='number'][name='entry[amount]']" do |elements|
      assert_equal sprintf("%.2f", @entry.amount.abs), elements.first["value"]
    end
    assert_select "input[type='hidden'][name='entry[entryable_attributes][merchant_id]']"
  end

  test "new with invalid duplicate_entry_id renders empty form" do
    get new_transaction_url(duplicate_entry_id: -1)
    assert_response :success
    assert_select "input[name='entry[name]']" do |elements|
      assert_nil elements.first["value"]
    end
  end

  test "new with duplicate_entry_id from another family does not prefill form" do
    other_family = families(:empty)
    other_account = other_family.accounts.create!(name: "Other", balance: 0, currency: "USD", accountable: Depository.new)
    other_entry = create_transaction(account: other_account, name: "Should not leak", amount: 50)

    get new_transaction_url(duplicate_entry_id: other_entry.id)
    assert_response :success
    assert_select "input[name='entry[name]']" do |elements|
      assert_nil elements.first["value"]
    end
  end

  test "new preloads transaction form option data" do
    family = families(:empty)
    user = users(:empty)
    sign_in user

    manual_account_ids = []
    4.times do |idx|
      account = family.accounts.create!(
        name: "Manual Account #{idx}",
        balance: 0,
        currency: "USD",
        accountable: Depository.new
      )
      assert Account.manual.active.exists?(id: account.id), "Account should be included in the manual active scope"
      manual_account_ids << account.id
      family.categories.create!(
        name: "Category #{idx}",
        color: "#000000",
        lucide_icon: "shapes"
      )
      family.merchants.create!(name: "Merchant #{idx}")
      family.tags.create!(name: "Tag #{idx}")
    end

    inaccessible_account = families(:dylan_family).accounts.create!(
      name: "Other Family Account",
      balance: 0,
      currency: "EUR",
      accountable: Depository.new
    )

    queries = capture_sql_queries { get new_transaction_url }

    assert_response :success
    assert_select "input[name='entry[account_id]']"
    assert_select "input[name='entry[entryable_attributes][category_id]']"
    assert_select "input[name='entry[entryable_attributes][merchant_id]']"
    assert_select "form[data-transaction-form-account-currencies-value]" do |forms|
      account_currencies = JSON.parse(forms.first["data-transaction-form-account-currencies-value"])
      manual_account_ids.each do |account_id|
        assert_equal "USD", account_currencies[account_id.to_s]
      end
      assert_nil account_currencies[inaccessible_account.id.to_s]
    end

    assert_empty queries.grep(/FROM "account_providers" WHERE "account_providers"\."account_id" =/)
    assert_operator queries.grep(/FROM "active_storage_attachments" WHERE "active_storage_attachments"\."record_id" =/).size, :<=, 1
    assert_operator queries.grep(/SELECT "categories"\.\* FROM "categories" WHERE "categories"\."family_id" =/).size, :<=, 1
  end

  test "unlock clears import_locked flag" do
    family = families(:empty)
    sign_in users(:empty)
    account = family.accounts.create! name: "Test", balance: 0, currency: "USD", accountable: Depository.new
    entry = create_transaction(account: account, amount: 100)
    transaction = entry.entryable

    # Mark as import locked
    entry.update!(import_locked: true)

    assert entry.reload.protected_from_sync?

    post unlock_transaction_path(transaction)

    assert_redirected_to transactions_path
    entry.reload
    assert_not entry.import_locked?
    assert_not entry.protected_from_sync?
  end

  test "exchange_rate endpoint returns rate for different currencies" do
    ExchangeRate.expects(:find_or_fetch_rate)
                .with(from: "EUR", to: "USD", date: Date.current)
                .returns(1.2)

    get exchange_rate_url, params: {
      from: "EUR",
      to: "USD",
      date: Date.current
    }

    assert_response :success
    json_response = JSON.parse(response.body)
    assert_equal 1.2, json_response["rate"]
  end

  test "exchange_rate endpoint returns same_currency for matching currencies" do
    get exchange_rate_url, params: {
      from: "USD",
      to: "USD"
    }

    assert_response :success
    json_response = JSON.parse(response.body)
    assert json_response["same_currency"]
    assert_equal 1.0, json_response["rate"]
  end

  test "exchange_rate endpoint uses provided date" do
    custom_date = 3.days.ago.to_date
    ExchangeRate.expects(:find_or_fetch_rate)
                .with(from: "EUR", to: "USD", date: custom_date)
                .returns(1.25)

    get exchange_rate_url, params: {
      from: "EUR",
      to: "USD",
      date: custom_date
    }

    assert_response :success
    json_response = JSON.parse(response.body)
    assert_equal 1.25, json_response["rate"]
  end

  test "exchange_rate endpoint returns 400 when from currency is missing" do
    get exchange_rate_url, params: {
      to: "USD"
    }

    assert_response :bad_request
    json_response = JSON.parse(response.body)
    assert_equal "from and to currencies are required", json_response["error"]
  end

  test "exchange_rate endpoint returns 400 when to currency is missing" do
    get exchange_rate_url, params: {
      from: "EUR"
    }

    assert_response :bad_request
    json_response = JSON.parse(response.body)
    assert_equal "from and to currencies are required", json_response["error"]
  end

  test "exchange_rate endpoint returns 400 on invalid date format" do
    get exchange_rate_url, params: {
      from: "EUR",
      to: "USD",
      date: "not-a-date"
    }

    assert_response :bad_request
    json_response = JSON.parse(response.body)
    assert_equal "Invalid date format", json_response["error"]
  end

  test "exchange_rate endpoint returns 404 when rate not found" do
    ExchangeRate.expects(:find_or_fetch_rate)
                .with(from: "EUR", to: "USD", date: Date.current)
                .returns(nil)

    get exchange_rate_url, params: {
      from: "EUR",
      to: "USD"
    }

    assert_response :not_found
    json_response = JSON.parse(response.body)
    assert_equal "Exchange rate not found", json_response["error"]
  end

  test "creates transaction with custom exchange rate" do
    account = @user.family.accounts.create!(
      name: "USD Account",
      currency: "USD",
      balance: 1000,
      accountable: Depository.new
    )

    assert_difference [ "Entry.count", "Transaction.count" ], 1 do
      post transactions_url, params: {
        entry: {
          account_id: account.id,
          name: "EUR transaction with custom rate",
          date: Date.current,
          currency: "EUR",
          amount: 100,
          nature: "outflow",
          entryable_type: "Transaction",
          entryable_attributes: {
            category_id: Category.first.id,
            exchange_rate: "1.5"
          }
        }
      }
    end

    created_entry = Entry.order(:created_at).last
    assert_equal "EUR", created_entry.currency
    assert_equal 100, created_entry.amount
    assert_equal 1.5, created_entry.transaction.extra["exchange_rate"]
  end

  test "creates transaction without custom exchange rate" do
    account = @user.family.accounts.create!(
      name: "USD Account",
      currency: "USD",
      balance: 1000,
      accountable: Depository.new
    )

    assert_difference [ "Entry.count", "Transaction.count" ], 1 do
      post transactions_url, params: {
        entry: {
          account_id: account.id,
          name: "EUR transaction without custom rate",
          date: Date.current,
          currency: "EUR",
          amount: 100,
          nature: "outflow",
          entryable_type: "Transaction",
          entryable_attributes: {
            category_id: Category.first.id
          }
        }
      }
    end

    created_entry = Entry.order(:created_at).last
    assert_nil created_entry.transaction.extra["exchange_rate"]
  end

  private

    def capture_sql_queries
      queries = []
      callback = lambda do |_name, _started, _finished, _unique_id, payload|
        next if payload[:cached]
        next if %w[SCHEMA TRANSACTION].include?(payload[:name])

        queries << payload[:sql].squish
      end

      ActiveSupport::Notifications.subscribed(callback, "sql.active_record") do
        yield
      end

      queries
    end
end
