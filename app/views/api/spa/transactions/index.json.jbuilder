json.transactions @transactions do |transaction|
  json.partial! "api/spa/transactions/transaction", transaction: transaction
end

json.summary do
  json.count @totals.count
  json.income @totals.income_money.format
  json.expense @totals.expense_money.format
  json.transfer_inflow @totals.transfer_inflow_money.format
  json.transfer_outflow @totals.transfer_outflow_money.format
  json.currency Current.family.currency
end

json.pagination do
  json.page @pagy.page
  json.per_page @pagy.limit
  json.total_count @pagy.count
  json.total_pages @pagy.pages
end
