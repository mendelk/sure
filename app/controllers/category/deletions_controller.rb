class Category::DeletionsController < ApplicationController
  before_action :set_category
  before_action :set_replacement_category, only: :create

  def new
    render "spa/show", layout: "spa"
  end

  def create
    @category.replace_and_destroy! @replacement_category

    respond_to do |format|
      format.html { redirect_back_or_to transactions_path, notice: t(".success") }
      format.json { render json: { ok: true } }
    end
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotDestroyed => e
    record = e.respond_to?(:record) ? e.record : nil
    message = record&.errors&.full_messages&.to_sentence.presence || e.message
    respond_to do |format|
      format.html { redirect_back_or_to transactions_path, alert: message }
      format.json { render json: { errors: [ message ] }, status: :unprocessable_entity }
    end
  end

  private
    def set_category
      @category = Current.family.categories.find(params[:category_id])
    end

    def set_replacement_category
      if params[:replacement_category_id].present?
        @replacement_category = Current.family.categories.find(params[:replacement_category_id])
      end
    end
end
