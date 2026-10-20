# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'API V1 Account Link Options', type: :request do
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

  let(:api_key_without_read_scope) do
    key = ApiKey.generate_secure_key
    # Valid persisted API keys can only be read/read_write; this intentionally
    # bypasses validations to document the runtime insufficient-scope response.
    ApiKey.new(
      user: user,
      name: 'No Read Docs Key',
      key: key,
      scopes: %w[write],
      source: 'web',
      display_key: "docs_no_read_#{SecureRandom.hex(8)}"
    ).tap { |api_key| api_key.save!(validate: false) }
  end

  let(:'X-Api-Key') { api_key.plain_key }

  path '/api/v1/account_link_options' do
    get 'Retrieve account link options' do
      tags 'Accounts'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      parameter name: :account_type, in: :query, type: :string, required: true,
                description: 'Underscore account type (e.g. depository, credit_card)'

      response '200', 'link options retrieved' do
        schema '$ref' => '#/components/schemas/AccountLinkOptions'

        let(:account_type) { 'depository' }

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { nil }
        let(:account_type) { 'depository' }

        run_test!
      end

      response '403', 'insufficient scope' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { api_key_without_read_scope.plain_key }
        let(:account_type) { 'depository' }

        run_test!
      end

      response '422', 'invalid account type' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:account_type) { 'bogus' }

        run_test!
      end
    end
  end
end
