# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'API V1 Merchants', type: :request do
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

  let!(:family_merchant) { family.merchants.create!(name: 'Coffee Shop') }

  path '/api/v1/merchants' do
    get 'List merchants' do
      tags 'Merchants'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'

      response '200', 'merchants listed' do
        schema type: :array, items: { '$ref' => '#/components/schemas/MerchantDetail' }

        run_test!
      end
    end

    post 'Create a merchant' do
      tags 'Merchants'
      security [ { apiKeyAuth: [] } ]
      consumes 'application/json'
      produces 'application/json'

      parameter name: :body, in: :body, required: true,
                schema: { '$ref' => '#/components/schemas/MerchantRequest' }

      response '201', 'merchant created' do
        schema '$ref' => '#/components/schemas/MerchantDetail'

        let(:body) do
          {
            merchant: {
              name: 'Bakery',
              color: '#e99537',
              website_url: 'https://bakery.example.com',
              logo_url: 'https://cdn.example.com/bakery.png'
            }
          }
        end

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:'X-Api-Key') { nil }
        run_test!
      end

      response '422', 'validation error' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:body) { { merchant: { name: '' } } }
        run_test!
      end
    end
  end

  path '/api/v1/merchants/import' do
    post 'Import merchants from CSV' do
      tags 'Merchants'
      security [ { apiKeyAuth: [] } ]
      consumes 'multipart/form-data'
      produces 'application/json'

      parameter name: :file, in: :formData, required: true,
                description: 'CSV file with columns: name* (required), color, website_url, logo_url',
                schema: {
                  type: :object,
                  required: [ 'file' ],
                  properties: {
                    file: { type: :string, format: :binary }
                  }
                }

      response '201', 'merchants imported' do
        schema '$ref' => '#/components/schemas/MerchantImportResult'

        let(:file) do
          Rack::Test::UploadedFile.new(
            StringIO.new("name,color,website_url,logo_url\nImported Shop,#e99537,https://shop.example.com,https://cdn.example.com/shop.png"),
            'text/csv',
            true,
            original_filename: 'merchants.csv'
          )
        end

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:'X-Api-Key') { nil }
        let(:file) { nil }
        run_test!
      end

      response '422', 'missing file or invalid CSV' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:file) { nil }
        run_test!
      end
    end
  end

  path '/api/v1/merchants/{id}' do
    parameter name: :id, in: :path, type: :string, required: true, description: 'Merchant ID'

    get 'Retrieve a merchant' do
      tags 'Merchants'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'

      response '200', 'merchant retrieved' do
        schema '$ref' => '#/components/schemas/MerchantDetail'

        let(:id) { family_merchant.id }

        run_test!
      end

      response '404', 'merchant not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:id) { SecureRandom.uuid }

        run_test!
      end
    end

    patch 'Update a merchant' do
      tags 'Merchants'
      security [ { apiKeyAuth: [] } ]
      consumes 'application/json'
      produces 'application/json'

      parameter name: :body, in: :body, required: true,
                schema: { '$ref' => '#/components/schemas/MerchantRequest' }

      let(:id) { family_merchant.id }
      let(:body) do
        {
          merchant: {
            website_url: 'https://coffee.example.com',
            logo_url: 'https://cdn.example.com/coffee.png'
          }
        }
      end

      response '200', 'merchant updated' do
        schema '$ref' => '#/components/schemas/MerchantDetail'
        run_test!
      end

      response '404', 'merchant not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:id) { SecureRandom.uuid }
        run_test!
      end
    end

    delete 'Delete a merchant' do
      tags 'Merchants'
      security [ { apiKeyAuth: [] } ]

      let(:id) { family_merchant.id }

      response '204', 'merchant deleted' do
        run_test!
      end

      response '404', 'merchant not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:id) { SecureRandom.uuid }
        run_test!
      end
    end
  end
end
