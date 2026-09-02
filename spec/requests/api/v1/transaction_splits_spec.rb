# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'API V1 Transaction Splits', type: :request do
  let(:family) do
    Family.create!(name: 'API Family', currency: 'USD', locale: 'en', date_format: '%m-%d-%Y')
  end

  let(:user) do
    family.users.create!(
      email: 'api-splits@example.com',
      password: 'password123',
      password_confirmation: 'password123'
    )
  end

  let(:api_key) do
    key = ApiKey.generate_secure_key
    ApiKey.create!(user: user, name: 'API Docs Key', key: key, scopes: %w[read_write], source: 'web')
  end

  let(:read_only_api_key) do
    key = ApiKey.generate_secure_key
    ApiKey.create!(user: user, name: 'Read Only Docs Key', key: key, scopes: %w[read], source: 'mobile')
  end

  let(:'X-Api-Key') { api_key.plain_key }

  let(:account) do
    Account.create!(
      family: family,
      owner: user,
      name: 'Checking Account',
      balance: 1000,
      currency: 'USD',
      accountable: Depository.create!
    )
  end

  let(:category) { family.categories.create!(name: 'Groceries', color: '#4CAF50') }

  let(:transaction) do
    account.entries.create!(
      name: 'Store purchase',
      date: Date.current,
      amount: 100,
      currency: 'USD',
      entryable: Transaction.new
    ).transaction
  end

  path '/api/v1/transactions/{transaction_id}/split' do
    parameter name: :transaction_id, in: :path, required: true, description: 'Parent transaction ID',
              schema: { type: :string, format: :uuid }

    post 'Split a transaction' do
      tags 'Transactions'
      security [ { apiKeyAuth: [] } ]
      consumes 'application/json'
      produces 'application/json'
      parameter name: :body, in: :body, required: true,
                schema: { '$ref' => '#/components/schemas/TransactionSplitRequest' }

      let(:transaction_id) { transaction.id }
      let(:body) do
        {
          split: {
            splits: [
              { name: 'Groceries', amount: -70, category_id: category.id },
              { name: 'Household', amount: -30, excluded: false }
            ]
          }
        }
      end

      response '201', 'transaction split' do
        schema '$ref' => '#/components/schemas/TransactionSplit'

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { nil }

        run_test!
      end

      response '403', 'insufficient scope' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { read_only_api_key.plain_key }

        run_test!
      end

      response '404', 'transaction not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:transaction_id) { SecureRandom.uuid }

        run_test!
      end

      response '422', 'split amounts do not match parent' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:body) do
          { split: { splits: [ { name: 'Part one', amount: -60 }, { name: 'Part two', amount: -20 } ] } }
        end

        run_test!
      end
    end
  end
end
