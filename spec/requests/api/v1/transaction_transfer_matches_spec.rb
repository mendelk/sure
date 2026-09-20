# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'API V1 Transaction Transfer Matches', type: :request do
  let(:family) do
    Family.create!(
      name: 'API Family',
      currency: 'USD',
      locale: 'en',
      date_format: '%m-%d-%Y'
    )
  end

  # Created eagerly (let!) so the account fixtures below get a default owner
  # via Account#assign_default_owner, keeping Account.accessible_by matching.
  let!(:user) do
    family.users.create!(
      email: 'api-user@example.com',
      password: 'password123',
      password_confirmation: 'password123',
      role: 'admin'
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

  let(:checking) { family.accounts.create!(name: 'Checking', balance: 1000, currency: 'USD', accountable: Depository.create!) }
  let(:savings) { family.accounts.create!(name: 'Savings', balance: 2500, currency: 'USD', accountable: Depository.create!) }

  # The transaction to be matched: an outflow on checking
  let!(:outflow_entry) do
    checking.entries.create!(
      date: Date.current,
      amount: 100,
      name: 'Payment to savings',
      currency: 'USD',
      entryable: Transaction.new
    )
  end

  # A candidate inflow sitting unpaired on savings
  let!(:inflow_entry) do
    savings.entries.create!(
      date: Date.current,
      amount: -100,
      name: 'Deposit from checking',
      currency: 'USD',
      entryable: Transaction.new
    )
  end

  path '/api/v1/transactions/{transaction_id}/transfer_match_candidates' do
    parameter name: :transaction_id, in: :path, schema: { type: :string, format: :uuid }, required: true, description: 'Transaction ID'

    get 'List transfer match candidates' do
      tags 'Transactions'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'

      let(:transaction_id) { outflow_entry.entryable.id }

      response '200', 'candidates listed' do
        schema '$ref' => '#/components/schemas/TransferMatchCandidateCollection'

        run_test! do |response|
          body = JSON.parse(response.body)
          expect(body['candidates']).to be_an(Array)
          candidate = body['candidates'].find do |c|
            c['outflow_transaction_id'] == outflow_entry.entryable_id && c['inflow_transaction_id'] == inflow_entry.entryable_id
          end
          expect(candidate).to be_present
          expect(candidate['inflow_transaction']['account']['name']).to eq 'Savings'
        end
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { nil }

        run_test!
      end

      response '404', 'transaction not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:transaction_id) { SecureRandom.uuid }

        run_test!
      end
    end
  end

  path '/api/v1/transactions/{transaction_id}/transfer_match' do
    parameter name: :transaction_id, in: :path, schema: { type: :string, format: :uuid }, required: true, description: 'Transaction ID'

    let(:transaction_id) { outflow_entry.entryable.id }

    post 'Create a transfer match' do
      tags 'Transactions'
      security [ { apiKeyAuth: [] } ]
      consumes 'application/json'
      produces 'application/json'

      parameter name: :body, in: :body, required: true, schema: {
        type: :object,
        properties: {
          transfer_match: {
            type: :object,
            properties: {
              method: {
                type: :string,
                enum: %w[existing new],
                description: 'existing links the transaction to another existing transaction (matched_entry_id); new creates a counterpart transaction on target_account_id.'
              },
              matched_entry_id: { type: :string, format: :uuid, description: 'Entry ID of the existing transaction to match against (method=existing).' },
              target_account_id: { type: :string, format: :uuid, description: 'Account to create the counterpart transaction on (method=new).' }
            },
            required: %w[method]
          }
        },
        required: %w[transfer_match]
      }

      response '200', 'match created from an existing transaction' do
        schema '$ref' => '#/components/schemas/TransferDecision'

        let(:body) { { transfer_match: { method: 'existing', matched_entry_id: inflow_entry.id } } }

        run_test! do |response|
          body = JSON.parse(response.body)
          expect(body['status']).to eq 'confirmed'
          expect(Transfer.where(outflow_transaction_id: outflow_entry.entryable_id).count).to eq 1
        end
      end

      response '200', 'match created by creating a counterpart transaction' do
        schema '$ref' => '#/components/schemas/TransferDecision'

        let(:body) { { transfer_match: { method: 'new', target_account_id: savings.id } } }

        run_test! do |response|
          body = JSON.parse(response.body)
          expect(body['status']).to eq 'confirmed'
          expect(Entry.where(account_id: savings.id, entryable_type: 'Transaction').count).to eq 2
        end
      end

      response '422', 'invalid method' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:body) { { transfer_match: { method: 'auto' } } }

        run_test!
      end

      response '422', 'matched entry not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:body) { { transfer_match: { method: 'existing', matched_entry_id: SecureRandom.uuid } } }

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { nil }

        run_test!
      end

      response '404', 'transaction not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:transaction_id) { SecureRandom.uuid }

        run_test!
      end
    end
  end
end
