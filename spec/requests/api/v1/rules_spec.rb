# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'API V1 Rules', type: :request do
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

  let(:read_only_api_key) do
    key = ApiKey.generate_secure_key
    ApiKey.create!(user: user, name: 'Read-only Docs Key', key: key, scopes: %w[read], source: 'web')
  end

  let(:payload) do
    {
      rule: {
        name: 'Coffee cleanup', resource_type: 'transaction', effective_date: '2024-01-01',
        conditions_attributes: { '0' => { condition_type: 'transaction_name', operator: 'like', value: 'coffee' } },
        actions_attributes: { '0' => { action_type: 'set_transaction_name', value: 'Coffee' } }
      }
    }
  end

  let(:api_key_without_read_scope) do
    key = ApiKey.generate_secure_key
    # Valid persisted API keys can only be read/read_write; this intentionally
    # bypasses validations to document the runtime insufficient-scope response.
    ApiKey.new(
      user: user,
      name: 'No Read Docs Key',
      key: key,
      scopes: [],
      display_key: key,
      source: 'mobile'
    ).tap { |api_key| api_key.save!(validate: false) }
  end

  let(:'X-Api-Key') { api_key.plain_key }

  let!(:rule) do
    family.rules.build(
      name: 'Coffee cleanup',
      resource_type: 'transaction',
      active: true,
      effective_date: Date.new(2024, 1, 1)
    ).tap do |rule|
      rule.conditions.build(condition_type: 'transaction_name', operator: 'like', value: 'coffee')
      rule.actions.build(action_type: 'set_transaction_name', value: 'Coffee')
      rule.save!
    end
  end

  path '/api/v1/rules' do
    get 'List rules' do
      tags 'Rules'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      parameter name: :page, in: :query, type: :integer, required: false,
                description: 'Page number (default: 1)'
      parameter name: :per_page, in: :query, type: :integer, required: false,
                description: 'Items per page (default: 25, max: 100)'
      parameter name: :resource_type, in: :query, required: false,
                description: 'Filter by rule resource type',
                schema: { type: :string, enum: %w[transaction] }
      parameter name: :active, in: :query, required: false,
                description: 'Filter by active status',
                schema: { type: :boolean }
      parameter name: :include, in: :query, required: false, schema: { type: :string, enum: %w[workspace] },
                description: 'Add full sorted rule summaries and paginated recent runs without changing data/meta'
      parameter name: :sort_by, in: :query, required: false, schema: { type: :string, enum: %w[name updated_at] }
      parameter name: :direction, in: :query, required: false, schema: { type: :string, enum: %w[asc desc] }
      parameter name: :runs_page, in: :query, required: false, schema: { type: :integer }

      response '200', 'rules listed' do
        schema '$ref' => '#/components/schemas/RuleCollection'

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { nil }

        run_test!
      end

      response '403', 'forbidden - requires read scope' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { api_key_without_read_scope.plain_key }

        run_test!
      end

      response '422', 'invalid active filter' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:active) { 'not_boolean' }

        run_test!
      end

      response '422', 'unsupported resource type' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:resource_type) { 'account' }

        run_test!
      end
    end

    post 'Create a rule with nested conditions and actions' do
      tags 'Rules'
      security [ { apiKeyAuth: [] } ]
      consumes 'application/json'
      produces 'application/json'
      description 'Creates an inactive rule by default. Returns the canonical resource and an execution/cost preview; applying it is a separate operation.'
      parameter name: :payload, in: :body, required: true, schema: { '$ref' => '#/components/schemas/RuleInput' }

      response '201', 'rule created with execution preview' do
        schema '$ref' => '#/components/schemas/RuleResponse'
        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:'X-Api-Key') { nil }
        run_test!
      end

      response '403', 'write scope required' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:'X-Api-Key') { read_only_api_key.plain_key }
        run_test!
      end

      response '422', 'invalid rule' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:payload) { { rule: { resource_type: 'transaction' } } }
        run_test!
      end
    end
  end

  path '/api/v1/rules/{id}' do
    parameter name: :id, in: :path, type: :string, required: true, description: 'Rule ID'

    get 'Retrieve a rule' do
      tags 'Rules'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'

      let(:id) { rule.id }

      response '200', 'rule retrieved' do
        schema '$ref' => '#/components/schemas/RuleResponse'

        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { nil }

        run_test!
      end

      response '403', 'forbidden - requires read scope' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { api_key_without_read_scope.plain_key }

        run_test!
      end

      response '404', 'rule not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:id) { SecureRandom.uuid }

        run_test!
      end
    end

    patch 'Update a rule or toggle its active state' do
      tags 'Rules'
      security [ { apiKeyAuth: [] } ]
      consumes 'application/json'
      produces 'application/json'
      description 'Preserves nested condition/action updates and _destroy semantics. active alone toggles the rule without executing it.'
      parameter name: :payload, in: :body, required: true, schema: { '$ref' => '#/components/schemas/RuleInput' }
      let(:id) { rule.id }

      response '200', 'rule updated' do
        schema '$ref' => '#/components/schemas/RuleResponse'
        let(:payload) { { rule: { active: false, name: 'Renamed' } } }
        run_test!
      end

      response '403', 'write scope required' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:'X-Api-Key') { read_only_api_key.plain_key }
        run_test!
      end

      response '404', 'rule not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:id) { SecureRandom.uuid }
        run_test!
      end

      response '422', 'invalid date or nested validation' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:payload) { { rule: { effective_date: 'not-a-date' } } }
        run_test!
      end
    end

    delete 'Delete a rule and its execution history' do
      tags 'Rules'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      let(:id) { rule.id }

      response '200', 'rule deleted' do
        schema type: :object, required: %w[ok], properties: { ok: { type: :boolean } }
        run_test!
      end

      response '403', 'write scope required' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:'X-Api-Key') { read_only_api_key.plain_key }
        run_test!
      end

      response '404', 'rule not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:id) { SecureRandom.uuid }
        run_test!
      end
    end
  end

  [ '/api/v1/rules/form_options', '/api/v1/rules/{id}/form_options' ].each do |endpoint|
    path endpoint do
      if endpoint.include?('{id}')
        parameter name: :id, in: :path, type: :string, required: true
        let(:id) { rule.id }
      end

      get 'Read rule builder metadata and defaults' do
        tags 'Rules'
        security [ { apiKeyAuth: [] } ]
        produces 'application/json'
        description 'Returns nested conditions/actions, the provider-aware filter/executor registry and deployment metadata. Collection form supports merchant/name/action prefills.'
        parameter name: :resource_type, in: :query, required: false, schema: { type: :string, enum: %w[transaction] }
        parameter name: :merchant_id, in: :query, required: false, schema: { type: :string, format: :uuid }
        parameter name: :name, in: :query, required: false, schema: { type: :string }
        parameter name: :action_type, in: :query, required: false, schema: { type: :string }
        parameter name: :action_value, in: :query, required: false, schema: { type: :string }

        response '200', 'builder options' do
          schema '$ref' => '#/components/schemas/RuleFormOptions'
          run_test!
        end

        response '401', 'unauthorized' do
          schema '$ref' => '#/components/schemas/ErrorResponse'
          let(:'X-Api-Key') { nil }
          run_test!
        end

        if endpoint.include?('{id}')
          response '404', 'rule not found' do
            schema '$ref' => '#/components/schemas/ErrorResponse'
            let(:id) { SecureRandom.uuid }
            run_test!
          end
        else
          response '422', 'unsupported resource type' do
            schema '$ref' => '#/components/schemas/ErrorResponse'
            let(:resource_type) { 'account' }
            run_test!
          end
        end
      end
    end
  end

  path '/api/v1/rules/registry' do
    get 'Read rule condition and executor registry' do
      tags 'Rules'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      parameter name: :resource_type, in: :query, required: false, schema: { type: :string, enum: %w[transaction] }

      response '200', 'registry' do
        schema '$ref' => '#/components/schemas/RuleRegistry'
        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:'X-Api-Key') { nil }
        run_test!
      end

      response '422', 'unsupported resource type' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:resource_type) { 'account' }
        run_test!
      end
    end
  end

  path '/api/v1/rules/{id}/confirm' do
    parameter name: :id, in: :path, type: :string, required: true
    get 'Preview matching transactions and AI execution costs' do
      tags 'Rules'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'
      let(:id) { rule.id }

      response '200', 'rule and execution preview' do
        schema '$ref' => '#/components/schemas/RuleResponse'
        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:'X-Api-Key') { nil }
        run_test!
      end

      response '404', 'rule not found' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:id) { SecureRandom.uuid }
        run_test!
      end
    end
  end

  path '/api/v1/rules/confirm_all' do
    get 'Preview all rules using unique matching transaction counts' do
      tags 'Rules'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'

      response '200', 'bulk execution preview' do
        schema '$ref' => '#/components/schemas/RuleBulkPreview'
        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:'X-Api-Key') { nil }
        run_test!
      end
    end
  end

  {
    '/api/v1/rules/{id}/apply' => 'Activate a rule and queue execution overriding attribute locks',
    '/api/v1/rules/apply_all' => 'Queue all family rules, including inactive rules, overriding attribute locks',
    '/api/v1/rules/clear_ai_cache' => 'Queue a family AI cache reset'
  }.each do |endpoint, summary|
    path endpoint do
      if endpoint.include?('{id}')
        parameter name: :id, in: :path, type: :string, required: true
        let(:id) { rule.id }
      end

      post summary do
        tags 'Rules'
        security [ { apiKeyAuth: [] } ]
        produces 'application/json'

        response '200', 'operation queued' do
          schema type: :object, required: %w[ok], properties: { ok: { type: :boolean } }
          run_test!
        end

        response '401', 'unauthorized' do
          schema '$ref' => '#/components/schemas/ErrorResponse'
          let(:'X-Api-Key') { nil }
          run_test!
        end

        response '403', 'write scope required' do
          schema '$ref' => '#/components/schemas/ErrorResponse'
          let(:'X-Api-Key') { read_only_api_key.plain_key }
          run_test!
        end

        if endpoint.include?('{id}')
          response '404', 'rule not found' do
            schema '$ref' => '#/components/schemas/ErrorResponse'
            let(:id) { SecureRandom.uuid }
            run_test!
          end
        end
      end
    end
  end

  path '/api/v1/rules/destroy_all' do
    delete 'Delete all family rules and their execution history' do
      tags 'Rules'
      security [ { apiKeyAuth: [] } ]
      produces 'application/json'

      response '200', 'rules deleted' do
        schema type: :object, required: %w[ok], properties: { ok: { type: :boolean } }
        run_test!
      end

      response '401', 'unauthorized' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:'X-Api-Key') { nil }
        run_test!
      end

      response '403', 'write scope required' do
        schema '$ref' => '#/components/schemas/ErrorResponse'
        let(:'X-Api-Key') { read_only_api_key.plain_key }
        run_test!
      end
    end
  end
end
