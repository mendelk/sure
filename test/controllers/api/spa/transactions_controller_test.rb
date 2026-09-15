require "test_helper"

class Api::Spa::TransactionsControllerTest < ActionDispatch::IntegrationTest
  include EntriesTestHelper

  setup do
    sign_in @user = users(:family_admin)
    @family = @user.family
    @account = @user.accessible_accounts.first
  end

  test "lists accessible transactions with summary and pagination" do
    entry = create_transaction(account: @account, name: "SPA grocery", amount: 42.25)

    get api_spa_transactions_url, params: { search: "SPA grocery" }

    assert_response :success
    response_data = JSON.parse(response.body)
    transaction = response_data.fetch("transactions").sole

    assert_equal entry.transaction.id, transaction.fetch("id")
    assert_equal entry.id, transaction.fetch("entry_id")
    assert_equal entry_path(entry), transaction.fetch("detail_path")
    assert_equal @account.name, transaction.dig("account", "name")
    assert_equal 1, response_data.dig("summary", "count")
    assert_equal 1, response_data.dig("pagination", "total_count")
  end

  test "applies transaction type and date filters" do
    income = create_transaction(account: @account, name: "SPA income", amount: -100, date: Date.current)
    create_transaction(account: @account, name: "SPA expense", amount: 25, date: Date.current)

    get api_spa_transactions_url, params: {
      search: "SPA",
      types: "income,transfer",
      start_date: Date.current.iso8601,
      end_date: Date.current.iso8601
    }

    assert_response :success
    assert_equal [ income.transaction.id ], JSON.parse(response.body).fetch("transactions").pluck("id")
  end

  test "rejects invalid date filters" do
    get api_spa_transactions_url, params: { start_date: "tomorrow-ish" }

    assert_response :unprocessable_entity
    assert_equal "validation_failed", JSON.parse(response.body).fetch("error")
  end

  test "requires an authenticated browser session" do
    Current.session.destroy!

    get api_spa_transactions_url

    assert_response :unauthorized
    assert_equal "unauthorized", JSON.parse(response.body).fetch("error")
  end
end
