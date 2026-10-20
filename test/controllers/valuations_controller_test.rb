require "test_helper"

class ValuationsControllerTest < ActionDispatch::IntegrationTest
  include EntryableResourceInterfaceTest

  setup do
    sign_in @user = users(:family_admin)
    @entry = entries(:valuation)
  end

  test "HTML valuation URLs serve the SPA including account scoped direct loads" do
    [ new_valuation_url, valuation_url(@entry),
      new_account_valuation_url(@entry.account), account_valuation_url(@entry.account, @entry) ].each do |url|
      get url
      assert_response :success
      assert_select "#spa-root"
    end
  end

  test "new JSON offers only writable accounts and respects an explicit account currency" do
    sign_in users(:family_member)
    get new_valuation_url(format: :json)
    assert_response :success
    assert_nil response.parsed_body["account_id"]
    assert_equal [ accounts(:depository).id ], response.parsed_body["accounts"].map { |account| account["id"] }

    accounts(:depository).update!(currency: "EUR")
    get new_valuation_url(format: :json), params: { account_id: accounts(:depository).id }
    assert_response :success
    assert_equal accounts(:depository).id, response.parsed_body["account_id"]
    assert_equal "EUR", response.parsed_body.dig("entry", "currency")

    get new_valuation_url(format: :json), params: { account_id: accounts(:investment).id }
    assert_response :not_found
    get new_valuation_url(format: :json), params: { account_id: accounts(:credit_card).id }
    assert_response :forbidden
  end

  test "show JSON preserves anchor kind and decimal precision without offering account changes" do
    @entry.update!(amount: "4995.13", notes: "Original note")
    @entry.valuation.update!(kind: "opening_anchor")

    get valuation_url(@entry, format: :json)

    assert_response :success
    payload = response.parsed_body
    assert_equal @entry.id, payload.dig("entry", "id")
    assert_equal "4995.13", payload.dig("entry", "amount")
    assert_equal "opening_anchor", payload.dig("entry", "kind")
    assert_equal "Original note", payload.dig("entry", "notes")
    assert_equal [ @entry.account_id ], payload["accounts"].map { |account| account["id"] }
    assert_equal({ "can_edit" => true, "can_annotate" => true }, payload["permissions"])
    assert_equal Entry.min_supported_date.next_day.iso8601, payload.dig("date_bounds", "min")
  end

  test "can create reconciliation with legacy HTML redirect" do
    account = accounts(:investment)
    assert_difference [ "Entry.count", "Valuation.count" ], 1 do
      post valuations_url, params: { entry: { amount: account.balance + 100, date: Date.current.to_s, account_id: account.id } }
    end

    created_entry = account.entries.valuations.find_by!(date: Date.current)
    assert_equal account.balance + 100, created_entry.amount
    assert_enqueued_with job: SyncJob
    assert_redirected_to account_url(account)
  end

  test "JSON create and confirmed financial update retain sync and anchor identity" do
    account = @entry.account
    post valuations_url(format: :json), params: { entry: { amount: "5100.25", date: Date.current.iso8601, account_id: account.id } }
    assert_response :created
    entry = Entry.find(response.parsed_body.fetch("entry_id"))
    assert_equal account.id, response.parsed_body["account_id"]
    assert_equal BigDecimal("5100.25"), entry.amount
    assert_enqueued_with job: SyncJob

    @entry.valuation.update!(kind: "opening_anchor")
    assert_no_difference [ "Entry.count", "Valuation.count" ] do
      patch valuation_url(@entry, format: :json), params: { entry: { amount: "4800.50", date: @entry.date.iso8601 } }
    end
    assert_response :success
    assert_equal @entry.id, response.parsed_body["entry_id"]
    assert_equal BigDecimal("4800.50"), @entry.reload.amount
    assert_equal "opening_anchor", @entry.valuation.kind
  end

  test "same date create reuses a valuation while a conflicting update fails without saving notes" do
    post valuations_url(format: :json), params: {
      entry: { account_id: @entry.account_id, date: @entry.date.iso8601, amount: "5001" }
    }
    assert_response :created
    assert_equal @entry.id, response.parsed_body["entry_id"]
    assert_equal 5001, @entry.reload.amount

    other = @entry.account.entries.create!(
      name: "Another balance", date: Date.current, amount: 5100, currency: @entry.currency, entryable: Valuation.new
    )
    patch valuation_url(@entry, format: :json), params: {
      entry: { date: other.date.iso8601, amount: "5500", notes: "Must not save" }
    }
    assert_json_errors :unprocessable_entity
    assert_equal 5001, @entry.reload.amount
    assert_nil @entry.notes
    assert_equal 5100, other.reload.amount
  end

  test "legacy update accepts notes alongside financial changes" do
    patch valuation_url(@entry), params: { entry: { amount: 22000, date: Date.current, notes: "Test notes" } }

    assert_redirected_to account_url(@entry.account)
    assert_enqueued_with job: SyncJob
    assert_equal 22000, @entry.reload.amount
    assert_equal "Test notes", @entry.notes
  end

  test "investment preview derives holdings and negative brokerage cash without persistence or sync" do
    account = accounts(:investment)
    account.balances.create!(date: Date.current, currency: account.currency, balance: 10000,
      cash_balance: 2000, start_cash_balance: 2000, start_non_cash_balance: 8000, flows_factor: 1)

    assert_no_difference [ "Entry.count", "Valuation.count", "Sync.count" ] do
      assert_no_enqueued_jobs only: SyncJob do
        post confirm_create_valuations_url(format: :json), params: {
          entry: { amount: 7000, date: Date.current.iso8601, account_id: account.id }
        }
      end
    end

    assert_response :success
    confirmation = response.parsed_body.fetch("confirmation")
    assert_equal true, confirmation["investment"]
    assert_equal Money.new(7000, account.currency).format, confirmation["total_value"]
    assert_equal Money.new(8000, account.currency).format, confirmation["holdings_value"]
    assert_equal Money.new(-1000, account.currency).format, confirmation["brokerage_cash"]
    assert_equal true, confirmation["brokerage_cash_negative"]
  end

  test "update preview leaves stored balance date notes and kind untouched" do
    original = @entry.attributes.slice("amount", "date", "notes")
    original_kind = @entry.valuation.kind
    assert_no_difference [ "Entry.count", "Valuation.count", "Sync.count" ] do
      post confirm_update_valuation_url(@entry, format: :json), params: {
        entry: { amount: "1234.56", date: Date.current.iso8601 }
      }
    end

    assert_response :success
    confirmation = response.parsed_body.fetch("confirmation")
    assert_equal false, confirmation["investment"]
    assert_equal Money.new(BigDecimal("1234.56"), @entry.currency).format, confirmation["total_value"]
    assert_nil confirmation["holdings_value"]
    assert_nil confirmation["brokerage_cash"]
    assert_equal false, confirmation["brokerage_cash_negative"]
    assert_equal original, @entry.reload.attributes.slice("amount", "date", "notes")
    assert_equal original_kind, @entry.valuation.kind
  end

  test "preview cannot resolve a pledge but confirmed reconciliation still does" do
    account = @entry.account
    pledge = goals(:emergency_fund).goal_pledges.create!(account: account, amount: 150, currency: "USD", kind: "manual_save")
    attributes = { amount: @entry.amount + 150, date: @entry.date.iso8601 }

    post confirm_update_valuation_url(@entry, format: :json), params: { entry: attributes }
    assert_response :success
    assert pledge.reload.status_open?

    patch valuation_url(@entry, format: :json), params: { entry: attributes }
    assert_response :success
    assert pledge.reload.status_matched?
  end

  test "invalid amount and date input returns errors without writing on preview create or update" do
    invalid_attributes = [
      { amount: "", date: Date.current.iso8601 },
      { amount: "not a number", date: Date.current.iso8601 },
      { amount: "NaN", date: Date.current.iso8601 },
      { amount: "Infinity", date: Date.current.iso8601 },
      { amount: "5000", date: "not a date" },
      { amount: "5000", date: "" },
      { amount: "5000", date: Entry.min_supported_date.iso8601 },
      { amount: "5000", date: Date.tomorrow.iso8601 },
      { date: Date.current.iso8601 },
      { amount: "5000" }
    ]
    original = @entry.attributes.slice("amount", "date", "notes")
    invalid_attributes.each do |attributes|
      assert_no_difference [ "Entry.count", "Valuation.count", "Sync.count" ] do
        post confirm_create_valuations_url(format: :json), params: { entry: attributes.merge(account_id: @entry.account_id) }
        assert_json_errors :unprocessable_entity
        post valuations_url(format: :json), params: { entry: attributes.merge(account_id: @entry.account_id) }
        assert_json_errors :unprocessable_entity
        post confirm_update_valuation_url(@entry, format: :json), params: { entry: attributes }
        assert_json_errors :unprocessable_entity
        patch valuation_url(@entry, format: :json), params: { entry: attributes.merge(notes: "Must not save") }
        assert_json_errors :unprocessable_entity
      end
      assert_equal original, @entry.reload.attributes.slice("amount", "date", "notes")
    end
  end

  test "reconciliation failure is a 422 preview response" do
    Account.any_instance.stubs(:create_reconciliation).returns(OpenStruct.new(success?: false, error_message: "Reconciliation failed"))
    post confirm_create_valuations_url(format: :json), params: {
      entry: { amount: "5100", date: Date.current.iso8601, account_id: @entry.account_id }
    }
    assert_json_errors :unprocessable_entity
    assert_equal [ "Reconciliation failed" ], response.parsed_body["errors"]
  end

  test "read write share can save and clear notes but not change financials preview or delete" do
    account_shares(:depository_shared_with_member).update!(permission: "read_write")
    sign_in users(:family_member)
    get valuation_url(@entry, format: :json)
    assert_equal({ "can_edit" => false, "can_annotate" => true }, response.parsed_body["permissions"])

    patch valuation_url(@entry, format: :json), params: { entry: { notes: "Shared note" } }
    assert_response :success
    assert_equal "Shared note", @entry.reload.notes
    [ "", nil ].each do |notes|
      patch valuation_url(@entry, format: :json), params: { entry: { notes: notes } }, as: :json
      assert_response :success
      assert_equal notes, @entry.reload.notes
    end

    original = @entry.amount
    patch valuation_url(@entry, format: :json), params: { entry: { amount: "9000", date: Date.current.iso8601, notes: "Forbidden" } }
    assert_json_errors :forbidden
    assert_equal original, @entry.reload.amount
    assert_nil @entry.notes
    post confirm_update_valuation_url(@entry, format: :json), params: { entry: { amount: "9000", date: Date.current.iso8601 } }
    assert_json_errors :forbidden
    delete valuation_url(@entry, format: :json)
    assert_json_errors :forbidden
    assert Entry.exists?(@entry.id)
  end

  test "read only shares may view but cannot annotate create preview or delete" do
    account_shares(:depository_shared_with_member).update!(permission: "read_only")
    sign_in users(:family_member)
    get valuation_url(@entry, format: :json)
    assert_response :success
    assert_equal({ "can_edit" => false, "can_annotate" => false }, response.parsed_body["permissions"])

    patch valuation_url(@entry, format: :json), params: { entry: { notes: "Forbidden" } }
    assert_json_errors :forbidden
    attributes = { amount: "9000", date: Date.current.iso8601, account_id: @entry.account_id }
    post confirm_create_valuations_url(format: :json), params: { entry: attributes }
    assert_json_errors :forbidden
    post valuations_url(format: :json), params: { entry: attributes }
    assert_json_errors :forbidden
    delete valuation_url(@entry, format: :json)
    assert_json_errors :forbidden
    assert_nil @entry.reload.notes
  end

  test "full control shares retain financial write access" do
    sign_in users(:family_member)
    patch valuation_url(@entry, format: :json), params: { entry: { amount: "5010", date: @entry.date.iso8601 } }
    assert_response :success
    assert_equal 5010, @entry.reload.amount
  end

  test "JSON lookups reject other entry types and inaccessible families on every member action" do
    [ entries(:transaction), entries(:trade) ].each do |entry|
      assert_no_difference "Entry.count" do
        get valuation_url(entry, format: :json)
        assert_json_errors :not_found
        post confirm_update_valuation_url(entry, format: :json), params: { entry: { amount: 100, date: Date.current.iso8601 } }
        assert_json_errors :not_found
        patch valuation_url(entry, format: :json), params: { entry: { notes: "Wrong type" } }
        assert_json_errors :not_found
        delete valuation_url(entry, format: :json)
        assert_json_errors :not_found
      end
    end

    sign_in users(:empty)
    get valuation_url(@entry, format: :json)
    assert_json_errors :not_found
    post valuations_url(format: :json), params: { entry: { account_id: @entry.account_id, amount: 100, date: Date.current.iso8601 } }
    assert_json_errors :not_found
  end

  test "JSON deletion removes the valuation and schedules reconciliation" do
    assert_difference [ "Entry.count", "Valuation.count" ], -1 do
      delete valuation_url(@entry, format: :json)
    end
    assert_response :no_content
    assert_enqueued_with job: SyncJob
  end

  private
    def assert_json_errors(status)
      assert_response status
      assert_kind_of Array, response.parsed_body["errors"]
      assert response.parsed_body["errors"].all? { |error| error.is_a?(String) }
    end
end
