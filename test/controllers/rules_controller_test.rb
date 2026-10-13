require "test_helper"

class RulesControllerTest < ActionDispatch::IntegrationTest
  setup do
    sign_in @user = users(:family_admin)
  end

  test "should get new" do
    get new_rule_url(resource_type: "transaction")
    assert_response :success
  end

  test "should get new with pre-filled name and action" do
    category = categories(:food_and_drink)
    get new_rule_url(
      resource_type: "transaction",
      name: "Starbucks",
      action_type: "set_transaction_category",
      action_value: category.id,
      format: :json
    )
    assert_response :success

    payload = JSON.parse(response.body)
    assert_equal "Starbucks", payload.fetch("rule").fetch("name")
    condition = payload.fetch("rule").fetch("conditions").first
    assert_equal "transaction_name", condition.fetch("condition_type")
    assert_equal "Starbucks", condition.fetch("value")
    action = payload.fetch("rule").fetch("actions").first
    assert_equal "set_transaction_category", action.fetch("action_type")
  end

  test "should get new with pre-filled merchant and category action" do
    merchant = merchants(:amazon)
    category = categories(:food_and_drink)

    get new_rule_url(
      resource_type: "transaction",
      merchant_id: merchant.id,
      action_type: "set_transaction_category",
      action_value: category.id,
      format: :json
    )

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal "Amazon", payload.fetch("rule").fetch("name")
    condition = payload.fetch("rule").fetch("conditions").first
    assert_equal "transaction_merchant", condition.fetch("condition_type")
    action = payload.fetch("rule").fetch("actions").first
    assert_equal "set_transaction_category", action.fetch("action_type")
  end

  test "should get edit" do
    get edit_rule_url(rules(:one))
    assert_response :success
  end

  # "Set all transactions with a name like 'starbucks' and an amount between 20 and 40 to the 'food and drink' category"
  test "creates rule with nested conditions" do
    post rules_url, params: {
      rule: {
        effective_date: 30.days.ago.to_date,
        resource_type: "transaction",
        conditions_attributes: {
          "0" => {
            condition_type: "transaction_name",
            operator: "like",
            value: "starbucks"
          },
          "1" => {
            condition_type: "compound",
            operator: "and",
            sub_conditions_attributes: {
              "0" => {
                condition_type: "transaction_amount",
                operator: ">",
                value: 20
              },
              "1" => {
                condition_type: "transaction_amount",
                operator: "<",
                value: 40
              }
            }
          }
        },
        actions_attributes: {
          "0" => {
            action_type: "set_transaction_category",
            value: categories(:food_and_drink).id
          }
        }
      }
    }

    rule = @user.family.rules.order("created_at DESC").first

    # Rule
    assert_equal "transaction", rule.resource_type
    assert_not rule.active # Not active by default
    assert_equal 30.days.ago.to_date, rule.effective_date

    # Conditions assertions
    assert_equal 2, rule.conditions.count
    compound_condition = rule.conditions.find { |condition| condition.condition_type == "compound" }
    assert_equal "compound", compound_condition.condition_type
    assert_equal 2, compound_condition.sub_conditions.count

    # Actions assertions
    assert_equal 1, rule.actions.count
    assert_equal "set_transaction_category", rule.actions.first.action_type
    assert_equal categories(:food_and_drink).id, rule.actions.first.value

    assert_redirected_to confirm_rule_url(rule, reload_on_close: true)
  end

  test "can update rule" do
    rule = rules(:one)

    assert_difference -> { Rule.count } => 0,
      -> { Rule::Condition.count } => 1,
      -> { Rule::Action.count } => 1 do
      patch rule_url(rule), params: {
        rule: {
          active: false,
          conditions_attributes: {
            "0" => {
              id: rule.conditions.first.id,
              value: "new_value"
            },
            "1" => {
              condition_type: "transaction_amount",
              operator: ">",
              value: 100
            }
          },
          actions_attributes: {
            "0" => {
              id: rule.actions.first.id,
              value: "new_value"
            },
            "1" => {
              action_type: "set_transaction_tags",
              value: tags(:one).id
            }
          }
        }
      }
    end

    rule.reload

    assert_not rule.active
    assert_equal "new_value", rule.conditions.order("created_at ASC").first.value
    assert_equal "new_value", rule.actions.order("created_at ASC").first.value
    assert_equal tags(:one).id, rule.actions.order("created_at ASC").last.value
    assert_equal "100", rule.conditions.order("created_at ASC").last.value

    assert_redirected_to rules_url
  end

  test "can destroy conditions and actions while editing" do
    rule = rules(:one)

    assert_equal 1, rule.conditions.count
    assert_equal 1, rule.actions.count

    patch rule_url(rule), params: {
      rule: {
        conditions_attributes: {
          "0" => { id: rule.conditions.first.id, _destroy: true },
          "1" => {
            condition_type: "transaction_name",
            operator: "like",
            value: "new_condition"
          }
        },
        actions_attributes: {
          "0" => { id: rule.actions.first.id, _destroy: true },
          "1" => {
            action_type: "set_transaction_tags",
            value: tags(:one).id
          }
        }
      }
    }

    assert_redirected_to rules_url

    rule.reload

    assert_equal 1, rule.conditions.count
    assert_equal 1, rule.actions.count
  end

  test "can destroy rule" do
    rule = rules(:one)

    assert_difference [ "Rule.count", "Rule::Condition.count", "Rule::Action.count" ], -1 do
      delete rule_url(rule)
    end

    assert_redirected_to rules_url
  end

  test "index renders when rule has empty compound condition" do
    malformed_rule = @user.family.rules.build(resource_type: "transaction")
    malformed_rule.conditions.build(condition_type: "compound", operator: "and")
    malformed_rule.actions.build(action_type: "exclude_transaction")
    malformed_rule.save!

    get rules_url(format: :json)

    assert_response :success
    payload = JSON.parse(response.body)
    assert payload.fetch("rules").any? { |entry| entry.fetch("id") == malformed_rule.id }
  end

  test "index uses next valid condition when first compound condition is empty" do
    rule = @user.family.rules.build(resource_type: "transaction")
    rule.conditions.build(condition_type: "compound", operator: "and")
    rule.conditions.build(condition_type: "transaction_name", operator: "like", value: "edge-case-name")
    rule.actions.build(action_type: "exclude_transaction")
    rule.save!

    get rules_url(format: :json)

    assert_response :success

    row = JSON.parse(response.body).fetch("rules").find { |entry| entry.fetch("id") == rule.id }
    assert_not_nil row
    assert_match(/edge-case-name/, row.fetch("summary").fetch("condition"))
  end

  test "index shows blocked count in recent runs summary" do
    rule = rules(:one)
    RuleRun.create!(
      rule: rule,
      execution_type: "manual",
      status: "success",
      transactions_queued: 10,
      transactions_processed: 7,
      transactions_modified: 4,
      pending_jobs_count: 0,
      executed_at: Time.current
    )

    get rules_url(format: :json)

    assert_response :success
    run = JSON.parse(response.body).fetch("recent_runs").fetch("items").first
    assert_equal 10, run.fetch("queued")
    assert_equal 7, run.fetch("processed")
    assert_equal 4, run.fetch("modified")
    assert_equal 3, run.fetch("blocked")
  end

  # The confirmation screen used to hardcode :openai, so it quoted a provider
  # that would not run — an Anthropic install saw the OpenAI model, and a family
  # on Jev saw whichever LLM model happened to be configured.
  test "confirm names the provider that will actually categorize" do
    rule = rules(:one)
    rule.actions.create!(action_type: "auto_categorize")
    @user.family.update!(categorization_provider: "jev")
    # The general stub catches the :openai lookup preferred_llm_provider makes;
    # the specific one wins for :jev.
    Provider::Registry.stubs(:get_provider).returns(nil)
    Provider::Registry.stubs(:get_provider).with(:jev).returns(Provider::Jev.allocate)
    Provider::Jev.stubs(:effective_model).returns("~typesafe/jev-latest")

    get confirm_rule_url(rule, format: :json)

    assert_response :success
    assert_equal "~typesafe/jev-latest", JSON.parse(response.body).fetch("confirm").fetch("ai").fetch("model")
  end

  test "confirm does not name Jev when the family has not selected it" do
    rule = rules(:one)
    rule.actions.create!(action_type: "auto_categorize")
    assert_equal "llm", @user.family.categorization_provider

    get confirm_rule_url(rule, format: :json)

    assert_response :success
    assert_nil JSON.parse(response.body).fetch("confirm").fetch("ai").fetch("model")
  end

  test "should get confirm_all" do
    get confirm_all_rules_url
    assert_response :success
  end

  test "apply_all enqueues job and redirects" do
    assert_enqueued_with(job: ApplyAllRulesJob) do
      post apply_all_rules_url
    end

    assert_redirected_to rules_url
  end

  test "clear_ai_cache enqueues job and records the request in the debug log" do
    assert_enqueued_with(job: ClearAiCacheJob, args: [ @user.family ]) do
      post clear_ai_cache_rules_url
    end

    assert_redirected_to rules_url

    entry = DebugLogEntry.where(category: ClearAiCacheJob::DEBUG_CATEGORY, level: "info").sole
    assert_equal "AI cache reset requested from the rules page", entry.message
    assert_equal @user, entry.user
    assert_equal @user.family, entry.family
  end

  test "clear_ai_cache records an error when the job cannot be enqueued" do
    ClearAiCacheJob.expects(:perform_later).with(@user.family).raises(StandardError, "queue is down")

    assert_raises(StandardError) { post clear_ai_cache_rules_url }

    entry = DebugLogEntry.where(category: ClearAiCacheJob::DEBUG_CATEGORY, level: "error").sole
    assert_match "AI cache reset could not be enqueued", entry.message
    assert_equal "StandardError", entry.metadata["error_class"]
  end

  # perform_later swallows ActiveJob::EnqueueError into a false return instead of
  # raising it, which would otherwise log the reset as requested and redirect
  # with a success notice while nothing was queued.
  test "clear_ai_cache records an error when the job is silently not enqueued" do
    ClearAiCacheJob.stubs(:perform_later).with(@user.family).returns(false)

    assert_raises(ActiveJob::EnqueueError) { post clear_ai_cache_rules_url }

    entry = DebugLogEntry.where(category: ClearAiCacheJob::DEBUG_CATEGORY, level: "error").sole
    assert_match "AI cache reset could not be enqueued", entry.message
    assert_equal "ActiveJob::EnqueueError", entry.metadata["error_class"]
    assert_empty DebugLogEntry.where(category: ClearAiCacheJob::DEBUG_CATEGORY, level: "info")
  end

  # When the adapter reports the failure, the yielded job carries the underlying
  # cause — the detail an operator actually needs. The fallback above can only
  # say that nothing was queued.
  test "clear_ai_cache surfaces the queue adapter's error when the job carries one" do
    failed_job = ClearAiCacheJob.new(@user.family)
    failed_job.enqueue_error = ActiveJob::EnqueueError.new("connection refused")
    ClearAiCacheJob.stubs(:perform_later).with(@user.family).yields(failed_job).returns(false)

    error = assert_raises(ActiveJob::EnqueueError) { post clear_ai_cache_rules_url }
    assert_equal "connection refused", error.message

    entry = DebugLogEntry.where(category: ClearAiCacheJob::DEBUG_CATEGORY, level: "error").sole
    assert_match "connection refused", entry.message
    assert_equal "connection refused", entry.metadata["error_message"]
  end
  test "index json returns rules, sort state, and recent runs" do
    rule = rules(:one)
    RuleRun.create!(
      rule: rule,
      execution_type: "manual",
      status: "success",
      transactions_queued: 10,
      transactions_processed: 7,
      transactions_modified: 4,
      pending_jobs_count: 0,
      executed_at: Time.current
    )

    get rules_url(format: :json), params: { sort_by: "updated_at", direction: "desc" }

    assert_response :success
    payload = response.parsed_body
    assert_equal "updated_at", payload["sort_by"]
    assert_equal "desc", payload["direction"]
    assert_equal rule.id, payload["rules"].sole["id"]
    run = payload["recent_runs"]["items"].sole
    assert_equal 10, run["queued"]
    assert_equal 3, run["blocked"]
    assert_equal 1, payload["recent_runs"]["pages"]
  end

  test "new json includes prefills and registry" do
    category = categories(:food_and_drink)

    get new_rule_url(format: :json),
        params: {
          resource_type: "transaction",
          name: "Starbucks",
          action_type: "set_transaction_category",
          action_value: category.id
        }

    assert_response :success
    payload = response.parsed_body
    assert_equal "Starbucks", payload["rule"]["name"]
    assert_equal "transaction_name", payload["rule"]["conditions"].sole["condition_type"]
    assert_equal "set_transaction_category", payload["rule"]["actions"].sole["action_type"]
    filter_keys = payload["registry"]["filters"].map { |f| f["key"] }
    assert_includes filter_keys, "transaction_name"
    executor_keys = payload["registry"]["executors"].map { |e| e["key"] }
    assert_includes executor_keys, "set_transaction_category"
  end

  test "new json includes merchant prefill" do
    merchant = merchants(:amazon)

    get new_rule_url(format: :json), params: { resource_type: "transaction", merchant_id: merchant.id }

    assert_response :success
    payload = response.parsed_body
    assert_equal merchant.name, payload["rule"]["name"]
    assert_equal "transaction_merchant", payload["rule"]["conditions"].sole["condition_type"]
  end

  test "edit json includes rule and registry" do
    get edit_rule_url(rules(:one), format: :json)

    assert_response :success
    payload = response.parsed_body
    assert_equal rules(:one).id, payload["rule"]["id"]
    assert payload["registry"]["filters"].any?
    assert payload["registry"]["executors"].any?
  end

  test "create json returns rule plus confirm payload" do
    post rules_url(format: :json), params: {
      rule: {
        resource_type: "transaction",
        conditions_attributes: {
          "0" => { condition_type: "transaction_name", operator: "like", value: "starbucks" }
        },
        actions_attributes: {
          "0" => { action_type: "set_transaction_category", value: categories(:food_and_drink).id }
        }
      }
    }

    assert_response :created
    payload = response.parsed_body
    assert payload["rule"]["id"].present?
    assert payload["confirm"]["affected_count"].is_a?(Integer)
    assert_nil payload["confirm"]["ai"]
  end

  test "create json confirm includes ai estimate for auto_categorize" do
    post rules_url(format: :json), params: {
      rule: {
        resource_type: "transaction",
        conditions_attributes: {
          "0" => { condition_type: "transaction_name", operator: "like", value: "starbucks" }
        },
        actions_attributes: {
          "0" => { action_type: "auto_categorize" }
        }
      }
    }

    assert_response :created
    payload = response.parsed_body
    assert payload["confirm"]["ai"].key?("model")
    assert payload["confirm"]["ai"].key?("estimated_cost")
  end

  test "update json succeeds and renders 422 on invalid" do
    rule = rules(:one)

    patch rule_url(rule, format: :json), params: { rule: { name: "Renamed" } }

    assert_response :success
    assert_equal "Renamed", response.parsed_body["rule"]["name"]

    patch rule_url(rule, format: :json), params: {
      rule: { actions_attributes: { "0" => { id: rule.actions.first.id, _destroy: true } } }
    }

    assert_response :unprocessable_entity
    assert response.parsed_body["errors"].any?
  end

  test "create json renders 422 when actions are missing" do
    post rules_url(format: :json), params: {
      rule: {
        resource_type: "transaction",
        conditions_attributes: {
          "0" => { condition_type: "transaction_name", operator: "like", value: "starbucks" }
        },
        actions_attributes: {}
      }
    }

    assert_response :unprocessable_entity
    assert response.parsed_body["errors"].any?
  end

  test "confirm json mirrors confirm payload branches" do
    rule = rules(:one)

    get confirm_rule_url(rule, format: :json)

    assert_response :success
    payload = response.parsed_body
    assert payload["confirm"]["affected_count"].is_a?(Integer)
    assert_nil payload["confirm"]["ai"]

    rule.actions.create!(action_type: "auto_categorize")

    get confirm_rule_url(rule, format: :json)

    assert_response :success
    assert response.parsed_body["confirm"]["ai"].key?("estimated_cost")
  end

  test "apply json activates and enqueues" do
    rule = rules(:one)
    assert_enqueued_with(job: RuleJob) do
      post apply_rule_url(rule, format: :json)
    end

    assert_response :success
    assert_equal({ "ok" => true }, response.parsed_body)
    assert rule.reload.active
  end

  test "destroy and destroy_all json return ok" do
    delete rule_url(rules(:one), format: :json)

    assert_response :success
    assert_equal({ "ok" => true }, response.parsed_body)

    delete destroy_all_rules_url(format: :json)

    assert_response :success
    assert_equal({ "ok" => true }, response.parsed_body)
  end

  test "confirm_all json includes totals and ai branches" do
    get confirm_all_rules_url(format: :json)

    assert_response :success
    payload = response.parsed_body
    assert payload.key?("total_affected_count")
    assert_nil payload["ai"]

    rules(:one).actions.create!(action_type: "auto_categorize")

    get confirm_all_rules_url(format: :json)

    assert_response :success
    assert response.parsed_body["ai"].key?("estimated_cost")
  end

  test "apply_all and clear_ai_cache json return ok" do
    assert_enqueued_with(job: ApplyAllRulesJob) do
      post apply_all_rules_url(format: :json)
    end
    assert_response :success
    assert_equal({ "ok" => true }, response.parsed_body)

    assert_enqueued_with(job: ClearAiCacheJob) do
      post clear_ai_cache_rules_url(format: :json)
    end
    assert_response :success
    assert_equal({ "ok" => true }, response.parsed_body)
  end
end
