class AdjustProviderReplacementDeletionSafety < ActiveRecord::Migration[8.1]
  def change
    remove_foreign_key :provider_replacement_operations, :accounts
    add_foreign_key :provider_replacement_operations, :accounts, on_delete: :cascade

    remove_foreign_key :provider_replacement_operations, :simplefin_accounts
    change_column_null :provider_replacement_operations, :simplefin_account_id, true
    add_foreign_key :provider_replacement_operations, :simplefin_accounts, on_delete: :nullify

    remove_foreign_key :simplefin_transaction_identities, :simplefin_accounts
    add_foreign_key :simplefin_transaction_identities, :simplefin_accounts, on_delete: :cascade
  end
end
