# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'SPA Transactions API', type: :request do
  let(:family) do
    Family.create!(
      name: 'SPA Family',
      currency: 'USD',
      locale: 'en',
      date_format: '%m-%d-%Y'
    )
  end

  let(:user) do
    family.users.create!(
      email: 'spa-user@example.com',
      password: 'password123',
      password_confirmation: 'password123',
      onboarded_at: Time.current
    )
  end

  let!(:transaction) do
    account = family.accounts.create!(
      name: 'Checking Account',
      balance: 1000,
      currency: 'USD',
      accountable: Depository.create!
    )

    account.entries.create!(
      name: 'Grocery shopping',
      date: Date.current,
      amount: 75.50,
      currency: 'USD',
      entryable: Transaction.new
    ).transaction
  end

  let(:authenticate) { true }

  before do
    post sessions_path, params: { email: user.email, password: 'password123' } if authenticate
  end

  path '/api/spa/transactions' do
    get 'List transactions for the browser SPA' do
      tags 'SPA Transactions'
      security [ { cookieSession: [] } ]
      produces 'application/json'
      parameter name: :page, in: :query, required: false,
                schema: { type: :integer, minimum: 1 }
      parameter name: :per_page, in: :query, required: false,
                schema: { type: :integer, minimum: 1, maximum: 100 }
      parameter name: :search, in: :query, required: false,
                schema: { type: :string }
      parameter name: :start_date, in: :query, required: false,
                schema: { type: :string, format: :date }
      parameter name: :end_date, in: :query, required: false,
                schema: { type: :string, format: :date }
      parameter name: :types, in: :query, required: false,
                schema: { type: :array, items: { type: :string, enum: %w[income expense transfer] } },
                style: :form, explode: false
      parameter name: :status, in: :query, required: false,
                schema: { type: :array, items: { type: :string, enum: %w[pending confirmed] } },
                style: :form, explode: false
      parameter name: :accounts, in: :query, required: false,
                schema: { type: :array, items: { type: :string } },
                style: :form, explode: false
      parameter name: :account_ids, in: :query, required: false,
                schema: { type: :array, items: { type: :string, format: :uuid } },
                style: :form, explode: false
      parameter name: :categories, in: :query, required: false,
                schema: { type: :array, items: { type: :string } },
                style: :form, explode: false
      parameter name: :merchants, in: :query, required: false,
                schema: { type: :array, items: { type: :string } },
                style: :form, explode: false
      parameter name: :tags, in: :query, required: false,
                schema: { type: :array, items: { type: :string } },
                style: :form, explode: false

      response '200', 'transactions listed' do
        schema '$ref' => '#/components/schemas/SpaTransactionCollection'

        run_test!
      end

      response '401', 'browser session required' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:authenticate) { false }

        run_test!
      end

      response '422', 'invalid date filter' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:start_date) { 'not-a-date' }

        run_test!
      end
    end
  end
end
