# frozen_string_literal: true

require "test_helper"

class Api::V1::MetadataControllerTest < ActionDispatch::IntegrationTest
  test "reports the contract version and capabilities without authentication" do
    get api_v1_metadata_url

    assert_response :success
    assert_equal "application/json", response.media_type

    response_body = JSON.parse(response.body)
    assert_equal Api::V1::MetadataController::CONTRACT_VERSION, response_body["api_version"]
    assert_equal Api::V1::MetadataController::CAPABILITIES, response_body["capabilities"]
  end

  test "version is semver" do
    get api_v1_metadata_url

    assert_response :success
    assert_match(/\A\d+\.\d+\.\d+\z/, JSON.parse(response.body)["api_version"])
  end

  test "advertises the session capabilities the web BFF requires" do
    get api_v1_metadata_url

    assert_response :success
    capabilities = JSON.parse(response.body)["capabilities"]
    assert_includes capabilities, "auth.login"
    assert_includes capabilities, "auth.refresh"
    assert_includes capabilities, "auth.logout"
  end

  test "rejects a presented API key that is unknown" do
    get api_v1_metadata_url, headers: { "X-Api-Key" => "invalid-key" }

    assert_response :unauthorized
    response_body = JSON.parse(response.body)
    assert_equal "unauthorized", response_body["error"]
  end

  test "accepts a valid presented API key" do
    user = users(:family_admin)
    api_key = ApiKey.create!(
      user: user,
      name: "Metadata Probe Key",
      scopes: [ "read" ],
      source: "web",
      display_key: "metadata_probe_#{SecureRandom.hex(8)}"
    )

    get api_v1_metadata_url, headers: { "X-Api-Key" => api_key.plain_key }

    assert_response :success
    assert_equal Api::V1::MetadataController::CONTRACT_VERSION, JSON.parse(response.body)["api_version"]
  ensure
    api_key&.destroy
  end
end
