# frozen_string_literal: true

json.partial! "valuation", valuation: @valuation
if params[:include].to_s.split(",").include?("workspace")
  json.workspace Valuation::PageData.new(
    entry: @entry, accounts: [ @entry.account ], permissions: account_permissions(@entry.account)
  ).as_json
end
