# frozen_string_literal: true

json.parent_transaction_id @entry.transaction.id
json.splits @children do |child|
  json.partial! "api/v1/transactions/transaction", transaction: child.transaction
end
