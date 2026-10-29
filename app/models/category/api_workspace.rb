# frozen_string_literal: true

class Category::ApiWorkspace
  def initialize(family)
    @family = family
  end

  def index
    categories = @family.categories.includes(:parent, :subcategories).alphabetically_by_hierarchy.to_a
    {
      groups: Category::Group.for(categories).map { |group| { root: row(group.category), subcategories: group.subcategories.map { |category| row(category) } } },
      count: categories.size,
      has_transactions_by_id: Category.ids_with_transactions(family: @family, category_ids: categories.map(&:id)),
      can_bootstrap: true, empty: categories.empty?, colors: Category::COLORS, icons: Category.icon_codes
    }
  end

  def form(category)
    parents = category.parent? ? [] : @family.categories.roots.alphabetically.where.not(id: category.id)
    {
      category: row(category).merge(is_parent: category.parent?, can_assign_parent: !category.parent?),
      colors: Category::COLORS, icons: Category.icon_codes,
      parent_options: parents.map { |parent| { id: parent.id, display_name: parent.display_name } }
    }
  end

  def row(category)
    {
      id: category.id, name: category.name, display_name: category.display_name,
      display_name_with_parent: category.display_name_with_parent, color: category.color,
      lucide_icon: category.lucide_icon, parent_id: category.parent_id, has_parent: category.subcategory?
    }
  end
end
