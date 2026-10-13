require "application_system_test_case"

class PropertiesEditTest < ApplicationSystemTestCase
  setup do
    ensure_spa_build
    sign_in @user = users(:family_admin)

    Family.any_instance.stubs(:get_link_token).returns("test-link-token")

    visit root_url
    open_new_account_modal
    create_new_property_account
  end

  test "can persist property subtype" do
    assert_selector "h1", text: "[system test] Property Account"
    open_account_edit_dialog
    assert_equal "single_family_home", find_field("property-edit-subtype").value
  end

  private

    def open_account_edit_dialog
      click_button I18n.t("accounts.show.spa.account_menu")
      click_on I18n.t("accounts.show.menu.edit")
      assert_selector "[role='dialog']"
      assert_field "property-edit-subtype"
    end

    def open_new_account_modal
      within "[data-controller='DS--tabs']" do
        click_button "All"
        click_link "New account"
      end
    end

    def create_new_property_account
      click_link "Property"

      account_name = "[system test] Property Account"
      fill_in "property-name", with: account_name
      select "Single Family Home", from: "property-subtype"
      fill_in "property-year-built", with: 2005
      fill_in "property-area-value", with: 2250

      click_button "Next"

      # Step 2: Enter balance information
      assert_field "property-balance"
      fill_in "property-balance", with: 500000
      click_button "Next"

      # Step 3: Enter address information
      assert_field "property-line1"
      fill_in "property-line1", with: "123 Main St"
      fill_in "property-locality", with: "San Francisco"
      fill_in "property-region", with: "CA"
      fill_in "property-postal-code", with: "94101"
      fill_in "property-country", with: "US"

      click_button "Save"

      # Verify account was created and is now active
      assert_text account_name

      created_account = Account.order(:created_at).last
      assert_equal "active", created_account.status
      assert_equal 500000, created_account.balance
      assert_equal "123 Main St", created_account.property.address.line1
      assert_equal "San Francisco", created_account.property.address.locality
    end
end
