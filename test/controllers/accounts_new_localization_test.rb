require "test_helper"

class AccountsNewLocalizationTest < ActiveSupport::TestCase
  TRANSLATIONS = {
    "previous" => "Zurück",
    "next" => "Weiter"
  }.freeze

  test "German account container keyboard labels resolve without fallback" do
    TRANSLATIONS.each do |key, expected|
      full_key = "accounts.new.container.#{key}"

      assert I18n.exists?(full_key, :de, fallback: false), "de is missing #{full_key}"
      assert_equal expected, I18n.t(full_key, locale: :de, fallback: false)
    end
  end
end

class AccountsNewLocalizationRenderTest < ActionDispatch::IntegrationTest
  setup do
    ensure_tailwind_build
    sign_in @user = users(:family_admin)
  end

  test "serves account creation through SPA shell" do
    get new_account_url

    assert_response :success
    assert_select "#spa-root"
  end
end
