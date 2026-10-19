class CreateProviderReplacementSafety < ActiveRecord::Migration[8.1]
  def change
    add_column :simplefin_accounts, :retired_at, :datetime
    add_reference :simplefin_accounts, :retired_account, type: :uuid, foreign_key: { to_table: :accounts, on_delete: :nullify }

    create_table :provider_replacement_operations, id: :uuid do |t|
      t.references :account, null: false, type: :uuid, foreign_key: true
      t.references :actor, type: :uuid, foreign_key: { to_table: :users, on_delete: :nullify }
      t.references :simplefin_account, null: false, type: :uuid, foreign_key: true
      t.string :idempotency_key, null: false
      t.string :request_digest, null: false
      t.jsonb :audit, null: false, default: {}
      t.jsonb :result, null: false, default: {}
      t.timestamps
      t.index [ :account_id, :idempotency_key ], unique: true, name: "index_provider_replacement_operations_on_request"
    end

    create_table :simplefin_transaction_identities, id: :uuid do |t|
      t.references :simplefin_account, null: false, type: :uuid, foreign_key: true
      t.references :entry, type: :uuid, foreign_key: { on_delete: :nullify }
      t.string :external_id, null: false
      t.boolean :duplicate, null: false, default: false
      t.timestamps
      t.index [ :simplefin_account_id, :external_id ], unique: true, name: "index_simplefin_identities_on_provider_identity"
    end
  end
end
