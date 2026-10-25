# frozen_string_literal: true

require "test_helper"

class Api::V1::TransactionSplitsControllerTest < ActionDispatch::IntegrationTest
  include EntriesTestHelper

  setup do
    @user = users(:family_admin)
    @family = @user.family
    @account = accounts(:depository)
    @merchant = merchants(:amazon)
    @entry = create_transaction(amount: 100, name: "Store purchase", account: @account)
    @entry.transaction.update!(merchant: @merchant)

    @user.api_keys.active.destroy_all
    @api_key = ApiKey.create!(
      user: @user,
      name: "Split Read Write Key",
      scopes: [ "read_write" ],
      source: "web",
      display_key: "split_rw_#{SecureRandom.hex(8)}"
    )
    @read_only_api_key = ApiKey.create!(
      user: @user,
      name: "Split Read Key",
      scopes: [ "read" ],
      source: "mobile",
      display_key: "split_read_#{SecureRandom.hex(8)}"
    )
  end

  test "should create split transactions with the same fields as the UI" do
    assert_difference -> { Entry.count } => 2 do
      post api_v1_transaction_split_url(@entry.transaction),
        params: {
          split: {
            splits: [
              { name: "Groceries", amount: -70, category_id: categories(:food_and_drink).id, excluded: true },
              { name: "Household", amount: -30, category_id: nil, excluded: false }
            ]
          }
        },
        headers: api_headers(@api_key)
    end

    assert_response :created
    assert @entry.reload.split_parent?
    assert @entry.excluded?

    children = @entry.child_entries.includes(:entryable).order(amount: :desc)
    assert_equal [ 70, 30 ], children.map { |child| child.amount.to_i }
    assert_equal [ "Groceries", "Household" ], children.map(&:name)
    assert_equal categories(:food_and_drink).id, children.first.transaction.category_id
    assert children.first.excluded?
    refute children.last.excluded?
    assert_equal [ @merchant.id ], children.map { |child| child.transaction.merchant_id }.uniq

    response_body = JSON.parse(response.body)
    assert_equal @entry.transaction.id, response_body["parent_transaction_id"]
    assert_equal children.map { |child| child.transaction.id }.sort, response_body["splits"].map { |split| split["id"] }.sort
  end

  test "should preserve UI amount signs for income and mixed-sign splits" do
    income_entry = create_transaction(amount: -400, name: "Reimbursement", account: @account)

    post api_v1_transaction_split_url(income_entry.transaction),
      params: { split: { splits: [ { name: "Income", amount: 450 }, { name: "Fee", amount: -50 } ] } },
      headers: api_headers(@api_key)

    assert_response :created
    assert_equal [ -450, 50 ], income_entry.child_entries.order(:amount).map { |child| child.amount.to_i }
  end

  test "should reject split amounts that do not sum to the parent" do
    assert_no_difference -> { Entry.count } do
      post api_v1_transaction_split_url(@entry.transaction),
        params: { split: { splits: [ { name: "Part 1", amount: -60 }, { name: "Part 2", amount: -20 } ] } },
        headers: api_headers(@api_key)
    end

    assert_response :unprocessable_entity
    assert_equal "validation_failed", JSON.parse(response.body)["error"]
    refute @entry.reload.split_parent?
  end

  test "should reject categories outside the family" do
    other_category = families(:empty).categories.create!(name: "Other family category", color: "#000000")

    assert_no_difference -> { Entry.count } do
      post api_v1_transaction_split_url(@entry.transaction),
        params: { split: { splits: [ { name: "Part 1", amount: -70, category_id: other_category.id }, { name: "Part 2", amount: -30 } ] } },
        headers: api_headers(@api_key)
    end

    assert_response :unprocessable_entity
    assert_equal "Categories must belong to your family", JSON.parse(response.body)["message"]
  end

  test "should reject malformed category IDs" do
    assert_no_difference -> { Entry.count } do
      post api_v1_transaction_split_url(@entry.transaction),
        params: { split: { splits: [ { name: "Part 1", amount: -70, category_id: "not-a-uuid" }, { name: "Part 2", amount: -30 } ] } },
        headers: api_headers(@api_key)
    end

    assert_response :unprocessable_entity
    assert_equal "Category IDs must be valid UUIDs", JSON.parse(response.body)["message"]
  end

  test "should reject transactions that the UI cannot split" do
    @entry.update!(excluded: true)

    post api_v1_transaction_split_url(@entry.transaction),
      params: { split: { splits: [ { name: "Part 1", amount: -70 }, { name: "Part 2", amount: -30 } ] } },
      headers: api_headers(@api_key)

    assert_response :unprocessable_entity
    assert_equal "Transaction cannot be split", JSON.parse(response.body)["message"]
  end

  test "should require write scope" do
    post api_v1_transaction_split_url(@entry.transaction),
      params: { split: { splits: [ { name: "Part 1", amount: -70 }, { name: "Part 2", amount: -30 } ] } },
      headers: api_headers(@read_only_api_key)

    assert_response :forbidden
    assert_equal "insufficient_scope", JSON.parse(response.body)["error"]
  end

  test "should return not found for inaccessible transaction" do
    other_user = users(:family_member)
    other_user.update!(family: families(:empty))
    other_account = other_user.family.accounts.create!(
      name: "Other account",
      balance: 0,
      currency: "USD",
      owner: other_user,
      accountable: Depository.new
    )
    other_entry = create_transaction(amount: 100, name: "Other transaction", account: other_account)

    post api_v1_transaction_split_url(other_entry.transaction),
      params: { split: { splits: [ { name: "Part 1", amount: -70 }, { name: "Part 2", amount: -30 } ] } },
      headers: api_headers(@api_key)

    assert_response :not_found
    assert_equal "Transaction not found", JSON.parse(response.body)["message"]
  end

  test "should require authentication" do
    post api_v1_transaction_split_url(@entry.transaction),
      params: { split: { splits: [ { name: "Part 1", amount: -70 }, { name: "Part 2", amount: -30 } ] } }

    assert_response :unauthorized
  end

  test "should create a split with a transfer leg" do
    destination = @family.accounts.create!(
      name: "Savings",
      balance: 0,
      currency: "USD",
      owner: @user,
      accountable: Depository.new
    )

    assert_difference -> { Entry.count } => 3 do
      assert_difference -> { Transfer.count } => 1 do
        post api_v1_transaction_split_url(@entry.transaction),
          params: {
            split: {
              splits: [
                { name: "Groceries", amount: -70 },
                { name: "Transfer to savings", amount: -30, transfer_account_id: destination.id }
              ]
            }
          },
          headers: api_headers(@api_key)
      end
    end

    assert_response :created
    assert @entry.reload.split_parent?

    children = @entry.child_entries.order(amount: :desc)
    assert_equal [ 70, 30 ], children.map { |c| c.amount.to_i }

    transfer_child = children.find_by(name: "Transfer to savings")
    assert transfer_child.transaction.transfer?
    transfer = transfer_child.transaction.transfer
    assert_equal destination.id, transfer.to_account.id
    assert_equal @account.id, transfer.from_account.id
    assert_equal "funds_movement", transfer_child.transaction.kind

    counterpart_entry = transfer.inflow_transaction.entry
    assert_equal destination.id, counterpart_entry.account_id
    assert_equal(-30, counterpart_entry.amount.to_i)

    response_body = JSON.parse(response.body)
    transfer_split = response_body["splits"].find { |s| s["name"] == "Transfer to savings" }
    assert transfer_split["transfer"].present?
    assert_equal destination.id, transfer_split["transfer"]["other_account"]["id"]
  end

  test "should reject transfer to the same account" do
    post api_v1_transaction_split_url(@entry.transaction),
      params: {
        split: {
          splits: [
            { name: "Part 1", amount: -70 },
            { name: "Transfer", amount: -30, transfer_account_id: @account.id }
          ]
        }
      },
      headers: api_headers(@api_key)

    assert_response :unprocessable_entity
    assert_equal "Transfer account must differ from source account", JSON.parse(response.body)["message"]
  end

  test "should reject transfer accounts outside the family" do
    other_family_account = families(:empty).accounts.create!(
      name: "Other",
      balance: 0,
      currency: "USD",
      owner: users(:empty),
      accountable: Depository.new
    )

    post api_v1_transaction_split_url(@entry.transaction),
      params: {
        split: {
          splits: [
            { name: "Part 1", amount: -70 },
            { name: "Transfer", amount: -30, transfer_account_id: other_family_account.id }
          ]
        }
      },
      headers: api_headers(@api_key)

    assert_response :unprocessable_entity
    assert_equal "Transfer accounts must belong to your family", JSON.parse(response.body)["message"]
  end

  test "should reject malformed transfer account IDs" do
    post api_v1_transaction_split_url(@entry.transaction),
      params: {
        split: {
          splits: [
            { name: "Part 1", amount: -70 },
            { name: "Transfer", amount: -30, transfer_account_id: "not-a-uuid" }
          ]
        }
      },
      headers: api_headers(@api_key)

    assert_response :unprocessable_entity
    assert_equal "Transfer account IDs must be valid UUIDs", JSON.parse(response.body)["message"]
  end

  test "splitting requires ownership or full control of the source account" do
    @account.update!(owner: users(:family_member))
    share = @account.account_shares.new(user: @user)

    [ nil, "read_only", "read_write" ].each do |permission|
      share.update!(permission: permission) if permission

      assert_no_difference -> { Entry.count } do
        post api_v1_transaction_split_url(@entry.transaction),
          params: { split: { splits: [ { name: "Groceries", amount: -70 }, { name: "Household", amount: -30 } ] } },
          headers: api_headers(@api_key)
      end
      assert_response :not_found
      refute @entry.reload.split_parent?
    end

    share.update!(permission: "full_control")
    post api_v1_transaction_split_url(@entry.transaction),
      params: { split: { splits: [ { name: "Groceries", amount: -70 }, { name: "Household", amount: -30 } ] } },
      headers: api_headers(@api_key)

    assert_response :created
    assert_equal [ 30, 70 ], @entry.child_entries.order(:amount).map { |child| child.amount.to_i }
  end

  test "transfer splits require ownership or full control of the destination account" do
    destination = @family.accounts.create!(
      name: "Shared Split Destination",
      balance: 0,
      currency: "USD",
      owner: users(:family_member),
      accountable: Depository.new
    )
    share = destination.account_shares.new(user: @user)

    [ nil, "read_only", "read_write" ].each do |permission|
      share.update!(permission: permission) if permission

      assert_no_difference -> { Entry.count } do
        post api_v1_transaction_split_url(@entry.transaction),
          params: {
            split: {
              splits: [
                { name: "Groceries", amount: -70 },
                { name: "Transfer", amount: -30, transfer_account_id: destination.id }
              ]
            }
          },
          headers: api_headers(@api_key)
      end
      assert_response :unprocessable_entity
      refute @entry.reload.split_parent?
    end

    share.update!(permission: "full_control")
    post api_v1_transaction_split_url(@entry.transaction),
      params: {
        split: {
          splits: [
            { name: "Groceries", amount: -70 },
            { name: "Transfer", amount: -30, transfer_account_id: destination.id }
          ]
        }
      },
      headers: api_headers(@api_key)

    assert_response :created
    transfer_child = @entry.child_entries.find_by!(name: "Transfer")
    assert_equal destination.id, transfer_child.transaction.transfer.to_account.id
    assert_equal(-30, transfer_child.transaction.transfer.inflow_transaction.entry.amount.to_i)
  end

  test "should update an existing split" do
    @entry.split!([
      { name: "Groceries", amount: 70, category_id: categories(:food_and_drink).id },
      { name: "Household", amount: 30 }
    ])

    patch api_v1_transaction_split_url(@entry.transaction),
      params: {
        split: {
          splits: [
            { name: "Groceries", amount: -60, category_id: categories(:food_and_drink).id },
            { name: "Household", amount: -40 }
          ]
        }
      },
      headers: api_headers(@api_key)

    assert_response :success
    children = @entry.reload.child_entries.order(:created_at)
    assert_equal 2, children.count
    assert_equal [ 60, 40 ], children.map { |child| child.amount.to_i }

    response_body = JSON.parse(response.body)
    assert_equal @entry.transaction.id, response_body["parent_transaction_id"]
  end

  test "should reject split update on unsplit transaction" do
    patch api_v1_transaction_split_url(@entry.transaction),
      params: { split: { splits: [ { name: "A", amount: -60 }, { name: "B", amount: -40 } ] } },
      headers: api_headers(@api_key)

    assert_response :unprocessable_entity
  end

  test "should require write scope for split update" do
    patch api_v1_transaction_split_url(@entry.transaction),
      params: { split: { splits: [ { name: "A", amount: -60 }, { name: "B", amount: -40 } ] } },
      headers: api_headers(@read_only_api_key)

    assert_response :forbidden
  end

  test "split annotations are atomic and parent financial fields cannot be changed" do
    tag = @family.tags.create!(name: "ai-categorized")
    original_tag = @family.tags.create!(name: "Personal")
    @entry.update!(notes: "Personal note")
    @entry.transaction.update!(tag_ids: [ original_tag.id ], category: categories(:food_and_drink))
    protected_fields = @entry.attributes.slice("amount", "date", "currency", "account_id", "name")
    protected_transaction = @entry.transaction.attributes.slice("category_id", "merchant_id", "kind")

    post api_v1_transaction_split_url(@entry.transaction),
      params: {
        split: {
          parent: {
            notes: "Personal note\nAmazon split", tag_ids: [ original_tag.id, tag.id ],
            amount: -1, date: "2000-01-01", currency: "JPY", name: "Changed",
            account_id: accounts(:credit_card).id, category_id: nil, merchant_id: nil
          },
          splits: [
            { name: "Groceries", amount: "-70.00", notes: "Order A groceries", tag_ids: [ tag.id ], category_id: categories(:food_and_drink).id },
            { name: "Household", amount: "-30.00", notes: "Order A household", tag_ids: [ tag.id ] }
          ]
        }
      },
      headers: api_headers(@api_key),
      as: :json

    assert_response :created
    assert_equal protected_fields, @entry.reload.attributes.slice(*protected_fields.keys)
    assert_equal protected_transaction, @entry.transaction.reload.attributes.slice(*protected_transaction.keys)
    assert_equal "Personal note\nAmazon split", @entry.notes
    assert_equal [ original_tag.id, tag.id ].sort, @entry.transaction.tag_ids.sort
    assert @entry.user_modified?
    children = @entry.child_entries.order(amount: :desc)
    assert_equal [ "Order A groceries", "Order A household" ], children.map(&:notes)
    children.each { |child| assert_equal [ tag.id ], child.transaction.tag_ids }

    get api_v1_transaction_url(@entry.transaction), headers: api_headers(@api_key)
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal true, body["split_annotation_support"]
    assert_equal false, body["splittable"]
    assert_equal children.map(&:entryable_id).sort, body["split_children"].map { |child| child["transaction_id"] }.sort

    children.each do |child|
      get api_v1_transaction_url(child.transaction), headers: api_headers(@api_key)
      assert_response :success
      body = JSON.parse(response.body)
      assert_equal child.amount.to_i * 100, body["amount_cents"]
      assert_equal @entry.id, body["parent_entry_id"]
      assert_equal child.notes, body["notes"]
      assert_equal [ tag.id ], body["tags"].map { |item| item["id"] }
      assert_equal @merchant.id, body["merchant"]["id"]
      assert_equal false, body["splittable"]
    end
  end

  test "omitted split annotations preserve parent notes and tags without copying them to children" do
    tag = @family.tags.create!(name: "Personal")
    @entry.update!(notes: "Keep this")
    @entry.transaction.update!(tag_ids: [ tag.id ])

    post api_v1_transaction_split_url(@entry.transaction),
      params: { split: { splits: [ { name: "A", amount: -60 }, { name: "B", amount: -40 } ] } },
      headers: api_headers(@api_key)

    assert_response :created
    assert_equal "Keep this", @entry.reload.notes
    assert_equal [ tag.id ], @entry.transaction.reload.tag_ids
    @entry.child_entries.each do |child|
      assert_nil child.notes
      assert_empty child.transaction.tags
    end
  end

  test "child tags round trip through detail and replacement without changing other annotations or transfers" do
    parent_tag = @family.tags.create!(name: "Personal")
    purchase_tag = @family.tags.create!(name: "Purchase", color: "#123456")
    transfer_tag = @family.tags.create!(name: "Escrow", color: "#654321")
    added_tag = @family.tags.create!(name: "Reviewed")
    destination = @family.accounts.create!(
      name: "Escrow", balance: 0, currency: "USD", owner: @user, accountable: Depository.new
    )
    category = categories(:food_and_drink)

    [ 1, -1 ].each do |direction|
      parent = create_transaction(amount: direction * 100, name: "Annotated purchase", account: @account)
      parent.update!(notes: "Parent only")
      parent.transaction.update!(tag_ids: [ parent_tag.id ], merchant: @merchant, category: category)
      parent_fields = parent.attributes.slice("amount", "date", "currency", "account_id", "name")
      parent_transaction_fields = parent.transaction.attributes.slice("category_id", "merchant_id", "kind")
      amounts = { "Purchase" => direction * -60, "Escrow" => direction * -30, "Other" => direction * -10 }

      post api_v1_transaction_split_url(parent.transaction),
        params: {
          split: {
            splits: [
              { name: "Purchase", amount: amounts["Purchase"], category_id: category.id, notes: "Purchase notes", tag_ids: [ purchase_tag.id ] },
              { name: "Escrow", amount: amounts["Escrow"], transfer_account_id: destination.id, notes: "Transfer notes", tag_ids: [ transfer_tag.id ] },
              { name: "Other", amount: amounts["Other"], tag_ids: [] }
            ]
          }
        },
        headers: api_headers(@api_key), as: :json
      assert_response :created

      get api_v1_transaction_url(parent.transaction), headers: api_headers(@read_only_api_key)
      assert_response :success
      children = JSON.parse(response.body)["split_children"].index_by { |child| child["name"] }
      { "Purchase" => purchase_tag, "Escrow" => transfer_tag }.each do |name, tag|
        assert_equal [ { "id" => tag.id, "name" => tag.name, "color" => tag.color } ], children.fetch(name)["tags"]
      end
      assert_empty children.fetch("Other")["tags"]
      assert_nil children.fetch("Other")["notes"]

      [ [ purchase_tag.id, added_tag.id ], [] ].each do |replacement_tags|
        splits = children.values.map do |child|
          {
            name: child["name"],
            amount: amounts.fetch(child["name"]),
            category_id: child["category_id"],
            transfer_account_id: child["transfer_account_id"],
            tag_ids: child["name"] == "Purchase" ? replacement_tags : child["tags"].map { |tag| tag["id"] }
          }.tap do |split|
            split[:notes] = child["notes"] if child["notes"].is_a?(String)
          end
        end

        patch api_v1_transaction_split_url(parent.transaction),
          params: { split: { splits: splits } }, headers: api_headers(@api_key), as: :json
        assert_response :success

        get api_v1_transaction_url(parent.transaction), headers: api_headers(@read_only_api_key)
        assert_response :success
        detail = JSON.parse(response.body)
        children = detail["split_children"].index_by { |child| child["name"] }
        assert_equal replacement_tags.sort, children.fetch("Purchase")["tags"].map { |tag| tag["id"] }.sort
        assert_equal [ transfer_tag.id ], children.fetch("Escrow")["tags"].map { |tag| tag["id"] }
        assert_empty children.fetch("Other")["tags"]
        assert_equal "Purchase notes", children.fetch("Purchase")["notes"]
        assert_equal "Transfer notes", children.fetch("Escrow")["notes"]
        assert_nil children.fetch("Other")["notes"]
        assert_equal category.id, children.fetch("Purchase")["category_id"]
        assert_equal destination.id, children.fetch("Escrow")["transfer_account_id"]
        assert_nil children.fetch("Purchase")["transfer_account_id"]
        assert_equal [ parent_tag.id ], detail["tags"].map { |tag| tag["id"] }
        assert_equal "Parent only", detail["notes"]
        assert_equal parent_fields, parent.reload.attributes.slice(*parent_fields.keys)
        assert_equal parent_transaction_fields, parent.transaction.reload.attributes.slice(*parent_transaction_fields.keys)
        assert parent.excluded?
        assert_equal [ direction * 10, direction * 30, direction * 60 ].sort, parent.child_entries.pluck(:amount).sort

        transfer_child = parent.child_entries.find_by!(name: "Escrow")
        transfer = transfer_child.transaction.transfer
        assert_not_nil transfer
        counterpart = direction.positive? ? transfer.inflow_transaction.entry : transfer.outflow_transaction.entry
        assert_equal destination.id, counterpart.account_id
        assert_equal direction * -30, counterpart.amount
        assert_equal "Transfer notes", counterpart.notes
        assert_empty counterpart.transaction.tags
      end
    end
  end

  test "malformed and foreign annotation tags are rejected before create or replacement" do
    tag = @family.tags.create!(name: "Original")
    foreign_tag = families(:empty).tags.create!(name: "Foreign")
    @entry.update!(notes: "Original notes")
    @entry.transaction.update!(tag_ids: [ tag.id ])
    invalid_values = [ [ foreign_tag.id ], [ SecureRandom.uuid ], [ "not-a-uuid" ], [ 123 ], [ { id: tag.id } ], tag.id, nil ]

    [ :post, :patch ].each do |method|
      if method == :patch
        @entry.split!([
          { name: "Old A", amount: 60, notes: "Original child notes", tag_ids: [ tag.id ], transfer_account: accounts(:credit_card) },
          { name: "Old B", amount: 40 }
        ])
      end
      child_ids = @entry.child_entries.pluck(:id).sort
      original_child = @entry.child_entries.find_by(name: "Old A")
      original_transfer = original_child&.transaction&.transfer
      original_counterpart = original_transfer&.inflow_transaction&.entry
      [ :parent, :child ].each do |target|
        invalid_values.each do |invalid_tags|
          payload = {
            parent: { notes: "Changed", tag_ids: [ tag.id ] },
            splits: [ { name: "New A", amount: -60 }, { name: "New B", amount: -40 } ]
          }
          annotation = target == :parent ? payload[:parent] : payload[:splits].first
          annotation[:tag_ids] = invalid_tags

          assert_no_difference [ -> { Entry.count }, -> { Transaction.count }, -> { Tagging.count }, -> { Transfer.count } ] do
            public_send(method, api_v1_transaction_split_url(@entry.transaction),
              params: { split: payload }, headers: api_headers(@api_key), as: :json)
          end

          assert_response :unprocessable_entity
          assert_equal child_ids, @entry.reload.child_entries.pluck(:id).sort
          assert_equal "Original notes", @entry.notes
          assert_equal [ tag.id ], @entry.transaction.reload.tag_ids
          if original_child
            assert_equal "Original child notes", original_child.reload.notes
            assert_equal [ tag.id ], original_child.transaction.reload.tag_ids
            assert_equal original_transfer.id, original_child.transaction.transfer.id
            assert_equal "Original child notes", original_counterpart.reload.notes
            assert_empty original_counterpart.transaction.tags
          end
        end
      end
    end
  end

  test "malformed notes and parent annotation objects are rejected" do
    [ { parent: "bad" }, { parent: { notes: [ "bad" ] } }, { parent: { notes: nil } },
      { splits: [ { name: "A", amount: -60, notes: { text: "bad" } }, { name: "B", amount: -40 } ] } ].each do |invalid|
      payload = { splits: [ { name: "A", amount: -60 }, { name: "B", amount: -40 } ] }.merge(invalid)
      assert_no_difference -> { Entry.count } do
        post api_v1_transaction_split_url(@entry.transaction),
          params: { split: payload }, headers: api_headers(@api_key), as: :json
      end
      assert_response :unprocessable_entity
      refute @entry.reload.excluded?
    end
  end

  test "failed child creation rolls back all annotations and transfer creation" do
    original_tag = @family.tags.create!(name: "Personal")
    new_tag = @family.tags.create!(name: "ai-categorized")
    @entry.update!(notes: "Original")
    @entry.transaction.update!(tag_ids: [ original_tag.id ])

    assert_no_difference [ -> { Entry.count }, -> { Transaction.count }, -> { Tagging.count }, -> { Transfer.count } ] do
      post api_v1_transaction_split_url(@entry.transaction),
        params: {
          split: {
            parent: { notes: "Changed", tag_ids: [ new_tag.id ] },
            splits: [
              { name: "Transfer", amount: -60, notes: "New notes", tag_ids: [ new_tag.id ], transfer_account_id: accounts(:credit_card).id },
              { name: "", amount: -40, tag_ids: [ new_tag.id ] }
            ]
          }
        },
        headers: api_headers(@api_key), as: :json
    end

    assert_response :unprocessable_entity
    assert_equal "Original", @entry.reload.notes
    assert_equal [ original_tag.id ], @entry.transaction.reload.tag_ids
    refute @entry.excluded?
    refute @entry.split_parent?
  end

  test "split replacement applies parent and child annotations and explicit clearing" do
    tag = @family.tags.create!(name: "ai-categorized")
    @entry.update!(notes: "Original")
    @entry.transaction.update!(tag_ids: [ tag.id ])
    children = @entry.split!([ { name: "A", amount: 60 }, { name: "B", amount: 40 } ])

    patch api_v1_transaction_split_url(children.first.transaction),
      params: {
        split: {
          parent: { notes: "", tag_ids: [] },
          splits: [ { name: "New A", amount: -70, notes: "A notes", tag_ids: [ tag.id ] },
                    { name: "New B", amount: -30, notes: "", tag_ids: [] } ]
        }
      },
      headers: api_headers(@api_key), as: :json

    assert_response :success
    assert_equal "", @entry.reload.notes
    assert_empty @entry.transaction.reload.tags
    children = @entry.child_entries.order(amount: :desc)
    assert_equal [ "A notes", "" ], children.map(&:notes)
    assert_equal [ tag.id ], children.first.transaction.tag_ids
    assert_empty children.last.transaction.tags
  end

  test "failed replacement preserves original children and annotations" do
    tag = @family.tags.create!(name: "Personal")
    @entry.update!(notes: "Original")
    @entry.transaction.update!(tag_ids: [ tag.id ])
    children = @entry.split!([
      { name: "Old A", amount: 60, notes: "Old child", tag_ids: [ tag.id ] },
      { name: "Old B", amount: 40 }
    ])
    original_ids = children.map(&:id).sort

    assert_no_difference [ -> { Entry.count }, -> { Transaction.count }, -> { Tagging.count } ] do
      patch api_v1_transaction_split_url(@entry.transaction),
        params: {
          split: {
            parent: { notes: "Changed", tag_ids: [] },
            splits: [ { name: "New A", amount: -70, tag_ids: [ tag.id ] }, { name: "", amount: -30 } ]
          }
        },
        headers: api_headers(@api_key), as: :json
    end

    assert_response :unprocessable_entity
    assert_equal original_ids, @entry.reload.child_entries.pluck(:id).sort
    assert_equal "Original", @entry.notes
    assert_equal [ tag.id ], @entry.transaction.reload.tag_ids
    assert_equal "Old child", children.first.reload.notes
    assert_equal [ tag.id ], children.first.transaction.reload.tag_ids
    assert @entry.excluded?
  end

  test "annotation permission and capability do not authorize a financial split" do
    @account.update!(owner: users(:family_member))
    @account.account_shares.create!(user: @user, permission: "read_write")
    get api_v1_transaction_url(@entry.transaction), headers: api_headers(@api_key)
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal true, body["split_annotation_support"]
    assert_equal true, body["splittable"]
    assert_equal true, body["permissions"]["can_annotate"]
    assert_equal false, body["permissions"]["can_edit"]

    assert_no_difference -> { Entry.count } do
      post api_v1_transaction_split_url(@entry.transaction),
        params: { split: { parent: { notes: "Changed" }, splits: [ { name: "A", amount: -60 }, { name: "B", amount: -40 } ] } },
        headers: api_headers(@api_key)
    end
    assert_response :not_found
    assert_nil @entry.reload.notes
  end

  private
    def api_headers(api_key)
      { "X-Api-Key" => api_key.display_key }
    end
end
