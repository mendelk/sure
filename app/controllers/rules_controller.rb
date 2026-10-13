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
      format.json { render json: rules_index_json }
    end
  end

  def new
    @rule = Current.family.rules.build(
      resource_type: params[:resource_type] || "transaction",
    )

    if params[:merchant_id].present?
      merchant = Current.family.available_merchants_for(Current.user).find(params[:merchant_id])
      @rule.name = merchant.name
      @rule.conditions.build(
        condition_type: "transaction_merchant",
        operator: "=",
        value: merchant.id
      )
    elsif params[:name].present?
      @rule.name = params[:name]
      @rule.conditions.build(
        condition_type: "transaction_name",
        operator: "like",
        value: params[:name]
      )
    end

    if params[:action_type].present? && params[:action_value].present?
      @rule.actions.build(
        action_type: params[:action_type],
        value: params[:action_value]
      )
    end

    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json { render json: rule_form_json(@rule) }
    end
  end

  def create
    @rule = Current.family.rules.build(rule_params)

    if @rule.save
      respond_to do |format|
        format.html { redirect_to confirm_rule_path(@rule, reload_on_close: true) }
        format.json { render json: { rule: rule_detail_json(@rule), confirm: rule_confirm_json(@rule) }, status: :created }
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
      @selected_model, @estimated_cost = auto_categorize_estimate(@rule)
    end

    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json { render json: { rule: rule_detail_json(@rule), confirm: rule_confirm_json(@rule) } }
    end
  end

  def edit
    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json { render json: rule_form_json(@rule) }
    end
  end

  def update
    if @rule.update(rule_params)
      respond_to do |format|
        format.html { redirect_back_or_to rules_path, notice: t(".success") }
        format.turbo_stream { stream_redirect_back_or_to rules_path, notice: t(".success") }
        format.json { render json: { rule: rule_detail_json(@rule) } }
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
      @selected_model, @estimated_cost = auto_categorize_estimate(
        Current.family,
        transaction_count: @total_affected_count
      )
    end

    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json do
        render json: {
          rule_count: @rules.count,
          total_affected_count: @total_affected_count,
          ai: has_ai_actions ? { model: @selected_model, estimated_cost: @estimated_cost } : nil
        }
      end
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
    enqueue_ai_cache_reset

    respond_to do |format|
      format.html { redirect_to rules_path, notice: t("rules.clear_ai_cache.success") }
      format.json { render json: { ok: true } }
    end
  end

  private
    # Names the provider that will actually run, and prices against it.
    #
    # This previously hardcoded :openai, so an Anthropic install was quoted the
    # wrong model and a family on Jev was quoted a provider that would not run
    # at all. LlmUsage has no pricing for Jev, so the cost comes back nil and the
    # view says so rather than inventing a figure.
    def auto_categorize_estimate(scope, transaction_count: nil)
      family = scope.is_a?(Rule) ? scope.family : scope
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

    # The reset itself happens in a background job, so an enqueue that never
    # lands looks exactly like a job that ran and found nothing. Logging the
    # request separately from the job's own "started" entry tells those apart.
    def enqueue_ai_cache_reset
      perform_ai_cache_reset_later

      DebugLogEntry.capture(
        category: ClearAiCacheJob::DEBUG_CATEGORY,
        level: "info",
        message: "AI cache reset requested from the rules page",
        source: self.class.name,
        family: Current.family,
        user: Current.user
      )
    end

    # Split out so the rescue below covers only the enqueue it reports on.
    # Anything that runs after the job is safely queued — the request log above,
    # the redirect — is then structurally incapable of being recorded as an
    # enqueue failure and retried, without that resting on the internals of
    # whatever those later steps happen to call.
    def perform_ai_cache_reset_later
      attempted_job = nil
      enqueued = ClearAiCacheJob.perform_later(Current.family) { |job| attempted_job = job }

      # perform_later turns an ActiveJob::EnqueueError — or an enqueue aborted by
      # a callback — into a false return rather than raising it, so the return
      # value is the only signal that the reset never reached the queue. The
      # yielded job carries the underlying error when there was one.
      return if enqueued

      raise attempted_job&.enqueue_error || ActiveJob::EnqueueError.new("ClearAiCacheJob was not enqueued")
    rescue => e
      DebugLogEntry.capture(
        category: ClearAiCacheJob::DEBUG_CATEGORY,
        level: "error",
        message: "AI cache reset could not be enqueued: #{e.class}: #{e.message}",
        source: self.class.name,
        family: Current.family,
        user: Current.user,
        metadata: { error_class: e.class.name, error_message: e.message }
      )
      raise
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

    # One JSON document per page: rows carry pre-rendered summary strings so
    # the React page renders from a single fetch without duplicating the
    # display logic in `_rule.html.erb`.
    def rules_index_json
      {
        rules: @rules.map { |rule| rule_row_json(rule) },
        count: @rules.count,
        sort_by: @sort_by,
        direction: @direction,
        self_hosted: self_hosted?,
        ai_actions_present: @rules.any? { |rule| rule.actions.any? { |a| a.action_type == "auto_categorize" } },
        recent_runs: {
          items: @recent_runs.map { |run| rule_run_json(run) },
          page: @pagy.page,
          pages: @pagy.pages,
          count: @pagy.count,
          per_page: @pagy.limit
        }
      }
    end

    def rule_row_json(rule)
      displayed = rule.displayed_condition
      first_action = rule.actions.first

      {
        id: rule.id,
        name: rule.name,
        resource_type: rule.resource_type,
        active: rule.active,
        summary: {
          condition: displayed ? "#{displayed.filter.label} #{displayed.operator} #{displayed.value_display}" : I18n.t("rules.no_condition"),
          additional_conditions_count: rule.additional_displayable_conditions_count,
          action: rule_action_summary(first_action),
          additional_actions_count: [ rule.actions.size - 1, 0 ].max,
          scope: rule_scope_summary(rule)
        },
        updated_at: rule.updated_at.iso8601
      }
    end

    def rule_action_summary(action)
      return I18n.t("rules.no_action") if action.nil?

      if action.value.present? && action.options.present?
        I18n.t("rules.rule.action_label_to", label: action.executor.label, value: action.value_display)
      else
        action.executor.label
      end
    end

    def rule_scope_summary(rule)
      if rule.effective_date.nil?
        I18n.t("rules.rule.all_past_and_future", resource: rule.resource_type.pluralize)
      else
        I18n.t("rules.rule.on_or_after", resource: rule.resource_type.pluralize, date: rule.effective_date.strftime("%b %-d, %Y"))
      end
    end

    def rule_run_json(run)
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

    # Builder payload: rule defaults/prefills plus the registry document that
    # drives the condition/action inputs (mirrors the Stimulus data values).
    def rule_form_json(rule)
      {
        rule: rule_detail_json(rule),
        registry: rule.registry.as_json,
        self_hosted: self_hosted?
      }
    end

    def rule_detail_json(rule)
      {
        id: rule.id,
        name: rule.name,
        resource_type: rule.resource_type,
        active: rule.active,
        effective_date: rule.effective_date&.iso8601,
        conditions: rule.conditions.select { |c| c.parent_id.nil? }.map { |c| rule_condition_json(c) },
        actions: rule.actions.map { |a| rule_action_json(a) }
      }
    end

    def rule_condition_json(condition)
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

    def rule_action_json(action)
      {
        id: action.id,
        action_type: action.action_type,
        value: action.value,
        values: Rule::Action.decode_multi_value_names(action.value)
      }
    end

    # Mirrors #confirm (including the auto_categorize_estimate branches): ai is
    # nil without an auto_categorize action; otherwise model/estimated_cost,
    # each nil when unavailable.
    def rule_confirm_json(rule)
      payload = { affected_count: rule.affected_resource_count, ai: nil }

      if rule.actions.any? { |a| a.action_type == "auto_categorize" }
        model, cost = auto_categorize_estimate(rule)
        payload[:ai] = { model: model, estimated_cost: cost }
      end

      payload
    end
end
