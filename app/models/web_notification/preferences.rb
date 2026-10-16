class WebNotification::Preferences
  include ActiveModel::Model

  EVENT_TYPES = %w[transactions_added statement_ready payment_due payment_overdue bank_attention budget_threshold].freeze
  DEFAULTS = {
    "enabled" => false, "event_types" => EVENT_TYPES, "account_ids" => [],
    "include_pending" => false, "minimum_amounts" => {}, "frequency" => "immediate",
    "digest_at" => "09:00", "quiet_start" => nil, "quiet_end" => nil,
    "show_details" => false, "bill_days_before" => 3, "budget_threshold_pct" => 100
  }.freeze
  TIME_FORMAT = /\A(?:[01]\d|2[0-3]):[0-5]\d\z/
  attr_reader :user, :settings

  def initialize(user)
    @user = user
    @settings = DEFAULTS.deep_dup.merge((user.preferences || {}).fetch("web_notifications", {}).slice(*DEFAULTS.keys, "enabled_at"))
  end

  %w[event_types account_ids minimum_amounts frequency digest_at quiet_start quiet_end bill_days_before budget_threshold_pct].each do |key|
    define_method(key) { settings[key] }
  end

  %w[enabled include_pending show_details].each do |key|
    define_method("#{key}?") { settings[key] == true }
    define_method(key) { settings[key] == true }
  end

  def enabled_at
    Time.iso8601(settings["enabled_at"]) if settings["enabled_at"].present?
  rescue ArgumentError
    nil
  end

  def timezone
    ActiveSupport::TimeZone[user.family.timezone.presence || "UTC"] || ActiveSupport::TimeZone["UTC"]
  end

  def minimum_amount_for(currency)
    BigDecimal(minimum_amounts.fetch(currency.to_s.upcase, "0"))
  end

  def eligible_for?(event_type:, account: nil)
    return false unless user.active? && user.preview_features_enabled? && enabled?
    return false unless event_type == "test" || event_types.include?(event_type.to_s)
    return account_ids.empty? if account.nil? && !%w[test budget_threshold].include?(event_type.to_s)
    return true unless account

    account.family_id == user.family_id && account.active? &&
      (account_ids.empty? || account_ids.include?(account.id)) && user.accessible_accounts.exists?(id: account.id)
  end

  def update!(attributes)
    user.with_lock do
      previous_settings = self.class.new(user).settings
      @settings = previous_settings.merge(normalize(attributes.to_h.stringify_keys.slice(*DEFAULTS.keys)))
      raise ActiveModel::ValidationError, self unless valid?

      previous = (user.preferences || {}).dig("web_notifications", "enabled") == true
      settings["enabled_at"] = Time.current.iso8601(6) if enabled? && !previous
      user.update!(preferences: (user.preferences || {}).merge("web_notifications" => settings))
      if enabled? && %w[frequency digest_at quiet_start quiet_end].any? { |key| settings[key] != previous_settings[key] }
        WebNotificationDelivery.reschedule_for!(user, preferences: self)
      end
    end
    true
  end

  def next_push_at(now: Time.current, digest: true)
    local = now.in_time_zone(timezone)
    candidate = local
    if digest && frequency == "daily_digest"
      candidate = at_time(local.to_date, digest_at)
      candidate = at_time(local.to_date + 1, digest_at) if candidate < local
    end
    return candidate unless quiet_start.present? && quiet_end.present? && quiet_start != quiet_end

    start_minutes = minutes(quiet_start)
    end_minutes = minutes(quiet_end)
    current_minutes = candidate.hour * 60 + candidate.min
    quiet = if start_minutes < end_minutes
      current_minutes >= start_minutes && current_minutes < end_minutes
    else
      current_minutes >= start_minutes || current_minutes < end_minutes
    end
    if quiet
      end_date = candidate.to_date
      end_date += 1 if start_minutes > end_minutes && current_minutes >= start_minutes
      candidate = at_time(end_date, quiet_end)
    end
    candidate
  end

  validate do
    errors.add(:frequency, :inclusion) unless %w[immediate daily_digest].include?(frequency)
    errors.add(:digest_at, :invalid) unless digest_at.is_a?(String) && TIME_FORMAT.match?(digest_at)
    %w[quiet_start quiet_end].each do |key|
      value = settings[key]
      errors.add(key, :invalid) if value.present? && !(value.is_a?(String) && TIME_FORMAT.match?(value))
    end
    errors.add(:quiet_end, :invalid) if quiet_start.present? != quiet_end.present? || (quiet_start.present? && quiet_start == quiet_end)
    errors.add(:event_types, :invalid) unless event_types.is_a?(Array) && (event_types - EVENT_TYPES).empty?
    unless account_ids.is_a?(Array) && (account_ids - user.accessible_accounts.where(status: "active").pluck(:id)).empty?
      errors.add(:account_ids, :invalid)
    end
    %w[enabled include_pending show_details].each do |key|
      errors.add(key, :invalid) unless [ true, false ].include?(settings[key])
    end
    errors.add(:bill_days_before, :invalid) unless bill_days_before.is_a?(Integer) && bill_days_before.between?(0, 30)
    errors.add(:budget_threshold_pct, :invalid) unless budget_threshold_pct.is_a?(Integer) && budget_threshold_pct.between?(1, 1000)
    valid_minimums = minimum_amounts.is_a?(Hash) && minimum_amounts.all? do |currency, value|
      currency.match?(/\A[A-Z]{3}\z/) && Money::Currency.new(currency).present? &&
        value.is_a?(String) && value.match?(/\A\d+(?:\.\d{1,8})?\z/) && BigDecimal(value).finite?
    rescue Money::Currency::UnknownCurrencyError, ArgumentError
      false
    end
    errors.add(:minimum_amounts, :invalid) unless valid_minimums
  end

  private
    def normalize(attributes)
      %w[enabled include_pending show_details].each do |key|
        attributes[key] = ActiveModel::Type::Boolean.new.cast(attributes[key]) if attributes.key?(key)
      end
      %w[bill_days_before budget_threshold_pct].each do |key|
        attributes[key] = Integer(attributes[key], exception: false) if attributes.key?(key) && !attributes[key].is_a?(Integer)
      end
      %w[event_types account_ids].each do |key|
        attributes[key] = attributes[key].reject(&:blank?).uniq if attributes[key].is_a?(Array)
      end
      %w[quiet_start quiet_end].each { |key| attributes[key] = attributes[key].presence if attributes.key?(key) }
      attributes
    end

    def minutes(value)
      hour, minute = value.split(":").map(&:to_i)
      hour * 60 + minute
    end

    def at_time(date, value)
      hour, minute = value.split(":").map(&:to_i)
      timezone.local(date.year, date.month, date.day, hour, minute)
    end
end
