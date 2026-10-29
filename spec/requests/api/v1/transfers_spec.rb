# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'API V1 Transfers', type: :request do
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
    ApiKey.new(
      user: user,
      name: 'No Read Docs Key',
      key: key,
      scopes: [],
      source: 'mobile'
    ).tap { |api_key| api_key.save!(validate: false) }
  end

  let(:'X-Api-Key') { api_key.plain_key }
  let(:checking) { family.accounts.create!(name: 'Checking', balance: 1000, currency: 'USD', accountable: Depository.create!) }
  let(:savings) { family.accounts.create!(name: 'Savings', balance: 2500, currency: 'USD', accountable: Depository.create!) }
  let!(:outflow_entry) do
    checking.entries.create!(
      date: Date.current,
      amount: 100,
      name: 'Transfer to savings',
      currency: 'USD',
      entryable: Transaction.new(kind: 'funds_movement')
    )
  end
  let!(:inflow_entry) do
    savings.entries.create!(
      date: Date.current,
      amount: -100,
      name: 'Transfer from checking',
      currency: 'USD',
      entryable: Transaction.new(kind: 'funds_movement')
    )
  end
  let!(:transfer) do
    Transfer.create!(
      outflow_transaction: outflow_entry.entryable,
      inflow_transaction: inflow_entry.entryable,
      status: 'confirmed',
      notes: 'Confirmed by user'
    )
  end

  path '/api/v1/transfers' do
    get 'List transfers' do
      tags 'Transfers'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      parameter name: :page, in: :query, type: :integer, required: false,
                description: 'Page number (default: 1)'
      parameter name: :per_page, in: :query, type: :integer, required: false,
                description: 'Items per page (default: 25, max: 100)'
      parameter name: :status, in: :query, required: false,
                schema: { type: :string, enum: %w[pending confirmed] },
                description: 'Filter by transfer status'
      parameter name: :account_id, in: :query, required: false,
                schema: { type: :string, format: :uuid },
                description: 'Filter transfers involving this account'
      parameter name: :start_date, in: :query, required: false,
                schema: { type: :string, format: :date },
                description: 'Filter transfers from this date'
      parameter name: :end_date, in: :query, required: false,
                schema: { type: :string, format: :date },
                description: 'Filter transfers until this date'

      response '200', 'transfers listed' do
        schema '$ref' => '#/components/schemas/TransferDecisionCollection'

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

      response '422', 'invalid filter' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:status) { 'settled' }

        run_test!
      end
    end

    post 'Create a transfer' do
      tags 'Transfers'
      security [ { apiKeyAuth: [] } ]
      consumes 'application/json'
      produces 'application/json'
      description 'Creates a confirmed transfer through Transfer::Creator, booking a positive source outflow and a negative destination inflow. Amount is denominated in the source account currency; the dated exchange rate converts the destination principal. Source and destination fees are separate expenses in each account currency. Both accounts require owner/full_control access. Future dates retain the domain creator behavior. Reusing an idempotency key with identical details returns the same transfer; changed details return 422.'
      parameter name: :body, in: :body, required: true, schema: {
        type: :object, required: %w[transfer], properties: {
          transfer: {
            type: :object, required: %w[from_account_id to_account_id amount], properties: {
              from_account_id: { type: :string, format: :uuid },
              to_account_id: { type: :string, format: :uuid },
              amount: { type: :string, description: 'Positive source principal as a decimal string.' },
              date: { type: :string, format: :date, description: 'Defaults to today.' },
              exchange_rate: { type: :string, description: 'Optional positive custom destination units per source unit; omitted uses the dated rate.' },
              source_fee_amount: { type: :string, description: 'Nonnegative source-currency fee.' },
              destination_fee_amount: { type: :string, description: 'Nonnegative destination-currency fee, separate from principal.' },
              tag_ids: { type: :array, items: { type: :string, format: :uuid }, description: 'Family tags applied to both legs.' },
              idempotency_key: { type: :string, format: :uuid }
            }
          }
        }
      }
      let(:body) { { transfer: { from_account_id: checking.id, to_account_id: savings.id, amount: '125', date: Date.current.iso8601, idempotency_key: SecureRandom.uuid } } }
      response '201', 'transfer created or matching submission replayed' do
        schema '$ref' => '#/components/schemas/TransferDecision'
        run_test!
      end
      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:'X-Api-Key') { nil }
        run_test!
      end
      response '403', 'write scope or endpoint permission denied' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:api_key) { ApiKey.create!(user: user, name: 'Read docs key', key: ApiKey.generate_secure_key, scopes: %w[read], source: 'web') }
        run_test!
      end
      response '404', 'endpoint account inaccessible' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:body) { { transfer: { from_account_id: checking.id, to_account_id: SecureRandom.uuid, amount: '125' } } }
        run_test!
      end
      response '422', 'invalid date amount fees rate or stale idempotency key' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:body) { { transfer: { from_account_id: checking.id, to_account_id: savings.id, amount: '0' } } }
        run_test!
      end
    end
  end

  path '/api/v1/transfers/form_options' do
    get 'Load transfer creation options' do
      tags 'Transfers'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      description 'Active owner/full_control accounts only, family tags, current date, a fresh submission key, and localized form labels. Available to read-scoped API keys, OAuth and authenticated sessions.'
      response '200', 'transfer options' do
        schema '$ref' => '#/components/schemas/TransferFormOptions'
        run_test!
      end
      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:'X-Api-Key') { nil }
        run_test!
      end
    end
  end

  path '/api/v1/transfers/exchange_rate' do
    get 'Look up a dated transfer exchange rate' do
      tags 'Transfers'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      parameter name: :from_account_id, in: :query, required: true, schema: { type: :string, format: :uuid }
      parameter name: :to_account_id, in: :query, required: true, schema: { type: :string, format: :uuid }
      parameter name: :date, in: :query, required: false, schema: { type: :string, format: :date }
      let(:from_account_id) { checking.id }
      let(:to_account_id) { savings.id }
      response '200', 'destination currency units per source unit' do
        schema type: :object, required: %w[rate], properties: { rate: { type: :string, description: 'Decimal conversion rate; same currency returns 1.0.' } }
        run_test!
      end
      response '404', 'endpoint account is not writable or inaccessible' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:to_account_id) { SecureRandom.uuid }
        run_test!
      end
      response '422', 'invalid date or unavailable rate' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:date) { 'invalid' }
        run_test!
      end
    end
  end

  path '/api/v1/transfers/{id}' do
    parameter name: :id, in: :path, type: :string, required: true, description: 'Transfer ID'

    get 'Retrieve a transfer' do
      tags 'Transfers'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'

      let(:id) { transfer.id }

      response '200', 'transfer retrieved' do
        schema '$ref' => '#/components/schemas/TransferDecision'

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

      response '404', 'transfer not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:id) { SecureRandom.uuid }

        run_test!
      end
    end

    patch 'Update a transfer' do
      tags 'Transactions'
      security [ { apiKeyAuth: [] } ]
      consumes 'application/json'
      produces 'application/json'

      let(:id) { transfer.id }

      parameter name: :body, in: :body, required: true, schema: {
        type: :object,
        properties: {
          transfer: {
            type: :object,
            properties: {
              status: { type: :string, enum: %w[confirmed rejected], description: 'Confirm a pending match, or reject it (removes the match and records the pair as rejected).' },
              notes: { type: :string, nullable: true },
              category_id: { type: :string, format: :uuid, nullable: true },
              tag_ids: { type: :array, items: { type: :string, format: :uuid } }
            }
          }
        },
        required: %w[transfer]
      }

      response '200', 'transfer confirmed' do
        schema '$ref' => '#/components/schemas/TransferDecision'

        let(:body) { { transfer: { status: 'confirmed' } } }

        run_test!
      end

      response '200', 'transfer rejected' do
        schema '$ref' => '#/components/schemas/DeleteResponse'

        let(:body) { { transfer: { status: 'rejected' } } }

        run_test!
      end

      response '422', 'invalid status' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:body) { { transfer: { status: 'pending' } } }

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

      response '404', 'transfer not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:id) { SecureRandom.uuid }

        run_test!
      end
    end
    delete 'Delete a transfer' do
      tags 'Transfers'
      security [ { apiKeyAuth: [] } ]

      let(:id) { transfer.id }

      response '204', 'transfer deleted' do
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

      response '404', 'transfer not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:id) { SecureRandom.uuid }

        run_test!
      end
    end
  end

  path '/api/v1/transfers/{id}/mark_as_recurring' do
    parameter name: :id, in: :path, type: :string, required: true, description: 'Transfer ID'

    post 'Mark transfer as recurring' do
      tags 'Transfers'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'

      let(:id) { transfer.id }

      response '201', 'transfer marked as recurring' do
        schema type: :object,
               required: %w[message recurring_transaction_id],
               properties: {
                 message: { type: :string },
                 recurring_transaction_id: { type: :string, format: :uuid }
               }

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

      response '404', 'transfer not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:id) { SecureRandom.uuid }

        run_test!
      end

      response '409', 'recurring transfer already exists' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        before do
          RecurringTransaction.create_from_transfer(transfer)
        end

        run_test!
      end
    end
  end
end
