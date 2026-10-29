# Validates a reconciliation without changing the entry the manager uses to
# resolve the original balance. Both preview and confirmation use this input.
class Valuation::ReconciliationInput
  attr_reader :balance, :date, :errors

  def initialize(account:, attributes:, existing_entry: nil, max_date: nil)
    @account, @attributes, @existing_entry, @max_date = account, attributes, existing_entry, max_date
    @errors = []
  end

  def valid?
    @errors = []
    return invalid("amount_required") if @attributes[:amount].blank?

    begin
      @balance = BigDecimal(@attributes[:amount].to_s)
      raise ArgumentError unless @balance.finite?
    rescue ArgumentError, TypeError
      return invalid("amount_invalid")
    end

    begin
      @date = Date.iso8601(@attributes[:date].to_s)
    rescue Date::Error
      return invalid("date_invalid")
    end

    unless @date > Entry.min_supported_date && (!@max_date || @date <= @max_date)
      return invalid("date_out_of_range", min: I18n.l(Entry.min_supported_date.next_day), max: I18n.l(@max_date || Date.current))
    end

    candidate = @existing_entry || @account.entries.valuations.find_by(date: @date) || @account.entries.build(
      name: Valuation.build_reconciliation_name(@account.accountable_type), entryable: Valuation.new
    )
    original = candidate.attributes.slice("date", "amount", "currency")
    begin
      candidate.assign_attributes(date: @date, amount: @balance, currency: @account.currency)
      valid = candidate.valid?
      @errors = candidate.errors.full_messages
      valid
    ensure
      candidate.assign_attributes(original)
    end
  end

  def to_h
    { balance: balance, date: date }
  end

  private
    def invalid(key, **options)
      @errors = [ I18n.t("valuations.errors.#{key}", **options) ]
      false
    end
end
