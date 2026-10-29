# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'API V1 Account Statements', type: :request do
  let(:family) { Family.create!(name: 'Statement API Family', currency: 'USD', locale: 'en', date_format: '%m-%d-%Y') }
  let(:user) do
    family.users.create!(email: 'statement-api@example.com', password: 'password123', password_confirmation: 'password123', role: 'admin')
  end
  let(:api_key) do
    key = ApiKey.generate_secure_key
    ApiKey.create!(user: user, name: 'API Docs Key', key: key, scopes: %w[read_write], source: 'web')
  end
  let(:'X-Api-Key') { api_key.plain_key }
  let(:account) { family.accounts.create!(owner: user, name: 'Checking', balance: 1000, currency: 'USD', accountable: Depository.create!) }
  let(:upload_file) { Rack::Test::UploadedFile.new(Rails.root.join('test/fixtures/files/imports/sample_bank_statement.pdf'), 'application/pdf') }
  let(:statement) { AccountStatement.create_from_upload!(family: family, account: account, file: upload_file) }
  let(:id) { statement.id }

  path '/api/v1/account_statements' do
    get 'List Statement Vault documents' do
      tags 'Account Statements'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      description 'Requires a family member/admin. Linked statements are restricted to accessible accounts. Unmatched/rejected inbox documents are visible to statement managers. Canonical resources remain present with include=workspace.'
      parameter name: :include, in: :query, required: false, schema: { type: :string, enum: %w[workspace] }
      parameter name: :account_id, in: :query, required: false, schema: { type: :string, format: :uuid }
      parameter name: :page, in: :query, required: false, schema: { type: :integer, minimum: 1 }
      parameter name: :per_page, in: :query, required: false, schema: { type: :integer, enum: [ 10, 20, 30, 50, 100 ], default: 10 }
      parameter name: :unmatched_page, in: :query, required: false, schema: { type: :integer, minimum: 1 }, description: 'Workspace unmatched group page'
      parameter name: :linked_page, in: :query, required: false, schema: { type: :integer, minimum: 1 }, description: 'Workspace linked group page'
      response '200', 'accessible statements and optional workspace' do
        schema '$ref' => '#/components/schemas/AccountStatementCollection'
        run_test!
      end
      response '401', 'authentication required' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:'X-Api-Key') { nil }
        run_test!
      end
      response '403', 'statement manager permission required' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        before { user.update!(role: 'guest') }
        run_test!
      end
    end

    post 'Upload statement files' do
      tags 'Account Statements'
      security [ { apiKeyAuth: [] } ]
      consumes 'multipart/form-data'
      produces 'application/json'
      description 'Real PDF/CSV/XLSX binary files, maximum 25MB each. Uses vault metadata detection, family-wide content deduplication and account matching; does not import transactions. Omitting account_id stores documents in the unmatched inbox. Linking requires owner/full_control account permission. Batch uploads may partially succeed: successful documents are retained and errors lists rejected files. duplicate_count always equals the visible duplicates array length; inaccessible files produce a generic unavailable-file error without disclosing a private duplicate. A batch with no created or visible duplicate documents returns 422. Browser-session writes require CSRF.'
      parameter name: :'account_statement[files][]', in: :formData, required: true,
                schema: { type: :array, items: { type: :string, format: :binary } }
      parameter name: :'account_statement[account_id]', in: :formData, required: false, schema: { type: :string, format: :uuid }
      let(:'account_statement[files][]') { [ upload_file ] }
      response '201', 'one or more documents stored, possibly with per-file errors' do
        schema '$ref' => '#/components/schemas/AccountStatementUploadResult'
        run_test!
      end
      response '200', 'duplicates only; no new documents stored' do
        schema '$ref' => '#/components/schemas/AccountStatementUploadResult'
        before { statement }
        let(:'account_statement[files][]') do
          [ Rack::Test::UploadedFile.new(Rails.root.join('test/fixtures/files/imports/sample_bank_statement.pdf'), 'application/pdf') ]
        end
        run_test!
      end
      response '403', 'write scope or statement/account permission missing' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:api_key) { ApiKey.create!(user: user, name: 'Read docs key', key: ApiKey.generate_secure_key, scopes: %w[read], source: 'web') }
        run_test!
      end
      response '422', 'no valid upload files' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:'account_statement[files][]') { [] }
        run_test!
      end
    end
  end

  path '/api/v1/account_statements/coverage' do
    get 'Get statement document coverage and reconciliation by month' do
      tags 'Account Statements'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      description 'Read-only coverage for an accessible account; requires statement-manager permission, not account write permission. Covered means document presence, not verified ledger agreement. The default/unsupported year resolves to the latest available year.'
      parameter name: :account_id, in: :query, required: true, schema: { type: :string, format: :uuid }
      parameter name: :year, in: :query, required: false, schema: { type: :integer }
      let(:account_id) { account.id }
      response '200', 'coverage for twelve calendar months' do
        schema '$ref' => '#/components/schemas/AccountStatementCoverage'
        run_test!
      end
      response '404', 'account inaccessible' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:account_id) { SecureRandom.uuid }
        run_test!
      end
      response '422', 'malformed calendar year' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:year) { 'invalid' }
        run_test!
      end
    end
  end

  path '/api/v1/account_statements/{id}' do
    parameter name: :id, in: :path, required: true, schema: { type: :string, format: :uuid }
    get 'Get a statement and its metadata/reconciliation' do
      tags 'Account Statements'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      parameter name: :include, in: :query, required: false, schema: { type: :string, enum: %w[workspace] }
      response '200', 'accessible statement' do
        schema '$ref' => '#/components/schemas/AccountStatementResponse'
        run_test!
      end
      response '404', 'statement missing or inaccessible' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:id) { SecureRandom.uuid }
        run_test!
      end
    end
    patch 'Update statement metadata or account link' do
      tags 'Account Statements'
      security [ { apiKeyAuth: [] } ]
      consumes 'application/json'
      produces 'application/json'
      description 'Requires statement-manager and owner/full_control permission on both current and newly selected accounts. Empty account_id unlinks; omitted account_id preserves the current link. Currency is normalized; dates must be ISO 8601 and period end cannot precede start.'
      parameter name: :body, in: :body, required: true, schema: {
        type: :object, required: %w[account_statement], properties: {
          account_statement: { type: :object, properties: {
            account_id: { type: :string, format: :uuid, nullable: true }, institution_name_hint: { type: :string, nullable: true },
            account_name_hint: { type: :string, nullable: true }, account_last4_hint: { type: :string, nullable: true },
            currency: { type: :string }, period_start_on: { type: :string, format: :date, nullable: true },
            period_end_on: { type: :string, format: :date, nullable: true }, opening_balance: { type: :string, nullable: true }, closing_balance: { type: :string, nullable: true }
          } }
        }
      }
      let(:body) { { account_statement: { institution_name_hint: 'Example Bank', period_start_on: '2024-01-01', period_end_on: '2024-01-31' } } }
      response '200', 'metadata updated' do
        schema '$ref' => '#/components/schemas/AccountStatementResponse'
        run_test!
      end
      response '422', 'invalid metadata' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:body) { { account_statement: { period_start_on: '2024-02-31' } } }
        run_test!
      end
    end
    delete 'Delete a statement document' do
      tags 'Account Statements'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      description 'Requires management permission. Statements referenced by PDF imports cannot be deleted; successful deletion schedules original-file purging.'
      response '204', 'statement deleted' do
        run_test!
      end
      response '404', 'statement missing or inaccessible' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:id) { SecureRandom.uuid }
        run_test!
      end
    end
  end

  path '/api/v1/account_statements/{id}/link' do
    parameter name: :id, in: :path, required: true, schema: { type: :string, format: :uuid }
    patch 'Link a statement to an account or confirm its suggestion' do
      tags 'Account Statements'
      security [ { apiKeyAuth: [] } ]
      consumes 'application/json'
      produces 'application/json'
      description 'Uses account_id or falls back to the suggested account. Checks source statement and destination account management permissions.'
      parameter name: :body, in: :body, required: false, schema: { type: :object, properties: { account_id: { type: :string, format: :uuid } } }
      let(:body) { { account_id: account.id } }
      response '200', 'statement linked' do
        schema '$ref' => '#/components/schemas/AccountStatementResponse'
        run_test!
      end
      response '422', 'no account selected or suggested' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:body) { {} }
        before { statement.update!(suggested_account: nil) }
        run_test!
      end
    end
  end

  %w[unlink reject].each do |action|
    path "/api/v1/account_statements/{id}/#{action}" do
      parameter name: :id, in: :path, required: true, schema: { type: :string, format: :uuid }
      patch(action == 'unlink' ? 'Unlink a statement and refresh its account suggestion' : 'Reject a statement account suggestion') do
        tags 'Account Statements'
        security [ { apiKeyAuth: [] } ]
        produces 'application/json'
        description 'Requires statement-manager and current account owner/full_control permission. Uses the Statement Vault domain status transition.'
        response '200', 'statement updated' do
          schema '$ref' => '#/components/schemas/AccountStatementResponse'
          run_test!
        end
        response '404', 'statement missing or inaccessible' do
          schema '$ref' => '#/components/schemas/ErrorResponse'
          let(:id) { SecureRandom.uuid }
          run_test!
        end
      end
    end
  end

  path '/api/v1/account_statements/{id}/download' do
    parameter name: :id, in: :path, required: true, schema: { type: :string, format: :uuid }
    get 'Download the original statement file' do
      tags 'Account Statements'
      security [ { apiKeyAuth: [] } ]
      produces 'application/octet-stream', 'application/pdf', 'text/csv', 'text/plain', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      description 'Streams original statement bytes directly after statement view authorization. API-key, OAuth and browser-session clients receive the same binary response without redirecting or requiring browser cookies. Uses native Active Storage chunked streaming and its safe serving Content-Type with attachment disposition.'
      response '200', 'original statement binary contents' do
        schema type: :string, format: :binary
        header 'Content-Type', schema: { type: :string }, description: 'Native Active Storage safe serving MIME type of the original file.'
        header 'Content-Disposition', schema: { type: :string }, description: 'attachment; filename includes the original sanitized statement filename.'
        run_test!
      end
      response '404', 'statement or original attachment missing/inaccessible' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:id) { SecureRandom.uuid }
        run_test!
      end
    end
  end
end
