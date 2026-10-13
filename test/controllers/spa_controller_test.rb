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
      assert_equal api_v1_accounts_path, bootstrap.dig("apiPaths", "accounts")
      assert_equal dashboard_monarch_run_path, bootstrap.dig("apiPaths", "sureqlRun")
      assert_equal transactions_path, bootstrap.dig("railsPaths", "transactions")
      assert_equal dashboards_path, bootstrap.dig("railsPaths", "dashboards")
      assert_equal new_transaction_path, bootstrap.dig("railsPaths", "newTransaction")
      assert_equal family_merchants_path, bootstrap.dig("railsPaths", "familyMerchants")
      assert_equal new_rule_path, bootstrap.dig("railsPaths", "newRule")
      assert_equal rules_path, bootstrap.dig("railsPaths", "rules")
      assert_equal categories_path, bootstrap.dig("railsPaths", "categories")
      assert_equal tags_path, bootstrap.dig("railsPaths", "tags")
      assert_equal transactions_categorize_path, bootstrap.dig("railsPaths", "transactionsCategorize")
      assert_equal "#{transactions_path}/:transaction_id/split/new",
        bootstrap.dig("railsUrlTemplates", "newTransactionSplit")
      assert_equal "#{transactions_path}/:transaction_id/transfer_match/new",
        bootstrap.dig("railsUrlTemplates", "newTransactionTransferMatch")
    end
    assert_select "script[type='module'][src*='spa']"
  end

  test "bootstrap navItems mirror the Rails sidebar composition" do
    get transactions_path
    assert_response :success

    assert_select "script#spa-bootstrap[type='application/json']" do |elements|
      nav_items = JSON.parse(elements.first.text).fetch("navItems")
      summary = nav_items.map { |item| [ item.fetch("label"), item.fetch("icon"), item.fetch("preview"), item.fetch("mobileOnly") ] }

      # Same entries and order as the Rails application layout rail: no
      # preview flag means Bills is absent and the Plan slot renders as
      # Budgets; Assistant stays mobile-only.
      assert_equal [
        [ "Home", "pie-chart", false, false ],
        [ "Dashboards", "layout-dashboard", false, false ],
        [ "Transactions", "credit-card", false, false ],
        [ "Reports", "chart-bar", false, false ],
        [ "Budgets", "map", false, false ],
        [ "Assistant", "sparkles", false, true ]
      ], summary

      budgets = nav_items.find { |item| item.fetch("label") == "Budgets" }
      assert_equal budgets_path, budgets.fetch("href")
    end
  end

  test "bootstrap navItems include preview-gated Bills and Plan for preview users" do
    @user.update!(preferences: (@user.preferences || {}).merge("preview_features_enabled" => true))

    get transactions_path
    assert_response :success

    assert_select "script#spa-bootstrap[type='application/json']" do |elements|
      nav_items = JSON.parse(elements.first.text).fetch("navItems")
      summary = nav_items.map { |item| [ item.fetch("label"), item.fetch("preview") ] }

      assert_equal [
        [ "Home", false ],
        [ "Dashboards", false ],
        [ "Transactions", false ],
        [ "Bills", true ],
        [ "Reports", false ],
        [ "Plan", true ],
        [ "Assistant", false ]
      ], summary

      bills = nav_items.find { |item| item.fetch("label") == "Bills" }
      assert_equal bills_path, bills.fetch("href")
      plan = nav_items.find { |item| item.fetch("label") == "Plan" }
      assert_equal plan_path, plan.fetch("href")
    end
  end

  test "serves dashboards through the React SPA shell" do
    get dashboards_path

    assert_response :success
    assert_select "#spa-root"
    assert_select "script#spa-bootstrap[type='application/json']" do |elements|
      bootstrap = JSON.parse(elements.first.text)

      assert_equal dashboards_path, bootstrap.dig("railsPaths", "dashboards")
      assert_equal dashboard_monarch_run_path, bootstrap.dig("apiPaths", "sureqlRun")
    end
    assert_select "script[type='module'][src*='spa']"
  end

  test "serves transaction detail through the React SPA shell" do
    transaction = @user.family.transactions.first

    get spa_transaction_path(transaction)

    assert_response :success
    assert_select "#spa-root"
    assert_select "script#spa-bootstrap[type='application/json']"
    assert_select "script[type='module'][src*='spa']"
  end
  test "serves accounts through the React SPA shell" do
    get accounts_path

    assert_response :success
    assert_select "#spa-root"
    assert_select "script#spa-bootstrap[type='application/json']"
    assert_select "script[type='module'][src*='spa']"
  end

  test "serves statement vault through the React SPA shell" do
    get account_statements_path

    assert_response :success
    assert_select "#spa-root"
    assert_select "script#spa-bootstrap[type='application/json']"
    assert_select "script[type='module'][src*='spa']"
  end

  test "requires a Rails session" do
    Current.session.destroy!

    get transactions_path
    assert_redirected_to new_session_path

    get new_transaction_path
    assert_redirected_to new_session_path

    get dashboards_path
    assert_redirected_to new_session_path
  end
end
