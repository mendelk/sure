# frozen_string_literal: true

# One atomic cash-to-security conversion shared by browser and public API clients.
class Transaction::TradeConversion
  class Invalid < StandardError; end

  def initialize(transaction, attributes, family:)
    @transaction = transaction
    @attributes = attributes.to_h.symbolize_keys
    @family = family
  end

  def create!
    entry = @transaction.entry
    trade_entry = nil
    Entry.transaction do
      entry.lock!
      invalid!(:already_converted) if entry.excluded?
      invalid!(:not_investment_account) unless entry.account.investment?
      security = resolve_security
      qty, price = quantity_and_price(entry.amount.abs)
      label = @attributes[:investment_activity_label].presence
      is_sell = label == "Sell" || (label.blank? && entry.amount.negative?)
      trade_entry = entry.account.entries.create!(
        name: @attributes[:trade_name].presence || Trade.build_name(is_sell ? "sell" : "buy", qty, security.ticker),
        date: entry.date,
        amount: (is_sell ? -1 : 1) * qty * price,
        currency: entry.currency,
        notes: I18n.t("transactions.convert_to_trade.conversion_note", original_name: entry.name, original_date: I18n.l(entry.date, format: :long)),
        entryable: Trade.new(security: security, qty: is_sell ? -qty : qty, price: price, currency: entry.currency, investment_activity_label: label || (is_sell ? "Sell" : "Buy"))
      )
      trade_entry.lock_saved_attributes!
      trade_entry.mark_user_modified!
      entry.update!(excluded: true)
    end
    trade_entry.sync_account_later
    trade_entry
  end

  private
    def resolve_security
      id = @attributes[:security_id]
      if id.present? && id != "__custom__"
        return Security.find_by(id: id) || invalid!(:security_not_found)
      end

      ticker = @attributes[:ticker].presence || @attributes[:custom_ticker].presence
      invalid!(:select_security) unless ticker
      parsed = Security.parse_combobox_id(ticker)
      invalid!(:enter_ticker) if parsed[:ticker].blank?
      Security::Resolver.new(parsed[:ticker].strip,
        exchange_operating_mic: parsed[:exchange_operating_mic] || @attributes[:exchange_operating_mic].presence,
        country_code: @family.country, price_provider: parsed[:price_provider]).resolve || invalid!(:security_not_found)
    end

    def quantity_and_price(amount)
      qty = @attributes[:qty].present? ? BigDecimal(@attributes[:qty].to_s).abs : nil
      price = @attributes[:price].present? ? BigDecimal(@attributes[:price].to_s) : nil
      invalid!(:enter_qty_or_price) if qty.nil? && price.nil?
      qty = (amount / price).round(6) if qty.nil? && price&.positive?
      price = (amount / qty).round(4) if price.nil? && qty&.positive?
      invalid!(:invalid_qty_or_price) unless qty&.finite? && price&.finite? && qty.positive? && price.positive?
      [ qty, price ]
    rescue ArgumentError
      invalid!(:invalid_qty_or_price)
    end

    def invalid!(key)
      raise Invalid, I18n.t("transactions.convert_to_trade.errors.#{key}")
    end
end
