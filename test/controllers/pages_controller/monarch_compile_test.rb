require "test_helper"

class PagesController::MonarchCompileTest < ActionDispatch::IntegrationTest
  setup do
    sign_in @user = users(:family_admin)
  end

  test "compiles sureql source to sql" do
    post dashboard_monarch_compile_path, params: { source: "from transactions\ntake 5" }, as: :json

    assert_response :success
    sql = JSON.parse(response.body)["sql"]
    assert_includes sql, "FROM"
    assert_includes sql, "entries"
    assert_includes sql, "account_id IN"
    Account.accessible_by(@user).pluck(:id).each { |id| assert_includes sql, id }
  end

  test "returns error for unknown source" do
    post dashboard_monarch_compile_path, params: { source: "from secrets" }, as: :json

    assert_response :unprocessable_entity
    assert_match(/unknown sureql source/, JSON.parse(response.body)["error"])
  end

  test "returns error for invalid prql" do
    post dashboard_monarch_compile_path, params: { source: "from transactions\nnot prql at all ((" }, as: :json

    assert_response :unprocessable_entity
    assert JSON.parse(response.body)["error"].present?
  end

  test "requires authentication" do
    sign_out
    post dashboard_monarch_compile_path, params: { source: "from transactions" }, as: :json

    assert_redirected_to new_session_path
  end

  private
    def sign_out
      delete session_path(@user.sessions.order(:created_at).last)
    end
end
