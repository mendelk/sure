module CategoriesHelper
  def transfer_category
    Category.new \
      name: I18n.t("categories.virtual.transfer"),
      color: Category::TRANSFER_COLOR,
      lucide_icon: "arrow-right-left"
  end

  def payment_category
    Category.new \
      name: I18n.t("categories.virtual.payment"),
      color: Category::PAYMENT_COLOR,
      lucide_icon: "arrow-right"
  end

  def trade_category
    Category.new \
      name: I18n.t("categories.virtual.trade"),
      color: Category::TRADE_COLOR
  end

  def transfer_outflow_category(transaction, accessible_account_ids: @accessible_account_ids)
    return unless transaction.category_set_on_transfer_outflow?

    from_account_id = transaction.transfer.outflow_transaction.entry.account_id
    visible = if accessible_account_ids
      accessible_account_ids.include?(from_account_id)
    else
      @category_visible_account_ids ||= Current.user ? Current.user.accessible_accounts.pluck(:id).to_set : Set.new
      @category_visible_account_ids.include?(from_account_id)
    end
    return unless visible

    transaction.transfer.outflow_transaction.category || Category.uncategorized
  end

  def read_only_category(transaction)
    transfer_outflow_category(transaction) || (transaction.payment? ? payment_category : transfer_category)
  end

  def family_categories
    [ Category.uncategorized ].concat(Current.family.categories.alphabetically_by_hierarchy)
  end
end
