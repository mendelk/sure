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

  private
    def api_headers(api_key)
      { "X-Api-Key" => api_key.plain_key }
    end
end
