# frozen_string_literal: true

module Api
  module V1
    class TagsController < BaseController
      before_action -> { authorize_scope!(:read) }, only: %i[index show form_options]
      before_action -> { authorize_scope!(:read_write) }, except: %i[index show form_options]
      before_action :set_tag, only: %i[show update destroy replacement]

      rescue_from ActiveRecord::RecordInvalid, ActiveRecord::RecordNotDestroyed, with: :render_record_error

      def index
        tags = family.tags.alphabetically.to_a
        if params[:include].to_s.split(",").include?("workspace")
          counts = visible_transaction_counts(tags.map(&:id))
          render json: { tags: tags.map { |tag| tag_json(tag) }, workspace: { tags: tags.map { |tag| tag_json(tag).merge(transactions_count: counts[tag.id] || 0) }, colors: Tag::COLORS } }
        else
          render json: tags.map { |tag| tag_json(tag) }
        end
      end

      def show
        render json: tag_json(@tag)
      end

      def form_options
        tag = params[:id].present? ? family.tags.find(params[:id]) : family.tags.new(color: Tag::COLORS.sample)
        render json: { tag: { id: tag.id, name: tag.name, color: tag.color }, colors: Tag::COLORS }
      end

      def create
        tag = family.tags.new(tag_params)
        tag.color ||= Tag::COLORS.sample
        tag.save!
        render json: tag_json(tag).merge(transactions_count: 0), status: :created
      end

      def update
        @tag.update!(tag_params)
        render json: tag_json(@tag).merge(transactions_count: visible_transaction_counts([ @tag.id ])[@tag.id] || 0)
      end
      def destroy
        @tag.destroy!
        head :no_content
      end
      def replacement
        replacement = family.tags.find(params[:replacement_tag_id]) if params[:replacement_tag_id].present?
        @tag.replace_and_destroy!(replacement)
        render json: { ok: true }
      end

      def destroy_all
        Tag.transaction { family.tags.each(&:destroy!) }
        render json: { ok: true }
      end

      private
        def family
          current_resource_owner.family
        end

        def set_tag
          @tag = family.tags.find(params[:id])
        end

        def tag_params
          params.require(:tag).permit(:name, :color)
        end

        def visible_transaction_counts(tag_ids)
          transactions = family.transactions.joins(:entry)
            .where(entries: { account_id: family.accounts.accessible_by(current_resource_owner).select(:id) })
          Tagging.where(tag_id: tag_ids, taggable_type: "Transaction", taggable_id: transactions.select(:id)).group(:tag_id).count
        end

        def tag_json(tag)
          { id: tag.id, name: tag.name, color: tag.color, created_at: tag.created_at, updated_at: tag.updated_at }
        end

        def render_record_error(error)
          render json: { error: "unprocessable_entity", message: error.record.errors.full_messages.to_sentence, errors: error.record.errors.full_messages }, status: :unprocessable_entity
        end
    end
  end
end
