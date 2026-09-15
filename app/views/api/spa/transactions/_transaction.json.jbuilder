entry = transaction.entry
amount_money = entry.amount_money
conversion_factor = amount_money.currency.minor_unit_conversion
amount_cents = (amount_money.amount * conversion_factor).round(0).to_i.abs
display_amount = -amount_money

json.id transaction.id
json.entry_id entry.id
json.date entry.date.iso8601
json.amount display_amount.format
json.amount_cents amount_cents
json.signed_amount_cents(entry.classification == "income" ? amount_cents : -amount_cents)
json.currency entry.currency
json.name entry.name
json.notes entry.notes
json.classification entry.classification
json.pending transaction.pending?
json.excluded entry.excluded?
json.detail_path entry_path(entry)

json.account do
  json.id entry.account.id
  json.name entry.account.name
  json.account_type entry.account.accountable_type.underscore
  json.path account_path(entry.account, tab: "transactions")
end

if transaction.category.present?
  json.category do
    json.id transaction.category.id
    json.name transaction.category.name
    json.color transaction.category.color
    json.icon transaction.category.lucide_icon
  end
else
  json.category nil
end

if transaction.merchant.present?
  json.merchant do
    json.id transaction.merchant.id
    json.name transaction.merchant.name
  end
else
  json.merchant nil
end

json.tags transaction.tags do |tag|
  json.id tag.id
  json.name tag.name
  json.color tag.color
end
