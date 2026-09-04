require "sureql"
require "prql_rb"

# Compiles the sureql dialect to SQL.
#
# Pipeline:
#   1. Rewrite `from <sureql_source>` into the real relation and inject
#      the user's account-access authorization as a PRQL filter. This runs
#      before prqlc sees the source, so no pipeline can bypass authz.
#   2. Compile the expanded PRQL to SQL with the prql_rb gem.
#
# The authz filter is injected as `filter <attr> in [id, id, ...]` with
# literal UUIDs resolved from the user's accessible accounts. Literal
# injection is safe here because the ids come from the database, not
# user input.
class Sureql::Compiler
  def initialize(user, target: PrqlRb::DEFAULT_TARGET)
    @user = user
    @target = target
  end

  # Returns compiled SQL. Raises Sureql::UnknownSourceError or
  # Sureql::CompileError (wrapping PrqlRb::CompileError).
  def call(source)
    expanded = expand(source)
    begin
      PrqlRb.compile(expanded, target: @target)
    rescue PrqlRb::CompileError => e
      raise Sureql::CompileError, e.message
    end
  end

  # Compilation without authz injection — used only by tests and by
  # tooling that renders SQL for display. Never expose the result to a
  # query executor.
  def compile_unsafe(source)
    begin
      PrqlRb.compile(source, target: @target)
    rescue PrqlRb::CompileError => e
      raise Sureql::CompileError, e.message
    end
  end

  private
    # Rewrites `from <name>` lines into the mapped relation and appends
    # the authz filter for the source. Curated column exposure is left
    # to the source registry's select list (display-only for now);
    # authz is the security boundary.
    def expand(source)
      lines = source.split("\n")
      expanded = []
      found_from = false

      lines.each do |line|
        if (match = line.match(/\A\s*from\s+(\w+)\s*\z/))
          found_from = true
          src = Sureql.source(match[1])
          expanded << "from #{src.relation}"
          if src.requires_authz?
            expanded << authz_filter(src)
          end
        else
          expanded << line
        end
      end

      unless found_from
        raise Sureql::CompileError, "sureql requires at least one `from <source>` line"
      end

      expanded.join("\n")
    end

    def authz_filter(src)
      ids = accessible_account_ids
      if ids.empty?
        # Empty access: a filter that matches nothing, not a skipped
        # filter (which would leak every row).
        return "filter #{src.authz_attribute} == null"
      end
      quoted = ids.map { |id| "'#{id}'" }.join(", ")
      # prqlc 0.13 requires the pipe form for `in` against a list.
      "filter (#{src.authz_attribute} | in [#{quoted}])"
    end

    def accessible_account_ids
      @accessible_account_ids ||= Account.accessible_by(@user).pluck(:id)
    end
end
