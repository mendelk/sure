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

    find("input[role='combobox']").fill_in(with: @groceries.name)
    find("input[role='combobox']").send_keys(:enter)

    assert_current_path(/search=Weekly(?:\+|%20)groceries/, wait: 5)
    assert_selector "##{dom_id(@groceries)}"
    assert_no_selector "##{dom_id(@paycheck)}"
  end

  test "filters transactions by type" do
    click_button "Filter"
    click_button "Type"
    check "Income"

    assert_current_path(/types=/, wait: 5)
    assert_selector "##{dom_id(@paycheck)}"
    assert_no_selector "##{dom_id(@groceries)}"
  end

  test "opens merchant menu with options matching main" do
    merchant = merchants(:netflix)
    category = categories(:food_and_drink)
    entry = create_transaction("Netflix subscription", Date.current, 15, merchant: merchant, category: category)

    visit transactions_url

    within "##{dom_id(entry)}" do
      find("[data-testid='merchant-rule-menu-#{entry.entryable.id}-desktop'] button").click
      assert_text "View #{merchant.name} transactions"
      assert_text "Edit #{merchant.name}"
      assert_text "Always categorize #{merchant.name} as #{category.name}"
    end
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
    def create_transaction(name, date, amount, merchant: nil, category: nil)
      accounts(:depository).entries.create!(
        name: name,
        date: date,
        amount: amount,
        currency: "USD",
        entryable: Transaction.new(merchant: merchant, category: category)
      )
    end
end
