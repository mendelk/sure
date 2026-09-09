# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'API V1 Accounts', type: :request do
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

  let!(:checking_account) do
    Account.create!(
      family: family,
      owner: user,
      name: 'Checking Account',
      balance: 1500.50,
      currency: 'USD',
      accountable: Depository.create!
    )
  end

  let!(:savings_account) do
    Account.create!(
      family: family,
      owner: user,
      name: 'Savings Account',
      balance: 10000.00,
      currency: 'USD',
      accountable: Depository.create!
    )
  end

  let!(:credit_card) do
    Account.create!(
      family: family,
      owner: user,
      name: 'Credit Card',
      balance: -500.00,
      currency: 'USD',
      accountable: CreditCard.create!
    )
  end

  let!(:updatable_account) do
    Account.create!(
      family: family,
      owner: user,
      name: 'Updatable Account',
      balance: 2500.00,
      currency: 'USD',
      accountable: Depository.create!
    )
  end

  let!(:archivable_account) do
    Account.create!(
      family: family,
      owner: user,
      name: 'Archivable Account',
      balance: 750.00,
      currency: 'USD',
      accountable: Depository.create!
    )
  end

  let!(:deletable_account) do
    Account.create!(
      family: family,
      owner: user,
      name: 'Deletable Account',
      balance: 100.00,
      currency: 'USD',
      accountable: Depository.create!
    )
  end

  path '/api/v1/accounts' do
    get 'List accounts' do
      tags 'Accounts'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      parameter name: :page, in: :query, type: :integer, required: false,
                description: 'Page number (default: 1)'
      parameter name: :per_page, in: :query, type: :integer, required: false,
                description: 'Items per page (default: 25, max: 100)'
      parameter name: :include_disabled, in: :query, type: :boolean, required: false,
                description: 'Include disabled accounts in the response. Defaults to false.'

      response '200', 'accounts listed' do
        schema '$ref' => '#/components/schemas/AccountCollection'

        run_test!
      end

      response '200', 'accounts paginated' do
        schema '$ref' => '#/components/schemas/AccountCollection'

        let(:page) { 1 }
        let(:per_page) { 2 }

        run_test!
      end
    end

    post 'Create a manual account' do
      tags 'Accounts'
      security [ { apiKeyAuth: [] } ]
      consumes 'application/json'
      produces 'application/json'
      parameter name: :body, in: :body, required: true,
                schema: { '$ref' => '#/components/schemas/AccountCreateRequest' }

      let(:body) do
        {
          account: {
            name: 'API checking account',
            balance: 1250.75,
            currency: 'USD',
            account_type: 'depository',
            subtype: 'checking',
            opening_balance_date: Date.current.to_s,
            institution_name: 'Example Bank'
          }
        }
      end

      response '201', 'account created' do
        schema '$ref' => '#/components/schemas/AccountDetail'

        run_test!
      end

      response '403', 'insufficient scope' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { api_key_without_read_scope.plain_key }

        run_test!
      end

      response '422', 'invalid account type' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:body) do
          { account: { name: 'Invalid account', balance: 0, account_type: 'bank' } }
        end

        run_test!
      end
    end
  end

  path '/api/v1/accounts/{id}' do
    parameter name: :id, in: :path, required: true, description: 'Account ID',
              schema: { type: :string, format: :uuid }

    get 'Retrieve an account' do
      tags 'Accounts'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      parameter name: :include_disabled, in: :query, type: :boolean, required: false,
                description: 'Allow retrieving a disabled account. Defaults to false.'

      let(:id) { checking_account.id }

      response '200', 'account retrieved' do
        schema '$ref' => '#/components/schemas/AccountDetail'

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:id) { checking_account.id }
        let(:'X-Api-Key') { nil }

        run_test!
      end

      response '403', 'insufficient scope' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:id) { checking_account.id }
        let(:'X-Api-Key') { api_key_without_read_scope.plain_key }

        run_test!
      end

      response '404', 'account not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:id) { SecureRandom.uuid }

        run_test!
      end
    end

    patch 'Update a manual account' do
      tags 'Accounts'
      security [ { apiKeyAuth: [] } ]
      consumes 'application/json'
      produces 'application/json'
      parameter name: :body, in: :body, required: true,
                schema: { '$ref' => '#/components/schemas/AccountUpdateRequest' }

      let(:id) { updatable_account.id }
      let(:body) do
        {
          account: {
            name: 'Updated Account',
            balance: 3000.00,
            currency: 'USD'
          }
        }
      end

      response '200', 'account updated' do
        schema '$ref' => '#/components/schemas/AccountDetail'

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { nil }

        run_test!
      end

      response '400', 'missing account payload' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:body) { {} }

        run_test!
      end

      response '403', 'insufficient scope' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { api_key_without_read_scope.plain_key }

        run_test!
      end

      response '404', 'account not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:id) { SecureRandom.uuid }

        run_test!
      end

      response '422', 'invalid account' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:body) { { account: { name: '' } } }

        run_test!
      end
    end

    delete 'Delete a manual account' do
      tags 'Accounts'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      parameter name: :confirm, in: :query, type: :boolean, required: true,
                description: 'Must be true to confirm deletion. Deleted accounts are marked for deletion.'

      let(:id) { deletable_account.id }
      let(:confirm) { true }

      response '200', 'account deleted' do
        schema '$ref' => '#/components/schemas/DeleteResponse'

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

      response '404', 'account not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:id) { SecureRandom.uuid }
        let(:confirm) { true }

        run_test!
      end

      response '422', 'confirmation required' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:confirm) { false }

        run_test!
      end
    end
  end

  path '/api/v1/accounts/{id}/archive' do
    parameter name: :id, in: :path, required: true, description: 'Account ID',
              schema: { type: :string, format: :uuid }

    post 'Archive a manual account' do
      tags 'Accounts'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      parameter name: :confirm, in: :query, type: :boolean, required: true,
                description: 'Must be true to confirm archiving. Archived accounts are disabled.'

      let(:id) { archivable_account.id }
      let(:confirm) { true }

      response '200', 'account archived' do
        schema '$ref' => '#/components/schemas/AccountDetail'

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

      response '404', 'account not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:id) { SecureRandom.uuid }
        let(:confirm) { true }

        run_test!
      end

      response '422', 'confirmation required' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:confirm) { false }

        run_test!
      end
    end
  end
end
