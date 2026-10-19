require "test_helper"

class Transactions::BulkUpdatesControllerTest < ActionDispatch::IntegrationTest
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

    assert_redirected_to transactions_url

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
    assert_response :redirect
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
