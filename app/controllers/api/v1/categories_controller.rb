# frozen_string_literal: true

class Api::V1::CategoriesController < Api::V1::BaseController
  include Pagy::Backend

  before_action :ensure_read_scope, only: %i[index show form_options]
  before_action :ensure_write_scope, except: %i[index show form_options]
  before_action :set_category, only: %i[show update destroy replacement]
  before_action :set_assignment_transaction, only: :create

  rescue_from ActiveRecord::RecordInvalid, ActiveRecord::RecordNotDestroyed, with: :render_record_error
  rescue_from Category::Merger::UnauthorizedCategoryError, with: :render_operation_error

  def index
    categories_query = apply_filters(family.categories.includes(:parent, :subcategories).alphabetically)
    @pagy, @categories = pagy(categories_query, page: safe_page_param, limit: safe_per_page_param)
    @per_page = safe_per_page_param
    @workspace = workspace.index if params[:include].to_s.split(",").include?("workspace")
    render :index
  end

  def show
    render :show
  end

  def form_options
    category = params[:id].present? ? family.categories.find(params[:id]) : family.categories.new(color: Category::COLORS.sample, lucide_icon: "shapes")
    render json: workspace.form(category)
  end

  def create
    attrs = category_params
    return unless valid_parent?(attrs)

    @category = family.categories.new(attrs)
    @category.lucide_icon = Category.suggested_icon(@category.name) if @category.lucide_icon.blank?
    Category.transaction do
      @category.save!
      if @assignment_transaction
        @assignment_transaction.update!(category: @category)
        @assignment_transaction.record_category_usage!
        @assignment_transaction.lock_saved_attributes!
      end
    end
    render :show, status: :created
  end

  def update
    attrs = category_params
    return unless valid_parent?(attrs)

    @category.update!(attrs)
    render :show
  end

  def destroy
    @category.destroy!
    head :no_content
  end

  def replacement
    replacement = family.categories.find(params[:replacement_category_id]) if params[:replacement_category_id].present?
    return render_operation_error(StandardError.new("Replacement category cannot be the same category")) if replacement == @category

    @category.replace_and_destroy!(replacement)
    render json: { ok: true }
  end

  def destroy_all
    Category.transaction { family.categories.each(&:destroy!) }
    render json: { ok: true }
  end

  def bootstrap
    family.categories.bootstrap!
    render json: { ok: true }
  end

  def merge
    source_ids = Array(params[:source_ids]).map(&:to_s).uniq
    if source_ids.empty? || source_ids.include?(params[:target_id].to_s)
      return render_operation_error(StandardError.new("Select source categories different from the target"))
    end
    target = family.categories.find(params[:target_id])
    sources = source_ids.map { |id| family.categories.find(id) }
    merger = Category::Merger.new(family: family, target_category: target, source_categories: sources)
    merger.merge!
    render json: { ok: true, merged_count: merger.merged_count }
  end

  private
    def family
      current_resource_owner.family
    end

    def workspace
      @api_workspace ||= Category::ApiWorkspace.new(family)
    end

    def set_category
      @category = family.categories.includes(:parent, :subcategories).find(params[:id])
    rescue ActiveRecord::RecordNotFound
      render json: { error: "not_found", message: "Category not found" }, status: :not_found
    end

    def set_assignment_transaction
      return if params[:transaction_id].blank?

      @assignment_transaction = family.transactions.joins(entry: :account).merge(Account.accessible_by(current_resource_owner)).find(params[:transaction_id])
      unless account_permissions(@assignment_transaction.entry.account)[:can_annotate]
        return render json: { error: "forbidden", message: "Not authorized to annotate this transaction" }, status: :forbidden
      end
      unless @assignment_transaction.category_editable?
        render json: { error: "unprocessable_entity", message: "Category is managed by the transfer" }, status: :unprocessable_entity
      end
    end

    def category_params
      permitted = params.require(:category).permit(:name, :color, :icon, :parent_id)
      permitted[:lucide_icon] = permitted.delete(:icon) if permitted.key?(:icon)
      permitted[:parent_id] = permitted[:parent_id].presence if permitted.key?(:parent_id)
      permitted
    end

    def valid_parent?(attrs)
      return true if attrs[:parent_id].blank?
      return true if attrs[:parent_id] != @category&.id && family.categories.exists?(id: attrs[:parent_id])

      render_operation_error(StandardError.new("Parent must be another category in your family"))
      false
    end

    def render_record_error(error)
      render json: { error: "unprocessable_entity", message: error.record.errors.full_messages.to_sentence, errors: error.record.errors.full_messages }, status: :unprocessable_entity
    end

    def render_operation_error(error)
      render json: { error: "unprocessable_entity", message: error.message, errors: [ error.message ] }, status: :unprocessable_entity
    end

    def apply_filters(query)
      query = query.recently_used.limit(Category::RECENTLY_USED_LIMIT) if ActiveModel::Type::Boolean.new.cast(params[:recent])
      query = query.where.not(id: params[:exclude_id]) if params[:exclude_id].present?
      query = query.roots if ActiveModel::Type::Boolean.new.cast(params[:roots_only])
      query = query.where(parent_id: params[:parent_id]) if params[:parent_id].present?
      query
    end

    def safe_page_param
      [ params[:page].to_i, 1 ].max
    end

    def safe_per_page_param
      params[:per_page].to_i.in?(1..100) ? params[:per_page].to_i : 25
    end
end
