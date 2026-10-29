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
      parameter name: :include, in: :query, required: false, schema: { type: :string, enum: [ 'workspace' ] },
                description: 'Add documented workspace metadata: provider cards, real grouped account balances, lifecycle permissions and sync controls. The normal accounts and pagination fields remain unchanged.'

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

      response '200', 'accounts with workspace metadata' do
        let(:include) { 'workspace' }
        schema allOf: [
          { '$ref' => '#/components/schemas/AccountCollection' },
          { type: :object, required: [ 'workspace' ], properties: { workspace: { '$ref' => '#/components/schemas/AccountsWorkspace' } } }
        ]
        run_test!
      end
    end

    post 'Create a manual account' do
      description 'Creates manual accounts. Credit cards default to full statement estimates. Set accountable.minimum_payment_only to true for the requested Citi 1% approximation, without separately modeling issuer floors, interest or fees. A payment_due_day is required to enable payment estimates; bank autopay instructions are unchanged.'
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

      response '201', 'credit card created with minimum payment estimates' do
        schema '$ref' => '#/components/schemas/AccountDetail'

        let(:body) do
          {
            account: {
              name: 'Minimum payment card', balance: 1000, currency: 'USD', account_type: 'credit_card',
              accountable: { payment_due_day: 20, minimum_payment_only: true }
            }
          }
        end

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
      parameter name: :include, in: :query, required: false, schema: { type: :string, enum: [ 'workspace' ] },
                description: 'Add the account workspace, including charts, activity pagination, sections, edit prefill and permitted actions; permits reading a disabled account without changing its status.'
      parameter name: :tab, in: :query, required: false, schema: { type: :string, enum: %w[activity overview holdings schedule statements] }
      parameter name: :period, in: :query, required: false, schema: { type: :string }
      parameter name: :chart_view, in: :query, required: false, schema: { type: :string, enum: %w[balance holdings_balance cash_balance gains] }
      parameter name: :start_date, in: :query, required: false, schema: { type: :string, format: :date }
      parameter name: :end_date, in: :query, required: false, schema: { type: :string, format: :date }
      parameter name: :search, in: :query, required: false, schema: { type: :string }
      parameter name: :page, in: :query, required: false, schema: { type: :integer, minimum: 1 }
      parameter name: :per_page, in: :query, required: false, schema: { type: :integer, enum: [ 10, 20, 30, 50, 100 ] }
      parameter name: :statement_year, in: :query, required: false, schema: { type: :integer }
      parameter name: :amount, in: :query, required: false, schema: { type: :number }
      parameter name: :amount_operator, in: :query, required: false, schema: { type: :string, enum: %w[equal greater less] }
      parameter name: :uncategorized, in: :query, required: false, schema: { type: :boolean }
      %w[types status categories tags excluded_categories excluded_tags excluded_types excluded_status].each do |filter|
        parameter name: "#{filter}[]", in: :query, required: false, schema: { type: :array, items: { type: :string } },
                  description: 'Activity filter. Categories and tags use resource UUIDs; types are income/expense/transfer; statuses are confirmed/pending.'
      end

      let(:id) { checking_account.id }

      response '200', 'account retrieved' do
        schema '$ref' => '#/components/schemas/AccountDetail'

        run_test!
      end

      response '200', 'account with workspace metadata' do
        let(:include) { 'workspace' }
        schema allOf: [
          { '$ref' => '#/components/schemas/AccountDetail' },
          { type: :object, required: [ 'workspace' ], properties: { workspace: { '$ref' => '#/components/schemas/AccountWorkspace' } } }
        ]
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

    patch 'Update an account' do
      description 'Updates manual and linked accounts. Credit cards accept accountable.payment_due_day (1–31), or null to disable statement payment estimates. Set accountable.minimum_payment_only to true for the requested Citi 1% approximation or false for full statement payments (the default). This changes expected payments, not the full statement balance, without separately modeling issuer floors, interest or fees. Existing minimum_payment currency metadata is not used. Bank autopay instructions are unchanged.'
      tags 'Accounts'
      security [ { apiKeyAuth: [] } ]
      consumes 'application/json'
      produces 'application/json'
      parameter name: :body, in: :body, required: true,
                schema: { '$ref' => '#/components/schemas/AccountUpdateRequest' }

      let(:id) { checking_account.id }
      let(:body) do
        {
          account: {
            name: 'Renamed checking account',
            balance: 2000.00,
            currency: 'USD',
            notes: 'Updated through the API',
            accountable: { subtype: 'savings' }
          }
        }
      end

      response '200', 'account updated' do
        schema '$ref' => '#/components/schemas/AccountDetail'

        run_test!
      end

      response '200', 'credit card minimum payment estimates enabled' do
        schema '$ref' => '#/components/schemas/AccountDetail'

        let(:id) { credit_card.id }
        let(:body) do
          { account: { accountable: { payment_due_day: 20, minimum_payment_only: true } } }
        end

        run_test!
      end

      response '200', 'credit card full statement payments selected' do
        schema '$ref' => '#/components/schemas/AccountDetail'

        let(:id) { credit_card.id }
        let(:body) { { account: { accountable: { minimum_payment_only: false } } } }

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

        run_test!
      end

      response '422', 'validation failed' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:body) do
          { account: { name: '' } }
        end

        run_test!
      end
    end
  end
  path '/api/v1/accounts/{id}/status' do
    parameter name: :id, in: :path, required: true, schema: { type: :string, format: :uuid }
    let(:id) { checking_account.id }
    patch 'Set an account active or disabled idempotently' do
      description 'Requires owner or full_control permission. Repeating the desired status does not toggle it. Draft and pending-deletion accounts cannot transition through this operation.'
      tags 'Accounts'
      security [ { apiKeyAuth: [] } ]
      consumes 'application/json'
      produces 'application/json'
      parameter name: :body, in: :body, required: true, schema: {
        type: :object, required: [ 'status' ], properties: { status: { type: :string, enum: %w[active disabled] } }
      }
      let(:body) { { status: 'disabled' } }
      response('200', 'desired status applied') { schema '$ref' => '#/components/schemas/AccountDetail'; run_test! }
      response '403', 'write scope required' do
        let(:'X-Api-Key') { api_key_without_read_scope.plain_key }
        schema '$ref' => '#/components/schemas/ErrorResponse'
        run_test!
      end
      response '422', 'invalid target state' do
        let(:body) { { status: 'draft' } }
        schema '$ref' => '#/components/schemas/ErrorResponse'
        run_test!
      end
    end
  end

  path '/api/v1/accounts/{id}/sync' do
    parameter name: :id, in: :path, required: true, schema: { type: :string, format: :uuid }
    let(:id) { checking_account.id }
    post 'Request account provider refresh or manual balance recalculation' do
      tags 'Accounts'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      response('202', 'sync requested') { schema '$ref' => '#/components/schemas/AccountDetail'; run_test! }
    end
  end

  path '/api/v1/accounts/{id}/default' do
    parameter name: :id, in: :path, required: true, schema: { type: :string, format: :uuid }
    let(:id) { checking_account.id }
    patch 'Set the current user transaction default account' do
      description 'Account must be accessible and eligible for transaction defaults. This changes only the authenticated user preference.'
      tags 'Accounts'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      response('200', 'default set') { schema '$ref' => '#/components/schemas/AccountDetail'; run_test! }
    end
    delete 'Remove the current user default if it is this account' do
      tags 'Accounts'
      security [ { apiKeyAuth: [] } ]
      response('204', 'default removed or already unset') { run_test! }
    end
  end

  path '/api/v1/accounts/{id}/provider_options' do
    parameter name: :id, in: :path, required: true, schema: { type: :string, format: :uuid }
    let(:id) { checking_account.id }
    get 'List available providers for linking an unlinked account' do
      description 'Requires owner or full_control account access; returns configured providers supporting this account type and existing-account linking, with SPA connection paths. Does not infer provider identity from account names.'
      tags 'Accounts'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      response('200', 'providers listed') { schema '$ref' => '#/components/schemas/AccountProviderOptions'; run_test! }
    end
  end

  path '/api/v1/accounts/{id}/provider_link' do
    parameter name: :id, in: :path, required: true, schema: { type: :string, format: :uuid }
    let(:id) { checking_account.id }
    delete 'Unlink account providers while preserving financial history' do
      description 'Requires owner or full_control access. Idempotent; retains entries, holdings and balances, disconnects FinanceKit and detaches generic and legacy provider links.'
      tags 'Accounts'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      response('200', 'unlinked or already manual') { schema '$ref' => '#/components/schemas/AccountDetail'; run_test! }
    end
  end

  path '/api/v1/accounts/{id}' do
    parameter name: :id, in: :path, required: true, schema: { type: :string, format: :uuid }
    let(:id) { checking_account.id }
    delete 'Schedule safe deletion of an unlinked account' do
      description 'Requires owner or full_control permission. Linked accounts are rejected; unlink explicitly first. Repeated deletion requests do not enqueue another deletion.'
      tags 'Accounts'
      security [ { apiKeyAuth: [] } ]
      response('204', 'account scheduled for deletion') { run_test! }
    end
  end
end
