class AddMinimumPaymentOnlyToCreditCards < ActiveRecord::Migration[8.1]
  def change
    add_column :credit_cards, :minimum_payment_only, :boolean, null: false, default: false
  end
end
