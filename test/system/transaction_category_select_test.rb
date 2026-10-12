require "application_system_test_case"

class TransactionCategorySelectTest < ApplicationSystemTestCase
  setup do
    ensure_spa_build
    sign_in @user = users(:family_admin)
  end

  test "can create a category from the transaction form" do
    account = accounts(:depository)
    visit new_transaction_url(account_id: account.id)

    within "[role='dialog']" do
      assert_difference "Category.count", +1 do
        click_button "txn-category-trigger"
        fill_in "Search categories", with: "Inline Test Category"
        click_button 'Create "Inline Test Category"'
        assert_selector "#txn-category-trigger", text: "Inline Test Category"
      end

      fill_in "Description", with: "Purchase with inline category"
      fill_in "Amount", with: "25"
    end

    assert_difference [ "Entry.count", "Transaction.count" ], +1 do
      within "[role='dialog']" do
        click_button "Create transaction"
      end
      assert_no_selector "[role='dialog']"
    end

    category = @user.family.categories.find_by!(name: "Inline Test Category")
    entry = account.entries.find_by!(name: "Purchase with inline category")
    assert_equal category.id, entry.transaction.category_id
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
