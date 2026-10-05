require "test_helper"

class CubeDashboardsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @query = {
      measures: [ "cash_flow.income" ],
      timeDimensions: [ { dimension: "cash_flow.date", dateRange: [ "2025-01-01", "2025-01-31" ] } ],
      order: {},
      limit: 500
    }
  end

  test "query and catalog require a signed in session" do
    post "/cube-dashboards/query", params: { catalog: true }, as: :json
    assert_redirected_to new_session_url

    post "/cube-dashboards/query", params: { query: @query }, as: :json
    assert_redirected_to new_session_url
  end

  test "query remains protected by session CSRF checks" do
    sign_in users(:family_admin)
    previous = CubeDashboardsController.allow_forgery_protection
    CubeDashboardsController.allow_forgery_protection = true
    post "/cube-dashboards/query", params: { catalog: true }, as: :json
    assert_response :unprocessable_entity
  ensure
    CubeDashboardsController.allow_forgery_protection = previous
  end

  test "catalog is usable when the engine is unconfigured without exposing raw members" do
    sign_in users(:family_member)
    with_env_overrides("CUBE_API_URL" => "file:///etc/passwd") do
      post "/cube-dashboards/query", params: { catalog: true }, as: :json
      assert_response :ok
      catalog = response.parsed_body
      assert_equal false, catalog.fetch("configured")
      assert_equal %w[cash_flow.income cash_flow.expenses cash_flow.savings cash_flow.count], catalog.fetch("measures").pluck("name")
      refute_includes catalog.fetch("dimensions").pluck("name"), "cash_flow.family_id"
      refute_includes catalog.fetch("dimensions").pluck("name"), "cash_flow.account_id"
    end
  end

  test "additional auth context and ambiguous operation bodies are rejected" do
    sign_in users(:family_member)
    [
      { query: @query, familyId: families(:empty).id },
      { query: @query, catalog: true },
      { catalog: true, accountIds: [ accounts(:investment).id ] },
      { catalog: "true" }
    ].each do |payload|
      post "/cube-dashboards/query", params: payload, as: :json
      assert_response :unprocessable_entity
      assert_equal "invalid_request", response.parsed_body.fetch("code")
    end
  end

  test "invalid input precedes engine configuration failures" do
    sign_in users(:family_member)
    with_env_overrides("CUBE_API_URL" => "file:///etc/passwd") do
      post "/cube-dashboards/query", params: { query: @query.merge(filters: []) }, as: :json
      assert_response :unprocessable_entity
      assert_equal "invalid_query", response.parsed_body.fetch("code")

      post "/cube-dashboards/query", params: { query: @query }, as: :json
      assert_response :service_unavailable
      assert_equal "not_configured", response.parsed_body.fetch("code")
    end
  end

  test "upstream failures are actionable and never expose engine details" do
    sign_in users(:family_member)
    with_env_overrides("CUBE_API_URL" => "http://cube.example/cubejs-api/v1") do
      stub_request(:post, CubeAnalytics.api_url + "/load").to_return(status: 500, body: "SELECT secret FROM private_database")
      post "/cube-dashboards/query", params: { query: @query }, as: :json
      assert_response :service_unavailable
      assert_equal "unavailable", response.parsed_body.fetch("code")
      refute_includes response.body, "private_database"
      refute_includes response.body, CubeAnalytics.api_secret
    end
  end

  test "impersonation queries are signed for the impersonated family and reporting accounts" do
    sign_in users(:sure_support_staff)
    impersonation = impersonation_sessions(:in_progress)
    post join_impersonation_sessions_path, params: { impersonation_session_id: impersonation.id }
    claims = nil
    with_env_overrides("CUBE_API_URL" => "http://cube.example/cubejs-api/v1") do
      stub_request(:post, CubeAnalytics.api_url + "/load").to_return do |request|
        claims = JWT.decode(request.headers.fetch("Authorization").delete_prefix("Bearer "), CubeAnalytics.api_secret, true, algorithm: "HS256").first
        { status: 200, body: { data: [], annotation: {} }.to_json }
      end
      post "/cube-dashboards/query", params: { query: @query }, as: :json
      assert_response :ok
      assert_equal impersonation.impersonated_id, claims.fetch("userId")
      assert_equal impersonation.impersonated.family_id, claims.fetch("familyId")
      assert_equal [ accounts(:credit_card).id, accounts(:depository).id ].sort, claims.fetch("accountIds")
      refute_includes claims.fetch("accountIds"), accounts(:investment).id
    end
  end
end
