# frozen_string_literal: true

require "test_helper"

class Api::V1::AccountsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin) # dylan_family user
    @other_family_user = users(:family_member)
    @other_family_user.update!(family: families(:empty))

    @user.api_keys.active.destroy_all
    @api_key = ApiKey.create!(
      user: @user,
      name: "Test Read Key",
      scopes: [ "read" ],
      source: "web",
      display_key: "test_read_#{SecureRandom.hex(8)}"
    )
    @read_write_api_key = ApiKey.create!(
      user: @user,
      name: "Test Read Write Key",
      scopes: [ "read_write" ],
      source: "mobile",
      display_key: "test_read_write_#{SecureRandom.hex(8)}"
    )

    @other_family_user.api_keys.active.destroy_all
    @other_family_api_key = ApiKey.create!(
      user: @other_family_user,
      name: "Other Family Read Key",
      scopes: [ "read" ],
      source: "web",
      display_key: "other_family_read_#{SecureRandom.hex(8)}"
    )
  end

  test "credit card due day round trips and clearing it disables automatic statement payments" do
    account = accounts(:credit_card)
    patch api_v1_account_url(account), params: { account: { accountable: { payment_due_day: 31 } } },
          headers: api_headers(@read_write_api_key), as: :json
    assert_response :success
    assert_equal 31, account.accountable.reload.payment_due_day
    assert_equal 31, response.parsed_body.dig("accountable", "payment_due_day")
    assert_equal "manual", response.parsed_body.dig("accountable", "payment_due_day_source")
    assert account.recurring_transactions.exists?(system_managed_kind: "credit_card_payment")

    patch api_v1_account_url(account), params: { account: { accountable: { payment_due_day: nil } } },
          headers: api_headers(@read_write_api_key), as: :json
    assert_response :success
    assert_nil account.accountable.reload.payment_due_day
    assert_nil response.parsed_body.dig("accountable", "payment_due_day")
    assert_nil response.parsed_body.dig("accountable", "payment_due_day_source")
    assert_not account.recurring_transactions.active.exists?(system_managed_kind: "credit_card_payment")
    assert account.recurring_transactions.paused.exists?(system_managed_kind: "credit_card_payment")
  end

  test "credit card invalid due day and foreign account writes leave the due day unchanged" do
    account = accounts(:credit_card)
    account.accountable.update!(payment_due_day: 10)
    [ 0, 32, 1.5 ].each do |day|
      patch api_v1_account_url(account), params: { account: { accountable: { payment_due_day: day } } },
            headers: api_headers(@read_write_api_key), as: :json
      assert_response :unprocessable_entity
      assert_equal 10, account.accountable.reload.payment_due_day
    end
    patch api_v1_account_url(account), params: { account: { accountable: { payment_due_day: 20 } } },
          headers: api_headers(@other_family_api_key), as: :json
    assert_response :forbidden
    assert_equal 10, account.accountable.reload.payment_due_day
  end

  test "credit card minimum payment setting round trips and recalculates the upcoming obligation" do
    travel_to Time.zone.local(2026, 10, 12, 12) do
      post api_v1_accounts_url,
        params: {
          account: {
            name: "Minimum payment card", account_type: "credit_card", balance: 1000, currency: "USD",
            opening_balance_date: "2026-09-01",
            accountable: { payment_due_day: 20, minimum_payment_only: true, minimum_payment: 99 }
          }
        },
        headers: api_headers(@read_write_api_key), as: :json

      assert_response :created
      account = @user.family.accounts.find(response.parsed_body["id"])
      assert_equal true, response.parsed_body.dig("accountable", "minimum_payment_only")
      assert_equal 99, account.credit_card.minimum_payment
      occurrence = account.recurring_transactions.find_by!(system_managed_kind: "credit_card_payment")
        .recurring_occurrences.find_by!(due_on: Date.new(2026, 10, 20))
      assert_equal 1000, occurrence.statement_balance
      assert_equal 10, occurrence.expected_amount

      get api_v1_account_url(account), headers: api_headers(@api_key)

      assert_response :success
      assert_equal true, response.parsed_body.dig("accountable", "minimum_payment_only")

      patch api_v1_account_url(account),
        params: { account: { accountable: { minimum_payment_only: false } } },
        headers: api_headers(@read_write_api_key), as: :json

      assert_response :success
      assert_equal false, response.parsed_body.dig("accountable", "minimum_payment_only")
      assert_equal 1000, occurrence.reload.expected_amount
      assert_equal 1000, occurrence.statement_balance

      patch api_v1_account_url(account),
        params: { account: { accountable: { minimum_payment_only: true } } },
        headers: api_headers(@read_write_api_key), as: :json

      assert_response :success
      assert_equal true, response.parsed_body.dig("accountable", "minimum_payment_only")
      assert_equal 10, occurrence.reload.expected_amount
      assert_equal 1000, occurrence.statement_balance
    end
  end

  test "credit card defaults preserve full statement estimates for existing API requests" do
    travel_to Time.zone.local(2026, 10, 12, 12) do
      post api_v1_accounts_url,
        params: {
          account: {
            name: "Full payment card", account_type: "credit_card", balance: 1000, currency: "USD",
            opening_balance_date: "2026-09-01", accountable: { payment_due_day: 20 }
          }
        },
        headers: api_headers(@read_write_api_key), as: :json

      assert_response :created
      assert_equal false, response.parsed_body.dig("accountable", "minimum_payment_only")
      account = @user.family.accounts.find(response.parsed_body["id"])
      occurrence = account.recurring_transactions.find_by!(system_managed_kind: "credit_card_payment")
        .recurring_occurrences.find_by!(due_on: Date.new(2026, 10, 20))
      assert_equal 1000, occurrence.expected_amount

      patch api_v1_account_url(account), params: { account: { notes: "Legacy update" } },
        headers: api_headers(@read_write_api_key), as: :json

      assert_response :success
      assert_equal false, response.parsed_body.dig("accountable", "minimum_payment_only")
      assert_equal 1000, occurrence.reload.expected_amount
    end
  end

  test "null minimum payment flag returns a validation error without changing the account" do
    account = accounts(:credit_card)

    patch api_v1_account_url(account),
      params: { account: { accountable: { minimum_payment_only: nil } } },
      headers: api_headers(@read_write_api_key), as: :json

    assert_response :unprocessable_entity
    assert_not account.credit_card.reload.minimum_payment_only?
  end

  test "minimum payment only without a due day does not enable automatic payments" do
    account = accounts(:credit_card)

    patch api_v1_account_url(account),
      params: { account: { accountable: { payment_due_day: nil, minimum_payment_only: true } } },
      headers: api_headers(@read_write_api_key), as: :json

    assert_response :success
    assert account.credit_card.reload.minimum_payment_only?
    assert_not account.recurring_transactions.active.exists?(system_managed_kind: "credit_card_payment")
  end

  test "read-only and foreign family API keys cannot change minimum payment settings" do
    account = accounts(:credit_card)
    @other_family_api_key.update!(scopes: [ "read_write" ])

    { @api_key => :forbidden, @other_family_api_key => :not_found }.each do |key, status|
      patch api_v1_account_url(account),
        params: { account: { accountable: { minimum_payment_only: true } } },
        headers: api_headers(key), as: :json

      assert_response status
      assert_not account.credit_card.reload.minimum_payment_only?
    end
  end

  test "non-card accounts ignore minimum payment only on create and update" do
    post api_v1_accounts_url,
      params: {
        account: {
          name: "Unrelated checking", account_type: "depository", balance: 100,
          accountable: { minimum_payment_only: true }
        }
      },
      headers: api_headers(@read_write_api_key), as: :json

    assert_response :created
    account = @user.family.accounts.find(response.parsed_body["id"])
    assert_not response.parsed_body["accountable"].key?("minimum_payment_only")

    patch api_v1_account_url(account),
      params: { account: { notes: "Updated", accountable: { minimum_payment_only: true } } },
      headers: api_headers(@read_write_api_key), as: :json

    assert_response :success
    assert_equal "Updated", account.reload.notes
    assert_not response.parsed_body["accountable"].key?("minimum_payment_only")
    assert_not account.recurring_transactions.exists?(system_managed_kind: "credit_card_payment")
  end

  test "should require authentication" do
    get "/api/v1/accounts"
    assert_response :unauthorized

    response_body = JSON.parse(response.body)
    assert_equal "unauthorized", response_body["error"]
  end

  test "should require read_accounts scope" do
    api_key_without_read = ApiKey.new(
      user: @user,
      name: "No Read Key",
      scopes: [],
      source: "web",
      display_key: "no_read_#{SecureRandom.hex(8)}"
    )
    # Valid persisted API keys can only be read/read_write; this intentionally
    # bypasses validations to exercise the runtime insufficient-scope guard.
    api_key_without_read.save!(validate: false)

    get "/api/v1/accounts", params: {}, headers: api_headers(api_key_without_read)

    assert_response :forbidden
    response_body = JSON.parse(response.body)
    assert_equal "insufficient_scope", response_body["error"]
  ensure
    api_key_without_read&.destroy
  end

  test "should return user's family accounts successfully" do
    get "/api/v1/accounts", params: {}, headers: api_headers(@api_key)

    assert_response :success
    response_body = JSON.parse(response.body)

    # Should have accounts array
    assert response_body.key?("accounts")
    assert response_body["accounts"].is_a?(Array)

    # Should have pagination metadata
    assert response_body.key?("pagination")
    assert response_body["pagination"].key?("page")
    assert response_body["pagination"].key?("per_page")
    assert response_body["pagination"].key?("total_count")
    assert response_body["pagination"].key?("total_pages")

    # All accounts should belong to user's family
    response_body["accounts"].each do |account|
      # We'll validate this by checking the user's family has these accounts
      family_account_names = @user.family.accounts.pluck(:name)
      assert_includes family_account_names, account["name"]
    end
  end

  test "should create a manual account with opening balance and common settings" do
    opening_balance_date = Date.new(2025, 1, 15)

    assert_difference -> { @user.family.accounts.count } => 1 do
      post api_v1_accounts_url,
        params: {
          account: {
            name: "API Checking",
            balance: 1250.75,
            currency: "USD",
            account_type: "depository",
            subtype: "checking",
            opening_balance_date: opening_balance_date,
            institution_name: "Example Bank",
            institution_domain: "example.com",
            notes: "Created through the API",
            exclude_from_reports: true,
            enable_category_matcher: false
          }
        },
        headers: api_headers(@read_write_api_key)
    end

    assert_response :created
    response_body = JSON.parse(response.body)
    account = @user.family.accounts.find(response_body["id"])

    assert_equal "Depository", account.accountable_type
    assert_equal "checking", account.subtype
    assert_equal "Example Bank", account.institution_name
    assert_equal "example.com", account.institution_domain
    assert_equal "Created through the API", account.notes
    assert account.exclude_from_reports?
    refute account.enable_category_matcher?
    assert_equal opening_balance_date, account.valuations.opening_anchor.first.entry.date
  end

  test "should create every manual account type with type-specific details" do
    requests = {
      depository: { subtype: "savings" },
      investment: { subtype: "brokerage" },
      crypto: { subtype: "wallet", accountable: { tax_treatment: "tax_exempt" } },
      property: {
        subtype: "condominium",
        accountable: {
          year_built: 2012,
          area_value: 900,
          area_unit: "sqft",
          address: { line1: "123 Main St", locality: "New York", region: "NY", country: "US", postal_code: "10001" }
        }
      },
      vehicle: { accountable: { make: "Honda", model: "Civic", year: 2022, mileage_value: 12_000, mileage_unit: "mi" } },
      other_asset: {},
      credit_card: { accountable: { available_credit: 5000, minimum_payment: 50, apr: 19.99, annual_fee: 95, expiration_date: "2028-12-01" } },
      loan: { subtype: "mortgage", accountable: { rate_type: "fixed", interest_rate: 6.125, term_months: 360, initial_balance: 300_000 } },
      other_liability: {}
    }

    assert_difference -> { @user.family.accounts.count } => requests.size do
      requests.each do |account_type, extra_params|
        post api_v1_accounts_url,
          params: {
            account: {
              name: "API #{account_type.to_s.humanize}",
              balance: 1000,
              account_type: account_type,
              **extra_params
            }
          },
          headers: api_headers(@read_write_api_key)

        assert_response :created
      end
    end

    assert_equal "tax_exempt", @user.family.accounts.find_by!(name: "API Crypto").crypto.tax_treatment
    assert_equal "123 Main St", @user.family.accounts.find_by!(name: "API Property").property.address.line1
    assert_equal "Honda", @user.family.accounts.find_by!(name: "API Vehicle").vehicle.make
    assert_equal 5000, @user.family.accounts.find_by!(name: "API Credit card").credit_card.available_credit
    assert_equal 360, @user.family.accounts.find_by!(name: "API Loan").loan.term_months
  end

  test "should require write scope to create an account" do
    post api_v1_accounts_url,
      params: { account: { name: "Forbidden", balance: 0, account_type: "depository" } },
      headers: api_headers(@api_key)

    assert_response :forbidden
    assert_equal "insufficient_scope", JSON.parse(response.body)["error"]
  end

  test "should reject an invalid account type" do
    assert_no_difference -> { @user.family.accounts.count } do
      post api_v1_accounts_url,
        params: { account: { name: "Invalid", balance: 0, account_type: "bank" } },
        headers: api_headers(@read_write_api_key)
    end

    assert_response :unprocessable_entity
    assert_equal "Account type is invalid", JSON.parse(response.body)["message"]
  end

  test "should reject invalid type-specific details" do
    assert_no_difference -> { @user.family.accounts.count } do
      post api_v1_accounts_url,
        params: {
          account: {
            name: "Invalid Crypto",
            balance: 0,
            account_type: "crypto",
            accountable: { tax_treatment: "not-a-tax-treatment" }
          }
        },
        headers: api_headers(@read_write_api_key)
    end

    assert_response :unprocessable_entity
    assert_equal "validation_failed", JSON.parse(response.body)["error"]
  end

  test "should update an account name, balance and common settings" do
    account = accounts(:depository)

    patch "/api/v1/accounts/#{account.id}",
      params: {
        account: {
          name: "Renamed Checking",
          balance: account.balance + 250,
          currency: "USD",
          subtype: "savings",
          institution_name: "New Bank",
          institution_domain: "newbank.example",
          notes: "Updated through the API",
          exclude_from_reports: true,
          enable_category_matcher: false
        }
      },
      headers: api_headers(@read_write_api_key)

    assert_response :success
    response_body = JSON.parse(response.body)
    assert_equal "Renamed Checking", response_body["name"]
    assert_equal account.id, response_body["id"]

    account.reload
    assert_equal "Renamed Checking", account.name
    assert_equal "New Bank", account.institution_name
    assert_equal "newbank.example", account.institution_domain
    assert_equal "Updated through the API", account.notes
    assert account.exclude_from_reports?
    refute account.enable_category_matcher?
    assert_equal "savings", account.subtype
  end

  test "should update every manual account type with type-specific details" do
    updates = {
      depository: [ :depository, { account: { subtype: "savings" } }, ->(a) { assert_equal "savings", a.reload.subtype } ],
      investment: [ :investment, { account: { subtype: "roth_ira" } }, ->(a) { assert_equal "roth_ira", a.reload.subtype } ],
      crypto: [ :crypto, { account: { accountable: { subtype: "wallet", tax_treatment: "tax_exempt" } } },
        ->(a) { assert_equal "tax_exempt", a.reload.crypto.tax_treatment } ],
      property: [ :property,
        { account: {
          subtype: "condominium",
          accountable: {
            year_built: 2015, area_value: 1200, area_unit: "sqft",
            address: { line1: "456 Updated Ave", locality: "Boston", region: "MA", country: "US", postal_code: "02101" }
          }
        } },
        ->(a) {
          a.reload
          assert_equal 2015, a.property.year_built
          assert_equal "456 Updated Ave", a.property.address.line1
        } ],
      vehicle: [ :vehicle,
        { account: { accountable: { make: "Toyota", model: "Camry", year: 2023, mileage_value: 5_000, mileage_unit: "mi" } } },
        ->(a) { assert_equal "Toyota", a.reload.vehicle.make } ],
      other_asset: [ :other_asset, { account: { subtype: "collectible", notes: "Still collectible" } },
        ->(a) { assert_equal "collectible", a.reload.subtype } ],
      credit_card: [ :credit_card,
        { account: { accountable: { available_credit: 8000, minimum_payment: 75, apr: 21.99, annual_fee: 0, expiration_date: "2030-01-01" } } },
        ->(a) {
          a.reload
          assert_equal 8000, a.credit_card.available_credit
          assert_equal Date.new(2030, 1, 1), a.credit_card.expiration_date
        } ],
      loan: [ :loan,
        { account: {
          accountable: {
            rate_type: "fixed", interest_rate: 5.5, term_months: 240, initial_balance: 250_000,
            start_date: "2024-01-01", down_payment: 50_000,
            insurance_rate: 0.25, insurance_rate_type: "decreasing_life"
          }
        } },
        ->(a) {
          a.reload
          assert_equal 240, a.loan.term_months
          assert_equal Date.new(2024, 1, 1), a.loan.start_date
        } ],
      other_liability: [ :other_liability, { account: { subtype: "personal_debt" } },
        ->(a) { assert_equal "personal_debt", a.reload.subtype } ]
    }

    updates.each do |label, (fixture_name, params, assertion)|
      account = accounts(fixture_name)

      patch "/api/v1/accounts/#{account.id}",
        params: params,
        headers: api_headers(@read_write_api_key)

      assert_response :success, "expected #{label} update to succeed: #{response.body}"
      assertion.call(account)
    end
  end

  test "should change the balance on update" do
    account = accounts(:depository)
    new_balance = account.balance + 1000

    patch "/api/v1/accounts/#{account.id}",
      params: { account: { balance: new_balance } },
      headers: api_headers(@read_write_api_key)

    assert_response :success
    assert_equal new_balance.to_d, account.reload.balance
  end

  test "should require write scope to update an account" do
    account = accounts(:depository)

    patch "/api/v1/accounts/#{account.id}",
      params: { account: { name: "Forbidden" } },
      headers: api_headers(@api_key)

    assert_response :forbidden
    assert_equal "insufficient_scope", JSON.parse(response.body)["error"]
  end

  test "should require authentication on update" do
    account = accounts(:depository)

    patch "/api/v1/accounts/#{account.id}", params: { account: { name: "No Auth" } }

    assert_response :unauthorized
    assert_equal "unauthorized", JSON.parse(response.body)["error"]
  end

  test "should return 404 for unknown account on update" do
    patch "/api/v1/accounts/#{SecureRandom.uuid}",
      params: { account: { name: "Missing" } },
      headers: api_headers(@read_write_api_key)

    assert_response :not_found
    assert_equal "not_found", JSON.parse(response.body)["error"]
  end

  test "should return 404 for malformed account id on update" do
    patch "/api/v1/accounts/not-a-uuid",
      params: { account: { name: "Missing" } },
      headers: api_headers(@read_write_api_key)

    assert_response :not_found
    assert_equal "not_found", JSON.parse(response.body)["error"]
  end

  test "should reject invalid update details with 422 and errors array" do
    account = accounts(:crypto)

    patch "/api/v1/accounts/#{account.id}",
      params: { account: { name: "", accountable: { tax_treatment: "not-a-tax-treatment" } } },
      headers: api_headers(@read_write_api_key)

    assert_response :unprocessable_entity
    response_body = JSON.parse(response.body)
    assert_equal "validation_failed", response_body["error"]
    assert response_body["errors"].is_a?(Array)
    assert response_body["errors"].any?
  end

  test "should reject invalid date on update with 422" do
    account = accounts(:loan)

    patch "/api/v1/accounts/#{account.id}",
      params: { account: { accountable: { start_date: (Date.current + 1.year).iso8601 } } },
      headers: api_headers(@read_write_api_key)

    assert_response :unprocessable_entity
    response_body = JSON.parse(response.body)
    assert_equal "validation_failed", response_body["error"]
    assert response_body["errors"].is_a?(Array)
  end

  test "should not update other family's accounts" do
    other_account = @other_family_user.family.accounts.create!(
      owner: @other_family_user,
      name: "Other Family Checking",
      balance: 100,
      currency: "USD",
      accountable: Depository.new(subtype: "checking")
    )

    patch "/api/v1/accounts/#{other_account.id}",
      params: { account: { name: "Hijacked" } },
      headers: api_headers(@read_write_api_key)

    assert_response :not_found
  end

  test "should serialize accountable attributes and address on show" do
    account = accounts(:property)
    account.property.update!(year_built: 2012, area_value: 900, area_unit: "sqft")

    get "/api/v1/accounts/#{account.id}", headers: api_headers(@api_key)

    assert_response :success
    response_body = JSON.parse(response.body)
    assert response_body.key?("accountable")
    assert_equal 2012, response_body.dig("accountable", "year_built")
    assert response_body.key?("address")
    assert_equal "123 Main Street", response_body.dig("address", "line1")
    assert_equal "Los Angeles", response_body.dig("address", "locality")
    assert response_body.key?("notes")
    assert response_body.key?("exclude_from_reports")
  end

  test "should only return active accounts" do
    # Make one account inactive
    inactive_account = accounts(:depository)
    inactive_account.disable!

    get "/api/v1/accounts", params: {}, headers: api_headers(@api_key)

    assert_response :success
    response_body = JSON.parse(response.body)

    # Should not include the inactive account
    account_names = response_body["accounts"].map { |a| a["name"] }
    assert_not_includes account_names, inactive_account.name
  end

  test "should include disabled accounts when requested" do
    inactive_account = accounts(:depository)
    inactive_account.disable!

    get "/api/v1/accounts", params: { include_disabled: true }, headers: api_headers(@api_key)

    assert_response :success
    response_body = JSON.parse(response.body)

    account = response_body["accounts"].find { |account_data| account_data["id"] == inactive_account.id }
    assert_not_nil account
    assert_equal "disabled", account["status"]
  end

  test "should show active account" do
    account = accounts(:depository)

    get "/api/v1/accounts/#{account.id}", headers: api_headers(@api_key)

    assert_response :success
    response_body = JSON.parse(response.body)
    assert_equal account.id, response_body["id"]
    assert_equal account.status, response_body["status"]
    assert_equal account.balance_money.format, response_body["balance"]
    assert_equal money_cents(account.balance_money), response_body["balance_cents"]
    assert_equal account.cash_balance_money.format, response_body["cash_balance"]
    assert_equal money_cents(account.cash_balance_money), response_body["cash_balance_cents"]
    assert_nullable_equal account.subtype, response_body["subtype"]
    assert response_body.key?("institution_name")
    assert response_body.key?("institution_domain")
    assert_nullable_equal account.institution_name, response_body["institution_name"]
    assert_nullable_equal account.institution_domain, response_body["institution_domain"]
    assert_equal account.created_at.iso8601, response_body["created_at"]
    assert_equal account.updated_at.iso8601, response_body["updated_at"]
  end

  test "should return 404 for unknown account on show" do
    get "/api/v1/accounts/#{SecureRandom.uuid}", headers: api_headers(@api_key)

    assert_response :not_found
    response_body = JSON.parse(response.body)
    assert_equal "not_found", response_body["error"]
  end

  test "should return 404 for malformed account id on show" do
    get "/api/v1/accounts/not-a-uuid", headers: api_headers(@api_key)

    assert_response :not_found
    response_body = JSON.parse(response.body)
    assert_equal "not_found", response_body["error"]
    assert_equal "Account not found", response_body["message"]
  end

  test "should require authentication on show" do
    account = accounts(:depository)

    get "/api/v1/accounts/#{account.id}"

    assert_response :unauthorized
    response_body = JSON.parse(response.body)
    assert_equal "unauthorized", response_body["error"]
  end

  test "should require read scope on show" do
    account = accounts(:depository)
    api_key_without_read = ApiKey.new(
      user: @user,
      name: "No Read Show Key",
      scopes: [],
      source: "web",
      display_key: "no_read_show_#{SecureRandom.hex(8)}"
    )
    # Valid persisted API keys can only be read/read_write; this intentionally
    # bypasses validations to exercise the runtime insufficient-scope guard.
    api_key_without_read.save!(validate: false)

    get "/api/v1/accounts/#{account.id}", headers: api_headers(api_key_without_read)

    assert_response :forbidden
    response_body = JSON.parse(response.body)
    assert_equal "insufficient_scope", response_body["error"]
  ensure
    api_key_without_read&.destroy
  end

  test "should hide disabled account by default on show" do
    inactive_account = accounts(:depository)
    inactive_account.disable!

    get "/api/v1/accounts/#{inactive_account.id}", headers: api_headers(@api_key)

    assert_response :not_found
  end

  test "should show disabled account when requested" do
    inactive_account = accounts(:depository)
    inactive_account.disable!

    get "/api/v1/accounts/#{inactive_account.id}",
        params: { include_disabled: true },
        headers: api_headers(@api_key)

    assert_response :success
    response_body = JSON.parse(response.body)
    assert_equal inactive_account.id, response_body["id"]
    assert_equal "disabled", response_body["status"]
  end

  test "should expose subtype across account types" do
    expected_subtypes = {
      accounts(:depository) => "checking",
      accounts(:credit_card) => "credit_card",
      accounts(:investment) => "brokerage",
      accounts(:loan) => "mortgage",
      accounts(:property) => "single_family_home",
      accounts(:vehicle) => "sedan",
      accounts(:crypto) => "exchange",
      accounts(:other_asset) => "collectible",
      accounts(:other_liability) => "personal_debt"
    }

    expected_subtypes.each { |account, subtype| account.accountable.update!(subtype: subtype) }

    expected_subtypes.each do |account, subtype|
      get "/api/v1/accounts/#{account.id}", headers: api_headers(@api_key)

      assert_response :success
      assert_equal subtype, JSON.parse(response.body)["subtype"]
    end
  end

  test "should not return other family's accounts" do
    get "/api/v1/accounts", params: {}, headers: api_headers(@other_family_api_key)

    assert_response :success
    response_body = JSON.parse(response.body)

    # Should return empty array since other family has no accounts in fixtures
    assert_equal [], response_body["accounts"]
    assert_equal 0, response_body["pagination"]["total_count"]
  end

  test "should handle pagination parameters" do
    # Test with pagination params
    get "/api/v1/accounts", params: { page: 1, per_page: 2 }, headers: api_headers(@api_key)

    assert_response :success
    response_body = JSON.parse(response.body)

    # Should respect per_page limit
    assert response_body["accounts"].length <= 2
    assert_equal 1, response_body["pagination"]["page"]
    assert_equal 2, response_body["pagination"]["per_page"]
  end

  test "should return proper account data structure" do
    get "/api/v1/accounts", params: {}, headers: api_headers(@api_key)

    assert_response :success
    response_body = JSON.parse(response.body)

    # Should have at least one account from fixtures
    assert response_body["accounts"].length > 0

    account = response_body["accounts"].first

    # Check required fields are present
    required_fields = %w[id name balance balance_cents cash_balance cash_balance_cents currency classification account_type]
    required_fields.each do |field|
      assert account.key?(field), "Account should have #{field} field"
    end

    # Check data types
    assert account["id"].is_a?(String), "ID should be string (UUID)"
    assert account["name"].is_a?(String), "Name should be string"
    assert account["balance"].is_a?(String), "Balance should be string (money)"
    assert account["balance_cents"].is_a?(Integer), "Balance cents should be integer"
    assert account["cash_balance_cents"].is_a?(Integer), "Cash balance cents should be integer"
    assert account["currency"].is_a?(String), "Currency should be string"
    assert %w[asset liability].include?(account["classification"]), "Classification should be asset or liability"
  end

  test "should handle invalid pagination parameters gracefully" do
    # Test with invalid page number
    get "/api/v1/accounts", params: { page: -1, per_page: "invalid" }, headers: api_headers(@api_key)

    # Should still return success with default pagination
    assert_response :success
    response_body = JSON.parse(response.body)

    # Should have pagination info (with defaults applied)
    assert response_body.key?("pagination")
    assert response_body["pagination"]["page"] >= 1
    assert response_body["pagination"]["per_page"] > 0
  end

  test "should sort accounts alphabetically" do
    get "/api/v1/accounts", params: {}, headers: api_headers(@api_key)

    assert_response :success
    response_body = JSON.parse(response.body)

    # Should be sorted alphabetically by name
    account_names = response_body["accounts"].map { |a| a["name"] }
    assert_equal account_names.sort, account_names
  end

  private

    def api_headers(api_key)
      { "X-Api-Key" => api_key.plain_key }
    end

    def money_cents(money)
      (money.amount * money.currency.minor_unit_conversion).round(0).to_i
    end

    def assert_nullable_equal(expected, actual)
      expected.nil? ? assert_nil(actual) : assert_equal(expected, actual)
    end
end
