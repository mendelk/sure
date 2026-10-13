class Tag::DeletionsController < ApplicationController
  before_action :set_tag
  before_action :set_replacement_tag, only: :create

  def new
    render "spa/show", layout: "spa"
  end

  def create
    @tag.replace_and_destroy! @replacement_tag

    respond_to do |format|
      format.html { redirect_back_or_to tags_path, notice: t(".deleted") }
      format.json { render json: { ok: true } }
    end
  rescue ActiveRecord::RecordInvalid => e
    respond_to do |format|
      format.html { raise }
      format.json { render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity }
    end
  end

  private

    def set_tag
      @tag = Current.family.tags.find(params[:tag_id])
    end

    def set_replacement_tag
      if params[:replacement_tag_id].present?
        @replacement_tag = Current.family.tags.find(params[:replacement_tag_id])
      end
    end
end
