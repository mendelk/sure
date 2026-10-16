class CreateWebNotifications < ActiveRecord::Migration[8.1]
  def change
    create_table :web_push_subscriptions, id: :uuid do |t|
      t.references :user, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.text :endpoint, null: false
      t.string :endpoint_digest, null: false
      t.text :p256dh, null: false
      t.text :auth, null: false
      t.string :label
      t.string :user_agent
      t.datetime :last_seen_at, null: false
      t.datetime :disabled_at
      t.integer :last_status
      t.timestamps
    end
    add_index :web_push_subscriptions, :endpoint_digest, unique: true

    create_table :web_notifications, id: :uuid do |t|
      t.references :user, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.references :account, type: :uuid, foreign_key: { on_delete: :cascade }
      t.references :target_subscription, type: :uuid, foreign_key: { to_table: :web_push_subscriptions, on_delete: :cascade }
      t.string :event_type, null: false
      t.string :dedup_key, null: false
      t.jsonb :data, null: false, default: {}
      t.datetime :read_at
      t.datetime :push_after, null: false
      t.timestamps
    end
    add_index :web_notifications, [ :user_id, :dedup_key ], unique: true
    add_index :web_notifications, [ :user_id, :push_after ]

    create_table :web_notification_deliveries, id: :uuid do |t|
      t.references :web_notification, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.references :web_push_subscription, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.string :status, null: false, default: "pending"
      t.integer :attempts, null: false, default: 0
      t.datetime :next_attempt_at, null: false
      t.string :digest_key
      t.string :error_code
      t.datetime :accepted_at
      t.timestamps
    end
    add_index :web_notification_deliveries, [ :web_notification_id, :web_push_subscription_id ], unique: true, name: "index_web_deliveries_unique_notification_subscription"
    add_index :web_notification_deliveries, [ :status, :next_attempt_at ], name: "index_web_deliveries_recovery"
    add_index :web_notification_deliveries, [ :web_push_subscription_id, :digest_key ], name: "index_web_deliveries_digest"
    add_check_constraint :web_notification_deliveries, "attempts >= 0 AND attempts <= 5", name: "web_deliveries_bounded_attempts"
  end
end
