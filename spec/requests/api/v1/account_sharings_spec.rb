require 'swagger_helper'

RSpec.describe 'API V1 Account Sharing', type: :request do
  let(:family) { Family.create!(name: 'Sharing API', currency: 'USD', locale: 'en') }
  let(:user) { family.users.create!(email: 'sharing-docs@example.com', password: 'Password123!') }
  let(:member) { family.users.create!(email: 'sharing-member-docs@example.com', password: 'Password123!') }
  let(:account) { family.accounts.create!(owner: user, name: 'Checking', currency: 'USD', balance: 0, accountable: Depository.new) }
  let(:account_id) { account.id }
  let(:scopes) { %w[read_write] }
  let(:api_key) do
    key = ApiKey.generate_secure_key
    ApiKey.create!(user: user, name: 'API Docs Key', key: key, scopes: scopes, source: 'web')
  end
  let(:'X-Api-Key') { api_key.plain_key }

  path '/api/v1/accounts/{account_id}/sharing' do
    parameter name: :account_id, in: :path, required: true, schema: { type: :string, format: :uuid }

    get 'Read account sharing and viewer finance inclusion' do
      description 'Accessible accounts only. Owners receive eligible active family members and sharing permissions; shared viewers receive their own permission and include_in_finances preference.'
      tags 'Accounts'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      response '200', 'sharing metadata' do
        schema '$ref' => '#/components/schemas/AccountSharing'
        run_test!
      end
      response '401', 'authentication required' do
        let(:'X-Api-Key') { nil }
        schema '$ref' => '#/components/schemas/ErrorResponse'
        run_test!
      end
      response '404', 'account not accessible' do
        let(:account_id) { SecureRandom.uuid }
        schema '$ref' => '#/components/schemas/ErrorResponse'
        run_test!
      end
    end

    patch 'Update owner sharing or the viewer finance inclusion preference' do
      description 'Only owners may grant, revoke or change member permissions. A non-owner may set update_finance_inclusion: true and include_in_finances to change their own share preference. Inactive and foreign-family users cannot be added.'
      tags 'Accounts'
      security [ { apiKeyAuth: [] } ]
      consumes 'application/json'
      produces 'application/json'
      parameter name: :body, in: :body, required: true, schema: {
        type: :object,
        properties: {
          sharing: { type: :object, properties: {
            members: { type: :object, additionalProperties: {
              type: :object, required: %w[user_id shared], properties: {
                user_id: { type: :string, format: :uuid }, shared: { type: :boolean },
                permission: { type: :string, enum: %w[read_only read_write full_control] }
              }
            } }
          } },
          update_finance_inclusion: { type: :boolean },
          include_in_finances: { type: :boolean }
        }
      }
      let(:body) { { sharing: { members: { '0' => { user_id: member.id, shared: true, permission: 'read_only' } } } } }
      response('204', 'sharing updated') { run_test! }
      response '403', 'write scope required' do
        let(:scopes) { %w[read] }
        schema '$ref' => '#/components/schemas/ErrorResponse'
        run_test!
      end
      response '400', 'sharing input required' do
        let(:body) { {} }
        schema '$ref' => '#/components/schemas/ErrorResponse'
        run_test!
      end
    end
  end
end
