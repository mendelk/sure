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

  test "opens transaction details without moving the ledger" do
    40.times do |index|
      create_transaction(
        "Scroll transaction #{index}",
        Date.current - index.days,
        index + 1,
        merchant: merchants(:netflix)
      )
    end
    visit transactions_url
    assert_selector "[id^='entry_']", minimum: 25, visible: :all

    row_id, scroll_before = evaluate_script(<<~JS)
      (() => {
        const list = document.querySelector("#transactions-scroll");
        list.scrollTop = 700;
        const bounds = list.getBoundingClientRect();
        const row = [...list.querySelectorAll("[id^='entry_']")].find((candidate) => {
          const rect = candidate.getBoundingClientRect();
          return rect.top >= bounds.top && rect.bottom <= bounds.bottom;
        });
        return [row.id, list.scrollTop];
      })()
    JS

    within "##{row_id}" do
      find("a").click
    end

    assert_current_path %r{\A/transactions/[^/]+(\?.*)?\z}
    assert_selector "dialog[open], [role='dialog']"
    assert_equal scroll_before, evaluate_script('document.querySelector("#transactions-scroll").scrollTop')
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
  test "switches between transactions and upcoming tabs" do
    merchant = merchants(:netflix)
    @user.family.recurring_transactions.create!(
      account: accounts(:depository),
      merchant: merchant,
      amount: 19.99,
      currency: "USD",
      expected_day_of_month: Date.current.day,
      last_occurrence_date: Date.current - 1.month,
      next_expected_date: Date.current + 3.days,
      status: "active",
      occurrence_count: 5,
      manual: true
    )

    visit transactions_url

    assert_selector "button[role='tab']", text: "Transactions"
    assert_selector "button[role='tab']", text: "Upcoming"
    assert_selector "#transactions"
    assert_no_selector "#upcoming"

    click_button "Upcoming"

    assert_current_path(/tab=upcoming/, wait: 5)
    assert_selector "#upcoming"
    assert_no_selector "#transactions"
    assert_text merchant.name
    assert_text "Projected"
    assert_text "Recurring"

    click_button "Transactions"

    assert_selector "#transactions"
    assert_no_selector "#upcoming"
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
