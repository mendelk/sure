# frozen_string_literal: true

# Option lists for the SPA account picker and manual-account create/edit forms.
# Property appears in the picker; its wizard serves its own subtypes and
# address/area data. Labels are translated server-side.
class Api::V1::AccountFormOptionsController < Api::V1::BaseController
  # Types handled by the generic account form, excluding the property wizard.
  ACCOUNT_TYPES = %w[depository investment crypto vehicle other_asset credit_card loan other_liability].freeze

  ACCOUNTABLE_CLASS = {
    "depository" => Depository,
    "investment" => Investment,
    "crypto" => Crypto,
    "property" => Property,
    "vehicle" => Vehicle,
    "other_asset" => OtherAsset,
    "credit_card" => CreditCard,
    "loan" => Loan,
    "other_liability" => OtherLiability
  }.freeze

  before_action :ensure_read_scope, only: :show

  # GET /api/v1/account_form_options
  def show
    render_json({
      account_types: account_type_options,
      subtypes: subtype_options,
      tax_treatments: tax_treatment_options,
      loan_rate_types: loan_rate_type_options,
      loan_insurance_rate_types: loan_insurance_rate_type_options,
      mileage_units: mileage_unit_options,
      currencies: currency_options,
      default_currency: default_currency_code
    })
  end

  private
    def account_type_options
      ACCOUNTABLE_CLASS.map do |type, klass|
        { value: type, label: klass.singular_display_name, classification: klass.classification, icon: klass.icon, color: klass.color }
      end
    end

    def subtype_options
      ACCOUNT_TYPES.index_with do |type|
        type == "investment" ? investment_subtype_options : simple_subtype_options(ACCOUNTABLE_CLASS.fetch(type))
      end
    end

    def simple_subtype_options(klass)
      klass::SUBTYPES.keys.map do |subtype|
        {
          value: subtype,
          label: klass.long_subtype_label_for(subtype),
          short_label: klass.short_subtype_label_for(subtype),
          group: nil
        }
      end
    end

    # Flattened (not nested) so the payload shape matches every other type:
    # the region label rides along as `group` and the SPA groups client-side.
    # Reuses the native region ordering, prioritizing the caller's currency
    # region when `?currency=` is given.
    def investment_subtype_options
      Investment.subtypes_grouped_for_select(currency: params[:currency]).flat_map do |group_label, pairs|
        pairs.map do |label, value|
          {
            value: value,
            label: label,
            short_label: Investment.short_subtype_label_for(value),
            group: group_label
          }
        end
      end
    end

    def tax_treatment_options
      Crypto.tax_treatments.keys.map do |treatment|
        {
          value: treatment,
          label: I18n.t("accounts.tax_treatments.#{treatment}"),
          description: I18n.t("accounts.tax_treatment_descriptions.#{treatment}", default: nil)
        }
      end
    end

    # Mirrors LoansHelper's form vocabularies so the SPA offers the same
    # choices as the native loan form.
    def loan_rate_type_options
      [
        { value: Loan::FIXED_RATE_TYPE, label: I18n.t("loans.form.rate_type_fixed") },
        { value: "variable", label: I18n.t("loans.form.rate_type_variable") },
        { value: "adjustable", label: I18n.t("loans.form.rate_type_adjustable") }
      ]
    end

    def loan_insurance_rate_type_options
      [
        { value: Loan::Insurance::LEVEL_TERM, label: I18n.t("loans.form.insurance_rate_type_level_term") },
        { value: Loan::Insurance::DECREASING_LIFE, label: I18n.t("loans.form.insurance_rate_type_decreasing_life") }
      ]
    end

    # Mirrors the native vehicle form's unit select.
    def mileage_unit_options
      [
        { value: "mi", label: I18n.t("vehicles.form.mileage_unit_miles") },
        { value: "km", label: I18n.t("vehicles.form.mileage_unit_kilometers") }
      ]
    end

    # Same list the native currency picker offers for this family.
    def currency_options
      family.enabled_currency_codes.filter_map do |code|
        currency = Money::Currency.new(code)
        { value: currency.iso_code, label: "#{currency.name} (#{currency.iso_code})" }
      rescue Money::Currency::UnknownCurrencyError, ArgumentError
        nil
      end
    end

    def default_currency_code
      family.primary_currency_code
    end

    def family
      current_resource_owner.family
    end
end
