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
#   4. Execute via exec_query and return columns + row hashes.
class Sureql::Executor
  MAX_ROWS = 50

  Result = Data.define(:sql, :columns, :rows, :row_count, :truncated, :source_key)

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
      source_key: source_key
    )
  end

  private
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
