# frozen_string_literal: true

module TradeRepublicItem::Configuration
  extend ActiveSupport::Concern

  class DuplicateConnection < ProviderConnection::Conflict; end
  class SupersededLogin < ProviderConnection::Conflict; end

  def start_configuration_login!(qr: false, pin: nil)
    raise ProviderConnection::Invalid, "PIN is required" if !qr && pin.blank?
    update!(session_blob: nil, pending_login_state: nil, status: :requires_update)
    provider = trade_republic_provider(pin: pin)
    raise ProviderConnection::Invalid, "Trade Republic is not configured" unless provider
    response = qr ? provider.initiate_qr_login : provider.initiate_login
    data = response.respond_to?(:data) ? response.data : response
    update!(pending_login_state: data.fetch("pending_login_b64"), status: :requires_update)
    configuration_login_response(data)
  end

  def complete_configuration_login!(qr: false, code: nil, poll: false)
    expected_pending = pending_login_state
    provider = trade_republic_provider
    raise ProviderConnection::Invalid, "No pending login" if provider.blank? || expected_pending.blank?
    result = if qr
      provider.poll_qr_login(pending_login_b64: expected_pending)
    elsif poll
      provider.complete_login(pending_login_b64: expected_pending)
    else
      provider.complete_login(pending_login_b64: expected_pending, code: code)
    end
    data = result.data
    if data["status"] == "pending"
      if data["pending_login_b64"].present? && !update_if_pending_login_current!(expected_pending, pending_login_state: data["pending_login_b64"])
        raise SupersededLogin, "Login has been superseded"
      end
    elsif duplicate_configuration_connection?(result)
      unless update_if_pending_login_current!(expected_pending, pending_login_state: nil, status: :requires_update)
        raise SupersededLogin, "Login has been superseded"
      end
      discard_duplicate_configuration_connection!
      raise DuplicateConnection, "This Trade Republic account is already connected"
    else
      accepted = update_if_pending_login_current!(expected_pending,
        session_blob: data.fetch("session_txt"), pending_login_state: nil, status: :good,
        brokerage_account_id: data.dig("account", "brokerage_account_id").presence)
      raise SupersededLogin, "Login has been superseded" unless accepted
      sync_later unless syncing?
    end
    configuration_login_response(data)
  rescue ActiveRecord::RecordNotUnique
    discard_duplicate_configuration_connection!
    raise DuplicateConnection, "This Trade Republic account is already connected"
  rescue Provider::TradeRepublicClient::LoginExpired, Provider::TradeRepublicClient::AuthenticationRequired
    raise SupersededLogin, "Login has been superseded" unless update_if_pending_login_current!(expected_pending, pending_login_state: nil)
    raise
  rescue Provider::TradeRepublicClient::Error => error
    if expected_pending.present? && error.respond_to?(:pending_login_b64) && error.pending_login_b64.present?
      update_if_pending_login_current!(expected_pending, pending_login_state: error.pending_login_b64)
    end
    retryable = error.is_a?(Provider::TradeRepublicClient::RateLimited) ||
      error.is_a?(Provider::TradeRepublicClient::Timeout) ||
      error.is_a?(Provider::TradeRepublicClient::TransientProviderError)
    if poll && !qr && !retryable
      raise SupersededLogin, "Login has been superseded" unless update_if_pending_login_current!(expected_pending, pending_login_state: nil)
    end
    raise
  end

  def update_if_pending_login_current!(expected_pending, **attributes)
    with_lock do
      current = pending_login_state == expected_pending
      update!(attributes) if current
      current
    end
  end

  def duplicate_configuration_connection?(result)
    account_id = result.data.dig("account", "brokerage_account_id").presence
    return false if account_id.blank?
    others = family.trade_republic_items.active.where.not(id: id)
    others.exists?(brokerage_account_id: account_id) ||
      others.joins(:trade_republic_accounts).where(trade_republic_accounts: { trade_republic_account_id: [ account_id, "cash:#{account_id}" ] }).exists?
  end

  def discard_duplicate_configuration_connection!
    update!(session_blob: nil, pending_login_state: nil, status: :requires_update, brokerage_account_id: nil)
    destroy_later if trade_republic_accounts.none?
  end

  private

    def configuration_login_response(data)
      # The challenge itself is public; serialized sessions, pending state and
      # broker account details must never cross the API boundary.
      data.slice("status", "method", "qr_code_payload", "expires_in", "interval").tap do |response|
        if data["qr_code_payload"].present?
          svg = RQRCode::QRCode.new(data["qr_code_payload"]).as_svg(
            color: "141414", module_size: 4, standalone: true, use_path: true,
            svg_attributes: { width: "240", height: "240", viewBox: "0 0 65 65" }
          )
          response["qr_code_image"] = "data:image/svg+xml;base64,#{Base64.strict_encode64(svg)}"
        end
      end
    end
end
