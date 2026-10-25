# frozen_string_literal: true

json.partial! "api/v1/transactions/transaction", transaction: @transaction
json.splittable @transaction.splittable?
json.split_annotation_support true

# Split context for the drawer (mirrors the legacy transactions/show
# SPLIT ENTRIES / split-child sections). Children carry their annotations,
# category, transfer account and formatted amount; the parent is a name/date/amount summary.
json.split_children @split_children do |child|
  json.entry_id child.id
  json.transaction_id child.entryable_id
  json.name child.name
  json.notes child.notes
  json.tags child.entryable.tags do |tag|
    json.id tag.id
    json.name tag.name
    json.color tag.color
  end
  json.amount child.amount_money.format
  json.category_id child.entryable.try(:category_id)
  json.category_name child.entryable.try(:category)&.name
  transfer = child.entryable.transfer
  other_transaction = if transfer&.inflow_transaction_id == child.entryable_id
    transfer.outflow_transaction
  else
    transfer&.inflow_transaction
  end
  json.transfer_account_id other_transaction&.entry&.account_id
end

if @split_parent
  json.split_parent do
    json.entry_id @split_parent.id
    json.transaction_id @split_parent.entryable_id
    json.name @split_parent.name
    json.date @split_parent.date.iso8601
    json.amount @split_parent.amount_money.format
  end
else
  json.split_parent nil
end

json.recurring_exists @recurring_exists
json.protected_from_sync @protected_from_sync

# Bill allocations (preview-gated server-side; empty without the flag).
json.bill_allocations @bill_allocations do |allocation|
  occurrence = allocation.recurring_occurrence
  json.allocation_id allocation.id
  json.bill_name occurrence.recurring_transaction.display_name
  json.amount allocation.allocated_amount_money.format
  json.due_on occurrence.due_on.iso8601
  json.unreviewed allocation.allocation_suggested?
end

# Potential-duplicate suggestion for the drawer's duplicate alert.
if @potential_duplicate
  json.potential_duplicate do
    json.entry_id @potential_duplicate.id
    json.name @potential_duplicate.name
    json.date @potential_duplicate.date.iso8601
    json.account_name @potential_duplicate.account.name
    json.amount @potential_duplicate.amount_money.format
  end
else
  json.potential_duplicate nil
end

json.attachments @transaction.attachments do |attachment|
  json.id attachment.id
  json.filename attachment.filename.to_s
  json.byte_size attachment.byte_size
  json.content_type attachment.content_type
  json.created_at attachment.created_at.iso8601
end
