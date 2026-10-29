# frozen_string_literal: true

json.partial! "api/v1/chats/chat", chat: chat
json.last_message_at chat.messages.max_by(&:created_at)&.created_at&.iso8601
json.message_count chat.messages.size
