class Api::Spa::TransactionsController < Api::Spa::BaseController
  include Pagy::Backend
  ARRAY_FILTER_KEYS = %i[types status accounts account_ids categories merchants tags].freeze

  def index
    @filters = transaction_filters
    validate_dates!

    @search = Transaction::Search.new(
      Current.family,
      filters: @filters,
      accessible_account_ids: Current.user.accessible_accounts.pluck(:id)
    )

    scope = @search.transactions_scope
                   .reverse_chronological
                   .includes({ entry: :account }, :category, :merchant, :tags)

    @pagy, @transactions = pagy(scope, page: page_param, limit: per_page_param)
    @totals = @search.totals
  rescue Date::Error
    render json: {
      error: "validation_failed",
      message: "Dates must use ISO 8601 format"
    }, status: :unprocessable_entity
  end

  private
    def transaction_filters
      filters = params.permit(:search, :start_date, :end_date).to_h.symbolize_keys

      ARRAY_FILTER_KEYS.each do |key|
        values = Array(params[key]).flat_map { |value| value.to_s.split(",") }.compact_blank
        filters[key] = values if values.any?
      end

      filters
    end

    def validate_dates!
      Date.iso8601(@filters[:start_date]) if @filters[:start_date].present?
      Date.iso8601(@filters[:end_date]) if @filters[:end_date].present?
    end

    def page_param
      page = params[:page].to_i
      page.positive? ? page : 1
    end

    def per_page_param
      per_page = params[:per_page].to_i
      per_page.in?(1..100) ? per_page : 25
    end
end
