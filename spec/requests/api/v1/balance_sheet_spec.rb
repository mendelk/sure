# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'API V1 Balance Sheet', type: :request do
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
      email: 'api-user@example.com',
      password: 'password123',
      password_confirmation: 'password123'
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

  path '/api/v1/balance_sheet' do
    get 'Show balance sheet' do
      tags 'Balance Sheet'
      description 'Returns the family balance sheet including net worth, total assets, and total liabilities ' \
                  'with amounts converted to the family\'s primary currency, plus the bounded dashboard payload ' \
                  '(net-worth trend, grouped account summaries, sync state). See docs/api/dashboard.md for the ' \
                  'dashboard request plan, currency/date semantics, and empty/stale/syncing states.'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      parameter name: :period, in: :query, required: false,
                description: 'Trend period (default: last_30_days)',
                schema: { type: :string, enum: %w[last_7_days last_30_days last_90_days last_365_days current_month current_year] }

      response '200', 'balance sheet returned' do
        schema '$ref' => '#/components/schemas/BalanceSheet'

        run_test!
      end

      response '200', 'balance sheet with bounded trend period' do
        schema '$ref' => '#/components/schemas/BalanceSheet'

        let(:period) { 'last_7_days' }

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { 'invalid-key' }

        run_test!
      end

      response '422', 'invalid period' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:period) { 'last_decade' }

        run_test!
      end
    end
  end
end
