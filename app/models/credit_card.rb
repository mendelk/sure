class CreditCard < ApplicationRecord
  include Accountable

  MINIMUM_PAYMENT_PERCENTAGE = 1

  validates :payment_due_day, numericality: { only_integer: true, in: 1..31 }, allow_nil: true
  validates :minimum_payment_only, inclusion: { in: [ true, false ] }
  after_update_commit :refresh_payment_schedule

  def payment_schedule
    @payment_schedule ||= PaymentSchedule.new(self)
  end

  def refresh_payment_schedule
    payment_schedule.refresh!
  end

  DEFAULT_SUBTYPE = "credit_card"

  SUBTYPES = {
    "credit_card" => { short: "Credit Card", long: "Credit Card" }
  }.freeze

  class << self
    def color
      "#F13636"
    end

    def icon
      "credit-card"
    end

    def classification
      "liability"
    end
  end

  def available_credit_money
    available_credit ? Money.new(available_credit, account.currency) : nil
  end

  def minimum_payment_money
    minimum_payment ? Money.new(minimum_payment, account.currency) : nil
  end

  def annual_fee_money
    annual_fee ? Money.new(annual_fee, account.currency) : nil
  end
end
