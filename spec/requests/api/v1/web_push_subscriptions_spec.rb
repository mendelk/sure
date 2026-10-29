require "swagger_helper"
require "base64"

RSpec.describe "API V1 WebPush Subscriptions", type: :request do
  let(:family) { Family.create!(name: "WebPush API Family") }
  let(:user) do
    family.users.create!(email: "web-push-api@example.com", password: "password123",
      preferences: { "preview_features_enabled" => true })
  end
  let(:api_key) do
    key = ApiKey.generate_secure_key
    ApiKey.create!(user: user, name: "API Docs Key", key: key, scopes: %w[read_write], source: "web")
  end
  let(:"X-Api-Key") { api_key.plain_key }
  let(:session_token) { nil }
  let(:"X-CSRF-Token") { nil }
  let(:subscription) do
    { subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/docs-browser", keys: {
      p256dh: Base64.urlsafe_encode64("\x04" + "\x01" * 64, padding: false),
      auth: Base64.urlsafe_encode64("\x02" * 16, padding: false)
    } } }
  end

  before do
    WebNotification::Preferences.new(user).update!(enabled: true)
    allow(WebPushSubscription).to receive(:configured?).and_return(true)
  end

  path "/api/v1/web_push_subscriptions" do
    post "Register or reconcile the authenticated browser's WebPush subscription" do
      description "WebPush is separate from the native APNs push_subscriptions API. Requires a browser session cookie, Rails CSRF token, preview opt-in, notification opt-in, and configured VAPID keys. Session ownership is inferred from the cookie, never from payload IDs. Rebinding to another user requires matching endpoint and full existing keys; a replacement receives a new registration ID. API-key/OAuth credentials do not identify a browser session and receive 403. Never returns endpoint or push credentials."
      tags "WebPush Subscriptions"
      security [ { cookieSession: [], csrfToken: [] } ]
      consumes "application/json"
      produces "application/json"
      parameter name: :"X-Api-Key", in: :header, required: false, schema: { type: :string },
        description: "Not accepted as browser authentication; supplying API credentials returns 403"
      parameter name: :subscription, in: :body, required: true, schema: {
        type: :object, required: [ "subscription" ], properties: {
          subscription: { type: :object, required: %w[endpoint keys], properties: {
            endpoint: { type: :string, maxLength: 4096, description: "HTTPS endpoint on an allowed browser push service" },
            label: { type: :string, maxLength: 80 },
            keys: { type: :object, required: %w[p256dh auth], properties: {
              p256dh: { type: :string, description: "Base64url 65-byte uncompressed P-256 public key" },
              auth: { type: :string, description: "Base64url 16-byte authentication secret" }
            } }
          } }
        }
      }

      response "201", "browser subscription registered or refreshed" do
        let(:"X-Api-Key") { nil }
        before { post sessions_path, params: { email: user.email, password: "password123" } }
        schema type: :object, required: %w[id status], additionalProperties: false,
          properties: { id: { type: :string, format: :uuid }, status: { type: :string, nullable: true } }
        run_test!
      end

      response "403", "browser session required, insufficient write scope, or preview disabled" do
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end

      response "401", "authentication required" do
        let(:"X-Api-Key") { nil }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end

      response "422", "invalid subscription, conflicting ownership proof, or notifications disabled" do
        let(:"X-Api-Key") { nil }
        let(:subscription) { { subscription: { endpoint: "https://127.0.0.1/private", keys: {} } } }
        before { post sessions_path, params: { email: user.email, password: "password123" } }
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end

      response "503", "VAPID configuration unavailable" do
        let(:"X-Api-Key") { nil }
        before do
          post sessions_path, params: { email: user.email, password: "password123" }
          allow(WebPushSubscription).to receive(:configured?).and_return(false)
        end
        schema "$ref" => "#/components/schemas/ErrorResponse"
        run_test!
      end
    end
  end
end
