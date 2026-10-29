require "swagger_helper"

RSpec.describe "API V1 Browser Session", type: :request do
  let(:family) { Family.create!(name: "Session API Family") }
  let(:user) { family.users.create!(email: "session-api@example.com", password: "password123") }
  let(:api_key) do
    key = ApiKey.generate_secure_key
    ApiKey.create!(user: user, name: "API Docs Key", key: key, scopes: %w[read_write], source: "web")
  end
  let(:"X-Api-Key") { api_key.plain_key }
  let(:session_token) { nil }
  let(:"X-CSRF-Token") { nil }

  path "/api/v1/session" do
    delete "Log out the authenticated browser session" do
      description "Requires a signed browser session cookie and Rails CSRF token. Ends only that device's session, removes its WebPush registrations, clears browser login state, and returns the sign-in or configured federated logout navigation URL. Does not accept a session ID. API keys and OAuth credentials cannot delete browser sessions, including when a browser cookie is also present."
      tags "Browser Session"
      security [ { cookieSession: [], csrfToken: [] } ]
      produces "application/json"
      parameter name: :"X-Api-Key", in: :header, required: false, schema: { type: :string },
        description: "Not accepted as browser authentication; supplying API credentials returns 403"

      response "200", "browser logged out; navigate to redirect_url" do
        let(:"X-Api-Key") { nil }
        before { post sessions_path, params: { email: user.email, password: "password123" } }
        schema type: :object, required: [ "redirect_url" ], additionalProperties: false,
          properties: { redirect_url: { type: :string, description: "Normal navigation destination; may be the configured identity provider for federated logout" } }
        run_test!
      end

      response "403", "API credentials cannot select or end a browser session" do
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end

      response "401", "authentication required" do
        let(:"X-Api-Key") { nil }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end

      response "422", "cookie-authenticated request has a missing or invalid CSRF token" do
        let(:"X-Api-Key") { nil }
        before do
          post sessions_path, params: { email: user.email, password: "password123" }
          allow(ActionController::Base).to receive(:allow_forgery_protection).and_return(true)
        end
        run_test!
      end
    end
  end
end
