# frozen_string_literal: true

class Api::V1::CurrenciesController < Api::V1::BaseController
  before_action -> { authorize_scope!(:read) }

  def show
    currency = Money::Currency.all_instances.find { |item| item.iso_code == params[:id].to_s.upcase }
    raise ActiveRecord::RecordNotFound unless currency
    render json: currency.as_json.merge(step: currency.step)
  end
end
