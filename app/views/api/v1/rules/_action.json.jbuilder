# frozen_string_literal: true

json.id action.id
json.action_type action.action_type
json.value action.value
json.values Rule::Action.decode_multi_value_names(action.value)
json.created_at action.created_at.iso8601
json.updated_at action.updated_at.iso8601
