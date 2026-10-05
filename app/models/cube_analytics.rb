require "digest"
require "jwt"
require "uri"

class CubeAnalytics
  include IncomeStatement::ScopedTransactionsQuery

  class Error < StandardError
    attr_reader :code

    def initialize(code)
      @code = code
      super(I18n.t("cube_dashboards.errors.#{code}"))
    end
  end

  class InvalidQuery < Error; end
  class Unavailable < Error; end
  class Unauthorized < Error; end

  MEASURES = %w[cash_flow.income cash_flow.expenses cash_flow.savings cash_flow.count].freeze
  DIMENSIONS = %w[cash_flow.category cash_flow.account].freeze
  DATE_DIMENSION = "cash_flow.date".freeze
  GRANULARITIES = %w[day week month quarter year].freeze
  MAX_LIMIT = 500
  LOAD_TIMEOUT = 15

  def initialize(user)
    @user = user
    @family = user&.family
    raise Unauthorized.new(:unauthorized) unless @user && @family
  end

  def catalog
    {
      measures: MEASURES.map { |name| catalog_member(name, "number") },
      dimensions: DIMENSIONS.map { |name| catalog_member(name, "string") } + [ catalog_member(DATE_DIMENSION, "time") ],
      granularities: GRANULARITIES,
      configured: configured?
    }
  end

  def call(query)
    query = validate_query(query)
    raise Unavailable.new(:not_configured) unless configured?

    # Never cache this relation or the token: a revoked share/reporting flag must
    # take effect on the very next request, including when reusing this instance.
    account_ids = IncomeStatement.new(@family, user: @user).eligible_accounts.pluck(:id).sort
    issued_at = Time.current.to_i
    token = JWT.encode({
      familyId: @family.id,
      userId: @user.id,
      accountIds: account_ids,
      scopeVersion: Digest::SHA256.hexdigest([ @family.currency, *account_ids ].join(":")),
      iss: "sure",
      aud: "sure-cube",
      iat: issued_at,
      exp: issued_at + 60
    }, self.class.api_secret, "HS256")

    payload = load_query(query, token)
    normalize_result(payload, query)
  rescue Faraday::Error, JSON::ParserError
    raise Unavailable.new(:unavailable)
  end

  # Unscoped source model; mandatory family/account filters are injected by the
  # Cube server from our verified JWT, never by a browser-supplied filter.
  def self.dataset_sql
    allocate.send(:dataset_sql)
  end

  def self.api_secret
    ENV["CUBE_API_SECRET"].presence || Rails.application.key_generator.generate_key("sure/cube-api", 32).unpack1("H*")
  end

  def self.api_url
    ENV["CUBE_API_URL"].presence || "http://cube:4000/cubejs-api/v1"
  end

  private
    def dataset_sql
      <<~SQL.chomp
        SELECT ae.id AS id,
               ae.date AS date,
               a.id AS account_id,
               a.family_id AS family_id,
               COALESCE(c.name, 'Uncategorized') AS category,
               a.name AS account,
               f.currency AS reporting_currency,
               #{classification_sql("t")} AS classification,
               #{converted_amount_sql("t")} AS amount
        FROM transactions t
        #{entries_join_sql("t")}
        #{accounts_join_sql}
        JOIN families f ON f.id = a.family_id
        LEFT JOIN categories c ON c.id = t.category_id
        #{exchange_rates_join_sql.sub(":target_currency", "f.currency")}
        WHERE t.kind NOT IN (#{budget_excluded_kinds_sql})
          AND ae.excluded = false
          AND a.status IN ('draft', 'active')
          AND a.exclude_from_reports = false
          #{investment_activity_label_sql("t")}
          #{pending_providers_sql("t")}
      SQL
    end

    def catalog_member(name, type)
      { name: name, title: I18n.t("cube_dashboards.#{name.split('.').last}"), type: type }
    end

    def configured?
      return false if self.class.api_secret.blank?
      uri = URI.parse(self.class.api_url)
      uri.is_a?(URI::HTTP) && uri.host.present? && uri.userinfo.nil? && uri.query.nil? && uri.fragment.nil?
    rescue URI::InvalidURIError
      false
    end

    def invalid_query!
      raise InvalidQuery.new(:invalid_query)
    end

    def validate_query(query)
      invalid_query! unless query.is_a?(Hash)
      query = query.deep_stringify_keys
      invalid_query! if (query.keys - %w[measures dimensions timeDimensions order limit]).any?

      measures = query["measures"]
      dimensions = query.fetch("dimensions", [])
      invalid_query! unless valid_members?(measures, MEASURES) && measures.any?
      invalid_query! unless valid_members?(dimensions, DIMENSIONS)

      time_dimensions = query["timeDimensions"]
      invalid_query! unless time_dimensions.is_a?(Array) && time_dimensions.length == 1
      time = time_dimensions.first
      invalid_query! unless time.is_a?(Hash) && (time.keys - %w[dimension dateRange granularity]).empty?
      invalid_query! unless time["dimension"] == DATE_DIMENSION
      invalid_query! if time.key?("granularity") && !GRANULARITIES.include?(time["granularity"])
      range = time["dateRange"]
      invalid_query! unless range.is_a?(Array) && range.length == 2 && range.all? { |date| iso_date?(date) }
      invalid_query! unless range.first <= range.last

      order = query["order"]
      order_members = measures + dimensions
      order_members += [ DATE_DIMENSION, "#{DATE_DIMENSION}.#{time['granularity']}" ] if time["granularity"]
      invalid_query! unless order.is_a?(Hash) && (order.keys - order_members).empty? && order.values.all? { |direction| %w[asc desc].include?(direction) }
      limit = query.fetch("limit", MAX_LIMIT)
      invalid_query! unless limit.is_a?(Integer) && limit.between?(1, MAX_LIMIT)

      { "measures" => measures, "dimensions" => dimensions, "timeDimensions" => time_dimensions, "order" => order, "limit" => limit }
    end

    def valid_members?(members, allowed)
      members.is_a?(Array) && members.uniq.length == members.length && (members - allowed).empty?
    end

    def iso_date?(value)
      value.is_a?(String) && value.match?(/\A\d{4}-\d{2}-\d{2}\z/) && !value.start_with?("0000") && Date.iso8601(value).iso8601 == value
    rescue Date::Error
      false
    end

    def load_query(query, token)
      deadline = monotonic_time + LOAD_TIMEOUT
      connection = Faraday.new do |http|
        http.request :json
      end
      loop do
        remaining = deadline - monotonic_time
        raise Unavailable.new(:unavailable) unless remaining.positive?
        response = connection.post("#{self.class.api_url.delete_suffix('/')}/load") do |request|
          request.headers["Authorization"] = "Bearer #{token}"
          request.headers["Accept"] = "application/json"
          request.options.timeout = remaining
          request.options.open_timeout = [ 3, remaining ].min
          request.body = { query: query.merge("timezone" => "UTC", "limit" => query["limit"] + 1), cache: "no-cache" }
        end
        raise Unavailable.new(:unavailable) unless response.success?
        payload = JSON.parse(response.body)
        raise Unavailable.new(:unavailable) unless payload.is_a?(Hash)
        return payload unless payload["error"] == "Continue wait"
        sleep([ 0.25, [ deadline - monotonic_time, 0 ].max ].min)
      end
    end

    def monotonic_time
      Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end

    def normalize_result(payload, query)
      rows = payload["data"]
      annotation = payload["annotation"]
      raise Unavailable.new(:unavailable) if payload.key?("error") || !rows.is_a?(Array) || !annotation.is_a?(Hash)
      time = query["timeDimensions"].first
      members = query["measures"] + query["dimensions"]
      members += [ DATE_DIMENSION, "#{DATE_DIMENSION}.#{time['granularity']}" ] if time["granularity"]
      monetary_members = query["measures"] - [ "cash_flow.count" ]
      rows.each do |row|
        raise Unavailable.new(:unavailable) unless row.is_a?(Hash) && (row.keys - members).empty?
        row.each do |name, value|
          raise Unavailable.new(:unavailable) unless value.nil? || value.is_a?(String) || value.is_a?(Numeric)
          # Cube's PostgreSQL financial aggregates must retain decimal strings;
          # accepting a JSON float here would already have lost precision.
          raise Unavailable.new(:unavailable) if monetary_members.include?(name) && !value.nil? && !value.is_a?(String)
        end
      end
      last_refresh = payload["lastRefreshTime"]
      raise Unavailable.new(:unavailable) unless last_refresh.nil? || last_refresh.is_a?(String)
      {
        query: query,
        data: rows.first(query["limit"]),
        annotation: annotation,
        currency: @family.currency,
        lastRefreshTime: last_refresh,
        truncated: rows.length > query["limit"]
      }
    end
end
