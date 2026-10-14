# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'API V1 Search', type: :request do
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

  path '/api/v1/search' do
    get 'Global search' do
      tags 'Search'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      parameter name: :q, in: :query, type: :string, required: false,
        description: 'Free-text query matched against accounts, transactions, categories and merchants'
      parameter name: :per_type, in: :query, type: :integer, required: false,
        description: 'Max hits per type (default 6, max 20)'

      response '200', 'grouped search results' do
        schema '$ref' => '#/components/schemas/GlobalSearchResults'

        run_test!
      end
    end
  end
end
