# frozen_string_literal: true

class Api::V1::TransactionConversionsController < Api::V1::BaseController
  before_action -> { authorize_scope!(action_name == "show" ? :read : :write) }
  before_action :set_transaction

  def show
    unless @transaction.entry.account.investment?
      return render_validation_error("Only investment account transactions can be converted")
    end
    securities = Security.where(id: @transaction.entry.account.holdings.select(:security_id)).order(:ticker)
    results = Security.search_provider(params[:q], country_code: current_resource_owner.family.country) if params[:q].present?
    render json: {
      securities: securities.map { |security| { id: security.id, ticker: security.ticker, name: security.name } },
      activity_labels: Trade::ACTIVITY_LABELS,
      search_results: Array(results).map { |security| {
        ticker: [ security.ticker, security.exchange_operating_mic, security.price_provider ].join("|"),
        name: security.name, symbol: security.ticker,
        exchange_operating_mic: security.exchange_operating_mic, price_provider: security.price_provider
      } }
    }
  end

  def create
    attributes = params.require(:conversion).permit(:security_id, :ticker, :custom_ticker, :exchange_operating_mic, :qty, :price, :investment_activity_label, :trade_name)
    if attributes[:investment_activity_label].present? && !Trade::ACTIVITY_LABELS.include?(attributes[:investment_activity_label])
      return render_validation_error("Invalid investment activity label")
    end
    if attributes[:security_id].present? && attributes[:security_id] != "__custom__" && !valid_uuid?(attributes[:security_id])
      return render_validation_error("Security ID must be a UUID")
    end
    entry = Transaction::TradeConversion.new(@transaction, attributes, family: current_resource_owner.family).create!
    render json: { id: entry.entryable_id, entry_id: entry.id, account_id: entry.account_id }, status: :created
  rescue Transaction::TradeConversion::Invalid, ActiveRecord::RecordInvalid, ActiveRecord::RecordNotSaved => error
    render_validation_error(error.message)
  end

  private
    def set_transaction
      raise ActiveRecord::RecordNotFound unless valid_uuid?(params[:transaction_id])
      @transaction = current_resource_owner.family.transactions.joins(entry: :account)
        .merge(Account.accessible_by(current_resource_owner)).find(params[:transaction_id])
      unless account_permissions(@transaction.entry.account)[:can_edit]
        render json: { error: "forbidden", message: "Not authorized to convert this transaction" }, status: :forbidden
      end
    end
end
