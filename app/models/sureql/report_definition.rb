require "sureql"

# Server-owned report vocabulary, using only the compiler's authorized source.
# Pagination selects entries or whole groups after filtering, aggregation, and sorting.
class Sureql::ReportDefinition
  DEFAULT_PAGE_SIZE = 10
  MAX_COLUMNS = 24
  MAX_DETAIL_COLUMNS = 7
  IDENTIFIER = /\A[A-Za-z_][A-Za-z0-9_]{0,63}\z/
  UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i
  DATE_BUCKETS = Sureql::Pivot::DATE_BUCKETS
  FIELDS = {
    "category" => { kind: "text", column: "category_id", label_column: "category_name", dimension: true, detail: true, aggregations: %w[count_distinct], operators: %w[equals not_equals] },
    "merchant" => { kind: "text", column: "merchant_id", label_column: "merchant_name", dimension: true, detail: true, aggregations: %w[count_distinct], operators: %w[equals not_equals] },
    "tag" => { kind: "text", dimension: false, detail: false, aggregations: [], operators: %w[equals not_equals] },
    "account" => { kind: "text", column: "account_id", label_column: "account_name", dimension: true, detail: true, aggregations: %w[count_distinct], operators: %w[equals] },
    "date" => { kind: "date", column: "date", dimension: true, detail: true, aggregations: %w[count_distinct], operators: %w[last] },
    "currency" => { kind: "currency", column: "currency", dimension: true, detail: true, aggregations: %w[count_distinct], operators: %w[equals] },
    "amount" => { kind: "number", column: "amount", dimension: false, detail: true, aggregations: Sureql::Pivot::AGGREGATIONS, operators: [] },
    "name" => { kind: "text", column: "name", dimension: false, detail: true, aggregations: [], operators: [] },
    "transaction_count" => { kind: "number", dimension: false, detail: false, aggregations: %w[count], operators: [] }
  }.freeze

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

  def catalog
    sql = source_sql
    options = {}
    %w[category merchant account currency].each do |key|
      field = FIELDS.fetch(key)
      column = quote_column(field.fetch(:column))
      label = quote_column(field[:label_column] || field.fetch(:column))
      options[key] = connection.exec_query("SELECT DISTINCT #{column} AS value, #{label} AS label FROM (#{sql}) AS catalog_source ORDER BY label NULLS FIRST, value NULLS FIRST").map do |row|
        fallback = key == "merchant" ? text("no_merchant") : text("uncategorized")
        { value: row["value"].to_s, label: row["label"] || fallback }
      end
    end
    options["tag"] = connection.exec_query(<<~SQL.squish).map do |row|
      SELECT DISTINCT tg.id AS value, tg.name AS label
      FROM (#{sql}) AS catalog_source
      INNER JOIN taggings AS tgg ON tgg.taggable_type = 'Transaction' AND tgg.taggable_id = catalog_source.transaction_id
      INNER JOIN tags AS tg ON tg.id = tgg.tag_id
      ORDER BY label NULLS FIRST, value NULLS FIRST
    SQL
      { value: row["value"].to_s, label: row["label"] }
    end
    has_untagged = connection.select_value(<<~SQL.squish).to_i.positive?
      SELECT 1 FROM (#{sql}) AS catalog_source
      WHERE NOT EXISTS (
        SELECT 1 FROM taggings AS tgg
        WHERE tgg.taggable_type = 'Transaction' AND tgg.taggable_id = catalog_source.transaction_id
      ) LIMIT 1
    SQL
    options["tag"].unshift({ value: "", label: text("untagged") }) if has_untagged
    {
      source: "transactions",
      fields: FIELDS.map do |key, field|
        {
          key: key, label: text("fields.#{key}"), kind: field.fetch(:kind),
          dimension: field.fetch(:dimension), detail: field.fetch(:detail), aggregations: field.fetch(:aggregations),
          dateBuckets: key == "date" ? DATE_BUCKETS : [],
          operators: field.fetch(:operators), options: options.fetch(key, [])
        }
      end
    }
  rescue Sureql::CompileError, Sureql::UnknownSourceError, ActiveRecord::StatementInvalid
    invalid!("catalog", "execution")
  end

  def call(input, pagination: nil, all_columns: false)
    spec = validate!(input)
    page = validate_pagination!(pagination)
    source = source_sql(spec.fetch("filters"))
    return detail_result(source, spec, page: page) if spec["mode"] == "detail"

    currencies = connection.exec_query("SELECT DISTINCT currency FROM (#{source}) AS report_currencies ORDER BY currency").map { |row| row["currency"] }
    monetary = spec.fetch("values").any? { |value| monetary?(value) }
    row_currency = spec.fetch("rows").any? { |dimension| dimension["field"] == "currency" }
    invalid!("rows", "mixed_currencies") if monetary && !row_currency && currencies.size > 1

    sql = report_sql(source, spec, page: page, all_columns: all_columns)
    raw = connection.exec_query(sql).first.fetch("payload")
    payload = raw.is_a?(String) ? JSON.parse(raw) : raw
    aggregate_result(payload, spec, sql: sql, currencies: currencies, row_currency: row_currency)
  rescue Sureql::CompileError, Sureql::UnknownSourceError, ActiveRecord::StatementInvalid
    invalid!("report", "execution")
  end

  private
    # The SQL's pivot matrix is private. Consumers receive named record fields;
    # axes retain only identity/labels, and field metadata owns presentation.
    def aggregate_result(payload, spec, sql:, currencies:, row_currency:)
      measures = spec.fetch("values").map do |value|
        {
          "id" => value.fetch("id"),
          "label" => text("measure_label", field: text("fields.#{value.fetch('field')}"), aggregation: text("aggregations.#{value.fetch('aggregation')}")),
          "format" => monetary?(value) ? "currency" : "number",
          "currency" => monetary?(value) && !row_currency ? currencies.first : nil
        }
      end
      fields = spec.fetch("rows").map do |dimension|
        {
          "key" => dimension.fetch("id"), "field" => dimension.fetch("field"),
          "label" => text("fields.#{dimension.fetch('field')}"),
          "kind" => dimension["field"] == "date" ? "date" : "text",
          "role" => "dimension", "currency" => nil
        }.merge(dimension.slice("dateBucket"))
      end
      row_currency_index = spec.fetch("rows").index { |dimension| dimension["field"] == "currency" }
      column_currency_index = spec.fetch("columns").index { |dimension| dimension["field"] == "currency" }
      value_fields = []
      if spec.fetch("columns").any?
        payload.fetch("columns").each do |column|
          measures.each_with_index do |measure, measure_index|
            fixed_currency = measure["currency"] || (column.fetch("values")[column_currency_index] if column_currency_index)
            field_currencies = measure["format"] == "currency" && fixed_currency.nil? && row_currency ? currencies : [ fixed_currency ]
            field_currencies.each do |currency|
              value_fields << {
                "key" => [ "measure", measure.fetch("id"), column.fetch("key"), currency ].to_json,
                "field" => spec.fetch("values")[measure_index].fetch("field"),
                "label" => [ column.fetch("labels").join(" / "), measure.fetch("label"), currency ].compact_blank.join(" · "),
                "kind" => measure.fetch("format"), "currency" => currency,
                "role" => "value", "measureId" => measure.fetch("id"), "columnKey" => column.fetch("key")
              }
            end
          end
        end
      end
      fields.concat(value_fields)
      measures.each_with_index do |measure, index|
        fields << {
          "key" => measure.fetch("id"), "field" => spec.fetch("values")[index].fetch("field"),
          "label" => measure.fetch("label"), "kind" => measure.fetch("format"),
          "currency" => measure["currency"], "role" => "total", "measureId" => measure.fetch("id")
        }
      end
      cells = payload.fetch("cells").group_by { |cell| cell.fetch("rowKey") }
      fixed_currency = measures.find { |measure| measure["format"] == "currency" }&.fetch("currency")
      measure_indices = measures.each_with_index.to_h { |measure, index| [ measure.fetch("id"), index ] }
      records = payload.fetch("rows").map do |row|
        currency = row_currency_index ? row.fetch("values")[row_currency_index] : fixed_currency
        row["currency"] = currency.to_s
        record = spec.fetch("rows").each_with_index.to_h do |dimension, index|
          value = row.fetch("values")[index]
          [ dimension.fetch("id"), dimension["field"].in?(%w[date currency]) && !value.nil? ? value : row.fetch("labels")[index] ]
        end
        measures.each_with_index { |measure, index| record[measure.fetch("id")] = row.fetch("totals")[index] }
        row.delete("totals")
        row_cells = cells.fetch(row.fetch("key"), []).index_by { |cell| cell.fetch("columnKey") }
        value_fields.each do |field|
          measure_index = measure_indices.fetch(field.fetch("measureId"))
          cell = row_cells[field.fetch("columnKey")]
          record[field.fetch("key")] = field["kind"] == "currency" && field["currency"] && field["currency"] != currency ? nil : cell&.fetch("values")&.[](measure_index)
        end
        record
      end
      {
        "mode" => "aggregate", "sql" => sql, "result" => records,
        "metadata" => {
          "fields" => fields, "rows" => payload.fetch("rows"), "columns" => payload.fetch("columns"),
          "measures" => measures, "grouping" => spec.slice("rows", "columns")
        },
        "truncated" => payload.fetch("truncated"), "pagination" => payload.fetch("pagination")
      }
    end

    def connection
      ActiveRecord::Base.connection
    end

    def text(key, **options)
      I18n.t("report_definition.#{key}", **options)
    end

    def invalid!(field, key, **options)
      raise InvalidError.new(field, text("errors.#{key}", **options))
    end

    def validate_pagination!(input)
      page = input.nil? ? {} : object!(input, "pagination", %w[limit offset])
      limit = page.fetch("limit", DEFAULT_PAGE_SIZE)
      offset = page.fetch("offset", 0)
      invalid!("pagination.limit", "page_limit") unless limit.is_a?(Integer) && limit.positive?
      invalid!("pagination.offset", "page_offset") unless offset.is_a?(Integer) && offset >= 0
      { "limit" => limit, "offset" => offset }
    end

    def object!(value, path, keys)
      value = value.to_unsafe_h if value.is_a?(ActionController::Parameters)
      invalid!(path, "object") unless value.is_a?(Hash)
      value = value.stringify_keys
      invalid!(path, "unknown_property") unless (value.keys - keys).empty?
      value
    end

    def array!(object, key, max, min: 0)
      value = object[key]
      invalid!(key, "array") unless value.is_a?(Array)
      invalid!(key, "size", min: min, max: max) unless value.size.between?(min, max)
      value
    end

    def validate!(input)
      spec = object!(input, "report", %w[version source mode rows columns values filters sort])
      invalid!("version", "version") unless spec["version"] == 1
      invalid!("source", "source") unless spec["source"] == "transactions"
      invalid!("mode", "mode") unless %w[aggregate detail].include?(spec["mode"])
      if spec["mode"] == "detail"
        object!(spec, "report", %w[version source mode columns filters sort])
        validate_detail_columns!(spec)
      else
        validate_aggregate_columns!(spec)
      end
      validate_filters!(spec)
      if spec["mode"] == "detail"
        validate_detail_sort!(spec)
      else
        validate_aggregate_sort!(spec)
      end
      spec
    end

    def validate_aggregate_columns!(spec)
      ids = []
      %w[rows columns].each do |axis|
        spec[axis] = array!(spec, axis, axis == "rows" ? 3 : 2).each_with_index.map do |value, index|
          path = "#{axis}.#{index}"
          dimension = object!(value, path, %w[id field dateBucket])
          validate_id!(dimension, path, ids)
          field = validate_field!(dimension["field"], "#{path}.field")
          invalid!("#{path}.field", "dimension") unless field.fetch(:dimension)
          if dimension.key?("dateBucket")
            invalid!("#{path}.dateBucket", "bucket") unless dimension["field"] == "date" && DATE_BUCKETS.include?(dimension["dateBucket"])
          end
          dimension
        end
      end
      spec["values"] = array!(spec, "values", 3, min: 1).each_with_index.map do |value, index|
        path = "values.#{index}"
        measure = object!(value, path, %w[id field aggregation])
        validate_id!(measure, path, ids)
        field = validate_field!(measure["field"], "#{path}.field")
        invalid!("#{path}.aggregation", "aggregation") unless field.fetch(:aggregations).include?(measure["aggregation"])
        measure
      end
    end

    def validate_filters!(spec)
      spec["filters"] = array!(spec, "filters", 20).each_with_index.map do |value, index|
        path = "filters.#{index}"
        filter = object!(value, path, %w[field operator value unit])
        field = validate_field!(filter["field"], "#{path}.field")
        invalid!("#{path}.operator", "operator") unless field.fetch(:operators).include?(filter["operator"])
        if filter["operator"] == "last"
          invalid!("#{path}.unit", "unit") unless filter["unit"] == "days"
          invalid!("#{path}.value", "days") unless filter["value"].is_a?(Integer) && filter["value"].between?(1, 3660)
        else
          invalid!("#{path}.unit", "unit") if filter.key?("unit")
          valid = filter["value"].is_a?(String)
          valid &&= case filter["field"]
          when "category", "merchant", "tag" then filter["value"].empty? || filter["value"].match?(UUID)
          when "account" then filter["value"].match?(UUID)
          when "currency" then filter["value"].match?(/\A[A-Z]{3,6}\z/)
          end
          invalid!("#{path}.value", "filter_value") unless valid
        end
        filter
      end
    end

    def validate_aggregate_sort!(spec)
      axes = []
      spec["sort"] = array!(spec, "sort", 2).each_with_index.map do |value, index|
        path = "sort.#{index}"
        sort = object!(value, path, %w[axis measure dimension direction])
        axis = sort["axis"]
        invalid!("#{path}.axis", "sort_axis") unless %w[rows columns].include?(axis) && !axes.include?(axis)
        axes << axis
        invalid!("#{path}.direction", "sort_direction") unless %w[asc desc].include?(sort["direction"])
        invalid!(path, "sort_target") unless sort.key?("measure") != sort.key?("dimension")
        if sort.key?("measure")
          invalid!("#{path}.measure", "column_sort") unless axis == "rows"
          invalid!("#{path}.measure", "sort_target") unless spec["values"].any? { |measure| measure["id"] == sort["measure"] }
        else
          invalid!("#{path}.dimension", "sort_target") unless spec[axis].any? { |dimension| dimension["id"] == sort["dimension"] }
        end
        sort
      end
    end

    def validate_detail_columns!(spec)
      fields = []
      spec["columns"] = array!(spec, "columns", MAX_DETAIL_COLUMNS, min: 1).each_with_index.map do |value, index|
        path = "columns.#{index}"
        column = object!(value, path, %w[field])
        field = validate_field!(column["field"], "#{path}.field")
        invalid!("#{path}.field", "detail_field") unless field.fetch(:detail)
        invalid!("#{path}.field", "duplicate_field") if fields.include?(column["field"])
        fields << column["field"]
        column
      end
    end

    def validate_detail_sort!(spec)
      fields = []
      selected = spec.fetch("columns").map { |column| column.fetch("field") }
      spec["sort"] = array!(spec, "sort", MAX_DETAIL_COLUMNS).each_with_index.map do |value, index|
        path = "sort.#{index}"
        sort = object!(value, path, %w[field direction])
        invalid!("#{path}.field", "detail_sort") unless selected.include?(sort["field"]) && !fields.include?(sort["field"])
        invalid!("#{path}.direction", "sort_direction") unless %w[asc desc].include?(sort["direction"])
        fields << sort["field"]
        sort
      end
    end

    def detail_column(field_key)
      field = FIELDS.fetch(field_key)
      column = quote_column(field[:label_column] || field.fetch(:column))
      if field_key == "category"
        "COALESCE(#{column}, #{connection.quote(text('uncategorized'))})"
      elsif field_key == "merchant"
        "COALESCE(#{column}, #{connection.quote(text('no_merchant'))})"
      else
        column
      end
    end

    def detail_result(source, spec, page:)
      columns = spec.fetch("columns")
      selection = columns.each_with_index.map do |column, index|
        key = column.fetch("field")
        expression = detail_column(key)
        expression = "#{expression}::text" if key == "amount"
        expression = "TO_CHAR(#{expression}, 'YYYY-MM-DD')" if key == "date"
        "#{expression} AS value#{index}"
      end
      sorts = spec.fetch("sort").presence || [ { "field" => "date", "direction" => "desc" } ]
      order = sorts.map { |sort| "#{detail_column(sort.fetch('field'))} #{sort.fetch('direction').upcase} NULLS LAST" }
      order << "id ASC"
      sql = <<~SQL
        SELECT id::text, currency, #{selection.join(', ')}
        FROM (#{source}) AS detail_source
        ORDER BY #{order.join(', ')}
        LIMIT #{page.fetch("limit") + 1} OFFSET #{page.fetch("offset")}
      SQL
      rows = connection.exec_query(sql).to_a
      has_next = rows.size > page.fetch("limit")
      rows.pop if has_next
      {
        "mode" => "detail", "sql" => sql,
        "result" => rows.map do |row|
          columns.each_with_index.to_h { |column, index| [ column.fetch("field"), row.fetch("value#{index}") ] }
        end,
        "metadata" => {
          "fields" => columns.map do |column|
            key = column.fetch("field")
            { "key" => key, "field" => key, "label" => text("fields.#{key}"),
              "kind" => key == "amount" ? "currency" : key == "currency" ? "text" : FIELDS.fetch(key).fetch(:kind),
              "role" => "detail", "currency" => nil }
          end,
          "rows" => rows.map { |row| row.slice("id", "currency") }
        },
        "truncated" => false,
        "pagination" => page.merge("hasNext" => has_next)
      }
    end

    def validate_id!(value, path, ids)
      id = value["id"]
      invalid!("#{path}.id", "identifier") unless id.is_a?(String) && id.match?(IDENTIFIER) && !ids.include?(id)
      ids << id
    end

    def validate_field!(key, path)
      invalid!(path, "field") unless key.is_a?(String) && FIELDS.key?(key)
      FIELDS.fetch(key)
    end

    def quote_column(name)
      connection.quote_column_name(name)
    end

    def monetary?(value)
      value["field"] == "amount" && !%w[count count_distinct].include?(value["aggregation"])
    end

    def source_sql(filters = [])
      # No projection mentioning excluded/entryable_type: those words would
      # override the compiler's implicit source predicates.
      base = Sureql::Compiler.new(@user).call("from transactions").strip.delete_suffix(";")
      invalid!("report", "execution") unless base.match?(/\A(?:SELECT|WITH)\b/i) && !base.include?(";")
      sql = <<~SQL.squish
        SELECT e.id, t.id AS transaction_id, e.name, e.amount, e.date, e.currency, t.category_id, c.name AS category_name,
          t.merchant_id, m.name AS merchant_name,
          a.id AS account_id, a.name AS account_name
        FROM (#{base}) AS e
        INNER JOIN transactions AS t ON t.id = e.entryable_id
        INNER JOIN accounts AS a ON a.id = e.account_id
        LEFT JOIN categories AS c ON c.id = t.category_id AND c.family_id = a.family_id
        LEFT JOIN merchants AS m ON m.id = t.merchant_id
      SQL
      predicates = filters.map do |filter|
        if filter["field"] == "tag"
          if filter["value"].empty?
            if filter["operator"] == "equals"
              "NOT EXISTS (SELECT 1 FROM taggings AS tgg WHERE tgg.taggable_type = 'Transaction' AND tgg.taggable_id = t.id)"
            else
              "EXISTS (SELECT 1 FROM taggings AS tgg WHERE tgg.taggable_type = 'Transaction' AND tgg.taggable_id = t.id)"
            end
          else
            quoted = connection.quote(filter.fetch("value"))
            if filter["operator"] == "equals"
              "EXISTS (SELECT 1 FROM taggings AS tgg WHERE tgg.taggable_type = 'Transaction' AND tgg.taggable_id = t.id AND tgg.tag_id = #{quoted})"
            else
              "NOT EXISTS (SELECT 1 FROM taggings AS tgg WHERE tgg.taggable_type = 'Transaction' AND tgg.taggable_id = t.id AND tgg.tag_id = #{quoted})"
            end
          end
        else
          column = "e.#{quote_column(FIELDS.fetch(filter.fetch('field')).fetch(:column))}"
          column = "t.category_id" if filter["field"] == "category"
          column = "t.merchant_id" if filter["field"] == "merchant"
          if filter["operator"] == "last"
            # Match the database's current_date, inclusive, with no future rows.
            "#{column} BETWEEN CURRENT_DATE - #{filter.fetch('value') - 1} AND CURRENT_DATE"
          elsif %w[category merchant].include?(filter["field"]) && filter["value"].empty?
            "#{column} IS #{filter["operator"] == "not_equals" ? "NOT " : ""}NULL"
          elsif filter["operator"] == "not_equals"
            # Null-safe inequality retains uncategorized transactions.
            "#{column} IS DISTINCT FROM #{connection.quote(filter.fetch('value'))}"
          else
            "#{column} = #{connection.quote(filter.fetch('value'))}"
          end
        end
      end
      sql += " WHERE #{predicates.join(' AND ')}" if predicates.any?
      sql
    end

    def dimension_select(dimensions, prefix)
      dimensions.each_with_index.flat_map do |dimension, index|
        field = FIELDS.fetch(dimension.fetch("field"))
        column = quote_column(field.fetch(:column))
        column = "DATE_TRUNC(#{connection.quote(dimension.fetch('dateBucket'))}, #{column})::date" if dimension.key?("dateBucket")
        label = field[:label_column] ? quote_column(field.fetch(:label_column)) : "#{column}::text"
        [ "#{column} AS #{prefix}#{index}", "#{label} AS #{prefix}#{index}_label" ]
      end
    end

    def dimension_columns(dimensions, prefix)
      dimensions.each_index.flat_map { |index| [ "#{prefix}#{index}", "#{prefix}#{index}_label" ] }
    end

    def measure_select(spec)
      spec.fetch("values").each_with_index.map do |value, index|
        column = quote_column(FIELDS.fetch(value.fetch("field"))[:column]) unless value["field"] == "transaction_count"
        expression = case value.fetch("aggregation")
        when "count" then "COUNT(*)"
        when "count_distinct" then "COUNT(DISTINCT #{column})"
        when "sum" then "SUM(#{column})"
        when "average" then "AVG(#{column})"
        when "minimum" then "MIN(#{column})"
        when "maximum" then "MAX(#{column})"
        end
        "#{expression} AS m#{index}"
      end
    end

    def grouped_sql(columns, measures: [], count_presence: false)
      selection = columns + measures
      selection << "COUNT(*) AS source_count" if count_presence
      sql = "SELECT #{selection.join(', ')} FROM dimensional_source"
      sql += " GROUP BY #{columns.join(', ')}" if columns.any?
      sql
    end

    def axis_order(spec, axis, prefix)
      dimensions = spec.fetch(axis)
      sort = spec.fetch("sort").find { |value| value["axis"] == axis }
      order = []
      if sort
        if sort.key?("measure")
          index = spec.fetch("values").index { |value| value["id"] == sort["measure"] }
          order << "m#{index} #{sort.fetch('direction').upcase} NULLS LAST"
        else
          index = dimensions.index { |dimension| dimension["id"] == sort["dimension"] }
          order << "#{prefix}#{index}_label #{sort.fetch('direction').upcase} NULLS LAST"
        end
      end
      dimensions.each_index do |index|
        order << "#{prefix}#{index}_label ASC NULLS LAST"
        order << "#{prefix}#{index} ASC NULLS LAST"
      end
      order.presence&.join(", ") || "source_count"
    end

    def axis_json(dimensions, prefix, totals: nil)
      values = dimensions.each_index.map { |index| "#{prefix}#{index}" }
      labels = dimensions.each_with_index.map do |dimension, index|
        label = "#{prefix}#{index}_label"
        if dimension["field"] == "date" && dimension["dateBucket"] == "month"
          label = "TO_CHAR(#{prefix}#{index}, 'YYYY-MM')"
        end
        fallback = dimension["field"] == "merchant" ? text("no_merchant") : text("uncategorized")
        "COALESCE(#{label}, #{connection.quote(fallback)})"
      end
      json = "'key', jsonb_build_array(#{values.join(', ')})::text, 'values', jsonb_build_array(#{values.join(', ')}), 'labels', jsonb_build_array(#{labels.join(', ')})"
      json += ", 'totals', jsonb_build_array(#{totals.join(', ')})" if totals
      "jsonb_build_object(#{json})"
    end

    def axis_join(dimensions, prefix, alias_name)
      dimensions.each_index.map { |index| "d.#{prefix}#{index} IS NOT DISTINCT FROM #{alias_name}.#{prefix}#{index}" }.presence&.join(" AND ") || "TRUE"
    end

    def report_sql(source, spec, page:, all_columns:)
      rows = spec.fetch("rows")
      columns = spec.fetch("columns")
      row_columns = dimension_columns(rows, "r")
      column_columns = dimension_columns(columns, "c")
      measures = measure_select(spec)
      measure_values = spec.fetch("values").each_index.map { |index| "m#{index}::text" }
      dimensions = dimension_select(rows, "r") + dimension_select(columns, "c")
      dimensional_projection = [ "source.*", *dimensions ].join(", ")
      cell_selection = [ "r.row_rank", "c.column_rank", *row_columns.map { |name| "r.#{name}" }, *column_columns.map { |name| "c.#{name}" }, *measures ]
      cell_groups = [ "r.row_rank", "c.column_rank", *row_columns.map { |name| "r.#{name}" }, *column_columns.map { |name| "c.#{name}" } ]
      <<~SQL
        WITH filtered_source AS MATERIALIZED (#{source}),
        dimensional_source AS MATERIALIZED (SELECT #{dimensional_projection} FROM filtered_source AS source),
        row_groups AS (#{grouped_sql(row_columns, measures: measures, count_presence: true)}),
        column_groups AS (#{grouped_sql(column_columns, count_presence: true)}),
        ranked_rows AS (SELECT *, ROW_NUMBER() OVER (ORDER BY #{axis_order(spec, 'rows', 'r')}) AS row_rank FROM row_groups),
        ranked_columns AS (SELECT *, ROW_NUMBER() OVER (ORDER BY #{axis_order(spec, 'columns', 'c')}) AS column_rank FROM column_groups),
        selected_rows AS (SELECT * FROM ranked_rows WHERE row_rank > #{page.fetch("offset")} AND row_rank <= #{page.fetch("offset") + page.fetch("limit")}),
        selected_columns AS (SELECT * FROM ranked_columns#{all_columns ? "" : " WHERE column_rank <= #{MAX_COLUMNS}"}),
        grouped_cells AS (
          SELECT #{cell_selection.join(', ')} FROM dimensional_source AS d
          INNER JOIN selected_rows AS r ON #{axis_join(rows, 'r', 'r')}
          INNER JOIN selected_columns AS c ON #{axis_join(columns, 'c', 'c')}
          GROUP BY #{cell_groups.join(', ')}
        )
        SELECT jsonb_build_object(
          'rows', COALESCE((SELECT jsonb_agg(#{axis_json(rows, 'r', totals: measure_values)} ORDER BY row_rank) FROM selected_rows), '[]'::jsonb),
          'columns', COALESCE((SELECT jsonb_agg(#{axis_json(columns, 'c')} ORDER BY column_rank) FROM selected_columns), '[]'::jsonb),
          'cells', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'rowKey', jsonb_build_array(#{rows.each_index.map { |index| "r#{index}" }.join(', ')})::text,
            'columnKey', jsonb_build_array(#{columns.each_index.map { |index| "c#{index}" }.join(', ')})::text,
            'values', jsonb_build_array(#{measure_values.join(', ')})) ORDER BY row_rank, column_rank)
            FROM grouped_cells), '[]'::jsonb),
          'pagination', jsonb_build_object(
            'limit', #{page.fetch("limit")}, 'offset', #{page.fetch("offset")},
            'hasNext', EXISTS(SELECT 1 FROM ranked_rows WHERE row_rank > #{page.fetch("offset") + page.fetch("limit")})),
          'truncated', #{all_columns ? "FALSE" : "EXISTS(SELECT 1 FROM ranked_columns WHERE column_rank > #{MAX_COLUMNS})"}
        )::text AS payload
      SQL
    end
end
