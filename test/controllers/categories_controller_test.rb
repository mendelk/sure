require "test_helper"

class CategoriesControllerTest < ActionDispatch::IntegrationTest
  setup do
    sign_in @user = users(:family_admin)
    @family = @user.family
    @transaction = transactions :one
    ensure_tailwind_build
  end

  test "index" do
    get categories_url
    assert_response :success
    assert_select "#spa-root", count: 1
  end

  test "index as json returns grouped hierarchy with counts and form metadata" do
    get categories_url(format: :json)
    assert_response :success

    payload = JSON.parse(response.body)
    assert payload.fetch("groups").any?
    assert_equal @family.categories.count, payload.fetch("count")
    assert_equal false, payload.fetch("empty")
    assert_equal Category::COLORS, payload.fetch("colors")
    assert_includes payload.fetch("icons"), "utensils"

    root_ids = payload.fetch("groups").map { |group| group.fetch("root").fetch("id") }
    assert_includes root_ids, categories(:food_and_drink).id

    food_group = payload.fetch("groups").find { |group| group.fetch("root").fetch("id") == categories(:food_and_drink).id }
    assert_equal categories(:food_and_drink).display_name, food_group.fetch("root").fetch("display_name")

    assert payload.fetch("has_transactions_by_id").key?(categories(:food_and_drink).id)
  end

  test "index as json reports empty state" do
    Current.family.categories.destroy_all

    get categories_url(format: :json)
    assert_response :success

    payload = JSON.parse(response.body)
    assert_equal [], payload.fetch("groups")
    assert_equal 0, payload.fetch("count")
    assert_equal true, payload.fetch("empty")
    assert_equal true, payload.fetch("can_bootstrap")
  end

  test "new as json returns defaults with parent options" do
    get new_category_url(format: :json)
    assert_response :success

    payload = JSON.parse(response.body)
    assert payload.fetch("category").fetch("color").present?
    assert_equal Category::COLORS, payload.fetch("colors")
    assert payload.fetch("parent_options").any?
  end

  test "edit as json returns category with parent options" do
    get edit_category_url(categories(:food_and_drink), format: :json)
    assert_response :success

    payload = JSON.parse(response.body)
    assert_equal categories(:food_and_drink).id, payload.fetch("category").fetch("id")
    assert_equal categories(:food_and_drink).display_name, payload.fetch("category").fetch("display_name")
    assert payload.fetch("parent_options").none? { |option| option.fetch("id") == categories(:food_and_drink).id }
  end

  test "update as json returns the updated category" do
    patch category_url(categories(:income), format: :json), params: {
      category: { name: "JSON Renamed", color: Category::COLORS.sample } }

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal "JSON Renamed", payload.fetch("category").fetch("name")
    assert_equal "JSON Renamed", categories(:income).reload.name
  end

  test "update as json returns 422 for invalid category" do
    patch category_url(categories(:income), format: :json), params: {
      category: { name: "", color: "#000000" } }

    assert_response :unprocessable_entity
    assert JSON.parse(response.body).fetch("errors").any?
  end

  test "destroy as json removes a category without transactions" do
    disposable = @family.categories.create!(name: "Disposable", color: "#000000", lucide_icon: "shapes")

    assert_difference "Category.count", -1 do
      delete category_url(disposable, format: :json)
    end

    assert_response :success
    assert_equal true, JSON.parse(response.body).fetch("ok")
  end

  test "destroy_all as json removes every category" do
    delete destroy_all_categories_url(format: :json)

    assert_response :success
    assert_equal true, JSON.parse(response.body).fetch("ok")
    assert_equal 0, @family.categories.count
  end

  test "bootstrap as json creates default categories" do
    Current.family.categories.destroy_all

    post bootstrap_categories_url(format: :json)

    assert_response :success
    assert_equal true, JSON.parse(response.body).fetch("ok")
    assert @family.categories.count.positive?
  end

  test "perform_merge as json merges and reports merged_count" do
    target = @family.categories.create!(name: "JSON Merge Target", color: "#000000", lucide_icon: "shapes")
    source = @family.categories.create!(name: "JSON Merge Source", color: "#111111", lucide_icon: "shapes")

    assert_difference "Category.count", -1 do
      post perform_merge_categories_url(format: :json), params: {
        target_id: target.id,
        source_ids: [ source.id ] }
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal true, payload.fetch("ok")
    assert_equal 1, payload.fetch("merged_count")
    assert_not Category.exists?(source.id)
  end

  test "perform_merge as json rejects the target as a source" do
    target = @family.categories.create!(name: "JSON Self Target", color: "#000000", lucide_icon: "shapes")
    source = @family.categories.create!(name: "JSON Self Source", color: "#111111", lucide_icon: "shapes")

    assert_no_difference "Category.count" do
      post perform_merge_categories_url(format: :json), params: {
        target_id: target.id,
        source_ids: [ target.id, source.id ] }
    end

    assert_response :unprocessable_entity
    assert JSON.parse(response.body).fetch("errors").any?
    assert Category.exists?(target.id)
    assert Category.exists?(source.id)
  end

  test "perform_merge as json reports missing target" do
    source = @family.categories.create!(name: "JSON Orphan Source", color: "#111111", lucide_icon: "shapes")

    post perform_merge_categories_url(format: :json), params: {
      target_id: "00000000-0000-0000-0000-000000000000",
      source_ids: [ source.id ] }

    assert_response :unprocessable_entity
    assert JSON.parse(response.body).fetch("errors").any?
    assert Category.exists?(source.id)
  end

  test "perform_merge as json reports invalid sources" do
    post perform_merge_categories_url(format: :json), params: {
      target_id: categories(:income).id,
      source_ids: [] }

    assert_response :unprocessable_entity
    assert JSON.parse(response.body).fetch("errors").any?
  end

  test "perform_merge as json surfaces merger hierarchy guards" do
    parent = @family.categories.create!(name: "JSON Merge Parent", color: "#000000", lucide_icon: "folder")
    child = @family.categories.create!(name: "JSON Merge Child", color: "#111111", lucide_icon: "folder", parent: parent)

    post perform_merge_categories_url(format: :json), params: {
      target_id: child.id,
      source_ids: [ parent.id ] }

    assert_response :unprocessable_entity
    assert JSON.parse(response.body).fetch("errors").any?
    assert Category.exists?(parent.id)
  end

  test "index avoids per-category subcategory and transaction existence queries" do
    4.times do |idx|
      parent = @family.categories.create!(
        name: "Performance Parent #{idx}",
        color: "#000000",
        lucide_icon: "folder"
      )
      child = @family.categories.create!(
        name: "Performance Child #{idx}",
        color: "#111111",
        lucide_icon: "folder",
        parent: parent
      )
      transaction = Transaction.create!(category: child)
      Entry.create!(
        account: accounts(:depository),
        entryable: transaction,
        name: "Performance transaction #{idx}",
        date: Date.current,
        amount: 10,
        currency: "USD"
      )
    end

    queries = capture_sql_queries { get categories_url(format: :json) }

    assert_response :success
    payload = JSON.parse(response.body)
    names = payload.fetch("groups").flat_map { |group| [ group.fetch("root").fetch("name") ] + group.fetch("subcategories").map { |sub| sub.fetch("name") } }
    assert_includes names, "Performance Parent 0"
    assert_includes names, "Performance Child 0"

    assert_empty queries.grep(/FROM "categories" WHERE "categories"\."parent_id" =/)
    assert_empty queries.grep(/FROM "transactions" WHERE "transactions"\."category_id" =/)
  end

  test "new" do
    get new_category_url
    assert_response :success
  end

  test "create" do
    color = Category::COLORS.sample

    assert_difference "Category.count", +1 do
      post categories_url, params: {
        category: {
          name: "New Category",
          color: color } }
    end

    new_category = Category.order(:created_at).last

    assert_redirected_to categories_url
    assert_equal "New Category", new_category.name
    assert_equal color, new_category.color
  end

  test "create fails if name is not unique" do
    assert_no_difference "Category.count" do
      post categories_url, params: {
        category: {
          name: categories(:food_and_drink).name,
          color: Category::COLORS.sample } }
    end

    assert_redirected_to categories_url
  end

  test "create as json returns rendered category option" do
    color = Category::COLORS.sample

    assert_difference "Category.count", +1 do
      post categories_url(format: :json), params: {
        category: {
          name: "JSON Category",
          color: color } }
    end

    assert_response :created

    response_json = JSON.parse(response.body)
    new_category = Category.find(response_json.fetch("id"))

    assert_equal "JSON Category", response_json.fetch("name")
    assert_equal color, response_json.fetch("color")
    assert_equal "JSON Category", new_category.name
    assert_includes response_json.fetch("html"), "JSON Category"
    assert_includes response_json.fetch("html"), new_category.id
  end

  test "create as json returns errors for invalid category" do
    assert_no_difference "Category.count" do
      post categories_url(format: :json), params: {
        category: {
          name: categories(:food_and_drink).name,
          color: Category::COLORS.sample } }
    end

    assert_response :unprocessable_entity

    response_json = JSON.parse(response.body)
    assert response_json.fetch("errors").any?
  end

  test "create and assign to transaction" do
    color = Category::COLORS.sample

    assert_difference "Category.count", +1 do
      post categories_url, params: {
        transaction_id: @transaction.id,
        category: {
          name: "New Category",
          color: color } }
    end

    new_category = Category.order(:created_at).last

    assert_redirected_to categories_url
    assert_equal "New Category", new_category.name
    assert_equal color, new_category.color
    assert_equal @transaction.reload.category, new_category
  end

  test "edit" do
    get edit_category_url(categories(:food_and_drink))
    assert_response :success
  end

  test "update" do
    new_color = Category::COLORS.without(categories(:income).color).sample

    assert_changes -> { categories(:income).name }, to: "New Name" do
      assert_changes -> { categories(:income).reload.color }, to: new_color do
        patch category_url(categories(:income)), params: {
          category: {
            name: "New Name",
            color: new_color } }
      end
    end

    assert_redirected_to categories_url
  end

  test "bootstrap" do
    # 22 default categories minus 2 that already exist in fixtures (Income, Food & Drink)
    assert_difference "Category.count", 20 do
      post bootstrap_categories_url
    end

    assert_redirected_to categories_url
  end

  test "merge renders the SPA shell" do
    get merge_categories_path

    assert_response :success
    assert_select "#spa-root", count: 1
  end

  test "merge as json returns hierarchy-ordered categories" do
    parent = @family.categories.create!(
      name: "Zoo",
      color: "#000000",
      lucide_icon: "folder"
    )
    child = @family.categories.create!(
      name: "Apple",
      color: "#111111",
      lucide_icon: "folder",
      parent: parent
    )

    get merge_categories_path(format: :json)

    assert_response :success

    category_ids = JSON.parse(response.body).fetch("categories").map { |entry| entry.fetch("id") }
    parent_index = category_ids.index(parent.id)
    child_index = category_ids.index(child.id)

    assert_not_nil parent_index
    assert_not_nil child_index
    assert_equal parent_index + 1, child_index
  end

  test "merge selected categories into an existing category" do
    target = @family.categories.create!(
      name: "Dining",
      color: "#111111",
      lucide_icon: "utensils"
    )
    source = @family.categories.create!(
      name: "Coffee Shops",
      color: "#000000",
      lucide_icon: "coffee"
    )
    transaction = Transaction.create!(category: source)
    Entry.create!(
      account: accounts(:depository),
      entryable: transaction,
      name: "Coffee transaction",
      date: Date.current,
      amount: 10,
      currency: "USD"
    )

    assert_difference "Category.count", -1 do
      post perform_merge_categories_path, params: {
        target_id: target.id,
        source_ids: [ source.id ]
      }
    end

    assert_redirected_to categories_path
    assert_equal target, transaction.reload.category
    assert_not Category.exists?(source.id)
  end

  test "merge redirects when a source category cannot be destroyed" do
    target = @family.categories.create!(
      name: "Destroy Failure Target",
      color: "#000000",
      lucide_icon: "shapes"
    )
    source = @family.categories.create!(
      name: "Destroy Failure Source",
      color: "#111111",
      lucide_icon: "shapes"
    )

    Category::Merger.any_instance
                    .stubs(:merge!)
                    .raises(ActiveRecord::RecordNotDestroyed.new("cannot destroy category", source))

    post perform_merge_categories_path, params: {
      target_id: target.id,
      source_ids: [ source.id ]
    }

    assert_redirected_to merge_categories_path
    assert Category.exists?(source.id)
  end

  test "merge rejects selecting the target as a source" do
    target = @family.categories.create!(
      name: "Self Target",
      color: "#000000",
      lucide_icon: "shapes"
    )
    source = @family.categories.create!(
      name: "Self Source",
      color: "#111111",
      lucide_icon: "shapes"
    )

    post perform_merge_categories_path, params: {
      target_id: target.id,
      source_ids: [ target.id, source.id ]
    }

    assert_redirected_to merge_categories_path
    assert Category.exists?(target.id)
    assert Category.exists?(source.id)
  end

  test "merge rejects parent category into any descendant" do
    parent = @family.categories.create!(
      name: "Parent Category",
      color: "#000000",
      lucide_icon: "folder"
    )
    child = @family.categories.create!(
      name: "Child Category",
      color: "#111111",
      lucide_icon: "folder",
      parent: parent
    )
    grandchild = @family.categories.create!(
      name: "Grandchild Category",
      color: "#222222",
      lucide_icon: "folder"
    )
    # Category validation normally prevents this depth; the merger still guards
    # against stale or imported data with deeper hierarchies.
    grandchild.update_column(:parent_id, child.id)

    post perform_merge_categories_path, params: {
      target_id: grandchild.id,
      source_ids: [ parent.id ]
    }

    assert_redirected_to merge_categories_path
    assert Category.exists?(parent.id)
  end

  test "merge reparents source children to target category" do
    target = @family.categories.create!(
      name: "Target Category",
      color: "#000000",
      lucide_icon: "folder"
    )
    source = @family.categories.create!(
      name: "Source Category",
      color: "#111111",
      lucide_icon: "folder"
    )
    child = @family.categories.create!(
      name: "Source Child Category",
      color: "#222222",
      lucide_icon: "folder",
      parent: source
    )

    post perform_merge_categories_path, params: {
      target_id: target.id,
      source_ids: [ source.id ]
    }

    assert_redirected_to categories_path
    assert_equal target.id, child.reload.parent_id
    assert_not Category.exists?(source.id)
  end

  test "merge rejects moving source children under a subcategory target" do
    parent = @family.categories.create!(
      name: "Target Parent Category",
      color: "#000000",
      lucide_icon: "folder"
    )
    target = @family.categories.create!(
      name: "Target Subcategory",
      color: "#111111",
      lucide_icon: "folder",
      parent: parent
    )
    source = @family.categories.create!(
      name: "Source With Child",
      color: "#222222",
      lucide_icon: "folder"
    )
    child = @family.categories.create!(
      name: "Source Child",
      color: "#333333",
      lucide_icon: "folder",
      parent: source
    )

    post perform_merge_categories_path, params: {
      target_id: target.id,
      source_ids: [ source.id ]
    }

    assert_redirected_to merge_categories_path
    assert Category.exists?(source.id)
    assert_equal source.id, child.reload.parent_id
  end

  test "merge ignores categories outside current family" do
    other = families(:empty).categories.create!(
      name: "Other Family Category",
      color: "#000000",
      lucide_icon: "shapes"
    )

    post perform_merge_categories_path, params: {
      target_id: categories(:income).id,
      source_ids: [ other.id ]
    }

    assert_redirected_to merge_categories_path
    assert Category.exists?(other.id)
  end

  private
    def capture_sql_queries
      queries = []
      callback = lambda do |_name, _started, _finished, _unique_id, payload|
        next if payload[:cached]
        next if %w[SCHEMA TRANSACTION].include?(payload[:name])

        queries << payload[:sql].squish
      end

      ActiveSupport::Notifications.subscribed(callback, "sql.active_record") do
        yield
      end

      queries
    end
end
