class AddManagedCreditCardPayments < ActiveRecord::Migration[8.1]
  def change
    add_column :credit_cards, :payment_due_day, :integer
    add_check_constraint :credit_cards, "payment_due_day IS NULL OR payment_due_day BETWEEN 1 AND 31", name: "chk_credit_cards_payment_due_day"

    add_column :recurring_transactions, :system_managed_kind, :string
    add_index :recurring_transactions, :account_id, unique: true,
              where: "system_managed_kind = 'credit_card_payment'", name: "idx_recurring_card_payment"
    add_check_constraint :recurring_transactions,
                         "system_managed_kind IS NULL OR (system_managed_kind = 'credit_card_payment' AND account_id IS NOT NULL AND destination_account_id IS NULL)",
                         name: "chk_recurring_system_managed_kind"

    add_column :recurring_occurrences, :statement_start_on, :date
    add_column :recurring_occurrences, :statement_end_on, :date
    add_column :recurring_occurrences, :statement_balance, :decimal, precision: 19, scale: 4
    add_column :recurring_occurrences, :post_statement_credits, :decimal, precision: 19, scale: 4
    add_column :recurring_occurrences, :due_date_source, :string
  end
end
