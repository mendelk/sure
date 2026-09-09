# frozen_string_literal: true

require "test_helper"

class RackAttackTest < ActionDispatch::IntegrationTest
  test "rack attack is configured" do
    # Verify Rack::Attack is enabled in middleware stack
    middleware_classes = Rails.application.middleware.map(&:klass)
    assert_includes middleware_classes, Rack::Attack, "Rack::Attack should be in middleware stack"
  end

  test "oauth token endpoint has rate limiting configured" do
    # Test that the throttle is configured (we don't need to trigger it)
    throttles = Rack::Attack.throttles.keys
    assert_includes throttles, "oauth/token", "OAuth token endpoint should have rate limiting"
  end

  test "auth/logout throttle covers every POST capable of refresh-token revocation" do
    # The logout path revokes by refresh_token whenever no valid bearer or
    # API key is presented (t_alt_fnd_019) — including requests carrying an
    # invalid or expired credential. Scoping the bucket to blank headers
    # would let a junk bearer evade it, so invoke the throttle discriminator
    # directly (the throttle only runs in production/staging, and the test
    # cache store cannot count).
    throttle = Rack::Attack.throttles["auth/logout"]
    assert_not_nil throttle, "auth/logout throttle must be configured"

    discriminate = lambda do |path, headers|
      env = {
        "REQUEST_METHOD" => "POST",
        "SCRIPT_NAME" => "",
        "PATH_INFO" => path,
        "QUERY_STRING" => "",
        "SERVER_NAME" => "example.org",
        "SERVER_PORT" => "80",
        "REMOTE_ADDR" => "127.0.0.1",
        "rack.url_scheme" => "http",
        "rack.input" => StringIO.new(""),
        "rack.errors" => StringIO.new
      }.merge(headers)
      throttle.block.call(Rack::Attack::Request.new(env))
    end

    logout = "/api/v1/auth/logout"
    assert_equal "127.0.0.1", discriminate.call(logout, {}), "credential-less logout must be throttled"
    assert_equal "127.0.0.1",
      discriminate.call(logout, { "HTTP_AUTHORIZATION" => "Bearer expired-or-junk" }),
      "an expired bearer must not evade the logout throttle"
    assert_equal "127.0.0.1",
      discriminate.call(logout, { "HTTP_X_API_KEY" => "invalid-key" }),
      "an invalid api key must not evade the logout throttle"
    assert_nil discriminate.call("/api/v1/auth/login", {}), "other paths must not land in the logout bucket"
  end

  test "api requests have rate limiting configured" do
    # Test that API rate limiting is configured
    throttles = Rack::Attack.throttles.keys
    assert_includes throttles, "api/requests", "API requests should have rate limiting"
  end
end
