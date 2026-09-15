require "test_helper"

class SpaControllerTest < ActionDispatch::IntegrationTest
  setup do
    ensure_tailwind_build
    ensure_spa_build
    sign_in @user = users(:family_admin)
  end

  test "renders the authenticated React shell" do
    get spa_path

    assert_response :success
    assert_select "meta[name='turbo-visit-control'][content='reload']"
    assert_select "#spa-root"
    assert_select "script#spa-bootstrap[type='application/json']" do |elements|
      bootstrap = JSON.parse(elements.first.text)

      assert_equal @user.id, bootstrap.dig("currentUser", "id")
      assert_equal @user.display_name, bootstrap.dig("currentUser", "name")
      assert_equal root_path, bootstrap.dig("railsPaths", "home")
    end
    assert_select "script[type='module'][src*='spa']"
  end

  test "serves nested client routes through the same shell" do
    get "/spa/routing"

    assert_response :success
    assert_select "#spa-root"
  end

  test "requires a Rails session" do
    Current.session.destroy!

    get spa_path

    assert_redirected_to new_session_path
  end
end
