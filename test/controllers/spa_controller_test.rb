require "test_helper"

class SpaControllerTest < ActionDispatch::IntegrationTest
  setup do
    ensure_tailwind_build
    ensure_spa_build
    sign_in @user = users(:family_admin)
  end

  test "serves transactions through the React SPA shell" do
    get transactions_path

    assert_response :success
    assert_select "#spa-root"
    assert_select "script#spa-bootstrap[type='application/json']" do |elements|
      bootstrap = JSON.parse(elements.first.text)

      assert_equal @user.id, bootstrap.dig("currentUser", "id")
      assert_equal @user.display_name, bootstrap.dig("currentUser", "name")
      assert_equal @user.initials, bootstrap.dig("currentUser", "initials")
      assert_equal root_path, bootstrap.dig("railsPaths", "home")
      assert_equal api_v1_transactions_path, bootstrap.dig("apiPaths", "transactions")
      assert_equal api_v1_balance_sheet_path, bootstrap.dig("apiPaths", "summary")
      assert_equal session_path(Current.session), bootstrap.dig("railsPaths", "signOut")
      assert_equal transactions_path, bootstrap.dig("railsPaths", "transactions")
      assert_equal new_transaction_path, bootstrap.dig("railsPaths", "newTransaction")
    end
    assert_select "script[type='module'][src*='spa']"
  end

  test "requires a Rails session" do
    Current.session.destroy!

    get transactions_path

    assert_redirected_to new_session_path
  end
end