# frozen_string_literal: true

class Api::V1::ChatsController < Api::V1::BaseController
  include Pagy::Backend

  before_action :require_ai_enabled, except: [ :index, :form_options ]
  before_action :ensure_read_scope, only: [ :index, :show, :form_options ]
  before_action :ensure_write_scope, only: [ :create, :update, :destroy, :mark_viewed ]
  before_action :set_chat, only: [ :show, :update, :destroy, :mark_viewed ]
  before_action :set_workspace_metadata, if: :workspace_requested?

  def index
    return require_ai_enabled unless current_resource_owner.ai_enabled? || workspace_requested?

    chats = current_resource_owner.ai_enabled? ? current_resource_owner.chats.ordered : current_resource_owner.chats.none
    @pagy, @chats = pagy(chats, items: 20)
    @chats = @chats.includes(:messages)
    @workspace_chats = chats.includes(:messages) if workspace_requested?
  end

  def show
    prepare_detail
  end

  def form_options
    render json: workspace_metadata.merge(
      chat: { id: nil, title: I18n.t("chats.new.default_title", timestamp: Time.current.strftime("%Y-%m-%d %H:%M")) }
    )
  end

  def create
    attributes = chat_params
    @chat = current_resource_owner.chats.build(title: attributes[:title])
    @chat.title = Chat.generate_title(attributes[:message]) if !attributes.key?(:title) && attributes[:message].present?
    if attributes[:message].present?
      @chat.messages.build(
        content: attributes[:message], type: "UserMessage",
        ai_model: attributes[:model].presence || Chat.default_model
      )
    end

    if @chat.save
      current_resource_owner.update!(last_viewed_chat: @chat)
      prepare_detail
      render :show, status: :created
    else
      render json: { error: "Failed to create chat", details: @chat.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if @chat.update(update_chat_params)
      prepare_detail
      render :show
    else
      render json: { error: "Failed to update chat", details: @chat.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @chat.destroy!
    current_resource_owner.update!(last_viewed_chat: nil)
    head :no_content
  end

  def mark_viewed
    if current_resource_owner.update(last_viewed_chat: @chat)
      head :no_content
    else
      render json: { errors: current_resource_owner.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

    def ensure_read_scope
      authorize_scope!(:read)
    end

    def ensure_write_scope
      authorize_scope!(:write)
    end

    def set_chat
      @chat = current_resource_owner.chats.find(params[:id])
    end

    def chat_params
      params.permit(:title, :message, :model)
    end

    def update_chat_params
      params.permit(:title)
    end

    def workspace_requested?
      params[:include].to_s.split(",").include?("workspace")
    end

    def set_workspace_metadata
      @workspace_metadata = workspace_metadata
    end

    def workspace_metadata
      {
        ai_enabled: current_resource_owner.ai_enabled?,
        ai_available: current_resource_owner.ai_available?,
        default_model: Chat.default_model,
        worker_healthy: !Rails.application.config.app_mode.self_hosted? || !current_resource_owner.ai_enabled? || BackgroundJobHealth.healthy?,
        demo_warning: show_demo_warning?,
        response_timeout_ms: Chat.response_timeout_ms
      }
    end

    def prepare_detail
      @pagy, @messages = pagy(@chat.messages.ordered.includes(:tool_calls), items: 50)
      @workspace_messages = @chat.conversation_messages.ordered.includes(:tool_calls) if workspace_requested?
    end
end
