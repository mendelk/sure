require "test_helper"

class PagesController::MonarchRunTest < ActionDispatch::IntegrationTest
  setup do
    sign_in @user = users(:family_admin)
  end

  test "runs sureql and returns sql, rows, and rendered transaction html" do
    post dashboard_monarch_run_path, params: { source: "from transactions\ntake 2" }, as: :json

    assert_response :success
    body = JSON.parse(response.body)

    assert_includes body["sql"], "FROM"
    assert_includes body["sql"], "entries"
    assert body["columns"].include?("id")
    assert_equal body["rows"].size, body["row_count"]
    assert body["row_count"] <= 2
    assert_not body["truncated"]
    assert body["html"].present?

    accessible_ids = Account.accessible_by(@user).pluck(:id)
    body["rows"].each do |row|
      assert_includes accessible_ids, row["account_id"]
    end
  end

  test "aggregation returns rows without transaction html" do
    source = "from transactions\ngroup {account_id} (\n  aggregate {\n    n = count this,\n  }\n)"
    post dashboard_monarch_run_path, params: { source: source }, as: :json

    assert_response :success
    body = JSON.parse(response.body)

    assert body["rows"].present?
    assert_nil body["html"]
  end

  test "returns error for unknown source" do
    post dashboard_monarch_run_path, params: { source: "from secrets" }, as: :json

    assert_response :unprocessable_entity
    assert_match(/unknown sureql source/, JSON.parse(response.body)["error"])
  end

  test "requires authentication" do
    sign_out
    post dashboard_monarch_run_path, params: { source: "from transactions" }, as: :json

    assert_redirected_to new_session_path
  end

  private
    def sign_out
      delete session_path(@user.sessions.order(:created_at).last)
    end
end
