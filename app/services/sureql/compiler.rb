require "sureql"
require "prql_rb"

# Compiles the sureql dialect to SQL.
#
# Pipeline:
#   1. Rewrite `from <sureql_source>` into the real relation and inject
#      the user's account-access authorization as a PRQL filter. This runs
#      before prqlc sees the source, so no pipeline can bypass authz.
#   2. Inject the source's implicit base filters (e.g. transactions means
#      real, non-excluded Transaction entries), skipping any the query
#      already constrains explicitly.
#   3. Rewrite dimension-join shorthands (`join c=categories
#      (==category_id)`) into explicit bridge joins, and qualify bare
#      source columns (`amount` → `entries.amount`) so short queries
#      survive joins without ambiguous-name errors.
#   4. Compile the expanded PRQL to SQL with the prql_rb gem.
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
      current_src = nil
      injected_bridges = []
      bridge_qualifier = bridge_qualifier_for(source)

      lines.each do |line|
        if (match = line.match(/\A\s*from\s+(\w+)\s*\z/))
          found_from = true
          src = Sureql.source(match[1])
          current_src = src
          expanded << "from #{src.relation}"
          if src.requires_authz?
            expanded << authz_filter(src)
          end
          base_filters(src, source).each do |filter|
            expanded << "filter #{filter}"
          end
        else
          expanded.concat(rewrite_line(current_src, line, source, injected_bridges, bridge_qualifier))
        end
      end

      unless found_from
        raise Sureql::CompileError, "sureql requires at least one `from <source>` line"
      end

      expanded.join("\n")
    end

    # Implicit scope for the source (transactions ⇒ real, non-excluded
    # Transaction entries). A base filter is skipped when the query already
    # mentions its column, so `filter excluded == true` genuinely shows
    # excluded entries instead of AND-ing against the default. Comment
    # lines are ignored so prose can't suppress a default.
    def base_filters(src, source)
      return [] if src.base_filters.empty?

      code = source.gsub(/#.*$/, "")
      src.base_filters.filter_map do |base|
        base.expr unless code.match?(/\b#{Regexp.escape(base.column)}\b/)
      end
    end

    # Only the exact shorthand shape is rewritten —
    # `join <alias>=<dimension> (==<key>)` — anything else passes through
    # for prqlc to accept or reject on its own.
    JOIN_SHORTHAND = /\A\s*join\s+(?:(\w+)\s*=\s*)?(\w+)\s*[\(\[]\s*==\s*(\w+)\s*[\)\]]\s*\z/
    # Unanchored variant for detecting "does this query use the idiom".
    JOIN_SHORTHAND_ANY = /join\s+(?:\w+\s*=\s*)?\w+\s*[\(\[]\s*==\s*\w+\s*[\)\]]/

    # One pass over each user line: dimension-shorthand rewriting plus
    # bare-column qualification. Injected lines (authz, base filters,
    # generated joins) are already explicit and bypass this.
    def rewrite_line(src, line, source, injected_bridges, bridge_qualifier)
      return [ line ] if src.nil?

      rewritten = rewrite_join(src, line, source, injected_bridges)
      return rewritten unless rewritten == [ line ]

      [ qualify_columns(src, line, bridge_qualifier) ]
    end

    # Rewrites a dimension shorthand into explicit joins, hiding the
    # bridge table: `join c=categories (==category_id)` becomes the
    # entries → transactions → categories two-hop join, with the bridge
    # exposed as the reserved alias `t` (so `filter t.transfer_id ==
    # null` resolves with no explicit bridge join). An explicit `join
    # t=transactions` is reused instead of injecting a duplicate.
    def rewrite_join(src, line, source, injected_bridges)
      match = line.match(JOIN_SHORTHAND)
      return [ line ] unless match

      dim = src.dimensions.find { |d| d.dimension == match[2] && d.key == match[3] }
      return [ line ] unless dim

      dim_alias = match[1] || dim.dimension
      if dim_alias == dim.bridge_alias
        raise Sureql::CompileError, "`#{dim.bridge_alias}` is reserved for the #{dim.bridge} bridge — alias your #{dim.dimension} join differently"
      end

      explicit = existing_bridge_alias(source, dim.bridge)
      if explicit && explicit != dim.bridge_alias
        raise Sureql::CompileError, "join the #{dim.bridge} bridge as `#{dim.bridge_alias}` (not `#{explicit}`) so dimension shorthands can share it"
      end

      out = []
      unless explicit || injected_bridges.include?(dim.bridge)
        out << "join #{dim.bridge_alias}=#{dim.bridge} (#{src.relation}.#{dim.from_key} == #{dim.bridge_alias}.#{dim.bridge_pk})"
        injected_bridges << dim.bridge
      end
      bridge_alias = explicit || dim.bridge_alias
      out << "join #{dim_alias}=#{dim.dimension} (#{bridge_alias}.#{dim.bridge_fk} == #{dim_alias}.#{dim.dim_pk})"
      out
    end

    def existing_bridge_alias(source, bridge)
      source[/^\s*join\s+(\w+)\s*=\s*#{Regexp.escape(bridge)}\b/, 1]
    end

    # Alias bare bridge attributes resolve to: the user's explicit bridge
    # alias when they joined it themselves, else the reserved `t` when a
    # dimension shorthand pulls the bridge in, else nil (leave bare —
    # prqlc will report the unknown name).
    def bridge_qualifier_for(source)
      bridges = Sureql::SOURCES.values.flat_map(&:dimensions).map(&:bridge).uniq
      bridges.each do |bridge|
        explicit = source[/^\s*join\s+(\w+)\s*=\s*#{Regexp.escape(bridge)}\b/, 1]
        return explicit if explicit
      end
      return "t" if source.match?(JOIN_SHORTHAND_ANY)

      nil
    end

    # String/s-string literals and comments: never rewritten.
    LITERALS = /s"(?:[^"\\]|\\.)*"|s'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|#.*$/

    # Qualifies bare columns so short queries survive joins, where
    # schemaless prqlc would otherwise report ambiguous names: source
    # columns → `entries.amount`, bridge columns → `t.transfer_id`.
    # Skips literals, comments, dotted paths (`t.x`, `date.now`), and
    # assignment targets (`alias = ...`).
    def qualify_columns(src, line, bridge_qualifier)
      source_names = src.select.map { |c| Regexp.escape(c) }.join("|")
      bridge_names = src.dimensions.flat_map(&:bridge_columns).uniq
        .reject { |c| src.select.include?(c) }
        .map { |c| Regexp.escape(c) }.join("|")
      return line if source_names.empty? && bridge_names.empty?

      alts = [ "(?<scol>#{source_names})" ]
      alts << "(?<bcol>#{bridge_names})" unless bridge_names.empty?
      pattern = /#{LITERALS}|(?<![.\w`])(?:#{alts.join("|")})(?![\w`.])(?!\s*=(?!=))/
      line.gsub(pattern) do
        match = $~
        if match[:scol]
          "#{src.relation}.#{match[:scol]}"
        elsif match[:bcol] && bridge_qualifier
          "#{bridge_qualifier}.#{match[:bcol]}"
        else
          $&
        end
      end
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
