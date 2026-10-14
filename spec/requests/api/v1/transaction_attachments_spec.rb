# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'API V1 Transaction Attachments', type: :request do
  let(:family) do
    Family.create!(name: 'API Family', currency: 'USD', locale: 'en', date_format: '%m-%d-%Y')
  end

  let(:user) do
    family.users.create!(
      email: 'api-attachments@example.com',
      password: 'password123',
      password_confirmation: 'password123'
    )
  end

  let(:api_key) do
    key = ApiKey.generate_secure_key
    ApiKey.create!(user: user, name: 'API Docs Key', key: key, scopes: %w[read_write], source: 'web')
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

  let(:transaction) do
    account.entries.create!(
      name: 'Store purchase',
      date: Date.current,
      amount: 100,
      currency: 'USD',
      entryable: Transaction.new
    ).transaction
  end

  path '/api/v1/transactions/{transaction_id}/attachments' do
    parameter name: :transaction_id, in: :path, required: true, description: 'Parent transaction ID',
              schema: { type: :string, format: :uuid }

    get 'List transaction attachments' do
      tags 'Transactions'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'

      let(:transaction_id) { transaction.id }

      response '200', 'attachments listed' do
        schema type: :object,
          required: %w[attachments],
          properties: {
            attachments: {
              type: :array,
              items: { '$ref' => '#/components/schemas/TransactionAttachment' }
            }
          }

        run_test!
      end

      response '404', 'transaction not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:transaction_id) { SecureRandom.uuid }

        run_test!
      end
    end
  end

  path '/api/v1/transactions/{transaction_id}/attachments/{id}' do
    parameter name: :transaction_id, in: :path, required: true, description: 'Parent transaction ID',
              schema: { type: :string, format: :uuid }
    parameter name: :id, in: :path, required: true, description: 'Attachment ID',
              schema: { type: :integer, format: :int64 }

    delete 'Delete a transaction attachment' do
      tags 'Transactions'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'

      let(:transaction_id) { transaction.id }
      let(:id) { 999999 }

      response '404', 'attachment not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        run_test!
      end
    end
  end
end
