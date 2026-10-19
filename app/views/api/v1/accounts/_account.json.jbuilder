# frozen_string_literal: true

balance_money = account.balance_money
cash_balance_money = account.cash_balance_money

json.id account.id
json.name account.name
json.balance balance_money.format
json.balance_cents((balance_money.amount * balance_money.currency.minor_unit_conversion).round(0).to_i)
json.cash_balance cash_balance_money.format
json.cash_balance_cents((cash_balance_money.amount * cash_balance_money.currency.minor_unit_conversion).round(0).to_i)
json.currency account.currency
json.classification account.classification
json.account_type account.accountable_type&.underscore
json.subtype account.subtype
json.status account.status
json.permissions account_permissions(account)
json.institution_name account.institution_name
json.institution_domain account.institution_domain
json.notes account.notes
json.exclude_from_reports account.exclude_from_reports
json.enable_category_matcher account.enable_category_matcher
json.created_at account.created_at.iso8601
json.updated_at account.updated_at.iso8601

accountable = account.accountable
json.accountable do
  json.subtype accountable.try(:subtype)
  case accountable
  when Crypto
    json.tax_treatment accountable.tax_treatment
  when Property
    json.year_built accountable.year_built
    json.area_unit accountable.area_unit
    json.area_value accountable.area_value
  when Vehicle
    json.make accountable.make
    json.model accountable.model
    json.year accountable.year
    json.mileage_value accountable.mileage_value
    json.mileage_unit accountable.mileage_unit
  when CreditCard
    json.available_credit accountable.available_credit&.to_s
    json.minimum_payment accountable.minimum_payment&.to_s
    json.apr accountable.apr&.to_s
    json.annual_fee accountable.annual_fee&.to_s
    json.expiration_date accountable.expiration_date&.iso8601
    schedule = accountable.payment_schedule
    json.payment_due_day accountable.payment_due_day
    json.estimated_payment_due_day schedule.inferred_due_day
    json.payment_due_day_source schedule.due_day_source
    json.statement_gap_days CreditCard::PaymentSchedule::STATEMENT_GAP_DAYS
  when Loan
    json.rate_type accountable.rate_type
    json.interest_rate accountable.interest_rate&.to_s
    json.term_months accountable.term_months
    json.initial_balance accountable.initial_balance&.to_s
    json.start_date accountable.start_date&.iso8601
    json.down_payment accountable.down_payment&.to_s
    json.insurance_rate accountable.insurance_rate&.to_s
    json.insurance_rate_type accountable.insurance_rate_type
    json.rate_changes accountable.rate_change_rows
  end
end

address = accountable.try(:address) if accountable.is_a?(Property)
if address.present?
  json.address do
    json.line1 address.line1
    json.line2 address.line2
    json.locality address.locality
    json.region address.region
    json.country address.country
    json.postal_code address.postal_code
    json.county address.county
  end
else
  json.address nil
end
