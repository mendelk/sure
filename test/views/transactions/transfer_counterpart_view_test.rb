require "test_helper"

class Transactions::TransferCounterpartViewTest < ActionView::TestCase
  setup do
    @family = families(:dylan_family)
    @user = users(:family_admin)
    Current.session = Session.create!(user: @user)

    @checking = accounts(:depository) # "from" account
    @savings = accounts(:credit_card) # "to" account

    @accessible_account_ids = @user.accessible_accounts.pluck(:id).to_set
    @split_parent_entry_ids = Set.new
  end

  test "renders outflow transfer with arrow to destination account" do
    outflow_tx = Transaction.create!(kind: "funds_movement")
    outflow_entry = Entry.create!(
      account: @checking, entryable: outflow_tx,
      name: "Transfer to Savings", amount: 100, currency: "USD", date: Date.today
    )

    inflow_tx = Transaction.create!(kind: "funds_movement")
    inflow_entry = Entry.create!(
      account: @savings, entryable: inflow_tx,
      name: "Transfer from Checking", amount: -100, currency: "USD", date: Date.today
    )

    Transfer.create!(
      inflow_transaction: inflow_tx,
      outflow_transaction: outflow_tx,
      status: "confirmed"
    )

    html = render(partial: "transactions/transaction", locals: {
      entry: outflow_entry, balance_trend: nil, view_ctx: "global"
    })

    assert_includes html, "→"
    assert_includes html, @savings.name
  end

  test "row name link advances URL to the transaction drawer" do
    tx = Transaction.create!(kind: "standard")
    entry = Entry.create!(
      account: @checking, entryable: tx,
      name: "Groceries", amount: 42, currency: "USD", date: Date.today
    )

    html = render(partial: "transactions/transaction", locals: {
      entry: entry, balance_trend: nil, view_ctx: "global"
    })

    doc = Nokogiri::HTML::DocumentFragment.parse(html)
    link = doc.at_css("a[href='#{entry_path(entry)}']")
    assert_not_nil link, "expected a drawer link to the transaction"
    assert_equal "drawer", link["data-turbo-frame"]
    assert_equal "advance", link["data-turbo-action"]
  end

  test "transfer row name link advances URL to the transfer drawer" do
    outflow_tx = Transaction.create!(kind: "funds_movement")
    outflow_entry = Entry.create!(
      account: @checking, entryable: outflow_tx,
      name: "Transfer to Savings", amount: 100, currency: "USD", date: Date.today
    )
    inflow_tx = Transaction.create!(kind: "funds_movement")
    Entry.create!(
      account: @savings, entryable: inflow_tx,
      name: "Transfer from Checking", amount: -100, currency: "USD", date: Date.today
    )
    transfer = Transfer.create!(
      inflow_transaction: inflow_tx,
      outflow_transaction: outflow_tx,
      status: "confirmed"
    )

    html = render(partial: "transactions/transaction", locals: {
      entry: outflow_entry, balance_trend: nil, view_ctx: "global"
    })

    doc = Nokogiri::HTML::DocumentFragment.parse(html)
    link = doc.at_css("a[href='#{transfer_path(transfer)}']")
    assert_not_nil link, "expected a drawer link to the transfer"
    assert_equal "drawer", link["data-turbo-frame"]
    assert_equal "advance", link["data-turbo-action"]
  end

  test "renders inflow transfer with arrow from source account" do
    outflow_tx = Transaction.create!(kind: "funds_movement")
    outflow_entry = Entry.create!(
      account: @checking, entryable: outflow_tx,
      name: "Transfer to Savings", amount: 100, currency: "USD", date: Date.today
    )

    inflow_tx = Transaction.create!(kind: "funds_movement")
    inflow_entry = Entry.create!(
      account: @savings, entryable: inflow_tx,
      name: "Transfer from Checking", amount: -100, currency: "USD", date: Date.today
    )

    Transfer.create!(
      inflow_transaction: inflow_tx,
      outflow_transaction: outflow_tx,
      status: "confirmed"
    )

    html = render(partial: "transactions/transaction", locals: {
      entry: inflow_entry, balance_trend: nil, view_ctx: "global"
    })

    assert_includes html, "←"
    assert_includes html, @checking.name
  end

  test "falls back to account name when transfer has no counterpart" do
    tx = Transaction.create!(kind: "funds_movement")
    entry = Entry.create!(
      account: @checking, entryable: tx,
      name: "Unmatched Transfer", amount: 100, currency: "USD", date: Date.today
    )

    html = render(partial: "transactions/transaction", locals: {
      entry: entry, balance_trend: nil, view_ctx: "global"
    })

    assert_includes html, @checking.name
    assert_not_includes html, "→"
    assert_not_includes html, "←"
  end
end
