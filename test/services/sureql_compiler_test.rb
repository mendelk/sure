require "test_helper"

class SureqlCompilerTest < ActiveSupport::TestCase
  test "expands from to real relation and injects authz filter" do
    compiler = Sureql::Compiler.new(users(:family_admin))

    sql = compiler.call("from transactions\nfilter amount < 0\ntake 5")

    assert_includes sql, "FROM"
    assert_includes sql, "entries"
    assert_includes sql, "WHERE"
    assert_includes sql, "account_id IN"
    accessible_ids = Account.accessible_by(users(:family_admin)).pluck(:id)
    accessible_ids.each { |id| assert_includes sql, id }
  end

  test "injects implicit transactions scope" do
    compiler = Sureql::Compiler.new(users(:family_admin))

    sql = compiler.call("from transactions\nfilter amount > 0\ntake 5")

    assert_includes sql, "entryable_type = 'Transaction'"
    assert_includes sql, "excluded = false"
  end

  test "explicit filter overrides the matching implicit default" do
    compiler = Sureql::Compiler.new(users(:family_admin))

    sql = compiler.call("from transactions\nfilter excluded == true\ntake 5")

    assert_includes sql, "excluded = true"
    assert_not_includes sql, "excluded = false"
    assert_includes sql, "entryable_type = 'Transaction'"
  end

  test "categories shorthand compiles to bridged joins with qualified columns" do
    source = <<~PRQL
      from transactions
      filter amount > 0
      derive cutoff = s"current_date - 30"
      filter date > cutoff
      join c=categories (==category_id)
      filter transfer_id == null
      group {c.name} (
        aggregate {
          total_spent = sum amount,
          n = count this,
        }
      )
      sort {-total_spent}
      take 5
    PRQL

    sql = Sureql::Compiler.new(users(:family_admin)).call(source)

    assert_includes sql, "INNER JOIN transactions AS t"
    assert_includes sql, "INNER JOIN categories AS c"
    assert_includes sql, "t.transfer_id IS NULL"
    assert_includes sql, "GROUP BY"
    assert_match(/total_spent DESC/, sql)
    assert_match(/LIMIT\s+5/, sql)
  end

  test "shorthand reuses an explicit t bridge join" do
    source = "from transactions\njoin t=transactions (entries.entryable_id == t.id)\njoin c=categories (==category_id)\ntake 5"

    sql = Sureql::Compiler.new(users(:family_admin)).call(source)

    assert_equal 1, sql.scan(/JOIN transactions AS t/).size
  end

  test "shorthand rejects a bridge joined under another alias" do
    source = "from transactions\njoin x=transactions (entries.entryable_id == x.id)\njoin c=categories (==category_id)\ntake 5"

    error = assert_raises(Sureql::CompileError) do
      Sureql::Compiler.new(users(:family_admin)).call(source)
    end
    assert_match(/join the transactions bridge as `t`/, error.message)
  end

  test "shorthand rejects t as the dimension alias" do
    source = "from transactions\njoin t=categories (==category_id)\ntake 5"

    error = assert_raises(Sureql::CompileError) do
      Sureql::Compiler.new(users(:family_admin)).call(source)
    end
    assert_match(/`t` is reserved/, error.message)
  end

  test "leaves string literals and dotted paths unqualified" do
    compiler = Sureql::Compiler.new(users(:family_admin))

    sql = compiler.call(%q(from transactions\nfilter name == "amount"\ntake 5))

    assert_includes sql, %q(name = 'amount')
  end

  test "accounts source authorizes on its own id" do
    compiler = Sureql::Compiler.new(users(:family_admin))

    sql = compiler.call("from accounts\ntake 2")

    assert_includes sql, "FROM"
    assert_includes sql, "accounts"
    assert_includes sql, "id IN"
  end

  test "rejects sources outside the registry" do
    compiler = Sureql::Compiler.new(users(:family_admin))

    error = assert_raises(Sureql::UnknownSourceError) do
      compiler.call("from secrets")
    end
    assert_match(/unknown sureql source `secrets`/, error.message)
    assert_match(/transactions/, error.message)
  end

  test "rejects pipelines without a from line" do
    compiler = Sureql::Compiler.new(users(:family_admin))

    error = assert_raises(Sureql::CompileError) do
      compiler.call("filter amount < 0")
    end
    assert_match(/requires at least one `from <source>`/, error.message)
  end

  test "wraps prql compile errors" do
    compiler = Sureql::Compiler.new(users(:family_admin))

    assert_raises(Sureql::CompileError) do
      compiler.call("from transactions\nthis is not prql !!")
    end
  end

  test "user with no accessible accounts matches nothing" do
    user = users(:family_admin)
    Account.stubs(:accessible_by).returns(Account.none)

    compiler = Sureql::Compiler.new(user)
    sql = compiler.call("from transactions\ntake 5")

    assert_includes sql, "WHERE"
    assert_includes sql.upcase, "NULL"
  end
end
