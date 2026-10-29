# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "API V1 Insights", type: :request do
  let(:family) { Family.create!(name: "API Family") }
  let(:user) do
    family.users.create!(
      email: "insights-api@example.com",
      password: "password123",
      ai_enabled: true,
      preferences: { "preview_features_enabled" => true }
    )
  end
  let(:api_key) do
    key = ApiKey.generate_secure_key
    ApiKey.create!(user: user, name: "API Docs Key", key: key, scopes: %w[read_write], source: "web")
  end
  let(:"X-Api-Key") { api_key.plain_key }

  path "/api/v1/insights" do
    get "List proactive insights" do
      tags "Insights"
      security [ { apiKeyAuth: [] } ]
      produces "application/json"

      response "200", "insights listed" do
        schema "$ref" => "#/components/schemas/InsightCollection"
        run_test!
      end


      response "403", "preview features disabled" do
        schema "$ref" => "#/components/schemas/ErrorResponse"
        let(:user) do
          family.users.create!(
            email: "insights-disabled-api@example.com",
            password: "password123",
            ai_enabled: true,
            preferences: { "preview_features_enabled" => false }
          )
        end

        run_test!
      end
    end
  end
  path "/api/v1/insights/{id}/acknowledge" do
    patch "Acknowledge a family insight" do
      tags "Insights"
      description "Acknowledges an insight within the authenticated user's family. Requires preview features and read_write scope; cookie-authenticated requests also require CSRF."
      security [ { apiKeyAuth: [] }, { cookieSession: [] } ]
      produces "application/json"
      parameter name: :id, in: :path, required: true, schema: { type: :string, format: :uuid }
      let(:insight) do
        family.insights.create!(insight_type: "idle_cash", priority: "medium", title: "Idle cash",
          body: "Cash is available.", dedup_key: "api-docs-acknowledge", generated_at: Time.current)
      end
      let(:id) { insight.id }

      response "200", "insight acknowledged" do
        schema "$ref" => "#/components/schemas/InsightAcknowledgeResponse"
        run_test!
      end
      response "401", "unauthorized" do
        schema "$ref" => "#/components/schemas/ErrorResponse"
        let(:"X-Api-Key") { "invalid-key" }
        run_test!
      end
      response "403", "write scope required or preview features disabled" do
        schema "$ref" => "#/components/schemas/ErrorResponse"
        before { api_key.update!(scopes: %w[read]) }
        run_test!
      end
      response "404", "insight not found in the authenticated family" do
        schema "$ref" => "#/components/schemas/ErrorResponse"
        let(:id) { SecureRandom.uuid }
        run_test!
      end
    end
  end
end
