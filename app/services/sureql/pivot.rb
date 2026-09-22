require "sureql"

# Validates and executes a versioned pivot aggregation over an authorized
# SureQL result. The base query compiles exactly once through
# Sureql::Compiler (existing account authorization), then pivot grouping and
# aggregation wrap that SQL as a read-only subquery. Aggregation runs before
# the executor preview cap; explicit user `take` limits inside SureQL are
# preserved because they are part of the compiled base query.
#
# Only allowlisted identifiers, buckets, aggregates, sorts, and limits reach
# SQL. Invalid specifications raise Pivot::InvalidError with a stable field
# path so the UI can show an actionable state without hiding table data.
class Sureql::Pivot
  VERSION = 1

  AGGREGATIONS = %w[count count_distinct sum average minimum maximum].freeze
  DATE_BUCKETS = %w[day week month quarter year].freeze
  SORTS = %w[category_asc category_desc value_desc value_asc].freeze
  FIELD_PATTERN = /\A[A-Za-z_][A-Za-z0-9_]*\z/.freeze
  MAX_MEASURES_WITHOUT_SERIES = 3
  MAX_MEASURES_WITH_SERIES = 1
  MAX_CATEGORIES = 24
  MAX_SERIES = 12
  MAX_CELLS = 500

  Result = Data.define(:sql, :categories, :series, :measures, :rows, :row_count, :truncated, :fields)

  class InvalidError < StandardError
    attr_reader :field

    def initialize(field, message)
      @field = field
      super(message)
    end
  end

  def initialize(user)
    @user = user
  end

  def call(source, pivot)
    spec = normalize_spec(pivot)
    base_sql = compiler.call(source)
    validate_select!(base_sql)
    base_fields = field_index(base_sql)
    validate_spec!(spec, base_fields)
    pivot_sql = build_sql(base_sql, spec)
    validate_select!(pivot_sql)

    query_result = ActiveRecord::Base.connection.exec_query(pivot_sql)
    rows = query_result.map(&:to_h)
    truncated = rows.size >= MAX_CELLS
    rows = rows.first(MAX_CELLS - 1) if truncated

    Result.new(
      sql: pivot_sql,
      categories: category_labels(spec, rows),
      series: series_labels(spec, rows),
      measures: spec[:measures].map { |measure| measure.slice(:field, :aggregation, :label) },
      rows: rows,
      row_count: rows.size,
      truncated: truncated,
      fields: pivot_fields(spec, base_fields)
    )
  end

  private
    def compiler
      @compiler ||= Sureql::Compiler.new(@user)
    end

    def normalize_spec(pivot)
      hash = pivot.is_a?(ActionController::Parameters) ? pivot.to_unsafe_h : pivot.to_h
      {
        version: hash[:version] || hash["version"],
        category: hash_value(hash[:category] || hash["category"]),
        series: hash_value(hash[:series] || hash["series"]),
        measures: Array(hash[:measures] || hash["measures"]).map { |measure| hash_value(measure) },
        chartType: hash[:chartType] || hash["chartType"],
        sort: hash[:sort] || hash["sort"],
        valueFormat: hash[:valueFormat] || hash["valueFormat"]
      }
    end

    def hash_value(value)
      value = value.to_unsafe_h if value.is_a?(ActionController::Parameters)
      value.is_a?(Hash) ? value.with_indifferent_access : {}.with_indifferent_access
    end

    # Reuse the executor field walk so pivot validation sees the same typed
    # fields as the table preview, without running the capped table query.
    def field_index(base_sql)
      executor = Sureql::Executor.new(@user)
      probe_sql = "SELECT * FROM (#{base_sql.delete_suffix(";")}) AS pivot_probe LIMIT 0"
      query_result = ActiveRecord::Base.connection.exec_query(probe_sql)
      fields = executor.send(:field_metadata, query_result, [])
      fields.index_by(&:name)
    end

    def validate_spec!(spec, base_fields)
      raise InvalidError.new("version", "Unsupported pivot version.") unless spec[:version].to_i == VERSION
      raise InvalidError.new("measures", "Choose at least one measure.") if spec[:measures].empty?

      measure_limit = spec[:series].present? ? MAX_MEASURES_WITH_SERIES : MAX_MEASURES_WITHOUT_SERIES
      if spec[:measures].size > measure_limit
        message = spec[:series].present? ? "Choose one measure when a series is selected." : "Choose up to #{MAX_MEASURES_WITHOUT_SERIES} measures without a series."
        raise InvalidError.new("measures", message)
      end

      category_field = validate_field!(spec[:category][:field], base_fields, "category.field", "Choose a category from the query result.")
      validate_limit!(spec[:category][:limit], MAX_CATEGORIES, "category.limit", "Category limit must be 1-#{MAX_CATEGORIES}.")
      if spec[:category][:dateBucket].present? && !%w[date datetime].include?(category_field.kind)
        raise InvalidError.new("category.dateBucket", "Date buckets need a date field.")
      end
      if spec[:category][:dateBucket].present? && !DATE_BUCKETS.include?(spec[:category][:dateBucket].to_s)
        raise InvalidError.new("category.dateBucket", "Unsupported date bucket.")
      end

      if spec[:series].present?
        validate_field!(spec[:series][:field], base_fields, "series.field", "Choose a series from the query result.")
        validate_limit!(spec[:series][:limit], MAX_SERIES, "series.limit", "Series limit must be 1-#{MAX_SERIES}.")
        if spec[:series][:field].to_s == spec[:category][:field].to_s
          raise InvalidError.new("series.field", "Series must differ from category.")
        end
      end

      spec[:measures].each_with_index do |measure, index|
        path = "measures.#{index}"
        if measure[:field].blank?
          raise InvalidError.new("#{path}.field", "#{measure[:aggregation]} needs a measured field; bare fields support count only.") unless measure[:aggregation].to_s == "count"
          next
        end
        field = validate_field!(measure[:field], base_fields, "#{path}.field", "Choose a measure from the query result.")
        aggregation = measure[:aggregation].to_s
        raise InvalidError.new("#{path}.aggregation", "Unsupported aggregation.") unless AGGREGATIONS.include?(aggregation)
        unless field.capabilities[:aggregations]&.include?(aggregation)
          raise InvalidError.new("#{path}.aggregation", "#{aggregation} is unavailable for #{field.name}.")
        end
        if %w[sum average].include?(aggregation) && !%w[number currency].include?(field.kind)
          raise InvalidError.new("#{path}.aggregation", "#{aggregation} needs a numeric field.")
        end
      end

      unless SORTS.include?(spec[:sort].to_s)
        raise InvalidError.new("sort", "Unsupported pivot sort.")
      end
    end

    def validate_field!(name, base_fields, path, message)
      raise InvalidError.new(path, message) unless name.to_s.match?(FIELD_PATTERN)
      field = base_fields[name.to_s]
      raise InvalidError.new(path, message) if field.nil?
      field
    end

    def validate_limit!(limit, max, path, message)
      return if limit.blank?
      raise InvalidError.new(path, message) unless limit.to_s.match?(/\A\d+\z/) && limit.to_i.between?(1, max)
    end

    def validate_select!(sql)
      normalized = sql.strip.delete_prefix("(").lstrip
      unless normalized.match?(/\A(SELECT|WITH)\b/i)
        raise Sureql::CompileError, "sureql only executes read-only SELECT queries"
      end
      if sql.match?(/;\s*\S/)
        raise Sureql::CompileError, "sureql does not allow multiple statements"
      end
    end

    def build_sql(base_sql, spec)
      base = "(#{base_sql.delete_suffix(";").rstrip}) AS pivot_base"
      category = quote(spec[:category][:field])
      category_expr, category_label = category_expression(category, spec[:category][:dateBucket])
      series_expr, series_label = series_expression(spec)
      measure_exprs = measure_expressions(spec)
      group_keys = [ "pivot_category" ]
      group_keys << "pivot_series" if series_expr
      order_clause = order_expression(spec)
      limit_clause = limit_expression(spec)

      select_list = [ "#{category_expr} AS pivot_category" ]
      select_list << "#{series_expr} AS pivot_series" if series_expr
      select_list.concat(measure_exprs)
      select_list << "#{category_label} AS category_label" if category_label
      select_list << "#{series_label} AS series_label" if series_label

      sql = +"SELECT #{select_list.join(", ")} FROM #{base} GROUP BY #{group_keys.join(", ")}"
      sql << " ORDER BY #{order_clause}" if order_clause
      sql << " LIMIT #{limit_clause}" if limit_clause
      sql
    end

    def category_expression(category, bucket)
      case bucket.to_s
      when "day" then [ "DATE_TRUNC('day', " + category + ")", nil ]
      when "week" then [ "DATE_TRUNC('week', " + category + ")", nil ]
      when "month" then [ "DATE_TRUNC('month', " + category + ")", nil ]
      when "quarter" then [ "DATE_TRUNC('quarter', " + category + ")", nil ]
      when "year" then [ "DATE_TRUNC('year', " + category + ")", nil ]
      else [ category, nil ]
      end
    end

    def series_expression(spec)
      return [ nil, nil ] if spec[:series].blank?
      [ quote(spec[:series][:field]), nil ]
    end

    def measure_expressions(spec)
      spec[:measures].map.with_index do |measure, index|
        column = quote(measure[:field]) if measure[:field].present?
        case measure[:aggregation].to_s
        when "count" then "COUNT(*) AS " + quote("measure_#{index}")
        when "count_distinct" then "COUNT(DISTINCT " + column + ") AS " + quote("measure_#{index}")
        when "sum" then "SUM(" + column + ") AS " + quote("measure_#{index}")
        when "average" then "AVG(" + column + ") AS " + quote("measure_#{index}")
        when "minimum" then "MIN(" + column + ") AS " + quote("measure_#{index}")
        when "maximum" then "MAX(" + column + ") AS " + quote("measure_#{index}")
        end
      end
    end

    def order_expression(spec)
      case spec[:sort].to_s
      when "category_asc" then "pivot_category ASC NULLS FIRST"
      when "category_desc" then "pivot_category DESC NULLS LAST"
      when "value_asc" then "measure_0 ASC NULLS LAST"
      else "measure_0 DESC NULLS LAST"
      end
    end

    def limit_expression(spec)
      category_limit = spec[:category][:limit].to_i if spec[:category][:limit].present?
      series_limit = spec[:series][:limit].to_i if spec[:series]&.dig(:limit).present?
      category_limit = [ category_limit || MAX_CATEGORIES, MAX_CATEGORIES ].min
      return category_limit unless series_limit
      category_limit * [ series_limit, MAX_SERIES ].min
    end

    def quote(name)
      ActiveRecord::Base.connection.quote_column_name(name.to_s)
    end

    def category_labels(spec, rows)
      rows.map { |row| row["pivot_category"] }.uniq
    end

    def series_labels(spec, rows)
      return [] if spec[:series].blank?
      rows.map { |row| row["pivot_series"] }.uniq
    end

    def pivot_fields(spec, base_fields)
      fields = [ base_fields[spec[:category][:field].to_s] ].compact
      fields << base_fields[spec[:series][:field].to_s] if spec[:series].present?
      spec[:measures].each do |measure|
        fields << base_fields[measure[:field].to_s] if measure[:field].present?
      end
      fields.uniq(&:name).map(&:to_h)
    end
end
