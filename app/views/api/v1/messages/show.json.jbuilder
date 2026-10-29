# frozen_string_literal: true

json.partial! "api/v1/messages/message", message: @message
json.chat_id @message.chat_id

# AI responses are processed asynchronously by UserMessage's existing callback.
if @message.is_a?(UserMessage)
  json.ai_response_status "pending"
  json.ai_response_message "AI response is being generated"
end
