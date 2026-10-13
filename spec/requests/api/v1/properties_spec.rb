# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'API V1 Properties', type: :request do
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

  path '/api/v1/properties/form_options' do
    get 'Retrieve property form options' do
      tags 'Properties'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'

      response '200', 'form options retrieved' do
        schema '$ref' => '#/components/schemas/PropertyFormOptions'

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { nil }

        run_test!
      end

      response '403', 'insufficient scope' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { api_key_without_read_scope.plain_key }

        run_test!
      end
    end
  end

  path '/api/v1/properties/avm_providers' do
    get 'List configured AVM providers' do
      tags 'Properties'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'

      response '200', 'providers listed' do
        schema '$ref' => '#/components/schemas/PropertyAvmProviders'

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { nil }

        run_test!
      end
    end
  end

  path '/api/v1/properties' do
    post 'Create a draft property account (manual wizard step 1)' do
      tags 'Properties'
      security [ { apiKeyAuth: [] }, { oauth2: %w[read_write] } ]
      consumes 'application/json'
      produces 'application/json'
      parameter name: :body, in: :body, schema: {
        type: :object,
        required: %w[account],
        properties: {
          account: {
            type: :object,
            properties: {
              name: { type: :string },
              currency: { type: :string },
              institution_name: { type: :string, nullable: true },
              institution_domain: { type: :string, nullable: true },
              notes: { type: :string, nullable: true },
              accountable_attributes: {
                type: :object,
                properties: {
                  subtype: { type: :string },
                  year_built: { type: :integer, nullable: true },
                  area_unit: { type: :string, nullable: true },
                  area_value: { type: :integer, nullable: true }
                }
              }
            }
          }
        }
      }

      response '201', 'draft property created' do
        schema '$ref' => '#/components/schemas/PropertyAccountRef'

        let(:body) do
          { account: { name: 'Lake Cabin', accountable_attributes: { subtype: 'second_home' } } }
        end

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { nil }
        let(:body) do
          { account: { name: 'Lake Cabin', accountable_attributes: { subtype: 'second_home' } } }
        end

        run_test!
      end

      response '422', 'validation failed' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:body) { { account: { name: '' } } }

        run_test!
      end
    end
  end

  path '/api/v1/properties/{id}/address' do
    patch 'Save the property address, activating a draft account (manual wizard step 3)' do
      tags 'Properties'
      security [ { apiKeyAuth: [] }, { oauth2: %w[read_write] } ]
      consumes 'application/json'
      produces 'application/json'
      parameter name: :id, in: :path, type: :string, format: :uuid
      parameter name: :body, in: :body, schema: {
        type: :object,
        required: %w[property],
        properties: {
          property: {
            type: :object,
            properties: {
              address_attributes: {
                type: :object,
                properties: {
                  line1: { type: :string },
                  line2: { type: :string, nullable: true },
                  locality: { type: :string },
                  region: { type: :string },
                  country: { type: :string },
                  postal_code: { type: :string },
                  county: { type: :string, nullable: true }
                }
              }
            }
          }
        }
      }

      response '200', 'address saved' do
        schema '$ref' => '#/components/schemas/PropertyAccountRef'

        let(:id) do
          family.accounts.create!(
            name: 'Draft Cabin',
            balance: 0,
            status: 'draft',
            owner: user,
            currency: family.currency,
            accountable: Property.new(subtype: 'second_home')
          ).id
        end
        let(:body) do
          { property: { address_attributes: { line1: '123 Main St', locality: 'Austin', region: 'TX', country: 'US', postal_code: '78701' } } }
        end

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:id) { SecureRandom.uuid }
        let(:'X-Api-Key') { nil }
        let(:body) do
          { property: { address_attributes: { line1: '123 Main St' } } }
        end

        run_test!
      end

      response '404', 'not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:id) { SecureRandom.uuid }
        let(:body) do
          { property: { address_attributes: { line1: '123 Main St' } } }
        end

        run_test!
      end
    end
  end

  path '/api/v1/properties/avm_lookup' do
    post 'Look up a property valuation (AVM step 1, spends one provider request)' do
      tags 'Properties'
      security [ { apiKeyAuth: [] }, { oauth2: %w[read_write] } ]
      consumes 'application/json'
      produces 'application/json'
      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: {
          avm_provider: { type: :string },
          account: {
            type: :object,
            properties: {
              name: { type: :string },
              address: {
                type: :object,
                properties: {
                  line1: { type: :string },
                  locality: { type: :string },
                  region: { type: :string },
                  postal_code: { type: :string }
                }
              }
            }
          }
        }
      }

      response '200', 'preview returned' do
        schema '$ref' => '#/components/schemas/PropertyAvmPreview'

        let(:body) do
          {
            avm_provider: 'rentcast',
            account: {
              name: 'AVM Home',
              address: { line1: '5500 Grand Lake Dr', locality: 'San Antonio', region: 'TX', postal_code: '78244' }
            }
          }
        end

        before do
          valuation = Provider::PropertyValuationConcept::PropertyValuation.new(
            valuation: 356_000, currency: 'USD', property_type: 'single_family_home',
            year_built: 1973, area_value: 1878, area_unit: 'sqft'
          )
          provider = instance_double(Provider::Rentcast)
          allow(provider).to receive(:fetch_property_valuation).and_return(
            Provider::Response.new(success?: true, data: valuation, error: nil)
          )
          allow(Provider::Registry).to receive(:for_concept).with(:property_valuations).and_return(
            instance_double(Provider::Registry, provider_keys: %w[rentcast], get_provider: provider)
          )
        end

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { nil }
        let(:body) do
          {
            avm_provider: 'rentcast',
            account: {
              name: 'AVM Home',
              address: { line1: '1 Main St', locality: 'Austin', region: 'TX', postal_code: '78701' }
            }
          }
        end

        run_test!
      end

      response '422', 'validation failed' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:body) do
          { avm_provider: 'rentcast', account: { name: '', address: { line1: '' } } }
        end

        run_test!
      end
    end
  end

  path '/api/v1/properties/avm_confirm' do
    post 'Confirm an AVM preview from the signed token (AVM step 2, no provider request)' do
      tags 'Properties'
      security [ { apiKeyAuth: [] }, { oauth2: %w[read_write] } ]
      consumes 'application/json'
      produces 'application/json'
      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: {
          avm_provider: { type: :string },
          avm_preview_token: { type: :string },
          account: { type: :object }
        }
      }

      response '201', 'property created' do
        schema '$ref' => '#/components/schemas/PropertyAccountRef'

        let(:body) do
          {
            avm_provider: 'rentcast',
            avm_preview_token: Rails.application.message_verifier(:avm_preview).generate(
              {
                'provider_key' => 'rentcast',
                'name' => 'AVM Home',
                'address' => {
                  'line1' => '5500 Grand Lake Dr',
                  'locality' => 'San Antonio',
                  'region' => 'TX',
                  'postal_code' => '78244'
                },
                'data' => {
                  'valuation' => '356000.0',
                  'currency' => 'USD',
                  'property_type' => 'single_family_home',
                  'year_built' => '1973',
                  'area_value' => '1878',
                  'area_unit' => 'sqft'
                }
              },
              expires_in: 1.hour,
              purpose: "avm_preview/family/#{family.id}"
            ),
            account: { accountable_type: 'Property' }
          }
        end

        before do
          allow(Provider::Registry).to receive(:for_concept).with(:property_valuations).and_return(
            instance_double(Provider::Registry, provider_keys: %w[rentcast], get_provider: nil)
          )
        end

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { nil }
        let(:body) { { avm_provider: 'rentcast', avm_preview_token: 'expired' } }

        run_test!
      end

      response '422', 'validation failed' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:body) { { avm_provider: 'rentcast', avm_preview_token: 'expired' } }

        run_test!
      end
    end
  end
end
