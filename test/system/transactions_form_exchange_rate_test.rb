require "application_system_test_case"

class TransactionsFormExchangeRateTest < ApplicationSystemTestCase
  setup do
    ensure_spa_build
    @user = users(:family_admin)
    @family = @user.family
    @account_usd = accounts(:depository)
    sign_in @user

    ExchangeRate.create!(
      from_currency: "EUR",
      to_currency: "USD",
      date: Date.current,
      rate: 1.1
    )

    ExchangeRate.create!(
      from_currency: "GBP",
      to_currency: "USD",
      date: Date.current,
      rate: 1.27
    )
  end

  test "changing amount currency to different currency shows exchange rate UI" do
    open_transaction_drawer

    assert_equal "USD", find_field("Currency").value
    assert_no_selector "section[aria-label='Exchange rate']"

    select_currency("EUR")

    assert_field "Exchange rate (EUR → USD)", visible: true
  end

  test "changing amount currency to same as account currency hides exchange rate UI" do
    open_transaction_drawer
    select_currency("EUR")
    assert_field "Exchange rate (EUR → USD)", visible: true

    select_currency("USD")

    assert_no_selector "section[aria-label='Exchange rate']"
  end

  test "exchange rate field is prefilled when rate is available" do
    open_transaction_drawer
    select_currency("GBP")

    assert_equal 1.27.to_d, wait_for_exchange_rate_value(1.27)
    fill_in "Amount", with: "100"
    within "section[aria-label='Exchange rate']" do
      assert_text "Amount in account currency: 127.00 USD"
    end
  end

  test "missing exchange rate can be entered manually to create a transaction" do
    ExchangeRate.stubs(:find_or_fetch_rate)
                .with(from: "CHF", to: "USD", date: Date.current)
                .returns(nil)
    open_transaction_drawer
    select_currency("CHF")

    assert_text "No exchange rate is available for this date. Enter the rate manually."
    assert_field "Exchange rate (CHF → USD)", with: ""

    within "[role='dialog']" do
      fill_in "Description", with: "Manual CHF purchase"
      fill_in "Amount", with: "100"
      fill_in "Exchange rate (CHF → USD)", with: "1.12"
      assert_text "Amount in account currency: 112.00 USD"
    end

    assert_difference [ "Entry.count", "Transaction.count" ], +1 do
      within "[role='dialog']" do
        click_button "Create transaction"
      end
      assert_no_selector "[role='dialog']"
    end

    entry = @account_usd.entries.find_by!(name: "Manual CHF purchase")
    assert_equal "CHF", entry.currency
    assert_equal 100.to_d, entry.amount
    assert_equal 1.12.to_d, entry.transaction.exchange_rate.to_d
  end

  test "exchange rate is recalculated when currency changes" do
    open_transaction_drawer
    select_currency("EUR")
    first_rate = wait_for_exchange_rate_value(1.1)

    select_currency("GBP")
    second_rate = wait_for_exchange_rate_value(1.27)

    assert_equal 1.1.to_d, first_rate
    assert_equal 1.27.to_d, second_rate
    assert_not_equal first_rate, second_rate
  end

  test "changing account also recalculates exchange rate for current currency" do
    eur_account = @family.accounts.create!(
      name: "EUR Account",
      balance: 1000,
      currency: "EUR",
      accountable: Depository.new
    )
    ExchangeRate.create!(
      from_currency: "GBP",
      to_currency: "EUR",
      date: Date.current,
      rate: 1.16
    )
    open_transaction_drawer
    select_currency("GBP")
    assert_equal 1.27.to_d, wait_for_exchange_rate_value(1.27)

    select_account(eur_account)

    assert_field "Exchange rate (GBP → EUR)", visible: true
    assert_equal 1.16.to_d, wait_for_exchange_rate_value(1.16)

    select_currency("EUR")
    assert_no_selector "section[aria-label='Exchange rate']"
  end

  private
    def open_transaction_drawer
      visit new_transaction_path
      assert_selector "[role='dialog']", text: "New transaction"
      select_account(@account_usd)
    end

    def select_account(account)
      within "[role='dialog']" do
        click_button "new-txn-account-trigger"
        fill_in "Search accounts", with: account.name
        click_button account.name, exact: true
      end
    end

    def select_currency(code)
      find_field("Currency").find("option[value='#{code}']").select_option
    end

    # Fetches update the input property asynchronously; compare its numeric
    # value rather than requiring an incidental number of decimal places.
    def wait_for_exchange_rate_value(expected)
      find_field("new-txn-exchange-rate") do |node|
        node.value.present? && node.value.to_d == expected.to_d
      end.value.to_d
    end
end
