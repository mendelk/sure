require "application_system_test_case"

class AccountActivitySearchTest < ApplicationSystemTestCase
  include EntriesTestHelper
  include ActionView::RecordIdentifier

  setup do
    ensure_tailwind_build
    ensure_spa_build
    sign_in @user = users(:family_admin)
    reset_viewport

    @account = accounts(:depository)
    @tag = @user.family.tags.create!(name: "ProjectAlpha", color: "#3b82f6")
    @food_cat = categories(:food_and_drink)

    @lunch = create_transaction(
      account: @account,
      name: "Team Lunch Special",
      amount: 45.00,
      date: Date.current,
      category: @food_cat
    )
    @lunch.entryable.tags << @tag

    @paycheck = create_transaction(
      account: @account,
      name: "Payroll Deposit",
      amount: -2500.00,
      date: 1.day.ago.to_date,
      category: categories(:income)
    )
  end

  test "search box behaves like transactions search box without merchant filter" do
    visit account_url(@account, tab: "activity")

    assert_selector "##{dom_id(@lunch)}"
    assert_selector "##{dom_id(@paycheck)}"

    combobox = find("input[role='combobox']")

    # 1. Free text search
    combobox.fill_in(with: "Team Lunch")
    combobox.send_keys(:enter)

    assert_current_path(/search=Team(?:\+|%20)Lunch/, wait: 5)
    assert_selector "##{dom_id(@lunch)}"
    assert_no_selector "##{dom_id(@paycheck)}"

    # Clear search
    combobox.fill_in(with: "")
    combobox.send_keys(:enter)
    assert_selector "##{dom_id(@lunch)}"
    assert_selector "##{dom_id(@paycheck)}"

    # 2. Autocomplete: typing "merchant:" yields no merchant filter option
    combobox.fill_in(with: "merchant:")
    assert_no_selector "[role='option']"

    # Clear input
    combobox.send_keys([ :control, "a" ], :backspace)

    # 3. Filtering by type: Income
    combobox.fill_in(with: "type:")
    find("[role='option']", text: "Income").click

    assert_selector "span", text: "Type: income"
    assert_selector "##{dom_id(@paycheck)}"
    assert_no_selector "##{dom_id(@lunch)}"

    # 4. Remove token pill
    find("button[aria-label='Remove filter Type: income']").click
    assert_selector "##{dom_id(@lunch)}"
    assert_selector "##{dom_id(@paycheck)}"

    # 5. Filtering by category
    combobox.fill_in(with: "category:")
    find("[role='option']", text: @food_cat.name).click

    assert_selector "span", text: "Category: #{@food_cat.name}"
    assert_selector "##{dom_id(@lunch)}"
    assert_no_selector "##{dom_id(@paycheck)}"
  end
end
