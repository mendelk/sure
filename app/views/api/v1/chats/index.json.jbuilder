# frozen_string_literal: true

json.chats @chats, partial: "api/v1/chats/summary", as: :chat
json.pagination do
  json.page @pagy.page
  json.per_page @pagy.vars[:items]
  json.total_count @pagy.count
  json.total_pages @pagy.pages
end

if @workspace_metadata
  json.workspace do
    json.merge! @workspace_metadata
    json.chats @workspace_chats, partial: "api/v1/chats/summary", as: :chat
  end
end
