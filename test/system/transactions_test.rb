require "application_system_test_case"

class TransactionsTest < ApplicationSystemTestCase
  setup do
    sign_in @user = users(:family_admin)

    Entry.delete_all
    @groceries = create_transaction("Weekly groceries", Date.current, 100)
    @paycheck = create_transaction("Paycheck", 1.day.ago.to_date, -500)

    visit transactions_url
  end

  test "searches the transaction ledger" do
    assert_selector "h1", text: "Transactions"
    assert_selector "##{dom_id(@groceries)}"
    assert_selector "##{dom_id(@paycheck)}"

    fill_in "Merchant, note, or transaction", with: @groceries.name
    click_button "Search"

    assert_current_path(/search=Weekly(?:\+|%20)groceries/, wait: 5)
    assert_selector "##{dom_id(@groceries)}"
    assert_no_selector "##{dom_id(@paycheck)}"
  end

  test "filters transactions by type" do
    click_button "Income"

    assert_current_path(/types=/, wait: 5)
    assert_selector "##{dom_id(@paycheck)}"
    assert_no_selector "##{dom_id(@groceries)}"
  end

  test "opens transaction details in the drawer" do
    within "##{dom_id(@groceries)}" do
      click_link @groceries.name
    end

    assert_current_path %r{\A/transactions/#{@groceries.entryable.id}(\?.*)?\z}
    within "dialog[open]" do
      assert_text @groceries.amount_money.format
      assert_text @groceries.name
    end
    assert_selector "#transactions-scroll"
  end

  test "scrolls a full transaction page inside the table" do
    100.times do |index|
      create_transaction("Scroll transaction #{index}", Date.current - index.days, index + 1)
    end

    visit transactions_url(search: "Scroll transaction")
    assert_selector "[id^='entry_']", minimum: 25, visible: :all

    list_height, list_scroll = evaluate_script(<<~JS)
      (() => {
        const list = document.querySelector("#transactions-scroll");
        return [list.clientHeight, list.scrollHeight];
      })()
    JS
    assert_operator list_scroll, :>, list_height

    row = find("#transactions [id^='entry_']", match: :first)
    origin = Selenium::WebDriver::WheelActions::ScrollOrigin.element(row.native)
    page.driver.browser.action.scroll_from(origin, 0, 600).perform
    assert_operator evaluate_script('document.querySelector("#transactions-scroll").scrollTop'), :>, 0
  end

  private
    def create_transaction(name, date, amount)
      accounts(:depository).entries.create!(
        name: name,
        date: date,
        amount: amount,
        currency: "USD",
        entryable: Transaction.new
      )
    end
end
