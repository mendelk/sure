# Shared rule-builder and execution-preview representation for HTML and API consumers.
class Rule::PageData
  def initialize(family:, user:)
    @family = family
    @user = user
  end

  def new_rule(params)
    family.rules.build(resource_type: params[:resource_type].presence || "transaction").tap do |rule|
      if params[:merchant_id].present?
        merchant = family.available_merchants_for(user).find(params[:merchant_id])
        rule.name = merchant.name
        rule.conditions.build(condition_type: "transaction_merchant", operator: "=", value: merchant.id)
      elsif params[:name].present?
        rule.name = params[:name]
        rule.conditions.build(condition_type: "transaction_name", operator: "like", value: params[:name])
      end

      if params[:action_type].present? && params[:action_value].present?
        rule.actions.build(action_type: params[:action_type], value: params[:action_value])
      end
    end
  end

  def index(rules:, recent_runs:, pagy:, sort_by:, direction:)
    {
      rules: rules.map { |rule| row(rule) },
      count: rules.size,
      sort_by: sort_by,
      direction: direction,
      self_hosted: self_hosted?,
      ai_actions_present: rules.any? { |rule| rule.actions.any? { |action| action.action_type == "auto_categorize" } },
      recent_runs: {
        items: recent_runs.map { |run| run_json(run) },
        page: pagy.page,
        pages: pagy.pages,
        count: pagy.count,
        per_page: pagy.limit
      }
    }
  end

  def form(rule)
    { rule: detail(rule), registry: rule.registry.as_json, self_hosted: self_hosted? }
  end

  def detail(rule)
    {
      id: rule.id,
      name: rule.name,
      resource_type: rule.resource_type,
      active: rule.active,
      effective_date: rule.effective_date&.iso8601,
      conditions: rule.conditions.select { |condition| condition.parent_id.nil? }.map { |condition| condition_json(condition) },
      actions: rule.actions.map { |action| action_json(action) }
    }
  end

  def confirm(rule)
    payload = { affected_count: rule.affected_resource_count, ai: nil }
    if rule.actions.any? { |action| action.action_type == "auto_categorize" }
      model, cost = auto_categorize_estimate(rule)
      payload[:ai] = { model: model, estimated_cost: cost }
    end
    payload
  end

  def confirm_all(rules)
    count = Rule.total_affected_resource_count(rules)
    ai = if rules.any? { |rule| rule.actions.any? { |action| action.action_type == "auto_categorize" } }
      model, cost = auto_categorize_estimate(family, transaction_count: count)
      { model: model, estimated_cost: cost }
    end
    { rule_count: rules.size, total_affected_count: count, ai: ai }
  end

  # Price the provider/model that will actually run; unavailable pricing stays nil.
  def auto_categorize_estimate(scope, transaction_count: nil)
    count = transaction_count || scope.affected_resource_count
    model = family.categorization_model_name
    return [ nil, nil ] if model.blank?

    cost = LlmUsage.estimate_auto_categorize_cost(
      transaction_count: count,
      category_count: family.categories.count,
      model: model
    )
    [ model, cost ]
  end

  private
    attr_reader :family, :user

    def self_hosted?
      Rails.application.config.app_mode.self_hosted?
    end

    def row(rule)
      displayed = rule.displayed_condition
      {
        id: rule.id,
        name: rule.name,
        resource_type: rule.resource_type,
        active: rule.active,
        summary: {
          condition: displayed ? "#{displayed.filter.label} #{displayed.operator} #{displayed.value_display}" : I18n.t("rules.no_condition"),
          additional_conditions_count: rule.additional_displayable_conditions_count,
          action: action_summary(rule.actions.first),
          additional_actions_count: [ rule.actions.size - 1, 0 ].max,
          scope: scope_summary(rule)
        },
        updated_at: rule.updated_at.iso8601
      }
    end

    def action_summary(action)
      return I18n.t("rules.no_action") if action.nil?

      if action.value.present? && action.options.present?
        I18n.t("rules.rule.action_label_to", label: action.executor.label, value: action.value_display)
      else
        action.executor.label
      end
    end

    def scope_summary(rule)
      if rule.effective_date.nil?
        I18n.t("rules.rule.all_past_and_future", resource: rule.resource_type.pluralize)
      else
        I18n.t("rules.rule.on_or_after", resource: rule.resource_type.pluralize, date: rule.effective_date.strftime("%b %-d, %Y"))
      end
    end

    def run_json(run)
      {
        id: run.id,
        executed_at: run.executed_at.iso8601,
        execution_type: run.execution_type,
        status: run.status,
        rule_name: run.rule_name.presence || run.rule&.name.presence || I18n.t("rules.recent_runs.unnamed_rule"),
        queued: run.transactions_queued,
        processed: run.transactions_processed,
        modified: run.transactions_modified,
        blocked: run.transactions_blocked,
        error_message: run.error_message
      }
    end

    def condition_json(condition)
      {
        id: condition.id,
        condition_type: condition.condition_type,
        operator: condition.operator,
        value: condition.value,
        sub_conditions: condition.sub_conditions.map do |sub|
          { id: sub.id, condition_type: sub.condition_type, operator: sub.operator, value: sub.value }
        end
      }
    end

    def action_json(action)
      {
        id: action.id,
        action_type: action.action_type,
        value: action.value,
        values: Rule::Action.decode_multi_value_names(action.value)
      }
    end
end
