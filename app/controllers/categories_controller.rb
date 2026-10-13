class CategoriesController < ApplicationController
  before_action :set_category, only: %i[edit update destroy]
  before_action :set_categories, only: %i[update edit]
  before_action :set_transaction, only: :create

  def index
    @categories = Current.family.categories.includes(:parent, :subcategories).alphabetically_by_hierarchy.to_a
    @category_groups = Category::Group.for(@categories)
    @category_ids_with_transactions = Category.ids_with_transactions(
      family: Current.family,
      category_ids: @categories.map(&:id)
    )

    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json do
        render json: {
          groups: @category_groups.map do |group|
            {
              root: category_row_json(group.category),
              subcategories: group.subcategories.map { |subcategory| category_row_json(subcategory) }
            }
          end,
          count: @categories.size,
          has_transactions_by_id: @category_ids_with_transactions,
          can_bootstrap: true,
          empty: @categories.empty?,
          colors: Category::COLORS,
          icons: Category.icon_codes
        }
      end
    end
  end

  def new
    @category = Current.family.categories.new color: Category::COLORS.sample
    set_categories

    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json do
        render json: {
          category: category_form_json(@category),
          colors: Category::COLORS,
          icons: Category.icon_codes,
          parent_options: parent_options_json(@category)
        }
      end
    end
  end

  def merge
    @categories = Current.family.categories.alphabetically_by_hierarchy

    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json do
        render json: {
          categories: @categories.map { |category| category_row_json(category) }
        }
      end
    end
  end

  def create
    @category = Current.family.categories.new(category_params)

    if @category.save
      if @transaction
        @transaction.update(category_id: @category.id)
        @transaction.record_category_usage!
      end

      redirect_target_url = request.referer || categories_path

      respond_to do |format|
        format.html { redirect_back_or_to categories_path, notice: t(".success") }

        format.turbo_stream do
          flash[:notice] = t(".success")
          render turbo_stream: turbo_stream.action(:redirect, redirect_target_url)
        end

        format.json { render json: category_json(@category), status: :created }
      end
    else
      respond_to do |format|
        format.html { redirect_to categories_path, alert: @category.errors.full_messages.to_sentence, status: :see_other }

        format.turbo_stream do
          redirect_to categories_path, alert: @category.errors.full_messages.to_sentence
        end

        format.json do
          render json: { errors: @category.errors.full_messages },
                 status: :unprocessable_entity
        end
      end
    end
  end

  def edit
    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json do
        render json: {
          category: category_form_json(@category),
          colors: Category::COLORS,
          icons: Category.icon_codes,
          parent_options: parent_options_json(@category)
        }
      end
    end
  end

  def update
    if @category.update(category_params)
      flash[:notice] = t(".success")

      redirect_target_url = request.referer || categories_path
      respond_to do |format|
        format.html { redirect_back_or_to categories_path, notice: t(".success") }
        format.turbo_stream { render turbo_stream: turbo_stream.action(:redirect, redirect_target_url) }
        format.json { render json: { category: category_row_json(@category) } }
      end
    else
      respond_to do |format|
        format.html { redirect_to categories_path, alert: @category.errors.full_messages.to_sentence, status: :see_other }
        format.turbo_stream { redirect_to categories_path, alert: @category.errors.full_messages.to_sentence }
        format.json do
          render json: { errors: @category.errors.full_messages },
                 status: :unprocessable_entity
        end
      end
    end
  end

  def destroy
    @category.destroy
    destroyed = @category.destroyed?

    respond_to do |format|
      format.html { redirect_back_or_to categories_path, notice: t(".success") }
      format.json do
        if destroyed
          render json: { ok: true }
        else
          render json: { errors: @category.errors.full_messages.presence || [ t(".destroy_failed", default: "Could not delete category") ] },
                 status: :unprocessable_entity
        end
      end
    end
  end

  def destroy_all
    Current.family.categories.destroy_all

    respond_to do |format|
      format.html { redirect_back_or_to categories_path, notice: t(".success") }
      format.json { render json: { ok: true } }
    end
  end

  def bootstrap
    Current.family.categories.bootstrap!

    respond_to do |format|
      format.html { redirect_back_or_to categories_path, notice: t(".success") }
      format.json { render json: { ok: true } }
    end
  end

  def perform_merge
    permitted_params = category_merge_params

    if permitted_params[:target_id].present? && Array(permitted_params[:source_ids]).include?(permitted_params[:target_id])
      message = t(".target_selected_as_source")
      return respond_to do |format|
        format.html { redirect_to merge_categories_path, alert: message }
        format.json { render json: { errors: [ message ] }, status: :unprocessable_entity }
      end
    end

    target = Current.family.categories.find_by(id: permitted_params[:target_id])
    unless target
      message = t(".target_not_found")
      return respond_to do |format|
        format.html { redirect_to merge_categories_path, alert: message }
        format.json { render json: { errors: [ message ] }, status: :unprocessable_entity }
      end
    end

    sources = Current.family.categories.where(id: permitted_params[:source_ids])
    unless sources.any?
      message = t(".invalid_categories")
      return respond_to do |format|
        format.html { redirect_to merge_categories_path, alert: message }
        format.json { render json: { errors: [ message ] }, status: :unprocessable_entity }
      end
    end

    merger = Category::Merger.new(family: Current.family, target_category: target, source_categories: sources)
    unless merger.merge!
      message = t(".no_categories_selected")
      return respond_to do |format|
        format.html { redirect_to merge_categories_path, alert: message }
        format.json { render json: { errors: [ message ] }, status: :unprocessable_entity }
      end
    end

    respond_to do |format|
      format.html { redirect_to categories_path, notice: t(".success", count: merger.merged_count) }
      format.json { render json: { ok: true, merged_count: merger.merged_count } }
    end
  rescue Category::Merger::UnauthorizedCategoryError => e
    respond_to do |format|
      format.html { redirect_to merge_categories_path, alert: e.message }
      format.json { render json: { errors: [ e.message ] }, status: :unprocessable_entity }
    end
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotDestroyed => e
    message = record_error_message(e)
    respond_to do |format|
      format.html { redirect_to merge_categories_path, alert: message }
      format.json { render json: { errors: [ message ] }, status: :unprocessable_entity }
    end
  end

  private
    def set_category
      @category = Current.family.categories.find(params[:id])
    end

    def set_categories
      @categories = unless @category.parent?
        Current.family.categories.alphabetically.roots.where.not(id: @category.id)
      else
        []
      end
    end

    def set_transaction
      if params[:transaction_id].present?
        @transaction = Current.family.transactions.find(params[:transaction_id])
      end
    end

    def category_params
      params.require(:category).permit(:name, :color, :parent_id, :lucide_icon)
    end

    def category_merge_params
      params.permit(:target_id, source_ids: [])
    end

    def category_json(category)
      category.as_json(only: %i[id name color]).merge(
        html: render_to_string(
          partial: "DS/category_select/option",
          formats: [ :html ],
          locals: {
            category: category,
            selected: true,
            view_helpers: helpers
          }
        )
      )
    end

    def category_row_json(category)
      {
        id: category.id,
        name: category.name,
        display_name: category.display_name,
        display_name_with_parent: category.display_name_with_parent,
        color: category.color,
        lucide_icon: category.lucide_icon,
        parent_id: category.parent_id,
        has_parent: category.subcategory?
      }
    end

    def category_form_json(category)
      category_row_json(category).merge(
        is_parent: category.parent?,
        can_assign_parent: !category.parent?
      )
    end

    # Parent candidates for the new/edit form: roots only (depth rule mirrors
    # set_categories — subcategories and parents-of-children get no select).
    def parent_options_json(category)
      options = if category.parent?
        []
      elsif category.persisted?
        descendant_ids = descendant_ids_for(category)
        Current.family.categories.alphabetically.roots
          .where.not(id: [ category.id ] + descendant_ids)
      else
        Current.family.categories.alphabetically.roots
      end

      options.map { |parent| { id: parent.id, display_name: parent.display_name } }
    end

    def descendant_ids_for(category)
      ids = []
      frontier = Current.family.categories.where(parent_id: category.id).pluck(:id)
      until frontier.empty?
        ids.concat(frontier)
        frontier = Current.family.categories.where(parent_id: frontier).pluck(:id)
      end
      ids
    end

    def record_error_message(error)
      record = error.respond_to?(:record) ? error.record : nil
      record&.errors&.full_messages&.to_sentence.presence || error.message
    end
end
