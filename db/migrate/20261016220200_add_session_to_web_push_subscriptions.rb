class AddSessionToWebPushSubscriptions < ActiveRecord::Migration[8.1]
  def change
    add_reference :web_push_subscriptions, :session, type: :uuid,
      foreign_key: { on_delete: :cascade }

    reversible do |direction|
      direction.up do
        execute "UPDATE web_push_subscriptions SET disabled_at = CURRENT_TIMESTAMP WHERE session_id IS NULL"
      end
    end
  end
end
