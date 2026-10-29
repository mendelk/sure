# frozen_string_literal: true

require "test_helper"

class Api::V1::TransfersControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @family = @user.family
    @user.api_keys.active.destroy_all

    @api_key = ApiKey.create!(
      user: @user,
      name: "Test Read Key",
      scopes: [ "read" ],
      source: "web",
      display_key: "test_read_#{SecureRandom.hex(8)}"
    )

    @account = @family.accounts.create!(
      name: "Transfer Checking",
      accountable: Depository.new,
      balance: 500,
      currency: "USD"
    )
    @destination_account = @family.accounts.create!(
      name: "Transfer Savings",
      accountable: Depository.new,
      balance: 1000,
      currency: "USD"
    )

    outflow = create_transaction(@account, amount: 100, date: Date.parse("2024-01-15"), name: "Transfer to savings")
    inflow = create_transaction(@destination_account, amount: -100, date: Date.parse("2024-01-15"), name: "Transfer from checking")
    @transfer = Transfer.create!(
      outflow_transaction: outflow,
      inflow_transaction: inflow,
      status: "confirmed",
      notes: "Confirmed by user"
    )

    other_family = families(:empty)
    other_account = other_family.accounts.create!(name: "Other Checking", accountable: Depository.new, balance: 0, currency: "USD")
    other_destination = other_family.accounts.create!(name: "Other Savings", accountable: Depository.new, balance: 0, currency: "USD")
    other_outflow = create_transaction(other_account, amount: 50, date: Date.parse("2024-01-15"), name: "Other outflow")
    other_inflow = create_transaction(other_destination, amount: -50, date: Date.parse("2024-01-15"), name: "Other inflow")
    @other_transfer = Transfer.create!(outflow_transaction: other_outflow, inflow_transaction: other_inflow)
  end

  test "lists transfers scoped to the current family" do
    get api_v1_transfers_url, headers: api_headers(@api_key)

    assert_response :success
    response_data = JSON.parse(response.body)
    assert response_data.key?("transfers")
    assert response_data.key?("pagination")
    assert_includes response_data["transfers"].map { |transfer| transfer["id"] }, @transfer.id
    assert_not_includes response_data["transfers"].map { |transfer| transfer["id"] }, @other_transfer.id
  end

  test "permits read write scope" do
    read_write_key = ApiKey.create!(
      user: @user,
      name: "Test Read Write Key",
      scopes: [ "read_write" ],
      source: "mobile",
      display_key: "test_read_write_#{SecureRandom.hex(8)}"
    )

    get api_v1_transfers_url, headers: api_headers(read_write_key)

    assert_response :success
  end

  test "shows a transfer" do
    get api_v1_transfer_url(@transfer), headers: api_headers(@api_key)

    assert_response :success
    response_data = JSON.parse(response.body)
    assert_equal @transfer.id, response_data["id"]
    assert_equal "confirmed", response_data["status"]
    assert_equal "Confirmed by user", response_data["notes"]
    assert_equal "Transfer Savings", response_data.dig("inflow_transaction", "account", "name")
    assert_equal "Transfer Checking", response_data.dig("outflow_transaction", "account", "name")
    assert response_data.key?("amount_cents")
    assert_equal "0.0", response_data["source_fee_amount"]
    assert_equal "0.0", response_data["destination_fee_amount"]
    assert response_data.key?("source_fee_currency")
    assert response_data.key?("destination_fee_currency")
  end

  test "returns not found for another family's transfer" do
    get api_v1_transfer_url(@other_transfer), headers: api_headers(@api_key)

    assert_response :not_found
    response_data = JSON.parse(response.body)
    assert_equal "record_not_found", response_data["error"]
  end

  test "returns not found for malformed transfer id" do
    get api_v1_transfer_url("not-a-uuid"), headers: api_headers(@api_key)

    assert_response :not_found
    response_data = JSON.parse(response.body)
    assert_equal "record_not_found", response_data["error"]
  end

  test "filters transfers by status" do
    get api_v1_transfers_url, params: { status: "confirmed" }, headers: api_headers(@api_key)

    assert_response :success
    response_data = JSON.parse(response.body)
    assert_equal [ @transfer.id ], response_data["transfers"].map { |transfer| transfer["id"] }
  end

  test "filters transfers by account_id" do
    get api_v1_transfers_url, params: { account_id: @account.id }, headers: api_headers(@api_key)

    assert_response :success
    response_data = JSON.parse(response.body)
    assert_includes response_data["transfers"].map { |transfer| transfer["id"] }, @transfer.id
  end

  test "rejects malformed account_id filter" do
    get api_v1_transfers_url, params: { account_id: "not-a-uuid" }, headers: api_headers(@api_key)

    assert_response :unprocessable_entity
    response_data = JSON.parse(response.body)
    assert_equal "validation_failed", response_data["error"]
  end

  test "rejects invalid status filter" do
    get api_v1_transfers_url, params: { status: "settled" }, headers: api_headers(@api_key)

    assert_response :unprocessable_entity
    response_data = JSON.parse(response.body)
    assert_equal "validation_failed", response_data["error"]
  end

  test "rejects invalid date filter" do
    get api_v1_transfers_url, params: { start_date: "01/15/2024" }, headers: api_headers(@api_key)

    assert_response :unprocessable_entity
    response_data = JSON.parse(response.body)
    assert_equal "validation_failed", response_data["error"]
  end

  test "filters transfers when either transaction side date matches" do
    matched_outflow = create_transaction(@account, amount: 75, date: Date.parse("2024-02-10"), name: "Dated outflow")
    matched_inflow = create_transaction(@destination_account, amount: -75, date: Date.parse("2024-02-10"), name: "Dated inflow")
    date_matched_transfer = Transfer.create!(outflow_transaction: matched_outflow, inflow_transaction: matched_inflow)

    partial_outflow = create_transaction(@account, amount: 80, date: Date.parse("2024-02-10"), name: "Partial outflow")
    partial_inflow = create_transaction(@destination_account, amount: -80, date: Date.parse("2024-02-12"), name: "Partial inflow")
    partial_date_transfer = Transfer.create!(outflow_transaction: partial_outflow, inflow_transaction: partial_inflow)

    get api_v1_transfers_url,
        params: { start_date: "2024-02-10", end_date: "2024-02-10" },
        headers: api_headers(@api_key)

    assert_response :success
    transfer_ids = JSON.parse(response.body)["transfers"].map { |transfer| transfer["id"] }
    assert_includes transfer_ids, date_matched_transfer.id
    assert_includes transfer_ids, partial_date_transfer.id
    assert_not_includes transfer_ids, @transfer.id
  end

  test "requires authentication" do
    get api_v1_transfers_url

    assert_response :unauthorized
  end

  test "requires read scope" do
    # ApiKey.create! rejects empty scopes; bypass validation to exercise runtime authorization.
    api_key_without_read = ApiKey.new(
      user: @user,
      name: "No Read Key",
      scopes: [],
      source: "mobile",
      display_key: "no_read_#{SecureRandom.hex(8)}"
    )
    api_key_without_read.save!(validate: false)

    get api_v1_transfers_url, headers: api_headers(api_key_without_read)

    assert_response :forbidden
  ensure
    api_key_without_read&.destroy
  end
  test "updates transfer notes and tags" do
    read_write_key = ApiKey.create!(
      user: @user,
      name: "Test Read Write Key Notes",
      scopes: [ "read_write" ],
      source: "web",
      display_key: "test_rw_notes_#{SecureRandom.hex(8)}"
    )
    tag = @family.tags.create!(name: "Vacation")

    patch api_v1_transfer_url(@transfer),
          params: { transfer: { notes: "Updated note", tag_ids: [ tag.id ] } },
          headers: api_headers(read_write_key),
          as: :json

    assert_response :success
    response_data = JSON.parse(response.body)
    assert_equal "Updated note", response_data["notes"]
    assert_equal "Updated note", @transfer.reload.notes
    assert_includes @transfer.outflow_transaction.reload.tag_ids, tag.id
    assert_includes @transfer.inflow_transaction.reload.tag_ids, tag.id
  end

  test "deletes transfer" do
    read_write_key = ApiKey.create!(
      user: @user,
      name: "Test Read Write Key Destroy",
      scopes: [ "read_write" ],
      source: "web",
      display_key: "test_rw_destroy_#{SecureRandom.hex(8)}"
    )

    assert_difference "Transfer.count", -1 do
      delete api_v1_transfer_url(@transfer), headers: api_headers(read_write_key)
      assert_response :no_content
    end
  end

  test "destroy requires read_write scope" do
    delete api_v1_transfer_url(@transfer), headers: api_headers(@api_key)
    assert_response :forbidden
  end

  test "destroy requires authentication" do
    delete api_v1_transfer_url(@transfer)
    assert_response :unauthorized
  end

  test "destroy returns not found for another family's transfer" do
    read_write_key = ApiKey.create!(
      user: @user,
      name: "Test Read Write Key Other Destroy",
      scopes: [ "read_write" ],
      source: "web",
      display_key: "test_rw_other_destroy_#{SecureRandom.hex(8)}"
    )

    delete api_v1_transfer_url(@other_transfer), headers: api_headers(read_write_key)
    assert_response :not_found
  end

  test "marks transfer as recurring" do
    read_write_key = ApiKey.create!(
      user: @user,
      name: "Test Read Write Key Recurring",
      scopes: [ "read_write" ],
      source: "web",
      display_key: "test_rw_rec_#{SecureRandom.hex(8)}"
    )

    assert_difference "RecurringTransaction.count", 1 do
      post mark_as_recurring_api_v1_transfer_url(@transfer), headers: api_headers(read_write_key)
      assert_response :created
    end

    response_data = JSON.parse(response.body)
    assert_equal "Transfer marked as recurring", response_data["message"]
    assert response_data["recurring_transaction_id"].present?
  end

  test "mark as recurring returns conflict if already exists" do
    read_write_key = ApiKey.create!(
      user: @user,
      name: "Test Read Write Key Rec Conflict",
      scopes: [ "read_write" ],
      source: "web",
      display_key: "test_rw_rec_conf_#{SecureRandom.hex(8)}"
    )

    RecurringTransaction.create_from_transfer(@transfer)

    assert_no_difference "RecurringTransaction.count" do
      post mark_as_recurring_api_v1_transfer_url(@transfer), headers: api_headers(read_write_key)
      assert_response :conflict
    end
  end

  test "mark as recurring requires read_write scope" do
    post mark_as_recurring_api_v1_transfer_url(@transfer), headers: api_headers(@api_key)
    assert_response :forbidden
  end

  test "creates a domain transfer with fees tags and safe repeat submission" do
    tag = @family.tags.create!(name: "Transfer trip")
    key = SecureRandom.uuid
    payload = create_payload.merge(source_fee_amount: "2.5", destination_fee_amount: "1.25", tag_ids: [ tag.id ], idempotency_key: key)
    assert_difference "Transfer.count", 1 do
      post api_v1_transfers_url, params: { transfer: payload }, headers: api_headers(write_key), as: :json
      assert_response :created
    end
    created = Transfer.find(JSON.parse(response.body).fetch("id"))
    assert_equal 125, created.outflow_transaction.entry.amount
    assert_equal(-125, created.inflow_transaction.entry.amount)
    assert_equal [ tag.id ], created.outflow_transaction.tag_ids
    assert_equal [ tag.id ], created.inflow_transaction.tag_ids
    assert_equal 2.5, created.derived_source_fee_amount
    assert_equal 1.25, created.derived_destination_fee_amount
    assert_no_difference [ "Transfer.count", "Entry.count" ] do
      post api_v1_transfers_url, params: { transfer: payload }, headers: api_headers(write_key), as: :json
      assert_response :created
      assert_equal created.id, JSON.parse(response.body)["id"]
    end
    post api_v1_transfers_url, params: { transfer: payload.merge(amount: "126") }, headers: api_headers(write_key), as: :json
    assert_response :unprocessable_entity
  end

  test "creates cross currency transfers using source currency and a dated custom rate" do
    @destination_account.update!(currency: "EUR")
    post api_v1_transfers_url,
      params: { transfer: create_payload.merge(exchange_rate: "0.8", date: Date.tomorrow.iso8601) },
      headers: api_headers(write_key), as: :json
    assert_response :created
    created = Transfer.find(JSON.parse(response.body).fetch("id"))
    assert_equal 125, created.outflow_transaction.entry.amount
    assert_equal "USD", created.outflow_transaction.entry.currency
    assert_equal(-100, created.inflow_transaction.entry.amount)
    assert_equal "EUR", created.inflow_transaction.entry.currency
    assert_equal Date.tomorrow, created.date
  end

  test "create rejects invalid financial fields and dates without partial entries" do
    [ { amount: "0" }, { amount: "-1" }, { from_account_id: @destination_account.id }, { date: "invalid" },
      { source_fee_amount: "-1" }, { destination_fee_amount: "-1" }, { exchange_rate: "0" } ].each do |invalid|
      assert_no_difference [ "Transfer.count", "Entry.count" ] do
        post api_v1_transfers_url, params: { transfer: create_payload.merge(invalid) }, headers: api_headers(write_key), as: :json
        assert_response :unprocessable_entity
      end
    end
  end

  test "create requires authentication write scope and access to both endpoint accounts" do
    post api_v1_transfers_url, params: { transfer: create_payload }, as: :json
    assert_response :unauthorized
    post api_v1_transfers_url, params: { transfer: create_payload }, headers: api_headers(@api_key), as: :json
    assert_response :forbidden
    post api_v1_transfers_url, params: { transfer: create_payload.merge(to_account_id: @other_transfer.to_account.id) }, headers: api_headers(write_key), as: :json
    assert_response :not_found
    @destination_account.update!(owner: users(:family_member))
    share = @destination_account.account_shares.create!(user: @user, permission: "read_only")
    %w[read_only read_write].each do |permission|
      share.update!(permission: permission)
      assert_no_difference [ "Transfer.count", "Entry.count" ] do
        post api_v1_transfers_url, params: { transfer: create_payload }, headers: api_headers(write_key), as: :json
        assert_response :forbidden
      end
    end
  end

  test "form options contain only writable active accounts and family tags" do
    @destination_account.update!(owner: users(:family_member))
    @destination_account.account_shares.create!(user: @user, permission: "read_write")
    get "/api/v1/transfers/form_options", headers: api_headers(@api_key)
    assert_response :success
    body = JSON.parse(response.body)
    assert_includes body["accounts"].map { |account| account["id"] }, @account.id
    assert_not_includes body["accounts"].map { |account| account["id"] }, @destination_account.id
    assert_equal Date.current.iso8601, body["default_date"]
    assert body["text"]["submit"].present?
  end

  test "transfer exchange rate preserves date and endpoint permissions" do
    get "/api/v1/transfers/exchange_rate", params: { from_account_id: @account.id, to_account_id: @destination_account.id, date: Date.current.iso8601 }, headers: api_headers(@api_key)
    assert_response :success
    assert_equal 1, JSON.parse(response.body)["rate"].to_d
    get "/api/v1/transfers/exchange_rate", params: { from_account_id: @account.id, to_account_id: @destination_account.id, date: "invalid" }, headers: api_headers(@api_key)
    assert_response :unprocessable_entity
    get "/api/v1/transfers/exchange_rate", params: { from_account_id: @account.id, to_account_id: @other_transfer.to_account.id }, headers: api_headers(@api_key)
    assert_response :not_found
  end

  test "exchange rate lookup uses the selected date and reports unavailable rates" do
    @destination_account.update!(currency: "EUR")
    date = Date.new(2024, 1, 15)
    ExchangeRate.expects(:find_or_fetch_rate).with(from: "USD", to: "EUR", date: date).returns(nil)
    get "/api/v1/transfers/exchange_rate",
      params: { from_account_id: @account.id, to_account_id: @destination_account.id, date: date.iso8601 },
      headers: api_headers(@api_key)
    assert_response :unprocessable_entity
  end

  test "create unavailable cross currency rate returns validation failure without partial entries" do
    @destination_account.update!(currency: "EUR")
    ExchangeRate.stubs(:find_or_fetch_rate).returns(nil)
    assert_no_difference [ "Transfer.count", "Entry.count" ] do
      post api_v1_transfers_url, params: { transfer: create_payload }, headers: api_headers(write_key), as: :json
      assert_response :unprocessable_entity
    end
  end

  private

    def write_key
      @write_key ||= ApiKey.create!(user: @user, name: "Create transfer", scopes: [ "read_write" ], source: "web", display_key: "transfer_write_#{SecureRandom.hex(8)}")
    end

    def create_payload
      { from_account_id: @account.id, to_account_id: @destination_account.id, amount: "125", date: Date.current.iso8601 }
    end

    def create_transaction(account, amount:, date:, name:)
      entry = account.entries.create!(
        date: date,
        amount: amount,
        name: name,
        currency: account.currency,
        entryable: Transaction.new(kind: "funds_movement")
      )
      entry.entryable
    end

    def api_headers(api_key)
      { "X-Api-Key" => api_key.display_key }
    end
end
