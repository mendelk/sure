# frozen_string_literal: true

module SophtronItem::Configuration
  extend ActiveSupport::Concern

  MAX_SECURITY_ANSWERS = 10
  MAX_SECURITY_ANSWER_LENGTH = 256

  def verify_and_provision_customer!
    provider = sophtron_provider
    raise Provider::Sophtron::Error.new("Sophtron provider is not configured", :configuration_error) unless provider
    Provider::Sophtron.response_data!(provider.health_check_auth)
    ensure_customer!(provider: provider)
    true
  rescue Provider::Sophtron::Error => error
    update(status: :requires_update, last_connection_error: error.message)
    raise
  end

  def connect_configuration_institution!(attributes)
    attrs = attributes.to_h.with_indifferent_access
    raise ProviderConnection::Invalid, "Institution, username and password are required" if %i[institution_id bank_username bank_password].any? { |field| attrs[field].blank? }
    target = self
    if ActiveModel::Type::Boolean.new.cast(attrs[:new_connection]) &&
        (user_institution_id.present? || current_job_id.present? || institution_id.present? || institution_name.present? || sophtron_accounts.exists?)
      target = family.sophtron_items.create!(name: name, user_id: user_id, access_key: access_key, base_url: base_url,
        customer_id: customer_id, customer_name: customer_name, raw_customer_payload: raw_customer_payload,
        sync_start_date: sync_start_date)
    end
    target.ensure_customer!
    response = Provider::Sophtron.response_data!(target.sophtron_provider.create_user_institution(
      institution_id: attrs[:institution_id], username: attrs[:bank_username], password: attrs[:bank_password], pin: ""
    )).with_indifferent_access
    job_id = response[:JobID] || response[:job_id]
    remote_institution_id = response[:UserInstitutionID] || response[:user_institution_id]
    if job_id.blank? || remote_institution_id.blank?
      raise Provider::Sophtron::Error.new("Sophtron did not return JobID and UserInstitutionID", :invalid_response)
    end
    target.update!(institution_id: attrs[:institution_id], institution_name: attrs[:institution_name],
      user_institution_id: remote_institution_id, current_job_id: job_id, raw_job_payload: response,
      job_status: nil, last_connection_error: nil, status: :good)
    target
  end

  def submit_configuration_mfa!(attributes)
    attrs = attributes.to_h.with_indifferent_access
    provider = sophtron_provider
    raise ProviderConnection::Invalid, "No pending challenge" if provider.blank? || current_job_id.blank?
    response = case attrs[:mfa_type]
    when "security_answer"
      answers = self.class.configuration_security_answers(attrs[:security_answers])
      raise ProviderConnection::Invalid, "Invalid security answers" unless answers
      provider.update_job_security_answer(current_job_id, answers)
    when "token_choice"
      provider.update_job_token_input(current_job_id, token_choice: attrs[:token_choice])
    when "token_input"
      provider.update_job_token_input(current_job_id, token_input: attrs[:token_input])
    when "verify_phone"
      provider.update_job_token_input(current_job_id, verify_phone_flag: true)
    when "captcha"
      provider.update_job_captcha(current_job_id, attrs[:captcha_input])
    else
      raise ProviderConnection::Invalid, "Unknown MFA challenge"
    end
    Provider::Sophtron.response_data!(response)
    { status: "pending" }
  end

  def configure_connection!(action, attributes)
    attrs = attributes.to_h.with_indifferent_access
    case action.to_s
    when "institutions"
      provider = sophtron_provider
      raise ProviderConnection::Invalid, "Sophtron is not configured" unless provider
      data = Provider::Sophtron.response_data!(provider.search_institutions(attrs[:query].to_s))
      { institutions: data }
    when "connect_institution"
      target = connect_configuration_institution!(attrs)
      { item_id: target.id, status: "pending" }
    when "submit_mfa"
      result = submit_configuration_mfa!(attrs)
      current_job_sophtron_account_id.present? ? SophtronItem::ManualSync.new(self).poll! : result
    when "connection_status"
      configuration_connection_status!
    else
      raise ProviderConnection::Invalid, "Unknown configuration action"
    end
  end

  def configuration_connection_status!
    raise ProviderConnection::Invalid, "No pending connection" if current_job_id.blank?
    return SophtronItem::ManualSync.new(self).poll! if current_job_sophtron_account_id.present?
    job = Provider::Sophtron.response_data!(sophtron_provider.get_job_information(current_job_id))
    upsert_job_snapshot!(job)
    if Provider::Sophtron.job_requires_input?(job)
      { status: "challenge", challenge: build_mfa_challenge(job) }
    elsif Provider::Sophtron.job_failed?(job)
      update!(current_job_id: nil, user_institution_id: nil, last_connection_error: "Institution connection failed", status: :requires_update)
      { status: "failed" }
    elsif Provider::Sophtron.job_success?(job) || Provider::Sophtron.job_completed?(job)
      accounts = fetch_remote_accounts(force: true)
      if accounts.any? || Provider::Sophtron.job_success?(job)
        update!(current_job_id: nil, last_connection_error: nil, pending_account_setup: true, status: :good)
        { status: "complete" }
      else
        { status: "pending" }
      end
    else
      { status: "pending" }
    end
  end

  class_methods do
    def configuration_security_answers(value)
      raw_answers = Array(value).flatten
      return if raw_answers.size > MAX_SECURITY_ANSWERS || raw_answers.any? { |answer| answer.to_s.length > MAX_SECURITY_ANSWER_LENGTH }
      raw_answers.filter_map { |answer| answer.to_s.strip.presence }.presence
    end
  end
end
