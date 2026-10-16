class WebNotification::Transactions
  def initialize(user)
    @user = user
  end

  def call(now: Time.current)
    # Serialize each user's sweep, then commit inbox records and consumption
    # together. A publication/delivery enqueue failure cannot lose source facts.
    @user.with_lock do
      preferences = WebNotification::Preferences.new(@user)
      return [] unless preferences.enabled? && preferences.enabled_at

      events = WebNotificationTransactionEvent.where(account_id: @user.accessible_accounts.select(:id), baseline: false)
        .where(first_observed_at: preferences.enabled_at..now)
        .where.not(id: WebNotificationTransactionReceipt.where(user: @user).select(:event_id))
        .joins(:entry).merge(Entry.excluding_split_parents.where(entryable_type: "Transaction", excluded: false, parent_entry_id: nil))
        .where("entries.account_id = web_notification_transaction_events.account_id")
      events = events.where(posted_at: ..now) unless preferences.include_pending?

      events.includes(:account).order(:first_observed_at, :id).group_by(&:account).filter_map do |account, observations|
        next unless preferences.eligible_for?(event_type: "transactions_added", account: account)

        eligible = observations.select { |event| event.amount.abs >= preferences.minimum_amount_for(event.currency) }
        next if eligible.empty?

        key = Digest::SHA256.hexdigest(eligible.map(&:id).sort.join(":"))
        notification = WebNotification.publish!(user: @user, event_type: "transactions_added", account: account,
          dedup_key: "transactions:#{account.id}:#{key}",
          data: { entry_ids: eligible.map(&:entry_id).uniq.first(100), count: eligible.size }, now: now)
        next unless notification

        WebNotificationTransactionReceipt.insert_all!(eligible.map do |event|
          { user_id: @user.id, event_id: event.id, web_notification_id: notification.id, created_at: now, updated_at: now }
        end)
        notification
      end
    end
  end
end
