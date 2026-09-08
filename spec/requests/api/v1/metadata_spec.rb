# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'API V1 Metadata', type: :request do
  path '/api/v1/metadata' do
    get 'Retrieve API contract metadata' do
      description 'Public contract version and capability tokens for the alternate frontend compatibility check (readiness and session establishment). No authentication required.'
      tags 'Metadata'
      produces 'application/json'
      parameter name: 'X-Api-Key', in: :header, required: false,
                description: 'Optional deployment API key. Absence keeps the endpoint public; a presented key that is unknown or inactive returns 401.',
                schema: { type: :string }

      response '200', 'contract metadata' do
        schema '$ref' => '#/components/schemas/ApiMetadata'

        run_test!
      end

      response '401', 'presented API key is invalid or inactive' do
        schema '$ref' => '#/components/schemas/ErrorResponse'

        let(:'X-Api-Key') { 'invalid-key' }

        run_test!
      end
    end
  end
end
