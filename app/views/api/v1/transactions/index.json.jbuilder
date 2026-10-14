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

json.summary do
  json.count @totals.count
  json.income @totals.income_money.format
  json.expense @totals.expense_money.format
  json.transfer_inflow @totals.transfer_inflow_money.format
  json.transfer_outflow @totals.transfer_outflow_money.format
  json.currency @totals.income_money.currency.iso_code
end

json.pagination do
  json.page @pagy.page
  json.per_page @per_page
  json.total_count @pagy.count
  json.total_pages @pagy.pages
end
