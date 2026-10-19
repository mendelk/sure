require "test_helper"

class Api::V1::TransactionAccountPermissionsTest < ActionDispatch::IntegrationTest
  setup do
    @owner = users(:family_admin)
    @member = users(:family_member)
    @account = @owner.family.accounts.create!(
      name: "Shared transaction permissions", balance: 1000, currency: "USD",
      accountable: Depository.new, owner: @owner
    )
    @entry = @account.entries.create!(
      name: "Shared purchase", date: Date.current, amount: 100, currency: "USD",
      entryable: Transaction.new
    )
    @share = @account.account_shares.create!(user: @member, permission: "read_only")
    @member.api_keys.active.destroy_all
    @key = @member.api_keys.create!(name: "Account permissions", scopes: [ "read_write" ], display_key: ApiKey.generate_secure_key)
  end

  test "read only account access cannot annotate or delete through a write scoped key" do
    patch api_v1_transaction_url(@entry.entryable),
      params: { transaction: { notes: "Not allowed" } }, headers: api_headers(@key), as: :json
    assert_response :forbidden
    assert_nil @entry.reload.notes

    assert_no_difference "Entry.count" do
      delete api_v1_transaction_url(@entry.entryable), headers: api_headers(@key)
      assert_response :forbidden
    end
  end

  test "annotation access allows category merchant tags and notes but rejects mixed structural updates atomically" do
    @share.update!(permission: "read_write")
    category = @owner.family.categories.first!
    merchant = @owner.family.merchants.first!
    tag = @owner.family.tags.first!

    patch api_v1_transaction_url(@entry.entryable), params: {
      transaction: { category_id: category.id, merchant_id: merchant.id, tag_ids: [ tag.id ], notes: "Allowed" }
    }, headers: api_headers(@key), as: :json
    assert_response :success
    assert_equal "Allowed", @entry.reload.notes
    assert_equal category, @entry.transaction.category
    assert_equal merchant, @entry.transaction.merchant
    assert_equal [ tag.id ], @entry.transaction.tag_ids

    patch api_v1_transaction_url(@entry.entryable), params: {
      transaction: { name: "Not allowed", notes: "Must not partially save" }
    }, headers: api_headers(@key), as: :json
    assert_response :forbidden
    assert_equal "Shared purchase", @entry.reload.name
    assert_equal "Allowed", @entry.notes
  end

  test "annotation access cannot change financial or sync settings" do
    @share.update!(permission: "read_write")
    [ { amount: 12 }, { date: Date.yesterday }, { excluded: true }, { kind: "one_time" }, { investment_activity_label: "Buy" } ].each do |changes|
      patch api_v1_transaction_url(@entry.entryable), params: { transaction: changes }, headers: api_headers(@key), as: :json
      assert_response :forbidden
    end
    assert_equal 100, @entry.reload.amount
    assert_equal Date.current, @entry.date
    assert_not @entry.excluded?
    assert_equal "standard", @entry.transaction.kind
  end

  test "annotation access cannot unlock mark recurring or resolve duplicates" do
    @share.update!(permission: "read_write")
    @entry.update!(user_modified: true)
    %w[unlock mark_as_recurring merge_duplicate dismiss_duplicate].each do |action|
      post "/api/v1/transactions/#{@entry.entryable_id}/#{action}", headers: api_headers(@key)
      assert_response :forbidden
    end
    assert @entry.reload.user_modified?
  end

  test "full control members can make structural edits and delete" do
    @share.update!(permission: "full_control")
    patch api_v1_transaction_url(@entry.entryable),
      params: { transaction: { name: "Permitted edit", date: Date.yesterday } }, headers: api_headers(@key), as: :json
    assert_response :success
    assert_equal "Permitted edit", @entry.reload.name
    assert_equal Date.yesterday, @entry.date

    assert_difference "Entry.count", -1 do
      delete api_v1_transaction_url(@entry.entryable), headers: api_headers(@key)
      assert_response :success
    end
  end

  test "list and detail capabilities reflect the viewer's account permission" do
    { "read_only" => [ false, false ], "read_write" => [ false, true ], "full_control" => [ true, true ] }.each do |permission, (edit, annotate)|
      @share.update!(permission: permission)
      expected = { "can_edit" => edit, "can_annotate" => annotate }
      get api_v1_transaction_url(@entry.entryable), headers: api_headers(@key)
      assert_response :success
      assert_equal expected, response.parsed_body.fetch("permissions")

      get api_v1_transactions_url, params: { account_id: @account.id }, headers: api_headers(@key)
      assert_response :success
      transaction = response.parsed_body.fetch("transactions").find { |item| item.fetch("id") == @entry.entryable_id }
      assert_equal expected, transaction.fetch("permissions")
    end

    @share.destroy!
    get api_v1_transaction_url(@entry.entryable), headers: api_headers(@key)
    assert_response :not_found

    @account.update!(owner: @member)
    get api_v1_transaction_url(@entry.entryable), headers: api_headers(@key)
    assert_response :success
    assert_equal({ "can_edit" => true, "can_annotate" => true }, response.parsed_body.fetch("permissions"))
  end

  test "transfer candidates exclude counterpart accounts without full control" do
    @share.update!(permission: "full_control")
    @entry.update!(amount: 137.64)
    destination = @owner.family.accounts.create!(
      name: "Shared matching destination", balance: 0, currency: "USD",
      accountable: Depository.new, owner: @owner
    )
    incoming = destination.entries.create!(
      name: "Matching deposit", date: @entry.date, amount: -137.64, currency: "USD",
      entryable: Transaction.new
    )

    get "/api/v1/transactions/#{@entry.entryable_id}/transfer_match_candidates", headers: api_headers(@key)
    assert_response :success
    assert_not_includes response.parsed_body.fetch("candidates").map { |match| match.fetch("inflow_transaction_id") }, incoming.entryable_id

    share = destination.account_shares.create!(user: @member, permission: "read_only")
    %w[read_only read_write full_control].each do |permission|
      share.update!(permission: permission)
      get "/api/v1/transactions/#{@entry.entryable_id}/transfer_match_candidates", headers: api_headers(@key)
      assert_response :success
      matches = response.parsed_body.fetch("candidates").map { |match| match.fetch("inflow_transaction_id") }
      if permission == "full_control"
        assert_includes matches, incoming.entryable_id
      else
        assert_not_includes matches, incoming.entryable_id
      end
    end
  end

  test "transfer recurrence availability requires full control of both endpoints" do
    destination = @owner.family.accounts.create!(
      name: "Shared recurring destination", balance: 0, currency: "USD",
      accountable: Depository.new, owner: @owner
    )
    destination_share = destination.account_shares.create!(user: @member, permission: "full_control")
    @entry.transaction.update!(kind: "funds_movement")
    incoming = destination.entries.create!(
      name: "Transfer deposit", date: @entry.date, amount: -@entry.amount, currency: "USD",
      entryable: Transaction.new(kind: "funds_movement")
    )
    transfer = Transfer.create!(outflow_transaction: @entry.transaction, inflow_transaction: incoming.transaction, status: "confirmed")

    [
      [ "read_only", "full_control", false, false ],
      [ "read_write", "full_control", false, false ],
      [ "full_control", "read_only", true, false ],
      [ "full_control", "read_write", true, false ],
      [ "full_control", "full_control", true, true ]
    ].each do |source_permission, destination_permission, edit, recurring|
      @share.update!(permission: source_permission)
      destination_share.update!(permission: destination_permission)
      get api_v1_transfer_url(transfer), headers: api_headers(@key)
      assert_response :success
      assert_equal edit, response.parsed_body.dig("permissions", "can_edit")
      assert_equal recurring, response.parsed_body.fetch("can_mark_as_recurring")
      next if recurring

      assert_no_difference "RecurringTransaction.count" do
        post mark_as_recurring_api_v1_transfer_url(transfer), headers: api_headers(@key)
        assert_response :forbidden
      end
    end

    assert_difference "RecurringTransaction.count", 1 do
      post mark_as_recurring_api_v1_transfer_url(transfer), headers: api_headers(@key)
      assert_response :created
    end
  end

  test "matching a transfer requires write access to the source as well as the destination" do
    destination = @owner.family.accounts.create!(
      name: "Member owned destination", balance: 0, currency: "USD",
      accountable: Depository.new, owner: @member
    )
    %w[read_only read_write].each do |permission|
      @share.update!(permission: permission)
      assert_no_difference [ "Entry.count", "Transfer.count" ] do
        post "/api/v1/transactions/#{@entry.entryable_id}/transfer_match", params: {
          transfer_match: { method: "new", target_account_id: destination.id }
        }, headers: api_headers(@key), as: :json
        assert_response :forbidden
      end
    end
  end
end
