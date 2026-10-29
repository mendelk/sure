# frozen_string_literal: true

module EnableBankingItem::Configuration
  extend ActiveSupport::Concern

  def configuration_banks
    raise ProviderConnection::Invalid, "Enable Banking credentials are required" unless credentials_configured?
    response = enable_banking_provider.get_aspsps(country: country_code)
    banks = response[:aspsps] || response["aspsps"] || []
    banks.map do |bank|
      bank.with_indifferent_access.slice(:name, :country, :bic, :beta, :logo, :psu_types)
    end.sort_by { |bank| [ bank[:beta] ? 1 : 0, bank[:name].to_s.downcase ] }
  end

  def begin_configuration_authorization!(attributes, callback_url:, request_ip: nil, reauthorize: false)
    attrs = attributes.to_h.with_indifferent_access
    raise ProviderConnection::Invalid, "Bank is required" if !reauthorize && attrs[:aspsp_name].blank?
    target = if !reauthorize && ActiveModel::Type::Boolean.new.cast(attrs[:new_connection])
      family.enable_banking_items.create!(name: "Enable Banking Connection", country_code: country_code,
        application_id: application_id, client_certificate: client_certificate)
    else
      self
    end
    target.update!(last_psu_ip: request_ip) if request_ip.present? && !reauthorize
    arguments = { redirect_url: callback_url, state: target.id, language: I18n.locale.to_s.split("-").first }
    unless reauthorize
      arguments[:aspsp_name] = attrs[:aspsp_name]
      arguments[:psu_type] = attrs[:psu_type].presence || "personal"
    end
    url = target.begin_authorization!(**arguments)
    raise ProviderConnection::Invalid, "Invalid authorization URL received" unless self.class.valid_configuration_authorization_url?(url)
    { authorization_url: url, item_id: target.id }
  end

  class_methods do
    def valid_configuration_authorization_url?(url)
      return false if url.blank?
      uri = URI.parse(url)
      uri.scheme == "https" && uri.userinfo.blank? && uri.host.present? &&
        (uri.host.downcase == "enablebanking.com" || uri.host.downcase.end_with?(".enablebanking.com"))
    rescue URI::Error
      false
    end
  end
end
