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

  let(:transaction_id) { transaction.id }
  let(:stored_attachment) do
    transaction.attachments.attach(io: StringIO.new('%PDF-1.4 receipt'), filename: 'receipt.pdf', content_type: 'application/pdf')
    transaction.attachments.last
  end
  let(:id) { stored_attachment.id }

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

    post 'Upload transaction attachments' do
      tags 'Transactions'
      security [ { apiKeyAuth: [] } ]
      consumes 'multipart/form-data'
      produces 'application/json'
      description 'Upload receipt files using attachments[] (multiple) or attachment (single); at least one file is required. Requires write scope and owner/full_control/read_write account permission. Enforces transaction attachment count, size and content-type limits.'
      parameter name: :'attachments[]', in: :formData, required: false,
                schema: { type: :array, items: { type: :string, format: :binary } }
      parameter name: :attachment, in: :formData, required: false, schema: { type: :string, format: :binary }
      let(:attachment) { nil }
      let(:'attachments[]') { [ Rack::Test::UploadedFile.new(Rails.root.join('test/fixtures/files/test.txt'), 'application/pdf') ] }

      response '201', 'files uploaded' do
        schema type: :object, required: %w[message attachments], properties: {
          message: { type: :string },
          attachments: { type: :array, items: { '$ref' => '#/components/schemas/TransactionAttachment' }, description: 'Current attachments after upload, including existing files.' }
        }
        run_test!
      end
      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:'X-Api-Key') { nil }
        run_test!
      end
      response '403', 'account does not allow uploads or key lacks write scope' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:api_key) { ApiKey.create!(user: user, name: 'Read docs key', key: ApiKey.generate_secure_key, scopes: %w[read], source: 'web') }
        run_test!
      end
      response '422', 'no files selected or attachment validation failed' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:'attachments[]') { [] }
        run_test!
      end
    end
  end

  path '/api/v1/transactions/{transaction_id}/attachments/{id}' do
    parameter name: :transaction_id, in: :path, required: true, description: 'Parent transaction ID',
              schema: { type: :string, format: :uuid }
    parameter name: :id, in: :path, required: true, description: 'Attachment ID',
              schema: { type: :integer, format: :int64 }

    get 'Open or download an attachment' do
      tags 'Transactions'
      security [ { apiKeyAuth: [] } ]
      description 'Authorized binary navigation, not JSON data. Redirects to the signed Active Storage blob URL; open this URL in a browser or download client. JSON mutation clients must not treat redirects as success.'
      parameter name: :disposition, in: :query, required: false,
                schema: { type: :string, enum: %w[inline attachment], default: 'inline' }
      response '302', 'redirect to binary blob' do
        header 'Location', schema: { type: :string }, description: 'Signed blob URL with the selected disposition.'
        run_test!
      end
      response '404', 'attachment or transaction inaccessible' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:id) { 999999 }
        run_test!
      end
    end

    delete 'Delete a transaction attachment' do
      tags 'Transactions'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      description 'Requires write scope and owner/full_control account permission. Read_write annotation permission permits upload but not deletion.'

      response '200', 'attachment purged' do
        schema '$ref' => '#/components/schemas/DeleteResponse'
        let(:id) { stored_attachment.id }
        run_test!
      end

      let(:transaction_id) { transaction.id }
      let(:id) { 999999 }

      response '404', 'attachment not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        run_test!
      end
    end
  end
end
