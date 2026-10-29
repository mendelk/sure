# frozen_string_literal: true

json.partial! "chat", chat: @chat
json.messages @messages, partial: "api/v1/messages/message", as: :message

if @pagy
  json.pagination do
    json.page @pagy.page
    json.per_page @pagy.vars[:items]
    json.total_count @pagy.count
    json.total_pages @pagy.pages
  end
end

if @workspace_metadata
  json.workspace do
    json.merge! @workspace_metadata
    json.debug_mode @chat.debug_mode?
    json.technical_error(@chat.debug_mode? ? @chat.technical_error_message : nil)
    json.needs_response @chat.needs_assistant_response?
    json.messages @workspace_messages, partial: "api/v1/messages/message", as: :message, debug_only: true
  end
end
