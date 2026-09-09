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

  test "unauthenticated logout-by-refresh has rate limiting configured" do
    # The credential-less logout path accepts a bare refresh secret
    # (t_alt_fnd_019), so it is throttled like the sign-in endpoints to
    # block refresh-token enumeration (we don't need to trigger it; the
    # throttle only runs in production/staging).
    throttles = Rack::Attack.throttles.keys
    assert_includes throttles, "auth/logout", "Unauthenticated logout should have rate limiting"
  end

  test "api requests have rate limiting configured" do
    # Test that API rate limiting is configured
    throttles = Rack::Attack.throttles.keys
    assert_includes throttles, "api/requests", "API requests should have rate limiting"
  end
end
