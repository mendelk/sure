# frozen_string_literal: true

json.partial! "account", account: @account
json.workspace @workspace if @workspace
