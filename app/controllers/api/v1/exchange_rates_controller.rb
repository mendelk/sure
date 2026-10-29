# frozen_string_literal: true

class Api::V1::ExchangeRatesController < Api::V1::BaseController
  before_action -> { authorize_scope!(:read) }

  def show
    from = params[:from].to_s.upcase
    to = params[:to].to_s.upcase
    codes = Money::Currency.all_instances.map(&:iso_code)
    return render_validation_error("Valid from and to currencies are required") unless codes.include?(from) && codes.include?(to)
    date = params[:date].present? ? Date.iso8601(params[:date]) : Date.current
    return render json: { rate: 1.0, same_currency: true } if from == to

    rate = ExchangeRate.find_or_fetch_rate(from: from, to: to, date: date)
    return render json: { error: "not_found", message: "Exchange rate not found" }, status: :not_found unless rate
    render json: { rate: (rate.is_a?(Numeric) ? rate : rate.rate).to_f }
  rescue ArgumentError, TypeError
    render_validation_error("Invalid date format")
  end
end
