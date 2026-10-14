class EntrySearch
  include ActiveModel::Model
  include ActiveModel::Attributes

  attribute :search, :string
  attribute :amount, :string
  attribute :amount_operator, :string
  attribute :types, array: true
  attribute :status, array: true
  attribute :uncategorized, :boolean
  attribute :accounts, array: true
  attribute :account_ids, array: true
  attribute :start_date, :string
  attribute :end_date, :string
  attribute :categories, array: true
  attribute :tags, array: true
  attribute :excluded_categories, array: true
  attribute :excluded_tags, array: true
  attribute :excluded_types, array: true
  attribute :excluded_status, array: true

  attr_reader :family

  def initialize(attributes = {}, family: nil)
    @family = family
    super(attributes)
  end

  class << self
    def apply_search_filter(scope, search)
      return scope if search.blank?

      query = scope
      query = query.where("entries.name ILIKE :search OR entries.notes ILIKE :search",
        search: "%#{ActiveRecord::Base.sanitize_sql_like(search)}%"
      )
      query
    end

    def apply_date_filters(scope, start_date, end_date)
      return scope if start_date.blank? && end_date.blank?

      query = scope
      query = query.where("entries.date >= ?", start_date) if start_date.present?
      query = query.where("entries.date <= ?", end_date) if end_date.present?
      query
    end

    def apply_amount_filter(scope, amount, amount_operator)
      return scope if amount.blank? || amount_operator.blank?

      query = scope

      case amount_operator
      when "equal"
        query = query.where("ABS(ABS(entries.amount) - ?) <= 0.01", amount.to_f.abs)
      when "less"
        query = query.where("ABS(entries.amount) < ?", amount.to_f.abs)
      when "greater"
        query = query.where("ABS(entries.amount) > ?", amount.to_f.abs)
      end

      query
    end

    def apply_accounts_filter(scope, accounts, account_ids)
      return scope if accounts.blank? && account_ids.blank?

      query = scope
      query = query.where(accounts: { name: accounts }) if accounts.present?
      query = query.where(accounts: { id: account_ids }) if account_ids.present?
      query
    end

    # Uncategorized means what it means everywhere else (the Transactions
    # "Uncategorized" filter, the uncategorized badge, Quick Categorize):
    # Entry.uncategorized_transactions, which skips transfers and excluded entries.
    def apply_uncategorized_filter(scope, uncategorized)
      return scope unless uncategorized

      scope.where(id: Entry.uncategorized_transactions.select(:id))
    end

    def apply_status_filter(scope, statuses)
      return scope unless statuses.present?
      return scope if statuses.uniq.sort == %w[confirmed pending] # Both selected = no filter

      # Source the pending check from Transaction::PENDING_CHECK_SQL (aliased to
      # "t") so every provider in PENDING_PROVIDERS is covered. Previously this
      # hardcoded only simplefin/plaid/lunchflow, dropping enable_banking.
      pending_condition = <<~SQL.squish
        entries.entryable_type = 'Transaction'
        AND EXISTS (
          SELECT 1 FROM transactions t
          WHERE t.id = entries.entryable_id
          AND (#{Transaction::PENDING_CHECK_SQL})
        )
      SQL

      confirmed_condition = <<~SQL.squish
        entries.entryable_type != 'Transaction'
        OR NOT EXISTS (
          SELECT 1 FROM transactions t
          WHERE t.id = entries.entryable_id
          AND (#{Transaction::PENDING_CHECK_SQL})
        )
      SQL

      case statuses.sort
      when [ "pending" ]
        scope.where(pending_condition)
      when [ "confirmed" ]
        scope.where(confirmed_condition)
      else
        scope
      end
    end

    def apply_type_filter(scope, types)
      return scope unless types.present?
      return scope if types.sort == %w[expense income transfer]

      transfer_condition = <<~SQL.squish
        entries.entryable_type = 'Transaction' AND EXISTS (
          SELECT 1 FROM transactions t
          WHERE t.id = entries.entryable_id
          AND t.kind IN (#{Transaction::TRANSFER_KINDS.map { |k| "'#{k}'" }.join(', ')})
        )
      SQL

      case types.sort
      when [ "transfer" ]
        scope.where(transfer_condition)
      when [ "expense" ]
        scope.where("entries.amount >= 0").where.not(transfer_condition)
      when [ "income" ]
        scope.where("entries.amount < 0").where.not(transfer_condition)
      when [ "expense", "transfer" ]
        scope.where("entries.amount >= 0 OR (#{transfer_condition})")
      when [ "income", "transfer" ]
        scope.where("entries.amount < 0 OR (#{transfer_condition})")
      when [ "expense", "income" ]
        scope.where.not(transfer_condition)
      else
        scope
      end
    end

    def apply_category_filter(scope, categories, family: nil)
      return scope unless categories.present?

      include_uncategorized = categories.include?(Category::UNCATEGORIZED_FILTER_VALUE) || categories.include?("Uncategorized")
      real_categories = categories - [ Category::UNCATEGORIZED_FILTER_VALUE, "Uncategorized" ]

      parent_category_ids = if family.present? && real_categories.present?
        family.categories.where(name: real_categories).pluck(:id)
      elsif real_categories.present?
        Category.where(name: real_categories).pluck(:id)
      else
        []
      end

      uncategorized_excluded_kinds = Transaction::UNCATEGORIZED_EXCLUDED_KINDS
      uncategorized_condition = ActiveRecord::Base.sanitize_sql_array([
        "c.id IS NULL AND (t.kind IS NULL OR t.kind NOT IN (?))",
        uncategorized_excluded_kinds
      ])

      conditions = []
      if real_categories.present?
        conditions << ActiveRecord::Base.sanitize_sql_array([ "c.name IN (?)", real_categories ])
      end
      if parent_category_ids.present?
        conditions << ActiveRecord::Base.sanitize_sql_array([ "c.parent_id IN (?)", parent_category_ids ])
      end
      if include_uncategorized
        conditions << "(#{uncategorized_condition})"
      end

      return scope.none if conditions.empty?

      scope.where(<<~SQL.squish)
        entries.entryable_type = 'Transaction' AND EXISTS (
          SELECT 1 FROM transactions t
          LEFT JOIN categories c ON c.id = t.category_id
          WHERE t.id = entries.entryable_id
          AND (#{conditions.join(' OR ')})
        )
      SQL
    end

    def apply_tag_filter(scope, tags)
      return scope unless tags.present?

      include_untagged = tags.include?(Tag::UNTAGGED_FILTER_VALUE) || tags.include?("Untagged")
      real_tags = tags - [ Tag::UNTAGGED_FILTER_VALUE, "Untagged" ]

      if include_untagged && real_tags.empty?
        scope.where(<<~SQL.squish)
          entries.entryable_type = 'Transaction' AND NOT EXISTS (
            SELECT 1 FROM taggings tg
            WHERE tg.taggable_type = 'Transaction' AND tg.taggable_id = entries.entryable_id
          )
        SQL
      elsif include_untagged
        scope.where(<<~SQL.squish, real_tags: real_tags)
          entries.entryable_type = 'Transaction' AND (
            NOT EXISTS (
              SELECT 1 FROM taggings tg
              WHERE tg.taggable_type = 'Transaction' AND tg.taggable_id = entries.entryable_id
            )
            OR EXISTS (
              SELECT 1 FROM transactions t
              JOIN taggings tg ON tg.taggable_type = 'Transaction' AND tg.taggable_id = t.id
              JOIN tags ON tags.id = tg.tag_id
              WHERE t.id = entries.entryable_id AND tags.name IN (:real_tags)
            )
          )
        SQL
      else
        scope.where(<<~SQL.squish, real_tags: real_tags)
          entries.entryable_type = 'Transaction' AND EXISTS (
            SELECT 1 FROM transactions t
            JOIN taggings tg ON tg.taggable_type = 'Transaction' AND tg.taggable_id = t.id
            JOIN tags ON tags.id = tg.tag_id
            WHERE t.id = entries.entryable_id AND tags.name IN (:real_tags)
          )
        SQL
      end
    end

    def apply_type_exclusion(scope, excluded_types)
      return scope unless excluded_types.present?

      excluded_ids = apply_type_filter(scope, excluded_types).select(:id)
      scope.where.not(id: excluded_ids)
    end

    def apply_status_exclusion(scope, excluded_status)
      return scope unless excluded_status.present?

      excluded_ids = apply_status_filter(scope, excluded_status).select(:id)
      scope.where.not(id: excluded_ids)
    end

    def apply_category_exclusion(scope, excluded_categories, family: nil)
      return scope unless excluded_categories.present?

      excluded_ids = apply_category_filter(scope, excluded_categories, family: family).select(:id)
      scope.where.not(id: excluded_ids)
    end

    def apply_tag_exclusion(scope, excluded_tags)
      return scope unless excluded_tags.present?

      excluded_ids = apply_tag_filter(scope, excluded_tags).select(:id)
      scope.where.not(id: excluded_ids)
    end
  end

  def build_query(scope)
    query = scope.joins(:account)
    query = self.class.apply_search_filter(query, search)
    query = self.class.apply_date_filters(query, start_date, end_date)
    query = self.class.apply_amount_filter(query, amount, amount_operator)
    query = self.class.apply_accounts_filter(query, accounts, account_ids)
    query = self.class.apply_status_filter(query, status)
    query = self.class.apply_uncategorized_filter(query, uncategorized)
    query = self.class.apply_type_filter(query, types)
    query = self.class.apply_category_filter(query, categories, family: family)
    query = self.class.apply_tag_filter(query, tags)
    query = self.class.apply_status_exclusion(query, excluded_status)
    query = self.class.apply_type_exclusion(query, excluded_types)
    query = self.class.apply_category_exclusion(query, excluded_categories, family: family)
    query = self.class.apply_tag_exclusion(query, excluded_tags)
    query
  end
end
