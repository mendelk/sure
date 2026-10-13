require "application_system_test_case"

class CategoriesTest < ApplicationSystemTestCase
  setup do
    sign_in @user = users(:family_admin)
  end

  test "can create category" do
    visit categories_url
    click_on "New category"
    fill_in "Name", with: "My Shiny New Category"
    click_button "Create"
    assert_text "My Shiny New Category"
  end

  test "trying to create a duplicate category fails" do
    visit categories_url
    click_on "New category"
    fill_in "Name", with: categories(:food_and_drink).name
    click_button "Create"

    assert_text "Name has already been taken"
  end

  test "can search the icon picker and save the icon it finds" do
    visit categories_url
    click_on "New category"
    fill_in "Name", with: "Takeout"

    fill_in "Search icons", with: "pizza"
    assert_no_text "coffee"
    find("label", text: "pizza").click

    click_button "Create"

    assert_text "Takeout"

    assert_equal "pizza", @user.family.categories.find_by!(name: "Takeout").lucide_icon
  end

  test "picking a color updates the avatar preview" do
    visit categories_url
    click_on "New category"

    fill_in "Name", with: "Color Check"
    color = Category::COLORS.first
    find("input[type='radio'][value='#{color}']", visible: :all).click

    click_button "Create"
    assert_text "Color Check"
  end

  test "long category names truncate before the actions menu on mobile" do
    category = categories(:food_and_drink)
    category.update!(name: "Super Long Category Name That Should Stop Before The Menu Button On Mobile")

    page.current_window.resize_to(315, 643)

    visit categories_url

    row = find("[data-testid='category-content']", text: "Super Long Category Name")
    assert row.visible?

    viewport_width = page.evaluate_script("window.innerWidth")
    page_scroll_width = page.evaluate_script("document.documentElement.scrollWidth")

    assert_operator page_scroll_width, :<=, viewport_width
  end
end
