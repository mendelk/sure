# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'API V1 Home', type: :request do
  let(:family) do
    Family.create!(
      name: 'API Family',
      currency: 'USD',
      locale: 'en',
      date_format: '%m-%d-%Y'
    )
  end

  let(:user) do
    family.users.create!(
      email: 'home-api@example.com',
      password: 'password123',
      password_confirmation: 'password123',
      preferences: { 'preview_features_enabled' => true }
    )
  end

  let(:api_key) do
    key = ApiKey.generate_secure_key
    ApiKey.create!(
      user: user,
      name: 'API Docs Key',
      key: key,
      scopes: %w[read_write],
      source: 'web'
    )
  end

  let(:'X-Api-Key') { api_key.plain_key }

  path '/api/v1/home' do
    get 'Show home dashboard payload' do
      tags 'Home'
      description 'Returns the server-rendered home dashboard payload: ordered sections with ' \
                  'layout overrides, plus balance sheet, net worth, cashflow sankey, checking-only cash forecast, ' \
                  'money flow, spending trend, outflows, investment summary, and the preview-gated insights feed. ' \
                  'The cash forecast excludes savings and other non-checking accounts. ' \
                  'Supports the same period and money-flow/spending-month query params as the ERB dashboard.'
      parameter name: :period, in: :query, required: false, schema: { type: :string }, description: 'Period key (e.g. last_30_days).'
      parameter name: :start_date, in: :query, required: false, schema: { type: :string, format: :date }, description: 'Custom period start (requires end_date).'
      parameter name: :end_date, in: :query, required: false, schema: { type: :string, format: :date }, description: 'Custom period end (requires start_date).'
      parameter name: :money_flow_month, in: :query, required: false, schema: { type: :string, format: :date }, description: 'Selected money-flow month (YYYY-MM-01); future months clamp to the current month.'
      parameter name: 'money_flow_account_ids[]', in: :query, required: false, schema: { type: :array, items: { type: :string } }, collectionFormat: :multi, description: 'Subset filter for the money-flow widget.'
      parameter name: :spending_month, in: :query, required: false, schema: { type: :string, format: :date }, description: 'Selected spending-trend month (YYYY-MM-01); future months clamp to the current month.'
      security [ { apiKeyAuth: [] }, { cookieSession: [] } ]
      produces 'application/json'

      response '200', 'home payload returned' do
        schema '$ref' => '#/components/schemas/HomeResponse'

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { 'invalid-key' }

        run_test!
      end
    end
  end
end
