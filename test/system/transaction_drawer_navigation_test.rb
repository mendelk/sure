require "application_system_test_case"

class TransactionDrawerNavigationTest < ApplicationSystemTestCase
  include EntriesTestHelper

  setup do
    sign_in @user = users(:family_admin)
  end

  test "opening a transaction advances the URL and closing the drawer restores it" do
    entry = Entry.create!(
      account: accounts(:depository),
      name: "Drawer navigation target",
      date: Date.current,
      currency: "USD",
      amount: 42,
      entryable: Transaction.new(kind: "standard")
    )

    visit transactions_url
    assert_current_path transactions_path

    within "##{dom_id(entry)}" do
      find("a[href='#{entry_path(entry)}']").click
    end

    assert_current_path transaction_path(entry)
    within "turbo-frame#drawer" do
      assert_field "Name", with: "Drawer navigation target"
    end

    within "turbo-frame#drawer" do
      find("button[aria-label='Close']").click
    end

    assert_current_path transactions_path
    assert_no_selector "turbo-frame#drawer dialog[open]"
  end

  test "escape closes the drawer and restores the URL" do
    entry = Entry.create!(
      account: accounts(:depository),
      name: "Escape key target",
      date: Date.current,
      currency: "USD",
      amount: 44,
      entryable: Transaction.new(kind: "standard")
    )

    visit transactions_url
    assert_current_path transactions_path

    within "##{dom_id(entry)}" do
      find("a[href='#{entry_path(entry)}']").click
    end

    assert_current_path transaction_path(entry)
    within "turbo-frame#drawer" do
      assert_field "Name", with: "Escape key target"
    end

    within "turbo-frame#drawer" do
      find_field("Name").send_keys(:escape)
    end

    assert_current_path transactions_path
    assert_no_selector "turbo-frame#drawer dialog[open]"
  end

  test "browser back closes the drawer" do
    entry = Entry.create!(
      account: accounts(:depository),
      name: "Back button target",
      date: Date.current,
      currency: "USD",
      amount: 43,
      entryable: Transaction.new(kind: "standard")
    )

    visit transactions_url
    assert_current_path transactions_path

    within "##{dom_id(entry)}" do
      find("a[href='#{entry_path(entry)}']").click
    end

    assert_current_path transaction_path(entry)

    go_back

    assert_current_path transactions_path
    assert_no_selector "turbo-frame#drawer dialog[open]"
  end

  test "closing a directly loaded detail page goes to the transactions list" do
    entry = Entry.create!(
      account: accounts(:depository),
      name: "Direct load target",
      date: Date.current,
      currency: "USD",
      amount: 45,
      entryable: Transaction.new(kind: "standard")
    )

    visit transaction_path(entry)

    within "dialog" do
      assert_field "Name", with: "Direct load target"
      find("button[aria-label='Close']").click
    end

    assert_current_path transactions_path
    assert_selector "h1", text: "Transactions"
    assert_no_selector "dialog[open]"
  end

  test "transfer drawer links to the matching transaction" do
    transfer = create_transfer(
      from_account: accounts(:depository),
      to_account: accounts(:credit_card),
      amount: 100
    )
    # create_transfer queries transaction entries during build, leaving a
    # stale nil cached on the in-memory objects — reload before use.
    inflow_entry = transfer.inflow_transaction.reload.entry

    visit transfer_path(transfer)

    # A full page load nests the dialog's own turbo-frame inside the
    # layout's drawer frame, so scope to the dialog itself.
    within "dialog" do
      find("a[href='#{entry_path(inflow_entry)}']").click
    end

    assert_current_path transaction_path(inflow_entry)
    within "turbo-frame#drawer" do
      assert_field "Name", with: inflow_entry.name
    end
  end
end
