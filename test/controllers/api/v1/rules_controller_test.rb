# frozen_string_literal: true

require "test_helper"

class Api::V1::RulesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @family = @user.family

    @user.api_keys.active.destroy_all
    @api_key = ApiKey.create!(
      user: @user,
      name: "Test Read Key",
      scopes: [ "read" ],
      source: "web",
      display_key: "test_read_#{SecureRandom.hex(8)}"
    )

    Redis.new.del("api_rate_limit:#{@api_key.id}")

    @rule = @family.rules.build(
      name: "Coffee cleanup",
      resource_type: "transaction",
      active: true,
      effective_date: Date.new(2024, 1, 1)
    )
    @rule.conditions.build(condition_type: "transaction_name", operator: "like", value: "coffee")
    @rule.actions.build(action_type: "set_transaction_name", value: "Coffee")
    @rule.save!
  end

  test "should list rules" do
    get api_v1_rules_url, headers: api_headers(@api_key)
    assert_response :success

    json_response = JSON.parse(response.body)
    assert json_response["data"].any? { |rule| rule["id"] == @rule.id }
    assert_equal @family.rules.count, json_response["meta"]["total_count"]
  end

  test "should not list another family's rules" do
    other_family = Family.create!(name: "Other Family", currency: "USD", locale: "en")
    other_rule = other_family.rules.build(name: "Other", resource_type: "transaction", active: true)
    other_rule.conditions.build(condition_type: "transaction_name", operator: "like", value: "other")
    other_rule.actions.build(action_type: "set_transaction_name", value: "Other")
    other_rule.save!

    get api_v1_rules_url, headers: api_headers(@api_key)
    assert_response :success

    rule_ids = JSON.parse(response.body)["data"].map { |rule| rule["id"] }
    assert_includes rule_ids, @rule.id
    assert_not_includes rule_ids, other_rule.id
  end

  test "should require authentication when listing rules" do
    get api_v1_rules_url

    assert_response :unauthorized
  end

  test "should require read scope when listing rules" do
    api_key_without_read = api_key_without_read_scope

    get api_v1_rules_url, headers: api_headers(api_key_without_read)

    assert_response :forbidden
    json_response = JSON.parse(response.body)
    assert_equal "insufficient_scope", json_response["error"]
  ensure
    api_key_without_read&.destroy
  end

  test "should filter rules by active status" do
    inactive_rule = @family.rules.build(name: "Inactive", resource_type: "transaction", active: false)
    inactive_rule.conditions.build(condition_type: "transaction_name", operator: "like", value: "ignore")
    inactive_rule.actions.build(action_type: "set_transaction_name", value: "Ignore")
    inactive_rule.save!

    get api_v1_rules_url, params: { active: true }, headers: api_headers(@api_key)
    assert_response :success

    json_response = JSON.parse(response.body)
    rule_ids = json_response["data"].map { |rule| rule["id"] }
    assert_includes rule_ids, @rule.id
    assert_not_includes rule_ids, inactive_rule.id
  end

  test "should reject invalid active filter" do
    get api_v1_rules_url, params: { active: "not_boolean" }, headers: api_headers(@api_key)

    assert_response :unprocessable_entity
    json_response = JSON.parse(response.body)
    assert_equal "validation_failed", json_response["error"]
  end

  test "should reject unsupported resource type filter" do
    get api_v1_rules_url, params: { resource_type: "account" }, headers: api_headers(@api_key)

    assert_response :unprocessable_entity
    json_response = JSON.parse(response.body)
    assert_equal "validation_failed", json_response["error"]
  end

  test "should show rule with conditions and actions" do
    get api_v1_rule_url(@rule), headers: api_headers(@api_key)
    assert_response :success

    rule = JSON.parse(response.body)["data"]
    assert_equal @rule.id, rule["id"]
    assert_equal "Coffee cleanup", rule["name"]
    assert_equal "transaction", rule["resource_type"]
    assert_equal true, rule["active"]
    assert_equal "2024-01-01", rule["effective_date"]

    assert_equal 1, rule["conditions"].length
    assert_equal "transaction_name", rule["conditions"].first["condition_type"]
    assert_equal "like", rule["conditions"].first["operator"]
    assert_equal "coffee", rule["conditions"].first["value"]

    assert_equal 1, rule["actions"].length
    assert_equal "set_transaction_name", rule["actions"].first["action_type"]
    assert_equal "Coffee", rule["actions"].first["value"]
  end

  test "should require authentication when showing a rule" do
    get api_v1_rule_url(@rule)

    assert_response :unauthorized
  end

  test "should require read scope when showing a rule" do
    api_key_without_read = api_key_without_read_scope

    get api_v1_rule_url(@rule), headers: api_headers(api_key_without_read)

    assert_response :forbidden
    json_response = JSON.parse(response.body)
    assert_equal "insufficient_scope", json_response["error"]
  ensure
    api_key_without_read&.destroy
  end

  test "should not show another family's rule" do
    other_family = Family.create!(name: "Other Family", currency: "USD", locale: "en")
    other_rule = other_family.rules.build(name: "Other", resource_type: "transaction", active: true)
    other_rule.conditions.build(condition_type: "transaction_name", operator: "like", value: "other")
    other_rule.actions.build(action_type: "set_transaction_name", value: "Other")
    other_rule.save!

    get api_v1_rule_url(other_rule), headers: api_headers(@api_key)
    assert_response :not_found
    json_response = JSON.parse(response.body)
    assert_equal "record_not_found", json_response["error"]
  end

  test "workspace is additive and includes every sorted rule and paginated execution history" do
    RuleRun.create!(rule: @rule, executed_at: Time.current, execution_type: "manual", status: "success",
      transactions_queued: 7, transactions_processed: 5, transactions_modified: 2)

    get api_v1_rules_url, params: { include: "workspace", sort_by: "updated_at", direction: "desc", per_page: 1 },
      headers: api_headers(@api_key)

    assert_response :success
    payload = response.parsed_body
    assert_equal 1, payload["data"].size
    workspace = payload.fetch("workspace")
    assert_equal @family.rules.count, workspace["count"]
    assert_equal @family.rules.count, workspace["rules"].size
    assert_equal "updated_at", workspace["sort_by"]
    assert_equal "desc", workspace["direction"]
    assert workspace["rules"].find { |rule| rule["id"] == @rule.id }.fetch("summary").fetch("condition").present?
    assert_equal 3, workspace["recent_runs"]["items"].sole["blocked"]
    assert_equal 1, workspace["recent_runs"]["per_page"]
  end

  test "form options preserve merchant action prefills and registry choices" do
    get form_options_api_v1_rules_url, params: {
      merchant_id: merchants(:amazon).id, action_type: "set_transaction_category", action_value: categories(:food_and_drink).id
    }, headers: api_headers(@api_key)

    assert_response :success
    payload = response.parsed_body
    assert_equal "Amazon", payload["rule"]["name"]
    assert_equal "transaction_merchant", payload["rule"]["conditions"].sole["condition_type"]
    assert_equal categories(:food_and_drink).id, payload["rule"]["actions"].sole["value"]
    assert payload["registry"]["filters"].any? { |filter| filter["key"] == "transaction_amount" }
    assert payload["registry"]["executors"].any? { |executor| executor["key"] == "send_email_notification" }

    get form_options_api_v1_rule_url(@rule), headers: api_headers(@api_key)
    assert_response :success
    assert_equal @rule.id, response.parsed_body["rule"]["id"]

    get registry_api_v1_rules_url, headers: api_headers(@api_key)
    assert_response :success
    assert response.parsed_body["filters"].any?
    assert response.parsed_body["executors"].any?
  end

  test "form options and registry reject unsupported resources" do
    [ form_options_api_v1_rules_url, registry_api_v1_rules_url ].each do |path|
      get path, params: { resource_type: "account" }, headers: api_headers(@api_key)
      assert_response :unprocessable_entity
    end
  end

  test "builder metadata preserves provider-gated executors and existing AI actions" do
    Family.any_instance.stubs(:resolved_categorization_provider).returns(nil)
    Provider::Registry.stubs(:preferred_llm_provider).returns(nil)
    get registry_api_v1_rules_url, headers: api_headers(@api_key)
    assert_response :success
    keys = response.parsed_body["executors"].pluck("key")
    assert_not_includes keys, "auto_categorize"
    assert_not_includes keys, "auto_detect_merchants"

    @rule.actions.create!(action_type: "auto_categorize")
    get form_options_api_v1_rule_url(@rule), headers: api_headers(@api_key)
    assert_response :success
    assert_includes response.parsed_body["registry"]["executors"].pluck("key"), "auto_categorize"
  end

  test "metadata and preview reads require authentication and read scope" do
    no_read = api_key_without_read_scope
    [ form_options_api_v1_rules_url, form_options_api_v1_rule_url(@rule), registry_api_v1_rules_url,
      confirm_api_v1_rule_url(@rule), confirm_all_api_v1_rules_url ].each do |path|
      get path
      assert_response :unauthorized
      get path, headers: api_headers(no_read)
      assert_response :forbidden
    end
  ensure
    no_read&.destroy
  end


  test "creates nested rule and returns canonical resource with preview" do
    attributes = valid_rule_attributes.merge(
      effective_date: "2024-01-01",
      conditions_attributes: {
        "0" => {
          condition_type: "compound", operator: "and",
          sub_conditions_attributes: {
            "0" => { condition_type: "transaction_amount", operator: ">", value: "20" },
            "1" => { condition_type: "transaction_amount", operator: "<", value: "40" }
          }
        }
      }
    )
    assert_difference -> { @family.rules.count }, 1 do
      post api_v1_rules_url, params: { rule: attributes }, headers: api_headers(write_key), as: :json
    end
    assert_response :created
    payload = response.parsed_body
    created = @family.rules.find(payload["data"]["id"])
    assert_not created.active
    assert_equal Date.new(2024, 1, 1), created.effective_date
    assert_equal 2, created.conditions.sole.sub_conditions.size
    assert_equal 2, payload["data"]["conditions"].sole["sub_conditions"].size
    assert payload["confirm"]["affected_count"].is_a?(Integer)
    assert_nil payload["confirm"]["ai"]
  end

  test "updates nested conditions and deletes children while toggling active" do
    condition = @rule.conditions.sole
    action = @rule.actions.sole
    patch api_v1_rule_url(@rule), params: { rule: {
      active: false,
      conditions_attributes: { "0" => { id: condition.id, _destroy: true },
        "1" => { condition_type: "transaction_name", operator: "is_null" } },
      actions_attributes: { "0" => { id: action.id, value: "Renamed" } }
    } }, headers: api_headers(write_key), as: :json

    assert_response :success
    assert_not @rule.reload.active
    assert_equal "is_null", @rule.conditions.sole.operator
    assert_equal "Renamed", @rule.actions.sole.value
    assert_equal @rule.id, response.parsed_body["data"]["id"]
  end

  test "invalid rule inputs fail without persistence" do
    [
      valid_rule_attributes.merge(resource_type: "account"),
      valid_rule_attributes.merge(effective_date: "2024-02-31"),
      valid_rule_attributes.merge(actions_attributes: {}),
      valid_rule_attributes.merge(actions_attributes: { "0" => { action_type: "unknown" } }),
      valid_rule_attributes.merge(conditions_attributes: {
        "0" => { condition_type: "transaction_name", operator: "DROP", value: "coffee" }
      }),
      valid_rule_attributes.merge(conditions_attributes: {
        "0" => { condition_type: "compound", operator: "and", sub_conditions_attributes: {
          "0" => { condition_type: "compound", operator: "or" }
        } }
      })
    ].each do |attributes|
      assert_no_difference -> { Rule.count } do
        post api_v1_rules_url, params: { rule: attributes }, headers: api_headers(write_key), as: :json
      end
      assert_response :unprocessable_entity
      assert response.parsed_body["errors"].any?
    end

    patch api_v1_rule_url(@rule), params: { rule: {
      actions_attributes: { "0" => { id: @rule.actions.sole.id, _destroy: true } }
    } }, headers: api_headers(write_key), as: :json
    assert_response :unprocessable_entity
    assert_equal 1, @rule.reload.actions.count
  end

  test "all write endpoints require authentication and write scope" do
    [
      [ :post, api_v1_rules_url ],
      [ :patch, api_v1_rule_url(@rule) ],
      [ :delete, api_v1_rule_url(@rule) ],
      [ :delete, destroy_all_api_v1_rules_url ],
      [ :post, apply_api_v1_rule_url(@rule) ],
      [ :post, apply_all_api_v1_rules_url ],
      [ :post, clear_ai_cache_api_v1_rules_url ]
    ].each do |method, path|
      public_send(method, path, params: { rule: valid_rule_attributes }, as: :json)
      assert_response :unauthorized
      public_send(method, path, params: { rule: valid_rule_attributes }, headers: api_headers(@api_key), as: :json)
      assert_response :forbidden
    end
  end

  test "member operations and nested identifiers never cross families" do
    other = other_family_rule
    [
      [ :get, form_options_api_v1_rule_url(other) ],
      [ :get, confirm_api_v1_rule_url(other) ],
      [ :post, apply_api_v1_rule_url(other) ],
      [ :patch, api_v1_rule_url(other) ],
      [ :delete, api_v1_rule_url(other) ]
    ].each do |method, path|
      public_send(method, path, params: { rule: { name: "Stolen" } }, headers: api_headers(write_key), as: :json)
      assert_response :not_found
    end
    patch api_v1_rule_url(@rule), params: { rule: {
      actions_attributes: { "0" => { id: other.actions.sole.id, value: "Stolen" } }
    } }, headers: api_headers(write_key), as: :json
    assert_response :not_found
    assert_equal "Other", other.reload.actions.sole.value
  end

  test "preview honors effective date and deduplicates apply-all matches" do
    entry = entries(:transaction)
    entry.update!(name: "coffee", date: Date.new(2024, 1, 1))
    @rule.update!(effective_date: Date.new(2024, 1, 2))
    get confirm_api_v1_rule_url(@rule), headers: api_headers(@api_key)
    assert_response :success
    assert_equal 0, response.parsed_body["confirm"]["affected_count"]

    @rule.update!(effective_date: entry.date)
    second = @family.rules.build(valid_rule_attributes)
    second.save!
    get confirm_api_v1_rule_url(@rule), headers: api_headers(@api_key)
    assert_response :success
    assert_equal 1, response.parsed_body["confirm"]["affected_count"]

    get confirm_all_api_v1_rules_url, headers: api_headers(@api_key)
    assert_response :success
    assert_equal 1, response.parsed_body["total_affected_count"]
  end

  test "AI previews quote the family's selected categorization model" do
    @rule.actions.create!(action_type: "auto_categorize")
    Family.any_instance.stubs(:categorization_model_name).returns("gpt-4o")
    LlmUsage.expects(:estimate_auto_categorize_cost).with(
      transaction_count: @rule.affected_resource_count, category_count: @family.categories.count, model: "gpt-4o"
    ).returns(0.25)
    get confirm_api_v1_rule_url(@rule), headers: api_headers(@api_key)
    assert_response :success
    assert_equal({ "model" => "gpt-4o", "estimated_cost" => 0.25 }, response.parsed_body["confirm"]["ai"])
  end


  test "apply activates and queues a real lock-overriding rule execution" do
    @rule.update!(active: false)
    assert_enqueued_with(job: RuleJob, args: [ @rule, { ignore_attribute_locks: true } ]) do
      post apply_api_v1_rule_url(@rule), headers: api_headers(write_key)
    end
    assert_response :success
    assert @rule.reload.active
  end

  test "apply all and cache clear queue family-scoped work" do
    assert_enqueued_with(job: ApplyAllRulesJob, args: [ @family ]) do
      post apply_all_api_v1_rules_url, headers: api_headers(write_key)
    end
    assert_response :success

    assert_enqueued_with(job: ClearAiCacheJob, args: [ @family ]) do
      post clear_ai_cache_api_v1_rules_url, headers: api_headers(write_key)
    end
    assert_response :success
    assert DebugLogEntry.where(family: @family, source: "Api::V1::RulesController", level: "info").exists?
  end

  test "cache queue failure is surfaced and logged rather than reported as success" do
    ClearAiCacheJob.stubs(:perform_later).with(@family).returns(false)
    assert_raises(ActiveJob::EnqueueError) do
      post clear_ai_cache_api_v1_rules_url, headers: api_headers(write_key)
    end
    assert DebugLogEntry.where(family: @family, category: ClearAiCacheJob::DEBUG_CATEGORY, level: "error").exists?
  end

  test "delete and delete all only remove this family's rules" do
    other = other_family_rule
    delete api_v1_rule_url(@rule), headers: api_headers(write_key)
    assert_response :success
    assert_not Rule.exists?(@rule.id)
    delete destroy_all_api_v1_rules_url, headers: api_headers(write_key)
    assert_response :success
    assert_empty @family.rules.reload
    assert Rule.exists?(other.id)
  end

  private
    def write_key
      @write_key ||= ApiKey.create!(user: @user, name: "Rules Write Key", scopes: [ "read_write" ],
        source: "web", display_key: "rules_write_#{SecureRandom.hex(8)}")
    end

    def valid_rule_attributes
      {
        name: "Coffee", resource_type: "transaction",
        conditions_attributes: { "0" => { condition_type: "transaction_name", operator: "like", value: "coffee" } },
        actions_attributes: { "0" => { action_type: "set_transaction_name", value: "Coffee" } }
      }
    end

    def other_family_rule
      other_family = Family.create!(name: "Other Family", currency: "USD", locale: "en")
      other_family.rules.create!(valid_rule_attributes.merge(name: "Other",
        actions_attributes: { "0" => { action_type: "set_transaction_name", value: "Other" } }))
    end


    def api_key_without_read_scope
      # Valid persisted API keys can only be read/read_write; this intentionally
      # bypasses validations to exercise the runtime insufficient-scope guard.
      ApiKey.new(
        user: @user,
        name: "No Read Key",
        scopes: [],
        display_key: "test_no_read_#{SecureRandom.hex(8)}",
        source: "mobile"
      ).tap { |api_key| api_key.save!(validate: false) }
    end

    def api_headers(api_key)
      { "X-Api-Key" => api_key.plain_key }
    end
end
