# frozen_string_literal: true

entry = transaction.entry

json.id transaction.id
json.entry_id entry.id
json.date entry.date
json.amount entry.amount_money.format
json.amount_cents money_to_minor_units(entry.amount_money)
json.currency entry.currency
json.name entry.name
json.kind transaction.kind

json.account do
  json.id entry.account.id
  json.name entry.account.name
  json.account_type entry.account.accountable_type.underscore
  json.logo_url entry.account.logo_url if entry.account.logo_url.present?
  json.color entry.account.accountable&.color if entry.account.accountable&.respond_to?(:color)
end
