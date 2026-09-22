require "sureql"

# Executes a sureql query for the first real end-to-end report.
#
# Pipeline:
#   1. Compile with Sureql::Compiler (authz filter injected, registry-only
#      `from` sources) — never execute SQL that didn't go through the
#      compiler.
#   2. Guard the compiled SQL is a read-only SELECT/WITH (defense in depth;
#      prqlc only emits SELECT, but this blocks future regressions).
#   3. Enforce MAX_ROWS via LIMIT clamping so the playground can't scan
#      unbounded result sets.
#   4. Execute via exec_query and return columns + row hashes + typed field metadata.
#   5. Field metadata stays scoped to the executed result: ordered names, raw
#      database types from the adapter, normalized pivot kinds, row nullability,
#      and aggregation capabilities. Errors expose no schema details.
class Sureql::Executor
  MAX_ROWS = 50

  Result = Data.define(:sql, :columns, :rows, :row_count, :truncated, :source_key, :fields)

  FORBIDDEN_STATEMENT = /\b(insert|update|delete|drop|create|alter|grant|revoke|copy|vacuum|truncate|call|do)\b/i

  def initialize(user)
    @user = user
  end

  def call(source)
    compiler = Sureql::Compiler.new(@user)
    sql = compiler.call(source)
    source_key = detect_source(source)
    limited_sql, limit_truncated = enforce_limit(sql)
    validate_select!(limited_sql)

    query_result = ActiveRecord::Base.connection.exec_query(limited_sql)
    rows = query_result.map(&:to_h)
    truncated = limit_truncated || rows.size >= MAX_ROWS

    Result.new(
      sql: limited_sql,
      columns: query_result.columns,
      rows: rows,
      row_count: rows.size,
      truncated: truncated,
      source_key: source_key,
      fields: field_metadata(query_result, rows)
    )
  end

  private
    Field = Data.define(:name, :db_type, :kind, :nullable, :capabilities)

    # First `from <name>` line determines which UI renderer to use.
    # Returns nil for unresolvable sources (compiler will have raised).
    def detect_source(source)
      match = source.match(/^\s*from\s+(\w+)/)
      key = match&.[](1)
      key if key && Sureql.source?(key)
    end

    def validate_select!(sql)
      normalized = sql.strip.delete_prefix("(").lstrip
      unless normalized.match?(/\A(SELECT|WITH)\b/i)
        raise Sureql::CompileError, "sureql only executes read-only SELECT queries"
      end

      if sql.match?(/;\s*\S/)
        raise Sureql::CompileError, "sureql does not allow multiple statements"
      end

      if sql.match?(FORBIDDEN_STATEMENT)
        raise Sureql::CompileError, "sureql only executes read-only SELECT queries"
      end
    end

    # Ordered metadata for the executed result only. Adapter column types
    # survive aliases and expressions; value sampling refines numerics and
    # detects nullability in the returned rows. Empty results keep types
    # without row-derived refinements.
    def field_metadata(query_result, rows)
      query_result.columns.map do |column|
        db_type = column_type(query_result, column)
        kind = normalize_kind(db_type, column, rows)
        Field.new(
          name: column,
          db_type: db_type,
          kind: kind,
          nullable: nullable_column?(column, rows),
          capabilities: capabilities_for(kind)
        )
      end
    end

    def column_type(query_result, column)
      type = query_result.column_types[column]
      type = type.type if type.respond_to?(:type)
      type = type.to_s if type
      type.presence
    end

    def normalize_kind(db_type, column, rows)
      kind = kind_from_db_type(db_type)
      return kind if kind
      return "currency" if currency_column?(column, rows)
      return infer_kind_from_rows(column, rows) if rows.any?
      "unknown"
    end

    def kind_from_db_type(db_type)
      case db_type.to_s.downcase
      when /bool/ then "boolean"
      when /\bdate\b/ then "date"
      when /time|datetime|timestamp/ then "datetime"
      when /int|decimal|numeric|float|double|real|money/ then "number"
      when /char|text|string|uuid|json|enum/ then "text"
      end
    end

    def currency_column?(column, rows)
      return false unless column.to_s == "currency"
      rows.any? { |row| row[column].is_a?(String) && row[column].strip.length == 3 }
    end

    def infer_kind_from_rows(column, rows)
      kinds = rows.lazy.filter_map { |row| kind_from_value(row[column]) }.first(5).to_a.uniq
      kinds.one? ? kinds.first : "unknown"
    end

    def kind_from_value(value)
      case value
      when Integer, Float, BigDecimal then "number"
      when TrueClass, FalseClass then "boolean"
      when Date then "date"
      when Time, DateTime, ActiveSupport::TimeWithZone then "datetime"
      when String then kind_from_string(value)
      end
    end

    def kind_from_string(value)
      trimmed = value.strip
      return nil if trimmed.empty?
      parsed = Date._parse(trimmed)
      return "datetime" if parsed[:hour] || parsed[:min] || parsed[:sec]
      return "date" if parsed[:year] && parsed[:mon] && parsed[:mday]
      return "number" if numeric_string?(trimmed)
      "text"
    end

    def numeric_string?(value)
      Float(value.delete(","))
      true
    rescue ArgumentError, TypeError
      false
    end

    def nullable_column?(column, rows)
      rows.any? { |row| row[column].nil? }
    end

    def capabilities_for(kind)
      aggregations = case kind
      when "number", "currency" then %w[count count_distinct sum average minimum maximum]
      else %w[count count_distinct minimum maximum]
      end

      {
        category: true,
        series: kind != "boolean",
        measure: true,
        aggregations: aggregations
      }
    end

    # Returns [limited_sql, truncated_by_clamp?]. Clamps an existing LIMIT
    # down to MAX_ROWS, or appends `LIMIT MAX_ROWS` when absent.
    def enforce_limit(sql)
      cleaned = sql.rstrip.delete_suffix(";").rstrip

      if (match = cleaned.match(/LIMIT\s+(\d+)/i))
        requested = match[1].to_i
        if requested > MAX_ROWS
          [ cleaned.sub(/LIMIT\s+\d+/i, "LIMIT #{MAX_ROWS}"), true ]
        else
          [ cleaned, false ]
        end
      else
        [ "#{cleaned} LIMIT #{MAX_ROWS}", false ]
      end
    end
end
