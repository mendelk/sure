require "test_helper"

class Api::V1::InsightsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:family_admin)
    @user.update!(preferences: @user.preferences.merge("preview_features_enabled" => true))
    key = ApiKey.generate_secure_key
    @api_key = ApiKey.create!(
      user: @user,
      name: "Native insights test",
      key: key,
      scopes: [ "read" ],
      source: "mobile"
    )
    @insight = @user.family.insights.create!(
      insight_type: "idle_cash",
      priority: "medium",
      status: "active",
      title: "Put idle cash to work",
      body: "One account has more cash than usual.",
      generated_at: Time.current,
      dedup_key: "native-insights-test"
    )
  end

  test "lists visible family insights" do
    get api_v1_insights_url, headers: api_headers(@api_key)

    assert_response :success
    payload = response.parsed_body
    row = payload.fetch("insights").find { |insight| insight.fetch("id") == @insight.id }
    assert_equal "idle_cash", row.fetch("type")
    assert_equal "Put idle cash to work", row.fetch("title")
  end

  test "rejects requests without an API key" do
    get api_v1_insights_url

    assert_response :unauthorized
  end

  test "does not expose insights when the API key owner opted out of preview features" do
    @user.update!(preferences: @user.preferences.merge("preview_features_enabled" => false))

    get api_v1_insights_url, headers: api_headers(@api_key)

    assert_response :forbidden
    assert_equal "feature_disabled", response.parsed_body.fetch("error")
  end
  test "acknowledgement requires write scope and returns the updated insight" do
    patch "/api/v1/insights/#{@insight.id}/acknowledge", headers: api_headers(@api_key), as: :json
    assert_response :forbidden
    assert @insight.reload.active?

    @api_key.update!(scopes: [ "read_write" ])
    patch "/api/v1/insights/#{@insight.id}/acknowledge", headers: api_headers(@api_key), as: :json
    assert_response :success
    assert_equal "acknowledged", response.parsed_body.fetch("insight").fetch("status")
    assert @insight.reload.acknowledged?
    assert @insight.dismissed_at.present?
  end

  test "acknowledgement cannot address another family's insight" do
    other = users(:empty).family.insights.create!(
      insight_type: "idle_cash", priority: "medium", status: "active",
      title: "Private insight", body: "Private body", generated_at: Time.current,
      dedup_key: "private-api-insight"
    )
    @api_key.update!(scopes: [ "read_write" ])
    patch "/api/v1/insights/#{other.id}/acknowledge", headers: api_headers(@api_key), as: :json
    assert_response :not_found
    assert other.reload.active?
  end

  test "acknowledgement respects preview gating and authentication" do
    patch "/api/v1/insights/#{@insight.id}/acknowledge", as: :json
    assert_response :unauthorized
    @api_key.update!(scopes: [ "read_write" ])
    @user.update!(preferences: @user.preferences.merge("preview_features_enabled" => false))
    patch "/api/v1/insights/#{@insight.id}/acknowledge", headers: api_headers(@api_key), as: :json
    assert_response :forbidden
    assert_equal "feature_disabled", response.parsed_body.fetch("error")
    assert @insight.reload.active?
  end
end
