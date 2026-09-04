# Sureql: an app-specific PRQL dialect for custom reports.
#
# A "from <name>" in sureql is NOT a raw SQL table — it resolves through
# this registry to a real relation, and the compiler always injects the
# user's account-access authorization into the pipeline. New report
# sources are added here as the syntax grows.
module Sureql
  # Describes one queryable relation in the sureql dialect.
  #
  # relation        — SQL relation (table name) the source maps to.
  # select          — PRQL select clause exposing columns; kept explicit so
  #                   reports can only see curated fields.
  # authz_attribute — column the accessible-account filter applies to.
  # base_filters    — implicit scope the compiler injects after `from`, so
  #                   short queries read as the app means them (e.g. `from
  #                   transactions` means real, non-excluded transactions).
  #                   A filter is skipped when the query already mentions its
  #                   column, so explicit filters always win.
  # dimensions      — DimensionJoins the source exposes through the
  #                   `join <alias>=<dim> (==<key>)` shorthand.
  Source = Data.define(:key, :relation, :select, :authz_attribute, :base_filters, :dimensions) do
    def requires_authz?
      authz_attribute.present?
    end
  end

  # One implicit scope predicate. column is the bare word the compiler
  # looks for; expr is the PRQL injected when it's absent.
  BaseFilter = Data.define(:column, :expr)

  # A dimension joinable from a source with the shorthand idiom
  # `join <alias>=<dimension> (==<key>)`, hiding the bridge table.
  # The compiler rewrites it into explicit joins, e.g. transactions →
  # categories becomes entries → transactions → categories.
  #
  # dimension    — name users write after `join <alias>=`.
  # key          — shorthand key users write after `==`.
  # bridge       — relation joining the source to the dimension, exposed
  #                under bridge_alias so queries can reference it
  #                (e.g. `filter t.transfer_id == null`). `t` is reserved
  #                sureql vocabulary for the transactions bridge.
  # from_key     — column on the source relation matching bridge_pk.
  # bridge_pk    — primary key of the bridge relation.
  # bridge_fk    — foreign key on the bridge matching dim_pk.
  # dim_pk       — primary key of the dimension relation.
  # bridge_columns — curated bridge attributes users may reference bare
  #                (e.g. `filter transfer_id == null`); the compiler
  #                qualifies them to the bridge alias.
  DimensionJoin = Data.define(
    :dimension, :key,
    :bridge, :bridge_alias,
    :from_key, :bridge_pk, :bridge_fk, :dim_pk,
    :bridge_columns
  )

  # Registry of sureql sources. The compiler rejects `from` references
  # that aren't here, so users can never reach arbitrary tables.
  SOURCES = {
    "transactions" => Source.new(
      key: "transactions",
      relation: "entries",
      select: %w[
        id account_id date name amount currency notes excluded
        entryable_type entryable_id
      ],
      # entries.account_id is the join key for the accessible-accounts filter.
      authz_attribute: "account_id",
      base_filters: [
        BaseFilter.new(column: "entryable_type", expr: 'entryable_type == "Transaction"'),
        BaseFilter.new(column: "excluded", expr: "excluded == false")
      ],
      dimensions: [
        DimensionJoin.new(
          dimension: "categories",
          key: "category_id",
          bridge: "transactions",
          bridge_alias: "t",
          from_key: "entryable_id",
          bridge_pk: "id",
          bridge_fk: "category_id",
          dim_pk: "id",
          bridge_columns: %w[transfer_id category_id merchant_id kind]
        )
      ]
    ),
    "accounts" => Source.new(
      key: "accounts",
      relation: "accounts",
      select: %w[
        id family_id owner_id name classification subtype currency
        balance cash_balance status exclude_from_reports created_at
      ],
      # accounts authorize themselves — the injected filter applies to
      # the accounts relation's own id.
      authz_attribute: "id",
      base_filters: [],
      dimensions: []
    )
  }.freeze

  def self.source(key)
    SOURCES.fetch(key) { raise UnknownSourceError.new(key) }
  end

  def self.source?(key)
    SOURCES.key?(key)
  end

  class UnknownSourceError < StandardError
    def initialize(key)
      super("unknown sureql source `#{key}`. Available sources: #{SOURCES.keys.sort.join(", ")}")
    end
  end

  class CompileError < StandardError; end
end
