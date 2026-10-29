# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'API V1 Ledger Workflows', type: :request do
  let(:family) { Family.create!(name: 'Ledger API', currency: 'USD', locale: 'en', date_format: '%m-%d-%Y') }
  let(:user) { family.users.create!(email: 'ledger-docs@example.com', password: 'password123', password_confirmation: 'password123') }
  let(:api_key) do
    key = ApiKey.generate_secure_key
    ApiKey.create!(user: user, name: 'API Docs Key', key: key, scopes: %w[read_write], source: 'web')
  end
  let(:'X-Api-Key') { api_key.plain_key }
  let(:account) { family.accounts.create!(name: 'Brokerage', owner: user, balance: 1000, currency: 'USD', accountable: Investment.create!) }
  let(:entry) { account.entries.create!(name: 'Cash movement', date: Date.current, amount: 100, currency: 'USD', entryable: Transaction.new) }
  let(:transaction_id) { entry.entryable_id }
  let(:security) { Security.create!(ticker: 'DOCS', name: 'Documentation security') }

  path '/api/v1/transactions/bulk_permissions' do
    get 'Read aggregate entry permissions' do
      description 'Returns the intersection of account permissions for a complete accessible entry selection. IDs are entry IDs, not transaction IDs; account activity may also select trades and valuations. Missing/inaccessible IDs return 404.'
      tags 'Transactions'
      security [ { apiKeyAuth: [] }, { cookieSession: [] } ]
      produces 'application/json'
      parameter name: :entry_ids, in: :query, required: true, schema: { type: :array, items: { type: :string, format: :uuid } }, collectionFormat: :multi
      let(:entry_ids) { [ entry.id ] }
      response '200', 'selection permissions' do
        schema type: :object, required: %w[permissions source_account_ids], properties: {
          permissions: { type: :object, required: %w[can_edit can_annotate], properties: { can_edit: { type: :boolean }, can_annotate: { type: :boolean } } },
          source_account_ids: { type: :array, items: { type: :string, format: :uuid } }
        }
        run_test!
      end
    end
  end

  path '/api/v1/transactions/bulk_update' do
    patch 'Atomically update selected ledger entries' do
      description 'Requires annotation permission for category, merchant, tags and notes; name/date/transfer creation require full financial edit permission. Uses the existing bulk update domain operation, including split-parent exclusion, incremental tag add/remove, sync protection and confirmed transfer creation. Every selected entry and reference must be accessible; no partial authorization or save.'
      tags 'Transactions'
      security [ { apiKeyAuth: [] }, { cookieSession: [] } ]
      consumes 'application/json'
      produces 'application/json'
      parameter name: :body, in: :body, required: true, schema: {
        type: :object, required: [ 'bulk_update' ], properties: { bulk_update: {
          type: :object, required: [ 'entry_ids' ], properties: {
            entry_ids: { type: :array, items: { type: :string, format: :uuid }, minItems: 1 },
            date: { type: :string, format: :date }, name: { type: :string }, notes: { type: :string },
            category_id: { type: :string, format: :uuid }, merchant_id: { type: :string, format: :uuid },
            transfer_account_id: { type: :string, format: :uuid },
            tag_ids_to_add: { type: :array, items: { type: :string, format: :uuid } },
            tag_ids_to_remove: { type: :array, items: { type: :string, format: :uuid } }
          }
        } }
      }
      let(:body) { { bulk_update: { entry_ids: [ entry.id ], notes: 'Reviewed' } } }
      response '200', 'entries updated' do
        schema type: :object, required: [ 'updated_count' ], properties: { updated_count: { type: :integer } }
        run_test!
      end
      response '401', 'authentication required' do
        let(:'X-Api-Key') { nil }
        run_test!
      end
      response '422', 'invalid selection or attributes' do
        let(:body) { { bulk_update: { entry_ids: [] } } }
        run_test!
      end
    end
  end

  path '/api/v1/transactions/bulk_deletion' do
    delete 'Delete selected ledger entries' do
      description 'Requires full financial edit permission on the entire selection. Accepts transaction, trade and valuation entry IDs for global and account activity selections. Split children are skipped; deleting their parent removes the split group. Schedules affected accounts for sync after successful atomic deletion.'
      tags 'Transactions'
      security [ { apiKeyAuth: [] }, { cookieSession: [] } ]
      consumes 'application/json'
      produces 'application/json'
      parameter name: :body, in: :body, required: true, schema: { type: :object, required: [ 'bulk_delete' ], properties: { bulk_delete: { type: :object, required: [ 'entry_ids' ], properties: { entry_ids: { type: :array, minItems: 1, items: { type: :string, format: :uuid } } } } } }
      let(:body) { { bulk_delete: { entry_ids: [ entry.id ] } } }
      response '200', 'entries deleted' do
        schema type: :object, required: [ 'deleted_count' ], properties: { deleted_count: { type: :integer } }
        run_test!
      end
      response '404', 'selection contains missing or inaccessible entry' do
        let(:body) { { bulk_delete: { entry_ids: [ entry.id, SecureRandom.uuid ] } } }
        run_test!
      end
    end
  end

  path '/api/v1/transactions/{transaction_id}/split' do
    parameter name: :transaction_id, in: :path, required: true, schema: { type: :string, format: :uuid }
    delete 'Unsplit a transaction' do
      description 'Restores the split parent and removes children plus transfer counterparts atomically. Accepts a parent or child transaction ID. Requires full edit permission on source and counterpart accounts.'
      tags 'Transactions'
      security [ { apiKeyAuth: [] }, { cookieSession: [] } ]
      produces 'application/json'
      before { entry.split!([ { name: 'First', amount: 40 }, { name: 'Second', amount: 60 } ]) }
      response '200', 'split removed' do
        schema type: :object, properties: { message: { type: :string }, transaction_id: { type: :string, format: :uuid } }
        run_test!
      end
    end
  end

  path '/api/v1/transactions/{transaction_id}/conversion' do
    parameter name: :transaction_id, in: :path, required: true, schema: { type: :string, format: :uuid }
    get 'Read cash-to-trade conversion options' do
      tags 'Transactions'
      security [ { apiKeyAuth: [] }, { cookieSession: [] } ]
      produces 'application/json'
      parameter name: :q, in: :query, required: false, schema: { type: :string }, description: 'Search enabled securities providers using the family country; encoded ticker selection preserves exchange and price-provider choice'
      response '200', 'available held securities and activity labels' do
        schema type: :object, required: %w[securities activity_labels], properties: {
          securities: { type: :array, items: { type: :object, required: %w[id ticker name], properties: { id: { type: :string, format: :uuid }, ticker: { type: :string }, name: { type: :string, nullable: true } } } },
          activity_labels: { type: :array, items: { type: :string } },
          search_results: { type: :array, items: { type: :object, properties: {
            ticker: { type: :string, description: 'Encoded SYMBOL|MIC|PROVIDER selection' }, symbol: { type: :string },
            name: { type: :string, nullable: true }, exchange_operating_mic: { type: :string, nullable: true },
            price_provider: { type: :string, nullable: true }
          } } }
        }
        run_test!
      end
    end
    post 'Atomically convert a cash transaction to a trade' do
      description 'Investment accounts only; requires financial edit permission. Resolves security from security_id or custom ticker (including exchange MIC and encoded ticker|exchange|provider values). Provide quantity, price, or both; the omitted value is derived from original cash amount. Negative cash amount infers a sell unless an explicit activity label is supplied. Creates a sync-protected trade and excludes original cash entry in one locked transaction. Excluded/already-converted entries return 422.'
      tags 'Transactions'
      security [ { apiKeyAuth: [] }, { cookieSession: [] } ]
      consumes 'application/json'
      produces 'application/json'
      parameter name: :body, in: :body, required: true, schema: { type: :object, required: [ 'conversion' ], properties: { conversion: { type: :object, properties: {
        security_id: { type: :string, description: 'Existing security UUID or __custom__' }, ticker: { type: :string }, custom_ticker: { type: :string }, exchange_operating_mic: { type: :string },
        qty: { type: :string }, price: { type: :string }, investment_activity_label: { type: :string }, trade_name: { type: :string }
      } } } }
      let(:body) { { conversion: { security_id: security.id, qty: '4', price: '25' } } }
      response '201', 'trade created and cash entry excluded' do
        schema type: :object, required: %w[id entry_id account_id], properties: { id: { type: :string, format: :uuid }, entry_id: { type: :string, format: :uuid }, account_id: { type: :string, format: :uuid } }
        run_test!
      end
      response '422', 'invalid conversion' do
        let(:body) { { conversion: { security_id: security.id, qty: '0', price: '25' } } }
        run_test!
      end
    end
  end

  path '/api/v1/transactions/{transaction_id}/duplicate_candidates' do
    parameter name: :transaction_id, in: :path, required: true, schema: { type: :string, format: :uuid }
    before { entry.transaction.update!(extra: { 'plaid' => { 'pending' => true } }) }
    get 'List posted candidates for a pending transaction' do
      description 'Uses the shared manual duplicate eligibility query: same account and currency, not pending. Results are newest-first, ten per page; offset is nonnegative. Requires annotation account permission.'
      tags 'Transactions'
      security [ { apiKeyAuth: [] }, { cookieSession: [] } ]
      produces 'application/json'
      parameter name: :offset, in: :query, required: false, schema: { type: :integer, minimum: 0 }
      response '200', 'posted candidates' do
        schema type: :object, required: %w[candidates offset has_more], properties: {
          candidates: { type: :array, items: { type: :object, properties: { entry_id: { type: :string, format: :uuid }, transaction_id: { type: :string, format: :uuid }, name: { type: :string }, date: { type: :string, format: :date }, amount: { type: :string }, currency: { type: :string } } } },
          offset: { type: :integer }, has_more: { type: :boolean }
        }
        run_test!
      end
    end
  end

  path '/api/v1/transactions/{transaction_id}/duplicate_merge' do
    parameter name: :transaction_id, in: :path, required: true, schema: { type: :string, format: :uuid }
    before { entry.transaction.update!(extra: { 'plaid' => { 'pending' => true } }) }
    let(:posted) { account.entries.create!(name: 'Posted', date: Date.current, amount: 100, currency: 'USD', entryable: Transaction.new) }
    post 'Merge a pending transaction with a manually selected posted entry' do
      description 'Requires annotation permission. Revalidates candidate account, currency and posted state. Stores manual suggestion and executes the existing locked merge atomically, preserving pending date/category and posted name/merchant plus provider deduplication metadata. Pending entry is removed; posted entry survives.'
      tags 'Transactions'
      security [ { apiKeyAuth: [] }, { cookieSession: [] } ]
      consumes 'application/json'
      produces 'application/json'
      parameter name: :body, in: :body, required: true, schema: { type: :object, required: [ 'duplicate_merge' ], properties: { duplicate_merge: { type: :object, required: [ 'posted_entry_id' ], properties: { posted_entry_id: { type: :string, format: :uuid } } } } }
      let(:body) { { duplicate_merge: { posted_entry_id: posted.id } } }
      response '200', 'duplicate merged' do
        schema type: :object, properties: { message: { type: :string } }
        run_test!
      end
      response '422', 'ineligible posted entry' do
        let(:body) { { duplicate_merge: { posted_entry_id: SecureRandom.uuid } } }
        run_test!
      end
    end
  end

  path '/api/v1/currencies/{id}' do
    parameter name: :id, in: :path, required: true, schema: { type: :string }, description: 'ISO currency code'
    let(:id) { 'USD' }
    get 'Read currency precision metadata' do
      tags 'Currencies'
      security [ { apiKeyAuth: [] }, { cookieSession: [] } ]
      produces 'application/json'
      response '200', 'currency metadata including step and subunit conversion' do
        schema type: :object, properties: { iso_code: { type: :string }, step: { type: :number }, minor_unit_conversion: { type: :integer } }
        run_test!
      end
      response '404', 'unknown currency' do
        let(:id) { 'INVALID' }
        run_test!
      end
    end
  end

  path '/api/v1/exchange_rate' do
    get 'Read a dated currency exchange rate' do
      tags 'Currencies'
      security [ { apiKeyAuth: [] }, { cookieSession: [] } ]
      produces 'application/json'
      parameter name: :from, in: :query, required: true, schema: { type: :string }
      parameter name: :to, in: :query, required: true, schema: { type: :string }
      parameter name: :date, in: :query, required: false, schema: { type: :string, format: :date }
      let(:from) { 'USD' }
      let(:to) { 'USD' }
      response '200', 'dated exchange rate' do
        schema type: :object, required: [ 'rate' ], properties: { rate: { type: :number }, same_currency: { type: :boolean } }
        run_test!
      end
      response '422', 'invalid currencies or date' do
        let(:from) { 'INVALID' }
        run_test!
      end
    end
  end
end
