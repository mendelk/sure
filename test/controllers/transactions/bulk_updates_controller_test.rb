require "test_helper"

class Transactions::BulkUpdatesControllerTest < ActionDispatch::IntegrationTest
  include EntriesTestHelper

  setup do
    sign_in @user = users(:family_admin)
  end

  test "bulk update" do
    transactions = @user.family.entries.transactions

    assert_difference [ "Entry.count", "Transaction.count" ], 0 do
      post transactions_bulk_update_url, params: {
        bulk_update: {
          entry_ids: transactions.map(&:id),
          date: 1.day.ago.to_date,
          category_id: Category.second.id,
          merchant_id: Merchant.second.id,
          tag_ids: [ Tag.first.id, Tag.second.id ],
          notes: "Updated note"
        }
      }
    end

    assert_redirected_to transactions_url
    assert_equal "#{transactions.count} transactions updated", flash[:notice]

    transactions.reload.each do |transaction|
      assert_equal 1.day.ago.to_date, transaction.date
      assert_equal Category.second, transaction.transaction.category
      assert_equal Merchant.second, transaction.transaction.merchant
      assert_equal "Updated note", transaction.notes
      assert_equal [ Tag.first.id, Tag.second.id ], transaction.entryable.tag_ids.sort
    end
  end

  test "bulk update preloads transaction records" do
    transaction_ids = @user.family.entries.transactions.limit(4).pluck(:id)

    queries = capture_sql_queries do
      post transactions_bulk_update_url, params: {
        bulk_update: {
          entry_ids: transaction_ids,
          notes: "Updated in bulk"
        }
      }
    end

    assert_redirected_to transactions_url
    assert_empty queries.grep(
      /SELECT "transactions"\.\* FROM "transactions" WHERE "transactions"\."id" =/
    )
  end

  test "bulk update preserves tags when tag_ids not provided" do
    transaction_entry = @user.family.entries.transactions.first
    original_tags = [ Tag.first, Tag.second ]
    transaction_entry.transaction.tags = original_tags
    transaction_entry.transaction.save!

    # Update only the category, without providing tag_ids
    post transactions_bulk_update_url, params: {
      bulk_update: {
        entry_ids: [ transaction_entry.id ],
        category_id: Category.second.id
      }
    }

    assert_redirected_to transactions_url

    transaction_entry.reload
    assert_equal Category.second, transaction_entry.transaction.category
    # Tags should be preserved since tag_ids was not in the request
    assert_equal original_tags.map(&:id).sort, transaction_entry.transaction.tag_ids.sort
  end

  test "bulk update clears tags when tag_ids is blank string array (web multi-select None)" do
    transaction_entry = @user.family.entries.transactions.first
    original_tags = [ Tag.first, Tag.second ]
    transaction_entry.transaction.tags = original_tags
    transaction_entry.transaction.save!

    # For a multiple select, choosing the blank ("None") option submits a blank value.
    post transactions_bulk_update_url, params: {
      bulk_update: {
        entry_ids: [ transaction_entry.id ],
        category_id: Category.second.id,
        tag_ids: [ "" ]
      }
    }

    assert_redirected_to transactions_url

    transaction_entry.reload
    assert_equal Category.second, transaction_entry.transaction.category
    assert_empty transaction_entry.transaction.tags
  end

  test "bulk update clears tags when empty tag_ids explicitly provided (JSON)" do
    transaction_entry = @user.family.entries.transactions.first
    transaction_entry.transaction.tags = [ Tag.first, Tag.second ]
    transaction_entry.transaction.save!

    post transactions_bulk_update_url,
         params: {
           bulk_update: {
             entry_ids: [ transaction_entry.id ],
             category_id: Category.second.id,
             tag_ids: []
           }
         },
         as: :json

    transaction_entry.reload
    assert_equal Category.second, transaction_entry.transaction.category
    assert_empty transaction_entry.transaction.tags
  end

  test "bulk update replaces tags when tag_ids explicitly provided" do
    transaction_entry = @user.family.entries.transactions.first
    transaction_entry.transaction.tags = [ Tag.first ]
    transaction_entry.transaction.save!

    new_tag = Tag.second

    post transactions_bulk_update_url, params: {
      bulk_update: {
        entry_ids: [ transaction_entry.id ],
        tag_ids: [ new_tag.id ]
      }
    }

    assert_redirected_to transactions_url

    transaction_entry.reload
    assert_equal [ new_tag.id ], transaction_entry.transaction.tag_ids
  end

  test "annotation only bulk edits preserve structural fields and reject mixed writes" do
    entry = shared_entry("read_write")
    sign_in users(:family_member)

    get new_transactions_bulk_update_url(format: :json), params: { bulk_update: { entry_ids: [ entry.id ] } }
    assert_response :success
    assert_equal({ "can_edit" => false, "can_annotate" => true }, response.parsed_body.fetch("permissions"))

    post transactions_bulk_update_url, params: { bulk_update: { entry_ids: [ entry.id ], notes: "Allowed annotation" } }, as: :json
    assert_equal "Allowed annotation", entry.reload.notes

    post transactions_bulk_update_url, params: {
      bulk_update: { entry_ids: [ entry.id ], name: "Forbidden rename", notes: "Must not save" }
    }, as: :json
    assert_response :forbidden
    assert_equal "Shared purchase", entry.reload.name
    assert_equal "Allowed annotation", entry.notes
  end

  test "bulk edit rejects selections containing read only or inaccessible accounts without partial writes" do
    writable = shared_entry("full_control")
    restricted = shared_entry("read_only")
    sign_in users(:family_member)

    [ true, false ].each do |shared|
      restricted.account.account_shares.destroy_all unless shared
      get new_transactions_bulk_update_url(format: :json), params: { bulk_update: { entry_ids: [ writable.id, restricted.id ] } }
      assert_response :success
      assert_equal({ "can_edit" => false, "can_annotate" => false }, response.parsed_body.fetch("permissions"))

      post transactions_bulk_update_url, params: {
        bulk_update: { entry_ids: [ writable.id, restricted.id ], notes: "Forbidden batch" }
      }, as: :json
      assert_response :forbidden
      assert_nil writable.reload.notes
      assert_nil restricted.reload.notes
    end
  end

  test "full control members can bulk edit shared accounts" do
    entry = shared_entry("full_control")
    sign_in users(:family_member)
    post transactions_bulk_update_url, params: {
      bulk_update: { entry_ids: [ entry.id ], name: "Member edit", date: Date.yesterday }
    }
    assert_response :redirect
    assert_equal "Member edit", entry.reload.name
    assert_equal Date.yesterday, entry.date
  end

  test "bulk transfer creates confirmed opposite entries for both source directions" do
    expense = create_transaction(account: accounts(:depository), amount: 100)
    income = create_transaction(account: accounts(:depository), amount: -50, kind: "cc_payment")
    target = accounts(:credit_card)

    assert_difference [ "Entry.count", "Transaction.count", "Transfer.count" ], 2 do
      post transactions_bulk_update_url, params: {
        bulk_update: {
          entry_ids: [ expense.id, income.id ],
          transfer_account_id: target.id,
          notes: "Bulk transfer"
        }
      }, as: :json
    end

    assert_response :success
    assert_equal 2, response.parsed_body.fetch("updated_count")
    [ expense, income ].each do |entry|
      transaction = entry.reload.transaction
      transfer = transaction.transfer
      assert transfer.confirmed?
      counterpart = transfer.inflow_transaction_id == transaction.id ? transfer.outflow_transaction : transfer.inflow_transaction
      assert_equal target.id, counterpart.entry.account_id
      assert_equal(-entry.amount, counterpart.entry.amount)
      assert_equal entry.currency, counterpart.entry.currency
      assert_equal entry.date, counterpart.entry.date
      assert_equal "Bulk transfer", entry.notes
    end
    assert_equal "cc_payment", expense.transaction.kind
    assert_equal "funds_movement", income.transaction.kind
  end

  test "bulk transfer rejects an existing match without partially updating the batch" do
    entry = create_transaction(account: accounts(:depository), amount: 20)
    matched = entries(:transfer_out)
    original_match = matched.transaction.transfer.id

    assert_no_difference [ "Entry.count", "Transfer.count" ] do
      post transactions_bulk_update_url, params: {
        bulk_update: {
          entry_ids: [ entry.id, matched.id ],
          transfer_account_id: accounts(:loan).id,
          notes: "Must not save"
        }
      }, as: :json
    end

    assert_response :unprocessable_entity
    assert_nil entry.reload.notes
    assert_equal original_match, matched.reload.transaction.transfer.id
  end

  test "bulk transfer rolls back all changes if a counterpart fails validation" do
    valid = create_transaction(account: accounts(:depository), amount: 25)
    invalid = create_transaction(account: accounts(:depository), amount: 0)

    assert_no_difference [ "Entry.count", "Transfer.count" ] do
      post transactions_bulk_update_url, params: {
        bulk_update: {
          entry_ids: [ valid.id, invalid.id ],
          transfer_account_id: accounts(:loan).id,
          name: "Must not save"
        }
      }, as: :json
    end

    assert_response :unprocessable_entity
    assert_equal "Transaction", valid.reload.name
    assert_nil valid.transaction.transfer
  end

  test "bulk transfer rejects a target that is also a selected source" do
    entries = [
      create_transaction(account: accounts(:depository), amount: 25),
      create_transaction(account: accounts(:credit_card), amount: -25)
    ]

    assert_no_difference [ "Entry.count", "Transfer.count" ] do
      post transactions_bulk_update_url, params: {
        bulk_update: { entry_ids: entries.map(&:id), transfer_account_id: accounts(:credit_card).id }
      }, as: :json
    end

    assert_response :unprocessable_entity
  end

  test "bulk transfer rejects split entries and non transactions instead of silently skipping them" do
    parent = create_transaction(account: accounts(:depository), amount: 100)
    child = parent.split!([
      { name: "First half", amount: 50 },
      { name: "Second half", amount: 50 }
    ]).first

    [ parent, child, entries(:valuation) ].each do |entry|
      assert_no_difference [ "Entry.count", "Transfer.count" ] do
        post transactions_bulk_update_url, params: {
          bulk_update: { entry_ids: [ entry.id ], transfer_account_id: accounts(:loan).id }
        }, as: :json
      end
      assert_response :unprocessable_entity
    end
  end

  test "bulk transfer requires full control of every source account" do
    entry = shared_entry("read_write")
    sign_in users(:family_member)

    assert_no_difference [ "Entry.count", "Transfer.count" ] do
      post transactions_bulk_update_url, params: {
        bulk_update: {
          entry_ids: [ entry.id ],
          transfer_account_id: accounts(:loan).id,
          notes: "Must not save"
        }
      }, as: :json
    end

    assert_response :forbidden
    assert_nil entry.reload.notes
  end

  test "bulk transfer rejects restricted inaccessible and foreign target accounts" do
    source = shared_entry("full_control")
    target = shared_entry("read_only").account
    foreign = families(:empty).accounts.create!(
      name: "Other family account", owner: users(:empty), balance: 0, currency: "USD", accountable: Depository.new
    )
    accounts(:depository).account_shares.where(user: users(:family_member)).destroy_all
    sign_in users(:family_member)

    [ target.id, accounts(:depository).id, foreign.id, SecureRandom.uuid ].each do |target_id|
      assert_no_difference [ "Entry.count", "Transfer.count" ] do
        post transactions_bulk_update_url, params: {
          bulk_update: {
            entry_ids: [ source.id ],
            transfer_account_id: target_id,
            notes: "Must not save"
          }
        }, as: :json
      end
      assert_response :forbidden
      assert_nil source.reload.notes
    end
  end

  private
    def shared_entry(permission)
      account = @user.family.accounts.create!(
        name: "Shared bulk permissions", balance: 1000, currency: "USD",
        accountable: Depository.new, owner: @user
      )
      account.account_shares.create!(user: users(:family_member), permission: permission)
      account.entries.create!(
        name: "Shared purchase", date: Date.current, amount: 100, currency: "USD",
        entryable: Transaction.new
      )
    end
end
