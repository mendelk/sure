# frozen_string_literal: true

json.id transfer.id
json.status transfer.status
json.date transfer.date
json.amount transfer.amount_abs.format
json.amount_cents money_to_minor_units(transfer.amount_abs)
json.currency transfer.inflow_transaction.entry.currency
json.transfer_type transfer.transfer_type
json.notes transfer.notes
json.name transfer.name
json.payment transfer.payment?
json.categorizable transfer.categorizable?
json.permissions account_permissions(transfer.outflow_transaction.entry.account).slice(:can_edit)
json.source_fee_amount transfer.derived_source_fee_amount.to_s("F")
json.source_fee_currency transfer.from_account&.currency
json.destination_fee_amount transfer.derived_destination_fee_amount.to_s("F")
json.destination_fee_currency transfer.to_account&.currency
if transfer.outflow_transaction&.category.present?
  json.category do
    json.id transfer.outflow_transaction.category.id
    json.name transfer.outflow_transaction.category.name
    json.color transfer.outflow_transaction.category.color
    json.icon transfer.outflow_transaction.category.lucide_icon
  end
else
  json.category nil
end

json.tags(transfer.outflow_transaction&.tags || []) do |tag|
  json.id tag.id
  json.name tag.name
  json.color tag.color
end

endpoint_accounts = [ transfer.from_account, transfer.to_account ].compact
json.can_mark_as_recurring(
  !transfer.from_account&.family&.recurring_transactions_disabled? &&
  endpoint_accounts.size == 2 &&
  endpoint_accounts.all? { |account| account_permissions(account)[:can_edit] }
)

source_account = transfer.from_account
destination_account = transfer.to_account
json.recurring_exists(
  if source_account && destination_account
    RecurringTransaction.exists?(
      account_id: source_account.id,
      destination_account_id: destination_account.id,
      amount: transfer.outflow_transaction.entry.amount,
      currency: transfer.outflow_transaction.entry.currency
    )
  else
    false
  end
)

json.inflow_transaction do
  json.partial! "api/v1/transfers/transaction_side", transaction: transfer.inflow_transaction
end

json.outflow_transaction do
  json.partial! "api/v1/transfers/transaction_side", transaction: transfer.outflow_transaction
end

json.created_at transfer.created_at.iso8601
json.updated_at transfer.updated_at.iso8601
