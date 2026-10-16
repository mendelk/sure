class CreateWebNotificationTransactionEvents < ActiveRecord::Migration[8.1]
  def change
    create_table :web_notification_transaction_sources, id: :uuid do |t|
      t.references :account, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.string :source, null: false
      t.datetime :completed_at
      t.timestamps
      t.index [ :account_id, :source ], unique: true, name: "idx_web_notification_transaction_sources_identity"
    end

    create_table :web_notification_transaction_events, id: :uuid do |t|
      t.references :account, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      # Keep the source identity after provider removals so a replay/repost cannot alert again.
      t.references :entry, type: :uuid, foreign_key: { on_delete: :nullify }
      t.string :source, null: false
      t.string :identity_key, null: false
      t.jsonb :identity_keys, null: false, default: []
      t.decimal :amount, precision: 19, scale: 4, null: false
      t.string :currency, null: false
      t.boolean :baseline, null: false, default: false
      t.datetime :first_observed_at, null: false
      t.datetime :posted_at
      t.timestamps
      t.index [ :account_id, :source, :identity_key ], unique: true, name: "idx_web_notification_transaction_events_identity"
      t.index :identity_keys, using: :gin, name: "idx_web_notification_transaction_events_aliases"
      t.index [ :account_id, :first_observed_at ], where: "baseline = false", name: "idx_web_notification_transaction_events_candidates"
    end

    create_table :web_notification_transaction_receipts, id: :uuid do |t|
      t.references :user, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.references :event, type: :uuid, null: false, index: false,
        foreign_key: { to_table: :web_notification_transaction_events, on_delete: :cascade }
      t.references :web_notification, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.timestamps
      t.index [ :user_id, :event_id ], unique: true, name: "idx_web_notification_transaction_receipts_once"
    end
  end
end
