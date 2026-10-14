# frozen_string_literal: true

json.transactions @transactions do |transaction|
  json.partial! "transaction", transaction: transaction
end

# Split parent entries for grouped headers (keyed by parent entry id).
# Children carry parent_entry_id; the SPA groups them under this header.
json.split_parents @split_parents do |parent_id, parent|
  json.entry_id parent_id
  json.transaction_id parent.entryable_id
  json.name parent.name
  json.amount parent.amount_money.format
  json.account_name parent.account.name
end

json.pagination do
  json.page @pagy.page
  json.per_page @per_page
  json.total_count @pagy.count
  json.total_pages @pagy.pages
end
