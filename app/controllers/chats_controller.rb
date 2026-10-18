class ChatsController < ApplicationController
  include ActionView::RecordIdentifier

  before_action :set_chat, only: [ :show, :edit, :update, :destroy, :retry ]

  def index
    @chat = nil # override application_controller default behavior of setting @chat to last viewed chat
    @chats = Current.user.chats.order(created_at: :desc)

    respond_to do |format|
      format.html do
        if turbo_frame_request?
          render :index
        else
          render "spa/show", layout: "spa"
        end
      end
      format.json do
        render json: {
          chats: @chats.map { |c| chat_summary_json(c) },
          ai_enabled: Current.user.ai_enabled?,
          ai_available: Current.user.ai_available?,
          default_model: Chat.default_model,
          worker_healthy: worker_healthy?,
          demo_warning: show_demo_warning?
        }
      end
    end
  end

  def show
    set_last_viewed_chat(@chat)

    respond_to do |format|
      format.html do
        if turbo_frame_request?
          render :show
        else
          render "spa/show", layout: "spa"
        end
      end
      format.json do
        render json: chat_detail_json(@chat)
      end
    end
  end

  def new
    @chat = Current.user.chats.new(
      title: t(".default_title", timestamp: Time.current.strftime("%Y-%m-%d %H:%M"))
    )

    respond_to do |format|
      format.html do
        if turbo_frame_request?
          render :new
        else
          render "spa/show", layout: "spa"
        end
      end
      format.json do
        render json: {
          chat: { id: nil, title: @chat.title },
          ai_enabled: Current.user.ai_enabled?,
          ai_available: Current.user.ai_available?,
          default_model: Chat.default_model,
          worker_healthy: worker_healthy?,
          demo_warning: show_demo_warning?
        }
      end
    end
  end

  def create
    @chat = Current.user.chats.start!(chat_params[:content], model: chat_params[:ai_model])
    set_last_viewed_chat(@chat)

    respond_to do |format|
      format.html { redirect_to chat_path(@chat, thinking: true) }
      format.json { render json: chat_detail_json(@chat), status: :created }
    end
  end

  def edit
    respond_to do |format|
      format.html do
        if turbo_frame_request?
          render :edit
        else
          render "spa/show", layout: "spa"
        end
      end
      format.json do
        render json: { chat: { id: @chat.id, title: @chat.title } }
      end
    end
  end

  def update
    if @chat.update(chat_params)
      respond_to do |format|
        format.html { redirect_back_or_to chat_path(@chat), notice: t(".success") }
        format.turbo_stream { render turbo_stream: turbo_stream.replace(dom_id(@chat, :title), partial: "chats/chat_title", locals: { chat: @chat }) }
        format.json { render json: chat_detail_json(@chat) }
      end
    else
      respond_to do |format|
        format.html { redirect_back_or_to chat_path(@chat), alert: @chat.errors.full_messages.to_sentence }
        format.json { render json: { errors: @chat.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  def destroy
    @chat.destroy
    clear_last_viewed_chat

    respond_to do |format|
      format.html { redirect_to chats_path, notice: t(".notice") }
      format.json { render json: { ok: true } }
    end
  end

  def retry
    @chat.retry_last_message!

    respond_to do |format|
      format.html { redirect_to chat_path(@chat) }
      format.json { render json: chat_detail_json(@chat) }
    end
  end

  private
    def set_chat
      @chat = Current.user.chats.find(params[:id])
    end

    def set_last_viewed_chat(chat)
      Current.user.update!(last_viewed_chat: chat)
    end

    def clear_last_viewed_chat
      Current.user.update!(last_viewed_chat: nil)
    end

    def chat_params
      params.require(:chat).permit(:title, :content, :ai_model)
    end

    def chat_summary_json(chat)
      {
        id: chat.id,
        title: chat.title,
        created_at: chat.created_at.iso8601,
        updated_at: chat.updated_at.iso8601,
        messages_count: chat.messages.count,
        error: chat.presentable_error_message
      }
    end

    def chat_detail_json(chat)
      {
        id: chat.id,
        title: chat.title,
        created_at: chat.created_at.iso8601,
        updated_at: chat.updated_at.iso8601,
        debug_mode: chat.debug_mode?,
        error: chat.presentable_error_message,
        technical_error: chat.debug_mode? ? chat.technical_error_message : nil,
        needs_response: chat.needs_assistant_response?,
        worker_healthy: worker_healthy?,
        demo_warning: show_demo_warning?,
        messages: chat.conversation_messages.ordered.map { |m| message_json(m, chat) }
      }
    end

    def message_json(message, chat = nil)
      chat ||= message.chat
      is_assistant = message.is_a?(AssistantMessage)
      {
        id: message.id,
        type: message.type.underscore,
        role: message.role,
        content: message.content,
        pending: is_assistant && message.pending?,
        reasoning: is_assistant && message.reasoning?,
        ai_model: message.ai_model,
        created_at: message.created_at.iso8601,
        tool_calls: (is_assistant && chat&.debug_mode? && message.tool_calls.any?) ? message.tool_calls.map { |tc|
          {
            id: tc.id,
            function_name: tc.function_name,
            function_arguments: tc.function_arguments,
            function_result: tc.function_result
          }
        } : []
      }
    end

    def worker_healthy?
      Rails.application.config.app_mode.self_hosted? && Current.user.ai_enabled? ? BackgroundJobHealth.healthy? : true
    end
end
