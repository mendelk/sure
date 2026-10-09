require "application_system_test_case"

class TransactionCategorySelectTest < ApplicationSystemTestCase
  setup do
    sign_in @user = users(:family_admin)
  end

  test "can create a category from the transaction form" do
    visit new_transaction_url

    assert_difference "Category.count", +1 do
      find("[data-controller='category-select'] button").click

      within "[data-controller='category-select']" do
        fill_in "Search categories", with: "Inline Test Category"

        assert_text 'Create "Inline Test Category"'
        click_button 'Create "Inline Test Category"'

        assert_selector(
          "[data-category-select-target='option'][aria-selected='true']",
          text: "Inline Test Category",
          visible: :all
        )
      end
    end

    assert Category.exists?(name: "Inline Test Category")
  end

  test "can clear a category from an existing transaction" do
    transaction = transactions(:one)
    transaction.update!(category: categories(:food_and_drink))
    visit "/transactions/#{transaction.id}"
    click_button "txn-category-trigger"
    click_button "(uncategorized)"
    assert_selector "#txn-category-trigger", text: "Select a Category"
    assert_button "txn-category-trigger", disabled: false
    visit transactions_url
    assert_selector "##{ActionView::RecordIdentifier.dom_id(transaction.entry)}", text: "Uncategorized"

    assert_nil transaction.reload.category_id
  end
end
