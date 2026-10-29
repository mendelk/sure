# frozen_string_literal: true

# Read-only report execution. All SQL is compiled and tenant-scoped by the
# same SureQL domain objects used by the report builder and playground.
class Api::V1::ReportsController < Api::V1::BaseController
  # The explicit report root selects structured execution. Rails' inferred
  # singular wrapper must not manufacture that root for SureQL/pivot bodies.
  wrap_parameters false

  before_action :ensure_read_scope

  rescue_from Sureql::ReportDefinition::InvalidError, Sureql::Pivot::InvalidError, with: :render_invalid_definition
  rescue_from Sureql::UnknownSourceError, Sureql::CompileError, with: :render_query_error
  rescue_from ActiveRecord::StatementInvalid, with: :render_database_error

  def catalog
    render json: reports.catalog
  end

  def compile
    render json: { sql: Sureql::Compiler.new(current_resource_owner).call(query_source) }
  end

  def run
    if params.key?(:catalog)
      unless params[:catalog] == true && !params.key?(:report)
        raise Sureql::ReportDefinition::InvalidError.new("catalog", I18n.t("report_definition.errors.catalog"))
      end
      render json: reports.catalog
    elsif params.key?(:report)
      render json: reports.call(params[:report], pagination: params[:pagination], all_columns: params[:all_columns] == true)
    elsif params[:pivot].present?
      render json: pivot_result
    else
      result = Sureql::Executor.new(current_resource_owner).call(query_source, pagination: params[:pagination])
      render json: {
        sql: result.sql,
        columns: result.columns,
        rows: result.rows,
        row_count: result.row_count,
        truncated: result.truncated,
        fields: result.fields.map(&:to_h),
        pagination: result.pagination
      }
    end
  end

  private
    def reports
      Sureql::ReportDefinition.new(current_resource_owner)
    end

    def query_source
      source = params.require(:source)
      raise Sureql::CompileError, "Source must be a SureQL string." unless source.is_a?(String)
      source
    end

    def pivot_result
      unless params[:pivot].is_a?(ActionController::Parameters)
        raise Sureql::Pivot::InvalidError.new("pivot", "Pivot must be an object.")
      end
      result = Sureql::Pivot.new(current_resource_owner).call(query_source, params[:pivot])
      columns = [ "pivot_category" ]
      columns << "pivot_series" if result.series.any?
      columns.concat(result.rows.first&.keys&.select { |key| key.start_with?("measure_") } || [])
      {
        sql: result.sql,
        categories: result.categories,
        series: result.series,
        measures: result.measures,
        columns: columns,
        rows: result.rows,
        row_count: result.row_count,
        truncated: result.truncated,
        fields: result.fields
      }
    end

    def render_invalid_definition(error)
      render json: { error: error.message, field: error.field }, status: :unprocessable_entity
    end

    def render_query_error(error)
      render json: { error: error.message }, status: :unprocessable_entity
    end

    def render_database_error(error)
      Rails.logger.warn("[sureql] API execution failed: #{error.message.truncate(500)}")
      render_query_error(error)
    end
end
