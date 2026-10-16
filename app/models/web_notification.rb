class WebNotification < ApplicationRecord
  EVENT_TYPES = %w[transactions_added statement_ready payment_due payment_overdue bank_attention budget_threshold test].freeze
  DATA_KEYS = {
    "transactions_added" => %w[entry_ids count],
    "statement_ready" => %w[occurrence_id series_id],
    "payment_due" => %w[occurrence_id series_id],
    "payment_overdue" => %w[occurrence_id series_id],
    "bank_attention" => %w[account_provider_id reason],
    "budget_threshold" => %w[budget_id budget_category_id threshold_pct account_ids], "test" => []
  }.freeze
  UUID = /\A[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\z/i

  belongs_to :user
  belongs_to :account, optional: true
  belongs_to :target_subscription, class_name: "WebPushSubscription", optional: true
  has_many :web_notification_deliveries, dependent: :delete_all
  validates :event_type, inclusion: { in: EVENT_TYPES }
  validates :dedup_key, presence: true, length: { maximum: 500 }
  validate :semantic_data

  def self.accessible_budgets(user)
    budgets = user.family.budgets.where(user_id: user.id)
    if !user.family.personal_budgets? || user.family.household_budget_enabled?
      budgets = budgets.or(user.family.budgets.where(user_id: nil))
    end
    budgets
  end

  def self.budget_accounts(user)
    accounts = user.finance_accounts.where(status: "active").included_in_reports
    selected_ids = Preferences.new(user).account_ids
    selected_ids.empty? ? accounts : accounts.where(id: selected_ids)
  end

  def self.accessible_occurrences(user)
    accounts = user.accessible_accounts.where(status: "active").select(:id)
    series = RecurringTransaction.where(family_id: user.family_id)
      .where(account_id: accounts).or(RecurringTransaction.where(family_id: user.family_id, account_id: nil))
    series = series.where(destination_account_id: accounts).or(series.where(destination_account_id: nil))
    RecurringOccurrence.where(family_id: user.family_id, recurring_transaction_id: series.select(:id))
  end

  scope :visible_to, ->(user) {
    if user&.active? && user.preview_features_enabled? && Preferences.new(user).enabled?
      accounts = user.accessible_accounts.where(status: "active").select(:id)
      where(user_id: user.id).where(account_id: nil).or(where(user_id: user.id, account_id: accounts))
        .where("data->>'budget_id' IS NULL OR data->>'budget_id' IN (?)", accessible_budgets(user).select("id::text"))
        .where("data->>'occurrence_id' IS NULL OR data->>'occurrence_id' IN (?)", accessible_occurrences(user).select("id::text"))
        .where("data->'account_ids' IS NULL OR data->'account_ids' <@ ?::jsonb", budget_accounts(user).pluck(:id).to_json)
    else
      none
    end
  }

  def self.publish!(user:, event_type:, dedup_key:, account: nil, data: {}, now: Time.current, subscription: nil)
    event_type = event_type.to_s
    preferences = Preferences.new(user)
    return unless preferences.eligible_for?(event_type: event_type, account: account)
    return if subscription && (event_type != "test" || subscription.user_id != user.id || subscription.disabled_at?)
    return if event_type == "test" && subscription.nil?

    candidate = new(user: user, account: account, event_type: event_type, dedup_key: dedup_key,
      data: data.deep_stringify_keys, target_subscription: subscription,
      push_after: event_type == "test" ? now : preferences.next_push_at(now: now))
    raise ActiveRecord::RecordInvalid, candidate unless candidate.valid?
    return unless candidate.authorized?

    create_or_find_by!(user_id: user.id, dedup_key: dedup_key) do |notification|
      notification.assign_attributes(candidate.attributes.except("id", "created_at", "updated_at", "user_id", "dedup_key"))
    end
  end

  def authorized?
    recipient = User.find_by(id: user_id)
    return false unless recipient&.active? && recipient.preview_features_enabled? && Preferences.new(recipient).enabled?
    self.user = recipient
    return false if account_id && !user.accessible_accounts.where(status: "active").exists?(id: account_id)
    return false if data["budget_id"] && !self.class.accessible_budgets(user).exists?(id: data["budget_id"])
    return false if data["occurrence_id"] && !self.class.accessible_occurrences(user).exists?(id: data["occurrence_id"])
    return false if data["account_ids"] && (data["account_ids"] - self.class.budget_accounts(user).pluck(:id)).any?
    true
  end

  def mark_read!
    update!(read_at: read_at || Time.current)
  end

  def title
    localized(authorized? ? "events.#{event_type}.title" : "generic_title")
  end

  def body
    localized(authorized? ? "events.#{event_type}.body" : "generic_body")
  end

  def destination_path
    routes = Rails.application.routes.url_helpers
    return routes.web_notifications_path unless authorized?
    if data["budget_id"]
      budget = self.class.accessible_budgets(user).find(data["budget_id"])
      routes.budget_path(budget, owner: budget.user_id || "household")
    elsif data["occurrence_id"]
      routes.recurring_occurrence_path(data["occurrence_id"])
    elsif account_id
      routes.account_path(account_id)
    else
      routes.web_notifications_path
    end
  end

  def push_payload
    details = authorized? && Preferences.new(user).show_details? && event_type != "test"
    { title: details ? title : localized("generic_title"), body: details ? body : localized("generic_body"),
      path: destination_path, tag: "web-notification-#{id}" }
  end

  def delivery_summary
    states = web_notification_deliveries.pluck(:status)
    return "none" if states.empty?
    return "pending" if (states & %w[pending retry processing]).any?
    return "accepted" if states.include?("accepted")
    return "failed" if states.include?("failed")
    return "expired" if states.include?("expired")
    "suppressed"
  end

  private
    def localized(key)
      I18n.t("web_notifications.#{key}", locale: user.locale.presence || user.family.locale.presence || I18n.default_locale,
        account_name: key.start_with?("events.") ? account&.name.to_s : "",
        count: key.start_with?("events.") ? data["count"].to_i : 1,
        threshold_pct: data["threshold_pct"].to_i)
    end

    def semantic_data
      unless data.is_a?(Hash) && (data.keys - DATA_KEYS.fetch(event_type, [])).empty?
        errors.add(:data, :invalid)
        return
      end
      errors.add(:data, :invalid) unless (DATA_KEYS.fetch(event_type, []) - data.keys).empty?
      data.each do |key, value|
        valid = case key
        when "entry_ids", "account_ids" then value.is_a?(Array) && value.all? { |id| id.is_a?(String) && UUID.match?(id) }
        when "count", "threshold_pct" then value.is_a?(Integer) && value.positive?
        when "reason" then value.is_a?(String) && value.match?(/\A[a-z_]{1,60}\z/)
        else value.is_a?(String) && UUID.match?(value)
        end
        errors.add(:data, :invalid) unless valid
      end
    end
end
