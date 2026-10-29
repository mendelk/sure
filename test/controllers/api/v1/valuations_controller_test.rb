# frozen_string_literal: true

require "test_helper"

class Api::V1::ValuationsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @family = @user.family
    @account = @family.accounts.first
    @valuation = @family.entries.valuations.first.entryable

    # Destroy existing active API keys to avoid validation errors
    @user.api_keys.active.destroy_all

    # Create fresh API keys instead of using fixtures to avoid parallel test conflicts (rate limiting in test)
    @api_key = ApiKey.create!(
      user: @user,
      name: "Test Read-Write Key",
      scopes: [ "read_write" ],
      source: "web",
      display_key: "test_rw_#{SecureRandom.hex(8)}"
    )

    @read_only_api_key = ApiKey.create!(
      user: @user,
      name: "Test Read-Only Key",
      scopes: [ "read" ],
      display_key: "test_ro_#{SecureRandom.hex(8)}",
      source: "mobile"  # Use different source to allow multiple keys
    )

    # Clear any existing rate limit data
    Redis.new.del("api_rate_limit:#{@api_key.id}")
    Redis.new.del("api_rate_limit:#{@read_only_api_key.id}")
  end

  # INDEX action tests
  test "should get index with valid API key" do
    get api_v1_valuations_url, headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    assert response_data.key?("valuations")
    assert response_data.key?("pagination")
    assert response_data["valuations"].is_a?(Array)
    assert response_data["pagination"].key?("page")
    assert response_data["pagination"].key?("per_page")
    assert response_data["pagination"].key?("total_count")
    assert response_data["pagination"].key?("total_pages")
  end

  test "should get index with read-only API key" do
    get api_v1_valuations_url, headers: api_headers(@read_only_api_key)
    assert_response :success
  end

  test "should filter index by account_id" do
    get api_v1_valuations_url,
        params: { account_id: @account.id },
        headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    response_data["valuations"].each do |valuation|
      assert_equal @account.id, valuation["account"]["id"]
    end
  end

  test "should filter index by date range" do
    entry = @valuation.entry

    get api_v1_valuations_url,
        params: { start_date: entry.date, end_date: entry.date },
        headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    assert_includes response_data["valuations"].map { |valuation| valuation["id"] }, entry.id
    response_data["valuations"].each do |valuation|
      valuation_date = Date.iso8601(valuation["date"])
      assert_equal entry.date, valuation_date
    end
  end

  test "should reject index with invalid date filter" do
    get api_v1_valuations_url,
        params: { start_date: "04/30/2026" },
        headers: api_headers(@api_key)
    assert_response :unprocessable_entity

    response_data = JSON.parse(response.body)
    assert_equal "validation_failed", response_data["error"]
  end

  test "should reject index with malformed account_id filter" do
    get api_v1_valuations_url,
        params: { account_id: "not-a-uuid" },
        headers: api_headers(@api_key)
    assert_response :unprocessable_entity

    response_data = JSON.parse(response.body)
    assert_equal "validation_failed", response_data["error"]
    assert_equal "account_id must be a valid UUID", response_data["message"]
  end

  test "should not expose internal index errors" do
    Api::V1::ValuationsController.any_instance.stubs(:safe_page_param).raises(StandardError, "database password leaked")

    get api_v1_valuations_url, headers: api_headers(@api_key)
    assert_response :internal_server_error

    response_data = JSON.parse(response.body)
    assert_equal "internal_server_error", response_data["error"]
    assert_equal "An unexpected error occurred", response_data["message"]
    assert_not_includes response.body, "database password leaked"
  end

  test "should reject index without API key" do
    get api_v1_valuations_url
    assert_response :unauthorized
  end

  # CREATE action tests
  test "should create valuation with valid parameters" do
    valuation_params = {
      valuation: {
        account_id: @account.id,
        amount: 10000.00,
        date: Date.current,
        notes: "Quarterly statement"
      }
    }

    assert_difference("@family.entries.valuations.count", 1) do
      post api_v1_valuations_url,
           params: valuation_params,
           headers: api_headers(@api_key)
    end

    assert_response :created
    response_data = JSON.parse(response.body)
    assert_equal Date.current.to_s, response_data["date"]
    assert_equal @account.id, response_data["account"]["id"]
  end

  test "should upsert valuation for same account and date when requested" do
    existing_entry = @valuation.entry
    valuation_params = {
      upsert: "true",
      valuation: {
        account_id: existing_entry.account.id,
        amount: 12_345.67,
        date: existing_entry.date,
        notes: "API correction"
      }
    }

    assert_no_difference("@family.entries.valuations.count") do
      post api_v1_valuations_url,
           params: valuation_params,
           headers: api_headers(@api_key)
    end

    assert_response :ok
    response_data = JSON.parse(response.body)
    assert_equal existing_entry.id, response_data["id"]
    assert_equal existing_entry.date.to_s, response_data["date"]
    assert_equal "API correction", response_data["notes"]
    assert_equal BigDecimal("12345.67"), existing_entry.reload.amount
  end

  test "should create valuation when upsert is requested without an existing same-date valuation" do
    valuation_date = Date.current + 3.days
    valuation_params = {
      upsert: "true",
      valuation: {
        account_id: @account.id,
        amount: 9876.54,
        date: valuation_date,
        notes: "New API valuation"
      }
    }

    assert_difference("@family.entries.valuations.count", 1) do
      post api_v1_valuations_url,
           params: valuation_params,
           headers: api_headers(@api_key)
    end

    assert_response :created
    response_data = JSON.parse(response.body)
    assert_equal valuation_date.to_s, response_data["date"]
    assert_equal "New API valuation", response_data["notes"]
  end

  test "should accept nested upsert flag for same-date valuation writes" do
    existing_entry = @valuation.entry
    valuation_params = {
      valuation: {
        account_id: existing_entry.account.id,
        amount: 22_222.22,
        date: existing_entry.date,
        notes: "Nested upsert correction",
        upsert: "true"
      }
    }

    assert_no_difference("@family.entries.valuations.count") do
      post api_v1_valuations_url,
           params: valuation_params,
           headers: api_headers(@api_key)
    end

    assert_response :ok
    response_data = JSON.parse(response.body)
    assert_equal existing_entry.id, response_data["id"]
    assert_equal "Nested upsert correction", response_data["notes"]
    assert_equal BigDecimal("22222.22"), existing_entry.reload.amount
  end

  test "should reject create with read-only API key" do
    valuation_params = {
      valuation: {
        account_id: @account.id,
        amount: 10000.00,
        date: Date.current
      }
    }

    post api_v1_valuations_url,
         params: valuation_params,
         headers: api_headers(@read_only_api_key)
    assert_response :forbidden
  end

  test "should reject create with invalid account_id" do
    valuation_params = {
      valuation: {
        account_id: 999999,
        amount: 10000.00,
        date: Date.current
      }
    }

    post api_v1_valuations_url,
         params: valuation_params,
         headers: api_headers(@api_key)
    assert_response :not_found
  end

  test "should reject create with invalid parameters" do
    valuation_params = {
      valuation: {
        # Missing required fields
        account_id: @account.id
      }
    }

    post api_v1_valuations_url,
         params: valuation_params,
         headers: api_headers(@api_key)
    assert_response :unprocessable_entity
  end

  test "should reject create without API key" do
    post api_v1_valuations_url, params: { valuation: { account_id: @account.id } }
    assert_response :unauthorized
  end

  # UPDATE action tests
  test "should update valuation with valid parameters" do
    entry = @valuation.entry
    update_params = {
      valuation: {
        amount: 15000.00,
        date: Date.current
      }
    }

    put api_v1_valuation_url(entry),
        params: update_params,
        headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    assert_equal Date.current.to_s, response_data["date"]
  end

  test "should update valuation notes only" do
    entry = @valuation.entry
    update_params = {
      valuation: {
        notes: "Updated notes"
      }
    }

    put api_v1_valuation_url(entry),
        params: update_params,
        headers: api_headers(@api_key)
    assert_response :success

    response_data = JSON.parse(response.body)
    assert_equal "Updated notes", response_data["notes"]
  end

  test "should reject update with read-only API key" do
    entry = @valuation.entry
    update_params = {
      valuation: {
        amount: 15000.00
      }
    }

    put api_v1_valuation_url(entry),
        params: update_params,
        headers: api_headers(@read_only_api_key)
    assert_response :forbidden
  end

  test "should reject update for non-existent valuation" do
    put api_v1_valuation_url(999999),
        params: { valuation: { amount: 15000.00 } },
        headers: api_headers(@api_key)
    assert_response :not_found
  end

  test "should reject update without API key" do
    entry = @valuation.entry
    put api_v1_valuation_url(entry), params: { valuation: { amount: 15000.00 } }
    assert_response :unauthorized
  end

  # JSON structure tests
  test "valuation JSON should have expected structure" do
    # Create a new valuation to test the structure
    entry = @account.entries.create!(
      name: Valuation.build_reconciliation_name(@account.accountable_type),
      date: Date.current,
      amount: 10000,
      currency: @account.currency,
      entryable: Valuation.new(kind: :reconciliation)
    )

    get api_v1_valuation_url(entry), headers: api_headers(@api_key)
    assert_response :success

    valuation_data = JSON.parse(response.body)

    # Basic fields
    assert_equal entry.id, valuation_data["id"]
    assert valuation_data.key?("id")
    assert valuation_data.key?("date")
    assert valuation_data.key?("amount")
    assert valuation_data.key?("currency")
    assert valuation_data.key?("kind")
    assert valuation_data.key?("created_at")
    assert valuation_data.key?("updated_at")

    # Account information
    assert valuation_data.key?("account")
    assert valuation_data["account"].key?("id")
    assert valuation_data["account"].key?("name")
    assert valuation_data["account"].key?("account_type")

    # Optional fields should be present (even if nil)
    assert valuation_data.key?("notes")
  end

  test "form options preserve account currency and offer only writable accounts" do
    member_key = member_api_key
    accounts(:depository).update!(currency: "EUR")
    get form_options_api_v1_valuations_url, headers: api_headers(member_key)
    assert_response :success
    workspace = response.parsed_body.fetch("workspace")
    assert_nil workspace["account_id"]
    assert_equal [ accounts(:depository).id ], workspace["accounts"].pluck("id")
    assert_equal Entry.min_supported_date.next_day.iso8601, workspace.dig("date_bounds", "min")

    get form_options_api_v1_valuations_url, params: { account_id: accounts(:depository).id }, headers: api_headers(member_key)
    assert_response :success
    assert_equal "EUR", response.parsed_body.dig("workspace", "entry", "currency")

    get form_options_api_v1_valuations_url, params: { account_id: accounts(:credit_card).id }, headers: api_headers(member_key)
    assert_response :forbidden
    get form_options_api_v1_valuations_url, params: { account_id: accounts(:investment).id }, headers: api_headers(member_key)
    assert_response :not_found
  end

  test "show workspace is additive and preserves opening anchors and precise amounts" do
    entry = entries(:valuation)
    entry.update!(amount: "4995.13", notes: "Original")
    entry.valuation.update!(kind: "opening_anchor")
    get api_v1_valuation_url(entry), params: { include: "workspace" }, headers: api_headers(@api_key)
    assert_response :success
    assert_equal entry.id, response.parsed_body["id"]
    workspace = response.parsed_body.fetch("workspace")
    assert_equal "4995.13", workspace.dig("entry", "amount")
    assert_equal "opening_anchor", workspace.dig("entry", "kind")
    assert_equal "Original", workspace.dig("entry", "notes")
    assert_equal [ entry.account_id ], workspace["accounts"].pluck("id")
    assert_equal({ "can_edit" => true, "can_annotate" => true }, workspace["permissions"])
  end

  test "investment preview calculates negative brokerage cash without persistence or sync" do
    account = accounts(:investment)
    account.update!(currency: "EUR")
    account.balances.create!(date: Date.current, currency: "EUR", balance: 10000,
      cash_balance: 2000, start_cash_balance: 2000, start_non_cash_balance: 8000, flows_factor: 1)
    assert_no_difference [ "Entry.count", "Valuation.count", "Sync.count" ] do
      assert_no_enqueued_jobs only: SyncJob do
        post preview_api_v1_valuations_url, params: {
          valuation: { account_id: account.id, amount: "7000", date: Date.current.iso8601 }
        }, headers: api_headers(@api_key)
      end
    end
    assert_response :success
    confirmation = response.parsed_body.fetch("confirmation")
    assert_equal true, confirmation["investment"]
    assert_equal Money.new(7000, "EUR").format, confirmation["total_value"]
    assert_equal Money.new(8000, "EUR").format, confirmation["holdings_value"]
    assert_equal Money.new(-1000, "EUR").format, confirmation["brokerage_cash"]
    assert_equal true, confirmation["brokerage_cash_negative"]
  end

  test "update preview preserves persisted attributes and cannot resolve a pledge" do
    entry = entries(:valuation)
    entry.valuation.update!(kind: "opening_anchor")
    pledge = goals(:emergency_fund).goal_pledges.create!(
      account: entry.account, amount: 150, currency: entry.currency, kind: "manual_save"
    )
    original = entry.attributes.slice("amount", "date", "notes", "locked_attributes")
    attributes = { amount: entry.amount + 150, date: entry.date.iso8601 }
    assert_no_difference [ "Entry.count", "Valuation.count", "Sync.count" ] do
      assert_no_enqueued_jobs only: SyncJob do
        post preview_api_v1_valuation_url(entry), params: { valuation: attributes }, headers: api_headers(@api_key)
      end
    end
    assert_response :success
    assert_equal Money.new(attributes[:amount], entry.currency).format, response.parsed_body.dig("confirmation", "total_value")
    assert_equal original, entry.reload.attributes.slice("amount", "date", "notes", "locked_attributes")
    assert_equal "opening_anchor", entry.valuation.kind
    assert pledge.reload.status_open?

    patch api_v1_valuation_url(entry), params: { valuation: attributes }, headers: api_headers(@api_key)
    assert_response :success
    assert_equal entry.id, response.parsed_body["id"]
    assert_equal "opening_anchor", entry.valuation.reload.kind
    assert pledge.reload.status_matched?
    assert_enqueued_with job: SyncJob
  end

  test "invalid reconciliation inputs fail consistently before preview and mutations" do
    entry = entries(:valuation)
    original = entry.attributes.slice("amount", "date", "notes")
    [
      { amount: "", date: Date.current.iso8601 },
      { amount: "invalid", date: Date.current.iso8601 },
      { amount: "NaN", date: Date.current.iso8601 },
      { amount: "Infinity", date: Date.current.iso8601 },
      { amount: "10", date: "not-a-date" },
      { amount: "10", date: Entry.min_supported_date.iso8601 },
      { amount: "10" }, { date: Date.current.iso8601 }
    ].each do |attributes|
      assert_no_difference [ "Entry.count", "Valuation.count", "Sync.count" ] do
        post preview_api_v1_valuations_url, params: { valuation: attributes.merge(account_id: entry.account_id) }, headers: api_headers(@api_key)
        assert_response :unprocessable_entity
        assert response.parsed_body["errors"].present?
        post preview_api_v1_valuation_url(entry), params: { valuation: attributes }, headers: api_headers(@api_key)
        assert_response :unprocessable_entity
        post api_v1_valuations_url, params: { valuation: attributes.merge(account_id: entry.account_id) }, headers: api_headers(@api_key)
        assert_response :unprocessable_entity
        patch api_v1_valuation_url(entry), params: { valuation: attributes.merge(notes: "Must not save") }, headers: api_headers(@api_key)
        assert_response :unprocessable_entity
      end
      assert_equal original, entry.reload.attributes.slice("amount", "date", "notes")
    end
  end

  test "conflicting update preview and confirmation do not save financials or notes" do
    entry = entries(:valuation)
    other = entry.account.entries.create!(name: "Other", date: Date.current, amount: 5100,
      currency: entry.currency, entryable: Valuation.new)
    original = entry.attributes.slice("amount", "date", "notes")
    attributes = { date: other.date.iso8601, amount: "5500", notes: "Must not save" }
    post preview_api_v1_valuation_url(entry), params: { valuation: attributes }, headers: api_headers(@api_key)
    assert_response :unprocessable_entity
    patch api_v1_valuation_url(entry), params: { valuation: attributes }, headers: api_headers(@api_key)
    assert_response :unprocessable_entity
    assert_equal original, entry.reload.attributes.slice("amount", "date", "notes")
    assert_equal 5100, other.reload.amount
  end

  test "read write shares may annotate and clear notes but cannot reconcile preview or delete" do
    entry = entries(:valuation)
    account_shares(:depository_shared_with_member).update!(permission: "read_write")
    key = member_api_key
    get api_v1_valuation_url(entry), params: { include: "workspace" }, headers: api_headers(key)
    assert_response :success
    assert_equal({ "can_edit" => false, "can_annotate" => true }, response.parsed_body.dig("workspace", "permissions"))
    [ "Shared note", "", nil ].each do |notes|
      patch api_v1_valuation_url(entry), params: { valuation: { notes: notes } }, headers: api_headers(key), as: :json
      assert_response :success
      assert_equal notes, entry.reload.notes
    end
    attributes = { date: entry.date.iso8601, amount: "9000" }
    post preview_api_v1_valuation_url(entry), params: { valuation: attributes }, headers: api_headers(key)
    assert_response :forbidden
    post preview_api_v1_valuations_url, params: { valuation: attributes.merge(account_id: entry.account_id) }, headers: api_headers(key)
    assert_response :forbidden
    post api_v1_valuations_url, params: { valuation: attributes.merge(account_id: entry.account_id) }, headers: api_headers(key)
    assert_response :forbidden
    patch api_v1_valuation_url(entry), params: { valuation: attributes.merge(notes: "Forbidden") }, headers: api_headers(key)
    assert_response :forbidden
    delete api_v1_valuation_url(entry), headers: api_headers(key)
    assert_response :forbidden
    assert_nil entry.reload.notes
  end

  test "read only shares cannot annotate and full control shares can reconcile" do
    entry = entries(:valuation)
    key = member_api_key
    share = account_shares(:depository_shared_with_member)
    share.update!(permission: "read_only")
    patch api_v1_valuation_url(entry), params: { valuation: { notes: "Forbidden" } }, headers: api_headers(key)
    assert_response :forbidden
    share.update!(permission: "full_control")
    patch api_v1_valuation_url(entry), params: { valuation: { amount: "5010", date: entry.date.iso8601 } }, headers: api_headers(key)
    assert_response :success
    assert_equal 5010, entry.reload.amount
  end

  test "valuation member endpoints reject inaccessible accounts and other entry types" do
    key = member_api_key
    inaccessible = accounts(:investment).entries.create!(
      name: "Private valuation", date: Date.current, amount: 1000,
      currency: accounts(:investment).currency, entryable: Valuation.new
    )
    [ inaccessible, entries(:transaction), entries(:trade) ].each do |entry|
      get api_v1_valuation_url(entry), headers: api_headers(key)
      assert_response :not_found
      post preview_api_v1_valuation_url(entry), params: { valuation: { amount: "100", date: Date.current.iso8601 } }, headers: api_headers(key)
      assert_response :not_found
      patch api_v1_valuation_url(entry), params: { valuation: { notes: "Forbidden" } }, headers: api_headers(key)
      assert_response :not_found
      delete api_v1_valuation_url(entry), headers: api_headers(key)
      assert_response :not_found
    end
  end

  test "delete removes valuation and queues balance recalculation" do
    entry = entries(:valuation)
    assert_difference [ "Entry.count", "Valuation.count" ], -1 do
      delete api_v1_valuation_url(entry), headers: api_headers(@api_key)
    end
    assert_response :no_content
    assert_empty response.body
    assert_enqueued_with job: SyncJob
  end

  test "new endpoints require authentication and preview and deletion require write scope" do
    entry = entries(:valuation)
    attributes = { valuation: { account_id: entry.account_id, amount: "100", date: entry.date.iso8601 } }
    get form_options_api_v1_valuations_url
    assert_response :unauthorized
    post preview_api_v1_valuations_url, params: attributes
    assert_response :unauthorized
    post preview_api_v1_valuation_url(entry), params: attributes
    assert_response :unauthorized
    delete api_v1_valuation_url(entry)
    assert_response :unauthorized
    post preview_api_v1_valuations_url, params: attributes, headers: api_headers(@read_only_api_key)
    assert_response :forbidden
    post preview_api_v1_valuation_url(entry), params: attributes, headers: api_headers(@read_only_api_key)
    assert_response :forbidden
    delete api_v1_valuation_url(entry), headers: api_headers(@read_only_api_key)
    assert_response :forbidden
    get form_options_api_v1_valuations_url, headers: api_headers(@read_only_api_key)
    assert_response :success
  end

  test "missing valuation and required inputs return structured errors without mutations" do
    entry = entries(:valuation)
    assert_no_difference [ "Entry.count", "Valuation.count", "Sync.count" ] do
      get api_v1_valuation_url(SecureRandom.uuid), headers: api_headers(@api_key)
      assert_api_error :not_found, "not_found"
      post preview_api_v1_valuation_url(SecureRandom.uuid),
        params: { valuation: { amount: "100", date: Date.current.iso8601 } }, headers: api_headers(@api_key)
      assert_api_error :not_found, "not_found"
      delete api_v1_valuation_url(SecureRandom.uuid), headers: api_headers(@api_key)
      assert_api_error :not_found, "not_found"
      post preview_api_v1_valuations_url, headers: api_headers(@api_key)
      assert_api_error :unprocessable_entity, "validation_failed"
      post preview_api_v1_valuation_url(entry), headers: api_headers(@api_key)
      assert_api_error :unprocessable_entity, "validation_failed"
      patch api_v1_valuation_url(entry), headers: api_headers(@api_key)
      assert_api_error :unprocessable_entity, "validation_failed"
      post api_v1_valuations_url, headers: api_headers(@api_key)
      assert_api_error :unprocessable_entity, "validation_failed"
    end
  end

  private
    def assert_api_error(status, code)
      assert_response status
      payload = response.parsed_body
      assert_equal code, payload["error"]
      assert payload["message"].present?
      assert_kind_of Array, payload["errors"]
      assert payload["errors"].any?
    end

    def member_api_key
      user = users(:family_member)
      user.api_keys.active.destroy_all
      ApiKey.create!(user: user, name: "Member API key", scopes: [ "read_write" ],
        source: "web", display_key: "test_member_#{SecureRandom.hex(8)}")
    end


    def api_headers(api_key)
      { "X-Api-Key" => api_key.plain_key }
    end
end
