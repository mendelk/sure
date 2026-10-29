# frozen_string_literal: true

class Api::V1::MessagesController < Api::V1::BaseController
  before_action :require_ai_enabled
  before_action :ensure_write_scope
  before_action :set_chat

  def create
    @message = @chat.messages.build(
      content: message_params[:content],
      type: "UserMessage",
      ai_model: message_params[:model].presence || Chat.default_model
    )

    if @message.save
      render :show, status: :created
    else
      render json: { error: "Failed to create message", details: @message.errors.full_messages }, status: :unprocessable_entity
    end
  rescue ActiveRecord::InvalidForeignKey
    render json: { error: "Chat not found" }, status: :not_found
  end

  def retry
    @chat.with_lock do
      last_message = @chat.conversation_messages.ordered.last
      if last_message && !last_message.pending? && @chat.conversation_messages.exists?(type: "UserMessage")
        @chat.retry_last_message!
        pending = @chat.messages.ordered.last
        render json: { message: "Retry initiated", message_id: pending.id }, status: :accepted
      else
        render json: { error: "No user message available to retry, or response is already pending" }, status: :unprocessable_entity
      end
    end
  end

  # The watchdog retries non-2xx responses: an early report must not acknowledge
  # a timeout or a healthy, slow response would be left spinning forever.
  def report_timeout
    message = @chat.messages.find(params[:id])
    if @chat.handle_undelivered_response!(message)
      head :no_content
    else
      render json: { error: "Response is not eligible for timeout" }, status: :conflict
    end
  end

  private

    def ensure_write_scope
      authorize_scope!(:write)
    end

    def set_chat
      @chat = current_resource_owner.chats.find(params[:chat_id])
    end

    def message_params
      params.permit(:content, :model)
    end
end
