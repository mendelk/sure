require 'swagger_helper'

RSpec.describe 'API V1 User Preferences', type: :request do
  let(:family) { Family.create!(name: 'Preference API', currency: 'USD', locale: 'en') }
  let(:user) { family.users.create!(email: 'period-docs@example.com', password: 'Password123!') }
  let(:scopes) { %w[read_write] }
  let(:api_key) do
    key = ApiKey.generate_secure_key
    ApiKey.create!(user: user, name: 'API Docs Key', key: key, scopes: scopes, source: 'web')
  end
  let(:'X-Api-Key') { api_key.plain_key }

  path '/api/v1/user_preferences' do
    patch 'Persist an explicit default reporting period selection' do
      description 'Changes only the authenticated user default period. Account workspace GET requests and polling never persist preferences. Browser-session writes require CSRF.'
      tags 'User Preferences'
      security [ { apiKeyAuth: [] } ]
      consumes 'application/json'
      produces 'application/json'
      parameter name: :body, in: :body, required: true, schema: {
        type: :object, required: [ 'preferences' ], properties: {
          preferences: { type: :object, required: [ 'default_period' ], properties: {
            default_period: { type: :string, enum: Period::PERIODS.keys }
          } }
        }
      }
      let(:body) { { preferences: { default_period: 'last_30_days' } } }
      response '200', 'preference saved' do
        schema type: :object, required: [ 'preferences' ], properties: {
          preferences: { type: :object, required: [ 'default_period' ], properties: { default_period: { type: :string } } }
        }
        run_test!
      end
      response '401', 'authentication required' do
        let(:'X-Api-Key') { nil }
        schema '$ref' => '#/components/schemas/ErrorResponse'
        run_test!
      end
      response '403', 'write scope required' do
        let(:scopes) { %w[read] }
        schema '$ref' => '#/components/schemas/ErrorResponse'
        run_test!
      end
      response '400', 'preference object required' do
        let(:body) { {} }
        schema '$ref' => '#/components/schemas/ErrorResponse'
        run_test!
      end
      response '422', 'invalid period' do
        let(:body) { { preferences: { default_period: 'unknown' } } }
        schema '$ref' => '#/components/schemas/ErrorResponse'
        run_test!
      end
    end
  end
end
