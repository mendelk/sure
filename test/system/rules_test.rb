require "application_system_test_case"

class RulesTest < ApplicationSystemTestCase
  setup do
    sign_in @user = users(:family_admin)
  end

  test "shows queued processed modified and blocked counts for recent rule runs" do
    rule = @user.family.rules.create!(
      name: "Whole Foods Testing",
      resource_type: "transaction",
      effective_date: 1.year.ago.to_date,
      conditions: [
        Rule::Condition.new(condition_type: "transaction_name", operator: "like", value: "Whole Foods")
      ],
      actions: [
        Rule::Action.new(action_type: "set_transaction_category", value: categories(:food_and_drink).id)
      ]
    )

    rule.rule_runs.create!(
      rule_name: rule.name,
      execution_type: "manual",
      status: "success",
      transactions_queued: 20,
      transactions_processed: 20,
      transactions_modified: 10,
      pending_jobs_count: 0,
      executed_at: Time.current
    )

    visit rules_path

    assert_text "Recent Runs"
    assert_text "20 / 20 / 10 / 10"
  end

  test "creates a transaction rule with dynamically added condition and action" do
    visit rules_path
    click_on "New rule"

    fill_in "Enter a name for this rule", with: "Coffee rule"
    click_on "Add condition"
    all("input[placeholder*='value' i], input[type='text']").last.fill_in(with: "Coffee")
    click_on "Add action"
    click_on "Save rule"

    # A successful create lands on the confirmation dialog.
    assert_text "Confirm changes"

    rule = Rule.order(:created_at).last
    assert_equal "transaction_name", rule.conditions.first.condition_type
    assert_equal "Coffee", rule.conditions.first.value
    assert_equal "set_transaction_category", rule.actions.first.action_type
    assert rule.actions.first.value.present?
  end
end
