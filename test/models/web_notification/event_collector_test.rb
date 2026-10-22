require "test_helper"

class WebNotification::EventCollectorTest < ActiveSupport::TestCase
  include EntriesTestHelper

  setup do
    travel_to Time.utc(2026, 10, 10, 12)
    @user = users(:family_admin)
    @family = @user.family
    @family.update!(timezone: "UTC")
    @user.update!(preferences: @user.preferences.merge(
      "preview_features_enabled" => true,
      "web_notifications" => {
        "enabled" => true, "enabled_at" => 1.day.ago.iso8601(6),
        "bill_days_before" => 3, "budget_threshold_pct" => 100
      }
    ))
    @series = recurring_transactions(:netflix_subscription)
    @series.recurring_occurrences.destroy_all
    @series.update_columns(overdue_grace_days: 2)
    @account = accounts(:depository)
    @budget = budgets(:one)
    @budget.update!(start_date: Date.new(2026, 10, 1), end_date: Date.new(2026, 10, 31))
    @category = @family.categories.create!(name: "Notification envelope")
  end

  teardown { travel_back }

  test "due window and grace boundaries use the user's timezone and stable lifecycle identities" do
    @family.update!(timezone: "America/New_York")
    occurrence = create_occurrence(Date.new(2026, 10, 15))
    collect

    collect_at Time.utc(2026, 10, 12, 3, 59)
    assert_empty notifications
    collect_at Time.utc(2026, 10, 12, 4)
    collect
    assert_equal [ "payment_due" ], notifications.pluck(:event_type)

    collect_at Time.utc(2026, 10, 18, 3, 59)
    assert_equal 1, notifications.count
    collect_at Time.utc(2026, 10, 18, 4)
    collect
    assert_equal %w[payment_due payment_overdue], notifications.order(:created_at).pluck(:event_type)
    assert_equal [ occurrence.id ], notifications.map { |notification| notification.data["occurrence_id"] }.uniq
  end

  test "paid skipped and fully allocated occurrences are excluded while partial obligations remain" do
    due = Date.new(2026, 10, 15)
    paid = create_occurrence(due, original: due - 1)
    paid.close!("paid", source: "user")
    skipped = create_occurrence(due, original: due - 2)
    skipped.close!("skipped", source: "user")
    covered = create_occurrence(due, original: due - 3)
    covered.allocations.create!(allocated_amount: 100, currency: "USD", source: "user_created", state: "confirmed")
    partial = create_occurrence(due)
    partial.allocations.create!(allocated_amount: 20, currency: "USD", source: "user_created", state: "confirmed")
    collect
    collect_at Time.utc(2026, 10, 12, 12)

    assert_equal [ partial.id ], notifications.map { |notification| notification.data["occurrence_id"] }
  end

  test "managed statement readiness is separate from due state and never refreshes or invents statement amounts" do
    series = managed_series
    ready = create_occurrence(Date.new(2026, 11, 5), series: series, statement_end_on: Date.new(2026, 10, 11))
    create_occurrence(Date.new(2026, 9, 28), series: series, statement_end_on: Date.new(2026, 9, 3))
    CreditCard::PaymentSchedule.any_instance.expects(:refresh!).never
    collect
    collect_at Time.utc(2026, 10, 11, 12)
    collect

    assert_equal [ "statement_ready" ], notifications.pluck(:event_type)
    assert_equal ready.id, notifications.sole.data["occurrence_id"]
    collect_at Time.utc(2026, 11, 2, 12)
    assert_equal %w[payment_due statement_ready], notifications.pluck(:event_type).sort
  end

  test "managed statements without a configured due day do not generate notifications" do
    series = managed_series
    create_occurrence(Date.new(2026, 11, 5), series: series, statement_end_on: Date.new(2026, 10, 11))
    series.account.accountable.update_column(:payment_due_day, nil)
    collect
    collect_at Time.utc(2026, 10, 11, 12)

    assert_empty notifications
  end

  test "first enrollment and re-enrollment baseline stale statement and bill boundaries" do
    series = managed_series
    create_occurrence(Date.new(2026, 10, 15), series: series, statement_end_on: Date.new(2026, 10, 1))
    create_occurrence(Date.new(2026, 9, 1))
    collect
    collect_at Time.utc(2026, 10, 10, 13)
    assert_empty notifications

    travel_to Time.utc(2026, 10, 20, 12)
    @user.update!(preferences: @user.preferences.deep_merge("web_notifications" => { "enabled_at" => Time.current.iso8601(6) }))
    collect
    assert_empty notifications
  end

  test "snoozed bills wait for their effective due window and event selection is honored" do
    occurrence = create_occurrence(Date.new(2026, 10, 15), snoozed_until: Date.new(2026, 10, 25))
    collect
    collect_at Time.utc(2026, 10, 12, 12)
    assert_empty notifications
    @user.update!(preferences: @user.preferences.deep_merge("web_notifications" => { "event_types" => [ "payment_overdue" ] }))
    collect_at Time.utc(2026, 10, 22, 12)
    assert_empty notifications
    collect_at Time.utc(2026, 10, 28, 12)
    assert_equal "payment_overdue", notifications.sole.event_type
    assert_equal occurrence.id, notifications.sole.data["occurrence_id"]
  end

  test "private source and destination accounts and deselected accounts cannot generate bill events" do
    private_account = accounts(:loan)
    private_account.update!(owner: users(:family_member))
    private_account.account_shares.destroy_all
    @series.update_columns(destination_account_id: private_account.id)
    create_occurrence(Date.new(2026, 10, 15))
    private_series = managed_series
    private_series.account.update!(owner: users(:family_member))
    private_series.account.account_shares.destroy_all
    create_occurrence(Date.new(2026, 10, 15), series: private_series, statement_end_on: Date.new(2026, 10, 11))
    collect
    collect_at Time.utc(2026, 10, 12, 12)
    assert_empty notifications

    @series.update_columns(destination_account_id: nil)
    @user.update!(preferences: @user.preferences.deep_merge("web_notifications" => { "account_ids" => [ accounts(:connected).id ] }))
    collect_at Time.utc(2026, 10, 13, 12)
    assert_empty notifications
  end

  test "category crossings use rollover-aware allocation and publish once per budget category threshold" do
    envelope = create_envelope(budgeted_spending: 100, rollover_enabled: true, rolled_over_amount: 50)
    create_transaction(account: @account, category: @category, amount: 90)
    collect
    create_transaction(account: @account, category: @category, amount: 59)
    collect
    assert_empty notifications
    create_transaction(account: @account, category: @category, amount: 1)
    collect
    collect

    notification = notifications.sole
    assert_equal "budget_threshold", notification.event_type
    assert_equal envelope.id, notification.data["budget_category_id"]
    assert_equal 100, notification.data["threshold_pct"]
    create_transaction(account: @account, category: @category, amount: -100)
    collect
    create_transaction(account: @account, category: @category, amount: 100)
    collect
    assert_equal 1, notifications.count
  end

  test "already crossed categories are baselined and budget periods have independent identities" do
    create_envelope(budgeted_spending: 100)
    create_transaction(account: @account, category: @category, amount: 100)
    collect
    collect
    assert_empty notifications

    collect_at Time.utc(2026, 11, 1, 12)
    next_budget = @family.budgets.create!(start_date: Date.new(2026, 11, 1), end_date: Date.new(2026, 11, 30),
                                         budgeted_spending: 100, currency: "USD")
    next_category = next_budget.budget_categories.create!(category: @category, budgeted_spending: 100, currency: "USD")
    collect
    create_transaction(account: @account, category: @category, amount: 100)
    collect
    assert_equal next_category.id, notifications.sole.data["budget_category_id"]
  end

  test "household budget thresholds cannot include private or deselected account spending" do
    create_envelope(budgeted_spending: 100)
    private_account = accounts(:loan)
    private_account.update!(owner: users(:family_member))
    private_account.account_shares.destroy_all
    @user.update!(preferences: @user.preferences.deep_merge("web_notifications" => { "account_ids" => [ @account.id ] }))
    collect
    create_transaction(account: private_account, category: @category, amount: 1000)
    create_transaction(account: accounts(:connected), category: @category, amount: 1000)
    collect
    assert_empty notifications
    create_transaction(account: @account, category: @category, amount: 100)
    collect
    assert_equal "budget_threshold", notifications.sole.event_type
  end

  test "other personal budgets remain excluded even when shared with the viewer" do
    @family.update!(personal_budgets: true, household_budget_enabled: false)
    owner = users(:family_member)
    @budget.update!(user: owner)
    BudgetShare.create!(owner: owner, viewer: @user, permission: "read_only")
    create_envelope(budgeted_spending: 100)
    collect
    create_transaction(account: @account, category: @category, amount: 1000)
    collect
    assert_empty notifications
  end

  test "connection authorization transitions notify once without treating failed syncs as attention" do
    link = AccountProvider.create!(account: accounts(:connected), provider: plaid_accounts(:one))
    item = plaid_items(:one)
    collect
    Sync.create!(syncable: item, status: "failed", error: "Temporary network failure")
    collect
    assert_empty notifications
    item.update!(status: "requires_update")
    collect
    collect
    assert_equal 1, notifications.count
    assert_equal link.id, notifications.sole.data["account_provider_id"]
    assert_equal "authorization_required", notifications.sole.data["reason"]
    item.update!(status: "good")
    collect
    item.update!(status: "requires_update")
    collect
    assert_equal 2, notifications.count
  end

  test "existing provider attention is baselined and private provider accounts are not scanned" do
    account = accounts(:connected)
    item = plaid_items(:one)
    AccountProvider.create!(account: account, provider: plaid_accounts(:one))
    item.update!(status: "requires_update")
    collect
    assert_empty notifications
    account.update!(owner: users(:family_member))
    account.account_shares.destroy_all
    item.update!(status: "good")
    collect
    item.update!(status: "requires_update")
    collect
    assert_empty notifications
  end

  test "SimpleFIN partial institution errors and stale setup warnings do not request a new bridge token" do
    item = SimplefinItem.create!(family: @family, name: "SimpleFIN", access_url: "https://example.com/access")
    provider_account = item.simplefin_accounts.create!(name: "Checking", account_id: "notification-checking",
      account_type: "checking", currency: "USD", current_balance: 100)
    AccountProvider.create!(account: @account, provider: provider_account)
    collect
    item.update!(status: "requires_update", pending_account_setup: true)
    sync = item.syncs.create!(status: "completed", sync_stats: { total_accounts: 2, error_buckets: { auth: 1 } })
    collect
    assert_empty notifications
    sync.update!(sync_stats: { total_accounts: 0 })
    collect
    collect
    assert_equal "authorization_required", notifications.sole.data["reason"]
  end

  test "Enable Banking consent expiry is actionable at the exact stored expiry without resyncing" do
    expires_at = Time.current + 1.hour
    item = EnableBankingItem.create!(family: @family, name: "Consent bank", country_code: "FI",
      application_id: "notification-app", client_certificate: "test-certificate", session_id: "session",
      session_expires_at: expires_at)
    provider_account = item.enable_banking_accounts.create!(uid: SecureRandom.uuid, name: "Checking", currency: "USD")
    AccountProvider.create!(account: @account, provider: provider_account)
    EnableBankingItem.any_instance.expects(:import_latest_enable_banking_data).never
    collect
    collect_at(expires_at - 1.second)
    assert_empty notifications
    collect_at(expires_at)
    collect
    assert_equal "consent_expired", notifications.sole.data["reason"]
  end

  test "parent thresholds include ring fenced child rollover without notifying inheriting children twice" do
    parent = create_envelope(budgeted_spending: 200, rollover_enabled: true, rolled_over_amount: 25)
    funded = @family.categories.create!(name: "Funded child", parent: @category)
    inherited = @family.categories.create!(name: "Shared child", parent: @category)
    @budget.budget_categories.create!(category: funded, budgeted_spending: 100, currency: "USD",
                                     rollover_enabled: true, rolled_over_amount: 50)
    @budget.budget_categories.create!(category: inherited, budgeted_spending: 0, currency: "USD")
    create_transaction(account: @account, category: @category, amount: 274)
    collect
    assert_empty notifications
    create_transaction(account: @account, category: inherited, amount: 1)
    collect
    assert_equal [ parent.id ], notifications.map { |notification| notification.data["budget_category_id"] }
  end

  test "a one cent unpaid bill is not silently treated as a settled obligation" do
    occurrence = create_occurrence(Date.new(2026, 10, 15), expected_amount: BigDecimal("0.01"))
    collect
    collect_at Time.utc(2026, 10, 12, 12)
    assert_equal occurrence.id, notifications.sole.data["occurrence_id"]
  end

  test "a household threshold loses authorization when a contributing account share is revoked" do
    shared_account = accounts(:connected)
    shared_account.update!(owner: users(:family_member))
    shared_account.account_shares.destroy_all
    share = shared_account.account_shares.create!(user: @user, permission: "read_only", include_in_finances: true)
    create_envelope(budgeted_spending: 100)
    collect
    create_transaction(account: shared_account, category: @category, amount: 100)
    collect
    notification = notifications.sole
    assert_includes notification.data["account_ids"], shared_account.id
    assert notification.authorized?

    share.destroy!
    refute notification.authorized?
    assert_empty WebNotification.visible_to(@user)
  end

  test "the configured percentage is the category crossing boundary" do
    @user.update!(preferences: @user.preferences.deep_merge("web_notifications" => { "budget_threshold_pct" => 80 }))
    create_envelope(budgeted_spending: 100)
    collect
    create_transaction(account: @account, category: @category, amount: 79)
    collect
    assert_empty notifications
    create_transaction(account: @account, category: @category, amount: 1)
    collect
    assert_equal 80, notifications.sole.data["threshold_pct"]
  end

  test "an account newly selected during its due window is baselined even at midnight" do
    create_occurrence(Date.new(2026, 10, 15))
    @user.update!(preferences: @user.preferences.deep_merge("web_notifications" => { "account_ids" => [ accounts(:connected).id ] }))
    collect
    travel_to Time.utc(2026, 10, 12)
    @user.update!(preferences: @user.preferences.deep_merge("web_notifications" => { "account_ids" => [ @account.id ] }))
    collect
    collect
    assert_empty notifications
    collect_at Time.utc(2026, 10, 18)
    assert_equal "payment_overdue", notifications.sole.event_type
  end

  test "midday enrollment includes today's newly generated statements and due bills on the first sweep" do
    enabled_at = Time.utc(2026, 10, 10, 12)
    @user.update!(preferences: @user.preferences.deep_merge("web_notifications" => { "enabled_at" => enabled_at.iso8601(6) }))
    series = managed_series
    travel_to enabled_at + 1.hour
    statement = create_occurrence(Date.new(2026, 11, 4), series: series, statement_end_on: enabled_at.to_date)
    bill = create_occurrence(Date.new(2026, 10, 13))
    # Historical backfill created after opt-in must still be suppressed.
    create_occurrence(Date.new(2026, 9, 25), series: series, statement_end_on: Date.new(2026, 8, 31))
    collect_at(enabled_at + 2.hours)
    collect

    assert_equal %w[payment_due statement_ready], notifications.pluck(:event_type).sort
    assert_equal [ bill.id, statement.id ].sort, notifications.map { |notification| notification.data["occurrence_id"] }.sort
  end

  test "current-day existing obligations remain baselined unless they become payable after enrollment" do
    travel_to Time.utc(2026, 10, 10, 9)
    series = managed_series
    already_ready = create_occurrence(Date.new(2026, 11, 4), series: series, statement_end_on: Date.new(2026, 10, 10))
    newly_payable = create_occurrence(Date.new(2026, 11, 5), series: series,
      statement_end_on: Date.new(2026, 10, 10), expected_amount: 0)
    enabled_at = Time.utc(2026, 10, 10, 12)
    travel_to enabled_at
    @user.update!(preferences: @user.preferences.deep_merge("web_notifications" => { "enabled_at" => enabled_at.iso8601(6) }))
    travel_to enabled_at + 1.hour
    newly_payable.update!(expected_amount: 100)
    collect

    assert_equal [ newly_payable.id ], notifications.map { |notification| notification.data["occurrence_id"] }
    refute_includes notifications.map { |notification| notification.data["occurrence_id"] }, already_ready.id
  end

  test "day boundaries crossed after opt-in are recovered by the first delayed sweep" do
    @family.update!(timezone: "America/New_York")
    series = managed_series
    statement = create_occurrence(Date.new(2026, 11, 5), series: series, statement_end_on: Date.new(2026, 10, 11))
    bill = create_occurrence(Date.new(2026, 10, 14))
    enabled_at = Time.utc(2026, 10, 10, 23)
    travel_to enabled_at
    @user.update!(preferences: @user.preferences.deep_merge("web_notifications" => { "enabled_at" => enabled_at.iso8601(6) }))
    collect_at Time.utc(2026, 10, 11, 12)
    collect

    assert_equal %w[payment_due statement_ready], notifications.pluck(:event_type).sort
    assert_equal [ bill.id, statement.id ].sort, notifications.map { |notification| notification.data["occurrence_id"] }.sort
  end

  private
    def collect
      WebNotification::EventCollector.new(@user).call(now: Time.current)
    end

    def collect_at(time)
      travel_to time
      collect
    end

    def notifications
      WebNotification.where(user: @user)
    end

    def create_occurrence(due, series: @series, original: due, **attributes)
      series.recurring_occurrences.create!({ family: @family, original_due_on: original, due_on: due,
                                             currency: "USD", expected_amount: 100 }.merge(attributes))
    end

    def managed_series
      accounts(:credit_card).accountable.update_column(:payment_due_day, 5)
      @family.recurring_transactions.create!(account: accounts(:credit_card), name: "Card statement",
        system_managed_kind: "credit_card_payment", amount: 0, currency: "USD", expected_day_of_month: 5,
        last_occurrence_date: Date.current, next_expected_date: Date.current + 25, status: "active")
    end

    def create_envelope(**attributes)
      @budget.budget_categories.create!({ category: @category, currency: "USD" }.merge(attributes))
    end
end
