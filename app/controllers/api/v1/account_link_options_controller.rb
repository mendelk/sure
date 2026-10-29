# frozen_string_literal: true

# Method-selection metadata for the SPA add-account flow. Provider configuration
# and account selection stay in React; only external authorization leaves it.
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
          new_account_path: spa_provider_path(config[:key], class_name)
        }
      end
    end

    def spa_provider_path(config_key, class_name)
      key = config_key.to_s
      provider = ProviderConnectionStatus::PROVIDERS.sort_by { |entry| -entry[:key].length }.find do |entry|
        key == entry[:key] || key.start_with?("#{entry[:key]}_")
      end
      raise ActiveRecord::RecordNotFound unless provider

      suffix = key.delete_prefix("#{provider[:key]}_")
      connection_id = suffix if UuidFormat.valid?(suffix)
      path = if connection_id
        "/provider_connections/#{provider[:key]}/#{connection_id}/setup"
      else
        "/provider_connections/#{provider[:key]}/new"
      end
      query = { accountable_type: class_name, return_to: safe_link_return_to }
      query[:region] = suffix if provider[:key] == "plaid" && %w[us eu].include?(suffix)
      "#{path}?#{query.compact.to_query}"
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
