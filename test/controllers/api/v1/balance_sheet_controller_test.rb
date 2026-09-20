# frozen_string_literal: true

require "test_helper"

class Api::V1::BalanceSheetControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @family = @user.family

    @user.api_keys.active.destroy_all

    @auth = ApiKey.create!(
      user: @user,
      name: "Test Read Key",
      scopes: [ "read" ],
      display_key: "test_ro_#{SecureRandom.hex(8)}",
      source: "mobile"
    )

    Redis.new.del("api_rate_limit:#{@auth.id}")
  end

  test "should require authentication" do
    get "/api/v1/balance_sheet"
    assert_response :unauthorized
  end

  test "should return balance sheet with net worth data" do
    get "/api/v1/balance_sheet", headers: api_headers(@auth)

    assert_response :success
    response_body = JSON.parse(response.body)

    assert response_body.key?("currency")
    assert response_body.key?("net_worth")
    assert response_body.key?("assets")
    assert response_body.key?("liabilities")
    assert response_body.key?("net_worth_series")
    assert response_body.key?("accounts")

    %w[net_worth assets liabilities].each do |field|
      assert response_body[field].key?("amount"), "#{field} should have amount"
      assert response_body[field].key?("currency"), "#{field} should have currency"
      assert response_body[field].key?("formatted"), "#{field} should have formatted"
    end

    assert response_body["net_worth_series"].is_a?(Array)
    response_body["net_worth_series"].each do |point|
      assert point.key?("date")
      assert point["value"].key?("amount")
    end

    response_body["accounts"].each do |account|
      assert account.key?("id")
      assert account.key?("name")
      assert account.key?("classification")
      assert account.key?("balance")
      assert account["balance"].key?("formatted")
    end
  end

  test "should authenticate with browser session for read access" do
    sign_in @user

    get "/api/v1/balance_sheet"

    assert_response :success
    assert JSON.parse(response.body).key?("net_worth")
  end

  test "session auth grants write access with CSRF protection enforced" do
    sign_in @user

    # Forgery protection is disabled for the bulk of the suite; enable it here
    # to prove session writes require a valid CSRF token. The instance copies
    # the class attribute at request time, so toggling before the request works.
    # Rails maps ActionController::InvalidAuthenticityToken to 422
    # (Unprocessable Content) via its default rescue_responses table.
    original = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    begin
      post "/api/v1/transactions",
        params: { transaction: { account_id: @family.accounts.first.id, name: "x", date: Date.current, amount: 1 } },
        as: :json

      assert_response :unprocessable_content
    ensure
      ActionController::Base.allow_forgery_protection = original
    end
  end

  test "session auth grants write access when CSRF protection disabled (test helper clients)" do
    sign_in @user

    post "/api/v1/transactions",
      params: { transaction: { account_id: @family.accounts.first.id, name: "session test", date: Date.current, amount: 1 } },
      as: :json

    assert_response :created
  end

  private

    def api_headers(auth)
      { "X-Api-Key" => auth.display_key }
    end
end
