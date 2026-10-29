# frozen_string_literal: true

json.partial! "api/v1/categories/category", category: @category
json.workspace Category::ApiWorkspace.new(Current.family).row(@category) if params[:include].to_s.split(",").include?("workspace")
