class TagsController < ApplicationController
  before_action :set_tag, only: %i[edit update destroy]

  def index
    @tags = Current.family.tags.alphabetically

    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json do
        counts = Tagging.where(tag_id: @tags.map(&:id), taggable_type: "Transaction").group(:tag_id).count
        render json: {
          tags: @tags.map { |tag| tag_row_json(tag, transactions_count: counts[tag.id] || 0) },
          colors: Tag::COLORS
        }
      end
    end
  end

  def new
    @tag = Current.family.tags.new color: Tag::COLORS.sample

    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json { render json: { tag: { id: nil, name: @tag.name, color: @tag.color }, colors: Tag::COLORS } }
    end
  end

  def create
    @tag = Current.family.tags.new(tag_params)

    if @tag.save
      respond_to do |format|
        format.html { redirect_to tags_path, notice: t(".created") }
        format.json { render json: tag_json(@tag), status: :created }
      end
    else
      respond_to do |format|
        format.html { redirect_to tags_path, alert: t(".error", error: @tag.errors.full_messages.to_sentence) }
        format.json { render json: { errors: @tag.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  def edit
    respond_to do |format|
      format.html { render "spa/show", layout: "spa" }
      format.json { render json: { tag: tag_row_json(@tag), colors: Tag::COLORS } }
    end
  end

  def update
    respond_to do |format|
      format.html do
        @tag.update!(tag_params)
        redirect_to tags_path, notice: t(".updated")
      end
      format.json do
        if @tag.update(tag_params)
          render json: tag_row_json(@tag)
        else
          render json: { errors: @tag.errors.full_messages }, status: :unprocessable_entity
        end
      end
    end
  end

  def destroy
    @tag.destroy!

    respond_to do |format|
      format.html { redirect_to tags_path, notice: t(".deleted") }
      format.json { render json: { ok: true } }
    end
  end

  def destroy_all
    Current.family.tags.destroy_all

    respond_to do |format|
      format.html { redirect_back_or_to tags_path, notice: t(".all_deleted") }
      format.json { render json: { ok: true } }
    end
  end

  private

    def set_tag
      @tag = Current.family.tags.find(params[:id])
    end

    def tag_params
      params.require(:tag).permit(:name, :color)
    end

    def tag_row_json(tag, transactions_count: nil)
      transactions_count ||= Tagging.where(tag_id: tag.id, taggable_type: "Transaction").count
      tag.as_json(only: %i[id name color]).merge("transactions_count" => transactions_count)
    end

    def tag_json(tag)
      tag_row_json(tag).merge(
        html: render_to_string(
          partial: "DS/tag_select/option",
          formats: [ :html ],
          locals: { tag: tag, selected: true, view_helpers: helpers }
        )
      )
    end
end
