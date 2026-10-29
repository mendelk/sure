class RulesController < ApplicationController
  include StreamExtensions

  before_action :set_rule, only: [  :edit, :update, :destroy, :apply, :confirm ]

  def index
    @sort_by = params[:sort_by] || "name"
    @direction = params[:direction] || "asc"

    allowed_columns = [ "name", "updated_at" ]
    @sort_by = "name" unless allowed_columns.include?(@sort_by)
    @direction = "asc" unless [ "asc", "desc" ].include?(@direction)

    @rules = Current.family.rules.includes(conditions: :sub_conditions).order(@sort_by => @direction)

    # Fetch recent rule runs with pagination
    recent_runs_scope = RuleRun
                          .joins(:rule)
                          .where(rules: { family_id: Current.family.id })
                          .recent
                          .includes(:rule)

    @pagy, @recent_runs = pagy(recent_runs_scope, limit: safe_per_page, page_param: :runs_page)

    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json { render json: page_data.index(rules: @rules, recent_runs: @recent_runs, pagy: @pagy, sort_by: @sort_by, direction: @direction) }
    end
  end

  def new
    @rule = page_data.new_rule(params)

    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json { render json: page_data.form(@rule) }
    end
  end

  def create
    @rule = Current.family.rules.build(rule_params)

    if @rule.save
      respond_to do |format|
        format.html { redirect_to confirm_rule_path(@rule, reload_on_close: true) }
        format.json { render json: { rule: page_data.detail(@rule), confirm: page_data.confirm(@rule) }, status: :created }
      end
    else
      respond_to do |format|
        format.html { redirect_to rules_path, alert: @rule.errors.full_messages.to_sentence, status: :see_other }
        format.json { render json: { errors: @rule.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  def apply
    @rule.update!(active: true)
    @rule.apply_later(ignore_attribute_locks: true)

    respond_to do |format|
      format.html { redirect_back_or_to rules_path, notice: "#{@rule.resource_type.humanize} rule activated" }
      format.json { render json: { ok: true } }
    end
  end

  def confirm
    # Compute provider, model, and cost estimation for auto-categorize actions
    if @rule.actions.any? { |a| a.action_type == "auto_categorize" }
      @selected_model, @estimated_cost = page_data.auto_categorize_estimate(@rule)
    end

    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json { render json: { rule: page_data.detail(@rule), confirm: page_data.confirm(@rule) } }
    end
  end

  def edit
    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json { render json: page_data.form(@rule) }
    end
  end

  def update
    if @rule.update(rule_params)
      respond_to do |format|
        format.html { redirect_back_or_to rules_path, notice: t(".success") }
        format.turbo_stream { stream_redirect_back_or_to rules_path, notice: t(".success") }
        format.json { render json: { rule: page_data.detail(@rule) } }
      end
    else
      respond_to do |format|
        format.html { redirect_to rules_path, alert: @rule.errors.full_messages.to_sentence, status: :see_other }
        format.turbo_stream { stream_redirect_back_or_to rules_path, notice: @rule.errors.full_messages.to_sentence }
        format.json { render json: { errors: @rule.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  def destroy
    @rule.destroy

    respond_to do |format|
      format.html { redirect_to rules_path, notice: t(".success") }
      format.json { render json: { ok: true } }
    end
  end

  def destroy_all
    Current.family.rules.destroy_all

    respond_to do |format|
      format.html { redirect_to rules_path, notice: t(".success") }
      format.json { render json: { ok: true } }
    end
  end

  def confirm_all
    @rules = Current.family.rules
    @total_affected_count = Rule.total_affected_resource_count(@rules)
    has_ai_actions = @rules.any? { |r| r.actions.any? { |a| a.action_type == "auto_categorize" } }

    # Compute AI cost estimation if any rule has auto_categorize action
    if has_ai_actions
      @selected_model, @estimated_cost = page_data.auto_categorize_estimate(
        Current.family,
        transaction_count: @total_affected_count
      )
    end

    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json { render json: page_data.confirm_all(@rules) }
    end
  end

  def apply_all
    ApplyAllRulesJob.perform_later(Current.family)

    respond_to do |format|
      format.html { redirect_back_or_to rules_path, notice: t("rules.apply_all.success") }
      format.json { render json: { ok: true } }
    end
  end

  def clear_ai_cache
    Rule::AiCacheReset.new(family: Current.family, user: Current.user, source: self.class.name).enqueue

    respond_to do |format|
      format.html { redirect_to rules_path, notice: t("rules.clear_ai_cache.success") }
      format.json { render json: { ok: true } }
    end
  end

  private
    def page_data
      @page_data ||= Rule::PageData.new(family: Current.family, user: Current.user)
    end


    def set_rule
      @rule = Current.family.rules.find(params[:id])
    end

    def rule_params
      params.require(:rule).permit(
        :resource_type, :effective_date, :active, :name,
        conditions_attributes: [
          :id, :condition_type, :operator, :value, :_destroy,
          sub_conditions_attributes: [ :id, :condition_type, :operator, :value, :_destroy ]
        ],
        actions_attributes: [
          :id, :action_type, :value, :_destroy, { value: [] }
        ]
      )
    end
end
