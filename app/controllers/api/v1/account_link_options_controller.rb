# frozen_string_literal: true

# Method-selection data for the SPA add-account flow. Mirrors the native
# `accounts/new/_method_selector` partial: a manual-entry path plus the
# provider link paths for the given accountable type. Read-only reference
# data; the SPA renders provider links as plain anchors to the Rails paths.
class Api::V1::AccountLinkOptionsController < Api::V1::BaseController
  ACCOUNTABLE_CLASS = Accountable::TYPES.index_by(&:underscore).freeze

  MANUAL_PATH_HELPER = {
    "depository" => :new_depository_path,
    "investment" => :new_investment_path,
    "crypto" => :new_crypto_path,
    "property" => :new_property_path,
    "vehicle" => :new_vehicle_path,
    "other_asset" => :new_other_asset_path,
    "credit_card" => :new_credit_card_path,
    "loan" => :new_loan_path,
    "other_liability" => :new_other_liability_path
  }.freeze

  before_action :ensure_read_scope, only: :show

  # GET /api/v1/account_link_options?account_type=<underscore>
  def show
    type_key = params[:account_type].to_s
    class_name = ACCOUNTABLE_CLASS[type_key]

    if class_name.nil?
      return render_json(
        { error: "unprocessable_entity", message: "Unknown account_type: #{type_key}" },
        status: :unprocessable_entity
      )
    end

    render_json({
      account_type: type_key,
      manual_path: public_send(MANUAL_PATH_HELPER.fetch(type_key), return_to: safe_link_return_to),
      manual_label: I18n.t("accounts.new.method_selector.manual_entry"),
      providers: provider_options(class_name)
    })
  end

  private
    def provider_options(class_name)
      configs = Provider::Factory.connection_configs_for_account_type(
        account_type: class_name,
        family: current_resource_owner.family
      )

      configs.filter_map do |config|
        next unless current_resource_owner.admin? || config[:member_connectable]

        {
          key: config[:key],
          name: config[:name],
          new_account_path: config[:new_account_path].call(class_name, safe_link_return_to)
        }
      end
    end

    # Same hardening as StoreLocation#safe_return_to: only internal absolute
    # paths (a single leading "/") so a crafted ?return_to= can't open-redirect.
    # Named distinctly to avoid shadowing StoreLocation#safe_return_to(value),
    # which the store_return_to before_action calls with one argument.
    def safe_link_return_to
      value = params[:return_to]
      value if value.is_a?(String) && value.present? && value.match?(%r{\A/(?![/\\])})
    end
end
