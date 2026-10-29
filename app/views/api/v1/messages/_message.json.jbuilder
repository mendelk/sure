# frozen_string_literal: true

json.id message.id
json.type message.type.underscore
json.role message.role
json.content message.content
json.model message.ai_model
json.created_at message.created_at.iso8601
json.updated_at message.updated_at.iso8601
json.pending message.is_a?(AssistantMessage) && message.pending?
json.reasoning message.is_a?(AssistantMessage) && message.reasoning?
json.status message.status
json.tool_calls(message.is_a?(AssistantMessage) && (!local_assigns[:debug_only] || message.chat.debug_mode?) ? message.tool_calls : []) do |tool_call|
  json.id tool_call.id
  json.function_name tool_call.function_name
  json.function_arguments tool_call.function_arguments
  json.function_result tool_call.function_result
  json.created_at tool_call.created_at.iso8601
end
