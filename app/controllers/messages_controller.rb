class MessagesController < ApplicationController
  guard_feature unless: -> { Current.user.ai_enabled? }

  before_action :set_chat

  def create
    @message = UserMessage.new(
      chat: @chat,
      content: message_params[:content],
      ai_model: message_params[:ai_model].presence || Chat.default_model
    )

    if @message.save
      respond_to do |format|
        format.html { redirect_to chat_path(@chat, thinking: true) }
        format.json { render json: message_json(@message), status: :created }
      end
    else
      respond_to do |format|
        format.html { redirect_to chat_path(@chat), alert: @message.errors.full_messages.to_sentence }
        format.json { render json: { errors: @message.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  rescue ActiveRecord::InvalidForeignKey
    respond_to do |format|
      format.html { redirect_to chats_path, alert: t(".chat_not_found") }
      format.json { render json: { errors: [ t(".chat_not_found") ] }, status: :not_found }
    end
  end

  # Called by the chat watchdog when an assistant "Thinking…" bubble has waited
  # too long for a response that never arrived. Idempotent and scoped to the
  # current user's chat.
  def report_timeout
    message = @chat.messages.find(params[:id])

    if @chat.handle_undelivered_response!(message)
      head :ok
    else
      # Declined — the message has not waited past the server's own floor yet,
      # which usually means the client's clock runs ahead of ours and it reported
      # early. This must not be a 2xx: the watchdog only stops retrying a URL once
      # it sees one, so answering OK here would strand the bubble spinning forever.
      head :conflict
    end
  rescue ActiveRecord::RecordNotFound
    head :not_found
  end

  private
    def set_chat
      @chat = Current.user.chats.find(params[:chat_id])
    end

    def message_params
      params.require(:message).permit(:content, :ai_model)
    end

    def message_json(message)
      {
        id: message.id,
        type: message.type.underscore,
        role: message.role,
        content: message.content,
        pending: false,
        reasoning: false,
        ai_model: message.ai_model,
        created_at: message.created_at.iso8601,
        tool_calls: []
      }
    end
end
