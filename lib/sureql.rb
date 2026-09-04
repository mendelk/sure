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
  Source = Data.define(:key, :relation, :select, :authz_attribute) do
    def requires_authz?
      authz_attribute.present?
    end
  end

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
      authz_attribute: "account_id"
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
      authz_attribute: "id"
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
