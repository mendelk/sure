# frozen_string_literal: true

class Api::V1::RulesController < Api::V1::BaseController
  include Pagy::Backend

  BOOLEAN_FILTERS = { "true" => true, "1" => true, "false" => false, "0" => false }.freeze
  RESOURCE_TYPES = %w[transaction].freeze
  READ_ACTIONS = %i[index show form_options registry confirm confirm_all].freeze

  before_action :ensure_read_scope, only: READ_ACTIONS
  before_action :ensure_write_scope, except: READ_ACTIONS
  before_action :set_rule, only: %i[show update destroy confirm apply]

  rescue_from Rule::UnsupportedResourceTypeError, Rule::Registry::UnsupportedActionError,
    Rule::Registry::UnsupportedConditionError, Rule::ConditionFilter::UnsupportedOperatorError do |error|
    render_validation_error(error.message)
  end

  def index
    return render_invalid_resource_type_filter if invalid_resource_type_filter?

    @per_page = safe_per_page_param
    rules_query = family.rules.includes(:actions, conditions: :sub_conditions).order(:created_at, :id)
    rules_query = rules_query.where(resource_type: params[:resource_type]) if params[:resource_type].present?
    if params[:active].present?
      active = parse_boolean_filter(params[:active])
      return if performed?

      rules_query = rules_query.where(active: active)
    end

    @pagy, @rules = pagy(rules_query, page: safe_page_param, limit: @per_page)
    @workspace = workspace(rules_query) if params[:include].to_s.split(",").include?("workspace")
    render :index
  end

  def show
    render :show
  end

  def form_options
    @rule = params[:id].present? ? family.rules.includes(:actions, conditions: :sub_conditions).find(params[:id]) : page_data.new_rule(params)
    render json: page_data.form(@rule)
  end

  def registry
    rule = family.rules.build(resource_type: params[:resource_type].presence || "transaction")
    render json: rule.registry.as_json
  end

  def create
    @rule = family.rules.build
    return unless assign_rule_attributes

    if @rule.save
      @confirm = page_data.confirm(@rule)
      render :show, status: :created
    else
      render_rule_errors
    end
  end

  def update
    return unless assign_rule_attributes

    if @rule.save
      render :show
    else
      render_rule_errors
    end
  end

  def destroy
    @rule.destroy!
    render json: { ok: true }
  end

  def destroy_all
    family.rules.destroy_all
    render json: { ok: true }
  end

  def confirm
    @confirm = page_data.confirm(@rule)
    render :show
  end

  def confirm_all
    render json: page_data.confirm_all(family.rules.includes(:actions, conditions: :sub_conditions))
  end

  def apply
    @rule.update!(active: true)
    @rule.apply_later(ignore_attribute_locks: true)
    render json: { ok: true }
  end

  def apply_all
    ApplyAllRulesJob.perform_later(family)
    render json: { ok: true }
  end

  def clear_ai_cache
    Rule::AiCacheReset.new(family: family, user: Current.user, source: self.class.name).enqueue
    render json: { ok: true }
  end

  private
    def family
      Current.family
    end

    def page_data
      @page_data ||= Rule::PageData.new(family: family, user: Current.user)
    end

    def set_rule
      @rule = family.rules.includes(:actions, conditions: :sub_conditions).find(params[:id])
    end

    def workspace(rules)
      sort_by = params[:sort_by].in?(%w[name updated_at]) ? params[:sort_by] : "name"
      direction = params[:direction].in?(%w[asc desc]) ? params[:direction] : "asc"
      runs = RuleRun.joins(:rule).where(rules: { family_id: family.id }).recent.includes(:rule)
      runs_pagy, recent_runs = pagy(runs, page: [ params[:runs_page].to_i, 1 ].max, limit: @per_page)
      page_data.index(
        rules: rules.reorder(sort_by => direction, :id => direction),
        recent_runs: recent_runs, pagy: runs_pagy, sort_by: sort_by, direction: direction
      )
    end

    def assign_rule_attributes
      attributes = params.require(:rule).permit(
        :resource_type, :effective_date, :active, :name,
        conditions_attributes: [
          :id, :condition_type, :operator, :value, :_destroy,
          sub_conditions_attributes: [ :id, :condition_type, :operator, :value, :_destroy ]
        ],
        actions_attributes: [ :id, :action_type, :value, :_destroy, { value: [] } ]
      )
      if attributes[:effective_date].present?
        begin
          Date.iso8601(attributes[:effective_date].to_s)
        rescue ArgumentError
          render_validation_error("effective_date must be an ISO 8601 date")
          return false
        end
      end
      @rule.assign_attributes(attributes)
      # Resolve the same registry used by the builder before persisting an unsupported resource/action.
      registry = @rule.registry
      @rule.actions.reject(&:marked_for_destruction?).each { |action| registry.get_executor!(action.action_type) if action.action_type.present? }
      @rule.conditions.reject(&:marked_for_destruction?).each { |condition| validate_condition_operator!(condition) }
      true
    end

    def validate_condition_operator!(condition)
      if condition.compound?
        unless condition.operator.in?(%w[and or])
          raise Rule::ConditionFilter::UnsupportedOperatorError, "Compound operator must be and or or"
        end
        condition.sub_conditions.reject(&:marked_for_destruction?).each { |sub| validate_condition_operator!(sub) }
      elsif condition.condition_type.present? && condition.operator.present?
        key = Rule::Condition::LEGACY_CONDITION_TYPE_ALIASES.fetch(condition.condition_type, condition.condition_type)
        filter = @rule.registry.get_filter!(key)
        unless filter.operators.map(&:last).include?(condition.operator)
          raise Rule::ConditionFilter::UnsupportedOperatorError, "Unsupported operator: #{condition.operator}"
        end
      end
    end

    def render_rule_errors
      render json: { error: "validation_failed", message: @rule.errors.full_messages.to_sentence, errors: @rule.errors.full_messages }, status: :unprocessable_entity
    end

    def parse_boolean_filter(value)
      normalized = value.to_s.downcase
      return BOOLEAN_FILTERS[normalized] if BOOLEAN_FILTERS.key?(normalized)

      render_validation_error("active must be one of: true, false, 1, 0")
      nil
    end

    def invalid_resource_type_filter?
      params[:resource_type].present? && !params[:resource_type].in?(RESOURCE_TYPES)
    end

    def render_invalid_resource_type_filter
      render_validation_error("resource_type must be one of: #{RESOURCE_TYPES.join(", ")}")
    end
end
